/**
 * ASTRA 7D — DETERMINISTIC CLINICAL RULE ENGINE
 * ============================================================================
 * Scores are computed arithmetically from provided inputs. Missing inputs →
 * INDETERMINATE with reasons. Nothing is estimated, imputed, or invented.
 * (Laya / LLM confidence is NEVER used as a clinical probability.)
 */

import type { RuleOutcome } from "./d7Types";

export interface ScoreResult {
  name: string;
  score: number | null;
  outcome: RuleOutcome;
  components: Array<{ label: string; value: number | string; provided: boolean }>;
  interpretation?: string;
}

/** qSOFA (q Sequential Organ Failure Assessment) — bedside screening. */
export function qSOFA(input: {
  respiratoryRate?: number;
  systolicBp?: number;
  alteredMentation?: boolean;
}): ScoreResult {
  const provided = [
    input.respiratoryRate !== undefined,
    input.systolicBp !== undefined,
    input.alteredMentation !== undefined,
  ];
  const complete = provided.every(Boolean);
  let score: number | null = null;
  if (complete) {
    score =
      (input.respiratoryRate! >= 22 ? 1 : 0) +
      (input.systolicBp! <= 100 ? 1 : 0) +
      (input.alteredMentation! ? 1 : 0);
  }
  return {
    name: "qSOFA",
    score,
    outcome: score === null ? "INDETERMINATE" : score >= 2 ? "POSITIVE" : "NEGATIVE",
    components: [
      { label: "Respiratory rate ≥ 22", value: input.respiratoryRate ?? "missing", provided: input.respiratoryRate !== undefined },
      { label: "Systolic BP ≤ 100 mmHg", value: input.systolicBp ?? "missing", provided: input.systolicBp !== undefined },
      { label: "Altered mentation", value: input.alteredMentation !== undefined ? String(input.alteredMentation) : "missing", provided: input.alteredMentation !== undefined },
    ],
    interpretation:
      score === null
        ? "Indeterminate — required components missing"
        : score >= 2
          ? "Positive — higher risk of poor outcome; escalate assessment"
          : "Negative — does not by itself exclude organ dysfunction",
  };
}

/**
 * HEART score components are ENTERED as clinician-coded values (0-2 each);
 * this function only sums and classifies them deterministically.
 */
export function HEART(input: {
  history?: 0 | 1 | 2;
  ecg?: 0 | 1 | 2;
  age?: 0 | 1 | 2;
  riskFactors?: 0 | 1 | 2;
  troponin?: 0 | 1 | 2;
}): ScoreResult {
  const parts: Array<[string, 0 | 1 | 2 | undefined]> = [
    ["History", input.history],
    ["ECG", input.ecg],
    ["Age", input.age],
    ["Risk factors", input.riskFactors],
    ["Troponin", input.troponin],
  ];
  const complete = parts.every(([, v]) => v !== undefined);
  const score = complete ? parts.reduce((sum, [, v]) => sum + (v as number), 0) : null;
  return {
    name: "HEART",
    score,
    outcome: score === null ? "INDETERMINATE" : score >= 3 ? "POSITIVE" : "NEGATIVE",
    components: parts.map(([label, v]) => ({
      label,
      value: v ?? "missing",
      provided: v !== undefined,
    })),
    interpretation:
      score === null
        ? "Indeterminate — required components missing"
        : score >= 3
          ? "Score 3-6: moderate risk category (apply local chest-pain protocol)"
          : "Score 0-2: low risk category (apply local chest-pain protocol)",
  };
}
