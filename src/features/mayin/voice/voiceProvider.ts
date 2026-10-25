/**
 * ASTRA 7D — DR. MAYIN VOICE PROVIDER CONTRACT
 * ============================================================================
 * Provider-independent interface (spec §11). VoiceboxProvider is the first
 * (primary) implementation; a future ElevenLabsProvider can plug in without
 * touching Dr. Mayin core. FreeLLMAPI / OmniRoute / Ollama are LLM routing
 * paths and must NEVER be used as TTS endpoints.
 */

export interface SpeakOptions {
  /** BCP-47-ish tag, e.g. "en-IN", "te-IN", "hi-IN". */
  language?: string;
  /** Voicebox persona/profile id. */
  profile?: string;
  /** Attached patient context forces the local-only privacy gate closed. */
  patientContext?: unknown;
  /** Per-synthesis timeout in ms. */
  timeoutMs?: number;
}

export type VoiceProviderId = "gemini-live" | "sarvam" | "voicebox" | "elevenlabs" | "openai-live" | "none";

export interface VoiceStatus {
  provider: VoiceProviderId;
  microphonePermission: "granted" | "denied" | "prompt" | "unknown";
  microphoneActive: boolean;
  voiceProviderConnected: boolean;
  lastAudioInput: number | null; // epoch ms
  lastTranscript: string | null;
  lastVoiceOutput: number | null; // epoch ms
  roundTripLatency: number | null; // ms, measured submit→speech-start
  reconnectAttempts: number;
  language: string;
  conversationState: string;
}

export interface TranscriptEvent {
  text: string;
  isFinal: boolean;
  language?: string;
  provider: VoiceProviderId;
  ts: number;
}

export type SpeechStateKind =
  | "started"
  | "ended"
  | "interrupted"
  | "failed";

export interface SpeechStateEvent {
  state: SpeechStateKind;
  provider: VoiceProviderId;
  /** Which provider actually produced audio (truthful attribution). */
  audioProvider?: string;
  ts: number;
}

export interface MayinVoiceProvider {
  start(): Promise<void>;
  stop(): Promise<void>;

  speak(text: string, options?: SpeakOptions): Promise<void>;
  interrupt(): Promise<void>;

  getStatus(): VoiceStatus;

  onTranscript(handler: (event: TranscriptEvent) => void): () => void;
  onSpeechState(handler: (event: SpeechStateEvent) => void): () => void;
}
