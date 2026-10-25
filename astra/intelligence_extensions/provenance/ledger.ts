/**
 * ASTRA AI — Intelligence Extensions: Provenance Ledger (Step 14)
 * ============================================================================
 * For every scientific/research execution, captures full provenance so doctors
 * can inspect "Where did Astra get this information?"
 */
import { firstEnv } from "../_internal";

export interface ProvenanceEntry {
  requestId: string;
  timestamp: string;
  originalQuery: string;
  deidentifiedQuery: string;
  selectedSkills: string[];
  skillVersions: Record<string, string>;
  databasesAccessed: string[];
  searchQueries: string[];
  retrievedSources: Array<{ name: string; url?: string; pmid?: string; doi?: string; accessedAt: string }>;
  retrievalTimestamps: string[];
  modelUsed: string;
  agentUsed: string;
  finalSummary?: string;
  confidence?: number;
  errors?: string[];
  doctorReviewRequired: boolean;
  phiRedactions: string[];
}

export class ProvenanceLedger {
  private entries: ProvenanceEntry[] = [];
  private maxSize: number;

  constructor() {
    this.maxSize = Number(firstEnv("ASTRA_PROVENANCE_MAX_ENTRIES", "500"));
  }

  record(entry: ProvenanceEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxSize) {
      this.entries.splice(0, this.entries.length - this.maxSize);
    }
  }

  get(requestId: string): ProvenanceEntry | undefined {
    return this.entries.find((e) => e.requestId === requestId);
  }

  list(limit = 50): ProvenanceEntry[] {
    return this.entries.slice(-limit).reverse();
  }

  get size(): number { return this.entries.length; }
}

let _ledger: ProvenanceLedger | null = null;
export function getProvenanceLedger(): ProvenanceLedger {
  if (!_ledger) _ledger = new ProvenanceLedger();
  return _ledger;
}