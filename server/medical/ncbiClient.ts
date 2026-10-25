/**
 * ASTRA AI — NCBI / PUBMED NATIVE CLIENT (server-side only)
 * ============================================================================
 * The Astra-native, capability-gated adapter for NCBI E-utilities (PubMed).
 * Architecture: Doctor/Astra Agent → AstraCommand → Skill Registry → Security
 * Kernel → Capability Gateway → THIS ADAPTER → NCBI. It is NOT the security
 * model — it is an adapter behind it.
 *
 * Contract:
 *  - NCBI_API_KEY is loaded ONLY via the existing server-side env loader
 *    (server/ai/loadEnv.ts). It never reaches Vite, the browser, model prompts,
 *    logs, error messages, or audit payloads — every error string is scrubbed.
 *  - Egress is locked to eutils.ncbi.nlm.nih.gov (assertAllowedUrl).
 *  - Bounded retries only (max 2): 429/503 honor Retry-After (capped 4s);
 *    401/403 fail fast as AUTH_FAILED. No infinite retry loops.
 *  - Never fabricates a PMID, title, journal, or abstract. If PubMed is
 *    unreachable the caller receives SOURCE_UNAVAILABLE — never placeholder or
 *    model-generated results.
 *  - Provenance is mandatory: every article carries source:"PubMed" and
 *    retrievedAt so the Evidence Bundle can cite it as JOURNAL/PUBMED evidence.
 */

import { loadBackendEnv, maskSecret } from "../ai/loadEnv";

export const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
/** Astra may only egress to this exact host for NCBI research. */
export const NCBI_ALLOWED_HOST = "eutils.ncbi.nlm.nih.gov";

export interface PubMedArticle {
  source: "PubMed";
  pmid: string;
  title?: string;
  authors?: string[];
  journal?: string;
  publicationDate?: string;
  abstract?: string;
  doi?: string;
  retrievedAt: string;
}

export type PubMedErrorCode =
  | "CONFIG_REQUIRED"
  | "SOURCE_UNAVAILABLE"
  | "AUTH_FAILED"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "INVALID_RESPONSE";

export interface PubMedSearchInput {
  query: string;
  maxResults?: number;
  /** PDAT range, e.g. { from: "2023/01/01", to: "2026/12/31" } */
  dateRange?: { from?: string; to?: string };
  articleType?: string;
  language?: string;
}

export interface PubMedSearchResult {
  ok: boolean;
  articles?: PubMedArticle[];
  totalHits?: number;
  latencyMs: number;
  errorCode?: PubMedErrorCode;
  error?: string;
}

export interface PubMedProbe {
  ok: boolean;
  latencyMs: number;
  totalHits?: number;
  firstPmid?: string;
  errorCode?: PubMedErrorCode;
  error?: string;
}

let envLoaded = false;
const MAX_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 10000;
const RETRY_WAIT_CAP_MS = 4000;

function ensureEnv(): void {
  if (!envLoaded) {
    loadBackendEnv();
    envLoaded = true;
  }
}

function apiKey(): { key?: string } {
  ensureEnv();
  const key = process.env.NCBI_API_KEY?.trim();
  return key && maskSecret(key) === "set" ? { key } : {};
}

