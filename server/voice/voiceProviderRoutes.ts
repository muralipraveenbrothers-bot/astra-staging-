/**
 * ASTRA SAARATHI — Voice provider routes (repair prompt §B / §C / §D / §K)
 * =======================================================================
 * THREE routes, all truth-first:
 *
 *   GET  /api/voice/providers/status → per-provider health from REAL probes
 *   POST /api/voice/transcribe       → Voicebox Whisper proxy (PRIMARY STT)
 *   POST /api/voice/gemini-tts       → Gemini native-audio TTS (SECONDARY TTS)
 *
 * WHY
 * ---
 * The browser cannot reach 127.0.0.1:17493 in a production build (no Vite proxy)
 * and must never be told that a voice was produced when it was not. Routing
 * through the Astra server means one place decides what is reachable, the cloud
 * API key never enters the browser, and a failure returns a structured 503 the
 * client can fail over from.
 *
 * NOTHING here fabricates audio. If a provider cannot speak, the client is told
 * exactly that and Saarathi stays text-only.
 *
 * HISTORY: this file was once corrupted by an interleaved edit (function bodies
 * swapped) that passed `typecheck:server` only because the file was missing from
 * tsconfig.server.json's include list, while tsx refused to boot the server.
 * It is now IN the include list — a corrupted server file can never again show
 * a green typecheck while the server is dead.
 */
import type { Express, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { collectLiveCapabilities } from "../capabilities/liveCapabilities";
import { VOICEBOX_BASE } from "../avatar/types";
import { recordSpan } from "../../src/astra/brain/part5/trace";
import { refineTranscript, recordTranscriptPair } from "../../src/astra/brain/part5/voicePipeline";
import { voiceIntent } from "../../src/astra/brain/part5/voice";
import { confidenceFromWhisperPayload } from "../../src/astra/voice/safety/voiceSafety";

/** Same correlation id the brain route and the Flight Recorder follow. */
function correlationIdOf(req: Request): string {
  const header = req.headers["x-correlation-id"];
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === "string" && value.trim() ? value.trim() : randomUUID();
}

const VOICEBOX_HEALTH_TIMEOUT_MS = 2500;
const VOICEBOX_TRANSCRIBE_TIMEOUT_MS = 30_000;
/** Refuse absurd uploads outright instead of buffering them in memory. */
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

/** Gemini native-audio TTS. Configurable, never hard-coded to one preview name. */
export const GEMINI_TTS_MODEL = process.env.ASTRA_GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";
const GEMINI_TTS_VOICE = process.env.ASTRA_GEMINI_TTS_VOICE || "Kore";
const GEMINI_API_BASE = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta";

interface ProviderRow {
  id: string;
  label: string;
  role: string;
  state: "OFF" | "READY" | "ACTIVE" | "DEGRADED" | "DISABLED" | "NOT_CONFIGURED" | "ERROR";
  detail: string;
  latencyMs?: number;
}

async function probeVoicebox(): Promise<ProviderRow> {
  const base = (process.env.VOICEBOX_URL || VOICEBOX_BASE).replace(/\/$/, "");
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(VOICEBOX_HEALTH_TIMEOUT_MS) });
    const latencyMs = Date.now() - t0;
    if (!res.ok) {
      return {
        id: "voicebox",
        label: "Voicebox (local)",
        role: "PRIMARY",
        state: "ERROR",
        detail: `HTTP ${res.status} from ${base}/health`,
        latencyMs,
      };
    }
    return {
      id: "voicebox",
      label: "Voicebox (local)",
      role: "PRIMARY",
      state: "READY",
      detail: `local runtime healthy (${base})`,
      latencyMs,
    };
  } catch (e) {
    return {
      id: "voicebox",
      label: "Voicebox (local)",
      role: "PRIMARY",
      state: "OFF",
      detail: `unreachable at ${base}: ${e instanceof Error ? e.message.slice(0, 120) : "connection refused"}`,
      latencyMs: Date.now() - t0,
    };
  }
}

/** Gemini status comes from the SAME provider registry the brain uses. */
function geminiRow(
  ai: Array<{ id: string; ready: boolean; configured: boolean; latencyMs: number | null; lastError?: string }>
): ProviderRow {
  const gemini = ai.find((p) => p.id === "gemini");
  if (!gemini) {
    return {
      id: "gemini",
      label: "Gemini Live (cloud)",
      role: "SECONDARY",
      state: "NOT_CONFIGURED",
      detail: "provider not registered",
    };
  }
  if (!gemini.configured) {
    return {
      id: "gemini",
      label: "Gemini Live (cloud)",
      role: "SECONDARY",
      state: "NOT_CONFIGURED",
      detail: "GEMINI_API_KEY is not configured — cloud voice stays standby",
    };
  }
  return {
    id: "gemini",
    label: "Gemini Live (cloud)",
    role: "SECONDARY",
    state: gemini.ready ? "READY" : "DEGRADED",
    detail: gemini.ready
      ? `native-audio model ${GEMINI_TTS_MODEL} available (PHI blocked by the Cloud Privacy Gate unless approved)`
      : gemini.lastError ?? "provider configured but not answering",
    latencyMs: gemini.latencyMs ?? undefined,
  };
}

