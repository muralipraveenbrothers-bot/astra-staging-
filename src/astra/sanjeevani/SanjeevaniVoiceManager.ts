/**
 * SANJEEVANI AI — Voice Manager
 * =============================
 * Canonical voice coordinator for Sanjeevani:
 * - Direct connection to Voicebox (:17493)
 * - Automatic speech language detection (Telugu, Hindi, English, Tenglish)
 * - Interruption / Barge-in handling
 * - Audio queue management with silence / VAD awareness
 */

import { voiceboxSpeak, voiceboxTranscribe, getVoiceboxStatus } from "../voice/providers/voiceboxLocal";
import { detectAstraLanguage } from "../voice/roundTrip/language";
import type { AstraLanguage } from "../voice/roundTrip/contracts";

export interface VoiceTurnResult {
  ok: boolean;
  transcript?: string;
  audioBlob?: Blob;
  language: AstraLanguage;
  error?: string;
}

export class SanjeevaniVoiceManager {
  private isSpeaking = false;
  private abortController: AbortController | null = null;

  /** Check if the canonical Voicebox service (:17493) is healthy. */
  isVoiceboxReady(): boolean {
    const status = getVoiceboxStatus();
    return status.state === "READY";
  }

  /** Stop speaking immediately when doctor interrupts or begins speaking (barge-in). */
  interrupt(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.isSpeaking = false;
  }

  /** Transcribe captured user audio via Voicebox Whisper. */
  async transcribeAudio(audioBlob: Blob): Promise<{ ok: boolean; text: string; language: AstraLanguage }> {
    this.interrupt(); // User spoke, cancel any active playback
    const transcriptRes = await voiceboxTranscribe(audioBlob);
    if (!transcriptRes.ok) {
      return { ok: false, text: "", language: "en" };
    }
    const detectedLang = detectAstraLanguage(transcriptRes.text);
    return { ok: true, text: transcriptRes.text, language: detectedLang };
  }

  /** Speak text using Voicebox neural TTS. */
  async speak(text: string, language: AstraLanguage = "en"): Promise<Blob | undefined> {
    this.interrupt();
    this.abortController = new AbortController();
    this.isSpeaking = true;

    try {
      const res = await voiceboxSpeak(text, language, {
        signal: this.abortController.signal,
        timeoutMs: 10000,
      });
      if (res.ok && res.blob) {
        return res.blob;
      }
    } catch (e) {
      console.warn("[SanjeevaniVoiceManager] Synthesis error:", e);
    } finally {
      this.isSpeaking = false;
    }
    return undefined;
  }
}

export const sanjeevaniVoiceManager = new SanjeevaniVoiceManager();
