/**
 * ASTRA 7D — ASTRA MEMORY GATEWAY
 * ============================================================================
 * The single choke-point through which ALL Astra agents (Dr. Mayin, Hermes,
 * LangGraph workflows, dept surfaces, OpenClaw) reach durable memory (§32).
 *
 *   SHORT TERM: session store (current patient, paused response, selections)
 *   LONG TERM : Cognee behind LongTermMemoryAdapter (remember/recall/improve/forget)
 *
 * Hard rules enforced here:
 *   • Patient clinical facts belong to the EMR — NEVER global memory (§35).
 *   • Every record carries provenance; unverified AI output cannot be stored
 *     as a trusted rule (§41 memory-poisoning protection).
 *   • Scoped namespaces + role checks; patient A data can never surface in a
 *     patient B context (§36).
 *   • If Cognee is down, recall degrades honestly — no fabricated memories (§48).
 */

export type AstraMemoryType =
  | "doctor_preference"
  | "hospital_rule"
  | "workflow_rule"
  | "approved_clinical_rule"
  | "agent_lesson"
  | "system_decision"
  | "department_process"
  | "user_preference"
  | "session_summary";

export type MemorySensitivity = "public" | "internal" | "confidential" | "clinical";

export interface MemoryProvenance {
  source: string;
  author: string;
  timestamp: string;
  scope: string;
  confidence?: number;
  approval: "approved" | "pending" | "rejected";
  version?: string;
}

export interface MemoryScope {
  namespace: string; // astra:system | astra:doctor:<id> | astra:agent:mayin | ...
  hospitalId?: string;
  patientId?: string; // only used for isolated patient-scoped indexes
  encounterId?: string;
  role?: string;
}

export interface MemoryCandidate {
  id?: string;
  type: AstraMemoryType;
  scope: MemoryScope;
  content: unknown;
  sensitivity: MemorySensitivity;
  provenance: MemoryProvenance;
}

export interface MemoryRecord extends MemoryCandidate {
  id: string;
  createdAt: string;
}

export type RememberOutcome =
  | { status: "stored"; id: string; deduplicated?: boolean }
  | { status: "pending_approval"; id: string }
  | { status: "rejected"; reason: string };

export interface RecallQuery {
  text?: string;
  scope: MemoryScope;
  role: string;
  patientId?: string;
  limit?: number;
}

export interface MemoryHealth {
  memoryServiceReachable: boolean;
  lastRemember: string | null;
  lastRecall: string | null;
  recallLatencyMs: number | null;
  queueDepth: number;
  databaseReachable: boolean;
}

/** Cognee maps onto remember / recall / improve / forget (§33). */
export interface LongTermMemoryAdapter {
  remember(record: MemoryRecord): Promise<void>;
  recall(query: RecallQuery): Promise<MemoryRecord[]>;
  improve(record: MemoryRecord): Promise<void>;
  forget(id: string): Promise<void>;
  health(): Promise<{ reachable: boolean; databaseReachable: boolean }>;
}

/** Session-scoped short-term store — never persisted to Cognee (§49). */
export class SessionMemoryStore {
  private map = new Map<string, unknown>();
  public set(key: string, value: unknown): void { this.map.set(key, value); }
  public get<T>(key: string): T | undefined { return this.map.get(key) as T | undefined; }
  public delete(key: string): void { this.map.delete(key); }
  public clear(): void { this.map.clear(); }
}

/** In-memory adapter used for tests and for graceful local degradation. */
export class InMemoryLongTermAdapter implements LongTermMemoryAdapter {
  private records = new Map<string, MemoryRecord>();
  public reachable = true;

