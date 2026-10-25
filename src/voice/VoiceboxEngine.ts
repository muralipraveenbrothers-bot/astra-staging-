// ============================================================================
// ASTRA AI — Voicebox Voice Architecture
// ONE Voicebox. 3 Human-Like Voice Personas.
// Dr. Arjun (Clinical), Dr. Priya (Nursing), Reception Guide (Front Desk).
// 5 Languages: English, Telugu, Hindi, Tamil, Kannada
// ============================================================================

// ─── Voice Persona Definitions ──────────────────────────────────────────────
export enum VoicePersona {
  DR_ARJUN = 'DR_ARJUN',           // Male, clinical authority voice
  DR_PRIYA = 'DR_PRIYA',           // Female, empathetic nursing voice
  RECEPTION_GUIDE = 'RECEPTION_GUIDE', // Neutral, professional front desk
}

export enum SupportedLanguage {
  ENGLISH = 'en-IN',
  TELUGU = 'te-IN',
  HINDI = 'hi-IN',
  TAMIL = 'ta-IN',
  KANNADA = 'kn-IN',
}

export interface VoiceProfile {
  persona: VoicePersona;
  displayName: string;
  description: string;
  defaultLanguage: SupportedLanguage;
  supportedLanguages: SupportedLanguage[];
  voiceConfig: {
    pitch: number;      // -20 to 20
    speed: number;      // 0.25 to 4.0
    volumeGainDb: number;
    voiceName: string;  // TTS engine voice ID
  };
  roleContext: string;
  triggerRoles: string[]; // Which user roles activate this persona
}

// ─── Voice Engine Types ─────────────────────────────────────────────────────
export interface STTConfig {
  language: SupportedLanguage;
  model: string;
  enablePunctuation: boolean;
  enableWordTimestamps: boolean;
  medicalVocabularyBoost: string[];
  sampleRateHertz: number;
  encoding: 'LINEAR16' | 'FLAC' | 'MULAW' | 'OGG_OPUS' | 'WEBM_OPUS';
}

export interface TTSConfig {
  language: SupportedLanguage;
  persona: VoicePersona;
  audioEncoding: 'MP3' | 'LINEAR16' | 'OGG_OPUS' | 'MULAW';
  sampleRateHertz: number;
  ssmlEnabled: boolean;
}

export interface VADEvent {
  type: 'speech_start' | 'speech_end' | 'barge_in' | 'silence_timeout';
  timestamp: number;
  durationMs: number;
  confidence: number;
}

export interface VoiceTranscription {
  text: string;
  language: SupportedLanguage;
  confidence: number;
  wordTimestamps?: Array<{
    word: string;
    startTime: number;
    endTime: number;
  }>;
  isFinal: boolean;
  durationMs: number;
}

export interface VoiceSynthesis {
  audioContent: ArrayBuffer;
  persona: VoicePersona;
  language: SupportedLanguage;
  durationMs: number;
  textSpoken: string;
}

export interface VoiceSession {
  id: string;
  userId: string;
  role: string;
  persona: VoicePersona;
  language: SupportedLanguage;
  startTime: Date;
  isActive: boolean;
  turnCount: number;
  vadEnabled: boolean;
  bargeInEnabled: boolean;
}

// ─── Medical Vocabulary for STT Boost ───────────────────────────────────────
const MEDICAL_VOCABULARY: string[] = [
  // Labs
  'CBC', 'hemoglobin', 'WBC', 'platelet', 'creatinine', 'bilirubin', 'albumin',
  'troponin', 'CRP', 'ESR', 'procalcitonin', 'D-dimer', 'fibrinogen',
  'HbA1c', 'electrolytes', 'sodium', 'potassium', 'chloride', 'bicarbonate',
  'BUN', 'GFR', 'AST', 'ALT', 'ALP', 'GGT', 'LDH', 'amylase', 'lipase',
  'TSH', 'T3', 'T4', 'cortisol', 'ferritin', 'iron', 'TIBC',
  // Radiology
  'X-ray', 'CT scan', 'MRI', 'ultrasound', 'echocardiogram', 'Doppler',
  'fluoroscopy', 'PET scan', 'angiography', 'mammography',
  // Conditions
  'pneumonia', 'dengue', 'malaria', 'tuberculosis', 'sepsis', 'diabetes',
  'hypertension', 'myocardial infarction', 'stroke', 'COPD', 'asthma',
  'cirrhosis', 'pancreatitis', 'meningitis', 'endocarditis',
  // Drugs
  'paracetamol', 'amoxicillin', 'metformin', 'amlodipine', 'atorvastatin',
  'omeprazole', 'pantoprazole', 'ceftriaxone', 'azithromycin', 'doxycycline',
  'insulin', 'heparin', 'enoxaparin', 'warfarin', 'aspirin',
  // Procedures
  'intubation', 'catheterization', 'dialysis', 'thoracentesis', 'paracentesis',
  'lumbar puncture', 'central line', 'arterial line', 'tracheostomy',
  // Vitals & Scores
  'blood pressure', 'heart rate', 'respiratory rate', 'oxygen saturation',
  'SpO2', 'GCS', 'CURB-65', 'Wells score', 'APACHE', 'SOFA score',
  // Hospital Terms
  'admission', 'discharge', 'transfer', 'ICU', 'ward', 'OPD', 'IPD',
  'nursing station', 'operation theatre', 'emergency', 'triage',
];

