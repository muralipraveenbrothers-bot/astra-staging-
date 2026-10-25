// ASTRA AI — EXTERNAL ADAPTER
// Node 20 native fetch wrapper for free public APIs (no API keys required).
// Routes: PubMed (NCBI eutils), Europe PMC, ClinicalTrials.gov, RxNav, Voicebox, Ollama.

export interface ExternalRoute {
  id: string;
  baseUrl: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  queryDefaults?: Record<string, string>;
  timeoutMs?: number;
}

export const FREE_ROUTES: Record<string, ExternalRoute> = {
  "pubmed-search": {
    id: "pubmed-search",
    baseUrl: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi",
    method: "GET",
    queryDefaults: { db: "pubmed", retmode: "json", retmax: "20" },
    timeoutMs: 10000,
  },
  "pubmed-summary": {
    id: "pubmed-summary",
    baseUrl: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi",
    method: "GET",
    queryDefaults: { db: "pubmed", retmode: "json" },
    timeoutMs: 10000,
  },
  "europepmc-search": {
    id: "europepmc-search",
    baseUrl: "https://www.ebi.ac.uk/europepmc/webservices/rest/search",
    method: "GET",
    queryDefaults: { format: "json", pageSize: "20" },
    timeoutMs: 10000,
  },
  "clinicaltrials-search": {
    id: "clinicaltrials-search",
    baseUrl: "https://clinicaltrials.gov/api/v2/studies",
    method: "GET",
    queryDefaults: { pageSize: "20" },
    timeoutMs: 10000,
  },
  "rxnav-interaction": {
    id: "rxnav-interaction",
    baseUrl: "https://rxnav.nlm.nih.gov/REST/interaction/list.json",
    method: "GET",
    timeoutMs: 10000,
  },
  "rxnav-find": {
    id: "rxnav-find",
    baseUrl: "https://rxnav.nlm.nih.gov/REST/drugs.json",
    method: "GET",
    timeoutMs: 10000,
  },
  "voicebox-health": {
    id: "voicebox-health",
    baseUrl: "http://127.0.0.1:17493/health",
    method: "GET",
    timeoutMs: 4000,
  },
  "voicebox-tts": {
    id: "voicebox-tts",
    baseUrl: "http://127.0.0.1:17493/api/tts",
    method: "POST",
    timeoutMs: 15000,
  },
  "ollama-tags": {
    id: "ollama-tags",
    baseUrl: "http://127.0.0.1:11434/api/tags",
    method: "GET",
    timeoutMs: 4000,
  },
  "ollama-generate": {
    id: "ollama-generate",
    baseUrl: "http://127.0.0.1:11434/api/generate",
    method: "POST",
    timeoutMs: 60000,
  },
};

export interface ExternalCallOptions {
  routeId: string;
  query?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
}

export interface ExternalCallResult {
  ok: boolean;
  status: number;
  data: unknown;
  routeId: string;
  latencyMs: number;
  error?: string;
}

export class ExternalAdapter {
  private readonly routes: Record<string, ExternalRoute>;

  constructor(routes: Record<string, ExternalRoute> = FREE_ROUTES) {
    this.routes = routes;
  }

  getRoutes(): string[] {
    return Object.keys(this.routes);
  }

  hasRoute(routeId: string): boolean {
    return routeId in this.routes;
  }

  async call(options: ExternalCallOptions): Promise<ExternalCallResult> {
    const route = this.routes[options.routeId];
    if (!route) {
      return { ok: false, status: 0, data: null, routeId: options.routeId, latencyMs: 0, error: `unknown route: ${options.routeId}` };
    }
    const started = Date.now();
    const timeoutMs = options.timeoutMs ?? route.timeoutMs ?? 10000;
    const retries = options.retries ?? 1;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const url = this.buildUrl(route, options.query ?? {});
        const init: RequestInit = {
          method: route.method ?? "GET",
          headers: { Accept: "application/json", ...(route.headers ?? {}) },
          signal: controller.signal,
        };
        if (options.body !== undefined) {
          init.headers = { ...(init.headers as Record<string, string>), "Content-Type": "application/json" };
          init.body = JSON.stringify(options.body);
        }
        const res = await fetch(url, init);
        clearTimeout(timer);
        let data: unknown = null;
        const text = await res.text();
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = text;
        }
        const latencyMs = Date.now() - started;
        if (!res.ok) {
          return { ok: false, status: res.status, data, routeId: options.routeId, latencyMs, error: `HTTP ${res.status}` };
        }
        return { ok: true, status: res.status, data, routeId: options.routeId, latencyMs };
      } catch (err) {
        clearTimeout(undefined as unknown as ReturnType<typeof setTimeout>);
        const message = err instanceof Error ? err.message : String(err);
        const isAbort = message.includes("abort") || message.includes("timed out");
        if (attempt < retries && !isAbort) continue;
        return { ok: false, status: 0, data: null, routeId: options.routeId, latencyMs: Date.now() - started, error: message };
      }
    }
    return { ok: false, status: 0, data: null, routeId: options.routeId, latencyMs: Date.now() - started, error: "unreachable" };
  }

  async ping(routeId: string, timeoutMs = 4000): Promise<boolean> {
    const result = await this.call({ routeId, timeoutMs, retries: 0 });
    return result.ok;
  }

  private buildUrl(route: ExternalRoute, query: Record<string, string>): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(route.queryDefaults ?? {})) params.set(k, v);
    for (const [k, v] of Object.entries(query)) params.set(k, v);
    const qs = params.toString();
    return qs ? `${route.baseUrl}?${qs}` : route.baseUrl;
  }
}

export const ExternalAdapterInstance = new ExternalAdapter();