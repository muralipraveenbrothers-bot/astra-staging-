/**
 * ASTRA 7D — DR. MAYIN SPEECH STYLE MANAGER
 * ============================================================================
 * Applies emotional/situational speech variations WITHOUT changing clinical content.
 * Clinical content always comes from MayinBrainGateway.
 */

export type SpeechStyle =
  | "neutral"
  | "empathetic"
  | "calm"
  | "precise"
  | "efficient"
  | "alert"
  | "encouraging"
  | "professional";

export interface StyleContext {
  patientState?: "stable" | "concerning" | "critical" | "anxious" | "comfortable";
  interactionType?: "routine" | "urgent" | "break_badge" | "handover" | "explanation";
  userRole?: "doctor" | "nurse" | "reception" | "pharmacy" | "patient";
}

export interface StylePreset {
  name: SpeechStyle;
  pitch: number;
  rate: number;
  volume: number;
  pauseBetweenSentences: number;
  warmth: number;
  emphasis: number;
}

const STYLE_PRESETS: Record<SpeechStyle, StylePreset> = {
  neutral: { name: "neutral", pitch: 1.0, rate: 1.0, volume: 1.0, pauseBetweenSentences: 200, warmth: 0.5, emphasis: 0.5 },
  empathetic: { name: "empathetic", pitch: 1.05, rate: 0.92, volume: 0.95, pauseBetweenSentences: 350, warmth: 0.9, emphasis: 0.6 },
  calm: { name: "calm", pitch: 0.95, rate: 0.9, volume: 0.85, pauseBetweenSentences: 400, warmth: 0.7, emphasis: 0.7 },
  precise: { name: "precise", pitch: 1.0, rate: 1.1, volume: 1.0, pauseBetweenSentences: 150, warmth: 0.3, emphasis: 0.9 },
  efficient: { name: "efficient", pitch: 1.0, rate: 1.15, volume: 1.0, pauseBetweenSentences: 100, warmth: 0.4, emphasis: 0.6 },
  alert: { name: "alert", pitch: 1.05, rate: 1.05, volume: 1.0, pauseBetweenSentences: 150, warmth: 0.5, emphasis: 0.8 },
  encouraging: { name: "encouraging", pitch: 1.08, rate: 0.95, volume: 0.95, pauseBetweenSentences: 250, warmth: 0.85, emphasis: 0.7 },
  professional: { name: "professional", pitch: 1.0, rate: 1.0, volume: 0.95, pauseBetweenSentences: 200, warmth: 0.6, emphasis: 0.7 },
};

/**
 * Select appropriate speech style based on context.
 */
export function selectStyle(context: StyleContext): SpeechStyle {
  const patientState = context.patientState ?? "stable";
  const interactionType = context.interactionType ?? "routine";

  if (patientState === "critical") return "calm";
  if (patientState === "anxious" || interactionType === "break_badge") return "empathetic";
  if (interactionType === "routine") return "efficient";
  if (interactionType === "explanation") return "precise";
  if (interactionType === "urgent") return "alert";
  if (interactionType === "handover") return "professional";
  return "neutral";
}

/**
 * Get full style configuration for TTS provider.
 */
export function getStyleConfig(style: SpeechStyle): Partial<StylePreset> {
  const preset = STYLE_PRESETS[style];
  return { pitch: preset.pitch, rate: preset.rate, volume: preset.volume, pauseBetweenSentences: preset.pauseBetweenSentences };
}

/**
 * Merge style with explicit overrides.
 */
export function mergeStyleOverrides(base: SpeechStyle, overrides: Partial<StylePreset>): StylePreset {
  const basePreset = { ...STYLE_PRESETS[base] };
  return { ...basePreset, ...overrides };
}