// ─── Spoken Variant Normalizer ──────────────────────────────────────────────
class SpokenVariantNormalizer {
  private variantMap: Map<string, string> = new Map([
    // Phonetic misinterpretations
    ['see bee see', 'CBC'],
    ['c b c', 'CBC'],
    ['sea bee sea', 'CBC'],
    ['see our pee', 'CRP'],
    ['c r p', 'CRP'],
    ['hb a1c', 'HbA1c'],
    ['h b a one c', 'HbA1c'],
    ['a s t', 'AST'],
    ['a l t', 'ALT'],
    ['g f r', 'GFR'],
    ['t s h', 'TSH'],
    ['e s r', 'ESR'],
    ['b u n', 'BUN'],
    ['l d h', 'LDH'],
    ['g c s', 'GCS'],
    ['i c u', 'ICU'],
    ['o p d', 'OPD'],
    ['i p d', 'IPD'],
    ['o t', 'OT'],
    ['a b g', 'ABG'],
    ['e c g', 'ECG'],
    ['e k g', 'ECG'],
    ['b p', 'blood pressure'],
    ['s p o 2', 'SpO2'],
    ['s p o two', 'SpO2'],
    ['x ray', 'X-ray'],
    ['ex ray', 'X-ray'],
    ['ct scan', 'CT scan'],
    ['cat scan', 'CT scan'],
    ['m r i', 'MRI'],
    ['pet scan', 'PET scan'],
    // Common Indian English variations
    ['sugar test', 'blood glucose'],
    ['sugar level', 'blood glucose'],
    ['kidney test', 'renal function test'],
    ['liver test', 'liver function test'],
    ['thyroid test', 'thyroid function test'],
    ['urine test', 'urinalysis'],
  ]);

  normalize(text: string): string {
    let normalized = text.toLowerCase();
    for (const [variant, standard] of this.variantMap) {
      const regex = new RegExp(variant, 'gi');
      normalized = normalized.replace(regex, standard);
    }
    return normalized;
  }
}

// ─── Voice Activity Detector ────────────────────────────────────────────────
class VoiceActivityDetector {
  private silenceThresholdMs = 1500;
  private bargeInThresholdMs = 300;
  private lastSpeechTimestamp = 0;
  private isSpeaking = false;

  processAudioFrame(timestamp: number, energy: number, threshold = 0.02): VADEvent | null {
    const wasSpeaking = this.isSpeaking;
    this.isSpeaking = energy > threshold;

    if (!wasSpeaking && this.isSpeaking) {
      // Speech started
      this.lastSpeechTimestamp = timestamp;
      return {
        type: 'speech_start',
        timestamp,
        durationMs: 0,
        confidence: Math.min(1, energy / threshold),
      };
    }

    if (wasSpeaking && !this.isSpeaking) {
      const duration = timestamp - this.lastSpeechTimestamp;
      return {
        type: 'speech_end',
        timestamp,
        durationMs: duration,
        confidence: 0.9,
      };
    }

    // Check for silence timeout
    if (!this.isSpeaking && this.lastSpeechTimestamp > 0) {
      const silenceDuration = timestamp - this.lastSpeechTimestamp;
      if (silenceDuration >= this.silenceThresholdMs) {
        this.lastSpeechTimestamp = 0;
        return {
          type: 'silence_timeout',
          timestamp,
          durationMs: silenceDuration,
          confidence: 1.0,
        };
      }
    }

    return null;
  }

  detectBargeIn(timestamp: number): VADEvent | null {
    if (this.isSpeaking) {
      return {
        type: 'barge_in',
        timestamp,
        durationMs: this.bargeInThresholdMs,
        confidence: 0.85,
      };
    }
    return null;
  }

  reset(): void {
    this.isSpeaking = false;
    this.lastSpeechTimestamp = 0;
  }
}

