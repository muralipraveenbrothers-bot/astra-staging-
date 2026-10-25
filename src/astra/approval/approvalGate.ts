/**
 * ASTRA AI — Doctor Approval Gate & Tamper-Evident AI Decision Log
 * ================================================================
 * Prime Directive: Make it structurally impossible for any Astra AI output
 * (clinical engine, co-pilot, scientist cause-finder, Dr. Mayin, brain flow)
 * to become a diagnosis, order or prescription without explicit doctor action.
 *
 * Architecture:
 *   1. Single Gate Module & ApprovalDecision type.
 *   2. Append-only, tamper-evident hash chain (SHA-256 links).
 *   3. Strict Server-Side order enforcement (unapproved AI orders fail closed).
 *   4. Memory Toggle (default OFF). Only "Approve + Learning" with toggle ON writes to memory.
 *   5. Patient-Facing Guard for patient/attender communication.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { storeMemory, type MemoryRecord } from "../brain/part5/memory";

export type ApprovalKind =
  | "diagnosis"
  | "investigation"
  | "medication"
  | "procedure"
  | "patient-message"
  | "other";

export type DoctorDecisionChoice =
  | "DISCUSS_ONLY"
  | "APPROVE_CASE_ONLY"
  | "APPROVE_LEARNING"
  | "REJECT_IGNORE";

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "DISCUSSED" | "CONSUMED" | "SIGNED";
export type ApprovalRiskTier = "STANDARD" | "HIGH" | "EMERGENCY";

export interface ApprovalDecision {
  decisionId: string;
  suggestionId: string;
  patientId: string; // UHID
  kind: ApprovalKind;
  payload: any; // snapshot of suggested test/drug/dx/procedure/message
  source: string; // e.g. "evidence-copilot", "clinical-engine", "scientist", "dr-mayin", "brain-flow"
  createdAt: string; // ISO
  status: ApprovalStatus;
  decision?: DoctorDecisionChoice;
  decidedBy?: string;
  decidedByRole?: string;
  decidedAt?: string;
  riskTier?: ApprovalRiskTier;
  orderFingerprint?: string;
  doctorSignature?: string;
  expiresAt?: string;
  consumedAt?: string;
  emergencyRecordId?: string;
  reason?: string;
  learningWritten?: boolean;
  previousHash: string;
  entryHash: string;
}

export const GENESIS_HASH = "0000000000000000000000000000000000000000000000000000000000000000";

let memoryToggleState = false; // Default OFF

const decisionStore: ApprovalDecision[] = [];

// Determine data directory
const DATA_DIR = path.join(process.cwd(), "data");
function logFile(): string {
  return process.env.ASTRA_DECISION_LOG_PATH
    ? path.resolve(process.env.ASTRA_DECISION_LOG_PATH)
    : path.join(DATA_DIR, "ai-decision-log.json");
}

/**
 * Deterministic hash calculation for tamper-evident chain verification.
 */
export function computeDecisionHash(
  previousHash: string,
  entry: Omit<ApprovalDecision, "entryHash" | "previousHash">
): string {
  const payloadStr = typeof entry.payload === "string" ? entry.payload : JSON.stringify(entry.payload);
  const data = [
    previousHash,
    entry.decisionId,
    entry.suggestionId,
    entry.patientId,
    entry.kind,
    payloadStr,
    entry.source,
    entry.createdAt,
    entry.status,
    entry.decision || "",
    entry.decidedBy || "",
    entry.decidedAt || "",
    entry.reason || "",
    entry.learningWritten ? "true" : "false",
  ].join("|");
  return crypto.createHash("sha256").update(data).digest("hex");
}

function persistStore(): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(logFile(), JSON.stringify(decisionStore, null, 2), "utf-8");
  } catch (err) {
    // Non-fatal if running in restricted environments
  }
}

function loadStore(): void {
  try {
    if (fs.existsSync(logFile())) {
      const raw = fs.readFileSync(logFile(), "utf-8");
      const parsed = JSON.parse(raw) as ApprovalDecision[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        decisionStore.length = 0;
        decisionStore.push(...parsed);
      }
    }
  } catch {
    // Start empty
  }
}

