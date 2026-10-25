import { runScientistAnalysis, type ScientistAnalysis } from "../../clinical/scientistAgent";
import { evaluateLevel0 } from "../level0";
import { modeFor } from "../confidencePolicy";
import { db } from "../../db";
import { buildClinicalState } from "./caseStateBuilder";
import { CLINICAL_SCHEMA_IDS, runClinicalQuestionBatch } from "./questionMatrix";
import { evaluateCompleteness } from "./completeness";
import { findClinicalContradictions } from "./contradictions";
import { buildHypothesisBoard } from "./hypothesisBoard";
import { toCauseFinder } from "./causeFinderView";
import type { ClinicalMeshInput, ClinicalMeshResult } from "./types";

function caseForScientist(patient: Record<string, unknown>, orders: Array<Record<string, unknown>>) {
  const latest = Array.isArray(patient.vitals) ? patient.vitals[patient.vitals.length - 1] : patient.vitals;
  const labs: Record<string, string> = {};
  for (const order of orders.filter((o) => o.category === "laboratory" && o.result)) labs[String(order.item ?? "result").slice(0, 40)] = String(order.result).slice(0, 160);
  return {
    complaint: String(patient.chiefComplaint ?? patient.chiefComplaints ?? patient.diagnosis ?? "unrecorded complaint"),
    history: String(patient.diagnosis ?? ""),
    vitals: latest && typeof latest === "object" ? latest as Record<string, string | number> : undefined,
    labs,
    meds: orders.filter((o) => o.category === "pharmacy").map((o) => String(o.item ?? "")).filter(Boolean),
    patient: { age: typeof patient.age === "number" ? patient.age : undefined, sex: String(patient.sex ?? patient.gender ?? "") },
  };
}

function redFlagItems(flags: string[]) {
  return flags.map((text) => ({ kind: "red_flag" as const, text, source: "level0" as const, band: "high" as const }));
}

export async function runClinicalMesh(input: ClinicalMeshInput): Promise<ClinicalMeshResult> {
  const started = Date.now();
  const state = buildClinicalState(input);
  const patient = (state.patient ?? {}) as Record<string, unknown>;
  const patientId = String(patient.uhid ?? patient.id ?? input.patientId ?? "");
  if (!patientId) throw new Error("patientId required");
  const orders = state.orders;
  const text = state.text;
  const level0 = evaluateLevel0({
    text,
    medication: { drug: orders.find((o) => o.category === "pharmacy")?.item ? String(orders.find((o) => o.category === "pharmacy")?.item) : "", allergies: Array.isArray(patient.allergies) ? patient.allergies.map(String) : [], patientId },
    criticalAlertUnacknowledged: orders.some((o) => o.isCritical === true),
  });
  const scientist: ScientistAnalysis = input.scientist ?? await runScientistAnalysis(caseForScientist(patient, orders));
  const decisions = input.layaDecisions ?? await runClinicalQuestionBatch(text);
  const contradictions = findClinicalContradictions({ stateText: text, patient, orders });
  const board = buildHypothesisBoard({
    scientist,
    decisions,
    level0RedFlags: [...level0.redFlags, ...level0.hardStops],
    stateText: text,
    deterministicContradictions: contradictions.map((c) => c.text),
  });
  return {
    redFlags: redFlagItems([...level0.redFlags, ...level0.hardStops]),
    board,
    completeness: evaluateCompleteness(text),
    contradictions,
    latencyMs: Date.now() - started,
    modes: Object.fromEntries(CLINICAL_SCHEMA_IDS.map((id) => [id, modeFor(id, "SHADOW")])),
    causeFinder: toCauseFinder(scientist),
  };
}

export function patientExists(patientId: string): boolean {
  return Boolean(db.getPatientById(patientId));
}
