/**
 * ASTRA AI — NCBI / PUBMED CLIENT SPEC (vitest; server-side)
 * ============================================================================
 * Covers Phases 3/4/5/15 invariants:
 *  - the API key is NEVER present in any error, URL leak, or returned payload
 *  - structured error codes: AUTH_FAILED / RATE_LIMITED / TIMEOUT /
 *    SOURCE_UNAVAILABLE / INVALID_RESPONSE / CONFIG_REQUIRED
 *  - bounded retries only (never infinite)
 *  - no fabricated PMIDs: empty result → articles: []; unreachable → ok:false
 *  - mandatory provenance on every article
 * NCBI is mocked at fetch level — no live calls in tests.
 */
import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";

vi.mock("../ai/loadEnv", () => ({
  // Deterministic env in tests: no .env file loading, no real key.
  loadBackendEnv: () => ({ loadedFiles: [], appliedKeys: [] }),
  maskSecret: (v?: string) => (v && v.trim() && !v.includes("xxxx") ? "set" : "missing"),
}));

import {
  searchPubMed,
  probePubMed,
  scrubKey,
  assertAllowedUrl,
  ncbiKeyStatus,
} from "./ncbiClient";

const KEY = "astra-test-key-0042";
const ESEARCH_OK = JSON.stringify({ esearchresult: { count: "2", idlist: ["42728126", "39003747"] } });
const ESEARCH_EMPTY = JSON.stringify({ esearchresult: { count: "0", idlist: [] } });
const ESUMMARY_OK = JSON.stringify({
  result: {
    "42728126": {
      title: "Acute pancreatitis: updated evidence and management",
      fulljournalname: "Gut",
      pubdate: "2026 Jan",
      authors: [{ name: "Tenner S", authtype: "Author" }, { name: "Editorial Bot", authtype: "pubmed" }],
      articleids: [{ idtype: "doi", value: "10.1136/gutjnl-2026-test" }, { idtype: "pubmed", value: "42728126" }],
    },
    "39003747": {
      title: "Fluid therapy in acute pancreatitis",
      fulljournalname: "Lancet Gastroenterology & Hepatology",
      pubdate: "2025 Mar",
      authors: [{ name: "Working Group", authtype: "collective" }],
      sortfirstauthor: "Working Group",
    },
  },
});
const EFETCH_OK = "1. Tenner S, et al. Acute pancreatitis: updated evidence and management.\n\nBACKGROUND:\nUpdated guidance with serial monitoring and early fluids.\n\n2. Working Group. Fluid therapy in acute pancreatitis.\n\nBACKGROUND:\nIsotonic crystalloids remain first line.";

function jsonResponse(status: number, body: string, headers?: Record<string, string>): Response {
  return new Response(body, { status, headers: { "content-type": "application/json", ...headers } });
}

/** install a fetch mock that routes by eutils path */
function mockFetch(routes: { match: RegExp; respond: () => Response | Promise<Response> }[]): Mock {
  const fn = vi.fn(async (url: string | URL): Promise<Response> => {
    const s = String(url);
    for (const r of routes) if (r.match.test(s)) return r.respond();
    throw new Error(`unmocked URL: ${scrubKey(s)}`);
  });
  vi.stubGlobal("fetch", fn);
  return fn as unknown as Mock;
}

