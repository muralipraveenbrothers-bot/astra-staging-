/**
 * R5-06 critical value rules — ONE deterministic config file.
 * Every rule is decision support only: "confirm with doctor/lab".
 * Laboratory thresholds come from the R5-06 spec; the vitals criticals reuse
 * the R5-02 Emergency Pathway thresholds so there is a single source of truth.
 */
import { CLINICAL_INGRESS_THRESHOLDS } from "../clinicalIngressConfig";

export type CriticalCondition = "lessThan" | "greaterThan";

export interface CriticalValueRule {
  id: string;
  analyte: string;
  /** Lower-case names matched as whole words/tokens against the entered parameter name. */
  matchNames: readonly string[];
  /** Lower-case substrings that disqualify a match (e.g. HbA1c / HBsAg for the Hb rule). */
  excludeNames?: readonly string[];
  condition: CriticalCondition;
  /** null = doctor-set placeholder — the rule stays inert until a threshold is set. */
  threshold: number | null;
  unit: string;
  exampleCriticalValue: number;
  category: "laboratory" | "vitals";
  source: string;
  confirmNote: string;
}

export const CRITICAL_VALUE_CONFIRM_NOTE = "confirm with doctor/lab";

export const CRITICAL_VALUE_RULES: readonly CriticalValueRule[] = [
  {
    id: "hb-low",
    analyte: "Hemoglobin (Hb)",
    matchNames: ["hb", "hemoglobin", "haemoglobin"],
    // HbA1c 6.5 % is NOT a haemoglobin of 6.5 g/dL; hepatitis B markers are not Hb either.
    excludeNames: ["a1c", "glycated", "glycosylated", "hbsag", "hbs ag", "hbeag", "hbe ag", "hbv", "anti-hb", "hbf", "fetal", "hba2", "electrophoresis"],
    condition: "lessThan",
    threshold: 7,
    unit: "g/dL",
    exampleCriticalValue: 6.5,
    category: "laboratory",
    source: "R5-06 critical value list",
    confirmNote: CRITICAL_VALUE_CONFIRM_NOTE,
  },
  {
    id: "potassium-high",
    analyte: "Potassium (K+)",
    matchNames: ["k+", "potassium", "serum potassium"],
    condition: "greaterThan",
    threshold: 6,
    unit: "mmol/L",
    exampleCriticalValue: 6.2,
    category: "laboratory",
    source: "R5-06 critical value list",
    confirmNote: CRITICAL_VALUE_CONFIRM_NOTE,
  },
  {
    // Spec gives an example value (420 mg/dL) but NO threshold, so this stays a
    // doctor-set placeholder: threshold null => the rule never fires until a
    // doctor sets one.
    id: "rbs-high",
    analyte: "Random blood sugar",
    matchNames: ["rbs", "random blood sugar", "blood glucose random", "glucose (random)"],
    condition: "greaterThan",
    threshold: null,
    unit: "mg/dL",
    exampleCriticalValue: 420,
    category: "laboratory",
    source: "R5-06 example only — doctor-set placeholder, no threshold given",
    confirmNote: CRITICAL_VALUE_CONFIRM_NOTE,
  },
  {
    id: "platelets-low",
    analyte: "Platelets",
    matchNames: ["platelet", "platelets", "platelet count", "plt"],
    // Indices are not counts: MPV 9 fL must never read as a platelet count of 9.
    excludeNames: ["mean platelet", "volume", "mpv", "distribution", "pdw", "crit", "pct", "large cell", "p-lcr", "aggregation", "function"],
    condition: "lessThan",
    threshold: CLINICAL_INGRESS_THRESHOLDS.emergencyPathway.plateletsLessThan,
    unit: "/uL",
    exampleCriticalValue: 15000,
    category: "laboratory",
    source: "R5-02 Emergency Pathway",
    confirmNote: CRITICAL_VALUE_CONFIRM_NOTE,
  },
  {
    id: "sbp-low",
    analyte: "Systolic BP",
    matchNames: ["sbp", "systolic"],
    condition: "lessThan",
    threshold: CLINICAL_INGRESS_THRESHOLDS.emergencyPathway.systolicBpLessThan,
    unit: "mmHg",
    exampleCriticalValue: 76,
    category: "vitals",
    source: "R5-02 Emergency Pathway (vitals critical)",
    confirmNote: CRITICAL_VALUE_CONFIRM_NOTE,
  },
];

export interface CriticalAlertConfig {
  level: 3;
  levelLabel: string;
  /** Unacknowledged alerts escalate after this many ms (configurable). */
  escalationTimeoutMs: number;
  /** While still unacknowledged after escalation, re-announce every this many ms. */
  escalationRepeatMs: number;
  voice: {
    /** Critical announcements always speak — they override night-time suppression. */
    overridesNightSuppression: boolean;
    nightStartHour: number;
    nightEndHour: number;
  };
}

export const CRITICAL_ALERT_CONFIG: CriticalAlertConfig = {
  level: 3,
  levelLabel: "Level 3",
  escalationTimeoutMs: 5 * 60 * 1000,
  escalationRepeatMs: 2 * 60 * 1000,
  voice: { overridesNightSuppression: true, nightStartHour: 22, nightEndHour: 7 },
};
