/**
 * ASTRA AI — Voice TTS Router (Phase 2 §6 / §7 / §13)
 * ===================================================
 * Language-aware TTS provider routing with honest capability gating:
 *   - a provider is only selected when REACHABLE and its language claim covers
 *     the requested language;
 *   - unconfigured/unreachable providers are skipped (never faked);
 *   - text-only is always the final fallback;
 *   - every synthesis is cancellable (AbortSignal) for barge-in (§12).
 *
 * Future providers (CosyVoice, GPT-SoVITS, cloud) plug into TTS_PROVIDERS.
 */
import { VOICEBOX_BASE } from "../avatar/types";
import { recordLatency, incCounter } from "../metrics/interactionMetrics";
import { linlyTts } from "../integrations/linly-talker/adapter";
import { humanizeAudio, isHumanizerAvailable } from "./voiceHumanizer";
import { humanizeConversation, pickHumanProfile, toBreathGroups, type VoiceboxProfileInfo } from "./speechHumanizer";
import { languageForSpeech } from "./langDetector";

const VOICE_HUMANIZE = process.env.ASTRA_VOICE_HUMANIZE !== "false";

export type TtsLanguage = string; // BCP-47-ish: "te-IN" | "hi-IN" | "en-IN" | ...

export interface TtsProviderDef {
  id: string;
  baseUrlEnv: string;
  defaultBaseUrl: string;
  enabledEnv: string;
  /** Languages the provider itself declares (honest provenance). */
  declaredLanguages: Record<string, boolean>;
  streaming: boolean;
  preferredEngine?: string;
}

const LANG_NORMALIZATION: Record<string, string> = {
  te: "te-IN", "te-IN": "te-IN",
  hi: "hi-IN", "hi-IN": "hi-IN",
  en: "en-IN", "en-IN": "en-IN", "en-US": "en-IN",
};

export function normalizeLanguage(lang?: string): string {
  if (!lang) return "en-IN";
  return LANG_NORMALIZATION[lang] ?? (lang.includes("-") ? lang : `${lang}-IN`);
}

export const TTS_PROVIDERS: TtsProviderDef[] = [
  {
    id: "indic",
    baseUrlEnv: "INDIC_TTS_URL",
    defaultBaseUrl: "",
    enabledEnv: "INDIC_TTS_ENABLED",
    declaredLanguages: { "te-IN": true },
    streaming: false,
  },
  {
    id: "voicebox",
    baseUrlEnv: "VOICEBOX_URL",
    defaultBaseUrl: "http://127.0.0.1:17493",
    enabledEnv: "",
    // The installed Kokoro registry declares English and Hindi, not Telugu.
    declaredLanguages: { "en-IN": true, "hi-IN": true },
    streaming: false,
    preferredEngine: "kokoro",
  },
    {
    id: "linly",
    baseUrlEnv: "LINLY_BASE_URL",
    defaultBaseUrl: "",
    enabledEnv: "LINLY_ENABLED",
    declaredLanguages: {}, // only filled from the service's own declaration when reachable
    streaming: false,
  },
];

/** Languages this adapter will REQUEST from a reachable Linly service
 *  (EdgeTTS Indian neural voices). Real availability per request is
 *  confirmed by a successful synthesis — never assumed. */
const LINLY_SUPPORTED_LANGS = new Set<string>([
  "en-IN",
  "hi-IN",
  "te-IN",
]);

function providerBaseUrl(p: TtsProviderDef): string {
  if (p.enabledEnv && process.env[p.enabledEnv] !== "true") return "";
  return (process.env[p.baseUrlEnv] || p.defaultBaseUrl).replace(/\/$/, "");
}

async function probeHealthy(baseUrl: string, timeoutMs: number): Promise<boolean> {
  try {
    const r = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return r.ok;
  } catch {
    return false;
  }
}

