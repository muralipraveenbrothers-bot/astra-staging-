// Web Audio API & Human-Like Speech Synthesis Engine for Astra Hospital OS
import { isLocalVoiceboxOnline } from "../lib/offlineSpeech";
import { stopSaarathiSpeech as stopSaarathiRouterSpeech } from "@/astra/voice/providers/ttsPriority";
import { speakSaarathi } from "@/astra/voice/providers/ttsPriority";
import { startSaarathiListening } from "@/astra/voice/providers/sttPriority";

class HospitalAudioEngine {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // Emergency Alarm Chime (pleasant & urgent)
  playEmergencyAlarm() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      [0, 0.25, 0.5, 0.75].forEach((offset, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(idx % 2 === 0 ? 880 : 1046.5, now + offset);

        gain.gain.setValueAtTime(0, now + offset);
        gain.gain.linearRampToValueAtTime(0.2, now + offset + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.2);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + offset);
        osc.stop(now + offset + 0.22);
      });
    } catch (e) {
      console.warn("Audio alarm playback error:", e);
    }
  }

  // Success Confirmation Sound
  playSuccessChime() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const freqs = [659.25, 880.0]; // E5, A5

      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);

        gain.gain.setValueAtTime(0, now + idx * 0.12);
        gain.gain.linearRampToValueAtTime(0.18, now + idx * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.35);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.38);
      });
    } catch (e) {
      console.warn("Success chime error:", e);
    }
  }

  // Order Dispatch Chime
  playOrderDispatchSound() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const notes = [392.0, 523.25, 659.25]; // G4, C5, E5

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0, now + idx * 0.08);
        gain.gain.linearRampToValueAtTime(0.15, now + idx * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.3);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.32);
      });
    } catch (e) {
      console.warn("Order dispatch audio error:", e);
    }
  }

  // Critical Value / Lab Warning Sound
  playCriticalAlertSound() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      [0, 0.18].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(783.99, now + offset); // G5

        gain.gain.setValueAtTime(0, now + offset);
        gain.gain.linearRampToValueAtTime(0.12, now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.15);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + offset);
        osc.stop(now + offset + 0.16);
      });
    } catch (e) {
      console.warn("Critical alert sound error:", e);
    }
  }
}

export const hospitalAudio = new HospitalAudioEngine();

/**
 * Phonetically expands medical acronyms and technical notations so Voicebox
 * speaks like an experienced healthcare professional rather than a robot.
 */
