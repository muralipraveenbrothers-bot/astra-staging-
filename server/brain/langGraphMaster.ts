/**
 * Versioned clinical case graph. LangGraph owns where the case is.
 * Approval nodes stop until a doctor decides. Resume does not skip them.
 */
import { canAuthorizeClinicalAction } from "../../src/astra/saarathi/command/clinicalAuthority";
import {
  blankCase,
  CASE_NODES,
  getCase,
  saveCase,
  type AstraCaseState,
  type CaseNode,
} from "./caseState";

const DEPS: Record<CaseNode, CaseNode[]> = {
  CASE_OPEN: [],
  PATIENT_IDENTITY: ["CASE_OPEN"],
  PRESENTATION: ["PATIENT_IDENTITY"],
  EXISTING_RECORDS: ["PATIENT_IDENTITY"],
  RED_FLAGS: ["PRESENTATION", "EXISTING_RECORDS"],
  CLINICAL_REASONING: ["RED_FLAGS"],
  INVESTIGATION_INTERPRETATION: ["CLINICAL_REASONING"],
  DIFFERENTIAL: ["INVESTIGATION_INTERPRETATION"],
  MANAGEMENT: ["DIFFERENTIAL"],
  DOCTOR_REVIEW: ["MANAGEMENT"],
  ORDERS_DOCUMENTATION: ["DOCTOR_REVIEW"],
  FOLLOW_UP: ["ORDERS_DOCUMENTATION"],
  OUTCOME: ["FOLLOW_UP"],
};

export const PARALLEL_GROUPS: CaseNode[][] = [["PRESENTATION", "EXISTING_RECORDS"]];

const APPROVAL_NODES = new Set<CaseNode>(["DOCTOR_REVIEW", "ORDERS_DOCUMENTATION"]);

export class GraphAuthorityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphAuthorityError";
  }
}

function remainingOf(completed: CaseNode[]): CaseNode[] {
  const done = new Set(completed);
  return CASE_NODES.filter((node) => !done.has(node));
}

function readyNodes(state: AstraCaseState): CaseNode[] {
  const done = new Set(state.completed);
  return CASE_NODES.filter((node) => !done.has(node) && DEPS[node].every((dep) => done.has(dep)));
}

function touch(state: AstraCaseState): AstraCaseState {
  state.remaining = remainingOf(state.completed);
  state.parallelReady = readyNodes(state);
  state.stage = state.stoppedAt ?? state.parallelReady[0] ?? state.completed[state.completed.length - 1] ?? "CASE_OPEN";
  state.resumeFrom = state.stoppedAt ?? state.parallelReady[0] ?? null;
  return saveCase(state);
}

export function openClinicalCase(presentation: string, role: string): AstraCaseState {
  return touch(blankCase(presentation, role));
}

export function advanceClinicalCase(caseId: string): AstraCaseState {
  const state = getCase(caseId);
  if (!state) throw new GraphAuthorityError("Case not found");
  if (state.approval.status === "pending") {
    state.stopReason = `Waiting for doctor approval at ${state.approval.node}.`;
    return touch(state);
  }
  if (state.approval.status === "rejected") {
    state.stopReason = "The doctor rejected the last clinical step. The graph did not skip ahead.";
    return touch(state);
  }
  const wave = readyNodes(state);
  if (wave.length === 0 || state.completed.includes("OUTCOME")) return touch(state);

  if (wave.every((node) => node === "OUTCOME")) {
    state.stoppedAt = "OUTCOME";
    state.stopReason = "The clinical outcome is not recorded yet.";
    return touch(state);
  }
  if (wave.every((node) => APPROVAL_NODES.has(node))) {
    const gate = wave[0]!;
    state.approval = { node: gate, required: true, status: "pending", decidedByRole: null };
    state.stoppedAt = gate;
    state.stopReason = `Human approval is required at ${gate}.`;
    return touch(state);
  }
  for (const node of wave) {
    if (APPROVAL_NODES.has(node) || node === "OUTCOME") continue;
    if (!state.completed.includes(node)) state.completed.push(node);
  }
  state.stoppedAt = null;
  state.stopReason = null;
  return touch(state);
}

export function approveClinicalCase(caseId: string, role: string, approved: boolean): AstraCaseState {
  if (!canAuthorizeClinicalAction(role)) {
    throw new GraphAuthorityError("Clinical approval belongs to the doctor.");
  }
  const state = getCase(caseId);
  if (!state) throw new GraphAuthorityError("Case not found");
  if ((state.approval.status !== "pending" && state.approval.status !== "rejected") || !state.approval.node) {
    throw new GraphAuthorityError("This case is not waiting for approval.");
  }
  state.approval.decidedByRole = role;
  if (!approved) {
    state.approval.status = "rejected";
    state.stopReason = `Doctor rejected ${state.approval.node}.`;
    state.stoppedAt = state.approval.node;
    return touch(state);
  }
  const node = state.approval.node;
  if (!state.completed.includes(node)) state.completed.push(node);
  state.approval = { node: null, required: false, status: "approved", decidedByRole: role };
  state.stoppedAt = null;
  state.stopReason = null;
  return touch(state);
}

export function recordOutcome(caseId: string, role: string, note: string): AstraCaseState {
  if (!canAuthorizeClinicalAction(role)) {
    throw new GraphAuthorityError("A doctor records the clinical outcome.");
  }
  const state = getCase(caseId);
  if (!state) throw new GraphAuthorityError("Case not found");
  if (!state.completed.includes("FOLLOW_UP")) {
    throw new GraphAuthorityError("Outcome waits until follow-up is reached.");
  }
  const text = (note ?? "").trim();
  if (!text) throw new GraphAuthorityError("The outcome note is empty.");
  state.outcomeNote = text;
  if (!state.completed.includes("OUTCOME")) state.completed.push("OUTCOME");
  state.stoppedAt = null;
  state.stopReason = null;
  return touch(state);
}

export function attachAssignment(caseId: string, specialists: string[], redFlags: string[], missing: string[]): AstraCaseState | null {
  const state = getCase(caseId);
  if (!state) return null;
  state.assignedSpecialists = specialists;
  state.redFlags = redFlags;
  state.missingInformation = missing;
  state.materiallyChanged = redFlags.length > 0;
  return touch(state);
}