describe("NCBI key hygiene", () => {
  beforeEach(() => { process.env.NCBI_API_KEY = KEY; });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.NCBI_API_KEY; });

  it("scrubKey redacts the raw key and any api_key parameter", () => {
    const leak = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?term=x&api_key=${KEY}`;
    const out = scrubKey(leak);
    expect(out).not.toContain(KEY);
    expect(out).toContain("api_key=***");
    expect(scrubKey(`boom ${KEY} end`)).toBe("boom *** end");
  });

  it("reports key presence without exposing the value", () => {
    expect(ncbiKeyStatus()).toBe("CONFIGURED");
    delete process.env.NCBI_API_KEY;
    expect(ncbiKeyStatus()).toBe("MISSING");
    process.env.NCBI_API_KEY = KEY;
  });

  it("assertAllowedUrl blocks non-NCBI egress", () => {
    expect(() => assertAllowedUrl("https://evil.example.com/x")).toThrow(/egress denied/);
    expect(() => assertAllowedUrl("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?api_key=1")).not.toThrow();
  });
});

describe("research.pubmed.search", () => {
  beforeEach(() => { process.env.NCBI_API_KEY = KEY; });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.NCBI_API_KEY; });

  it("returns CONFIG_REQUIRED without fabricating anything when the key is missing", async () => {
    delete process.env.NCBI_API_KEY;
    const fetchMock = mockFetch([]); // must never be called
    const res = await searchPubMed({ query: "acute pancreatitis" });
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe("CONFIG_REQUIRED");
    expect(res.articles).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps 401 to AUTH_FAILED and fails fast (no retry storm)", async () => {
    const fetchMock = mockFetch([{ match: /esearch\.fcgi/, respond: () => jsonResponse(401, "invalid api key") }]);
    const res = await searchPubMed({ query: "sepsis" });
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe("AUTH_FAILED");
    expect(fetchMock.mock.calls.length).toBe(1);
    expect(JSON.stringify(res)).not.toContain(KEY);
  });

  it("maps 429 to RATE_LIMITED with bounded retries (≤3 attempts, honors Retry-After)", async () => {
    const fetchMock = mockFetch([{ match: /esearch\.fcgi/, respond: () => jsonResponse(429, "slow down", { "retry-after": "0" }) }]);
    const res = await searchPubMed({ query: "sepsis", maxResults: 1 });
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe("RATE_LIMITED");
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(3);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  it("maps network failure to SOURCE_UNAVAILABLE (never fake results)", async () => {
    mockFetch([{ match: /esearch\.fcgi/, respond: () => { throw new TypeError("fetch failed"); } }]);
    const res = await searchPubMed({ query: "sepsis" });
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe("SOURCE_UNAVAILABLE");
    expect(res.articles).toBeUndefined();
  });

  it("maps abort/timeout to TIMEOUT", async () => {
    const err = new Error("The operation was aborted due to timeout");
    err.name = "TimeoutError";
    mockFetch([{ match: /esearch\.fcgi/, respond: () => { throw err; } }]);
    const res = await searchPubMed({ query: "sepsis" });
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe("TIMEOUT");
  });

  it("maps unparseable JSON to INVALID_RESPONSE", async () => {
    mockFetch([{ match: /esearch\.fcgi/, respond: () => jsonResponse(200, "<html>not json</html>") }]);
    const res = await searchPubMed({ query: "sepsis" });
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe("INVALID_RESPONSE");
  });

  it("returns an honest EMPTY result (ok, zero articles) — never a fabricated PMID", async () => {
    mockFetch([{ match: /esearch\.fcgi/, respond: () => jsonResponse(200, ESEARCH_EMPTY) }]);
    const res = await searchPubMed({ query: "zzzzz-no-such-evidence" });
    expect(res.ok).toBe(true);
    expect(res.articles).toEqual([]);
    expect(res.totalHits).toBe(0);
  });

  it("returns real provenance: pmid, title, journal, doi, retrievedAt", async () => {
    mockFetch([
      { match: /esearch\.fcgi/, respond: () => jsonResponse(200, ESEARCH_OK) },
      { match: /esummary\.fcgi/, respond: () => jsonResponse(200, ESUMMARY_OK) },
      { match: /efetch\.fcgi/, respond: () => new Response(EFETCH_OK, { status: 200, headers: { "content-type": "text/plain" } }) },
    ]);
    const res = await searchPubMed({ query: "acute pancreatitis", maxResults: 2 });
    expect(res.ok).toBe(true);
    expect(res.totalHits).toBe(2);
    const first = res.articles?.[0];
    expect(first).toBeDefined();
    expect(first!.source).toBe("PubMed");
    expect(first!.pmid).toBe("42728126");
    expect(first!.title).toContain("pancreatitis");
    expect(first!.journal).toBe("Gut");
    expect(first!.doi).toBe("10.1136/gutjnl-2026-test");
    expect(first!.publicationDate).toBe("2026 Jan");
    expect(first!.authors?.[0]).toBe("Tenner S");
    expect(first!.abstract).toContain("early fluids");
    expect(first!.retrievedAt).toBeTruthy();
    for (const a of res.articles ?? []) {
      expect(a.source).toBe("PubMed");
      expect(/^\d{1,9}$/.test(a.pmid)).toBe(true);
      expect(a.retrievedAt).toBeTruthy();
    }
    expect(JSON.stringify(res)).not.toContain(KEY);
  });

  it("omits absent metadata instead of inventing it", async () => {
    mockFetch([
      { match: /esearch\.fcgi/, respond: () => jsonResponse(200, ESEARCH_OK) },
      { match: /esummary\.fcgi/, respond: () => jsonResponse(200, "{}") },
      { match: /efetch\.fcgi/, respond: () => new Response("no usable abstract text here", { status: 200 }) },
    ]);
    const res = await searchPubMed({ query: "q", maxResults: 2 });
    expect(res.ok).toBe(true);
    for (const a of res.articles ?? []) {
      expect(a.title).toBeUndefined();
      expect(a.abstract).toBeUndefined();
    }
  });
});

describe("probePubMed (safe probe)", () => {
  beforeEach(() => { process.env.NCBI_API_KEY = KEY; });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.NCBI_API_KEY; });

  it("returns masked proof facts on success", async () => {
    mockFetch([{ match: /esearch\.fcgi/, respond: () => jsonResponse(200, ESEARCH_OK) }]);
    const res = await probePubMed("acute pancreatitis");
    expect(res.ok).toBe(true);
    expect(res.firstPmid).toBe("42728126");
    expect(res.totalHits).toBe(2);
    expect(res.latencyMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(res)).not.toContain(KEY);
  });

  it("never throws — failures come back structured", async () => {
    mockFetch([{ match: /esearch\.fcgi/, respond: () => { throw new TypeError("fetch failed"); } }]);
    const res = await probePubMed("x");
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe("SOURCE_UNAVAILABLE");
  });
});

describe("egress guard", () => {
  it("refuses any non-eutils host before fetch is ever touched", () => {
    expect(() => assertAllowedUrl("https://pubmed.evil.io/steal")).toThrow(/egress denied/);
  });
});