/** Select the best available TTS provider for a language. Truthful: reachable + language-covered. */
export async function selectTtsProvider(language: TtsLanguage, timeoutMs = 2000): Promise<{ id: string; baseUrl: string; streaming: boolean; engine?: string } | null> {
    const lang = normalizeLanguage(language);
  for (const p of TTS_PROVIDERS) {
    const baseUrl = providerBaseUrl(p);
    if (!baseUrl) continue;
    if (p.id === "linly") {
      // No upstream /health — Linly language support is declared from the
      // configured EdgeTTS voice set; per-request availability is confirmed
      // by a successful synthesis. Probe /docs (a reachable ADK/HTTP front).
      if (await probeHealthy(baseUrl, timeoutMs) && LINLY_SUPPORTED_LANGS.has(lang)) {
        return { id: p.id, baseUrl, streaming: p.streaming, engine: p.preferredEngine };
      }
      continue;
    }
    if (!p.declaredLanguages[lang]) continue;
    if (await probeHealthy(baseUrl, timeoutMs)) {
      return { id: p.id, baseUrl, streaming: p.streaming, engine: p.preferredEngine };
    }
  }
  return null;
}

/**
 * Synthesize ONE text chunk via Voicebox (generate → poll → fetch WAV bytes).
 * Mirrors the verified /api/voice/speak flow; cancellable via signal.
 */
export interface VoiceboxProfile {
  id: string;
  name: string;
  language?: string | null;
  description?: string | null;
}

let profileCache: { at: number; profiles: VoiceboxProfile[] } | null = null;

/**
 * Resolve a Voicebox voice profile for the requested language (§6/§7):
 * language-matched profile first; otherwise the first available profile with
 * an honest `matched:false` so callers can disclose the mismatch. Cached 60s.
 */
export async function resolveVoiceProfile(baseUrl: string, language: string, signal?: AbortSignal): Promise<{ name: string; matched: boolean } | null> {
  if (!profileCache || Date.now() - profileCache.at > 60_000) {
    try {
      const r = await fetch(`${baseUrl}/profiles`, { signal: signal ?? AbortSignal.timeout(3000) });
      if (!r.ok) return null;
      const profiles = (await r.json()) as VoiceboxProfile[];
      if (!Array.isArray(profiles)) return null;
      profileCache = { at: Date.now(), profiles };
    } catch {
      return null;
    }
  }
  const profiles = profileCache.profiles;
  if (profiles.length === 0) return null;
  // Human-first selection: never hand a clinician turn to the JARVIS/robot persona
  // when a human voice profile is installed.
  const pick = pickHumanProfile(
    profiles as VoiceboxProfileInfo[],
    normalizeLanguage(language),
    process.env.ASTRA_TTS_PROFILE ?? null,
  );
  if (pick) return { name: pick.name, matched: pick.matched };
  return { name: profiles[0].name, matched: false };
}