// ─── Voicebox Engine (Main) ─────────────────────────────────────────────────
export class VoiceboxEngine {
  private voiceProfiles: Map<VoicePersona, VoiceProfile> = new Map();
  private activeSessions: Map<string, VoiceSession> = new Map();
  private normalizer = new SpokenVariantNormalizer();
  private vad = new VoiceActivityDetector();
  private transcriptionHistory: VoiceTranscription[] = [];

  constructor() {
    this.registerDefaultProfiles();
  }

  // ── Profile Management ──────────────────────────────────────────────────
  private registerDefaultProfiles(): void {
    const profiles: VoiceProfile[] = [
      {
        persona: VoicePersona.DR_ARJUN,
        displayName: 'Dr. Arjun',
        description: 'Authoritative male clinical voice for doctor-facing interactions',
        defaultLanguage: SupportedLanguage.ENGLISH,
        supportedLanguages: [SupportedLanguage.ENGLISH, SupportedLanguage.TELUGU, SupportedLanguage.HINDI],
        voiceConfig: {
          pitch: -2,
          speed: 1.0,
          volumeGainDb: 2,
          voiceName: 'en-IN-Wavenet-C',
        },
        roleContext: 'You are Dr. Arjun, ASTRA\'s clinical voice. You speak with medical authority, precision, and calm confidence. Use proper medical terminology.',
        triggerRoles: ['doctor', 'consultant', 'surgeon', 'intensivist'],
      },
      {
        persona: VoicePersona.DR_PRIYA,
        displayName: 'Dr. Priya',
        description: 'Empathetic female nursing voice for care team interactions',
        defaultLanguage: SupportedLanguage.ENGLISH,
        supportedLanguages: [SupportedLanguage.ENGLISH, SupportedLanguage.TELUGU, SupportedLanguage.HINDI, SupportedLanguage.TAMIL, SupportedLanguage.KANNADA],
        voiceConfig: {
          pitch: 2,
          speed: 0.95,
          volumeGainDb: 1,
          voiceName: 'en-IN-Wavenet-A',
        },
        roleContext: 'You are Dr. Priya, ASTRA\'s empathetic nursing voice. You speak with warmth, patience, and clarity. You simplify medical terms when appropriate.',
        triggerRoles: ['nurse', 'head_nurse', 'nursing_supervisor', 'duty_nurse'],
      },
      {
        persona: VoicePersona.RECEPTION_GUIDE,
        displayName: 'ASTRA Guide',
        description: 'Professional front desk voice for reception and patient guidance',
        defaultLanguage: SupportedLanguage.ENGLISH,
        supportedLanguages: [SupportedLanguage.ENGLISH, SupportedLanguage.TELUGU, SupportedLanguage.HINDI, SupportedLanguage.TAMIL, SupportedLanguage.KANNADA],
        voiceConfig: {
          pitch: 0,
          speed: 1.05,
          volumeGainDb: 0,
          voiceName: 'en-IN-Wavenet-D',
        },
        roleContext: 'You are ASTRA Guide, the reception voice. You speak clearly and professionally, guiding patients and visitors through hospital processes.',
        triggerRoles: ['reception', 'front_desk', 'admin', 'patient'],
      },
    ];

    for (const profile of profiles) {
      this.voiceProfiles.set(profile.persona, profile);
    }
  }

  getVoiceProfile(persona: VoicePersona): VoiceProfile | undefined {
    return this.voiceProfiles.get(persona);
  }

  getPersonaForRole(role: string): VoicePersona {
    for (const [persona, profile] of this.voiceProfiles) {
      if (profile.triggerRoles.includes(role.toLowerCase())) {
        return persona;
      }
    }
    return VoicePersona.RECEPTION_GUIDE; // Default
  }