// Initial load
loadStore();

/**
 * Get memory toggle state (default OFF).
 */
export function isMemoryToggleOn(): boolean {
  return memoryToggleState;
}

/**
 * Set memory toggle state.
 */
export function setMemoryToggle(enabled: boolean): void {
  memoryToggleState = !!enabled;
}

/**
 * Record a new AI suggestion awaiting doctor approval.
 */
export function recordSuggestion(params: {
  suggestionId?: string;
  patientId: string;
  kind: ApprovalKind;
  payload: any;
  source: string;
}): ApprovalDecision {
  const suggestionId = params.suggestionId || `sug-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const decisionId = `dec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const createdAt = new Date().toISOString();

  const previousHash = decisionStore.length === 0 ? GENESIS_HASH : decisionStore[decisionStore.length - 1].entryHash;

  const baseEntry: Omit<ApprovalDecision, "entryHash" | "previousHash"> = {
    decisionId,
    suggestionId,
    patientId: params.patientId,
    kind: params.kind,
    payload: params.payload,
    source: params.source,
    createdAt,
    status: "PENDING",
    learningWritten: false,
  };

  const entryHash = computeDecisionHash(previousHash, baseEntry);
  const entry: ApprovalDecision = {
    ...baseEntry,
    previousHash,
    entryHash,
  };

  decisionStore.push(entry);
  persistStore();
  return entry;
}

/**
 * Doctor submits an explicit decision on an AI suggestion.
 */