export async function synthesizeViaVoicebox(text: string, opts: { baseUrl: string; signal?: AbortSignal; profile?: string | null; engine?: string | null; timeoutMs?: number; language?: string }): Promise<{ audio: Buffer; providerId: string; profileUsed: string | null; profileMatched: boolean }> {
  const { baseUrl, signal } = opts;
  const timeoutMs = opts.timeoutMs ?? Number(process.env.ASTRA_TTS_TIMEOUT_MS ?? 60_000);
  // Resolve a profile when the caller did not pin one — /speak returns 400
  // without a profile ("No voice profile resolved").
  let profileUsed: string | null = opts.profile ?? null;
  const language = normalizeLanguage(opts.language).split("-")[0];
  if (!profileUsed) {
    // Operator pin wins; otherwise prefer a HUMAN profile per language.
    // JARVIS is only the last resort (it is an AI persona, not a doctor's voice).
    profileUsed = process.env.ASTRA_TTS_PROFILE || null;
    if (!profileUsed) {
      if (language === "hi" && process.env.ASTRA_TTS_HI_PROFILE) {
        profileUsed = process.env.ASTRA_TTS_HI_PROFILE;
      } else if (language === "en" && process.env.ASTRA_TTS_EN_PROFILE) {
        profileUsed = process.env.ASTRA_TTS_EN_PROFILE;
      }
    }
  }
  let profileMatched = true;
  if (!profileUsed) {
    const resolved = await resolveVoiceProfile(baseUrl, opts.language ?? "en-IN", signal);
    if (resolved) {
      profileUsed = resolved.name;
      profileMatched = resolved.matched;
    }
  }
  const genRes = await fetch(`${baseUrl}/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, profile: profileUsed, engine: opts.engine ?? null, language }),
    signal,
  });
  if (!genRes.ok) throw new Error(`voicebox speak failed (${genRes.status})`);
  const gen = (await genRes.json()) as { id?: string; status?: string };
  const genId = gen.id;
  if (!genId) throw new Error("voicebox returned no generation id");

  const parseSse = (txt: string) => {
    for (const line of txt.split("\n")) {
      const t = line.trim();
      if (t.startsWith("data:")) {
        try { return JSON.parse(t.slice(5).trim()) as { status?: string }; } catch { /* ignore */ }
      }
    }
    return null;
  };

  // Poll for completion (max timeoutMs). The status endpoint streams SSE
  // ("data: {...}\n\n"), so we parse the first JSON payload out of it — the same
  // pattern the proven /api/voice/speak route uses.
  const t0 = Date.now();
  let status = gen.status || "generating";
    // "loading_model" is a transient upstream status (first synthesis triggers a
  // lazy model load) — keep waiting within the caller's timeout instead of
  // failing the chunk immediately.
  while ((status === "generating" || status === "loading_model") && Date.now() - t0 < timeoutMs) {
    if (signal?.aborted) throw new Error("cancelled");
    await new Promise((r) => setTimeout(r, 220));
    const s = await fetch(`${baseUrl}/generate/${genId}/status`, { signal });
    if (!s.ok) break;
    const sj = parseSse(await s.text());
    if (sj?.status) status = sj.status;
  }
  if (status !== "completed") throw new Error(`voicebox generation not completed (${status})`);

  const audioRes = await fetch(`${baseUrl}/audio/${genId}`, { signal });
  if (!audioRes.ok) throw new Error(`voicebox audio fetch failed (${audioRes.status})`);
  const audio = Buffer.from(await audioRes.arrayBuffer());
  return { audio, providerId: "voicebox", profileUsed, profileMatched };
}

function splitSentences(text: string): string[] {
  // Sentence-ish chunking that keeps Telugu/Hindi danda + Latin boundaries.
  const parts = text.split(/(?<=[.!?।॥])\s+/).map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts : [text.trim()].filter(Boolean);
}

/** Map Astra BCP-47 → Linly EdgeTTS `lang` form field. */
function linlyLangFor(language: string): string {
  switch (language) {
    case "te-IN": return "te";
    case "hi-IN": return "hi";
    case "en-IN":
    default: return "en";
  }
}
/** Pick an EdgeTTS neural voice per language for the Indic languages Linly serves. */
function linlyVoiceFor(language: string): string {
  switch (language) {
    case "te-IN": return "te-IN-MohanNeural";
    case "hi-IN": return "hi-IN-MadhurNeural";
    case "en-IN":
    default: return "en-IN-PrabhatNeural";
  }
}

export interface StreamSpeechEvents {
  onAudio: (chunk: { seq: number; audio: Buffer; providerId: string }) => void | Promise<void>;
  onProvider?: (providerId: string) => void;
  onNotice?: (notice: { type: "tts_unavailable" | "chunk_failed" | "profile_language_mismatch"; detail: string }) => void;
}

async function synthesizeViaIndic(text: string, baseUrl: string, language: string, signal: AbortSignal): Promise<Buffer> {
  const r = await fetch(`${baseUrl}/synthesize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language: normalizeLanguage(language), voice: process.env.ASTRA_TTS_TE_VOICE || "astra-te" }),
    signal,
  });
  if (!r.ok) throw new Error(`indic tts failed (${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}

/**
 * Stream speech: sentence chunks → sequential synthesis → onAudio callbacks.
 * Ordering is preserved (seq increments); cancellation stops future chunks.
 */
export async function streamSpeech(text: string, language: TtsLanguage, opts: { signal: AbortSignal; timeoutMs?: number; profile?: string } & StreamSpeechEvents): Promise<{ spoken: boolean; providerId: string | null; chunks: number }> {
  const t0 = Date.now();
  const overall = normalizeLanguage(language);
  const sentences = splitSentences(text);
  const providerCache = new Map<string, Awaited<ReturnType<typeof selectTtsProvider>>>();
  const providerFor = async (lang: string) => {
    const key = normalizeLanguage(lang);
    if (!providerCache.has(key)) providerCache.set(key, await selectTtsProvider(key));
    return providerCache.get(key) ?? null;
  };

  let seq = 0;
  let firstAudio = true;
  let lastProviderId: string | null = null;
  let sawUnavailable = false;

  // Breath-group bookkeeping: insert REAL silence between groups so delivery has
  // breath and turn-taking rhythm instead of running on like a machine.
  const spokenPlan = toBreathGroups(humanizeConversation(text));
  const pauseAfter = new Map(spokenPlan.map((g, i) => [g.text, i < spokenPlan.length - 1 ? g.pauseAfterMs : 0]));

  for (const rawSentence of sentences) {
    if (opts.signal.aborted) break;
    // Speak the HUMAN wording (abbreviations/numbers/lists naturalized) — never raw chart text.
    const sentence = humanizeConversation(rawSentence);
    if (!sentence) continue;
    const sentenceLang = languageForSpeech(sentence, overall);
    const provider = await providerFor(sentenceLang);
    if (!provider) {
      sawUnavailable = true;
      opts.onNotice?.({ type: "tts_unavailable", detail: `no reachable TTS provider for ${sentenceLang} — skipped` });
      continue;
    }
    if (lastProviderId !== provider.id) {
      lastProviderId = provider.id;
      opts.onProvider?.(provider.id);
    }
    try {
      if (provider.id === "voicebox") {
        const vb = await synthesizeViaVoicebox(sentence, { baseUrl: provider.baseUrl, signal: opts.signal, timeoutMs: opts.timeoutMs, language: sentenceLang, engine: provider.engine, profile: opts.profile });
        if (firstAudio) { recordLatency("ttsFirstAudio", Date.now() - t0); firstAudio = false; }
        if (vb.profileUsed && !vb.profileMatched) {
          opts.onNotice?.({ type: "profile_language_mismatch", detail: `voicebox profile "${vb.profileUsed}" does not declare ${sentenceLang} — audio may not match the requested language` });
        }
        let audio = VOICE_HUMANIZE ? await humanizeAudio(vb.audio, { strength: process.env.ASTRA_VOICE_HUMANIZE_PRESET as never }) : vb.audio;
        // REAL silence after this breath group (skipped for the final group: a turn ends, not trails off).
        const pauseMs = pauseAfter.get(sentence) ?? pauseAfter.get(humanizeConversation(rawSentence)) ?? 0;
        if (pauseMs > 0) {
          const { appendPauseToWav } = await import("./speechHumanizer");
          audio = appendPauseToWav(audio, pauseMs);
        }
        await opts.onAudio({ seq: seq++, audio, providerId: provider.id });
      } else if (provider.id === "indic") {
        const audio = await synthesizeViaIndic(sentence, provider.baseUrl, sentenceLang, opts.signal);
        if (firstAudio) { recordLatency("ttsFirstAudio", Date.now() - t0); firstAudio = false; }
        await opts.onAudio({ seq: seq++, audio, providerId: provider.id });
      } else if (provider.id === "linly") {
        const res = await linlyTts({
          text: sentence,
          lang: linlyLangFor(sentenceLang),
          voice: linlyVoiceFor(sentenceLang),
          method: "EdgeTTS",
          timeoutMs: opts.timeoutMs,
        });
        if (firstAudio) { recordLatency("ttsFirstAudio", Date.now() - t0); firstAudio = false; }
        if (res.ok && res.audio) {
          await opts.onAudio({ seq: seq++, audio: res.audio, providerId: provider.id });
        } else {
          opts.onNotice?.({ type: "chunk_failed", detail: res.error ?? "linly tts failed" });
          incCounter("errors");
        }
      } else {
        break;
      }
    } catch (e) {
      if (opts.signal.aborted) break;
      opts.onNotice?.({ type: "chunk_failed", detail: e instanceof Error ? e.message.slice(0, 120) : "tts chunk failed" });
      incCounter("errors");
    }
  }
  if (seq === 0) {
    opts.onNotice?.({ type: "tts_unavailable", detail: `no reachable TTS provider for ${overall} — text-only fallback` });
    incCounter("providerFallbacks");
  } else if (sawUnavailable) {
    incCounter("providerFallbacks");
  }
  return { spoken: seq > 0, providerId: lastProviderId, chunks: seq };
}


