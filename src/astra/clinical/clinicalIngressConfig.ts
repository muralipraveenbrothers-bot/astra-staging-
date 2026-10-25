export type ClinicalRiskLevel = "High" | "Borderline" | "Low";
export type OrganSafetyLevel = "Safe" | "Borderline" | "High";

// Thresholds to be confirmed by doctor. NEWS2-style decision support only; these are simplified cut-offs, not official NEWS2 points.
export const CLINICAL_INGRESS_THRESHOLDS = {
  label: "NEWS2-style",
  doctorReviewNote: "Thresholds to be confirmed by doctor. Decision support only - doctor confirms.",
  high: {
    respiratoryRateGreaterThan: 25,
    spo2LessThan: 92,
    systolicBpLessThan: 90,
    urineOutputMlHrLessThan: 30,
    sepsisTriad: ["suspected infection", "fever or hypothermia", "tachycardia or tachypnea"],
    alteredSensorium: true,
  },
  borderline: {
    respiratoryRateGreaterThan: 20,
    spo2LessThan: 94,
    systolicBpLessThan: 100,
    heartRateGreaterThan: 100,
    temperatureFGreaterThan: 100.4,
    reEvaluationHours: 2,
  },
  emergencyPathway: {
    systolicBpLessThan: 80,
    plateletsLessThan: 20000,
  },
  organSafety: {
    kidney: { creatinineBorderlineGreaterThan: 1.3, creatinineHighGreaterThan: 2 },
    heart: { heartRateBorderlineGreaterThan: 100, heartRateHighGreaterThan: 130 },
    brain: { gcsBorderlineLessThan: 15, gcsHighLessThan: 13 },
  },
} as const;

export const SYMPTOM_NORMALIZATION_TERMS: ReadonlyArray<{
  canonical: string;
  patterns: ReadonlyArray<RegExp>;
}> = [
  { canonical: "Abdominal Pain", patterns: [/stom(?:o|a)ch\s+p(?:q|a)ain/i, /abd(?:ominal)?\s+pain/i, /belly\s+pain/i] },
  { canonical: "Chest Pain", patterns: [/chest\s+pain/i, /retrosternal/i, /substernal/i] },
  { canonical: "Shortness of Breath", patterns: [/short(?:ness)?\s+of\s+breath/i, /\bsob\b/i, /breathless/i] },
  { canonical: "Fever", patterns: [/fever/i, /pyrexia/i] },
  { canonical: "Altered Sensorium", patterns: [/altered\s+sensorium/i, /confus(?:ed|ion)/i, /drowsy/i] },
  { canonical: "Leg Swelling", patterns: [/leg\s+swelling/i, /swollen\s+(?:right|left)?\s*leg/i, /lower\s+limb\s+edema/i] },
  { canonical: "Cellulitis", patterns: [/cellulitis/i, /spreading\s+erythema/i, /red\s+swollen\s+painful\s+(?:right|left)?\s*leg/i] },
];

export const RED_FLAG_RULE_OUTS: ReadonlyArray<{
  id: string;
  complaint: RegExp;
  flags: ReadonlyArray<string>;
}> = [
  { id: "chest-pain", complaint: /chest pain|retrosternal|substernal/i, flags: ["STEMI", "Aortic Dissection", "Pulmonary Embolism"] },
  { id: "sepsis-general", complaint: /fever|sepsis|hypotension|altered sensorium|tachypnea/i, flags: ["Sepsis", "Shock", "Meningitis"] },
  { id: "stroke-general", complaint: /weakness|facial droop|slurred speech|stroke|altered sensorium/i, flags: ["Stroke", "Hypoglycemia", "Sepsis"] },
  { id: "leg-cellulitis", complaint: /cellulitis|red swollen painful.*leg|leg.*red.*swollen|spreading erythema|lower limb.*edema/i, flags: ["Necrotizing Fasciitis", "Sepsis", "Deep Vein Thrombosis"] },
];