/** Redact the API key from any string before it can reach a caller or log. */
export function scrubKey(text: string): string {
  const { key } = apiKey();
  let out = String(text ?? "");
  if (key && key.length > 4) out = out.split(key).join("***");
  // Defense-in-depth: also scrub api_key= parameters out of any URL/text.
  out = out.replace(/api_key=[^&\s"']+/gi, "api_key=***");
  return out;
}

/** Validate the egress destination against the single approved NCBI host. */
export function assertAllowedUrl(url: string): void {
  let host = "";
  try {
    host = new URL(url).host;
  } catch {
    throw new Error(`egress denied: unparseable URL '${scrubKey(url)}'`);
  }
  if (host !== NCBI_ALLOWED_HOST) {
    throw new Error(`egress denied: '${host}' is not the approved NCBI host`);
  }
}

interface EutilsCallOptions {
  path: "esearch.fcgi" | "esummary.fcgi" | "efetch.fcgi";
  params: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
}

export interface EutilsCallResult {
  ok: boolean;
  status: number;
  text?: string;
  errorCode?: PubMedErrorCode;
  error?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** One bounded, key-injected E-utilities call with structured error codes. */
export async function eutilsCall(opts: EutilsCallOptions): Promise<EutilsCallResult> {
  const { key } = apiKey();
  const params = new URLSearchParams(opts.params);
  if (key) params.set("api_key", key);
  params.set("tool", process.env.NCBI_TOOL?.trim() || "astra-hospital-ops");
  const email = process.env.NCBI_EMAIL?.trim();
  if (email) params.set("email", email);
  const url = `${EUTILS_BASE}/${opts.path}?${params.toString()}`;
  try {
    assertAllowedUrl(url);
  } catch (e) {
    return { ok: false, status: 0, errorCode: "SOURCE_UNAVAILABLE", error: e instanceof Error ? e.message : String(e) };
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = Math.min(Math.max(opts.retries ?? MAX_RETRIES, 0), MAX_RETRIES);

  let lastError = "unreachable";
  let lastCode: PubMedErrorCode = "SOURCE_UNAVAILABLE";

  for (let attempt = 0; attempt <= retries; attempt++) {
    const t0 = Date.now();
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      const latencyMs = Date.now() - t0;

      if (res.status === 401 || res.status === 403) {
        // Bad key — retrying cannot help; fail fast.
        return {
          ok: false, status: res.status, errorCode: "AUTH_FAILED",
          error: scrubKey(`HTTP ${res.status} — NCBI rejected the request (check NCBI_API_KEY)`),
        };
      }
      if (res.status === 429 || res.status === 503) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "0");
        lastCode = "RATE_LIMITED";
        lastError = `HTTP ${res.status} — NCBI rate limit (latencyMs=${latencyMs})`;
        if (attempt < retries) {
          const wait = Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter * 1000, RETRY_WAIT_CAP_MS)
            : Math.min(500 * 2 ** attempt, RETRY_WAIT_CAP_MS);
          await sleep(wait);
          continue;
        }
        return { ok: false, status: res.status, errorCode: lastCode, error: lastError };
      }
      if (!res.ok) {
        lastCode = "SOURCE_UNAVAILABLE";
        lastError = `HTTP ${res.status} — E-utilities returned an error`;
        if (attempt < retries) {
          await sleep(Math.min(500 * 2 ** attempt, RETRY_WAIT_CAP_MS));
          continue;
        }
        return { ok: false, status: res.status, errorCode: lastCode, error: lastError };
      }

      const text = await res.text();
      return { ok: true, status: res.status, text };
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const isTimeout = /abort|timeout|timed out/i.test(raw) || (e instanceof Error && e.name === "TimeoutError");
      lastCode = isTimeout ? "TIMEOUT" : "SOURCE_UNAVAILABLE";
      lastError = raw;
      if (attempt < retries) {
        await sleep(Math.min(500 * 2 ** attempt, RETRY_WAIT_CAP_MS));
        continue;
      }
      return { ok: false, status: 0, errorCode: lastCode, error: scrubKey(lastError) };
    }
  }
  return { ok: false, status: 0, errorCode: lastCode, error: scrubKey(lastError) };
}

/** Best-effort per-record abstract extraction from efetch text (never fabricated). */
export function extractAbstractBodies(text: string | undefined): string[] {
  if (!text || text.length < 60) return [];
  try {
    // PubMed efetch (rettype=abstract, retmode=text) numbers each record ("1. …").
    const chunks = text.split(/\n\n(?=\d+\.\s)/);
    const bodies: string[] = [];
    for (const chunk of chunks) {
      const body = chunk.replace(/^\d+\.\s*/, "").trim();
      if (body.length > 60) bodies.push(body);
    }
    return bodies;
  } catch {
    return []; // absence is honest; abstracts are best-effort
  }
}

interface DocSum {
  title?: string;
  fulljournalname?: string;
  source?: string;
  pubdate?: string;
  sortfirstauthor?: string;
  authors?: Array<{ name?: string; authtype?: string }>;
  articleids?: Array<{ idtype?: string; value?: string }>;
}

/**
 * Typed, capability-gated PubMed search (research.pubmed.search).
 * READ_ONLY_EXTERNAL_RESEARCH — no patient data, no DB writes, no shell.
 */
