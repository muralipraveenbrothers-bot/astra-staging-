import { aiGatewayConfig, publicServiceView, type AiServiceConfig } from "./config";
import { openaiGetModels } from "./openaiCompatible";
import { probeHermes } from "../agents/hermesAdapter";
import { getAiProvidersHealth } from "./providerRegistry";

export interface ServiceHealth {
  id: string;
  name: string;
  role: string;
  endpoint: string;
  dashboardUrl: string;
  reachable: boolean;
  authenticated: boolean | null;
  models: boolean | null;
  chat: boolean | null;
  latencyMs: number;
  keyConfigured: boolean;
  error?: string;
  checkedAt: string;
}

async function probeHttp(url: string, timeoutMs = 2500, headers: Record<string, string> = {}): Promise<{
  reachable: boolean;
  status: number;
  latencyMs: number;
  error?: string;
}> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    return { reachable: true, status: res.status, latencyMs: Date.now() - t0 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      reachable: false,
      status: 0,
      latencyMs: Date.now() - t0,
      error: msg.includes("abort") || msg.includes("Timeout") ? "timeout" : "connection refused",
    };
  }
}

async function probeOpenAiGateway(svc: AiServiceConfig): Promise<ServiceHealth> {
  const checkedAt = new Date().toISOString();
  // OmniRoute desktop app (:20128) serves both dashboard HTML (fast, <1s) and
  // the OpenAI-compatible API under /v1. The /v1/models endpoint can take
  // 15–35s when cold — probing it directly caused false OFFLINE reports.
  // Strategy: probe the cheap root "/" first (fast). If root is up, mark
  // reachable immediately, then optionally verify /v1/models in background.
  if (svc.id === "omniroute") {
    const rootUrl = svc.baseUrl.replace(/\/v1\/?$/, "");
    const rootProbe = await probeHttp(rootUrl, 3000);
    if (rootProbe.reachable) {
      // Fast path: root is up → OmniRoute desktop app is running.
      // Verify /v1/models with a short timeout to confirm API is functional.
      const modelsCheck = await openaiGetModels(svc.baseUrl, svc.apiKey, 8000);
      return {
        ...publicServiceView(svc),
        reachable: true,
        authenticated: modelsCheck.status === 401 || modelsCheck.status === 403 ? false : true,
        models: modelsCheck.ok,
        chat: null,
        latencyMs: rootProbe.latencyMs,
        keyConfigured: svc.keyPresent,
        error: modelsCheck.ok ? undefined : `root OK, /v1/models: ${modelsCheck.error ?? "unknown"}`,
        checkedAt,
      };
    }
    // Root is down → OmniRoute app is closed. Try /v1/models anyway in case
    // only the dashboard HTML is slow but API responds.
    const models = await openaiGetModels(svc.baseUrl, svc.apiKey, 15_000);
    const reachable = models.status !== 0;
    return {
      ...publicServiceView(svc),
      reachable,
      authenticated: models.status === 401 || models.status === 403 ? false : models.ok ? true : reachable ? null : false,
      models: models.ok,
      chat: null,
      latencyMs: models.latencyMs,
      keyConfigured: svc.keyPresent,
      error: models.ok ? undefined : models.error ?? (reachable ? `HTTP ${models.status}` : "unreachable — OmniRoute desktop app may be closed"),
      checkedAt,
    };
  }
  // Non-OmniRoute services: standard /v1/models probe
  const timeoutMs = 4000;
  const models = await openaiGetModels(svc.baseUrl, svc.apiKey, timeoutMs);
  const reachable = models.status !== 0;
  const authenticated = models.status === 401 || models.status === 403 ? false : models.ok ? true : reachable ? null : false;
  return {
    ...publicServiceView(svc),
    reachable,
    authenticated,
    models: models.ok,
    chat: null,
    latencyMs: models.latencyMs,
    keyConfigured: svc.keyPresent,
    error: models.ok ? undefined : models.error ?? (reachable ? `HTTP ${models.status}` : "unreachable"),
    checkedAt,
  };
}

async function probeSimple(svc: AiServiceConfig, paths: string[]): Promise<ServiceHealth> {
  const checkedAt = new Date().toISOString();
  // Annotate explicitly: initialising with `error: "..."` inferred a *required*
  // `error: string | undefined` property, which then rejected probeHttp()'s
  // return value (where `error` is optional) with TS2322.
  let last: { reachable: boolean; status: number; latencyMs: number; error?: string } = {
    reachable: false, status: 0, latencyMs: 0, error: "unreachable",
  };
  for (const p of paths) {
    const url = `${svc.baseUrl.replace(/\/+$/, "")}${p}`;
    const headers: Record<string, string> = {};
    if (svc.id === "n8n" && svc.apiKey) headers["X-N8N-API-KEY"] = svc.apiKey;
    else if (svc.id === "paperclip" && svc.apiKey) headers.Authorization = `Bearer ${svc.apiKey}`;
    last = await probeHttp(url, 2500, headers);
    if (last.reachable) break;
  }
  return {
    ...publicServiceView(svc),
    reachable: last.reachable,
    authenticated: last.status === 401 || last.status === 403 ? false : last.reachable && last.status < 400 ? true : null,
    models: null,
    chat: null,
    latencyMs: last.latencyMs,
    keyConfigured: svc.keyPresent,
    error: last.reachable ? (last.status >= 400 ? `HTTP ${last.status}` : undefined) : last.error,
    checkedAt,
  };
}

