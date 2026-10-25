/**
 * MemoryFabric — the single seam every caller uses for memory.
 *
 * Mem0 / MemGraph / pgvector / Qdrant are not installed in this environment, so
 * the fabric is backed by the existing Part 5 classed store (`./memory`). The
 * point of the seam is that the clinical turn, Laya gates and the audit routes
 * talk to one interface: a semantic provider can be added later behind it
 * without changing a single call site — and it must never outrank the
 * structured Astra database.
 */
import {
  MEMORY_CLASSES,
  listMemoryRecords,
  mem0Status,
  memoryGate,
  rankForHermes,
  recallPatient,
  RECALL_ORDER,
  storeMemory,
  whyRetrieved,
  type MemoryClass,
  type MemoryRecord,
  type MemoryVerdict,
} from "./memory";

export const MEMORY_SCOPES = ["working", "encounter", "patient", "user", "procedural", "organizational", "evidence"] as const;
export type MemoryScope = (typeof MEMORY_SCOPES)[number];

export type MemoryDuration = "none" | "encounter" | "temporary" | "durable";

/** Legacy persisted scopes map onto the spec scopes without rewriting old rows. */
const SCOPE_ALIASES: Record<string, MemoryScope> = {
  workflow: "working",
  agent: "procedural",
  hospital: "organizational",
  session: "working",
  case: "encounter",
};

export function normalizeScope(scope?: string | null): MemoryScope {
  const value = (scope ?? "").trim().toLowerCase();
  if ((MEMORY_SCOPES as readonly string[]).includes(value)) return value as MemoryScope;
  return SCOPE_ALIASES[value] ?? "working";
}

/** Clinical classes may not be recalled without an exact patient identity. */
const CLINICAL_CLASSES: readonly MemoryClass[] = [
  "patient_reported", "clinical_verified", "clinical_hypothesis", "doctor_assessment", "case_outcome",
];

const DURATION_MS: Record<MemoryDuration, number> = {
  none: 0,
  temporary: 60 * 60 * 1000,
  encounter: 7 * 24 * 60 * 60 * 1000,
  durable: 0,
};

export interface MemoryGates {
  needsRecall: MemoryVerdict;
  shouldStore: MemoryVerdict;
  scope: MemoryScope;
  verificationState: MemoryRecord["verification_state"];
  expiry: { duration: MemoryDuration; expiresAt: string | null; source: "policy default" };
  memoryClass: MemoryClass;
  sensitivity: MemoryRecord["sensitivity"];
  explanation: string;
}

/**
 * Laya's memory gates in one object. The expiry is a declared policy default,
 * not a measured fact, so it says so in the payload.
 */
export function memoryGates(text: string, now: number = Date.now()): MemoryGates {
  const gate = memoryGate(text);
  const duration = gate.memory_duration;
  const expiresAt =
    duration === "none" || duration === "durable" ? null : new Date(now + DURATION_MS[duration]).toISOString();
  const scope = normalizeScope(gate.memory_scope);
  return {
    needsRecall: gate.requires_memory_recall,
    shouldStore: gate.should_store_memory,
    scope,
    verificationState: gate.verification_state,
    expiry: { duration, expiresAt, source: "policy default" },
    memoryClass: gate.memory_class,
    sensitivity: gate.sensitivity,
    explanation: `needsRecall=${gate.requires_memory_recall}; shouldStore=${gate.should_store_memory}; scope=${scope}; verification=${gate.verification_state}; expiry=${duration === "none" ? "none" : `policy ${duration}`}`,
  };
}

export interface MemoryRecallQuery {
  text: string;
  patientId?: string | null;
  scopes?: MemoryScope[];
  limit?: number;
}

export interface MemoryRecall {
  order: readonly string[];
  records: MemoryRecord[];
  counts: { structured: number; semantic: number };
  semanticUsed: false;
  structuredOutranksSemantic: true;
  exactPatientScope: boolean;
  blocked: string | null;
  explanation: string;
}

export type MemoryStoreInput = Parameters<typeof storeMemory>[0];

export interface MemoryFabricStoreResult {
  ok: boolean;
  reason: string;
  memory_id: string | null;
  scope: MemoryScope;
  verificationState: MemoryRecord["verification_state"] | null;
}

export interface MemoryFabricStatus {
  fabric: "part5-classed";
  semanticProvider: "none";
  providers: { mem0: "degraded"; memgraph: "not installed"; pgvector: "not installed"; qdrant: "not installed" };
  scopes: readonly MemoryScope[];
  classes: readonly MemoryClass[];
  clinicalScopeRule: string;
  gateSource: "Laya memory gates";
  counts: { total: number; byScope: Record<string, number> };
  mem0: ReturnType<typeof mem0Status>;
}

function live(record: MemoryRecord): boolean {
  if (record.verification_state === "superseded") return false;
  return !(record.expires_at && Date.parse(record.expires_at) < Date.now());
}

function isClinical(record: MemoryRecord): boolean {
  return CLINICAL_CLASSES.includes(record.memory_class) || normalizeScope(record.scope) === "patient";
}

