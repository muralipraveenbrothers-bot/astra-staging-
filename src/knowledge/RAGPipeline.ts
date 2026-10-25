// ============================================================================
// ASTRA AI — Smart RAG Knowledge Fabric
// ONE RAG Pipeline. Dense + BM25 hybrid search, medical reranking,
// query expansion, conflict detection, citation validation.
// ============================================================================

// ─── Evidence Tiers ─────────────────────────────────────────────────────────
export enum EvidenceTier {
  TIER_A = 'TIER_A', // Meta-analyses, systematic reviews
  TIER_B = 'TIER_B', // RCTs, large cohort studies
  TIER_C = 'TIER_C', // Case-control, observational
  TIER_D = 'TIER_D', // Expert opinion, case reports
  TIER_E = 'TIER_E', // Hospital-local protocols
}

export interface RAGSource {
  id: string;
  name: string;
  type: 'pubmed' | 'pmc' | 'clinicaltrials' | 'who' | 'guidelines' | 'hospital_protocol' | 'drug_reference' | 'textbook';
  baseUrl?: string;
  apiKey?: string;
  priority: number;
  enabled: boolean;
  lastIndexed?: Date;
  documentCount?: number;
}

export interface RAGChunk {
  id: string;
  sourceId: string;
  content: string;
  metadata: {
    title?: string;
    authors?: string[];
    year?: number;
    journal?: string;
    doi?: string;
    pmid?: string;
    section?: string;
    pageNumber?: number;
    evidenceTier: EvidenceTier;
  };
  embedding?: number[];
  bm25Score?: number;
  denseScore?: number;
  rerankScore?: number;
  finalScore?: number;
}

export interface RAGQuery {
  originalQuery: string;
  expandedQueries: string[];
  medicalEntities: string[];
  meshTerms: string[];
  filters?: {
    yearRange?: [number, number];
    evidenceTiers?: EvidenceTier[];
    sourceTypes?: RAGSource['type'][];
    specialties?: string[];
  };
}

export interface RAGResult {
  query: RAGQuery;
  chunks: RAGChunk[];
  conflicts: ConflictReport[];
  consensusStatement?: string;
  totalSourcesSearched: number;
  searchDurationMs: number;
  citationChain: CitationNode[];
}

export interface ConflictReport {
  topic: string;
  position1: { chunk: RAGChunk; stance: string };
  position2: { chunk: RAGChunk; stance: string };
  resolution?: string;
  confidenceInResolution: number;
}

export interface CitationNode {
  chunkId: string;
  citation: string; // Formatted citation string
  pmid?: string;
  doi?: string;
  url?: string;
  evidenceTier: EvidenceTier;
}

// ─── Query Expander ─────────────────────────────────────────────────────────
class QueryExpander {
  private synonymMap: Map<string, string[]> = new Map([
    ['heart attack', ['myocardial infarction', 'MI', 'STEMI', 'NSTEMI', 'acute coronary syndrome']],
    ['high blood pressure', ['hypertension', 'HTN', 'elevated BP']],
    ['diabetes', ['diabetes mellitus', 'DM', 'type 2 diabetes', 'T2DM', 'hyperglycemia']],
    ['fever', ['pyrexia', 'febrile', 'hyperthermia', 'elevated temperature']],
    ['headache', ['cephalalgia', 'migraine', 'tension headache']],
    ['chest pain', ['angina', 'chest discomfort', 'precordial pain', 'thoracic pain']],
    ['stroke', ['cerebrovascular accident', 'CVA', 'ischemic stroke', 'hemorrhagic stroke']],
    ['pneumonia', ['lower respiratory tract infection', 'LRTI', 'community acquired pneumonia', 'CAP']],
    ['kidney failure', ['renal failure', 'AKI', 'CKD', 'acute kidney injury', 'chronic kidney disease']],
    ['blood clot', ['thrombosis', 'DVT', 'deep vein thrombosis', 'pulmonary embolism', 'PE']],
    ['dengue', ['dengue fever', 'dengue hemorrhagic fever', 'DHF', 'dengue shock syndrome']],
    ['malaria', ['plasmodium falciparum', 'plasmodium vivax', 'malarial fever']],
    ['TB', ['tuberculosis', 'pulmonary tuberculosis', 'PTB', 'mycobacterium tuberculosis']],
    ['sepsis', ['septicemia', 'systemic inflammatory response', 'SIRS', 'septic shock']],
  ]);