export function registerVoiceProviderRoutes(app: Express): void {
  // ---- 1. honest provider status (drives the Saarathi status HUD) ----------
  app.get("/api/voice/providers/status", async (_req: Request, res: Response) => {
    try {
      const caps = await collectLiveCapabilities();
      const ai = caps.ai.map((p) => ({
        id: p.id,
        ready: p.ready,
        configured: p.configured,
        latencyMs: p.latencyMs,
        lastError: p.lastError,
      }));

      const voiceboxFromCaps = caps.voice.providers.find((p) => p.id === "voicebox");
      // Prefer the dedicated probe: it distinguishes an HTTP error from a timeout.
      const voicebox = await probeVoicebox();
      if (voicebox.state === "READY" && voiceboxFromCaps && !voiceboxFromCaps.ready) {
        voicebox.state = "DEGRADED";
        voicebox.detail += " — runtime answered but did not report a loaded model";
      }

      const sarvamConfigured = Boolean(process.env.SARVAM_API_KEY);
      res.json({
        checkedAt: Date.now(),
        tts: {
          order: ["sarvam", "gemini-live", "voicebox-local"],
          providers: [
            {
              id: "sarvam",
              label: "Sarvam Bulbul (cloud)",
              role: "PRIMARY",
              state: sarvamConfigured ? "READY" : "NOT_CONFIGURED",
              detail: sarvamConfigured
                ? "human voice for English, Hindi, and Telugu"
                : "SARVAM_API_KEY is not set — Sarvam stays standby",
            },
            geminiRow(ai),
            {
              ...voicebox,
              role: "LOCAL",
              label: "Voicebox (local, English / Hindi / Telugu)",
            },
          ],
        },
        stt: {
          order: ["voicebox-whisper", "browser-fallback"],
          providers: [
            {
              id: "voicebox-whisper",
              label: "Voicebox Whisper (local)",
              role: "PRIMARY",
              state: voicebox.state === "READY" ? "READY" : voicebox.state === "OFF" ? "OFF" : "DEGRADED",
              detail: voicebox.state === "READY"
                ? "local Whisper transcription available"
                : `local transcription unavailable — ${voicebox.detail}`,
            },
          ],
        },
        brain: ai.map((p) => ({
          id: p.id,
          state: p.ready ? "READY" : p.configured ? "DEGRADED" : "NOT_CONFIGURED",
          detail: p.lastError,
          latencyMs: p.latencyMs,
        })),
        geminiTtsModel: GEMINI_TTS_MODEL,
      });
    } catch (e) {
      res.status(500).json({
        error: "VOICE_PROVIDER_STATUS_FAILED",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  });

  // ---- 2. PRIMARY STT: Voicebox Whisper proxy -----------------------------
  // Forwards the raw upload unchanged so the local runtime sees exactly what the
  // browser recorded. No transcription of our own and no cloud fallback here.
  app.post("/api/voice/transcribe", async (req: Request, res: Response) => {
    const contentType = String(req.headers["content-type"] ?? "");
    if (!contentType.includes("multipart/form-data")) {
      res.status(415).json({ error: "UNSUPPORTED_MEDIA_TYPE", message: "multipart/form-data is required" });
      return;
    }
    const chunks: Buffer[] = [];
    let total = 0;
    let aborted = false;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_AUDIO_BYTES) {
        aborted = true;
        if (!res.headersSent) {
          res.status(413).json({ error: "AUDIO_TOO_LARGE", message: `Audio exceeds ${MAX_AUDIO_BYTES} bytes` });
        }
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", () => {
      if (!res.headersSent) res.status(400).json({ error: "UPLOAD_FAILED" });
    });
    req.on("end", async () => {
      if (aborted || res.headersSent) return;
      const body = Buffer.concat(chunks);
      if (body.length === 0) {
        res.status(400).json({ error: "MISSING_AUDIO" });
        return;
      }
      const correlationId = correlationIdOf(req);
      const sttStarted = Date.now();
      const base = (process.env.VOICEBOX_URL || VOICEBOX_BASE).replace(/\/$/, "");
      try {
        const upstream = await fetch(`${base}/transcribe`, {
          method: "POST",
          headers: { "content-type": contentType },
          body,
          signal: AbortSignal.timeout(VOICEBOX_TRANSCRIBE_TIMEOUT_MS),
        });
        if (!upstream.ok) {
          // Structured failure the client can fail over from — never fake text.
          recordSpan({
            kind: "voice",
            name: "local STT",
            latencyMs: Date.now() - sttStarted,
            ok: false,
            detail: `Voicebox Whisper answered ${upstream.status}; no transcript was produced.`,
            correlationId,
          });
          res.status(503).json({ error: "VOICEBOX_STT_UNAVAILABLE", status: upstream.status });
          return;
        }
        const data = (await upstream.json()) as {
          text?: string;
          language?: string;
          confidence?: number;
          segments?: Array<{ avg_logprob?: number; no_speech_prob?: number }>;
        };
        const confidence = confidenceFromWhisperPayload(data);
        // Raw text is returned untouched; the refined copy is labelled as such.
        const rawTranscript = data.text ?? "";
        const refinedTranscript = refineTranscript(rawTranscript);
        const intent = voiceIntent(refinedTranscript);
        recordSpan({
          kind: "voice",
          name: "local STT",
          latencyMs: Date.now() - sttStarted,
          ok: true,
          detail: `Voicebox Whisper returned ${rawTranscript.trim().length} char(s); raw text preserved.`,
          correlationId,
        });
        const pair = recordTranscriptPair({
          correlationId,
          rawTranscript,
          refinedTranscript,
          intent,
          language: data.language ?? "auto",
        });
        res.json({
          text: rawTranscript,
          rawTranscript,
          refinedTranscript,
          intent,
          correlationId,
          language: data.language,
          provider: "voicebox-whisper",
          transcriptsStored: pair.persistence === "stored",
          ...(confidence !== undefined ? { confidence } : {}),
        });
      } catch (e) {
        recordSpan({
          kind: "voice",
          name: "local STT",
          latencyMs: Date.now() - sttStarted,
          ok: false,
          detail: e instanceof Error ? e.message.slice(0, 120) : "Voicebox Whisper could not be reached.",
          correlationId,
        });
        res.status(503).json({
          error: "VOICEBOX_STT_UNAVAILABLE",
          message: e instanceof Error ? e.message : String(e),
        });
      }
    });
  });

  // ---- 3. Gemini native audio (second human mouth, after Sarvam) ----------
  app.get("/api/voice/gemini-tts/health", (_req: Request, res: Response) => {
    const configured = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
    res.json({
      ok: true,
      provider: "gemini-live",
      configured,
      detail: configured
        ? "server route answered"
        : "server route reports NOT configured (missing API key)",
    });
  });

  app.post("/api/voice/gemini-tts", async (req: Request, res: Response) => {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
    if (!apiKey) {
      res.status(503).json({
        ok: false,
        provider: "gemini-live",
        reason: "GEMINI_API_KEY is not configured — cloud voice is not available",
        retryable: false,
      });
      return;
    }
    const text = String(req.body?.text ?? "").trim();
    if (!text) {
      res.status(400).json({ ok: false, provider: "gemini-live", reason: "MISSING_TEXT", retryable: false });
      return;
    }
    // Cloud Privacy Gate: identifiable clinical data needs explicit approval.
    const containsPhi = req.body?.containsPhi === true;
    if (containsPhi && req.body?.phiApproved !== true) {
      res.status(403).json({
        ok: false,
        provider: "gemini-live",
        reason:
          "CLOUD_PRIVACY_GATE_BLOCKED: identifiable clinical data may not be sent to a cloud voice provider without explicit approval",
        retryable: false,
      });
      return;
    }

    const model = String(req.body?.model ?? GEMINI_TTS_MODEL);
    const voiceName = String(req.body?.voice ?? GEMINI_TTS_VOICE);
    try {
      const upstream = await fetch(`${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
        signal: AbortSignal.timeout(30_000),
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
          },
        }),
      });
      if (!upstream.ok) {
        const detail = await upstream.text().catch(() => "");
        res.status(503).json({
          ok: false,
          provider: "gemini-live",
          reason: `Gemini native audio HTTP ${upstream.status}: ${detail.slice(0, 240)}`,
          retryable: upstream.status >= 500 || upstream.status === 429,
        });
        return;
      }
      const payload = (await upstream.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
        }>;
      };
      const part = payload.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      const data = part?.inlineData?.data;
      if (!data) {
        res.status(503).json({
          ok: false,
          provider: "gemini-live",
          reason: "Gemini returned no audio part",
          retryable: true,
        });
        return;
      }
      res.json({
        ok: true,
        provider: "gemini-live",
        model,
        mimeType: part?.inlineData?.mimeType ?? "audio/L16;rate=24000",
        audioBase64: data,
      });
    } catch (e) {
      res.status(503).json({
        ok: false,
        provider: "gemini-live",
        reason: `Gemini native audio failed: ${e instanceof Error ? e.message : String(e)}`,
        retryable: true,
      });
    }
  });
}
