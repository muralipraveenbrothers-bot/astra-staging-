/**
 * ASTRA AI â€” HARDENED VOICE ENGINE WITH AUTO-LANGUAGE DETECTION & NATURAL-FIRST TTS CASCADE
 * ============================================================================
 * Features:
 * 1. Preflight mic probe via getUserMedia with specific error diagnostic mapping.
 * 2. Script & token-based automatic language detection (Telugu, Hindi, Tamil, Kannada, Malayalam, Bengali, English).
 * 3. Human TTS: Sarvam, then Gemini, then local Voicebox (English, Hindi, Telugu). Browser voices are not used.
 * 4. Error-resilient SpeechRecognition with silence retry and auto-reconnect.
 * 5. Conversational humanizer: abbreviations expanded, numbers spoken naturally,
 *    dynamic pitch/rate variation and human-like pauses between segments.
 */
import { cleanForSpeech } from './speechText';
import { humanizeForSpeech } from './conversationalTTS';
import { speakSaarathi, stopSaarathiSpeech } from './providers/ttsPriority';
import type { HumanMouth } from './providers/layaVoiceRoute';
import { unlockAstraAudio } from './roundTrip/ttsFallback';

export { cleanForSpeech };

export interface VoiceLang {
  code: string;       // BCP-47 for SpeechRecognition
  speechCode: string; // BCP-47 for SpeechSynthesis voice matching
  label: string;
  nativeLabel: string;
}

export const VOICE_LANGS: VoiceLang[] = [
  { code: 'en-IN', speechCode: 'en-IN', label: 'English (India)', nativeLabel: 'English' },
  { code: 'hi-IN', speechCode: 'hi-IN', label: 'Hindi (India)', nativeLabel: 'à¤¹à¤¿à¤¨à¥à¤¦à¥€' },
  { code: 'te-IN', speechCode: 'te-IN', label: 'Telugu (India)', nativeLabel: 'à°¤à±†à°²à±à°—à±' },
  { code: 'ta-IN', speechCode: 'ta-IN', label: 'Tamil (India)', nativeLabel: 'à®¤à®®à®¿à®´à¯' },
  { code: 'kn-IN', speechCode: 'kn-IN', label: 'Kannada (India)', nativeLabel: 'à²•à²¨à³à²¨à²¡' },
  { code: 'ml-IN', speechCode: 'ml-IN', label: 'Malayalam (India)', nativeLabel: 'à´®à´²à´¯à´¾à´³à´‚' },
  { code: 'mr-IN', speechCode: 'mr-IN', label: 'Marathi (India)', nativeLabel: 'à¤®à¤°à¤¾à¤ à¥€' },
  { code: 'bn-IN', speechCode: 'bn-IN', label: 'Bengali (India)', nativeLabel: 'à¦¬à¦¾à¦‚à¦²à¦¾' },
  { code: 'en-US', speechCode: 'en-US', label: 'English (US)', nativeLabel: 'English (US)' },
];

export interface VoiceStartResult {
  ok: boolean;
  reason?: 'denied' | 'no-mic' | 'busy' | 'offline' | 'unsupported';
  message?: string;
}

export interface ListeningCallbacks {
  onInterim?: (text: string) => void;
  onFinal?: (text: string, detectedLang?: string) => void;
  onError?: (err: { reason: string; message: string }) => void;
  onStateChange?: (state: 'idle' | 'requesting-permission' | 'listening' | 'processing' | 'error') => void;
  onEnd?: () => void;
}

type LegacyRecognitionCallback = (text: string, isFinal: boolean) => void;

const PREF_LANG_KEY = 'astra_voice_preferred_lang_v2';
const VOICE_REPLY_KEY = 'astra_voice_replies_enabled_v1';

