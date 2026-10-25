import type { MedicationAudience, MedicationFinding, RankedSuggestion } from "./types";

function redCount(findings: MedicationFinding[]): number {
  return findings.filter((finding) => finding.severity === "red").length;
}

function orangeCount(findings: MedicationFinding[]): number {
  return findings.filter((finding) => finding.severity === "orange").length;
}

/**
 * Safety, then stock, then what the patient pays.
 * Hospital margin is never a sort key.
 */
export function sortMedicationSuggestions<T extends RankedSuggestion>(items: readonly T[], _view: MedicationAudience): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const reds = redCount(left.item.findings) - redCount(right.item.findings);
      if (reds !== 0) return reds;
      const oranges = orangeCount(left.item.findings) - orangeCount(right.item.findings);
      if (oranges !== 0) return oranges;
      const stock = Number(right.item.inStock) - Number(left.item.inStock);
      if (stock !== 0) return stock;
      const price = left.item.patientPrice - right.item.patientPrice;
      if (price !== 0) return price;
      return left.index - right.index;
    })
    .map((entry) => entry.item);
}

/** Margin is visible on pharmacy and admin screens only. */
export function audienceFields(view: MedicationAudience): Array<"patientPrice" | "hospitalMargin"> {
  if (view === "pharmacy" || view === "admin") return ["patientPrice", "hospitalMargin"];
  return ["patientPrice"];
}
