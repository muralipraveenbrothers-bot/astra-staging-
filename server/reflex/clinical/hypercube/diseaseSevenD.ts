import type { Astra7DCaseSynthesis } from "../../../clinical/astra7dEngine";

export const DISEASE_HEADINGS = ["anatomical", "pathophysiological", "biochemical", "clinical", "investigation", "management", "outcome"] as const;
export type DiseaseHeading = (typeof DISEASE_HEADINGS)[number];

export interface DiseaseFrame {
  diagnosisLabel: string;
  reviewStatus: "empty" | "draft_needs_doctor_review" | "approved";
  headings: Record<DiseaseHeading, { confirm: string[]; refute: string[] }>;
  note: "what would confirm / refute";
}

function emptyHeadings(): DiseaseFrame["headings"] {
  return {
    anatomical: { confirm: [], refute: [] },
    pathophysiological: { confirm: [], refute: [] },
    biochemical: { confirm: [], refute: [] },
    clinical: { confirm: [], refute: [] },
    investigation: { confirm: [], refute: [] },
    management: { confirm: [], refute: [] },
    outcome: { confirm: [], refute: [] },
  };
}

/** Wraps an existing 7D synthesis. Likelihood and chosen-option fields are not copied. */
export function diseaseFrames(
  ddx: Array<{ diagnosis: string }>,
  synthesis?: Pick<Astra7DCaseSynthesis, "d5PossibilityBranches"> | null,
  approvedExpected: string[] = [],
): DiseaseFrame[] {
  return ddx.map((row) => {
    const headings = emptyHeadings();
    if (approvedExpected.length) headings.clinical = { confirm: [...approvedExpected], refute: [] };
    const match = synthesis?.d5PossibilityBranches?.find((item) => item.diagnosis.toLowerCase().includes(row.diagnosis.toLowerCase()));
    if (match) {
      headings.clinical.confirm.push(...match.supports.slice(0, 4));
      headings.clinical.refute.push(...match.arguesAgainst.slice(0, 4));
    }
    const filled = approvedExpected.length > 0 || !!match;
    return {
      diagnosisLabel: row.diagnosis,
      reviewStatus: filled ? "draft_needs_doctor_review" : "empty",
      headings,
      note: "what would confirm / refute",
    };
  });
}
