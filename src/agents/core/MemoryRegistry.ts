/**
 * ASTRA AI — MEMORY REGISTRY & GOVERNOR (1.5)
 * ============================================================================
 * 5-Tier Memory Architecture:
 * 1. WORKING MEMORY: Current task, active patient, active conversation turns (Session)
 * 2. EPISODIC MEMORY: Past agent execution traces, workflows, corrections (Vector + Time-series)
 * 3. SEMANTIC MEMORY: Stable clinical rules, learned skills, protocols, medical ontology
 * 4. PATIENT MEMORY: Authorized, encrypted, scope-limited, immutable audit
 * 5. DOCTOR MEMORY: Personal preferences, approved corrections, session summaries
 *
 * Write Policy:
 * Classify every memory as SESSION_ONLY | WORKING | EPISODIC | SEMANTIC | CLINICAL_RECORD
 * Never auto-convert unstructured chat to clinical record.
 */

export type MemoryCategory =
  | "SESSION_ONLY"
  | "WORKING"
  | "EPISODIC"
  | "SEMANTIC"
  | "CLINICAL_RECORD";

export interface MemoryRecord {
  id: string;
  category: MemoryCategory;
  scopeId: string; // userId, patientId, or "GLOBAL"
  key: string;
  content: any;
  ttlSeconds?: number;
  createdAt: string;
  updatedAt: string;
  isPersistent: boolean;
}

class MemoryRegistryService {
  private workingMemory: Map<string, any> = new Map();
  private episodicMemory: MemoryRecord[] = [];
  private semanticMemory: Map<string, MemoryRecord> = new Map();
  private patientMemory: Map<string, MemoryRecord[]> = new Map();
  private doctorMemory: Map<string, MemoryRecord[]> = new Map();

  constructor() {}

  public write(
    category: MemoryCategory,
    scopeId: string,
    key: string,
    content: any,
    isPersistent: boolean = false
  ): MemoryRecord {
    const record: MemoryRecord = {
      id: `MEM-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      category,
      scopeId,
      key,
      content,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isPersistent: category === "SEMANTIC" || category === "CLINICAL_RECORD" ? true : isPersistent
    };

    switch (category) {
      case "WORKING":
      case "SESSION_ONLY":
        this.workingMemory.set(`${scopeId}:${key}`, content);
        break;
      case "EPISODIC":
        this.episodicMemory.push(record);
        if (this.episodicMemory.length > 500) this.episodicMemory.shift();
        break;
      case "SEMANTIC":
        this.semanticMemory.set(key, record);
        break;
      case "CLINICAL_RECORD":
        const pRecords = this.patientMemory.get(scopeId) || [];
        pRecords.push(record);
        this.patientMemory.set(scopeId, pRecords);
        break;
    }

    return record;
  }

  public read(category: MemoryCategory, scopeId: string, key?: string): any {
    switch (category) {
      case "WORKING":
      case "SESSION_ONLY":
        return key ? this.workingMemory.get(`${scopeId}:${key}`) : undefined;
      case "EPISODIC":
        return this.episodicMemory.filter(r => r.scopeId === scopeId);
      case "SEMANTIC":
        return key ? this.semanticMemory.get(key) : Array.from(this.semanticMemory.values());
      case "CLINICAL_RECORD":
        return this.patientMemory.get(scopeId) || [];
    }
  }

  public clearSession(scopeId: string): void {
    for (const key of Array.from(this.workingMemory.keys())) {
      if (key.startsWith(`${scopeId}:`)) {
        this.workingMemory.delete(key);
      }
    }
  }
}

export const MemoryRegistry = new MemoryRegistryService();