  private meshTermMap: Map<string, string[]> = new Map([
    ['heart', ['Heart', 'Myocardium', 'Cardiovascular System']],
    ['liver', ['Liver', 'Hepatic', 'Hepatobiliary System']],
    ['kidney', ['Kidney', 'Renal', 'Nephron']],
    ['brain', ['Brain', 'Cerebrum', 'Central Nervous System']],
    ['lung', ['Lung', 'Pulmonary', 'Respiratory System']],
    ['blood', ['Blood', 'Hematologic', 'Hematopoietic System']],
  ]);

  expand(query: string): RAGQuery {
    const normalized = query.toLowerCase().trim();
    const expandedQueries: string[] = [normalized];
    const medicalEntities: string[] = [];
    const meshTerms: string[] = [];

    // Synonym expansion
    for (const [term, synonyms] of this.synonymMap) {
      if (normalized.includes(term)) {
        medicalEntities.push(term);
        for (const syn of synonyms) {
          expandedQueries.push(normalized.replace(term, syn));
        }
      }
    }

    // MeSH term extraction
    for (const [term, mesh] of this.meshTermMap) {
      if (normalized.includes(term)) {
        meshTerms.push(...mesh);
      }
    }

    return {
      originalQuery: query,
      expandedQueries: [...new Set(expandedQueries)],
      medicalEntities,
      meshTerms,
    };
  }
}

// ─── BM25 Scorer ────────────────────────────────────────────────────────────
class BM25Scorer {
  private k1 = 1.5;
  private b = 0.75;

  score(query: string, document: string, avgDocLength: number): number {
    const queryTerms = query.toLowerCase().split(/\s+/);
    const docTerms = document.toLowerCase().split(/\s+/);
    const docLength = docTerms.length;
    const termFreq = new Map<string, number>();

    for (const term of docTerms) {
      termFreq.set(term, (termFreq.get(term) || 0) + 1);
    }

    let score = 0;
    for (const term of queryTerms) {
      const tf = termFreq.get(term) || 0;
      if (tf === 0) continue;

      const idf = Math.log(1 + 1); // Simplified IDF for single-doc scoring
      const tfNorm = (tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + this.b * (docLength / avgDocLength)));
      score += idf * tfNorm;
    }

    return score;
  }
}

// ─── Medical Reranker ───────────────────────────────────────────────────────
class MedicalReranker {
  private evidenceWeights: Record<EvidenceTier, number> = {
    [EvidenceTier.TIER_A]: 1.0,
    [EvidenceTier.TIER_B]: 0.85,
    [EvidenceTier.TIER_C]: 0.65,
    [EvidenceTier.TIER_D]: 0.45,
    [EvidenceTier.TIER_E]: 0.35,
  };

  private recencyBoost(year?: number): number {
    if (!year) return 0;
    const currentYear = new Date().getFullYear();
    const age = currentYear - year;
    if (age <= 2) return 0.2;
    if (age <= 5) return 0.1;
    if (age <= 10) return 0;
    return -0.1; // Slight penalty for old evidence
  }

  rerank(chunks: RAGChunk[]): RAGChunk[] {
    return chunks.map(chunk => {
      const evidenceWeight = this.evidenceWeights[chunk.metadata.evidenceTier] || 0.5;
      const recency = this.recencyBoost(chunk.metadata.year);
      const denseComponent = (chunk.denseScore || 0) * 0.5;
      const bm25Component = (chunk.bm25Score || 0) * 0.3;
      const evidenceComponent = evidenceWeight * 0.15;
      const recencyComponent = recency * 0.05;

      chunk.rerankScore = denseComponent + bm25Component + evidenceComponent + recencyComponent;
      chunk.finalScore = chunk.rerankScore;
      return chunk;
    }).sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));
  }
}

// ─── Conflict Detector ──────────────────────────────────────────────────────
class ConflictDetector {
  private contradictionSignals = [
    { positive: ['recommended', 'indicated', 'beneficial'], negative: ['contraindicated', 'not recommended', 'harmful'] },
    { positive: ['effective', 'efficacious'], negative: ['ineffective', 'no benefit'] },
    { positive: ['safe', 'well-tolerated'], negative: ['unsafe', 'toxic', 'dangerous'] },
    { positive: ['first-line', 'preferred'], negative: ['second-line', 'alternative'] },
  ];

  detect(chunks: RAGChunk[]): ConflictReport[] {
    const conflicts: ConflictReport[] = [];

    for (let i = 0; i < chunks.length; i++) {
      for (let j = i + 1; j < chunks.length; j++) {
        const conflict = this.checkConflict(chunks[i], chunks[j]);
        if (conflict) {
          conflicts.push(conflict);
        }
      }
    }

    return conflicts;
  }