  // ── Session Management ──────────────────────────────────────────────────
  startSession(userId: string, role: string, language?: SupportedLanguage, persona?: VoicePersona): VoiceSession {
    const resolvedPersona = persona ?? this.getPersonaForRole(role);
    const profile = this.voiceProfiles.get(resolvedPersona)!;

    const session: VoiceSession = {
      id: `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId,
      role,
      persona: resolvedPersona,
      language: language || profile.defaultLanguage,
      startTime: new Date(),
      isActive: true,
      turnCount: 0,
      vadEnabled: true,
      bargeInEnabled: true,
    };

    this.activeSessions.set(session.id, session);
    console.log(`[Voicebox] Session started: ${session.id} (${profile.displayName}, ${session.language})`);
    return session;
  }

  endSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.isActive = false;
      this.activeSessions.delete(sessionId);
      this.vad.reset();
      console.log(`[Voicebox] Session ended: ${sessionId} (${session.turnCount} turns)`);
    }
  }

  getActiveSession(sessionId: string): VoiceSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  // ── Speech-to-Text ──────────────────────────────────────────────────────
  async transcribe(audioData: ArrayBuffer, config: Partial<STTConfig> = {}): Promise<VoiceTranscription> {
    const startTime = Date.now();

    const sttConfig: STTConfig = {
      language: config.language || SupportedLanguage.ENGLISH,
      model: config.model || 'chirp-2',
      enablePunctuation: config.enablePunctuation ?? true,
      enableWordTimestamps: config.enableWordTimestamps ?? true,
      medicalVocabularyBoost: config.medicalVocabularyBoost || MEDICAL_VOCABULARY,
      sampleRateHertz: config.sampleRateHertz || 16000,
      encoding: config.encoding || 'WEBM_OPUS',
    };

    const form = new FormData();
    form.append('audio', new Blob([audioData], { type: 'audio/webm;codecs=opus' }), 'voice.webm');
    form.append('language', sttConfig.language);
    const response = await fetch('/api/voice/transcribe', { method: 'POST', body: form });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`VOICEBOX_STT_UNAVAILABLE (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`);
    }
    const payload = await response.json() as { text?: string; refinedText?: string; language?: string; confidence?: number };
    const transcription: VoiceTranscription = {
      text: payload.refinedText || payload.text || '',
      language: (payload.language as SupportedLanguage) || sttConfig.language,
      confidence: typeof payload.confidence === 'number' ? payload.confidence : 0,
      isFinal: true,
      durationMs: Date.now() - startTime,
    };

    this.transcriptionHistory.push(transcription);
    return transcription;
  }

  // ── Normalize Spoken Medical Terms ──────────────────────────────────────
  normalizeSpokenInput(text: string): string {
    return this.normalizer.normalize(text);
  }

  // ── Text-to-Speech ──────────────────────────────────────────────────────
  async synthesize(text: string, config: Partial<TTSConfig> = {}): Promise<VoiceSynthesis> {
    const startTime = Date.now();
    const persona = config.persona || VoicePersona.DR_ARJUN;
    const language = config.language || SupportedLanguage.ENGLISH;
    const profile = this.voiceProfiles.get(persona)!;

    // Build SSML for natural speech
    const ssml = this.buildSSML(text, profile, language);

    // In production, this would call Google Cloud Text-to-Speech
    // For now, simulate synthesis
    const synthesis: VoiceSynthesis = {
      audioContent: new ArrayBuffer(0),
      persona,
      language,
      durationMs: Date.now() - startTime,
      textSpoken: text,
    };

    return synthesis;
  }

  private buildSSML(text: string, profile: VoiceProfile, language: SupportedLanguage): string {
    return `<speak>
  <prosody rate="${profile.voiceConfig.speed}" pitch="${profile.voiceConfig.pitch >= 0 ? '+' : ''}${profile.voiceConfig.pitch}st">
    <lang xml:lang="${language}">
      ${this.addMedicalProsody(text)}
    </lang>
  </prosody>
</speak>`;
  }

  private addMedicalProsody(text: string): string {
    // Add brief pauses before important medical values
    let ssml = text;
    // Pause before numbers (lab values)
    ssml = ssml.replace(/(\d+\.?\d*)\s*(mg|mmol|mEq|IU|units|%)/g, '<break time="200ms"/>$1 $2');
    // Emphasize critical terms
    ssml = ssml.replace(/(critical|urgent|emergency|stat|immediately)/gi, '<emphasis level="strong">$1</emphasis>');
    return ssml;
  }

  // ── VAD Processing ──────────────────────────────────────────────────────
  processVAD(timestamp: number, energy: number): VADEvent | null {
    return this.vad.processAudioFrame(timestamp, energy);
  }

  detectBargeIn(timestamp: number): VADEvent | null {
    return this.vad.detectBargeIn(timestamp);
  }

  // ── Stats ──────────────────────────────────────────────────────────────
  getStats() {
    return {
      registeredPersonas: this.voiceProfiles.size,
      activeSessions: this.activeSessions.size,
      totalTranscriptions: this.transcriptionHistory.length,
      supportedLanguages: Object.values(SupportedLanguage),
      personas: Array.from(this.voiceProfiles.values()).map(p => ({
        name: p.displayName,
        persona: p.persona,
        languages: p.supportedLanguages,
      })),
    };
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────
let voiceboxInstance: VoiceboxEngine | null = null;

export function getVoiceboxEngine(): VoiceboxEngine {
  if (!voiceboxInstance) {
    voiceboxInstance = new VoiceboxEngine();
  }
  return voiceboxInstance;
}
