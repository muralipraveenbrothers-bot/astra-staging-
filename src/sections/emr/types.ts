// ASTRA Doctor EMR — Clinical data model (types + patient)
// Source-tagged clinical navigation. NOT an autonomous diagnosis tool.

export type HotspotStatus = "critical" | "attention" | "normal" | "review";
export type HotspotSource = "clinician-selected" | "report-linked" | "lab-linked" | "ai-suggestion" | "imaging-linked";
export type SystemFilter = "all" | "Cardiovascular" | "Respiratory" | "Digestive" | "Skeletal" | "Muscular" | "Nervous" | "Urinary";

export interface LinkedResource {
  label: string;
  type: "lab" | "imaging" | "report" | "medication" | "trend" | "note";
  status?: "available" | "pending" | "abnormal";
}

export interface Hotspot {
  id: string;
  label: string;
  system: string;
  meshNames: string[];
  status: HotspotStatus;
  source: HotspotSource;
  patientAffected: boolean;
  anatomicalLocation: string;
  clinicalSignificance: string;
  safetyNote: string;
  linkedResources: LinkedResource[];
  landmarks?: string[];
  position: [number, number, number];
  color: string;
}

export interface PatientEMR {
  id: string;
  displayName: string;
  mrn: string;
  age: number;
  sex: "M" | "F" | "O";
  allergies: string[];
  primaryDiagnosis: string;
  differentialDiagnosis: string;
  alerts: { label: string; level: "critical" | "warning" | "info" }[];
  vitals: { label: string; value: string; status?: "normal" | "abnormal" }[];
  labs: { label: string; value: string; trend?: "up" | "down" | "stable"; status: "normal" | "abnormal" | "critical" }[];
  medications: string[];
  admitted: string;
}

export const SYSTEM_FILTERS: SystemFilter[] = [
  "all", "Cardiovascular", "Respiratory", "Skeletal", "Digestive", "Urinary",
];

export const PATIENT: PatientEMR = {
  id: "EMR-001",
  displayName: "Patient A",
  mrn: "MRN-2024-0042",
  age: 34,
  sex: "M",
  allergies: ["Penicillin", "Sulfa"],
  primaryDiagnosis: "Dengue viral fever",
  differentialDiagnosis: "Severe capillary leak concern",
  alerts: [
    { label: "Platelets decreasing", level: "critical" },
    { label: "Hematocrit rising", level: "warning" },
    { label: "Fever 103.2°F", level: "warning" },
    { label: "O2 sat 95%", level: "info" },
  ],
  vitals: [
    { label: "Temp", value: "103.2°F", status: "abnormal" },
    { label: "HR", value: "92 bpm" },
    { label: "BP", value: "118/76" },
    { label: "SpO2", value: "95%", status: "abnormal" },
    { label: "RR", value: "20/min" },
  ],
  labs: [
    { label: "Platelets", value: "78K", trend: "down", status: "critical" },
    { label: "Hematocrit", value: "48%", trend: "up", status: "abnormal" },
    { label: "WBC", value: "3.2K", trend: "down", status: "abnormal" },
    { label: "AST/ALT", value: "68/54", status: "abnormal" },
  ],
  medications: ["IV Fluids (NS)", "Paracetamol 1g PRN", "Monitoring q2h"],
  admitted: "2024-09-02",
};