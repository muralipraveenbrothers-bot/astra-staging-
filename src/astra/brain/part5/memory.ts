/**
 * Separate memory layers. Mem0 is optional and local.
 * It is not the hospital database, and a missing memory is not invented.
 */
import { isMicroCommand } from "./voice";

function scrub(text: string): string {
  return text.replace(/freellmapi-[A-Za-z0-9_-]+/gi, "[redacted]").replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted]");
}

export const MEMORY_LAYERS = ["M0", "M1", "M2", "M3", "M4", "M5", "M6", "M7", "M8"] as const;

export const MEMORY_CLASSES = [
  "user_preference", "patient_reported", "clinical_verified", "clinical_hypothesis", "doctor_assessment",
  "workflow_state", "hospital_policy", "procedural_learning", "technical_configuration", "operational_state",
  "evidence_reference", "case_outcome",
] as const;

export type MemoryClass = (typeof MEMORY_CLASSES)[number];
export type MemoryVerdict = "YES" | "NO" | "UNKNOWN" | "REQUIRES_HUMAN_REVIEW";

export interface MemoryRecord {
  memory_id: string;
  source_id: string;
  source_type: "VERIFIED FACT" | "PATIENT-REPORTED INFORMATION" | "CLINICIAN ASSESSMENT" | "AI INFERENCE" | "AI SUGGESTION" | "EVIDENCE" | "HOSPITAL POLICY" | "MEASURED RESULT";
  patient_id: string | null;
  encounter_id: string | null;
  user_id: string | null;
  agent_id: string | null;
  run_id: string | null;
  department: string | null;
  memory_class: MemoryClass;
  verification_state: "verified" | "unverified" | "superseded";
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  superseded_by: string | null;
  sensitivity: "PUBLIC" | "INTERNAL" | "PHI";
  workflow_version: string;
  text: string;
  /**
   * Spec scope names (working / encounter / patient / user / procedural /
   * organizational / evidence) plus the legacy aliases already persisted here
   * (workflow ≈ working, agent ≈ procedural, hospital ≈ organizational).
   */
  scope: "patient" | "user" | "agent" | "workflow" | "hospital" | "working" | "encounter" | "procedural" | "organizational" | "evidence";
}

const store: MemoryRecord[] = [];

export function resetMemoryStore(): void {
  store.length = 0;
}

export function memoryGate(text: string): { requires_memory_recall: MemoryVerdict; should_store_memory: MemoryVerdict; memory_class: MemoryClass; memory_duration: "none" | "encounter" | "temporary" | "durable"; memory_scope: MemoryRecord["scope"]; sensitivity: MemoryRecord["sensitivity"]; verification_state: MemoryRecord["verification_state"] } {
  if (isMicroCommand(text)) {
    return { requires_memory_recall: "NO", should_store_memory: "NO", memory_class: "operational_state", memory_duration: "none", memory_scope: "workflow", sensitivity: "INTERNAL", verification_state: "unverified" };
  }
  const clinical = /\b(patient|pain|creatinine|diagnosis)\b/i.test(text);
  return {
    requires_memory_recall: clinical ? "YES" : "UNKNOWN",
    should_store_memory: clinical ? "REQUIRES_HUMAN_REVIEW" : "NO",
    memory_class: clinical ? "clinical_hypothesis" : "operational_state",
    memory_duration: clinical ? "encounter" : "temporary",
    memory_scope: clinical ? "patient" : "workflow",
    sensitivity: clinical ? "PHI" : "INTERNAL",
    verification_state: "unverified",
  };
}

const SECRET = /password|api[_-]?key|refresh token|BEGIN PRIVATE KEY|freellmapi-/i;

