/**
 * ASTRA AI — KNOWLEDGE REGISTRY (1.4)
 * ============================================================================
 * Canonical registry of all clinical evidence, biomedical databases, guidelines,
 * textbook corpora, and hospital protocol sources.
 */

export interface KnowledgeSource {
  sourceId: string;
  name: string;
  type: "PUBMED" | "CLINICAL_TRIALS" | "GUIDELINE_BODY" | "HOSPITAL_PROTOCOL" | "TEXTBOOK" | "USER_DOC";
  license: string;
  accessScope: "GLOBAL" | "HOSPITAL_INTERNAL" | "DEPARTMENT_ONLY";
  freshness: "REALTIME" | "DAILY" | "WEEKLY" | "STATIC";
  retrievalMethod: "REST_API" | "VECTOR_SEARCH" | "GRAPH_HYBRID" | "LOCAL_BM25";
  status: "CONNECTED" | "INDEXED" | "SEARCH_ONLY" | "OFFLINE" | "CONFIG_REQUIRED";
  lastIngested: string;
  priorityRank: number;
}

class KnowledgeRegistryService {
  private sources: Map<string, KnowledgeSource> = new Map();

  constructor() {
    this.seedSources();
  }

  private seedSources() {
    const defaultSources: KnowledgeSource[] = [
      {
        sourceId: "pubmed_ncbi",
        name: "PubMed (NCBI E-utilities)",
        type: "PUBMED",
        license: "Public Domain / Open Access",
        accessScope: "GLOBAL",
        freshness: "REALTIME",
        retrievalMethod: "REST_API",
        status: "CONNECTED",
        lastIngested: new Date().toISOString(),
        priorityRank: 1
      },
      {
        sourceId: "europe_pmc",
        name: "Europe PMC Full Text Archive",
        type: "PUBMED",
        license: "Open Access",
        accessScope: "GLOBAL",
        freshness: "DAILY",
        retrievalMethod: "REST_API",
        status: "CONNECTED",
        lastIngested: new Date().toISOString(),
        priorityRank: 2
      },
      {
        sourceId: "clinical_trials_gov",
        name: "ClinicalTrials.gov APIv2",
        type: "CLINICAL_TRIALS",
        license: "Public Domain",
        accessScope: "GLOBAL",
        freshness: "WEEKLY",
        retrievalMethod: "REST_API",
        status: "CONNECTED",
        lastIngested: new Date().toISOString(),
        priorityRank: 3
      },
      {
        sourceId: "guidelines_who_cdc_nice",
        name: "Official Guidelines (WHO, CDC, NICE, IDSA, BTS)",
        type: "GUIDELINE_BODY",
        license: "Open Access / Public Domain",
        accessScope: "GLOBAL",
        freshness: "DAILY",
        retrievalMethod: "GRAPH_HYBRID",
        status: "INDEXED",
        lastIngested: new Date().toISOString(),
        priorityRank: 1
      },
      {
        sourceId: "hospital_sop_protocols",
        name: "Hospital Internal Protocols & Clinical SOPs",
        type: "HOSPITAL_PROTOCOL",
        license: "Hospital Proprietary",
        accessScope: "HOSPITAL_INTERNAL",
        freshness: "REALTIME",
        retrievalMethod: "VECTOR_SEARCH",
        status: "INDEXED",
        lastIngested: new Date().toISOString(),
        priorityRank: 1
      }
    ];

    for (const src of defaultSources) {
      this.sources.set(src.sourceId, src);
    }
  }

  public register(source: KnowledgeSource): void {
    this.sources.set(source.sourceId, source);
  }

  public get(sourceId: string): KnowledgeSource | undefined {
    return this.sources.get(sourceId);
  }

  public list(): KnowledgeSource[] {
    return Array.from(this.sources.values()).sort((a, b) => a.priorityRank - b.priorityRank);
  }
}

export const KnowledgeRegistry = new KnowledgeRegistryService();
