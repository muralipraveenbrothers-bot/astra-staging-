/**
 * ASTRA AI — Internal Service Registry
 * ============================================================================
 * Central registry for all ASTRA-managed internal services (FreeLLMAPI, OmniRoute, etc.).
 * Other ASTRA modules resolve internal service endpoints and health status through
 * this registry rather than hardcoding random localhost URLs.
 *
 * Native Astra stack (proven port ownership):
 *   FreeLLMAPI API + dashboard from config/ports.json (single process)
 *   OmniRoute API+UI            http://127.0.0.1:20128 (desktop Electron app — single process)
 */
import { canonicalPort, portEntries } from "../astra/supervisor/portRegistry";

const freellmOrigin = `http://${portEntries().freellmapi.host}:${canonicalPort("freellmapi")}`;

export interface ServiceDescriptor {
  id: string;
  serviceId?: string;
  name: string;
  primaryDuty?: string;
  status: "HEALTHY" | "DEGRADED" | "OFFLINE" | "NOT_INSTALLED" | "ACTIVE";
  internal: boolean;
  /** OpenAI-compatible / admin API origin (server-side). */
  endpoint: string;
  url?: string;
  type?: "api" | "browser" | "plugin" | "runtime";
  /** Human-facing dashboard origin. Same origin as endpoint — FreeLLMAPI serves both from one port. */
  dashboardEndpoint?: string;
  healthEndpoint: string;
  apiCapability?: boolean;
  embedCapability?: boolean;
  permissions?: string[];
  actions?: string[];
  toolHandlers?: string[];
  fallback?: string;
  browserDestination?: string;
  version: string;
  capabilities: string[];
  uptime?: number;
}

const CANONICAL: Record<string, ServiceDescriptor> = {
  freellmapi: {
    id: "freellmapi",
    name: "FreeLLMAPI",
    status: "OFFLINE",
    internal: true,
    endpoint: freellmOrigin,
    dashboardEndpoint: `${freellmOrigin}/`,
    healthEndpoint: `${freellmOrigin}/api/ping`,
    version: "0.9.0",
    capabilities: ["provider-management", "model-catalog", "openai-proxy", "request-analytics"],
    actions: ["read-models", "read-health", "proxy-completion"],
    toolHandlers: ["aiGatewayChat"],
    fallback: "OmniRoute, then Ollama local runtime.",
  },
  omniroute: {
    id: "omniroute",
    name: "OmniRoute",
    status: "OFFLINE",
    internal: true,
    endpoint: "http://127.0.0.1:20128",
    dashboardEndpoint: "http://127.0.0.1:20128/home",
    healthEndpoint: "http://127.0.0.1:20128/v1/models",
    version: "3.8.50",
    capabilities: ["model-routing", "fallback", "load-balancing", "rtk-compression", "mcp", "a2a", "sse"],
    actions: ["read-models", "read-health", "route-completion"],
    toolHandlers: ["omniRouteGateway"],
    fallback: "Ollama local runtime when OmniRoute is unavailable.",
  },
  // Laya System-1 runtime + Cognee memory bridge are PYTHON loopback
  // services managed by layaService.ts / launched from plugins/cognee —
  // endpoints are still resolved HERE, never hardcoded at call sites.
  laya: {
    id: "laya",
    name: "Laya System-1 Runtime",
    status: "OFFLINE",
    internal: true,
    endpoint: "http://127.0.0.1:8791",
    healthEndpoint: "http://127.0.0.1:8791/v1/health",
    version: "0.3.6",
    capabilities: [
      "bounded-typed-decisions",
      "language-routing",
      "urgency-classification",
      "department-routing",
    ],
    actions: ["read-health", "classify-urgency", "route-language", "route-department"],
    toolHandlers: ["decidePackSync"],
    fallback: "Deterministic local intent rules inside Saarathi.",
  },
  cognee: {
    id: "cognee",
    name: "Cognee Memory Bridge",
    status: "OFFLINE",
    internal: true,
    endpoint: "http://127.0.0.1:8792",
    healthEndpoint: "http://127.0.0.1:8792/v1/health",
    version: "1.0",
    capabilities: ["long-term-memory", "remember", "recall", "improve", "forget"],
    actions: ["read-health"],
    toolHandlers: [],
    fallback: "Classed local memory path only; Mem0/vector backend remains unsupported.",
  },
};

class ServiceRegistry {
  public resolve(serviceId: string): ServiceDescriptor | null {
    const base = CANONICAL[serviceId];
    if (!base) return null;
    return {
      serviceId: base.id,
      primaryDuty: base.capabilities.join(", "),
      url: base.dashboardEndpoint ?? base.endpoint,
      type: base.internal ? "runtime" : "plugin",
      apiCapability: true,
      embedCapability: Boolean(base.dashboardEndpoint),
      permissions: base.capabilities.map((capability) => `service:${capability}`),
      actions: base.actions ?? ["read-health"],
      toolHandlers: base.toolHandlers ?? [],
      fallback: base.fallback ?? "No automatic fallback registered.",
      browserDestination: base.dashboardEndpoint ?? base.endpoint,
      ...base,
    };
  }

  public listAll(): ServiceDescriptor[] {
    return Object.keys(CANONICAL).map((id) => this.resolve(id)!);
  }
}

export const serviceRegistry = new ServiceRegistry();
