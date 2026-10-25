/**
 * ASTRA SAARATHI — Voice façade plugin (legacy compatibility shim).
 * =================================================================
 * HISTORY (why this file was rewritten)
 * -------------------------------------
 * This plugin USED to call itself the "VOICEBOX VOICE INTELLIGENCE ENGINE (P0)"
 * while `synthesizeSpeech()` delegated to `voiceEngine.speakReply()` — a pure
 * BROWSER speech cascade. The dashboard therefore reported "Voicebox" as
 * speaking when a robotic browser voice was talking. That is exactly the
 * class of lie the repair mandate forbids.
 *
 * WHAT IT DOES NOW
 * ----------------
 * Speech routes through Sarvam, then Gemini, then local Voicebox
 * (English, Hindi, Telugu). Browser speech synthesis is not used.
 *
 * VAD (energy-based voice activity detection) is unchanged — it is honest
 * client-side signal processing and never claimed to be Voicebox.
 */

import { speakSaarathi, stopSaarathiSpeech } from "@/astra/voice/providers/ttsPriority";
import type { VoiceLang } from "../voice/voiceEngine";

export type VoiceboxProfile =
  | "saarathi-prime"
  | "saarathi-welcome"
  | "saarathi-ward"
  | "saarathi-medsafe"
  | "saarathi-theatre"
  | "saarathi-lab"
  | "saarathi-vision"
  | "saarathi-ledger"
  // legacy ids accepted for backward compatibility, mapped to Saarathi personas
  | "warm-consultant"
  | "direct-specialist"
  | "empathetic-physician";

/** Legacy → Saarathi persona mapping (old saved configs keep working). */
const LEGACY_PROFILE_MAP: Record<string, VoiceboxProfile> = {
  "warm-consultant": "saarathi-prime",
  "direct-specialist": "saarathi-prime",
  "empathetic-physician": "saarathi-welcome",
};

export interface VoiceboxConfig {
  activeProfile: VoiceboxProfile;
  vadSensitivity: number; // 0.0 to 1.0 (threshold)
  preferredLang: string;
}

const STORAGE_KEY = "astra_voicebox_config_v1";

function normalizeProfile(profile: string): VoiceboxProfile {
  return (LEGACY_PROFILE_MAP[profile] as VoiceboxProfile) ?? (profile as VoiceboxProfile);
}

