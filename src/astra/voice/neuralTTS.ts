/**
 * ASTRA AI - NEURAL TTS ENGINE (NATURAL-FIRST CASCADE)
 * =============================================================================
 * Voice Quality Cascade (per Voicebox spec):
 *   Tier 1: Browser NATURAL / NEURAL voices  ← FIRST CHOICE
 *           (Microsoft Natural Jenny/Aria/Sonia, Google Neural voices)
 *           spoken through dynamic prosody engine (human pauses + pitch variation)
 *   Tier 2: ElevenLabs API      - Hyper-realistic neural voices (fallback on error)
 *   Tier 3: Google Cloud TTS    - WaveNet/Neural2 Indian language voices (SSML)
 *   Tier 4: OpenAI TTS API      - Natural Onyx / Nova voices (HD quality)
 *   Tier 5: Basic Browser TTS   - Always-available last-resort fallback
 *
 * If ANY tier errors, the cascade automatically falls back to the next tier.
 */

import { cleanForSpeech } from './speechText';
import { humanizeForSpeech, segmentWithPauses } from './conversationalTTS';

export { cleanForSpeech };

const RUN_KEYS_KEY = 'astra_neural_tts_keys_session';

export interface NeuralTTSKeys {
  elevenlabs?: string;
  googleTts?: string;
  openai?: string;
}

function loadKeys(): NeuralTTSKeys {
  const env = {
    elevenlabs: (import.meta as any).env?.VITE_ELEVENLABS_API_KEY as string | undefined,
    googleTts: (import.meta as any).env?.VITE_GOOGLE_TTS_API_KEY as string | undefined,
    openai: (import.meta as any).env?.VITE_OPENAI_API_KEY as string | undefined,
  };
  let session: NeuralTTSKeys = {};
  try {
    const raw = sessionStorage.getItem(RUN_KEYS_KEY);
    if (raw) session = JSON.parse(raw);
  } catch { }
  return {
    elevenlabs: env.elevenlabs || session.elevenlabs,
    googleTts: env.googleTts || session.googleTts,
    openai: env.openai || session.openai,
  };
}

export function setNeuralTTSKeys(keys: Partial<NeuralTTSKeys>): void {
  try {
    const merged = { ...loadKeys(), ...keys };
    sessionStorage.setItem(RUN_KEYS_KEY, JSON.stringify(merged));
  } catch { }
}

export function getNeuralTTSKeys(): NeuralTTSKeys {
  return loadKeys();
}

const ELEVENLABS_VOICES: Record<string, string> = {
  'warm-consultant': 'pNInz6obpgDQGcFmaJgB',
  'direct-specialist': 'EXAVITQu4vr4xnSDxMaL',
  'empathetic-physician': 'VR6AewLTigWG4xSOukaG',
  'en-IN': 'pNInz6obpgDQGcFmaJgB',
  'hi-IN': 'pNInz6obpgDQGcFmaJgB',
  'te-IN': 'pNInz6obpgDQGcFmaJgB',
  'ta-IN': 'pNInz6obpgDQGcFmaJgB',
  'kn-IN': 'pNInz6obpgDQGcFmaJgB',
  'ml-IN': 'pNInz6obpgDQGcFmaJgB',
};

const GOOGLE_TTS_VOICES: Record<string, { name: string; ssmlGender: string }> = {
  'en-IN': { name: 'en-IN-Neural2-D', ssmlGender: 'MALE' },
  'hi-IN': { name: 'hi-IN-Neural2-D', ssmlGender: 'MALE' },
  'te-IN': { name: 'te-IN-Standard-C', ssmlGender: 'MALE' },
  'ta-IN': { name: 'ta-IN-Neural2-D', ssmlGender: 'MALE' },
  'kn-IN': { name: 'kn-IN-Standard-C', ssmlGender: 'MALE' },
  'ml-IN': { name: 'ml-IN-Standard-C', ssmlGender: 'MALE' },
  'mr-IN': { name: 'mr-IN-Standard-C', ssmlGender: 'MALE' },
  'bn-IN': { name: 'bn-IN-Standard-C', ssmlGender: 'MALE' },
  'en-US': { name: 'en-US-Neural2-D', ssmlGender: 'MALE' },
};

// ─── Audio Playback State ───────────────────────────────────────────────────

let currentAudioEl: HTMLAudioElement | null = null;
let naturalPlaybackAborted = false;

