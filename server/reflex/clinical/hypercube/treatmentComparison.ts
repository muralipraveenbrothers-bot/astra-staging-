import { checkMedication } from "../../../../src/astra/clinical/medication/checkMedication";
import type { PatientMedicationContext } from "../../../../src/astra/clinical/medication/types";
import { getEvidenceBadge } from "../../../knowledge/evidence";

const ALLOWED = new Set(["doctor", "scientist", "astra7d", "formulary"]);

export interface TreatmentCandidate {
  option: string;
  source: "doctor" | "scientist" | "astra7d" | "formulary";
  whyItFits?: string[];
  evidenceId?: string;
}

export interface TreatmentRow {
  option: string;
  source: TreatmentCandidate["source"];
  whyItFits: string[];
  concerns: string[];
  avoidBecause: string[];
  monitoring: string[];
  evidenceBadge: { tier: number; date: string; verified: boolean } | null;
}

/** No ranking and no selected option. Candidates only from allowed sources. */
export function compareTreatments(input: { candidates: TreatmentCandidate[]; context: PatientMedicationContext }): TreatmentRow[] {
  return input.candidates.map((candidate) => {
    if (!ALLOWED.has(candidate.source)) throw new Error("treatment candidate source is not allowed");
    const findings = checkMedication({ drug: candidate.option, dose: "" }, input.context);
    const avoidBecause = findings.filter((finding) => finding.ruleId.startsWith("allergy.") || finding.severity === "red").map((finding) => finding.message);
    const concerns = findings.filter((finding) => !avoidBecause.includes(finding.message)).map((finding) => finding.message);
    return {
      option: candidate.option,
      source: candidate.source,
      whyItFits: candidate.whyItFits ?? [],
      concerns,
      avoidBecause,
      monitoring: [],
      evidenceBadge: candidate.evidenceId ? getEvidenceBadge(candidate.evidenceId) : null,
    };
  });
}
