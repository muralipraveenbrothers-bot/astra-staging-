import type { FabricDecisionResult } from "../decisionFabric";
import type { ScientistAnalysis, DdxMatrixRow, InvestigationPlanItem } from "../../clinical/scientistAgent";
import type { ClinicalBoardItem, DdxGraphNode, HypothesisBoard } from "./types";

const MUST_NOT_MISS: Record<string, { label: string; danger: string; expected: string[]; tests: string[] }> = {
  acs: { label: "ACS", danger: "myocardial infarction, arrhythmia or shock if missed", expected: ["chest pain", "radiation", "diaphoresis"], tests: ["ECG", "troponin"] },
  pe: { label: "PE", danger: "obstructive shock or sudden deterioration if missed", expected: ["SpO2", "HR", "pleuritic pain"], tests: ["D-dimer/Wells", "CTPA if indicated"] },
  aortic_dissection: { label: "Aortic dissection", danger: "rupture or malperfusion if missed", expected: ["tearing pain", "pulse/BP differential"], tests: ["CTA aorta"] },
  sepsis: { label: "Sepsis", danger: "shock and organ failure if missed", expected: ["temp", "HR", "BP"], tests: ["lactate", "blood culture"] },
  meningitis: { label: "Meningitis", danger: "CNS injury or septic shock if missed", expected: ["fever", "neck stiffness", "mental status"], tests: ["CSF after doctor assessment"] },
  stroke_tia: { label: "Stroke/TIA", danger: "lost treatment window if missed", expected: ["focal deficit", "time last known well"], tests: ["CT brain"] },
  ectopic_pregnancy: { label: "Ectopic pregnancy", danger: "rupture and haemorrhage if missed", expected: ["pregnancy status", "abdominal pain"], tests: ["hCG", "pelvic USG"] },
  dka: { label: "DKA", danger: "acidosis, cerebral oedema or shock if missed", expected: ["glucose", "ketones", "K"], tests: ["glucose", "VBG/ABG"] },
  gi_bleed: { label: "GI bleed", danger: "haemorrhagic shock if missed", expected: ["melena", "Hb", "BP"], tests: ["CBC", "stool/endo plan"] },
  surgical_abdomen: { label: "Surgical abdomen", danger: "perforation, ischaemia or sepsis if missed", expected: ["guarding", "rebound", "vomiting"], tests: ["focused exam", "imaging"] },
};

function band(result: FabricDecisionResult): "high" | "mid" | "low" {
  if (result.confidence >= 0.85) return "high";
  if (result.confidence >= 0.65) return "mid";
  return "low";
}

function score(result: FabricDecisionResult): number {
  const n = Number(result.answer);
  return Number.isFinite(n) ? n : result.confidence * 5;
}

function containsAny(text: string, terms: string[]): boolean {
  return terms.some((term) => new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text));
}

function ddxHas(scientist: ScientistAnalysis, label: string): boolean {
  return scientist.ddxMatrix.some((row) => row.diagnosis.toLowerCase().includes(label.toLowerCase())) ||
    scientist.hypotheses.some((h) => h.diagnosis.toLowerCase().includes(label.toLowerCase()));
}

function nextStep(row: DdxMatrixRow, plan: InvestigationPlanItem[], spec?: { tests: string[] }): string {
  const planned = plan.find((item) => item.movesDdxRowId === row.id)?.name;
  return planned ?? row.nextTestThatSettlesIt ?? spec?.tests[0] ?? "doctor review";
}

export function buildHypothesisBoard(args: { scientist: ScientistAnalysis; decisions: FabricDecisionResult[]; level0RedFlags: string[]; stateText: string; deterministicContradictions?: string[] }): HypothesisBoard {
  const items: ClinicalBoardItem[] = [];
  for (const flag of args.level0RedFlags) items.push({ kind: "red_flag", text: flag, source: "level0", band: "high" });
  for (const text of args.deterministicContradictions ?? []) items.push({ kind: "contradiction", text, source: "rules", band: "high" });

  for (const result of args.decisions) {
    const decisionId = result.trace.decisionId;
    if (result.schemaId.startsWith("clinical.must_not_miss.") && !result.abstained && score(result) >= 4) {
      const key = result.schemaId.replace("clinical.must_not_miss.", "");
      const spec = MUST_NOT_MISS[key];
      if (spec && !ddxHas(args.scientist, spec.label)) items.push({ kind: "consider", text: `Consider explicitly ruling out ${spec.label}.`, source: "laya", band: band(result), schemaId: result.schemaId, decisionId });
    }
    if (result.schemaId.startsWith("clinical.missing.") && !["none", "unknown", "human_review"].includes(result.answer)) {
      items.push({ kind: "missing_info", text: result.answer.replace(/_/g, " "), source: "laya", band: band(result), schemaId: result.schemaId, decisionId });
    }
    if (result.schemaId === "clinical.explain_all_findings" && (result.answer === "partially" || result.answer === "no")) {
      items.push({ kind: "missing_info", text: "Some findings are not explained by the current hypotheses.", source: "laya", band: band(result), schemaId: result.schemaId, decisionId });
    }
    if (result.schemaId === "clinical.contradiction.present" && result.answer === "yes") {
      items.push({ kind: "contradiction", text: "Laya-assist found a possible contradiction for doctor review.", source: "laya", band: band(result), schemaId: result.schemaId, decisionId });
    }
    if (result.schemaId === "clinical.escalate.now" && !result.abstained && score(result) >= 4) {
      items.push({ kind: "escalate", text: "Alert a senior doctor now.", source: "laya", band: band(result), schemaId: result.schemaId, decisionId });
    }
    if (result.schemaId.startsWith("clinical.blind_spot.") && result.answer === "yes") {
      items.push({ kind: "blind_spot", text: result.schemaId.replace("clinical.blind_spot.", "").replace(/_/g, " "), source: "laya", band: band(result), schemaId: result.schemaId, decisionId });
    }
    if (result.schemaId === "clinical.treatment.response" && result.answer === "not_as_expected") {
      items.push({ kind: "blind_spot", text: "Treatment response not as expected: reconsider diagnosis, dose, complication or adherence.", source: "laya", band: band(result), schemaId: result.schemaId, decisionId });
    }
  }

  const state = args.stateText;
  const ddxGraph: DdxGraphNode[] = args.scientist.ddxMatrix.map((row) => {
    const key = Object.keys(MUST_NOT_MISS).find((k) => row.diagnosis.toLowerCase().includes(MUST_NOT_MISS[k].label.toLowerCase()));
    const spec = key ? MUST_NOT_MISS[key] : undefined;
    const expectedButMissing = spec ? [...spec.expected, ...spec.tests].filter((term) => !containsAny(state, [term])) : [];
    if (/chest pain/i.test(state) && !/\becg\b/i.test(state) && /acs|coronary|chest|mi/i.test(row.diagnosis)) expectedButMissing.unshift("ECG");
    return {
      id: row.id,
      diagnosis: row.diagnosis,
      supporting: row.supports,
      against: row.againstOrMissing,
      unexplainedFindings: args.scientist.unexplainedFindings,
      expectedButMissing: [...new Set(expectedButMissing)],
      dangerIfMissed: spec?.danger ?? (row.pinnedRedFlag ? "dangerous if missed; doctor must review" : "not marked as must-not-miss by deterministic table"),
      nextDiscriminatingStep: nextStep(row, args.scientist.investigationPlanner, spec),
      scientistRow: row,
    };
  });

  return { items, ddxGraph };
}

export const MUST_NOT_MISS_TABLE = MUST_NOT_MISS;