export class VoiceboxService {
  private config: VoiceboxConfig;
  private vadAudioCtx: AudioContext | null = null;
  private vadAnalyser: AnalyserNode | null = null;
  private vadAnimFrame: number | null = null;
  private isSpeakingVAD = false;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): VoiceboxConfig {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...parsed, activeProfile: normalizeProfile(parsed.activeProfile) };
      }
    } catch { }
    return {
      activeProfile: "saarathi-prime",
      vadSensitivity: 0.025,
      preferredLang: "en-IN",
    };
  }

  private saveConfig(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch { }
  }

  /**
   * Transcribe Stream: legacy browser-speech entry point.
   * DEPRECATED for the conversational path — Saarathi's primary ear is Voicebox
   * Whisper via `startSaarathiListening` (sttPriority). This remains only as an
   * emergency browser STT fallback and is labelled as such wherever surfaced.
   */
  transcribeStream(
    langCode: string,
    onInterim: (text: string) => void,
    onFinal: (text: string) => void,
    onError?: (err: { reason: string; message: string }) => void
  ): boolean {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      onError?.({ reason: "BROWSER_STT_UNAVAILABLE", message: "This browser exposes no SpeechRecognition (FALLBACK STT)." });
      return false;
    }
    const rec = new SR();
    rec.lang = langCode || this.config.preferredLang;
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e: any) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      if (interim) onInterim(interim);
      if (final) onFinal(final);
    };
    rec.onerror = (e: any) => onError?.({ reason: "BROWSER_STT_ERROR", message: String(e?.error ?? e) });
    try {
      rec.start();
      return true;
    } catch (err) {
      onError?.({ reason: "BROWSER_STT_START_FAILED", message: String(err) });
      return false;
    }
  }

  /** Stop any active transcription stream. */
  stopTranscription(): void {
    // Browser SpeechRecognition instances are one-shot and self-terminate;
    // nothing here is a Voicebox resource, so there is nothing to leak.
  }

  /**
   * Synthesize through Sarvam, then Gemini, then local Voicebox.
   * Short English, Hindi, and Telugu lines stay on Voicebox to save API calls.
   */
  synthesizeSpeech(text: string, langCode?: string, onDone?: () => void): void {
    void speakSaarathi({
      text,
      language: langCode || this.config.preferredLang,
      profile: this.config.activeProfile,
      onEnd: () => onDone?.(),
      onError: (error) => console.warn("[Saarathi voice façade] speech failed:", error),
    });
  }

  /** Stop current speech output. */
  stopSpeech(): void {
    stopSaarathiSpeech();
  }

  /**
   * Detect VAD: Real-time energy-based Voice Activity Detection using Web Audio AnalyserNode.
   * Notifies when doctor begins and stops speaking. (Client-side DSP — unrelated to Voicebox.)
   */
  async detectVad(
    stream: MediaStream,
    onVoiceStart: () => void,
    onVoiceEnd: () => void
  ): Promise<boolean> {
    this.stopVad();

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return false;

      this.vadAudioCtx = new AudioCtx();
      const source = this.vadAudioCtx.createMediaStreamSource(stream);
      this.vadAnalyser = this.vadAudioCtx.createAnalyser();
      this.vadAnalyser.fftSize = 512;
      this.vadAnalyser.smoothingTimeConstant = 0.2;
      source.connect(this.vadAnalyser);

      const bufferLength = this.vadAnalyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      let silenceFrames = 0;

      const checkAudio = () => {
        if (!this.vadAnalyser) return;
        this.vadAnalyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength / 255;

        if (average > this.config.vadSensitivity) {
          silenceFrames = 0;
          if (!this.isSpeakingVAD) {
            this.isSpeakingVAD = true;
            onVoiceStart();
          }
        } else {
          silenceFrames++;
          if (this.isSpeakingVAD && silenceFrames > 40) {
            this.isSpeakingVAD = false;
            onVoiceEnd();
          }
        }

        this.vadAnimFrame = requestAnimationFrame(checkAudio);
      };

      this.vadAnimFrame = requestAnimationFrame(checkAudio);
      return true;
    } catch (err) {
      console.warn("VAD initialization error:", err);
      return false;
    }
  }

  /** Stop VAD analyzer loop and release audio context. */
  stopVad(): void {
    if (this.vadAnimFrame) {
      cancelAnimationFrame(this.vadAnimFrame);
      this.vadAnimFrame = null;
    }
    if (this.vadAudioCtx && this.vadAudioCtx.state !== "closed") {
      try { this.vadAudioCtx.close(); } catch { }
      this.vadAudioCtx = null;
    }
    this.vadAnalyser = null;
    this.isSpeakingVAD = false;
  }

  /** Switch Voice: select a Saarathi persona. */
  switchVoice(profile: VoiceboxProfile): void {
    this.config.activeProfile = normalizeProfile(profile);
    this.saveConfig();
  }

  getActiveProfile(): VoiceboxProfile {
    return this.config.activeProfile;
  }

  getConfig(): VoiceboxConfig {
    return { ...this.config };
  }

  getSupportedLanguages(): VoiceLang[] {
    // Legacy VOICE_LANGS lived on the old browser engine; Saarathi speaks the
    // languages below through Voicebox/Gemini. Kept as a static list so the
    // plugin API surface is unchanged.
    return [
      { code: "en-IN", speechCode: "en-IN", label: "English (India)", nativeLabel: "English" },
      { code: "hi-IN", speechCode: "hi-IN", label: "Hindi (India)", nativeLabel: "हिन्दी" },
      { code: "te-IN", speechCode: "te-IN", label: "Telugu (India)", nativeLabel: "తెలుగు" },
      { code: "ta-IN", speechCode: "ta-IN", label: "Tamil (India)", nativeLabel: "தமிழ்" },
    ];
  }
}

export const voicebox = new VoiceboxService();