export function sanitizeTextForSpeech(text: string): string {
  if (!text) return "";

  let cleaned = text
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, "") // strip emojis
    .replace(/^#{1,6}\s+/gm, "") // remove markdown header hashtags
    .replace(/[*#\_`~✦✓⚡📌💊🩺🧬⚠️🍎🌿]/g, "") // remove markdown formatting and custom icons
    .replace(/\[\d+\]/g, "") // remove citation brackets [1]
    .replace(/ID:\s*[A-Z0-9\-]+/gi, "") // remove raw technical IDs
    .replace(/```[\s\S]*?```/g, "") // remove code blocks
    .replace(/\(.*?\)/g, (match) => {
      if (match.length > 25) return "";
      return match;
    })
    .replace(/•/g, ". ")
    .replace(/:\s*$/gm, ". ")
    .replace(/\s+/g, " ")
    .trim();

  // Expanded clinical terminology mapping for natural human pronunciation
  const Replacements: [RegExp, string][] = [
    [/\bCBC\b/g, "complete blood count"],
    [/\bFBC\b/g, "full blood count"],
    [/\bCRP\b/g, "C reactive protein"],
    [/\bLFT\b/g, "liver function test"],
    [/\bKFT\b/g, "kidney function test"],
    [/\bRFT\b/g, "renal function test"],
    [/\bECG\b/g, "E C G"],
    [/\bEKG\b/g, "E K G"],
    [/\bMRI\b/g, "M R I scan"],
    [/\bCT\b/g, "C T scan"],
    [/\bUSG\b/g, "ultrasound scan"],
    [/\bICU\b/g, "I C U"],
    [/\bNICU\b/g, "N I C U"],
    [/\bOPD\b/g, "O P D"],
    [/\bIPD\b/g, "I P D"],
    [/\bOT\b/g, "operation theatre"],
    [/\bTPA\b/g, "T P A"],
    [/\bUHID\b/g, "U H I D"],
    [/\bABHA\b/g, "A B H A"],
    [/\bABDM\b/g, "A B D M"],
    [/\bWHO\b/g, "World Health Organization"],
    [/\bSTAT\b/g, "immediately stat"],
    [/\bmg\/dL\b/gi, "milligrams per deciliter"],
    [/\bmmol\/L\b/gi, "millimoles per liter"],
    [/\bmmHg\b/gi, "millimeters of mercury"],
    [/\bmg\b/gi, "milligrams"],
    [/\bmcg\b/gi, "micrograms"],
    [/\bml\b/gi, "milliliters"],
    [/\bTab\.\b|\bTab\b/gi, "Tablet"],
    [/\bCap\.\b|\bCap\b/gi, "Capsule"],
    [/\bInj\.\b|\bInj\b/gi, "Injection"],
    [/\bSyr\.\b|\bSyr\b/gi, "Syrup"],
    [/\bIV\b/g, "I V"],
    [/\bIM\b/g, "I M"],
    [/\bPO\b/gi, "orally"],
    [/\bOD\b/g, "once daily"],
    [/\bBD\b|\bBID\b/gi, "twice daily"],
    [/\bTDS\b|\bTID\b/gi, "three times daily"],
    [/\bQID\b/gi, "four times daily"],
    [/\bPRN\b/gi, "as needed"],
    [/\bSOS\b/gi, "if needed"],
    [/\bBP\b/g, "blood pressure"],
    [/\bHR\b/g, "heart rate"],
    [/\bSpO2\b/gi, "S P O 2 oxygen level"],
    [/\bTemp\b/gi, "temperature"],
    [/\bDx\b/gi, "diagnosis"],
    [/\bRx\b/gi, "prescription"],
    [/\bHx\b/gi, "history"],
    [/\bTx\b/gi, "treatment"],
    [/\bq2h\b/gi, "every 2 hours"],
    [/\bq4h\b/gi, "every 4 hours"],
    [/\bq6h\b/gi, "every 6 hours"],
    [/\bq8h\b/gi, "every 8 hours"],
    [/\bvs\.\b|\bvs\b/gi, "versus"],
    [/\bDr\.\b|\bDr\b/gi, "Doctor"],
  ];

  for (const [regex, replacement] of Replacements) {
    cleaned = cleaned.replace(regex, replacement);
  }

  return cleaned;
}

export function detectLanguageFromText(text: string): "te" | "hi" | "ta" | "kn" | "mr" | "en" {
  if (!text) return "en";
  const count = (re: RegExp) => (text.match(re) || []).length;
  const teChars = count(/[\u0C00-\u0C7F]/g);
  const hiChars = count(/[\u0900-\u097F]/g);
  const taChars = count(/[\u0B80-\u0BFF]/g);
  const knChars = count(/[\u0C80-\u0CFF]/g);
  const scripts = [
    { lang: "te" as const, n: teChars },
    { lang: "hi" as const, n: hiChars },
    { lang: "ta" as const, n: taChars },
    { lang: "kn" as const, n: knChars },
  ].sort((a, b) => b.n - a.n);
  if (scripts[0].n > 0) return scripts[0].lang;

  const normalized = text.toLowerCase();
  const te = (normalized.match(/\b(namaskaram|namaskaaram|ela|unnaru|unaru|bagunnara|cheppandi|cheppu|kavali|ledu|undi|undhi|meeru|nenu|avunu|dhanyavadalu|rogiki|mandulu|andi|garu|emi|enti|unnanu|chudandi|ivvandi|cheyandi)\b/g) || []).length;
  const hi = (normalized.match(/\b(namaste|aap|kaise|kya|hai|hain|karo|batao|mujhe|chahiye|nahi|nahin|dhanyavaad|dhanyavad|mareez|mariz|dawai|dawa|kijiye|dijiye|theek|shukriya|kripya|bataiye|pehle)\b/g) || []).length;
  const ta = (normalized.match(/\b(vanakkam|eppadi|irukkeenga|marunthu|nandri|sari|ungalukku|thani|romba|vaanga)\b/g) || []).length;
  const kn = (normalized.match(/\b(namaskara|hegiddeera|aushadhi|dhanyavada|nimage|beku|illa|ide|hege)\b/g) || []).length;

  const tokenScores = [
    { lang: "te" as const, n: te },
    { lang: "hi" as const, n: hi },
    { lang: "ta" as const, n: ta },
    { lang: "kn" as const, n: kn },
  ].sort((a, b) => b.n - a.n);

  if (tokenScores[0].n > 0) return tokenScores[0].lang;
  return "en";
}

export type SpeechEmotionMode = "empathetic" | "urgent" | "conversational" | "instructional" | "default";

export type VoiceboxProfile = "jarvis" | "male_voice" | "female_voice_1" | "female_voice_2";

export interface VoiceboxProfileMeta {
  id: VoiceboxProfile;
  name: string;
  engine: "Voicebox Kokoro" | "Qwen CustomVoice" | "Chatterbox Multilingual";
  description: string;
  role: "Saarathi" | "Doctor" | "Counselor" | "Reception";
}

export const VOICEBOX_3_PROFILES: Record<VoiceboxProfile, VoiceboxProfileMeta> = {
  jarvis: {
    id: "jarvis",
    name: "SAARATHI AI (British Male - bm_george)",
    engine: "Voicebox Kokoro",
    description: "Ultra-fast, calm, British AI assistant with clinical precision across all hospital operations",
    role: "Saarathi"
  },
  male_voice: {
    id: "male_voice",
    name: "Doctor Voice (Male)",
    engine: "Qwen CustomVoice",
    description: "Deep, clear, authoritative tone for clinical Q&A, diagnosis & doctor dictations",
    role: "Doctor"
  },
  female_voice_1: {
    id: "female_voice_1",
    name: "Counselor Voice (Female 1)",
    engine: "Qwen CustomVoice",
    description: "Warm, empathetic, gentle tone for patient counseling, pregnancy & health tips",
    role: "Counselor"
  },
  female_voice_2: {
    id: "female_voice_2",
    name: "Reception Voice (Female 2)",
    engine: "Chatterbox Multilingual",
    description: "Professional, crisp, articulate tone for reception greetings, scheduling & hospital announcements",
    role: "Reception"
  }
};

/**
 * Automatically selects the appropriate Voicebox Profile based on clinical workflow or text content
 */
export function detectVoiceboxProfile(rawText: string, copilotMode?: string, currentRole?: string): VoiceboxProfile {
  const lower = rawText ? rawText.toLowerCase() : "";
  if (lower.includes("jarvis") || copilotMode === "jarvis") {
    return "jarvis";
  }

  if (currentRole === "reception" || (copilotMode && (copilotMode.includes("reception") || copilotMode.includes("scheduling")))) {
    return "female_voice_2";
  }

  if (
    copilotMode &&
    (copilotMode.includes("counselor") || copilotMode.includes("psychology") || copilotMode.includes("pregnancy") || copilotMode.includes("explanation"))
  ) {
    return "female_voice_1";
  }

  // Reception / Billing / Appointment keywords -> female_voice_2
  if (
    lower.includes("reception") ||
    lower.includes("appointment") ||
    lower.includes("welcome to pm brothers") ||
    lower.includes("proceed to") ||
    lower.includes("billing") ||
    lower.includes("registration") ||
    lower.includes(" token ") ||
    lower.includes("స్వాగతం") ||
    lower.includes("అపాయింట్మెంట్")
  ) {
    return "female_voice_2";
  }

  // Pregnancy / Counseling / Emotional / Health tips keywords -> female_voice_1
  if (
    lower.includes("pregnancy") ||
    lower.includes("trimester") ||
    lower.includes("counseling") ||
    lower.includes("anxiety") ||
    lower.includes("rest") ||
    lower.includes("rest well") ||
    lower.includes("గర్భిణీ") ||
    lower.includes("త్రైమాసికంలో") ||
    lower.includes("गर्भावस्था") ||
    lower.includes("लोहे की गोलियाँ")
  ) {
    return "female_voice_1";
  }

  // Clinical reasoning / doctor queries
  if (lower.includes("doctor") || lower.includes("surgeon") || lower.includes("curb-65")) {
    return "male_voice";
  }

  // Default to JARVIS for ultra-fast, intelligent response
  return "jarvis";
}

/**
 * Contextual Tone Detection Logic:
 * Automatically determines whether Astra should shift to a calmer and slower prosody
 * when discussing sensitive medical concerns, critical conditions, or patient/attendant anxiety.
 */
export function detectContextualSpeechTone(rawText: string, copilotMode?: string): SpeechEmotionMode {
  if (!rawText) return "conversational";

  const lower = rawText.toLowerCase();

  // Modes that deal with patient psychology, attendant distress, communication coaching, or patient explanations
  const sensitiveModes = ["psychology", "attendant", "coach", "explanation"];
  if (copilotMode && sensitiveModes.some((m) => copilotMode.toLowerCase().includes(m))) {
    return "empathetic";
  }

  // Keywords indicating patient anxiety, sensitive medical concerns, distress, grief, or emotional support
  const sensitiveKeywords = [
    "anxiety", "anxious", "scared", "fear", "worried", "worry", "distress", "panic", "comfort",
    "reassure", "reassurance", "grief", "bereavement", "palliative", "terminal", "end-of-life",
    "bad news", "prognosis", "concern", "frightened", "nervous", "sadness", "depression",
    "coping", "empathy", "calm", "soothe", "psychology", "emotional", "attendant", "counseling",
    "vulnerable", "suffering", "difficult conversation", "breaking bad news", "stress",
    "overwhelmed", "agitated", "pain management", "family anxiety"
  ];

  if (sensitiveKeywords.some((kw) => lower.includes(kw))) {
    return "empathetic";
  }

  // Emergency / Critical Keywords triggering urgent prosody
  const urgentKeywords = [
    "cardiac arrest", "code blue", "anaphylaxis", "stat", "massive hemorrhage", "resuscitation",
    "severe shock", "hypoxia", "unresponsive", "icu alert", "desaturating"
  ];

  if (urgentKeywords.some((kw) => lower.includes(kw))) {
    return "urgent";
  }

  return "conversational";
}

let currentAudioPlayer: HTMLAudioElement | null = null;
let currentAudioQueue: HTMLAudioElement[] = [];

/**
 * Stops any active speech playback (natural audio stream or legacy speech) immediately
 */
export function stopActiveSpeech(): void {
  // Stop the priority router's playback first (Voicebox/Gemini audio element),
  // then the legacy local handles. Barge-in must silence EVERYTHING at once.
  try {
    stopSaarathiRouterSpeech();
  } catch (e) {}
  if (currentAudioPlayer) {
    try {
      currentAudioPlayer.pause();
      currentAudioPlayer.currentTime = 0;
    } catch (e) {}
    currentAudioPlayer = null;
  }
  currentAudioQueue.forEach((audio) => {
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch (e) {}
  });
  currentAudioQueue = [];
}

/**
 * Natural Conversational Voicebox Speech Engine.
 * Bypasses robotic browser TTS and streams natural Voicebox MP3/WAV audio.
 */
export function speakHumanVoice(
  rawText: string,
  onStart?: () => void,
  onEnd?: () => void,
  onError?: () => void,
  emotion: SpeechEmotionMode = "conversational",
  explicitLang?: string,
  requestedProfile?: VoiceboxProfile
): void {
  if (typeof window === "undefined") return;

  // Stop any ongoing audio playback immediately
  stopActiveSpeech();

  const detectedLang = explicitLang || detectLanguageFromText(rawText) || "en";
  const activeProfile = requestedProfile || detectVoiceboxProfile(rawText);

  // If text is in English, sanitize acronyms. If native script, clean markdown/symbols only.
  const cleanedText = detectedLang === "en" ? sanitizeTextForSpeech(rawText) : rawText.replace(/[*#\_`~✦✓⚡]/g, "").replace(/\s+/g, " ").trim();
  if (!cleanedText) return;

  // Split text into natural breath clauses (using sentence boundaries or native punctuation)
  const clauses = cleanedText
    .split(/(?<=[.!?\n।॥])\s+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  if (clauses.length === 0) return;

  // Voicebox Profile-driven rate adjustments for human warmth
  // (prosody is carried by the selected provider persona; playbackRate stays
  // documented here for the engine, but OS-side utterance flags are gone —
  // speakSaarathi is the single synthesis path.)
  void activeProfile;
  void emotion;
  let playbackRate = 1.0;
  if (activeProfile === "female_voice_1" || emotion === "empathetic") {
    playbackRate = 0.88; // Warm, calmer & slower counselor pace
  } else if (activeProfile === "male_voice") {
    playbackRate = 0.95; // Deep, clear, authoritative doctor pace
  } else if (emotion === "urgent") {
    playbackRate = 1.05; // Crisp emergency alert pace
  }
  void playbackRate;

  let currentIdx = 0;
  let hasStarted = false;

  const playNextClause = () => {
    if (currentIdx >= clauses.length) {
      currentAudioPlayer = null;
      if (onEnd) onEnd();
      return;
    }

    const clauseText = clauses[currentIdx];
    const voiceboxProfileParam = activeProfile === "jarvis" ? "JARVIS" : activeProfile;
    const clauseLang = detectedLang.includes("te") ? "te-IN" : detectedLang.includes("hi") ? "hi-IN" : "en-IN";
    // Each clause goes through the SAME priority router (Voicebox → Gemini →
    // gated browser → text-only), so provider truthfulness holds per clause.
    speakSaarathi({
      text: clauseText,
      language: clauseLang,
      profile: voiceboxProfileParam,
      onStart: () => {
        if (!hasStarted) {
          hasStarted = true;
          if (onStart) onStart();
        }
      },
      onEnd: () => {
        currentIdx++;
        playNextClause();
      },
      onError: (error) => {
        console.warn("[Astra TTS] clause failed, advancing:", error);
        currentIdx++;
        if (currentIdx >= clauses.length) {
          currentAudioPlayer = null;
          if (onError) onError();
        } else {
          playNextClause();
        }
      },
    });
  };

  playNextClause();
}

/**
 * Speech Recognition Helper for Real-time Voice Command Input
 *
 * Priority (§D): Voicebox Whisper local FIRST via startSaarathiListening
 * (MediaRecorder → /api/voice/transcribe). The old browser
 * SpeechRecognition path stays ONLY as the labelled FALLBACK ear and never
 * hard-codes en-US.
 */
export function listenHumanSpeech(
  onResult: (spokenText: string) => void,
  onError?: (err: string) => void,
  onEnd?: () => void,
  lang: string = "auto"
): any {
  if (typeof window === "undefined") return null;

  const handle = startSaarathiListening({
    preferredLanguage: lang || "auto",
    onError: (message) => {
      if (onError) onError(message);
    },
  });
  handle.promise.then((result) => {
    if (result.ok && result.text) {
      onResult(result.text);
    } else if (!result.ok && onError) {
      onError(result.error ?? "Speech recognition failed");
    }
    if (onEnd) onEnd();
  });
  // Same shape contract as before: callers holding this can stop listening.
  return {
    stop: () => handle.stop(),
    abort: () => handle.stop(),
    provider: () => "voicebox-whisper (browser STT only if Whisper unreachable)",
  };
}