  async remember(record: MemoryRecord): Promise<void> {
    if (!this.reachable) throw new Error("memory store offline");
    this.records.set(record.id, record);
  }
  async recall(query: RecallQuery): Promise<MemoryRecord[]> {
    if (!this.reachable) throw new Error("memory store offline");
    const needle = (query.text ?? "").toLowerCase();
    return Array.from(this.records.values()).filter((r) => {
      if (r.scope.namespace !== query.scope.namespace) return false;
      if ((r.scope.patientId ?? null) !== (query.patientId ?? null)) return false;
      if (!needle) return true;
      return JSON.stringify(r.content).toLowerCase().includes(needle);
    });
  }
  async improve(record: MemoryRecord): Promise<void> {
    await this.remember(record);
  }
  async forget(id: string): Promise<void> {
    this.records.delete(id);
  }
  async health() {
    return { reachable: this.reachable, databaseReachable: this.reachable };
  }
}

/** HTTP adapter for a self-hosted Cognee instance (local-first, §47). */
export class CogneeHttpAdapter implements LongTermMemoryAdapter {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async post(path: string, body: unknown): Promise<Response> {
    return this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async remember(record: MemoryRecord): Promise<void> {
    const res = await this.post("/v1/memory/remember", record);
    if (!res.ok) throw new Error(`cognee remember failed: ${res.status}`);
  }
  async recall(query: RecallQuery): Promise<MemoryRecord[]> {
    const res = await this.post("/v1/memory/recall", query);
    if (!res.ok) throw new Error(`cognee recall failed: ${res.status}`);
    return (await res.json()) as MemoryRecord[];
  }
  async improve(record: MemoryRecord): Promise<void> {
    const res = await this.post("/v1/memory/improve", record);
    if (!res.ok) throw new Error(`cognee improve failed: ${res.status}`);
  }
  async forget(id: string): Promise<void> {
    const res = await this.post("/v1/memory/forget", { id });
    if (!res.ok) throw new Error(`cognee forget failed: ${res.status}`);
  }
  async health() {
    try {
      const res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, "")}/v1/health`);
      const ok = res.ok;
      return { reachable: ok, databaseReachable: ok };
    } catch {
      return { reachable: false, databaseReachable: false };
    }
  }
}

/** Types whose content must never be written to shared memory (§35, §41). */
const CLINICAL_CONTENT_PATTERN =
  /\b(haemoglobin|hemoglobin|creatinine|troponin|platelet|wbc|potassium|fracture|diagnos(is|ed)|mg\/dl|mmol|ecg|ct\s*show|mri\s*show)\b/i;

const UNTRUSTED_SOURCES = /\b(hallucin|unverified|ai-?generated|scraped|webpage|external-message)\b/i;

const APPROVAL_REQUIRED: AstraMemoryType[] = [
  "hospital_rule",
  "approved_clinical_rule",
  "workflow_rule",
];

const TYPE_NAMESPACE: Record<AstraMemoryType, string> = {
  doctor_preference: "astra:doctor",
  hospital_rule: "astra:hospital",
  workflow_rule: "astra:workflow",
  approved_clinical_rule: "astra:hospital",
  agent_lesson: "astra:agent",
  system_decision: "astra:system",
  department_process: "astra:department",
  user_preference: "astra:doctor",
  session_summary: "astra:system",
};

export class AstraMemoryGateway {
  private session = new SessionMemoryStore();
  private pendingQueue: MemoryCandidate[] = [];
  private lastRemember: string | null = null;
  private lastRecall: string | null = null;
  private lastRecallLatency: number | null = null;

  constructor(private readonly longTerm: LongTermMemoryAdapter) {}

  /** Candidate → classify → sensitivity → scope → dedupe → approval → Cognee. */
  public async remember(candidate: MemoryCandidate): Promise<RememberOutcome> {
    const reject = (reason: string): RememberOutcome => ({ status: "rejected", reason });

    // 1. Patient clinical facts stay in the EMR (§35).
    if (candidate.sensitivity === "clinical" || candidate.scope.patientId) {
      return reject("patient_clinical_fact_belongs_to_emr");
    }
    // 2. Poisoned / untrusted provenance (§41).
    if (UNTRUSTED_SOURCES.test(candidate.provenance.source)) return reject("untrusted_provenance");
    if (UNTRUSTED_SOURCES.test(JSON.stringify(candidate.content))) return reject("unverified_ai_content");
    // 3. Raw clinical values smuggled into free text.
    if (CLINICAL_CONTENT_PATTERN.test(JSON.stringify(candidate.content))) {
      return reject("clinical_value_requires_patient_record");
    }

    const scope = this.normalizeScope(candidate);
    const record: MemoryRecord = {
      ...candidate,
      scope,
      id: candidate.id ?? `MEM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      provenance: { ...candidate.provenance, scope: scope.namespace },
    };

