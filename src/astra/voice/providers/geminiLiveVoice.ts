/**
 * ASTRA SAARATHI — Gemini Live voice: the SECONDARY speaker.
 * =========================================================
 * Position in the failover order: voicebox-local → **gemini-live** → browser.
 *
 * PRIVACY: this is a CLOUD provider. When the Cloud Privacy Gate is armed
 * (Settings → Voice → "Block identifiable clinical data from cloud voice") and
 * the text carries PHI, the attempt is refused BEFORE any network call and the
 * chain moves on. Nothing clinical leaves the machine silently.
 *
 * The API key never reaches the browser: synthesis happens in the Astra server
 * route `/api/voice/gemini-tts`, which is also where the native-audio model name
 * and voice are configured.
 */

import { currentVoiceSettings } from "./voiceSettings";
import { looksLikePhi } from "./phiGate";

export interface GeminiVoiceResult {
  ok: boolean;
  blob?: Blob;
  error?: string;
  retryable: boolean;
  latencyMs: number;
  /** true when the Cloud Privacy Gate refused the attempt (no network happened). */
  blockedByPrivacyGate?: boolean;
}

/** Wrap raw PCM (L16) in a WAV container so the browser can play it. */
function pcmToWav(pcm: Uint8Array, sampleRate: number, channels = 1, bitsPerSample = 16): Blob {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeStr = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  view.setUint32(40, pcm.length, true);
  return new Blob([header, pcm], { type: "audio/wav" });
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function sampleRateFromMime(mime: string): number {
  const match = /rate=(\d+)/i.exec(mime);
  return match ? Number(match[1]) : 24_000;
}

/**
 * Speak through Gemini native audio. Returns a structured failure on every
 * non-success path — never a substituted voice and never a fake success.
 */
export async function geminiLiveSpeak(
  text: string,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<GeminiVoiceResult> {
  const t0 = Date.now();
  const settings = currentVoiceSettings();
  const body = text.trim();
  if (!body) return { ok: false, error: "Nothing to speak", retryable: false, latencyMs: 0 };

  if (!settings.allowGeminiLiveVoice) {
    return {
      ok: false,
      error: "Gemini Live voice is disabled in Settings → Voice",
      retryable: false,
      latencyMs: Date.now() - t0,
    };
  }

  const containsPhi = looksLikePhi(body);
  if (containsPhi && settings.blockPhiToCloudVoice) {
    return {
      ok: false,
      error: "Cloud Privacy Gate: identifiable clinical data was not sent to the cloud voice provider",
      retryable: false,
      blockedByPrivacyGate: true,
      latencyMs: Date.now() - t0,
    };
  }

  const timeoutMs = opts.timeoutMs ?? 30_000;
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onOuterAbort, { once: true });

  try {
    const res = await fetch("/api/voice/gemini-tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: body, containsPhi, phiApproved: false }),
      signal: controller.signal,
    });
    const payload = (await res.json().catch(() => null)) as
      | { ok?: boolean; reason?: string; retryable?: boolean; audioBase64?: string; mimeType?: string }
      | null;

    if (!res.ok || !payload?.ok || !payload.audioBase64) {
      return {
        ok: false,
        error: payload?.reason ?? `Gemini native audio HTTP ${res.status}`,
        retryable: payload?.retryable ?? res.status >= 500,
        latencyMs: Date.now() - t0,
      };
    }

    const mime = payload.mimeType ?? "audio/L16;rate=24000";
    const bytes = base64ToBytes(payload.audioBase64);
    const blob = mime.toLowerCase().includes("wav")
      ? new Blob([bytes], { type: "audio/wav" })
      : pcmToWav(bytes, sampleRateFromMime(mime));
    return { ok: true, blob, retryable: false, latencyMs: Date.now() - t0 };
  } catch (e) {
    const aborted = (e as { name?: string })?.name === "AbortError";
    return {
      ok: false,
      error: aborted
        ? "Gemini voice request aborted"
        : `Gemini voice unreachable: ${e instanceof Error ? e.message : String(e)}`,
      retryable: true,
      latencyMs: Date.now() - t0,
    };
  } finally {
    clearTimeout(timerId);
    opts.signal?.removeEventListener("abort", onOuterAbort);
  }
}