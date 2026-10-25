// Astra knowledge connectors — typed client for the server-side connector
// endpoints (/api/connectors/*). Every point carries provenance (PMID / NCT /
// Wikipedia URL) and the server performs the fetches because NCBI does not
// send CORS headers.

export interface ConnectorPoint {
  subject: string;
  relation: string;
  object: string;
  evidence: string;
  confidence: number;
  sourceId: string;
  source: string;
  docRef: string;
  year: string;
  tier?: string;
  publicationDate?: string | null;
}

export interface ConnectorResult {
  sourceId: string;
  fetched: number;
  points: ConnectorPoint[];
  note?: string;
  totalHits?: number;
  error?: string;
}

export interface ConnectorRun {
  id: string;
  kind: "pubmed" | "ct" | "wiki";
  label: string;
  query: string;
  result?: ConnectorResult;
  error?: string;
  ranAt: string;
  tookMs: number;
  committed: boolean;
  commitInfo?: { added: number; duplicates: number; conflicts: number };
}

const API = "/api/connectors";

async function call(path: string, params: Record<string, string>): Promise<ConnectorResult> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${API}/${path}?${qs}`, { signal: AbortSignal.timeout(60000) });
  const body = (await res.json().catch(() => null)) as ConnectorResult | null;
  if (!res.ok || !body) {
    return { sourceId: path, fetched: 0, points: [], error: body?.error || `connector error ${res.status}` };
  }
  return body;
}

export async function runPubMed(query: string, n = 50): Promise<ConnectorResult> {
  return call("pubmed", { q: query, n: String(n) });
}

export async function runClinicalTrials(query: string, n = 30): Promise<ConnectorResult> {
  return call("ct", { q: query, n: String(n) });
}

export async function runWikipedia(term: string): Promise<ConnectorResult> {
  return call("wiki", { t: term });
}

export const CONNECTOR_LABELS: Record<ConnectorRun["kind"], { name: string; desc: string; sample: string }> = {
  pubmed: { name: "PubMed", desc: "Biomedical literature — sentences + MeSH indexing, PMID-traceable", sample: "enteric fever" },
  ct: { name: "ClinicalTrials.gov", desc: "Conditions × interventions from real registered trials", sample: "typhoid" },
  wiki: { name: "Wikipedia", desc: "Cited summary document (labelled summary, not fact)", sample: "typhoid" },
};

let runCounter = 0;
export function newRunId(): string {
  runCounter += 1;
  return `run-${Date.now()}-${runCounter}`;
}

// ---------------------------------------------------------------------------
// Persistent knowledge store clients (server-side /api/knowledge/*)
// ---------------------------------------------------------------------------

export interface KnowledgeStoreStats {
  store: { engine: string; location: string; storageBytes: number; dbStatus: string };
  totals: {
    documents: number;
    chunks: number;
    points: number;
    concepts: number;
    embeddings: number;
    conflicts: number;
    activeJobs: number;
    failedJobs: number;
    jobs: number;
    lastIngest: string | null;
  };
  perSource: Record<string, { documents: number; chunks: number; points: number }>;
  embeddingEngine: { model: string | null; dimension: number | null; online: boolean };
  jobs: IngestionJob[];
}

export interface IngestionJob {
  jobId: string;
  source: string;
  query: string;
  specialty: string;
  target: number;
  status: "queued" | "running" | "paused" | "done" | "failed" | "cancelled";
  recordsFound: number;
  recordsProcessed: number;
  pointsCreated: number;
  duplicates: number;
  errors: number;
  conflictsDetected: number;
  checkpoint: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  lastBatch: string;
  error: string | null;
  durationMs: number;
}

export interface CommitResult {
  added: number;
  duplicates: number;
  conflictsDetected: number;
  totalPoints: number;
}

export async function commitPoints(points: ConnectorPoint[]): Promise<CommitResult> {
  const res = await fetch(`${API}/knowledge/commit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ points }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`commit failed ${res.status}`);
  return res.json();
}

export async function fetchStoreStats(): Promise<KnowledgeStoreStats> {
  const res = await fetch("/api/knowledge/stats", { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`stats ${res.status}`);
  return res.json();
}

export async function createIngestionJob(query: string, specialty: string, target: number): Promise<IngestionJob> {
  const res = await fetch("/api/knowledge/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, specialty, target }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`job create ${res.status}`);
  return res.json();
}

export async function jobAction(jobId: string, action: "pause" | "resume" | "cancel"): Promise<IngestionJob> {
  const res = await fetch(`/api/knowledge/jobs/${jobId}/${action}`, { method: "POST", signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`job ${action} ${res.status}`);
  return res.json();
}

export interface SearchHit extends ConnectorPoint {
  _score: number;
}

export async function knowledgeSearch(q: string, n = 8): Promise<SearchHit[]> {
  const res = await fetch("/api/knowledge/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: q, limit: n }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`search ${res.status}`);
  const d = await res.json();
  return (d.results || d.hits || []) as SearchHit[];
}

export interface TermLookupResult {
  conceptId: string;
  name: string;
  aliases: string[];
  codes: { code: string; system: string }[];
  source: string;
}

export async function meshLookup(term: string): Promise<TermLookupResult[]> {
  const res = await fetch(`/api/knowledge/terminology/mesh?term=${encodeURIComponent(term)}`, { signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`mesh ${res.status}`);
  const d = await res.json();
  return (d.concepts || []).map((c: { name: string; ui: string; synonyms: string[]; trees: string[]; conceptId: string }) => ({
    conceptId: c.conceptId,
    name: c.name,
    aliases: c.synonyms,
    codes: [{ code: c.ui, system: "MeSH" }],
    source: "MeSH",
  }));
}

export async function rxnormLookup(term: string): Promise<TermLookupResult[]> {
  const res = await fetch(`/api/knowledge/terminology/rxnorm?term=${encodeURIComponent(term)}`, { signal: AbortSignal.timeout(45000) });
  if (!res.ok) throw new Error(`rxnorm ${res.status}`);
  const d = await res.json();
  return (d.concepts || []).map((c: { name: string; rxcui: string; synonyms: string[]; tty: string; conceptId: string }) => ({
    conceptId: c.conceptId,
    name: c.name,
    aliases: c.synonyms,
    codes: [{ code: c.rxcui, system: "RxNorm" }],
    source: "RxNorm",
  }));
}

export interface EmbedStatus {
  engineOnline: boolean;
  model: string | null;
  dimension: number | null;
  embeddedChunks: number;
  pendingChunks: number;
  ollama: string;
}

export async function embedStatus(): Promise<EmbedStatus> {
  const res = await fetch("/api/knowledge/embeddings/status", { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`embed status ${res.status}`);
  return res.json();
}

export async function indexEmbeddings(): Promise<{ ok: boolean; embedded?: number; total?: number; error?: string; running?: boolean }> {
  const res = await fetch("/api/knowledge/embeddings/index", { method: "POST", signal: AbortSignal.timeout(300000) });
  if (!res.ok) throw new Error(`embed index ${res.status}`);
  return res.json();
}