function specific(source: MemoryRecord[], exclude: MemoryRecord[]): MemoryRecord[] {
  return source.filter((record) => !exclude.some((row) => row.memory_id === record.memory_id));
}

function recall(query: MemoryRecallQuery): MemoryRecall {
  const gates = memoryGates(query.text);
  const patientId = (query.patientId ?? "").trim();
  const scopes = (query.scopes && query.scopes.length > 0 ? query.scopes : MEMORY_SCOPES).map(normalizeScope);
  const limit = Math.max(1, Math.min(query.limit ?? 5, 20));
  const base = {
    order: RECALL_ORDER,
    counts: { structured: 0, semantic: 0 },
    semanticUsed: false,
    structuredOutranksSemantic: true,
  } as const;

  if (gates.needsRecall === "YES" && !patientId) {
    return {
      ...base,
      records: [],
      exactPatientScope: false,
      blocked: "Exact patient identity is required before any clinical recall.",
      explanation: `Recall refused (${gates.explanation}); the request carried no patient id, so nothing was read.`,
    };
  }

  const nonPatient = listMemoryRecords().filter(
    (record) => !isClinical(record) && scopes.includes(normalizeScope(record.scope)) && live(record),
  );

  if (!patientId) {
    const records = nonPatient.slice(0, limit);
    return {
      ...base,
      records,
      counts: { structured: records.length, semantic: 0 },
      exactPatientScope: false,
      blocked: null,
      explanation: `Non-clinical scopes only (${scopes.join(", ")}); no patient id was needed and none was invented.`,
    };
  }

  const patientRecords = recallPatient(patientId);
  const ranked = rankForHermes(patientId, query.text);
  const records = [...ranked, ...specific(patientRecords, ranked), ...specific(nonPatient, patientRecords)].slice(0, limit);

  return {
    ...base,
    records,
    counts: { structured: patientRecords.length, semantic: 0 },
    exactPatientScope: true,
    blocked: null,
    explanation:
      `Structured Astra database first for the exact patient id: ${ranked.length} of ${patientRecords.length} live record(s) ` +
      `matched, plus ${records.length - ranked.length > 0 ? records.length - ranked.length : 0} non-clinical record(s). ` +
      "No semantic provider was consulted.",
  };
}

function status(): MemoryFabricStatus {
  const rows = listMemoryRecords();
  const byScope: Record<string, number> = {};
  for (const scope of MEMORY_SCOPES) byScope[scope] = 0;
  for (const row of rows) {
    const scope = normalizeScope(row.scope);
    byScope[scope] = (byScope[scope] ?? 0) + 1;
  }
  return {
    fabric: "part5-classed",
    semanticProvider: "none",
    providers: { mem0: "degraded", memgraph: "not installed", pgvector: "not installed", qdrant: "not installed" },
    scopes: MEMORY_SCOPES,
    classes: MEMORY_CLASSES,
    clinicalScopeRule: "A clinical memory is only recalled with an exact patient id; voice never widens scope.",
    gateSource: "Laya memory gates",
    counts: { total: rows.length, byScope },
    mem0: mem0Status(),
  };
}

/** The one fabric the app wires to. Swap the implementation here, not at call sites. */
export const classedMemoryFabric: MemoryFabric = {
  id: "part5-classed",
  gates: memoryGates,
  recall,
  store(input: MemoryStoreInput): MemoryFabricStoreResult {
    const scope = normalizeScope(input.scope);
    const result = storeMemory({ ...input, scope });
    return {
      ok: result.ok,
      reason: result.reason,
      memory_id: result.record?.memory_id ?? null,
      scope,
      verificationState: result.record?.verification_state ?? null,
    };
  },
  why: whyRetrieved,
  status,
};

/** Alias so call sites can name the seam rather than the current backend. */
export const memoryFabric: MemoryFabric = classedMemoryFabric;

/**
 * Recall rendered for a model prompt: labelled, non-authoritative, and empty
 * when nothing was recalled (an empty memory is not filled with guesses).
 */
export function renderRecallForPrompt(result: MemoryRecall): string {
  if (result.records.length === 0) {
    return result.blocked ? `Memory: nothing recalled — ${result.blocked}` : "Memory: nothing recalled.";
  }
  const scopeLabel = result.exactPatientScope ? "exact patient scope" : "non-patient scope";
  return [
    `Memory (${scopeLabel}, structured Astra database first, non-authoritative):`,
    ...result.records.map(
      (record) => `- [${record.memory_class} / ${record.verification_state} / ${record.source_type}] ${record.text}`,
    ),
  ].join("\n");
}


export interface MemoryFabric {
  id: "part5-classed";
  gates(text: string): MemoryGates;
  recall(query: MemoryRecallQuery): MemoryRecall;
  store(input: MemoryStoreInput): MemoryFabricStoreResult;
  why(record: MemoryRecord | null, query: string): ReturnType<typeof whyRetrieved>;
  status(): MemoryFabricStatus;
}
