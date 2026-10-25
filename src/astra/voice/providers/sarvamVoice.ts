/**
 * ASTRA SAARATHI — Sarvam Bulbul, the primary human mouth.
 * The API key stays on the server (`POST /api/voice/sarvam/tts`).
 * English, Hindi, and Telugu are the languages this hospital speaks.
 */

import { currentVoiceSettings } from "./voiceSettings";
import { looksLikePhi } from "./phiGate";

export interface SarvamVoiceResult {
  ok: boolean;
  blob?: Blob;
  error?: string;
  retryable: boolean;
  latencyMs: number;
  blockedByPrivacyGate?: boolean;
  /** True when the server has no SARVAM_API_KEY — do not keep retrying this session. */
  notConfigured?: boolean;
}

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Speak through Sarvam. A failure is structured so the router can move to Gemini or Voicebox. */
export async function sarvamSpeak(
  text: string,
  language: string,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<SarvamVoiceResult> {
  const t0 = Date.now();
  const body = text.trim();
  if (!body) return { ok: false, error: "Nothing to speak", retryable: false, latencyMs: 0 };

  const settings = currentVoiceSettings();
  if (looksLikePhi(body) && settings.blockPhiToCloudVoice) {
    return {
      ok: false,
      error: "Cloud Privacy Gate: identifiable clinical data was not sent to Sarvam",
      retryable: false,
      blockedByPrivacyGate: true,
      latencyMs: Date.now() - t0,
    };
  }

  const timeoutMs = opts.timeoutMs ?? 12_000;
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onOuterAbort, { once: true });

  try {
    const res = await fetch("/api/voice/sarvam/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: body, language, containsPhi: false, phiApproved: false }),
      signal: controller.signal,
    });
    const payload = (await res.json().catch(() => null)) as
      | { ok?: boolean; reason?: string; retryable?: boolean; audioBase64?: string; mimeType?: string }
      | null;

    if (!res.ok || !payload?.audioBase64) {
      const reason = payload?.reason ?? `Sarvam HTTP ${res.status}`;
      const notConfigured = /not configured|missing api key|SARVAM_API_KEY/i.test(reason) || res.status === 404;
      return {
        ok: false,
        error: reason,
        retryable: notConfigured ? false : (payload?.retryable ?? res.status >= 500),
        notConfigured,
        latencyMs: Date.now() - t0,
      };
    }

    return {
      ok: true,
      blob: base64ToBlob(payload.audioBase64, payload.mimeType ?? "audio/wav"),
      retryable: false,
      latencyMs: Date.now() - t0,
    };
  } catch (e) {
    const aborted = controller.signal.aborted && opts.signal?.aborted;
    return {
      ok: false,
      error: aborted ? "interrupted" : (e instanceof Error ? e.message : String(e)),
      retryable: !aborted,
      latencyMs: Date.now() - t0,
    };
  } finally {
    clearTimeout(timerId);
    opts.signal?.removeEventListener("abort", onOuterAbort);
  }
}
