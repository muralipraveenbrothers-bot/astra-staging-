import { checkMedication } from "../../../src/astra/clinical/medication/checkMedication";
import type { ClinicalContradiction } from "./types";

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function latestVitals(patient: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(patient.vitals)) return (patient.vitals[patient.vitals.length - 1] ?? {}) as Record<string, unknown>;
  return (patient.vitals ?? {}) as Record<string, unknown>;
}

function tempC(value: unknown): number | undefined {
  if (typeof value !== "number") return undefined;
  return value > 45 ? (value - 32) * 5 / 9 : value;
}

export function findClinicalContradictions(args: { stateText: string; patient?: Record<string, unknown>; orders?: Array<Record<string, unknown>>; layaHints?: ClinicalContradiction[] }): ClinicalContradiction[] {
  const out: ClinicalContradiction[] = [];
  const text = args.stateText.toLowerCase();
  const patient = args.patient ?? {};
  const vitals = latestVitals(patient);
  const t = tempC(vitals.tempF ?? vitals.temp);
  if (/denies fever|no fever|afebrile/.test(text) && typeof t === "number" && t >= 38) {
    out.push({ text: `History says no fever, but temperature is ${t.toFixed(1)} C.`, source: "rules", band: "high" });
  }
  const meds = strings(patient.activeMeds).concat(strings(patient.activeMedications), (args.orders ?? []).filter((o) => o.category === "pharmacy").map((o) => String(o.item ?? "")));
  if (/no meds|no active meds|no medication/.test(text) && meds.length > 0) {
    out.push({ text: "History says no active medications, but active medication entries are present.", source: "rules", band: "mid" });
  }
  if (/pregnancy\s*(?:no|negative)|not pregnant/.test(text) && /\bhcg\b.{0,40}(positive|reactive)/i.test(text)) {
    out.push({ text: "Pregnancy history is negative, but hCG appears positive.", source: "rules", band: "high" });
  }
  const allergies = strings(patient.allergies);
  for (const drug of meds) {
    const findings = checkMedication({ drug, dose: "" }, { patientId: String(patient.uhid ?? patient.id ?? "unknown"), allergies, currentMedications: meds.filter((m) => m !== drug) });
    if (findings.some((f) => f.severity === "red" || f.ruleId.includes("allergy"))) {
      out.push({ text: `Allergy conflict: ${drug} conflicts with recorded allergy.`, source: "rules", band: "high" });
    }
  }
  for (const hint of args.layaHints ?? []) out.push(hint);
  return out;
}
