// ======================================================
import { canonicalPort, portEntries } from "../../server/astra/supervisor/portRegistry";

const FREELLMAPI_HOST = portEntries().freellmapi.host;
const FREELLMAPI_PORT = canonicalPort("freellmapi");

// ASTRA AI — UNIFIED GATEWAY MANAGER (single routing system)
// ------------------------------------------------------
//   Priority #1  FreeLLMAPI (PRIMARY)         API + dashboard on the canonical registry port (single process)
//   Priority #2  OmniRoute   (SECONDARY)      API http://127.0.0.1:20128 /v1  · Dashboard http://127.0.0.1:20128/home
//     (desktop Electron app — verified live 2026-09-09: 3627 models, streaming OK.
//      Uses /v1/* NOT /api/v1/*. Override via OMNIROUTE_BASE_URL in config/ai-gateway.env.)
//   Priority #3  Ollama      (LOCAL FALLBACK) API http://127.0.0.1:11434 /v1  — backend only, not a browser gateway
//
// Port ownership (native Astra stack — CANONICAL, mirrored from config/ports.json):
//   FreeLLMAPI (PRIMARY)          dashboard HTML + Express API — ONE process
//   20128 OmniRoute desktop app    dashboard HTML + /v1 (single process)
//   5173  Astra Vite               /proxy/freellmapi → canonical FreeLLMAPI port, /proxy/omni → :20128
//
// RETIRED — NEVER REINTRODUCE the old two-process API/UI ports. FreeLLMAPI now serves both from
// canonical port. Using either retired port makes a live gateway report OFFLINE.
// server/astra/supervisor/stack-contract.spec.ts fails the build if they return.
// Use 127.0.0.1 (IPv4) in every loopback URL: Windows `localhost` often resolves to ::1.
//
// Every Astra AI chat/stream request goes through THIS manager:
//   Astra AI → FreeLLMAPI (/v1/chat/completions) → SUCCESS → response
//   Astra AI → FreeLLMAPI → FAIL (down / timeout / 429 / 5xx / model missing)
//            → OmniRoute (/v1/chat/completions) → provider routing → response
//
// Rules enforced here:
//   • FreeLLMAPI is attempted FIRST on every request — OmniRoute is never
//     called when the primary succeeds (no unnecessary fallback traffic).
//   • Automatic failover with NO user action and NO dashboard dependency.
//   • Automatic recovery: the primary is retried on every new request, so
//     the moment FreeLLMAPI comes back it serves again (no restart needed).
//   • Streaming: if FreeLLMAPI fails BEFORE the stream begins, OmniRoute
//     streams instead. An already-started successful stream is never
//     interrupted.
//   • Both gateways offline → a single honest error (no infinite loop,
//     no fabricated responses).
//
// Dashboard URLs are ADMIN-ONLY views (/ui) and are never part of the
// request path. Closing a dashboard tab never affects API operation.
// ======================================================

export type GatewayId = "freellmapi" | "omniroute";

export interface GatewayDef {
  id: GatewayId;
  name: string;
  role: "PRIMARY" | "SECONDARY";
  /** OpenAI-compatible base URL (same-origin vite proxy → real backend). */
  baseUrl: string;
  /** Human-facing dashboard URL (browser/iframe target — NOT the API port). */
  dashboardUrl: string;
  /**
   * Real API gateway URL used for server-side calls and health probes.
   * NEVER exposed to the browser directly — API keys live server-side.
   * FreeLLMAPI: registry-derived /v1 endpoint
   * OmniRoute:  http://127.0.0.1:20128/v1  (desktop app — dashboard + API, single process)
   */
  apiBaseUrl: string;
  /** Dashboard port (human-facing UI). FreeLLMAPI uses the registry port; OmniRoute=20128. */
  dashboardPort: number;
  /** API gateway port. FreeLLMAPI uses the registry port; OmniRoute=20128 (same-process). */
  port: number;
}

/** The TWO gateways, in strict priority order. Nothing else exists. */
export const GATEWAYS: Record<GatewayId, GatewayDef> = {
  freellmapi: {
    id: "freellmapi",
    name: "FreeLLMAPI",
    role: "PRIMARY",
    // Same-origin Vite proxy path — browser-safe, key stays on server.
    baseUrl: "/proxy/freellmapi/v1",
    // Dashboard UI is served by the FreeLLMAPI process itself on its registry port — the
    // same port as the API. (The old UI/API port split is retired.)
    // 127.0.0.1 forces IPv4 (Windows `localhost` often resolves to ::1).
    // Open / iframe land on the origin root; the health probe uses the origin
    // root (see gatewayDashboardProbeUrl) so an app-route error cannot fake OFFLINE.
    dashboardUrl: `http://${FREELLMAPI_HOST}:${FREELLMAPI_PORT}/`,
    // Direct API gateway — server-side only, never called from the browser.
    apiBaseUrl: `http://${FREELLMAPI_HOST}:${FREELLMAPI_PORT}/v1`,
    dashboardPort: FREELLMAPI_PORT,
    port: FREELLMAPI_PORT,
  },
  omniroute: {
    id: "omniroute",
    name: "OmniRoute",
    role: "SECONDARY",
    baseUrl: "/proxy/omni/v1",
    // OmniRoute desktop Electron app — dashboard UI and /v1 API share port 20128.
    // (Verified live 2026-09-09.) Uses /v1/* NOT /api/v1/*.
    dashboardUrl: "http://127.0.0.1:20128/home",
    apiBaseUrl: "http://127.0.0.1:20128/v1",
    dashboardPort: 20128,
    port: 20128,
  },
};