export function storeMemory(input: Omit<MemoryRecord, "memory_id" | "created_at" | "updated_at" | "superseded_by" | "verification_state"> & { verification_state?: MemoryRecord["verification_state"] }): { ok: boolean; reason: string; record?: MemoryRecord } {
  if (SECRET.test(input.text)) return { ok: false, reason: "Secrets are not stored in memory." };
  if (input.sensitivity === "PHI" && input.scope === "patient" && !input.patient_id) return { ok: false, reason: "A patient memory needs an exact patient id." };
  if (input.source_type === "AI INFERENCE" && input.verification_state === "verified") return { ok: false, reason: "An AI inference does not become a verified fact." };
  const now = new Date().toISOString();
  const previous = store.find((item) => item.patient_id === input.patient_id && item.memory_class === input.memory_class && item.verification_state !== "superseded" && item.text !== input.text);
  const record: MemoryRecord = {
    ...input,
    memory_id: `mem-${store.length + 1}`,
    verification_state: input.verification_state ?? "unverified",
    created_at: now,
    updated_at: now,
    superseded_by: null,
  };
  if (previous && input.verification_state === "verified") {
    previous.verification_state = "superseded";
    previous.superseded_by = record.memory_id;
    previous.updated_at = now;
  }
  store.push(record);
  return { ok: true, reason: "Stored in its own class.", record };
}

export function recallPatient(patientId: string): MemoryRecord[] {
  return store.filter((item) => item.patient_id === patientId && item.verification_state !== "superseded" && !expired(item));
}

/** Read-only snapshot for the MemoryFabric and the memory audit route. */
export function listMemoryRecords(): MemoryRecord[] {
  return store.map((item) => ({ ...item }));
}

function expired(item: MemoryRecord): boolean {
  return Boolean(item.expires_at && Date.parse(item.expires_at) < Date.now());
}

export function rankForHermes(patientId: string, query: string): MemoryRecord[] {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
  return recallPatient(patientId)
    .map((item) => ({ item, score: (item.verification_state === "verified" ? 2 : 0) + words.filter((word) => item.text.toLowerCase().includes(word)).length }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((row) => row.item);
}

export interface DifferenceRow { field: string; previous: string; current: string }

export function differenceMatrix(previous: Record<string, string>, current: Record<string, string>): { rows: DifferenceRow[]; copiesTreatment: false } {
  const fields = ["age", "sex", "comorbidities", "renal function", "hepatic function", "medications", "allergies", "severity", "investigations", "procedure", "response", "complications"];
  return {
    rows: fields.map((field) => ({ field, previous: previous[field] || "unknown", current: current[field] || "unknown" })),
    copiesTreatment: false,
  };
}

export function mem0Status(): { state: "DEGRADED"; fabricated: false; hospitalDatabase: "operational"; langGraph: "operational"; hermesBuiltinMemory: "operational"; vectorStore: "unchanged" } {
  return { state: "DEGRADED", fabricated: false, hospitalDatabase: "operational", langGraph: "operational", hermesBuiltinMemory: "operational", vectorStore: "unchanged" };
}

export function memoryMode(constrained: boolean, simpleCommand: boolean): "MEMORY_FAST" | "MEMORY_NORMAL" | "MEMORY_PAUSED" {
  if (constrained) return "MEMORY_PAUSED";
  if (simpleCommand) return "MEMORY_FAST";
  return "MEMORY_NORMAL";
}

export function whyRetrieved(record: MemoryRecord | null, query: string): { query: string; memory: string; scope: string; source: string; relevance: string; verification: string; timestamp: string } {
  if (!record) {
    return { query, memory: "none", scope: "none", source: "Mem0 is degraded. Nothing was invented.", relevance: "not measured", verification: "none", timestamp: "" };
  }
  return { query, memory: scrub(record.text), scope: record.scope, source: record.source_type, relevance: "identity match", verification: record.verification_state, timestamp: record.created_at };
}

export const RECALL_ORDER = [
  "exact patient identity",
  "structured Astra database",
  "patient timeline",
  "current LangGraph state",
  "Mem0 semantic recall",
  "source-document retrieval",
  "Context Compiler",
  "Hermes",
] as const;
