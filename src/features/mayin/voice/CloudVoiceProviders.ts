/**
 * ASTRA 7D — SHARED SERVER-TTS CLOUD VOICE BASE (Sarvam + OpenAI Live)
 * ============================================================================
 * Both Dr. Mayin cloud mouths follow the SAME truth-first contract:
 *
 *   • The provider API key lives SERVER-side (/api/voice/<id>/*). No frontend
 *     secrets, ever — the browser only talks to same-origin Astra routes.
 *   • Until those server routes exist (no credentials are configured today),
 *     health probes report NOT configured and speak() THROWS a structured
 *     error so MayinVoiceProviderManager fails over honestly. Nothing is
 *     relabelled, nothing is faked, no audio is invented.
 *   • These tiers are MOUTHS only. Ears (STT) remain the local
 *     Voicebox-Whisper → browser chain — STT priority is unchanged.
 *   • Barge-in: interrupt() aborts synthesis/playback immediately; an
 *     interrupted speak() resolves (it is not a failure).
 *
 * Full-duplex realtime sessions (GPT-realtime WebSocket) are future work;
 * this slice is the text→audio contract Dr. Mayin's conversation needs.
 */

import { peekVoiceClip, rememberVoiceClip } from "@/astra/voice/providers/voiceClipCache";
import type {
  MayinVoiceProvider,
  SpeakOptions,
  SpeechStateEvent,
  TranscriptEvent,
  VoiceStatus,
  VoiceProviderId,
} from "./voiceProvider";

export interface CloudProviderDeps {
  /** Injectable for node tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /**
   * Injectable playback so node tests never need an HTMLAudioElement.
   * Default uses the browser Audio element (guarded — structured failure if
   * playback is unavailable in this environment).
   */
  playClip?: (blob: Blob, signal?: AbortSignal) => Promise<void>;
}

export interface CloudTtsResult {
  ok: boolean;
  blob?: Blob;
  error?: string;
  retryable: boolean;
  latencyMs: number;
}

interface TtsPayload {
  audioBase64?: string;
  mimeType?: string;
  reason?: string;
  configured?: boolean;
}

/** Default browser playback. Throws structured errors — never a fake success. */
export async function browserPlayClip(blob: Blob, signal?: AbortSignal): Promise<void> {
  if (typeof Audio === "undefined" || typeof URL === "undefined" || !URL.createObjectURL) {
    throw new Error("audio playback is unavailable in this environment");
  }
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  // One named handler so the finally block can actually REMOVE it (an inline
  // arrow removed nothing and leaked the listener on every clip).
  let settle: (() => void) | null = null;
  const onAbort = () => {
    try { audio.pause(); } catch { /* already stopped */ }
    settle?.();
  };
  try {
    await new Promise<void>((resolve, reject) => {
      settle = resolve;
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("audio element failed to play the clip"));
      // Barge-in must UNBLOCK the caller immediately — pause + resolve.
      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener("abort", onAbort, { once: true });
      audio.play().catch(reject);
    });
  } finally {
    settle = null;
    signal?.removeEventListener("abort", onAbort);
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  }
}


/** Configurable server-TTS provider implementing the full MayinVoiceProvider contract. */
export class CloudServerTtsProvider implements MayinVoiceProvider {
  private readonly speechHandlers = new Set<(event: SpeechStateEvent) => void>();

  private active = false;
  private connected = false;
  private lastDetail = "not probed yet";
  private lastVoiceOutput: number | null = null;
  private conversationState = "idle";
  private currentAbort: AbortController | null = null;
  private playClip: (blob: Blob, signal?: AbortSignal) => Promise<void>;

  constructor(
    public readonly id: VoiceProviderId,
    public readonly label: string,
    private readonly ttsUrl: string,
    private readonly healthUrl: string,
    private readonly deps: CloudProviderDeps = {},
  ) {
    this.playClip = deps.playClip ?? browserPlayClip;
  }

  /** Honest probe: a REAL HTTP answer from the server route, or NOT configured. */
  public async probe(): Promise<boolean> {
    const fetchImpl = this.deps.fetchImpl ?? fetch;
    try {
      const res = await fetchImpl(this.healthUrl, { method: "GET" });
      if (res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { configured?: boolean };
        this.connected = payload.configured !== false;
        this.lastDetail = this.connected
          ? "server route answered"
          : "server route reports NOT configured (missing API key)";
      } else {
        this.connected = false;
        this.lastDetail =
          res.status === 404
            ? "server route does not exist yet (NOT configured)"
            : `health HTTP ${res.status}`;
      }
    } catch (e) {
      this.connected = false;
      this.lastDetail = `unreachable: ${e instanceof Error ? e.message : String(e)}`;
    }
    return this.connected;
  }

  public async start(): Promise<void> {
    this.active = true;
    await this.probe();
  }

  public async stop(): Promise<void> {
    this.active = false;
    await this.interrupt();
  }

