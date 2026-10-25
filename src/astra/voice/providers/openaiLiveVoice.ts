/**
 * OpenAI speech, third mouth. The key stays on the server
 * (POST /api/voice/openai-live/tts). No new vendor.
 */
import { looksLikePhi } from "./phiGate";
import { currentVoiceSettings } from "./voiceSettings";

export interface OpenAIVoiceResult {
  ok: boolean;
  blob?: Blob;
  error?: string;
  retryable: boolean;
  latencyMs: number;
  blockedByPrivacyGate?: boolean;
  notConfigured?: boolean;
}

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function openaiLiveSpeak(
  text: string,
  language: string,
  opts: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<OpenAIVoiceResult> {
  const t0 = Date.now();
  const body = text.trim();
  if (!body) return { ok: false, error: "Nothing to speak", retryable: false, latencyMs: 0 };
  const settings = currentVoiceSettings();
  if (looksLikePhi(body) && settings.blockPhiToCloudVoice) {
    return {
      ok: false,
      error: "Cloud Privacy Gate: identifiable clinical data was not sent to OpenAI",
      retryable: false,
      blockedByPrivacyGate: true,
      latencyMs: Date.now() - t0,
    };
  }
  const timeoutMs = opts.timeoutMs ?? 12000;
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onOuterAbort, { once: true });
  try {
    const res = await fetch("/api/voice/openai-live/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: body, language, containsPhi: false, phiApproved: false }),
      signal: controller.signal,
    });
    const payload = (await res.json().catch(() => null)) as
      | { ok?: boolean; reason?: string; retryable?: boolean; audioBase64?: string; mimeType?: string }
      | null;
    if (!res.ok || !payload?.audioBase64) {
      const reason = payload?.reason ?? "OpenAI did not return audio";
      const notConfigured = /not configured|missing api key|OPENAI_API_KEY/i.test(reason) || res.status === 404;
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
      blob: base64ToBlob(payload.audioBase64, payload.mimeType ?? "audio/mpeg"),
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