export async function searchPubMed(input: PubMedSearchInput): Promise<PubMedSearchResult> {
  const t0 = Date.now();
  const maxResults = Math.min(Math.max(input.maxResults ?? 5, 1), 20);
  if (!input.query?.trim()) {
    return { ok: false, latencyMs: 0, errorCode: "INVALID_RESPONSE", error: "query is required" };
  }
  const { key } = apiKey();
  if (!key) {
    return {
      ok: false, latencyMs: Date.now() - t0, errorCode: "CONFIG_REQUIRED",
      error: "NCBI_API_KEY is not configured in the server environment",
    };
  }

  // 1) esearch — real PMIDs only.
  const termParts = [input.query.trim()];
  if (input.articleType) termParts.push(input.articleType);
  if (input.language) termParts.push(input.language);
  if (input.dateRange?.from || input.dateRange?.to) {
    termParts.push(`(${input.dateRange?.from ?? "1800/01/01"}:${input.dateRange?.to ?? "3000/12/31"}[PDAT])`);
  }
  const esearch = await eutilsCall({
    path: "esearch.fcgi",
    params: { db: "pubmed", retmode: "json", retmax: String(maxResults), term: termParts.join(" AND ") },
  });
  if (!esearch.ok || !esearch.text) {
    return { ok: false, latencyMs: Date.now() - t0, errorCode: esearch.errorCode, error: esearch.error };
  }
  interface EsearchResult { idlist?: string[]; count?: string; error?: string }
  let es: EsearchResult | undefined;
  try {
    es = (JSON.parse(esearch.text) as { esearchresult?: EsearchResult }).esearchresult;
  } catch {
    return { ok: false, latencyMs: Date.now() - t0, errorCode: "INVALID_RESPONSE", error: "esearch returned unparseable JSON" };
  }
  if (es?.error) {
    return { ok: false, latencyMs: Date.now() - t0, errorCode: "INVALID_RESPONSE", error: scrubKey(es.error) };
  }
  // Accept strictly digit PMIDs — anything else is discarded, never invented.
  const pmids = (es?.idlist ?? []).filter((id) => /^\d{1,9}$/.test(id));
  const totalHits = Number(es?.count ?? pmids.length) || pmids.length;
  if (pmids.length === 0) {
    // Empty is an honest result, not an error.
    return { ok: true, articles: [], totalHits: 0, latencyMs: Date.now() - t0 };
  }

  // 2) esummary — real metadata. Absent metadata stays absent.
  const esummary = await eutilsCall({
    path: "esummary.fcgi",
    params: { db: "pubmed", retmode: "json", id: pmids.join(",") },
  });
  const docs = new Map<string, DocSum>();
  if (esummary.ok && esummary.text) {
    try {
      const parsed = JSON.parse(esummary.text) as { result?: Record<string, DocSum> };
      for (const pmid of pmids) {
        const doc = parsed.result?.[pmid];
        if (doc && typeof doc === "object") docs.set(pmid, doc);
      }
    } catch {
      /* metadata stays absent rather than fabricated */
    }
  }

  // 3) efetch — best-effort real abstracts.
  const efetch = await eutilsCall({
    path: "efetch.fcgi",
    params: { db: "pubmed", rettype: "abstract", retmode: "text", id: pmids.join(",") },
  });
  const abstractBodies = efetch.ok ? extractAbstractBodies(efetch.text) : [];

  const retrievedAt = new Date().toISOString();
  const articles: PubMedArticle[] = pmids.map((pmid, i) => {
    const doc = docs.get(pmid);
    const doi = doc?.articleids?.find((a) => a.idtype === "doi")?.value;
    const authors = (doc?.authors ?? [])
      .filter((a) => a.authtype === "Author" && a.name)
      .map((a) => a.name as string)
      .slice(0, 12);
    return {
      source: "PubMed" as const,
      pmid,
      title: doc?.title?.trim() || undefined,
      authors: authors.length ? authors : doc?.sortfirstauthor ? [doc.sortfirstauthor] : undefined,
      journal: doc?.fulljournalname?.trim() || doc?.source?.trim() || undefined,
      publicationDate: doc?.pubdate?.trim() || undefined,
      abstract: abstractBodies[i],
      doi: doi && /^\S+$/.test(doi) ? doi : undefined,
      retrievedAt,
    };
  });

  return { ok: true, articles, totalHits, latencyMs: Date.now() - t0 };
}

/**
 * Safe probe for the fabric UI (Phases 8/11/16): one harmless real query.
 * Returns only masked, provenance-safe facts (count + first PMID + latency).
 */
export async function probePubMed(term = "acute pancreatitis"): Promise<PubMedProbe> {
  const t0 = Date.now();
  const { key } = apiKey();
  if (!key) {
    return { ok: false, latencyMs: 0, errorCode: "CONFIG_REQUIRED", error: "NCBI_API_KEY missing" };
  }
  const res = await eutilsCall({
    path: "esearch.fcgi",
    params: { db: "pubmed", retmode: "json", retmax: "1", term },
    timeoutMs: 6000,
    retries: 1,
  });
  if (!res.ok || !res.text) {
    return { ok: false, latencyMs: Date.now() - t0, errorCode: res.errorCode, error: res.error };
  }
  try {
    const parsed = JSON.parse(res.text) as { esearchresult?: { idlist?: string[]; count?: string } };
    const idlist = parsed.esearchresult?.idlist ?? [];
    const first = idlist[0];
    return {
      ok: true,
      latencyMs: Date.now() - t0,
      totalHits: Number(parsed.esearchresult?.count ?? idlist.length) || 0,
      firstPmid: first && /^\d{1,9}$/.test(first) ? first : undefined,
    };
  } catch (e) {
    return {
      ok: false, latencyMs: Date.now() - t0, errorCode: "INVALID_RESPONSE",
      error: scrubKey(e instanceof Error ? e.message : String(e)),
    };
  }
}

/** Masked key presence for the fabric UI (never the value). */
export function ncbiKeyStatus(): "CONFIGURED" | "MISSING" {
  const { key } = apiKey();
  return key ? "CONFIGURED" : "MISSING";
}