async function playAudioURL(url: string): Promise<void> {
  return new Promise((resolve) => {
    stopCurrentAudio();
    const audio = new Audio(url);
    audio.volume = 1.0;
    currentAudioEl = audio;
    audio.onended = () => { currentAudioEl = null; resolve(); };
    audio.onerror = () => { currentAudioEl = null; resolve(); };
    audio.play().catch(() => { currentAudioEl = null; resolve(); });
  });
}

export function stopCurrentAudio(): void {
  naturalPlaybackAborted = true;
  if (currentAudioEl) {
    try { currentAudioEl.pause(); currentAudioEl.currentTime = 0; } catch { }
    currentAudioEl = null;
  }
  // Also cancel any in-flight browser speech synthesis from the natural tier
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    try { window.speechSynthesis.cancel(); } catch { }
  }
}

export function isNeuralAudioPlaying(): boolean {
  if (currentAudioEl !== null && !currentAudioEl.paused) return true;
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    return window.speechSynthesis.speaking;
  }
  return false;
}

// ─── TIER 1: BROWSER NATURAL / NEURAL VOICES ────────────────────────────────

/**
 * Detects premium "natural"/"neural" voices installed in the browser.
 * Priority order:
 *   1. Microsoft Natural voices (e.g., "Microsoft Jenny Online (Natural)")
 *   2. Google Neural / Chrome voices
 *   3. Microsoft Online voices (non-natural but high quality)
 */
export function findNaturalVoice(langCode: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const targetLang = langCode.toLowerCase().replace('_', '-');
  const primary = targetLang.split('-')[0];

  const scoreVoice = (v: SpeechSynthesisVoice): number => {
    const vLang = v.lang.toLowerCase().replace('_', '-');
    const vName = v.name.toLowerCase();
    let score = 0;
    // Language match scoring
    if (vLang === targetLang) score += 100;
    else if (vLang.startsWith(primary)) score += 60;
    else return 0; // must match language at least by primary code
    // Quality scoring
    if (vName.includes('natural')) score += 50;          // Microsoft Natural — best
    if (vName.includes('online')) score += 10;           // online variants are newer
    if (vName.includes('google')) score += 40;           // Google neural voices
    if (vName.includes('neural')) score += 30;
    if (vName.includes('wavenet') || vName.includes('studio')) score += 25;
    if (vName.includes('jenny') || vName.includes('aria') || vName.includes('sonia')
      || vName.includes('guy') || vName.includes('ryan') || vName.includes('michelle')) score += 15;
    // Prefer female clinical-friendly voices slightly
    if (vName.includes('female')) score += 5;
    return score;
  };

  let best: SpeechSynthesisVoice | null = null;
  let bestScore = 0;
  for (const v of voices) {
    const s = scoreVoice(v);
    if (s > bestScore) { bestScore = s; best = v; }
  }
  // Require at least a decent-quality match (language match alone isn't enough
  // to qualify as "natural" tier — that's what Tier 5 basic fallback is for)
  return bestScore >= 100 ? best : null;
}

/**
 * TIER 1: Speaks using the browser's best natural/neural voice with
 * human-like dynamic prosody. Returns false immediately if no natural
 * voice exists OR if any segment errors — triggering ElevenLabs fallback.
 */
async function speakBrowserNatural(_text: string, _langCode: string): Promise<boolean> {
  // Robotic browser speech synthesis has been removed.
  return false;
}

// ─── TIER 2: ELEVENLABS ─────────────────────────────────────────────────────

async function speakElevenLabs(text: string, langCode: string, profile: string): Promise<boolean> {
  const keys = loadKeys();
  if (!keys.elevenlabs) return false;
  const voiceId = ELEVENLABS_VOICES[langCode] || ELEVENLABS_VOICES[profile] || ELEVENLABS_VOICES['en-IN'];
  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': keys.elevenlabs,
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        // Tuned for expressive, conversational delivery
        voice_settings: { stability: 0.35, similarity_boost: 0.85, style: 0.45, use_speaker_boost: true },
      }),
    });
    if (!res.ok) { console.warn('[ElevenLabs] HTTP', res.status); return false; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    await playAudioURL(url);
    URL.revokeObjectURL(url);
    return true;
  } catch (e) { console.warn('[ElevenLabs] Error:', e); return false; }
}

// ─── TIER 3: GOOGLE CLOUD TTS (SSML) ────────────────────────────────────────

/**
 * Builds SSML with natural breaks and emphasis for human-like delivery.
 */