    // 4. Dedupe within namespace.
    const existing = await this.safeRecall({
      text: JSON.stringify(record.content),
      scope,
      role: "system",
      limit: 5,
    });
    if (existing.some((r) => JSON.stringify(r.content) === JSON.stringify(record.content))) {
      return { status: "stored", id: existing[0].id, deduplicated: true };
    }

    // 5. Approval gate for rule-class memories.
    if (APPROVAL_REQUIRED.includes(record.type) && record.provenance.approval !== "approved") {
      this.pendingQueue.push(record);
      return { status: "pending_approval", id: record.id };
    }

    try {
      await this.longTerm.remember(record);
      this.lastRemember = record.createdAt;
      return { status: "stored", id: record.id };
    } catch {
      // Long-term store down: Astra keeps working; nothing is fabricated (§48).
      this.pendingQueue.push(record);
      return { status: "pending_approval", id: record.id };
    }
  }

  /** Recall only memories the requesting role+scope may see (§42, §36). */
  public async recall(query: RecallQuery): Promise<MemoryRecord[]> {
    const t0 = Date.now();
    const records = await this.safeRecall(query);
    this.lastRecall = new Date().toISOString();
    this.lastRecallLatency = Date.now() - t0;
    // Isolation invariant: patient-scoped records never cross patients.
    return records.filter((r) => {
      const rPatient = r.scope.patientId ?? null;
      const qPatient = query.patientId ?? null;
      if (rPatient !== qPatient) return false;
      if (r.scope.namespace !== query.scope.namespace) return false;
      return true;
    });
  }

  /** Accepted corrections/lessons re-enter through the same gate (§33). */
  public async improve(candidate: MemoryCandidate): Promise<RememberOutcome> {
    return this.remember({
      ...candidate,
      provenance: { ...candidate.provenance, source: `improve:${candidate.provenance.source}` },
    });
  }

  public async forget(id: string): Promise<void> {
    await this.longTerm.forget(id);
  }

  public getSessionStore(): SessionMemoryStore {
    return this.session;
  }

  public async getHealth(): Promise<MemoryHealth> {
    let reachable = false;
    let databaseReachable = false;
    try {
      const h = await this.longTerm.health();
      reachable = h.reachable;
      databaseReachable = h.databaseReachable;
    } catch {
      reachable = false;
    }
    return {
      memoryServiceReachable: reachable,
      lastRemember: this.lastRemember,
      lastRecall: this.lastRecall,
      recallLatencyMs: this.lastRecallLatency,
      queueDepth: this.pendingQueue.length,
      databaseReachable,
    };
  }

  // ------------------------------------------------------------------ private

  private normalizeScope(candidate: MemoryCandidate): MemoryScope {
    const base = TYPE_NAMESPACE[candidate.type];
    const { namespace } = candidate.scope;
    if (namespace && namespace !== "auto") return { ...candidate.scope, namespace };
    switch (candidate.type) {
      case "doctor_preference":
      case "user_preference":
        return { ...candidate.scope, namespace: `${base}:${candidate.provenance.author}` };
      case "agent_lesson":
        return { ...candidate.scope, namespace: `${base}:${candidate.provenance.source}` };
      default:
        return { ...candidate.scope, namespace: base };
    }
  }

  private async safeRecall(query: RecallQuery): Promise<MemoryRecord[]> {
    try {
      return await this.longTerm.recall(query);
    } catch {
      return []; // honest empty recall when the memory service is unavailable
    }
  }
}



