export type HealthKind = "http" | "cli" | "in_process" | "mcp" | "native_api";

export type ServiceHealthStatus =
  | "HEALTHY" | "DEGRADED" | "OFFLINE" | "DISABLED" | "STARTING"
  | "RECOVERING" | "CONFIGURED" | "CONNECTED" | "READY"
  | "CONFIG_REQUIRED" | "ERROR";

export interface ServiceHealth {
  id: string;
  name: string;
  kind: HealthKind;
  status: ServiceHealthStatus;
  latencyMs?: number;
  version?: string;
  transport?: string;
  endpoint?: string;
  message: string;
  lastCheckedAt: string;
  details?: Record<string, unknown>;
}

import { probeHermes } from "./agents/hermesAdapter";
import { agentOrchestrator } from "./langgraph";
import { mcpRegistry } from "./mcp/mcpRegistry";
import { internalServiceManager } from "./services/serviceManager";
import { ncbiKeyStatus, probePubMed } from "./medical/ncbiClient";

const isoNow = () => new Date().toISOString();

export async function probeHermesService(): Promise<ServiceHealth> {
  const started = Date.now();
  const h = await probeHermes();
  return {
    id: "hermes", name: "Hermes",
    kind: h.mode === "SERVER" ? "http" : "cli",
    // LIVE only after a real successful HTTP check of the :9119 dashboard; anything else is OFFLINE.
    status: h.status === "LIVE" ? "HEALTHY" : "OFFLINE",
    version: h.version ?? undefined, transport: h.transport, endpoint: h.endpoint,
    message: h.detail, lastCheckedAt: isoNow(), latencyMs: Date.now() - started,
    details: { kind: h.kind, mode: h.mode, supportsServe: h.supportsServe },
  };
}

export async function probeLangGraphService(): Promise<ServiceHealth> {
  const started = Date.now();
  try {
    const result = await Promise.race([
      agentOrchestrator.selfTest(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000)),
    ]);
    return {
      id: "langgraph", name: "LangGraph", kind: "in_process",
      status: result.ok ? "HEALTHY" : "DEGRADED",
      message: result.ok ? `In-process orchestrator (nodes=${result.nodes}, skills=${result.learnedSkills})` : "Self-test failed",
      lastCheckedAt: isoNow(), latencyMs: Date.now() - started, details: result,
    };
  } catch (err) {
    return { id: "langgraph", name: "LangGraph", kind: "in_process", status: "DEGRADED",
      message: err instanceof Error ? err.message : String(err), lastCheckedAt: isoNow(), latencyMs: Date.now() - started };
  }
}

export async function probePubMedService(): Promise<ServiceHealth> {
  const started = Date.now();
  if (ncbiKeyStatus() !== "CONFIGURED") {
    return { id: "pubmed", name: "PubMed/NCBI", kind: "native_api", status: "CONFIG_REQUIRED",
      transport: "HTTPS", message: "NCBI_API_KEY not configured", lastCheckedAt: isoNow() };
  }
  const probe = await probePubMed("aspirin").catch(() => null);
  return {
    id: "pubmed", name: "PubMed/NCBI", kind: "native_api",
    status: probe?.ok ? "HEALTHY" : "OFFLINE", transport: "HTTPS",
    message: probe?.ok ? `Reachable (${probe.totalHits} results)` : probe?.error ?? "unreachable",
    lastCheckedAt: isoNow(), latencyMs: Date.now() - started,
    details: { firstPmid: probe?.firstPmid },
  };
}

export async function probeMcpSummary() {
  const servers = mcpRegistry.listAll();
  const result = servers.map((s) => ({
    id: s.id, name: s.name, kind: "mcp" as const,
    status: (s.status === "CONNECTED" && s.tools.length > 0 ? "READY" : s.status === "CONNECTED" ? "CONNECTED" : s.status) as ServiceHealthStatus,
    transport: s.transport, endpoint: s.endpoint,
    message: s.lastError ?? (s.status === "CONNECTED" ? `Connected (${s.tools.length} tools)` : s.status),
    lastCheckedAt: s.lastChecked ?? isoNow(), latencyMs: s.latencyMs ?? undefined,
    toolCount: s.tools.length,
  }));
  return {
    servers: result,
    counts: {
      registered: servers.length,
      configured: servers.filter((s) => s.status !== "DISABLED").length,
      connected: servers.filter((s) => s.status === "CONNECTED").length,
      ready: servers.filter((s) => s.status === "CONNECTED" && s.tools.length > 0).length,
      error: servers.filter((s) => s.status === "ERROR").length,
    },
  };
}

export async function probeManagedHttp(id: "freellmapi" | "omniroute"): Promise<ServiceHealth> {
  const started = Date.now();
  const snap = await internalServiceManager.snapshot(id).catch(() => null);
  if (!snap) return { id, name: id === "freellmapi" ? "FreeLLMAPI" : "OmniRoute", kind: "http", status: "OFFLINE", message: "no snapshot", lastCheckedAt: isoNow() };
  return {
    id, name: snap.displayName, kind: "http",
    status: snap.state === "HEALTHY" ? "HEALTHY" : snap.state === "DISABLED" ? "DISABLED" : snap.state === "CRASHED" ? "ERROR" : "DEGRADED",
    endpoint: snap.endpoint, version: snap.installedVersion, message: snap.health?.detail ?? snap.state,
    lastCheckedAt: isoNow(), latencyMs: Date.now() - started,
    details: { state: snap.state, pid: snap.process?.pid, uptimeMs: snap.process?.uptimeMs, crashLoopDetected: snap.process?.crashLoopDetected },
  };
}

export async function collectAllServiceHealth() {
  const [hermes, langgraph, pubmed, freellm, omni, mcp] = await Promise.all([
    probeHermesService(), probeLangGraphService(), probePubMedService(),
    probeManagedHttp("freellmapi"), probeManagedHttp("omniroute"), probeMcpSummary(),
  ]);
  return { checkedAt: isoNow(), services: [hermes, langgraph, pubmed, freellm, omni], mcp };
}
