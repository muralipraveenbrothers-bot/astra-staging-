/**
 * ASTRA 7D — VOICEBOX VOICE PROVIDER (primary)
 * ============================================================================
 * Implements the provider-independent MayinVoiceProvider contract on top of
 * Astra's existing Saarathi TTS/STT priority chains:
 *
 *   TTS: local Voicebox only (English, Hindi, Telugu).
 *        Sarvam and Gemini are separate tiers above this one.
 *   STT: Voicebox Whisper local -> browser fallback (labelled honestly)
 *
 * FreeLLMAPI / OmniRoute / Ollama are LLM routers and are never used here.
 * A future ElevenLabsProvider implements the same contract without touching
 * Dr. Mayin core.
 */

import { probeVoicebox, getVoiceboxStatus, voiceboxSpeak } from "@/astra/voice/providers/voiceboxLocal";
import {
  playSaarathiClip,
  stopSaarathiSpeech,
  FINAL_VOICE_UNAVAILABLE_MESSAGE,
} from "@/astra/voice/providers/ttsPriority";
import { startSaarathiListening } from "@/astra/voice/providers/sttPriority";
import type {
  MayinVoiceProvider,
  SpeakOptions,
  SpeechStateEvent,
  TranscriptEvent,
  VoiceStatus,
} from "./voiceProvider";

const RECONNECT_INTERVAL_MS = 15_000;
const MAX_RECONNECT_ATTEMPTS = 20;

export class VoiceboxProvider implements MayinVoiceProvider {
  private transcriptHandlers = new Set<(event: TranscriptEvent) => void>();
  private speechHandlers = new Set<(event: SpeechStateEvent) => void>();

  private active = false;
  private listeningLoop: Promise<void> | null = null;
  private stopCurrentCapture: (() => void) | null = null;
  private currentAbort: AbortController | null = null;
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;

  private microphonePermission: VoiceStatus["microphonePermission"] = "unknown";
  private lastTranscript: string | null = null;
  private lastTranscriptAt: number | null = null;
  private lastVoiceOutput: number | null = null;
  private lastAudioInput: number | null = null;
  private reconnectAttempts = 0;
  private language = "en-IN";
  private conversationState = "idle";
  private actualAudioProvider: string | undefined;

  /** Begin the continuous local listening loop (reconnect is scoped to voice). */
  public async start(): Promise<void> {
    if (this.active) return;
    this.active = true;
    void this.probeOnce();
    this.reconnectTimer = setInterval(() => void this.probeOnce(), RECONNECT_INTERVAL_MS);
    this.listeningLoop = this.runListenLoop();
  }

  public async stop(): Promise<void> {
    this.active = false;
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopCurrentCapture?.();
    this.stopCurrentCapture = null;
    await this.interrupt();
    await this.listeningLoop?.catch(() => undefined);
    this.listeningLoop = null;
  }

  public async speak(text: string, options?: SpeakOptions): Promise<void> {
    const body = text.trim();
    if (!body) throw new Error("Nothing to speak");

    const abort = new AbortController();
    this.currentAbort = abort;
    this.conversationState = "speaking";
    if (options?.language) this.language = options.language;
    this.actualAudioProvider = "voicebox-local";
    this.emitSpeech({ state: "started", provider: "voicebox", audioProvider: "voicebox-local", ts: Date.now() });

    let aborted = false;
    abort.signal.addEventListener("abort", () => { aborted = true; }, { once: true });
    // Yield once so a barge-in issued in the same turn wins before any network call.
    await Promise.resolve();
    if (aborted) {
      if (this.currentAbort === abort) this.currentAbort = null;
      this.conversationState = "idle";
      this.emitSpeech({
        state: "interrupted",
        provider: "voicebox",
        audioProvider: "voicebox-local",
        ts: Date.now(),
      });
      return;
    }

    const clip = await voiceboxSpeak(body, options?.language ?? this.language, {
      profile: options?.profile,
      signal: abort.signal,
      timeoutMs: options?.timeoutMs,
    });

    if (this.currentAbort === abort) this.currentAbort = null;
    this.conversationState = "idle";

    if (aborted || abort.signal.aborted) {
      this.emitSpeech({
        state: "interrupted",
        provider: "voicebox",
        audioProvider: "voicebox-local",
        ts: Date.now(),
      });
      return;
    }

    if (!clip.ok || !clip.blob) {
      this.emitSpeech({
        state: "failed",
        provider: "voicebox",
        audioProvider: "voicebox-local",
        ts: Date.now(),
      });
      throw new Error(FINAL_VOICE_UNAVAILABLE_MESSAGE);
    }

    this.lastVoiceOutput = Date.now();
    const played = await playSaarathiClip(clip.blob, abort.signal);
    if (aborted || abort.signal.aborted) {
      this.emitSpeech({
        state: "interrupted",
        provider: "voicebox",
        audioProvider: "voicebox-local",
        ts: Date.now(),
      });
      return;
    }
    if (!played.ok) {
      this.emitSpeech({
        state: "failed",
        provider: "voicebox",
        audioProvider: "voicebox-local",
        ts: Date.now(),
      });
      throw new Error(played.error ?? FINAL_VOICE_UNAVAILABLE_MESSAGE);
    }

    this.emitSpeech({
      state: "ended",
      provider: "voicebox",
      audioProvider: "voicebox-local",
      ts: Date.now(),
    });
  }