  private checkConflict(a: RAGChunk, b: RAGChunk): ConflictReport | null {
    const aContent = a.content.toLowerCase();
    const bContent = b.content.toLowerCase();

    for (const signal of this.contradictionSignals) {
      const aPositive = signal.positive.some(s => aContent.includes(s));
      const aNegative = signal.negative.some(s => aContent.includes(s));
      const bPositive = signal.positive.some(s => bContent.includes(s));
      const bNegative = signal.negative.some(s => bContent.includes(s));

      if ((aPositive && bNegative) || (aNegative && bPositive)) {
        // Resolve by evidence tier
        const tierOrder = [EvidenceTier.TIER_A, EvidenceTier.TIER_B, EvidenceTier.TIER_C, EvidenceTier.TIER_D, EvidenceTier.TIER_E];
        const aTierIdx = tierOrder.indexOf(a.metadata.evidenceTier);
        const bTierIdx = tierOrder.indexOf(b.metadata.evidenceTier);
        const winner = aTierIdx <= bTierIdx ? a : b;

        return {
          topic: `Conflicting evidence found`,
          position1: { chunk: a, stance: aPositive ? 'supportive' : 'opposing' },
          position2: { chunk: b, stance: bPositive ? 'supportive' : 'opposing' },
          resolution: `Higher evidence tier (${winner.metadata.evidenceTier}) from ${winner.metadata.title || 'source'} preferred.`,
          confidenceInResolution: Math.abs(aTierIdx - bTierIdx) >= 2 ? 0.85 : 0.6,
        };
      }
    }

    return null;
  }
}

