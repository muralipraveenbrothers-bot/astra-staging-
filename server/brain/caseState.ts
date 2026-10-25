/**
 * Shared Astra case state. LangGraph owns this document.
 * Hermes and Laya read it; they do not keep a second copy of the workflow.
 */
import fs from "fs";
import path from "path";
import { astraDataRoot } from "../services/env";

export const CASE_GRAPH_VERSION = "clinical-case-v1";

export const CASE_NODES = [
  "CASE_OPEN",
  "PATIENT_IDENTITY",
  "PRESENTATION",
  "EXISTING_RECORDS",
  "RED_FLAGS",
  "CLINICAL_REASONING",
  "INVESTIGATION_INTERPRETATION",
  "DIFFERENTIAL",
  "MANAGEMENT",
  "DOCTOR_REVIEW",
  "ORDERS_DOCUMENTATION",
  "FOLLOW_UP",
  "OUTCOME",
] as const;

export type CaseNode = (typeof CASE_NODES)[number];

export type ApprovalStatus = "none" | "pending" | "approved" | "rejected";

export interface CaseApproval {
  node: CaseNode | null;
  required: boolean;
  status: ApprovalStatus;
  decidedByRole: string | null;
}

export interface AstraCaseState {
  caseId: string;
  graphVersion: string;
  revision: number;
  presentation: string;
  role: string;
  stage: CaseNode;
  completed: CaseNode[];
  remaining: CaseNode[];
  parallelReady: CaseNode[];
  stoppedAt: CaseNode | null;
  stopReason: string | null;
  resumeFrom: CaseNode | null;
  approval: CaseApproval;
  redFlags: string[];
  missingInformation: string[];
  assignedSpecialists: string[];
  proposedOrders: string[];
  /** Astra does not execute orders from the graph. A doctor confirms them in the hospital workflow. */
  ordersExecuted: false;
  outcomeNote: string | null;
  materiallyChanged: boolean;
  /** Part 2. Workers write structured results. They do not place orders. */
  specialistResults?: Array<{ agent: string; conclusion: string; treatmentChanged: false }>;
  disagreementCards?: Array<{ agentA: string; agentB: string; wouldResolve: string }>;
  watcherLog?: Array<{ at: string; event: string; material: boolean; action: string }>;
  createdAt: string;
  updatedAt: string;
}

const memory = new Map<string, AstraCaseState>();
let rootOverride: string | null = null;

export function configureCaseStore(dir: string | null): void {
  rootOverride = dir;
  memory.clear();
}

export function caseStoreDir(): string {
  return rootOverride ?? path.join(astraDataRoot(), "brain", "cases");
}

function safeId(caseId: string): string {
  if (!/^CASE-[A-Za-z0-9-]+$/.test(caseId)) throw new Error("Invalid case id");
  return caseId;
}

function fileFor(caseId: string): string {
  return path.join(caseStoreDir(), `${safeId(caseId)}.json`);
}

function persist(state: AstraCaseState): AstraCaseState {
  memory.set(state.caseId, state);
  const dir = caseStoreDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fileFor(state.caseId), JSON.stringify(state), { mode: 0o600 });
  return state;
}

export function blankCase(presentation: string, role: string): AstraCaseState {
  const now = new Date().toISOString();
  const caseId = `CASE-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    caseId,
    graphVersion: CASE_GRAPH_VERSION,
    revision: 0,
    presentation,
    role,
    stage: "CASE_OPEN",
    completed: [],
    remaining: [...CASE_NODES],
    parallelReady: ["CASE_OPEN"],
    stoppedAt: null,
    stopReason: null,
    resumeFrom: "CASE_OPEN",
    approval: { node: null, required: false, status: "none", decidedByRole: null },
    redFlags: [],
    missingInformation: [],
    assignedSpecialists: [],
    proposedOrders: [],
    ordersExecuted: false,
    outcomeNote: null,
    materiallyChanged: false,
    createdAt: now,
    updatedAt: now,
  };
}

export function saveCase(state: AstraCaseState): AstraCaseState {
  state.updatedAt = new Date().toISOString();
  state.revision += 1;
  return persist(state);
}

export function getCase(caseId: string): AstraCaseState | null {
  const cached = memory.get(caseId);
  if (cached) return cached;
  try {
    const raw = fs.readFileSync(fileFor(caseId), "utf8");
    const parsed = JSON.parse(raw) as AstraCaseState;
    if (parsed.caseId !== caseId || parsed.graphVersion !== CASE_GRAPH_VERSION) return null;
    memory.set(caseId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function countStoredCases(): number {
  try {
    return fs.readdirSync(caseStoreDir()).filter((name) => name.endsWith(".json")).length;
  } catch {
    return memory.size;
  }
}

/** Resource governor uses this. It never deletes case files. */
export function clinicalCasesOnDisk(): number {
  return countStoredCases();
}