  /**
   * Synthesize through the server route. THROWS on any failure so the
   * provider manager can fail over — a tier that cannot speak never
   * resolves silently.
   */
  public async speak(text: string, options?: SpeakOptions): Promise<void> {
    const body = text.trim();
    if (!body) throw new Error(`${this.label}: nothing to speak`);
    const language = options?.language ?? "en-IN";

    const t0 = Date.now();
    const abort = new AbortController();
    this.currentAbort = abort;
    this.conversationState = "speaking";
    this.emitSpeech({ state: "started", provider: this.id, ts: t0 });

    try {
      const cached = peekVoiceClip(this.id, body, language);
      if (cached) {
        await this.playClip(cached.blob, abort.signal);
        if (abort.signal.aborted) {
          this.emitSpeech({ state: "interrupted", provider: this.id, ts: Date.now() });
          return;
        }
        this.lastVoiceOutput = Date.now();
        this.emitSpeech({ state: "ended", provider: this.id, ts: Date.now() });
        return;
      }

      const fetchImpl = this.deps.fetchImpl ?? fetch;
      const res = await fetchImpl(this.ttsUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: body, language }),
        signal: abort.signal,
      });
      const payload = (await res.json().catch(() => null)) as TtsPayload | null;

      if (!res.ok || !payload?.audioBase64) {
        const detail =
          payload?.reason ??
          (res.status === 404
            ? `${this.label} server route does not exist yet (NOT configured)`
            : `${this.label} HTTP ${res.status}`);
        const err = new Error(detail);
        (err as Error & { retryable?: boolean }).retryable =
          res.status >= 500 && res.status !== 404;
        throw err;
      }

      const blob = base64ToBlob(payload.audioBase64, payload.mimeType ?? "audio/mpeg");
      rememberVoiceClip(this.id, body, language, blob);
      try {
        await this.playClip(blob, abort.signal);
      } catch (e) {
        if (abort.signal.aborted) {
          this.emitSpeech({ state: "interrupted", provider: this.id, ts: Date.now() });
          return; // barge-in is not a failure
        }
        throw e;
      }

      // Playback that ends BECAUSE of barge-in is an interruption, never "ended".
      if (abort.signal.aborted) {
        this.emitSpeech({ state: "interrupted", provider: this.id, ts: Date.now() });
        return;
      }

      this.lastVoiceOutput = Date.now();
      this.emitSpeech({ state: "ended", provider: this.id, ts: this.lastVoiceOutput });
    } catch (e) {
      if (abort.signal.aborted) {
        this.emitSpeech({ state: "interrupted", provider: this.id, ts: Date.now() });
        return;
      }
      this.connected = false;
      this.lastDetail = e instanceof Error ? e.message : String(e);
      this.emitSpeech({ state: "failed", provider: this.id, ts: Date.now() });
      throw e instanceof Error ? e : new Error(String(e));
    } finally {
      this.conversationState = "idle";
      if (this.currentAbort === abort) this.currentAbort = null;
    }
  }

  /** Barge-in: stop synthesis/playback immediately. */
  public async interrupt(): Promise<void> {
    this.currentAbort?.abort();
    this.currentAbort = null;
  }

  public getStatus(): VoiceStatus {
    return {
      provider: this.id,
      // This tier has no microphone of its own — the ear stays with Whisper/browser.
      microphonePermission: "unknown",
      microphoneActive: false,
      voiceProviderConnected: this.connected,
      lastAudioInput: null,
      lastTranscript: null,
      lastVoiceOutput: this.lastVoiceOutput,
      roundTripLatency: null,
      reconnectAttempts: 0,
      language: "en-IN",
      conversationState: this.conversationState,
    };
  }

  /** Mouth-only tier: transcripts come from the STT chain, never from here. */
  public onTranscript(_handler: (event: TranscriptEvent) => void): () => void {
    return () => undefined;
  }

  public onSpeechState(handler: (event: SpeechStateEvent) => void): () => void {
    this.speechHandlers.add(handler);
    return () => { this.speechHandlers.delete(handler); };
  }

  /** Honest detail string for the status HUD ("why is this tier skipped?"). */
  public getDetail(): string {
    return this.lastDetail;
  }

  public isActive(): boolean {
    return this.active;
  }

  private emitSpeech(event: SpeechStateEvent): void {
    for (const handler of this.speechHandlers) {
      try { handler(event); } catch (err) { console.warn("speech handler error:", err); }
    }
  }
}

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Sarvam (Bulbul v3) — Indian-language cloud TTS through the Astra server. */
export class SarvamProvider extends CloudServerTtsProvider {
  constructor(deps: CloudProviderDeps = {}) {
    super("sarvam", "Sarvam Bulbul (cloud)", "/api/voice/sarvam/tts", "/api/voice/sarvam/health", deps);
  }
}

/** OpenAI Live — GPT voice through the Astra server (key stays server-side). */
export class OpenAILiveProvider extends CloudServerTtsProvider {
  constructor(deps: CloudProviderDeps = {}) {
    super(
      "openai-live",
      "OpenAI Live (cloud)",
      "/api/voice/openai-live/tts",
      "/api/voice/openai-live/health",
      deps,
    );
  }
}

/**
 * Gemini Live — Google Gemini voice through the Astra server.
 *
 * PRIORITY: second human mouth, after Sarvam:
 *   Sarvam → Gemini → Voicebox (English, Hindi, Telugu)
 *
 * Key stays server-side at /api/voice/gemini-tts — never exposed to the
 * browser. When the route returns NOT configured or is unreachable, this tier
 * self-reports disconnected and MayinVoiceProviderManager skips it cleanly.
 */
export class GeminiLiveProvider extends CloudServerTtsProvider {
  constructor(deps: CloudProviderDeps = {}) {
    super(
      "gemini-live",
      "Gemini (cloud)",
      "/api/voice/gemini-tts",
      "/api/voice/gemini-tts/health",
      deps,
    );
  }
}