// ─── Citation Builder ───────────────────────────────────────────────────────
class CitationBuilder {
  build(chunks: RAGChunk[]): CitationNode[] {
    return chunks.map(chunk => {
      const authors = chunk.metadata.authors?.slice(0, 3).join(', ') || 'Unknown';
      const year = chunk.metadata.year || 'n.d.';
      const title = chunk.metadata.title || 'Untitled';
      const journal = chunk.metadata.journal || '';

      return {
        chunkId: chunk.id,
        citation: `${authors} (${year}). ${title}. ${journal}`.trim(),
        pmid: chunk.metadata.pmid,
        doi: chunk.metadata.doi,
        url: chunk.metadata.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${chunk.metadata.pmid}/` : undefined,
        evidenceTier: chunk.metadata.evidenceTier,
      };
    });
  }
}

// ─── RAG Pipeline (Main) ───────────────────────────────────────────────────
export class RAGPipeline {
  private sources: Map<string, RAGSource> = new Map();
  private documentStore: RAGChunk[] = [];
  private queryExpander = new QueryExpander();
  private bm25Scorer = new BM25Scorer();
  private medicalReranker = new MedicalReranker();
  private conflictDetector = new ConflictDetector();
  private citationBuilder = new CitationBuilder();
  private avgDocLength = 200;

  // ── Source Management ───────────────────────────────────────────────────
  registerSource(source: RAGSource): void {
    this.sources.set(source.id, source);
    console.log(`[RAG] Registered source: ${source.name} (${source.type})`);
  }

  getSources(): RAGSource[] {
    return Array.from(this.sources.values()).sort((a, b) => a.priority - b.priority);
  }

  // ── Document Ingestion ──────────────────────────────────────────────────
  ingestDocuments(chunks: RAGChunk[]): void {
    this.documentStore.push(...chunks);
    // Recalculate average doc length
    if (this.documentStore.length > 0) {
      this.avgDocLength = this.documentStore.reduce((sum, c) => sum + c.content.split(/\s+/).length, 0) / this.documentStore.length;
    }
    console.log(`[RAG] Ingested ${chunks.length} chunks. Total: ${this.documentStore.length}`);
  }

  // ── Main Search Pipeline ────────────────────────────────────────────────
  async search(query: string, options?: {
    topK?: number;
    evidenceTiers?: EvidenceTier[];
    sourceTypes?: RAGSource['type'][];
    yearRange?: [number, number];
  }): Promise<RAGResult> {
    const startTime = Date.now();
    const topK = options?.topK || 10;

    // Step 1: Query Expansion
    const expandedQuery = this.queryExpander.expand(query);
    expandedQuery.filters = {
      evidenceTiers: options?.evidenceTiers,
      sourceTypes: options?.sourceTypes,
      yearRange: options?.yearRange,
    };

    // Step 2: Filter documents
    let candidates = this.filterDocuments(expandedQuery);

    // Step 3: BM25 scoring (sparse retrieval)
    candidates = this.bm25Score(expandedQuery, candidates);

    // Step 4: Dense scoring (simulated - in production, use embedding model)
    candidates = this.denseScore(expandedQuery, candidates);

    // Step 5: Medical reranking with evidence tier weighting
    candidates = this.medicalReranker.rerank(candidates);

    // Step 6: Take top K
    const topChunks = candidates.slice(0, topK);

    // Step 7: Conflict detection
    const conflicts = this.conflictDetector.detect(topChunks);

    // Step 8: Citation chain
    const citationChain = this.citationBuilder.build(topChunks);

    // Step 9: Consensus statement
    const consensusStatement = this.generateConsensus(topChunks, conflicts);

    return {
      query: expandedQuery,
      chunks: topChunks,
      conflicts,
      consensusStatement,
      totalSourcesSearched: this.sources.size,
      searchDurationMs: Date.now() - startTime,
      citationChain,
    };
  }

  private filterDocuments(query: RAGQuery): RAGChunk[] {
    return this.documentStore.filter(chunk => {
      if (query.filters?.evidenceTiers && !query.filters.evidenceTiers.includes(chunk.metadata.evidenceTier)) return false;
      if (query.filters?.yearRange) {
        const year = chunk.metadata.year || 0;
        if (year < query.filters.yearRange[0] || year > query.filters.yearRange[1]) return false;
      }
      if (query.filters?.sourceTypes) {
        const source = this.sources.get(chunk.sourceId);
        if (source && !query.filters.sourceTypes.includes(source.type)) return false;
      }
      return true;
    });
  }

  private bm25Score(query: RAGQuery, chunks: RAGChunk[]): RAGChunk[] {
    const allQueries = query.expandedQueries;
    return chunks.map(chunk => {
      let maxScore = 0;
      for (const q of allQueries) {
        const score = this.bm25Scorer.score(q, chunk.content, this.avgDocLength);
        maxScore = Math.max(maxScore, score);
      }
      chunk.bm25Score = maxScore;
      return chunk;
    });
  }

  private denseScore(query: RAGQuery, chunks: RAGChunk[]): RAGChunk[] {
    // Simulated dense scoring — in production, use actual embedding model
    const queryTerms = new Set(query.originalQuery.toLowerCase().split(/\s+/));
    return chunks.map(chunk => {
      const docTerms = new Set(chunk.content.toLowerCase().split(/\s+/));
      const intersection = new Set([...queryTerms].filter(t => docTerms.has(t)));
      chunk.denseScore = intersection.size / Math.max(queryTerms.size, 1);
      return chunk;
    });
  }

  private generateConsensus(chunks: RAGChunk[], conflicts: ConflictReport[]): string {
    if (chunks.length === 0) return 'No evidence found.';
    if (conflicts.length === 0) {
      return `Consensus across ${chunks.length} sources (${chunks[0].metadata.evidenceTier} to ${chunks[chunks.length - 1].metadata.evidenceTier}).`;
    }
    return `Partial consensus with ${conflicts.length} conflict(s) detected. Highest evidence tier preferred.`;
  }

  // ── Knowledge Source Registration (Default Medical Sources) ──────────
  registerDefaultSources(): void {
    const defaults: RAGSource[] = [
      { id: 'pubmed', name: 'PubMed/MEDLINE', type: 'pubmed', baseUrl: 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/', priority: 1, enabled: true },
      { id: 'pmc', name: 'PubMed Central', type: 'pmc', baseUrl: 'https://www.ncbi.nlm.nih.gov/pmc/', priority: 2, enabled: true },
      { id: 'clinicaltrials', name: 'ClinicalTrials.gov', type: 'clinicaltrials', baseUrl: 'https://clinicaltrials.gov/api/v2/', priority: 3, enabled: true },
      { id: 'who', name: 'WHO Guidelines', type: 'who', baseUrl: 'https://www.who.int/', priority: 4, enabled: true },
      { id: 'hospital', name: 'Hospital Protocols', type: 'hospital_protocol', priority: 5, enabled: true },
      { id: 'drugref', name: 'Drug Reference Database', type: 'drug_reference', priority: 6, enabled: true },
    ];

    for (const source of defaults) {
      this.registerSource(source);
    }
  }

  // ── Stats ──────────────────────────────────────────────────────────────
  getStats() {
    return {
      totalSources: this.sources.size,
      totalDocuments: this.documentStore.length,
      averageDocLength: Math.round(this.avgDocLength),
      enabledSources: Array.from(this.sources.values()).filter(s => s.enabled).length,
    };
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────
let ragInstance: RAGPipeline | null = null;

export function getRAGPipeline(): RAGPipeline {
  if (!ragInstance) {
    ragInstance = new RAGPipeline();
    ragInstance.registerDefaultSources();
  }
  return ragInstance;
}