export function decideApproval(params: {
  suggestionId: string;
  decision: DoctorDecisionChoice;
  doctorId: string;
  reason?: string;
  memoryToggleOverride?: boolean;
  decidedByRole?: string;
  riskTier?: ApprovalRiskTier;
  orderFingerprint?: string;
  expiresAt?: string;
  emergencyRecordId?: string;
}): ApprovalDecision {
  const existing = getDecision(params.suggestionId);
  if (!existing) {
    throw new Error(`UNKNOWN_SUGGESTION: Cannot approve unknown suggestion '${params.suggestionId}'.`);
  }
  const patientId = existing.patientId;
  const kind = existing.kind;
  const payload = existing.payload;
  const source = existing.source;

  const decisionId = `dec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const decidedAt = new Date().toISOString();

  let status: ApprovalStatus = "PENDING";
  if (params.decision === "APPROVE_CASE_ONLY" || params.decision === "APPROVE_LEARNING") {
    status = "APPROVED";
  } else if (params.decision === "REJECT_IGNORE") {
    status = "REJECTED";
  } else if (params.decision === "DISCUSS_ONLY") {
    status = "DISCUSSED";
  }

  // Memory writing logic: ONLY "APPROVE_LEARNING" AND Memory Toggle is ON!
  const memoryActive = params.memoryToggleOverride !== undefined ? params.memoryToggleOverride : memoryToggleState;
  let learningWritten = false;

  if (params.decision === "APPROVE_LEARNING" && memoryActive) {
    const memoryRes = storeMemory({
      source_id: params.suggestionId,
      source_type: "CLINICIAN ASSESSMENT",
      patient_id: patientId,
      encounter_id: null,
      user_id: params.doctorId,
      agent_id: source,
      run_id: null,
      department: null,
      memory_class: "procedural_learning",
      verification_state: "verified",
      sensitivity: "INTERNAL",
      workflow_version: "r5-01",
      text: `Approved clinical learning for ${kind}: ${typeof payload === "string" ? payload : JSON.stringify(payload)}${params.reason ? ` | Note: ${params.reason}` : ""}`,
      scope: "patient",
      expires_at: null,
    });
    learningWritten = memoryRes.ok;
  }

  const previousHash = decisionStore.length === 0 ? GENESIS_HASH : decisionStore[decisionStore.length - 1].entryHash;

  const baseEntry: Omit<ApprovalDecision, "entryHash" | "previousHash"> = {
    decisionId,
    suggestionId: params.suggestionId,
    patientId,
    kind,
    payload,
    source,
    createdAt: existing?.createdAt || decidedAt,
    status,
    decision: params.decision,
    decidedBy: params.doctorId,
    decidedByRole: params.decidedByRole,
    decidedAt,
    riskTier: params.riskTier,
    orderFingerprint: params.orderFingerprint,
    expiresAt: params.expiresAt,
    emergencyRecordId: params.emergencyRecordId,
    reason: params.reason,
    learningWritten,
  };

  const entryHash = computeDecisionHash(previousHash, baseEntry);
  const entry: ApprovalDecision = {
    ...baseEntry,
    previousHash,
    entryHash,
  };

  decisionStore.push(entry);
  persistStore();
  return entry;
}

/**
 * Retrieve the latest decision record for a suggestion or decision ID.
 */
export function getDecision(id: string): ApprovalDecision | undefined {
  for (let i = decisionStore.length - 1; i >= 0; i--) {
    if (decisionStore[i].suggestionId === id || decisionStore[i].decisionId === id) {
      return decisionStore[i];
    }
  }
  return undefined;
}

/**
 * Resolve the approved decision record and report whether a later append-only
 * CONSUMED record references it. This deliberately does not mutate the log.
 */
export function getApprovedDecisionState(id: string): {
  approved?: ApprovalDecision;
  consumed: boolean;
  consumedRecord?: ApprovalDecision;
  signedRecord?: ApprovalDecision;
} {
  const matching = decisionStore.filter(
    (entry) => entry.decisionId === id || entry.suggestionId === id || entry.payload?.approvedDecisionId === id,
  );
  const approvedEntries = matching.map((entry, index) => ({ entry, index })).filter(
    (wrapped) => wrapped.entry.status === "APPROVED",
  );
  const approvedIndex = approvedEntries[0];
  const latestApprovedIndex = approvedEntries[approvedEntries.length - 1];
  const approved = approvedIndex?.entry;
  const signedRecord = approved && [...matching].reverse().find(
    (entry) => entry.status === "SIGNED" && entry.payload?.approvedDecisionId === approved.decisionId,
  );
  const consumedRecord = latestApprovedIndex && [...matching].reverse().find(
    (entry, reverseIndex) => {
      const index = matching.length - reverseIndex - 1;
      return index > latestApprovedIndex.index && entry.status === "CONSUMED";
    },
  );
  return { approved, consumed: Boolean(consumedRecord), consumedRecord, signedRecord };
}

export function appendApprovalRecord(
  base: Omit<ApprovalDecision, "previousHash" | "entryHash">,
): ApprovalDecision {
  const previousHash = decisionStore.length === 0 ? GENESIS_HASH : decisionStore[decisionStore.length - 1].entryHash;
  const entryHash = computeDecisionHash(previousHash, base);
  const entry: ApprovalDecision = { ...base, previousHash, entryHash };
  decisionStore.push(entry);
  persistStore();
  return entry;
}

export function appendSignedApprovalRecord(
  approved: ApprovalDecision,
  sign: (record: ApprovalDecision) => string,
): ApprovalDecision {
  const previousHash = decisionStore.length === 0 ? GENESIS_HASH : decisionStore[decisionStore.length - 1].entryHash;
  const base = {
    ...approved,
    decisionId: `signed-${approved.decisionId}-${Date.now()}`,
    status: "SIGNED" as const,
    payload: { approvedDecisionId: approved.decisionId, referencedEntryHash: approved.entryHash },
    previousHash,
  };
  const entryHash = computeDecisionHash(previousHash, base);
  const provisional: ApprovalDecision = { ...base, entryHash, doctorSignature: "" };
  const entry: ApprovalDecision = { ...provisional, doctorSignature: sign(provisional) };
  decisionStore.push(entry);
  persistStore();
  return entry;
}

/**
 * Server-side order gate: resolve a decision ID, then require the latest entry
 * for that suggestion to still be approved. A later reject/discuss revokes it.
 */
export function isApprovedForOrder(
  approvalDecisionId: string,
  patientId?: string
): { approved: boolean; status: ApprovalStatus | "NOT_FOUND" | "PATIENT_MISMATCH"; decision?: ApprovalDecision } {
  const decision = getDecision(approvalDecisionId);
  if (!decision) {
    return { approved: false, status: "NOT_FOUND" };
  }

  const latest = getDecision(decision.suggestionId);
  if (!latest) {
    return { approved: false, status: "NOT_FOUND" };
  }

  if (patientId && latest.patientId !== patientId) {
    return { approved: false, status: "PATIENT_MISMATCH", decision: latest };
  }

  return { approved: latest.status === "APPROVED", status: latest.status, decision: latest };
}

/**
 * Retrieve all decision records for a specific patient.
 */
export function getDecisionsForPatient(patientId: string): ApprovalDecision[] {
  return decisionStore.filter((d) => d.patientId === patientId);
}

/**
 * Retrieve full decision log.
 */
export function getAllDecisions(): ApprovalDecision[] {
  return [...decisionStore];
}

/**
 * Verify cryptographic integrity of the hash chain.
 * Returns valid: false and brokenIndex if any past entry has been tampered with.
 */
export function verifyHashChain(entries: ApprovalDecision[] = decisionStore): {
  valid: boolean;
  brokenIndex?: number;
  error?: string;
} {
  let prevHash = GENESIS_HASH;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.previousHash !== prevHash) {
      return {
        valid: false,
        brokenIndex: i,
        error: `Broken hash link at index ${i}: previousHash '${entry.previousHash}' does not match expected '${prevHash}'`,
      };
    }
    const expectedHash = computeDecisionHash(prevHash, entry);
    if (entry.entryHash !== expectedHash) {
      return {
        valid: false,
        brokenIndex: i,
        error: `Tampered log entry at index ${i}: expected entryHash '${expectedHash}', found '${entry.entryHash}'`,
      };
    }
    prevHash = entry.entryHash;
  }
  return { valid: true };
}

/**
 * Patient-Facing Guard:
 * No AI-generated clinical text may be sent to a patient or attender (voice, print, WhatsApp)
 * unless it is linked to an approved decision of kind "patient-message".
 */
export function verifyPatientMessageGuard(params: {
  isAiGenerated?: boolean;
  approvalDecisionId?: string;
  recipientType?: "patient" | "attender" | "internal" | string;
}): { allowed: boolean; reason?: string; decision?: ApprovalDecision } {
  const isTargetPatientOrAttender =
    params.recipientType === "patient" || params.recipientType === "attender";

  // If not AI generated and not explicitly targeting patient with AI content, allow
  if (!params.isAiGenerated && !isTargetPatientOrAttender) {
    return { allowed: true };
  }

  // If AI generated, must have approved decision of kind "patient-message"
  if (params.isAiGenerated) {
    if (!params.approvalDecisionId) {
      return {
        allowed: false,
        reason: "GUARD_BLOCKED: AI-generated clinical text cannot be sent to a patient or attender without an approved Doctor Approval Gate decision of kind 'patient-message'.",
      };
    }
    const dec = getDecision(params.approvalDecisionId);
    if (!dec) {
      return {
        allowed: false,
        reason: `GUARD_BLOCKED: Approval decision '${params.approvalDecisionId}' was not found in the decision log.`,
      };
    }
    if (dec.kind !== "patient-message") {
      return {
        allowed: false,
        reason: `GUARD_BLOCKED: Approval decision '${params.approvalDecisionId}' is of kind '${dec.kind}', but 'patient-message' is strictly required for patient-facing delivery.`,
      };
    }
    if (dec.status !== "APPROVED") {
      return {
        allowed: false,
        reason: `GUARD_BLOCKED: Approval decision '${params.approvalDecisionId}' is in status '${dec.status}'. Doctor approval is required before delivery.`,
      };
    }
    return { allowed: true, decision: dec };
  }

  return { allowed: true };
}

/**
 * Reset store for tests.
 */
export function _resetDecisionStoreForTest(): void {
  decisionStore.length = 0;
  memoryToggleState = false;
}
