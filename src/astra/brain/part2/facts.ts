/**
 * Verified case facts. Missing fields stay unknown. These layers do not invent them.
 */

export interface LabFact {
  name: string;
  value?: string;
  at?: string;
}

export interface VerifiedFacts {
  presentation?: string;
  age?: number;
  sex?: string;
  symptoms?: string[];
  signs?: string[];
  comorbidities?: string[];
  medications?: string[];
  allergies?: string[];
  labs?: LabFact[];
  investigations?: string[];
  procedures?: string[];
  admitted?: boolean;
  pulsesPresent?: boolean;
  examinationReliable?: boolean;
  recordedDiagnosis?: string;
}

export function known(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "unknown";
  const text = String(value).trim();
  return text.length ? text : "unknown";
}

export function listOrUnknown(values: string[] | undefined): string[] {
  const cleaned = (values ?? []).map((item) => item.trim()).filter(Boolean);
  return cleaned.length ? cleaned : ["unknown"];
}
