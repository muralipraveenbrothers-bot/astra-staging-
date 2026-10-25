/**
 * Live model catalog for the Astra Central AI Adapter.
 * Context windows are read from runtime metadata — never assumed.
 */
import { aiGatewayConfig, type AiServiceConfig } from "./config";
import { openaiGetModels } from "./openaiCompatible";

export const HERMES_MIN_CONTEXT = 64_000;

export type CatalogSource = "freellmapi" | "omniroute" | "ollama";

export interface CatalogModel {
  id: string;
  name: string;
  source: CatalogSource;
  contextLength: number | null;
  available: boolean;
  embedding: boolean;
  raw?: Record<string, unknown>;
}

export interface CatalogSnapshot {
  checkedAt: string;
  sources: Record<
    CatalogSource,
    { ok: boolean; error?: string; latencyMs: number; count: number }
  >;
  models: CatalogModel[];
  hermes: {
    requiredContext: number;
    compatible: CatalogModel[];
    recommended: CatalogModel | null;
    localOllama: CatalogModel[];
    note: string;
  };
}

const CACHE_MS = 30_000;
let cache: { at: number; snap: CatalogSnapshot } | null = null;

export function extractContextLength(m: Record<string, unknown>): number | null {
  const nested = m.details;
  const candidates: unknown[] = [
    m.context_length,
    m.context_window,
    m.contextWindow,
    m.max_model_len,
    m.max_context,
    typeof nested === "object" && nested ? (nested as Record<string, unknown>).context_length : undefined,
  ];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c) && c > 0) return Math.trunc(c);
    if (typeof c === "string" && /^\d+$/.test(c.trim())) return parseInt(c.trim(), 10);
  }
  return null;
}

function isEmbedding(m: Record<string, unknown>, id: string): boolean {
  const caps = m.capabilities;
  if (Array.isArray(caps) && caps.includes("embedding") && !caps.includes("completion")) return true;
  return /embed|bge-|e5-|nomic-embed/i.test(id);
}

function parseOpenAiList(json: unknown, source: CatalogSource): CatalogModel[] {
  const data = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((row) => {
      const m = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
      const id = String(m.id ?? m.name ?? "").trim();
      if (!id) return null;
      const available = m.available === false ? false : true;
      return {
        id,
        name: String(m.name ?? id),
        source,
        contextLength: extractContextLength(m),
        available,
        embedding: isEmbedding(m, id),
        raw: { owned_by: m.owned_by, unavailable_reason: m.unavailable_reason } as Record<string, unknown>,
      } satisfies CatalogModel;
    })
    .filter((x) => x !== null) as CatalogModel[];
}

async function ollamaTags(baseUrl: string, timeoutMs = 4000): Promise<{
  ok: boolean;
  latencyMs: number;
  error?: string;
  models: CatalogModel[];
}> {
  const origin = baseUrl.replace(/\/v1\/?$/, "");
  const t0 = Date.now();
  try {
    const res = await fetch(`${origin}/api/tags`, { signal: AbortSignal.timeout(timeoutMs) });
    const latencyMs = Date.now() - t0;
    const json = (await res.json()) as { models?: Record<string, unknown>[] };
    if (!res.ok) return { ok: false, latencyMs, error: `HTTP ${res.status}`, models: [] };
    const models: CatalogModel[] = (json.models ?? []).map((m) => {
      const id = String(m.name ?? m.model ?? "").trim();
      return {
        id,
        name: id,
        source: "ollama" as const,
        contextLength: extractContextLength(m),
        available: true,
        embedding: isEmbedding(m, id),
      };
    });
    return { ok: true, latencyMs, models };
  } catch (e) {
    return {
      ok: false,
      latencyMs: Date.now() - t0,
      error: e instanceof Error ? e.message : String(e),
      models: [],
    };
  }
}

function pickHermesRecommended(models: CatalogModel[]): CatalogModel | null {
  const ok = models.filter(
    (m) =>
      m.available &&
      !m.embedding &&
      m.contextLength != null &&
      m.contextLength >= HERMES_MIN_CONTEXT,
  );
  const primary = ok.filter((m) => m.source === "freellmapi");
  const auto = primary.find((m) => m.id === "auto");
  if (auto) return auto;
  primary.sort((a, b) => (b.contextLength ?? 0) - (a.contextLength ?? 0));
  if (primary[0]) return primary[0];
  const fallback = ok.filter((m) => m.source === "omniroute");
  fallback.sort((a, b) => (b.contextLength ?? 0) - (a.contextLength ?? 0));
  if (fallback[0]) return fallback[0];
  const local = ok.filter((m) => m.source === "ollama");
  local.sort((a, b) => (b.contextLength ?? 0) - (a.contextLength ?? 0));
  return local[0] ?? null;
}

export async function loadModelCatalog(force = false): Promise<CatalogSnapshot> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.snap;
  const cfg = aiGatewayConfig();

  const probeOpenAi = async (svc: AiServiceConfig, source: CatalogSource) => {
    // OmniRoute desktop app (:20128) model list can take 15–35s cold.
    const r = await openaiGetModels(svc.baseUrl, svc.apiKey, source === "omniroute" ? 35_000 : 5000);
    return {
      source,
      ok: r.ok,
      latencyMs: r.latencyMs,
      error: r.error,
      models: r.ok ? parseOpenAiList(r.json, source) : [],
    };
  };

  const [primary, fallback, local] = await Promise.all([
    probeOpenAi(cfg.primary, "freellmapi"),
    probeOpenAi(cfg.fallback, "omniroute"),
    ollamaTags(cfg.ollama.baseUrl),
  ]);

  const models = [...primary.models, ...fallback.models, ...local.models];
  const recommended = pickHermesRecommended(models);
  const compatible = models.filter(
    (m) => m.available && !m.embedding && m.contextLength != null && m.contextLength >= HERMES_MIN_CONTEXT,
  );
  const localOllama = models.filter((m) => m.source === "ollama");

  let note: string;
  if (recommended) {
    note =
      `Hermes-compatible model discovered: ${recommended.id} on ${recommended.source} ` +
      `(context ${recommended.contextLength?.toLocaleString("en-US")} ≥ ${HERMES_MIN_CONTEXT.toLocaleString("en-US")}).`;
  } else {
    const localDesc = localOllama
      .map((m) => `${m.id}:${m.contextLength ?? "unknown"}`)
      .join(", ");
    note =
      `No discovered model advertises context ≥ ${HERMES_MIN_CONTEXT.toLocaleString("en-US")}. ` +
      `Do not reconnect Hermes to a local Ollama model unless its runtime metadata meets that window. ` +
      (localDesc ? `Installed Ollama models: ${localDesc}.` : "Ollama catalog empty or unreachable.");
  }

  const snap: CatalogSnapshot = {
    checkedAt: new Date().toISOString(),
    sources: {
      freellmapi: { ok: primary.ok, error: primary.error, latencyMs: primary.latencyMs, count: primary.models.length },
      omniroute: { ok: fallback.ok, error: fallback.error, latencyMs: fallback.latencyMs, count: fallback.models.length },
      ollama: { ok: local.ok, error: local.error, latencyMs: local.latencyMs, count: local.models.length },
    },
    models,
    hermes: {
      requiredContext: HERMES_MIN_CONTEXT,
      compatible,
      recommended,
      localOllama,
      note,
    },
  };
  cache = { at: Date.now(), snap };
  return snap;
}

export function pickLocalChatModel(models: CatalogModel[]): string | null {
  const chat = models.filter((m) => m.source === "ollama" && m.available && !m.embedding);
  return chat[0]?.id ?? null;
}
