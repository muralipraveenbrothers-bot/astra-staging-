import type { MedicationPrefill } from "../clinical/medication/patientSnapshot";
import type { AxisView } from "./hypercubeView";

/** Documented snapshot fields only. Missing numbers are omitted, never invented. */
export function axesFromMedicationPrefill(prefill: MedicationPrefill | null | undefined): AxisView[] {
  if (!prefill) return [];
  const rows: AxisView[] = [];
  const add = (axis: string, value: string | undefined) => {
    const text = String(value ?? "").trim();
    if (!text) return;
    rows.push({ axis, value: text, status: "documented" });
  };
  add("allergies", prefill.allergiesText);
  add("lab:egfr", prefill.egfrText);
  add("lab:creatinine", prefill.creatinineText);
  add("lab:alt", prefill.altText);
  add("lab:ast", prefill.astText);
  return rows;
}
