/** Universal 7 axes. Values are documented facts only. Nothing here is a diagnosis or a probability. */

export const AXES = ["D1", "D2", "D3", "D4", "D5", "D6", "D7"] as const;
export type AxisId = (typeof AXES)[number];

export const AXIS_LABELS: Record<AxisId, string> = {
  D1: "WHERE",
  D2: "WHAT",
  D3: "WHEN",
  D4: "TRIGGER",
  D5: "HOW MUCH",
  D6: "CONNECTION",
  D7: "RESPONSE",
};

export type AxisStatus = "documented" | "draft_extracted" | "missing";

export interface AxisValue {
  value: string | null;
  status: AxisStatus;
  confirmedBy?: string;
}

export type VectorKind =
  | "symptom" | "sign" | "examination" | "history" | "genetics"
  | "occupation_exposure" | "onset" | "progression" | "aggravator" | "reliever"
  | "investigation" | "laboratory" | "biochemistry" | "physiology" | "imaging"
  | "medication" | "comorbidity" | "treatment_response";

export interface ClinicalVector {
  kind: VectorKind;
  axes: Record<AxisId, AxisValue>;
  sourceRefs: string[];
  documentedAt?: string;
  confirmedBy?: string;
  status: AxisStatus;
}

export interface PatientClinicalState {
  vectors: ClinicalVector[];
  hypotheses: Array<{ id: string; label: string }>;
  contradictions: string[];
  blindSpots: string[];
  redFlags: string[];
  treatments: string[];
  trajectory: string[];
}
