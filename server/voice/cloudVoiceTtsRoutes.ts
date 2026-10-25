/**
 * ASTRA 7D — DR. MAYIN CLOUD VOICE TIERS (server side)
 * ============================================================================
 * Server half of `src/features/mayin/voice/CloudVoiceProviders.ts`. The browser
 * never holds a cloud API key — it POSTs here and this module decides what is
 * actually reachable.
 *
 *   GET  /api/voice/sarvam/health       → { ok, provider, configured, detail }
 *   POST /api/voice/sarvam/tts          → { ok, provider, audioBase64, mimeType }
 *   GET  /api/voice/openai-live/health  → { ok, provider, configured, detail }
 *   POST /api/voice/openai-live/tts     → { ok, provider, audioBase64, mimeType }
 *
 * TRUTH CONTRACT (mirrors /api/voice/gemini-tts and §66):
 *   • No key  → 503 { reason: "<Tier> NOT configured …", retryable: false }.
 *     The client maps this straight to NOT_CONFIGURED and fails over to the
 *     next tier (Voicebox last). Silence is NEVER returned as success.
 *   • Upstream failure → 503 carrying the REAL upstream status + body excerpt,
 *     with `retryable` true only for 429/5xx.
 *   • Empty audio → 503; we never ship a zero-byte clip as "spoken".
 *   • Cloud Privacy Gate → 403 when the text carries identifiable patient data
 *     and the caller has not set phiApproved. Uses the SAME `looksLikePhi`
 *     heuristic as the browser gate, so the two can never drift apart.
 *
 * Registered right beside registerVoiceProviderRoutes (order matters: the
 * blanket `app.use("/api/voice", authenticate)` is registered later in
 * server/index.ts, exactly as for /api/voice/gemini-tts).
 */
import type { Express, Request, Response } from "express";
import { looksLikePhi, phiGateReason } from "../../src/astra/voice/providers/phiGate";

/** Sarvam Bulbul REST (verified against docs.sarvam.ai 2026-09). */
const SARVAM_TTS_URL = process.env.SARVAM_TTS_URL || "https://api.sarvam.ai/text-to-speech";
const SARVAM_MODEL = process.env.ASTRA_SARVAM_TTS_MODEL || "bulbul:v2";
const SARVAM_SPEAKER = process.env.ASTRA_SARVAM_SPEAKER || "anushka";
/** OpenAI speech synthesis (binary response). */
const OPENAI_SPEECH_URL = process.env.ASTRA_OPENAI_SPEECH_URL || "https://api.openai.com/v1/audio/speech";
const OPENAI_TTS_MODEL = process.env.ASTRA_OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const OPENAI_TTS_VOICE = process.env.ASTRA_OPENAI_TTS_VOICE || "alloy";

const TTS_TIMEOUT_MS = 30_000;
/** bulbul:v3 accepts 2500 chars, bulbul:v2 1500. Refuse instead of truncating. */
const SARVAM_MAX_CHARS = SARVAM_MODEL.includes("v3") ? 2500 : 1500;
/** OpenAI speech input ceiling (generous; Dr. Mayin turns are short). */
const OPENAI_MAX_CHARS = 4096;

/** The 11 BCP-47 codes Sarvam supports. Anything else falls back to en-IN. */
const SARVAM_LANGUAGES = new Set([
  "bn-IN", "en-IN", "gu-IN", "hi-IN", "kn-IN", "ml-IN",
  "mr-IN", "od-IN", "pa-IN", "ta-IN", "te-IN",
]);

export type CloudTierId = "sarvam" | "openai-live";

/** Failure carrying the retryability the client's failover policy needs. */
export class CloudTtsError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(message);
    this.name = "CloudTtsError";
  }
}

function sarvamKey(): string {
  return process.env.SARVAM_API_KEY || process.env.SARVAM_AI_API_KEY || "";
}

function openaiKey(): string {
  return process.env.OPENAI_API_KEY || process.env.ASTRA_OPENAI_API_KEY || "";
}