// Formatter-safe character-range regexes (built at runtime to survive auto-formatting)
function charRange(from: number, to: number): string {
  return String.fromCharCode(from) + '-' + String.fromCharCode(to);
}
const SCRIPT_TELUGU = new RegExp('[' + charRange(0x0c00, 0x0c7f) + ']');
const SCRIPT_TAMIL = new RegExp('[' + charRange(0x0b80, 0x0bff) + ']');
const SCRIPT_MALAYALAM = new RegExp('[' + charRange(0x0d00, 0x0d7f) + ']');
const SCRIPT_KANNADA = new RegExp('[' + charRange(0x0c80, 0x0cff) + ']');
const SCRIPT_BENGALI = new RegExp('[' + charRange(0x0980, 0x09ff) + ']');
const SCRIPT_DEVANAGARI = new RegExp('[' + charRange(0x0900, 0x097f) + ']');
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]|\p{Extended_Pictographic}/gu;


/**
 * Script and token-based language detection.
 * Accurately classifies Indian scripts and common Latin transliterations.
 */
export function detectLanguage(text: string, fallback = 'en-IN'): string {
  if (!text || typeof text !== 'string') return fallback;
  const clean = text.trim();

  // 1. Script checks
  if (SCRIPT_TELUGU.test(clean)) return 'te-IN'; // Telugu
  if (SCRIPT_TAMIL.test(clean)) return 'ta-IN'; // Tamil
  if (SCRIPT_MALAYALAM.test(clean)) return 'ml-IN'; // Malayalam
  if (SCRIPT_KANNADA.test(clean)) return 'kn-IN'; // Kannada
  if (SCRIPT_BENGALI.test(clean)) return 'bn-IN'; // Bengali
  if (SCRIPT_DEVANAGARI.test(clean)) return 'hi-IN'; // Devanagari (Hindi / Marathi)

  // 2. Latin transliteration token heuristics
  const lower = clean.toLowerCase();

  // Telugu transliteration tokens
  const teluguTokens = /\b(ela\s+unnaru|cheppandi|andi|garu|emi|kavali|enti|unnanu|baga|chudandi|namaskaram|ela|undhi|unaru|ivvandi|cheyandi)\b/i;
  if (teluguTokens.test(lower)) return 'te-IN';

  // Hindi transliteration tokens
  const hindiTokens = /\b(kaise|hai|kya|aur|nahi|karo|batao|kijiye|dijiye|theek|namaste|shukriya|mariz|dawa|kripya|bataiye|pehle)\b/i;
  if (hindiTokens.test(lower)) return 'hi-IN';

  // Tamil transliteration tokens
  const tamilTokens = /\b(eppadi|irukenga|vanakkam|sollunga|enakku|nandri|paarkalam)\b/i;
  if (tamilTokens.test(lower)) return 'ta-IN';

  return fallback;
}

export function detectSpeechLang(text: string, fallback: string): string {
  return detectLanguage(text, fallback);
}

export function getLanguageDisplayName(code: string): string {
  const match = VOICE_LANGS.find((l) => l.code === code || l.speechCode === code);
  return match ? match.nativeLabel : code;
}

class VoiceEngine {
  private recognition: any = null;
  private speaking = false;
  private noSpeechCount = 0;
  private restartCount = 0;
  private maxRestarts = 3;
  private isListeningActive = false;
  private currentLang = 'en-IN';
  private autoLangEnabled = true;
  private currentCallbacks: ListeningCallbacks | null = null;