export async function collectAiHealth(): Promise<{
  checkedAt: string;
  primary: string;
  fallback: string;
  local: string;
  adapter: string;
  services: Record<string, ServiceHealth>;
}> {
  const cfg = aiGatewayConfig();
  const [freellmapi, omniroute, ollama, paperclip, n8n, openclaw, hermesCli, voicebox, agentzero, openhands] = await Promise.all([
    probeOpenAiGateway(cfg.primary),
    probeOpenAiGateway(cfg.fallback),
    probeOpenAiGateway(cfg.local),
    probeSimple(cfg.paperclip, ["/api/health", "/"]),
    probeSimple(cfg.n8n, ["/healthz", "/api/v1/workflows", "/"]),
    probeSimple(cfg.openclaw, ["/", "/health"]),
    probeHermes().then((h) => {
      const reachable = h.status === "LIVE";
      return {
        ...publicServiceView(cfg.hermes),
        reachable,
        authenticated: h.status === "LIVE" ? true : null,
        models: null,
        chat: null,
        latencyMs: 0,
        keyConfigured: cfg.hermes.keyPresent,
        error: h.status === "LIVE" ? undefined : h.detail || h.status,
        checkedAt: new Date().toISOString(),
      } satisfies ServiceHealth;
    }),
    probeHttp("http://127.0.0.1:17493/health").then((p) => ({
      id: "voicebox",
      name: "Voicebox",
      role: "VOICE INTERFACE",
      endpoint: "http://127.0.0.1:17493",
      dashboardUrl: "http://127.0.0.1:17493/docs",
      reachable: p.reachable,
      authenticated: p.reachable && p.status < 400 ? true : null,
      models: null,
      chat: null,
      latencyMs: p.latencyMs,
      keyConfigured: false,
      error: p.reachable ? (p.status >= 400 ? `HTTP ${p.status}` : undefined) : p.error,
      checkedAt: new Date().toISOString(),
    } satisfies ServiceHealth)),
    probeSimple(cfg.agentzero, ["/api/health", "/"]),
    probeSimple(cfg.openhands, ["/server_info", "/"]),
  ]);

  const langgraph: ServiceHealth = {
    ...publicServiceView(cfg.langgraph),
    reachable: true,
    authenticated: true,
    models: null,
    chat: null,
    latencyMs: 0,
    keyConfigured: false,
    checkedAt: new Date().toISOString(),
  };

  const providerHealth = await getAiProvidersHealth();
  const geminiH = providerHealth.find((p) => p.id === "gemini");
  const gemini: ServiceHealth = {
    id: "gemini",
    name: "Google Gemini",
    role: "CLINICAL / VISION PROVIDER",
    endpoint: "https://generativelanguage.googleapis.com/v1beta",
    dashboardUrl: "",
    reachable: geminiH?.status === "healthy" || geminiH?.status === "degraded",
    authenticated: geminiH?.status === "healthy" ? true : geminiH?.keyConfigured ? false : null,
    models: geminiH?.status === "healthy" ? true : null,
    chat: null,
    latencyMs: geminiH?.latencyMs ?? 0,
    keyConfigured: Boolean(geminiH?.keyConfigured),
    error: geminiH?.status === "healthy" ? undefined : geminiH?.detail ?? "GEMINI_API_KEY not configured",
    checkedAt: geminiH?.checkedAt ?? new Date().toISOString(),
  };

  const astra: ServiceHealth = {
    id: "astra",
    name: "Astra backend",
    role: "ORCHESTRATION",
    endpoint: "http://127.0.0.1:3000/api/health",
    dashboardUrl: "http://127.0.0.1:5173/",
    reachable: true,
    authenticated: true,
    models: null,
    chat: null,
    latencyMs: 0,
    keyConfigured: false,
    checkedAt: new Date().toISOString(),
  };

  return {
    checkedAt: new Date().toISOString(),
    primary: "freellmapi",
    fallback: "omniroute",
    local: "ollama",
    adapter: cfg.adapter.publicUrl,
    services: {
      freellmapi,
      omniroute,
      ollama,
      hermes: hermesCli,
      langgraph,
      voicebox,
      gemini,
      astra,
    },
  };
}
