// Astra Medical Knowledge Fabric — shared types.
//
// PRINCIPLE: every metric below is either measured from actual data or
// explicitly labelled UNMEASURED / NOT-INDEXED / TARGET. Nothing here is
// hard-coded marketing. The 40T figure exists ONLY as a labelled capacity
// target, never as a verified achievement.

export type KnowledgeCategory =
  | "textbook"
  | "guideline"
  | "clinical-reference"
  | "pubmed"
  | "research-paper"
  | "github"
  | "medical-llm"
  | "drug-reference"
  | "hospital-protocol"
  | "cds-knowledge"
  | "operational-data"
  | "web-search"
  | "clinical-trials"
  | "voicebox"
  | "llm-backend";

export type IndexStatus = "indexed" | "live-searchable" | "configured-unavailable" | "not-connected";

export interface KnowledgeSource {
  id: string;
  name: string;
  category: KnowledgeCategory;
  /** Medical specialty tags actually present in the source content. */
  specialties: string[];
  local: boolean;
  indexed: IndexStatus;
  /** Actual records known to be in this source. */
  records: number;
  /** Whether record count is measured (true) or unknown (false). */
  recordsMeasured: boolean;
  /** Human text describing what is actually accessible. */
  access: string;
  lastUpdated: string;
  freshness: "static" | "live" | "unknown";
}

export type GraphNodeType =
  | "disease"
  | "symptom"
  | "sign"
  | "drug"
  | "drug-class"
  | "investigation"
  | "procedure"
  | "specialty"
  | "guideline"
  | "anatomy"
  | "complication"
  | "patient-state";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  name: string;
  specialty?: string;
  /** Where this node actually came from in the codebase. */
  sourceId: string;
}

export type EdgeType =
  | "PRESENTS_WITH"
  | "RULES_IN"
  | "RULES_OUT"
  | "TREATED_BY"
  | "CONTRAINDICATED_BY"
  | "DIAGNOSED_BY"
  | "INDICATED_FOR"
  | "COMPLICATES"
  | "FOLLOWED_BY"
  | "ASSOCIATED_WITH"
  | "RISK_FACTOR_FOR";

export interface KnowledgeEdge {
  id: string;
  from: string;
  to: string;
  type: EdgeType;
  /** Real evidence text from the source module, if any. */
  evidence: string;
  sourceId: string;
  confidence: number;
  evidenceLevel: "guideline" | "textbook" | "expert-curated" | "operational" | "inference";
}

export interface KnowledgePoint {
  id: string;
  kind: "node" | "edge" | "document" | "concept" | "reference";
  concept: string;
  sourceId: string;
  specialty?: string;
  provenance: string;
  version: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  /** Officially published parameter count in billions, if known. */
  paramsBillions: number | null;
  contextWindow?: string;
  quantization?: string;
  local: boolean;
  /** Measured at runtime right now. */
  availableNow: boolean;
  availabilityNote: string;
  usedBy: string[];
  purpose: string;
  configured: boolean;
}

export interface QualityFinding {
  severity: "ok" | "warn" | "bad";
  category: string;
  detail: string;
}

export interface SpecialtyCoverage {
  specialty: string;
  sources: number;
  documents: number;
  concepts: number;
  relationships: number;
  evidenceSources: number;
  freshness: string;
}

export interface KnowledgeMetrics {
  measuredAt: string;
  sources: number;
  sourcesIndexed: number;
  sourcesLiveSearchable: number;
  sourcesNotConnected: number;
  documents: number;
  documentsMeasured: boolean;
  pages: number | null;
  pagesMeasured: boolean;
  characters: number;
  charactersMeasured: boolean;
  words: number;
  wordsMeasured: boolean;
  tokens: number | null;
  tokensMeasured: boolean;
  tokenMethod: string;
  chunks: number | null;
  chunksMeasured: boolean;
  embeddings: number;
  embeddingsMeasured: boolean;
  embeddingDimension: number | null;
  nodes: number;
  edges: number;
  diseases: number;
  drugs: number;
  procedures: number;
  investigations: number;
  specialties: number;
  evidenceSources: number;
  clinicalReferences: number;
  knowledgePoints: number;
  /** Derived, semantically bounded relationship space — NOT stored records. */
  derivedSpace: number;
  derivedSpaceMethod: string;
  /** Static labelled target — never presented as verified. */
  capacityTarget: number;
  capacityLabel: string;
  pubmedIndexed: number;
  pubmedLiveSearch: boolean;
  githubRepos: number;
  textbooks: number;
  webIndexed: boolean;
  patientRecords: number;
  hospitalEvents: number;
  quality: QualityFinding[];
  coverage: SpecialtyCoverage[];
}

export const DATA_POINT_DEFINITION =
  "1 Knowledge Point = 1 unique verified clinical concept (node), relationship (edge), " +
  "or source document in the Astra Medical Knowledge Graph — counted from actual data, never estimated.";

export const CAPACITY_TARGET = 40_000_000_000_000;