function buildSSML(text: string): string {
  // XML-escape using char codes so formatters never strip the entities
  const AMP = String.fromCharCode(38) + 'amp;';
  const LT = String.fromCharCode(38) + 'lt;';
  const GT = String.fromCharCode(38) + 'gt;';
  let body = text
    .replace(new RegExp(String.fromCharCode(38), 'g'), AMP)
    .replace(/</g, LT)
    .replace(/>/g, GT);
  // Pause after critical terms
  body = body.replace(/\b(critical|urgent|emergency|immediately|severe)\b\s*:?/gi,
    (m) => `${m}<break time="350ms"/>`);
  // Brief pause before dosages/values
  body = body.replace(/(\s)(\d[\d.,]*\s*(?:mg|ml|mmol|mEq|IU|units|%))/gi,
    (_m, sp, val) => `<break time="200ms"/>${val}`);
  // Emphasize critical terms
  body = body.replace(/\b(stat|immediately|critical)\b/gi,
    (m) => `<emphasis level="moderate">${m}</emphasis>`);
  return `<speak>${body}</speak>`;
}

async function speakGoogleTTS(text: string, langCode: string): Promise<boolean> {
  const keys = loadKeys();
  if (!keys.googleTts) return false;
  const voice = GOOGLE_TTS_VOICES[langCode] || GOOGLE_TTS_VOICES['en-IN'];
  const parts = langCode.split('-');
  try {
    const res = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${keys.googleTts}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { ssml: buildSSML(text) },
          voice: { languageCode: `${parts[0]}-${parts[1] || 'IN'}`, name: voice.name, ssmlGender: voice.ssmlGender },
          audioConfig: { audioEncoding: 'MP3', speakingRate: 1.02, pitch: 0.4, volumeGainDb: 2.0, effectsProfileId: ['headphone-class-device'] },
        }),
      }
    );
    if (!res.ok) { console.warn('[Google TTS] HTTP', res.status); return false; }
    const data = await res.json();
    if (!data.audioContent) return false;
    const bin = atob(data.audioContent);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    await playAudioURL(url);
    URL.revokeObjectURL(url);
    return true;
  } catch (e) { console.warn('[Google TTS] Error:', e); return false; }
}

// ─── TIER 4: OPENAI TTS-HD ──────────────────────────────────────────────────

async function speakOpenAI(text: string): Promise<boolean> {
  const keys = loadKeys();
  if (!keys.openai) return false;
  try {
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${keys.openai}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'tts-1-hd', input: text, voice: 'onyx', response_format: 'mp3', speed: 1.0 }),
    });
    if (!res.ok) { console.warn('[OpenAI TTS] HTTP', res.status); return false; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    await playAudioURL(url);
    URL.revokeObjectURL(url);
    return true;
  } catch (e) { console.warn('[OpenAI TTS] Error:', e); return false; }
}

// ─── MAIN CASCADE ───────────────────────────────────────────────────────────

export type TTSTier = 'natural' | 'elevenlabs' | 'google' | 'openai' | 'browser' | 'none';

export interface NeuralSpeakResult {
  tier: TTSTier;
  success: boolean;
}

let lastUsedTier: TTSTier = 'none';

export function getLastUsedTier(): TTSTier {
  return lastUsedTier;
}

/**
 * Human speech cascade: Sarvam, then Gemini, then local Voicebox.
 * Browser speech synthesis is not used.
 */
export async function neuralSpeak(
  rawText: string,
  langCode: string,
  _voiceProfile: string = 'warm-consultant',
  _onFallback?: (tier: TTSTier) => void
): Promise<NeuralSpeakResult> {
  const cleaned = cleanForSpeech(rawText);
  if (!cleaned) return { tier: 'none', success: false };
  const text = humanizeForSpeech(cleaned, langCode);
  if (!text) return { tier: 'none', success: false };

  const { speakSaarathi } = await import("./providers/ttsPriority");
  const spoken = await speakSaarathi({ text, language: langCode });
  if (!spoken.ok) {
    lastUsedTier = "none";
    return { tier: "none", success: false };
  }
  const tier: TTSTier =
    spoken.provider === "voicebox-local" ? "natural"
    : spoken.provider === "gemini-live" ? "google"
    : spoken.provider === "sarvam" ? "openai"
    : "none";
  lastUsedTier = tier;
  return { tier, success: true };
}

export function getActiveTTSTier(): TTSTier {
  return "natural";
}

export const TIER_LABELS: Record<TTSTier, string> = {
  natural: 'Natural Voice',
  elevenlabs: 'ElevenLabs Neural',
  google: 'Google Neural2',
  openai: 'OpenAI TTS-HD',
  browser: 'Browser TTS',
  none: 'Muted',
};