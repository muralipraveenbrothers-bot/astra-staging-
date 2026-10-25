/**
 * ASTRA AI — Conversational voice routes (Phase 2 §5 / §6 / §13 / §20)
 * ====================================================================
 * GET  /api/voice/capabilities  → per-provider language truth matrix
 * POST /api/voice/conversation  → SSE: Astra answer + streamed TTS audio
 *                                 (text→sentences→audio chunks, cancellable)
 *
 * The WebSocket gateway (/ws/avatar) is the interactive path; this SSE route
 * is the browser-fallback for environments where WS is unavailable.
 * Privacy: no transcripts/audio persisted; text only processed in-memory.
 */
import type { Express, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { astraOrchestrator, type AvatarMode } from "../orchestrator";
import { streamSpeech, normalizeLanguage } from "./ttsRouter";
import { resolveLanguage } from "./langDetector";
import { a2fStatus } from "../avatar/a2fClient";
import { renderAvatar } from "../avatar/avatarRouter";
import { collectLiveCapabilities } from "../capabilities/liveCapabilities";
import { authenticate } from "../rbac";
import type { UserSession } from "../types";
import { incCounter, recordLatency } from "../metrics/interactionMetrics";
import { recordSpan } from "../../src/astra/brain/part5/trace";
import { publishVoiceResponseEvent, publishVoiceTranscriptEvent, recordTranscriptPair, refineTranscript } from "../../src/astra/brain/part5/voicePipeline";
import { voiceIntent } from "../../src/astra/brain/part5/voice";

function who(req: Request): UserSession {
  return (req as unknown as { user: UserSession }).user;
}

export function registerVoiceConversationRoutes(app: Express): void {
  // Same-origin audio endpoint used by dashboard speech controls. It waits for
  // the local router's first completed neural clip and never falls back to an
  // operating-system or browser voice.
  app.get("/api/voicebox/audio-proxy", async (req: Request, res: Response) => {
    const text = typeof req.query.text === "string" ? req.query.text.trim() : "";
    if (!text) return void res.status(400).json({ error: "MISSING_TEXT" });
    const profile = typeof req.query.profile === "string" ? req.query.profile.trim() : undefined;
    const language = normalizeLanguage(resolveLanguage(
      typeof req.query.lang === "string" ? req.query.lang : undefined,
      text
    ));
    const abort = new AbortController();
    res.on("close", () => { if (!res.writableEnded) abort.abort(); });
    const chunks: Buffer[] = [];
    try {
      const result = await streamSpeech(text, language, {
        signal: abort.signal,
        profile,
        onAudio: ({ audio }) => { chunks.push(audio); },
      });
      if (!result.spoken || chunks.length === 0) {
        return void res.status(503).json({ error: "VOICEBOX_UNAVAILABLE", language });
      }
      res.type("audio/wav").send(Buffer.concat(chunks));
    } catch (error) {
      if (!res.headersSent) res.status(503).json({
        error: "VOICEBOX_UNAVAILABLE",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/api/voice/capabilities", async (_req: Request, res: Response) => {
    try {
      const caps = await collectLiveCapabilities();
      res.json({ voice: caps.voice, avatar: caps.avatar, websocket: caps.websocket });
    } catch (e) {
      res.status(500).json({ error: "VOICE_CAPABILITIES_FAILED", message: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/voice/conversation", authenticate, async (req: Request, res: Response) => {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) {
      res.status(400).json({ error: "MISSING_TEXT" });
      return;
    }
        const language = normalizeLanguage(resolveLanguage(typeof req.body?.language === "string" ? req.body.language : undefined, text));
    const mode = (["doctor", "receptionist", "patient_educator", "clinical_copilot", "emergency"].includes(String(req.body?.mode)) ? req.body.mode : "doctor") as AvatarMode;

    // ── Voice pipeline bookkeeping (raw kept, refined used) ─────────────────
    const actor = who(req);
    const patientId = typeof req.body?.patientId === "string" && req.body.patientId.trim() ? req.body.patientId.trim() : null;
    const suppliedCorrelation = typeof req.body?.correlationId === "string" ? req.body.correlationId.trim() : "";
    const correlationId = suppliedCorrelation || randomUUID();
    const rawTranscript = typeof req.body?.rawTranscript === "string" && req.body.rawTranscript.trim() ? req.body.rawTranscript : text;
    const refinedTranscript = refineTranscript(rawTranscript);
    const intent = voiceIntent(refinedTranscript);
    recordSpan({
      kind: "voice",
      name: "audio",
      latencyMs: 0,
      ok: true,
      detail: "Skipped at the server: the browser captured the audio and ran local Voicebox STT first.",
      correlationId,
    });
    recordSpan({
      kind: "voice",
      name: "local STT",
      latencyMs: 0,
      ok: true,
      detail: "Skipped here: /api/voice/transcribe owns the STT span and the raw transcript.",
      correlationId,
    });
    recordSpan({
      kind: "voice",
      name: "raw transcript",
      latencyMs: 0,
      ok: true,
      detail: `${rawTranscript.trim().length} char(s) kept verbatim, next to the refined copy.`,
      correlationId,
    });
    recordSpan({
      kind: "laya",
      name: "Laya voice intent",
      latencyMs: 0,
      ok: true,
      detail: `Laya read ${intent} from the refined transcript.`,
      correlationId,
    });
    const transcriptPair = recordTranscriptPair({
      correlationId,
      rawTranscript,
      refinedTranscript,
      intent,
      language,
      patientId,
    });
    await publishVoiceTranscriptEvent({
      correlationId,
      actorId: actor.userId,
      actorRole: actor.role,
      intent,
      language,
      rawTranscript,
      refinedTranscript,
      patientId,
    });

    // SSE response — cancellable by client disconnect (barge-in over HTTP).
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
        const abort = new AbortController();
    const t0 = Date.now();
    // Client-disconnect (barge-in over HTTP): listen on the RESPONSE stream.
    // `req` "close" fires as soon as the POST body is consumed — even though
    // the socket stays open for the SSE response — which would abort the
    // interaction immediately after the AI answer completes (observed as
    // interactionsStarted>0 with aiTotal recorded but zero `response` events).
    let clientGone = false;
    res.on("close", () => { if (!res.writableEnded) { clientGone = true; abort.abort(); } });
    const sse = (event: string, data: unknown) => {
      if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

        try {
      incCounter("interactionsStarted");
      sse("state", { value: "THINKING" });
      const modelStarted = Date.now();
      const result = await astraOrchestrator.handle({
        query: text,
        user: who(req),
        language,
        mode,
      });
      recordLatency("aiTotal", Date.now() - t0);
      recordSpan({
        kind: "model",
        name: "Astra orchestrator (voice)",
        latencyMs: Date.now() - modelStarted,
        ok: Boolean(String(result.text ?? "").trim()),
        model: result.provider,
        detail: `${result.provider ?? "unknown provider"} answered ${String(result.text ?? "").trim().length} char(s); tokens were not reported.`,
        correlationId,
      });
      if (abort.signal.aborted) return;

      const speakable = String(result.text || "").replace(/```[\s\S]*?```/g, " ").replace(/[*_`#>|]/g, " ").replace(/\s+/g, " ").trim();
      sse("response", {
        requestId: result.requestId,
        answer: result.text,
        speakableText: speakable,
        language,
        urgency: result.mode === "emergency" ? "emergency" : "routine",
        redFlags: result.clinical?.redFlags,
        uncertainty: result.clinical?.uncertainty,
                provider: result.provider,
        correlationId,
        intent,
        rawPreserved: true,
        transcriptsStored: transcriptPair.persistence === "stored",
      });

      if (!speakable) {
        recordSpan({
          kind: "voice",
          name: "local TTS",
          latencyMs: 0,
          ok: true,
          detail: "Skipped: the answer is not speakable, so nothing is spoken and the reply stays on screen.",
          correlationId,
        });
        await publishVoiceResponseEvent({
          correlationId, actorId: actor.userId, actorRole: actor.role, intent, language,
          responseText: String(result.text ?? ""), spoken: false, ttsProviderId: null, patientId,
        });
        sse("state", { value: "READY", detail: "text-only response" });
        res.end();
        return;
      }

      // Audio is optional and must NEVER block/crash the live response: the
      // text answer above is what the patient needs. Voicebox generates a
      // complete file (the status endpoint streams SSE and can outlive undici's
      // body timeout), so we bound audio generation with a hard deadline and
      // always finish the SSE stream with a completion event.
            sse("state", { value: "SPEAKING" });
      // Inactivity watchdog (§13/§27): healthy-but-slow streams keep resetting
      // the deadline on every audio chunk, so a long generation is never
      // mislabeled as text-only; a genuinely stuck stream (no audio for the
      // full window) is cut off, reported truthfully, and its GPU work aborted.
      const audioTimeoutMs = Number(process.env.ASTRA_TTS_TIMEOUT_MS ?? 60_000);
      const spoken = await new Promise<{ spoken: boolean; providerId: string | null; chunks: number }>((resolve) => {
        let settled = false;
        let chunks = 0;
        let providerId: string | null = null;
        let watchdog: ReturnType<typeof setTimeout> | undefined;
        const finish = (r: { spoken: boolean; providerId: string | null; chunks: number }) => {
          if (settled) return;
          settled = true;
          clearTimeout(watchdog);
          resolve(r);
        };
        const resetWatchdog = () => {
          clearTimeout(watchdog);
          watchdog = setTimeout(() => {
            abort.abort(); // stop stuck background TTS work
            finish({ spoken: chunks > 0, providerId, chunks });
          }, audioTimeoutMs);
        };
        resetWatchdog();
        streamSpeech(speakable, language, {
          signal: abort.signal,
          onProvider: (id) => { providerId = id; resetWatchdog(); },
          onAudio: async (chunk) => {
            chunks = chunk.seq + 1;
            sse("audio", { seq: chunk.seq, format: "audio/wav", data: chunk.audio.toString("base64"), providerId: chunk.providerId });
            if (chunk.seq === 0) {
              const b = await renderAvatar({ text: speakable, language, mode, speaker: mode === "receptionist" ? "Reception Desk" : "Doctor (White Coat)" });
              recordLatency("avatarFirstFrame", Date.now() - t0);
              sse("avatar", { providerId: b.providerId, status: b.status, frameCount: b.frameCount, ...(b.error ? { error: b.error } : {}), ...(b.detail ? { detail: b.detail } : {}) });
            }
            resetWatchdog();
          },
          onNotice: (n) => sse("notice", n),
        })
          .then((r) => finish(r))
          .catch(() => finish({ spoken: chunks > 0, providerId, chunks }));
      });

      // Watchdog timeouts still finish the stream gracefully (final event +
      // READY); only a real client disconnect (barge-in / navigation) ends here.
      if (clientGone) return;
      recordSpan({
        kind: "voice",
        name: "local TTS",
        latencyMs: Date.now() - t0,
        ok: spoken.spoken,
        detail: spoken.spoken
          ? `Local ${spoken.providerId ?? "voicebox"} streamed ${spoken.chunks} chunk(s).`
          : "Voicebox produced no audio; nothing was faked and the answer stayed on screen.",
        correlationId,
      });
      await publishVoiceResponseEvent({
        correlationId, actorId: actor.userId, actorRole: actor.role, intent, language,
        responseText: speakable, spoken: spoken.spoken, ttsProviderId: spoken.providerId, patientId,
      });
      sse("audio", { seq: spoken.chunks, format: "audio/wav", data: "", final: true });
      sse("state", { value: "READY", detail: spoken.spoken ? `spoken via ${spoken.providerId}` : "text-only" });
      recordLatency("total", Date.now() - t0);
      incCounter("interactionsCompleted");
      res.end();
    } catch (e) {
      incCounter("errors");
      recordSpan({
        kind: "error",
        name: "voice conversation",
        latencyMs: Date.now() - t0,
        ok: false,
        detail: e instanceof Error ? e.message.slice(0, 120) : "conversation failed",
        correlationId,
      });
      sse("error", { message: e instanceof Error ? e.message.slice(0, 160) : "conversation failed", correlationId });
      res.end();
    }
  });
}