  constructor() {
    this.currentLang = this.loadPreferredLanguage();
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      const unlock = () => {
        this.unlockAudio();
        window.removeEventListener('click', unlock);
        window.removeEventListener('keydown', unlock);
        window.removeEventListener('touchstart', unlock);
      };
      window.addEventListener('click', unlock, { once: true });
      window.addEventListener('keydown', unlock, { once: true });
      window.addEventListener('touchstart', unlock, { once: true });
    }
  }

  /** Unlocks browser audio autoplay on a real user gesture. Does not speak. */
  public unlockAudio(): void {
    unlockAstraAudio();
  }

  public loadPreferredLanguage(): string {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(PREF_LANG_KEY) || 'en-IN';
      }
    } catch { }
    return 'en-IN';
  }

  public setPreferredLanguage(langCode: string): void {
    this.currentLang = langCode;
    this.autoLangEnabled = langCode === 'auto';
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(PREF_LANG_KEY, langCode);
      }
    } catch { }
  }

  public getPreferredLanguage(): string {
    return this.currentLang;
  }

  public isVoiceReplyEnabled(): boolean {
    try {
      if (typeof localStorage !== 'undefined') {
        const val = localStorage.getItem(VOICE_REPLY_KEY);
        return val === null ? true : val === 'true';
      }
    } catch { }
    return true;
  }

  public setVoiceReplyEnabled(enabled: boolean): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(VOICE_REPLY_KEY, String(enabled));
      }
    } catch { }
  }

  isRecognitionSupported(): boolean {
    return typeof window !== 'undefined' && (!!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition);
  }

  /**
   * Preflight mic permission check via getUserMedia.
   * Gives specific guidance depending on error name.
   */
  async preflight(): Promise<VoiceStartResult> {
    this.unlockAudio();
    if (typeof window === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (!this.isRecognitionSupported()) {
        return {
          ok: false,
          reason: 'unsupported',
          message: 'Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.',
        };
      }
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop probe stream tracks immediately so mic isn't held busy
      stream.getTracks().forEach((track) => track.stop());
      return { ok: true };
    } catch (err: any) {
      const name = err?.name || '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        return {
          ok: false,
          reason: 'denied',
          message:
            'Microphone access is blocked. Click the lock/tune icon left of localhost:5173 in your address bar -> Site settings -> Microphone -> set to "Allow" -> then click Retry. Voicebox listens on port 17493.',
        };
      }
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        return {
          ok: false,
          reason: 'no-mic',
          message: 'No microphone detected. Please plug in a microphone or headset and verify Windows Sound Settings.',
        };
      }
      if (name === 'NotReadableError' || name === 'TrackStartError') {
        return {
          ok: false,
          reason: 'busy',
          message: 'Microphone is currently held by another application (Teams, Zoom, or another browser tab). Please close it and click Retry.',
        };
      }
      return {
        ok: false,
        reason: 'denied',
        message: `Microphone error: ${err?.message || 'Access denied'}. Please check browser and OS permissions.`,
      };
    }
  }

  /**
   * Hardened startListening method supporting callback objects and legacy (callback, onEnd) signatures.
   */
  startListening(
    langCode: string,
    callbacksOrLegacy: ListeningCallbacks | LegacyRecognitionCallback,
    legacyOnEnd?: () => void
  ): boolean {
    this.unlockAudio();
    if (!this.isRecognitionSupported()) {
      if (typeof callbacksOrLegacy === 'object' && callbacksOrLegacy.onError) {
        callbacksOrLegacy.onError({
          reason: 'unsupported',
          message: 'Speech recognition is not supported in this browser. Use Chrome or Edge.',
        });
      }
      return false;
    }

    const effectiveLang = (langCode === 'auto' || !langCode) ? (this.currentLang === 'auto' ? 'en-IN' : this.currentLang) : langCode;
    this.currentLang = effectiveLang;
    this.isListeningActive = true;
    this.noSpeechCount = 0;
    this.restartCount = 0;

    let callbacks: ListeningCallbacks;
    if (typeof callbacksOrLegacy === 'function') {
      callbacks = {
        onInterim: (t) => callbacksOrLegacy(t, false),
        onFinal: (t) => callbacksOrLegacy(t, true),
        onEnd: legacyOnEnd,
      };
    } else {
      callbacks = callbacksOrLegacy;
    }
    this.currentCallbacks = callbacks;

    return this.initiateRecognition();
  }

  private initiateRecognition(): boolean {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.stopRecognitionInternal();

    try {
      this.recognition = new Ctor();
      this.recognition.lang = this.currentLang;
      this.recognition.interimResults = true;
      this.recognition.continuous = false;
      this.recognition.maxAlternatives = 1;

      this.currentCallbacks?.onStateChange?.('listening');

      this.recognition.onresult = (e: any) => {
        this.noSpeechCount = 0;
        let interim = '', final = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) final += t;
          else interim += t;
        }

        if (final && final.trim()) {
          const finalText = final.trim();
          const detected = detectLanguage(finalText, this.currentLang);

          // Auto-switch recognition language for next utterance if in auto mode
          if (this.autoLangEnabled && detected !== this.currentLang) {
            this.currentLang = detected;
          }

          this.currentCallbacks?.onFinal?.(finalText, detected);
        } else if (interim && interim.trim()) {
          this.currentCallbacks?.onInterim?.(interim.trim());
        }
      };

      this.recognition.onerror = (e: any) => {
        const error = e.error;
        if (error === 'aborted') return;

        if (error === 'no-speech') {
          this.noSpeechCount++;
          if (this.noSpeechCount < 2 && this.isListeningActive) {
            try {
              this.recognition.start();
              return;
            } catch { }
          }
          if (this.noSpeechCount >= 2) {
            this.currentCallbacks?.onError?.({
              reason: 'no-speech',
              message: "I couldn't hear any speech. Please speak into your microphone or type your request below.",
            });
            this.isListeningActive = false;
          }
          return;
        }

        if (error === 'not-allowed' || error === 'service-not-allowed') {
          this.isListeningActive = false;
          this.currentCallbacks?.onError?.({
            reason: 'denied',
            message:
              'Microphone access is blocked. Click the lock/tune icon left of localhost:5173 in your address bar -> Site settings -> Microphone -> set to "Allow" -> then click Retry. Voicebox listens on port 17493.',
          });
          return;
        }

        if (error === 'network') {
          this.isListeningActive = false;
          this.currentCallbacks?.onError?.({
            reason: 'offline',
            message: 'Browser speech recognition requires network connectivity to reach speech servers. You can also type your query directly.',
          });
          return;
        }

        if (error === 'audio-capture') {
          this.isListeningActive = false;
          this.currentCallbacks?.onError?.({
            reason: 'no-mic',
            message: 'Microphone hardware capture error. Please check your audio input device in Windows settings.',
          });
          return;
        }

        if (error === 'language-not-supported') {
          this.currentLang = 'en-IN';
          this.initiateRecognition();
          return;
        }

        this.currentCallbacks?.onError?.({
          reason: error,
          message: `Speech recognition notice: ${error}. You can retry or use keyboard input.`,
        });
      };

      this.recognition.onend = () => {
        if (this.isListeningActive && this.restartCount < this.maxRestarts && this.noSpeechCount === 0) {
          this.restartCount++;
          try {
            this.recognition.start();
            return;
          } catch { }
        }
        this.currentCallbacks?.onEnd?.();
      };

      this.recognition.start();
      return true;
    } catch (err: any) {
      console.warn('Recognition start exception:', err);
      this.currentCallbacks?.onError?.({
        reason: 'denied',
        message: 'Could not initialize speech recognition. Please verify mic permission or type your request.',
      });
      return false;
    }
  }

  private stopRecognitionInternal(): void {
    try {
      this.recognition?.abort();
    } catch { }
    this.recognition = null;
  }

  stopListening(): void {
    this.isListeningActive = false;
    this.stopRecognitionInternal();
  }

  /**
   * Speak an AI reply with Sarvam, then Gemini, then local Voicebox.
   */
  speakReply(text: string, langCode?: string, onDone?: () => void, mouths?: HumanMouth[]): void {
    this.speak(text, langCode || this.currentLang || "en-IN", onDone, mouths);
  }

  speak(text: string, langCode: string, onDone?: () => void, mouths?: HumanMouth[]): void {
    if (!this.isVoiceReplyEnabled()) {
      onDone?.();
      return;
    }
    const cleaned = cleanForSpeech(text);
    if (!cleaned) {
      onDone?.();
      return;
    }
    const paced = humanizeForSpeech(cleaned, langCode).replace(/\s*…\s*/g, ", ").replace(/\s{2,}/g, " ").trim();
    this.stopSpeaking();
    this.unlockAudio();
    const effectiveLang = detectLanguage(paced || cleaned, langCode);
    this.speaking = true;
    void speakSaarathi({
      text: paced || cleaned,
      language: effectiveLang,
      mouths,
    }).finally(() => {
      this.speaking = false;
      onDone?.();
    });
  }

  stopSpeaking(): void {
    stopSaarathiSpeech();
    this.speaking = false;
  }

  isSpeaking(): boolean {
    return this.speaking;
  }
}

export const voiceEngine = new VoiceEngine();