/** Which tiers are configured on THIS server, for the status HUD + tests. */
export function cloudTierConfig(): Record<CloudTierId, boolean> {
  return { sarvam: Boolean(sarvamKey()), "openai-live": Boolean(openaiKey()) };
}

/** Clamp a client language code onto Sarvam's supported set. */
export function sarvamLanguage(code: string): string {
  const value = (code || "").trim();
  return SARVAM_LANGUAGES.has(value) ? value : "en-IN";
}

interface GatedTurn {
  text: string;
  language: string;
}

/**
 * Shared pre-flight for both tiers: text present, length legal, and the Cloud
 * Privacy Gate open. Writes the error response itself and returns null when the
 * turn must not proceed — so no caller can forget to enforce the gate.
 */
function gateTurn(req: Request, res: Response, provider: CloudTierId, maxChars: number): GatedTurn | null {
  const text = String(req.body?.text ?? "").trim();
  if (!text) {
    res.status(400).json({ ok: false, provider, reason: "MISSING_TEXT", retryable: false });
    return null;
  }
  if (text.length > maxChars) {
    res.status(400).json({
      ok: false,
      provider,
      reason: `TEXT_TOO_LONG: ${text.length} characters exceeds the ${maxChars}-character limit for this voice`,
      retryable: false,
    });
    return null;
  }
  const language = String(req.body?.language ?? "en-IN");
  const containsPhi = req.body?.containsPhi === true || looksLikePhi(text);
  if (containsPhi && req.body?.phiApproved !== true) {
    res.status(403).json({
      ok: false,
      provider,
      reason:
        `CLOUD_PRIVACY_GATE_BLOCKED: ${phiGateReason(text) ?? "identifiable clinical data"}` +
        " — speak this locally or approve the disclosure explicitly",
      retryable: false,
    });
    return null;
  }
  return { text, language };
}

interface SynthResult {
  audioBase64: string;
  mimeType: string;
}

/** Sarvam Bulbul. Returns base64 audio ONLY when the provider really produced it. */
export async function synthesizeSarvam(text: string, language: string): Promise<SynthResult> {
  const key = sarvamKey();
  if (!key) {
    throw new CloudTtsError(
      "Sarvam NOT configured — SARVAM_API_KEY is not set; cloud voice is unavailable",
      false,
    );
  }
  const lang = sarvamLanguage(language);
  const send = (body: unknown) =>
    fetch(SARVAM_TTS_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "api-subscription-key": key },
      signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
      body: JSON.stringify(body),
    });

  let upstream = await send({ text, language_code: lang, model: SARVAM_MODEL, speaker: SARVAM_SPEAKER });
  if (upstream.status === 400 || upstream.status === 422) {
    // API revision drift: the pre-2026 REST shape used inputs[]/target_language_code.
    // Retry ONCE with the legacy shape rather than reporting a false failure.
    const firstDetail = await upstream.text().catch(() => "");
    upstream = await send({
      inputs: [text],
      target_language_code: lang,
      model: SARVAM_MODEL,
      speaker: SARVAM_SPEAKER,
    });
    if (!upstream.ok) {
      const retryDetail = await upstream.text().catch(() => "");
      throw new CloudTtsError(
        `Sarvam rejected the request (HTTP ${upstream.status}): ${(retryDetail || firstDetail).slice(0, 240)}`,
        upstream.status >= 500 || upstream.status === 429,
      );
    }
  }
  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    throw new CloudTtsError(
      `Sarvam HTTP ${upstream.status}: ${detail.slice(0, 240)}`,
      upstream.status >= 500 || upstream.status === 429,
    );
  }

  const payload = (await upstream.json().catch(() => null)) as {
    audios?: string[];
    audio?: string;
    audioBase64?: string;
    mimeType?: string;
  } | null;
  const audio = payload?.audios?.[0] ?? payload?.audio ?? payload?.audioBase64;
  if (!audio) {
    throw new CloudTtsError("Sarvam returned no audio payload", true);
  }
  return { audioBase64: audio, mimeType: payload?.mimeType ?? "audio/wav" };
}