/** Gateway order = priority order: FreeLLMAPI first, then OmniRoute. */
export const GATEWAY_PRIORITY: GatewayId[] = ["freellmapi", "omniroute"];

/**
 * Dashboard reachability probe URL. Always the origin root so a 200 proves
 * the UI process is up, independent of /models/chat or /home app-route errors.
 */
export function gatewayDashboardProbeUrl(g: GatewayDef): string {
  try {
    return `${new URL(g.dashboardUrl).origin}/`;
  } catch {
    return g.dashboardUrl;
  }
}

/** Error thrown only when EVERY gateway in the chain fails. */
export class AllGatewaysFailedError extends Error {
  constructor(details: string[]) {
    super(
      `All gateways failed. FreeLLMAPI (primary), OmniRoute (fallback), and Ollama (local fallback) are unavailable.\n${details.join("\n")}`,
    );
    this.name = "AllGatewaysFailedError";
  }
}

const REQUEST_TIMEOUT_MS = 60_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
export interface GatewayManagerChatOptions {
  body: Record<string, unknown>;
}

/**
 * Browser → Astra backend /api/ai/chat → FreeLLMAPI primary → OmniRoute fallback.
 * Keys never leave the server. Do not call /proxy/freellmapi or /proxy/omni
 * from the browser for chat.
 */
export async function gatewayChat(
  { body }: GatewayManagerChatOptions,
): Promise<{ gateway: GatewayDef; response: Response }> {
  const res = await fetchWithTimeout("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (res.ok) {
    const used = (res.headers.get("x-astra-service") as GatewayId | null) ?? "freellmapi";
    return { gateway: GATEWAYS[used] ?? GATEWAYS.freellmapi, response: res };
  }

  const detail = await res.text().catch(() => "");
  let parsed: { details?: string[]; message?: string } = {};
  try {
    parsed = JSON.parse(detail);
  } catch {
    /* not json */
  }
  throw new AllGatewaysFailedError(parsed.details ?? [parsed.message ?? `HTTP ${res.status} ${detail.slice(0, 200)}`]);
}

/**
 * Real gateway health check against the ACTUAL /v1 API (never the /ui
 * dashboard page). Used by the Plugin Center status dots.
 */
export interface GatewayHealthResult {
  online: boolean;
  latencyMs: number;
  detail: string;
  /** Reachability of the actual dashboard UI (separate from the API). */
  dashboardOnline: boolean;
  dashboardDetail: string;
}

/**
 * Real gateway health check against the ACTUAL /v1 API (never the /ui
 * dashboard page). Used by the Plugin Center status dots.
 *
 * IMPORTANT (regression fix): the /proxy/* route is a vite dev-server proxy.
 * When the upstream service process is DOWN, the proxy itself answers HTTP
 * 500 — that says nothing about the dashboard, and a dashboard probe must
 * therefore be independent. The dashboard probe uses a no-cors fetch: it
 * resolves whenever the real server answers on its port and rejects only on
 * connection refused / timeout, so a working dashboard is never reported
 * offline just because one API endpoint errors.
 */
export async function gatewayHealth(g: GatewayDef, timeoutMs = 8000): Promise<GatewayHealthResult> {
  const started = Date.now();
  let api: { online: boolean; latencyMs: number; detail: string };
  try {
    const res = await fetch("/api/runtime/status", { signal: AbortSignal.timeout(timeoutMs) });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      api = { online: false, latencyMs, detail: `Astra /api/runtime/status HTTP ${res.status}` };
    } else {
      const data = (await res.json()) as {
        services?: Record<string, { online?: boolean; api?: boolean; ui?: boolean; detail?: string; latencyMs?: number; level?: string }>;
      };
      const svc = data.services?.[g.id];
      api = {
        online: Boolean(svc?.api || svc?.online),
        latencyMs: svc?.latencyMs ?? latencyMs,
        detail: svc?.detail ?? (svc?.online ? "reachable" : "unreachable"),
      };
    }
  } catch (e: any) {
    api = {
      online: false,
      latencyMs: Date.now() - started,
      detail: e?.name === "TimeoutError" || e?.name === "AbortError" ? "timeout" : (e?.message ?? "unreachable"),
    };
  }

  // Independent dashboard reachability probe (no-cors: opaque response still
  // proves the server answered on its port; rejection = connection refused).
  let dashboardOnline = false;
  let dashboardDetail = "unreachable";
  const dStarted = Date.now();
  const dController = new AbortController();
  const dTimer = setTimeout(() => dController.abort(), timeoutMs);
  try {
    await fetch(gatewayDashboardProbeUrl(g), { signal: dController.signal, mode: "no-cors" });
    dashboardOnline = true;
    dashboardDetail = `reachable (${Date.now() - dStarted}ms)`;
  } catch (e: any) {
    dashboardDetail = e?.name === "AbortError" ? "timeout" : (e?.cause?.code ?? e?.message ?? "unreachable");
  } finally {
    clearTimeout(dTimer);
  }

  return { ...api, dashboardOnline, dashboardDetail };
}