  /** Barge-in: stop output audio immediately. Reconnect is scoped to voice only. */
  public async interrupt(): Promise<void> {
    this.currentAbort?.abort();
    this.currentAbort = null;
    stopSaarathiSpeech();
  }

  public getStatus(): VoiceStatus {
    const vb = getVoiceboxStatus();
    const connected = vb.state === "READY" || vb.state === "ACTIVE";
    return {
      provider: "voicebox",
      microphonePermission: this.microphonePermission,
      microphoneActive: this.active,
      voiceProviderConnected: connected,
      lastAudioInput: this.lastAudioInput,
      lastTranscript: this.lastTranscript,
      lastVoiceOutput: this.lastVoiceOutput,
      roundTripLatency:
        this.lastVoiceOutput && this.lastTranscriptAt
          ? Math.max(0, this.lastVoiceOutput - this.lastTranscriptAt)
          : null,
      reconnectAttempts: this.reconnectAttempts,
      language: this.language,
      conversationState: this.conversationState,
    };
  }

  public onTranscript(handler: (event: TranscriptEvent) => void): () => void {
    this.transcriptHandlers.add(handler);
    return () => this.transcriptHandlers.delete(handler);
  }

  public onSpeechState(handler: (event: SpeechStateEvent) => void): () => void {
    this.speechHandlers.add(handler);
    return () => this.speechHandlers.delete(handler);
  }

  /** Host mirrors the controller's conversation state for diagnostics (§12). */
  public setConversationState(state: string): void {
    this.conversationState = state;
  }

  // ------------------------------------------------------------------ private

  private async probeOnce(): Promise<void> {
    if (!this.active) return;
    try {
      const status = await probeVoicebox();
      if (status.state === "READY" || status.state === "ACTIVE") this.reconnectAttempts = 0;
      else this.reconnectAttempts = Math.min(this.reconnectAttempts + 1, MAX_RECONNECT_ATTEMPTS);
    } catch {
      this.reconnectAttempts = Math.min(this.reconnectAttempts + 1, MAX_RECONNECT_ATTEMPTS);
    }
    if (typeof navigator !== "undefined" && navigator.permissions) {
      try {
        const mic = await navigator.permissions.query({ name: "microphone" as PermissionName });
        this.microphonePermission = mic.state;
      } catch {
        this.microphonePermission = "unknown";
      }
    }
  }

  private async runListenLoop(): Promise<void> {
    while (this.active) {
      const handle = startSaarathiListening({
        preferredLanguage: "auto",
        silenceStopMs: 1400,
        onError: () => { /* surfaced through the structured result below */ },
      });
      this.stopCurrentCapture = handle.stop;
      let result;
      try {
        result = await handle.promise;
      } catch {
        result = null;
      }
      this.stopCurrentCapture = null;
      if (!this.active) break;

      if (result && result.ok && result.text && result.text.trim()) {
        this.lastTranscript = result.text;
        this.lastTranscriptAt = Date.now();
        this.lastAudioInput = this.lastTranscriptAt;
        if (result.languageHint) this.language = result.languageHint;
        this.emitTranscript({
          text: result.text,
          isFinal: true,
          language: result.languageHint,
          provider: "voicebox",
          ts: this.lastTranscriptAt,
        });
      } else if (result && !result.ok && result.error && /No speech recognition/i.test(result.error)) {
        // Neither local Whisper nor a browser recogniser exists — stop honestly.
        break;
      }
      // Breathing gap between single-utterance captures (real STT cycle).
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }

  private emitTranscript(event: TranscriptEvent): void {
    for (const handler of this.transcriptHandlers) {
      try { handler(event); } catch (err) { console.warn("transcript handler error:", err); }
    }
  }

  private emitSpeech(event: SpeechStateEvent): void {
    for (const handler of this.speechHandlers) {
      try { handler(event); } catch (err) { console.warn("speech handler error:", err); }
    }
  }
}

let singleton: VoiceboxProvider | null = null;
export function getVoiceboxProvider(): VoiceboxProvider {
  if (!singleton) singleton = new VoiceboxProvider();
  return singleton;
}