/** OpenAI speech synthesis. Binary audio in, base64 out. */
export async function synthesizeOpenAI(text: string, language: string): Promise<SynthResult> {
  const key = openaiKey();
  if (!key) {
    throw new CloudTtsError(
      "OpenAI Live NOT configured — OPENAI_API_KEY is not set; cloud voice is unavailable",
      false,
    );
  }
  const upstream = await fetch(OPENAI_SPEECH_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
    body: JSON.stringify({
      model: OPENAI_TTS_MODEL,
      voice: OPENAI_TTS_VOICE,
      input: text,
      response_format: "mp3",
      // Steer the Indic languages Astra must speak; English needs no instruction.
      ...(language && !language.startsWith("en") ? { instructions: `Speak in ${language}.` } : {}),
    }),
  });
  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    throw new CloudTtsError(
      /api key|incorrect api key/i.test(detail)
        ? "OpenAI rejected the key on this PC. It is not a working OpenAI speech key."
        : `OpenAI speech was refused (${upstream.status}).`,
      upstream.status >= 500 || upstream.status === 429,
    );
  }
  const bytes = Buffer.from(await upstream.arrayBuffer());
  if (!bytes.length) {
    throw new CloudTtsError("OpenAI returned empty audio", true);
  }
  const contentType = upstream.headers.get("content-type") ?? "audio/mpeg";
  return { audioBase64: bytes.toString("base64"), mimeType: contentType.split(";")[0] || "audio/mpeg" };
}

/** One honest 503 for every failure path — the client fails over from here. */
function failTier(res: Response, provider: CloudTierId, e: unknown): void {
  const known = e instanceof CloudTtsError;
  res.status(503).json({
    ok: false,
    provider,
    reason: e instanceof Error ? e.message : String(e),
    retryable: known ? e.retryable : true,
  });
}

/**
 * Registers the two Dr. Mayin cloud mouths. Every route answers 200 (READY) or
 * a structured 4xx/5xx — never a success envelope with empty audio.
 */
export function registerCloudVoiceTtsRoutes(app: Express): void {
  // ---- Sarvam Bulbul (Indian languages) -----------------------------------
  app.get("/api/voice/sarvam/health", (_req: Request, res: Response) => {
    const configured = Boolean(sarvamKey());
    res.json({
      ok: true,
      provider: "sarvam",
      configured,
      detail: configured
        ? "server route answered"
        : "server route reports NOT configured (missing API key)",
      model: SARVAM_MODEL,
      speaker: SARVAM_SPEAKER,
      ts: Date.now(),
    });
  });

  app.post("/api/voice/sarvam/tts", async (req: Request, res: Response) => {
    const turn = gateTurn(req, res, "sarvam", SARVAM_MAX_CHARS);
    if (!turn) return;
    try {
      const { audioBase64, mimeType } = await synthesizeSarvam(turn.text, turn.language);
      res.json({ ok: true, provider: "sarvam", model: SARVAM_MODEL, mimeType, audioBase64 });
    } catch (e) {
      failTier(res, "sarvam", e);
    }
  });

  // ---- OpenAI Live (cloud speaker) ---------------------------------------
  app.get("/api/voice/openai-live/health", (_req: Request, res: Response) => {
    const configured = Boolean(openaiKey());
    res.json({
      ok: true,
      provider: "openai-live",
      configured,
      detail: configured
        ? "server route answered"
        : "server route reports NOT configured (missing API key)",
      model: OPENAI_TTS_MODEL,
      voice: OPENAI_TTS_VOICE,
      ts: Date.now(),
    });
  });

  app.post("/api/voice/openai-live/tts", async (req: Request, res: Response) => {
    const turn = gateTurn(req, res, "openai-live", OPENAI_MAX_CHARS);
    if (!turn) return;
    try {
      const { audioBase64, mimeType } = await synthesizeOpenAI(turn.text, turn.language);
      res.json({ ok: true, provider: "openai-live", model: OPENAI_TTS_MODEL, mimeType, audioBase64 });
    } catch (e) {
      failTier(res, "openai-live", e);
    }
  });
}
