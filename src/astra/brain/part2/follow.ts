/**
 * Documents, delta reasoning, the case watcher, temporary workers,
 * disagreement cards, and the doctor-facing section list.
 */
import { known, listOrUnknown, type VerifiedFacts } from "./facts";
import { isFractureRisk } from "./mechanism";

export const DOCUMENT_KINDS = [
  "op-note",
  "ip-note",
  "progress-note",
  "icu-note",
  "treatment-chart",
  "discharge",
  "referral",
  "certificate",
  "cmrf",
  "patient-instructions",
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export interface CaseDocument {
  kind: DocumentKind;
  status: "draft";
  inventedFacts: false;
  requiresClinicianReview: true;
  lines: string[];
}

export function draftCaseDocument(kind: DocumentKind, facts: VerifiedFacts): CaseDocument {
  const lines = [
    `Document: ${kind}`,
    `Presentation: ${known(facts.presentation)}`,
    `Age: ${known(facts.age)}`,
    `Sex: ${known(facts.sex)}`,
    `Recorded diagnosis: ${known(facts.recordedDiagnosis)}`,
    `Symptoms: ${listOrUnknown(facts.symptoms).join("; ")}`,
    `Signs: ${listOrUnknown(facts.signs).join("; ")}`,
    `Comorbidities: ${listOrUnknown(facts.comorbidities).join("; ")}`,
    `Medicines: ${listOrUnknown(facts.medications).join("; ")}`,
    `Allergies: ${listOrUnknown(facts.allergies).join("; ")}`,
    `Results: ${(facts.labs ?? []).map((lab) => `${lab.name} ${known(lab.value)}`).join("; ") || "unknown"}`,
    "Astra did not supply a fact that was missing from the verified case.",
  ];
  return { kind, status: "draft", inventedFacts: false, requiresClinicianReview: true, lines };
}

export interface Checkpoint {
  at: string;
  symptoms: string[];
  signs: string[];
  investigations: string[];
  labs: string[];
  medications: string[];
  procedures: string[];
  complications: string[];
  pending: string[];
}

export interface ChangeSet {
  newSymptom: string[];
  newSign: string[];
  newInvestigation: string[];
  newLabTrend: string[];
  medicationChange: string[];
  procedureChange: string[];
  newComplication: string[];
  improvement: string[];
  deterioration: string[];
  newPendingIssue: string[];
  compared: boolean;
}

function added(previous: string[], next: string[]): string[] {
  const old = new Set(previous.map((item) => item.toLowerCase()));
  return next.filter((item) => !old.has(item.toLowerCase()));
}

export function whatChanged(previous: Checkpoint | null, next: Checkpoint): ChangeSet {
  if (!previous) {
    return {
      newSymptom: [], newSign: [], newInvestigation: [], newLabTrend: [],
      medicationChange: [], procedureChange: [], newComplication: [],
      improvement: [], deterioration: [], newPendingIssue: [], compared: false,
    };
  }
  const newLabTrend = added(previous.labs, next.labs);
  const lastNumber = (rows: string[], name: string) => {
    const hits = rows
      .map((row) => new RegExp(`${name}[^\\d]*(\\d+(?:\\.\\d+)?)`, "i").exec(row)?.[1])
      .filter((value): value is string => Boolean(value))
      .map(Number);
    return hits.at(-1);
  };
  const rose = (name: string) => {
    const before = lastNumber(previous.labs, name);
    const after = lastNumber(next.labs, name);
    return before !== undefined && after !== undefined && after > before;
  };
  const deterioration = [
    ...(rose("creatinine") ? ["creatinine rose"] : []),
    ...(rose("potassium") ? ["potassium rose"] : []),
    ...newLabTrend.filter((item) => /rising|worse|deteriorat/i.test(item)),
  ];
  const improvement = next.symptoms.length < previous.symptoms.length ? ["A previously recorded symptom is no longer listed."] : [];
  return {
    newSymptom: added(previous.symptoms, next.symptoms),
    newSign: added(previous.signs, next.signs),
    newInvestigation: added(previous.investigations, next.investigations),
    newLabTrend,
    medicationChange: added(previous.medications, next.medications),
    procedureChange: added(previous.procedures, next.procedures),
    newComplication: added(previous.complications, next.complications),
    improvement,
    deterioration,
    newPendingIssue: added(previous.pending, next.pending),
    compared: true,
  };
}

const CREATININE_RERUN = ["investigation_interpreter", "drug_safety", "comorbidity_overlay", "management", "monitoring"];

export function nodesToRerun(change: string): string[] {
  if (/creatinine|egfr|urea/i.test(change)) return [...CREATININE_RERUN];
  if (/compartment|passive stretch|tens(e|ion)|paresthes|weakness of the|analgesic/i.test(change)) {
    return ["red_flag", "mechanism_graph", "deterioration_radar", "monitoring"];
  }
  if (/hemoglobin|platelet|\bcbc\b|potassium/i.test(change)) return ["investigation_interpreter", "comorbidity_overlay", "monitoring"];
  return ["investigation_interpreter"];
}

export interface WatchDecision {
  material: boolean;
  action: "record-only" | "update-and-rerun";
  rerun: string[];
  notifyClinician: boolean;
  generativeModelStarted: false;
}

export function watchCaseEvent(event: string, previousValue?: string): WatchDecision {
  const same = previousValue !== undefined && event.trim().toLowerCase() === previousValue.trim().toLowerCase();
  if (same || /unchanged|same result|no change/i.test(event)) {
    return { material: false, action: "record-only", rerun: [], notifyClinician: false, generativeModelStarted: false };
  }
  const rerun = nodesToRerun(event);
  const urgent = /compartment|passive stretch|potassium|hyperkal|anuria|pulseless/i.test(event);
  return {
    material: true,
    action: "update-and-rerun",
    rerun,
    notifyClinician: urgent,
    generativeModelStarted: false,
  };
}

export interface WorkerResult {
  agent: string;
  conclusion: string;
  supportingFacts: string[];
  treatmentChanged: false;
}

export function temporaryWorkers(text: string, facts: VerifiedFacts): WorkerResult[] {
  if (!isFractureRisk(text) && !/pain|fever|weakness/i.test(text)) return [];
  if (isFractureRisk(text)) {
    return [
      { agent: "Anatomical Localizer", conclusion: "The injury is inside a fascial compartment of the injured limb. The compartment level is unknown unless the note names it.", supportingFacts: [known(facts.presentation)], treatmentChanged: false },
      { agent: "Red Flag Agent", conclusion: "Compartment syndrome stays on the watch list. A present pulse does not remove it.", supportingFacts: ["Closed compartment", "Ischemia can precede loss of the pulse"], treatmentChanged: false },
      { agent: "Investigation Agent", conclusion: "Serial examination is the early signal. Blood tests describe later muscle and kidney injury.", supportingFacts: ["CK and creatinine do not exclude early compartment syndrome"], treatmentChanged: false },
      { agent: "Differential Agent", conclusion: "Compartment syndrome cannot safely be excluded from the story alone. No percentage is assigned.", supportingFacts: ["Fracture or crush with swelling"], treatmentChanged: false },
    ];
  }
  return [
    { agent: "Anatomical Localizer", conclusion: "The anatomical level is unknown from this text.", supportingFacts: [known(facts.presentation)], treatmentChanged: false },
    { agent: "Red Flag Agent", conclusion: "Red flags are only those written in the note.", supportingFacts: listOrUnknown(facts.signs), treatmentChanged: false },
    { agent: "Investigation Agent", conclusion: "Read tests that already exist before adding one.", supportingFacts: listOrUnknown(facts.investigations), treatmentChanged: false },
    { agent: "Differential Agent", conclusion: "Possibilities stay qualitative. The case is not diagnosed here.", supportingFacts: listOrUnknown(facts.symptoms), treatmentChanged: false },
  ];
}

export interface DisagreementCard {
  agentA: { name: string; conclusion: string; supportingFacts: string[] };
  agentB: { name: string; conclusion: string; supportingFacts: string[] };
  wouldResolve: string;
  scientistCalled: boolean;
  scientistReason: string;
}

export function disagreementCards(text: string, facts: VerifiedFacts): DisagreementCard[] {
  if (!isFractureRisk(text) || facts.pulsesPresent !== true) return [];
  return [{
    agentA: {
      name: "Pulse check",
      conclusion: "Distal pulses are present.",
      supportingFacts: ["The chart records pulses as present."],
    },
    agentB: {
      name: "Red Flag Agent",
      conclusion: "Present pulses do not exclude compartment syndrome.",
      supportingFacts: ["Capillary flow can fail while arterial pulses remain.", "Pain, stretch, tension, sensation, and power are the earlier signals."],
    },
    wouldResolve: "Serial neurovascular examination. If the exam is unreliable or equivocal, the clinician considers compartment pressure under the local orthopedic protocol.",
    scientistCalled: false,
    scientistReason: "This disagreement is settled by examination, not by a literature search.",
  }];
}

export interface ClinicalSection {
  index: number;
  title: string;
  body: string[];
}

export function clinicalSections(input: {
  text: string;
  facts: VerifiedFacts;
  redFlags: string[];
  possibilities: string[];
  why: string[];
  alternatives: string[];
  missing: string[];
  investigations: string[];
  extraTests: string[];
  mechanism: string[];
  medical: string[];
  surgical: string[];
  pkpd: string[];
  watch: string[];
  disposition: string[];
  cost: string[];
  uncertainty: string[];
  approvals: string[];
}): ClinicalSection[] {
  const candidates: ClinicalSection[] = [
    { index: 1, title: "Current clinical picture", body: [known(input.facts.presentation || input.text)] },
    { index: 2, title: "Immediate red flags", body: input.redFlags },
    { index: 3, title: "Most likely clinical possibilities", body: input.possibilities },
    { index: 4, title: "Why these are being considered", body: input.why },
    { index: 5, title: "Important alternatives", body: input.alternatives },
    { index: 6, title: "Questions and examination still required", body: input.missing },
    { index: 7, title: "Existing investigation interpretation", body: input.investigations },
    { index: 8, title: "Minimum useful additional investigations", body: input.extraTests },
    { index: 9, title: "Pathophysiology and mechanism", body: input.mechanism },
    { index: 10, title: "Medical management considerations", body: input.medical },
    { index: 11, title: "Surgical considerations", body: input.surgical },
    { index: 12, title: "Medication and PK-PD considerations", body: input.pkpd },
    { index: 13, title: "Complication watch", body: input.watch },
    { index: 14, title: "Disposition and monitoring", body: input.disposition },
    { index: 15, title: "Cost and resource optimization", body: input.cost },
    { index: 16, title: "What Astra is uncertain about", body: input.uncertainty },
    { index: 17, title: "Doctor actions and approvals pending", body: input.approvals },
  ];
  return candidates.filter((section) => section.body.some((line) => line && line !== "unknown" && line.trim().length > 0));
}
