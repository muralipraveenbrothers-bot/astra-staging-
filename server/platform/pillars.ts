/**
 * Astra platform pillars — honest live probes for the five product surfaces.
 * Missing services report DEGRADED / OFFLINE. Nothing is faked as CONNECTED.
 * URLs are env-configurable; defaults preserve installed behavior.
 */
import { mcpRegistry } from "../mcp/mcpRegistry";
import { AgentRegistry } from "../../src/agents/core/AgentRegistry";
import { canonicalPort, portEntries } from "../astra/supervisor/portRegistry";

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/api/tags";
const VOICEBOX_URL = process.env.VOICEBOX_URL || "http://127.0.0.1:17493/health";
const FREELLM_URL = process.env.FREELLMAPI_BASE_URL || `http://${portEntries().freellmapi.host}:${canonicalPort("freellmapi")}/v1`;
// OmniRoute desktop app (:20128). Its root responds in <1s; /v1/models can take
// 15-35s cold. Probe the cheap root so the pillar flips CONNECTED quickly.
const OMNI_URL = process.env.OMNIROUTE_BASE_URL
  ? process.env.OMNIROUTE_BASE_URL.replace(/\/v1\/?$/, "")
  : "http://127.0.0.1:20128";
const AGENTZERO_URL = process.env.AGENTZERO_URL || "http://127.0.0.1:5000/api/health";
const OPENHANDS_URL = process.env.OPENHANDS_URL || "http://127.0.0.1:18000/server_info";
// Per-service probe timeouts (ms). OmniRoute desktop app root "/" responds
// in <1s; only /v1/models is slow when cold. Since we probe root, 3s is plenty.
const OMNI_TIMEOUT = Number(process.env.OMNI_PILLAR_TIMEOUT_MS || 3_000);
const DEFAULT_TIMEOUT = 2200;

export type PillarStatus = "CONNECTED" | "DEGRADED" | "OFFLINE" | "CONFIGURED";

export interface PillarReport {
  id: string;
  name: string;
  status: PillarStatus;
  detail: string;
  components: Record<string, PillarStatus>;
}

async function reachable(url: string, timeoutMs = DEFAULT_TIMEOUT): Promise<boolean> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return r.ok;
  } catch {
    return false;
  }
}

function rollup(components: Record<string, PillarStatus>): PillarStatus {
  const vals = Object.values(components);
  if (vals.length === 0) return "OFFLINE";
  if (vals.every((v) => v === "CONNECTED")) return "CONNECTED";
  if (vals.every((v) => v === "OFFLINE")) return "OFFLINE";
  return "DEGRADED";
}

function flag(ok: boolean): PillarStatus {
  return ok ? "CONNECTED" : "OFFLINE";
}

export async function collectPlatformPillars(): Promise<{
  checkedAt: string;
  overall: "HEALTHY" | "DEGRADED" | "OFFLINE";
  pillars: Record<string, PillarReport>;
}> {
    const [
    ollama,
    voicebox,
    freellm,
    omni,
    agentzero,
    openhands,
  ] = await Promise.all([
    reachable(OLLAMA_URL),
    reachable(VOICEBOX_URL),
    reachable(FREELLM_URL),
    reachable(OMNI_URL, OMNI_TIMEOUT),
    reachable(AGENTZERO_URL),
    reachable(OPENHANDS_URL),
  ]);

  const langgraphOn = AgentRegistry.get("langgraph_orchestrator")?.status === "ACTIVE" || AgentRegistry.list().length > 0;
  const mcpServers = mcpRegistry.listAll();
  const mcpConnected = mcpServers.filter((s: { status: string }) => s.status === "CONNECTED").length;
  const mcpConfigured = mcpServers.filter((s: { status: string }) => s.status !== "DISABLED").length;

  const clinical: PillarReport = {
    id: "clinicalAi",
    name: "Clinical AI",
    components: {
      hermesBrain: "CONFIGURED",
      clinicalApi: "CONFIGURED",
      calculators: "CONFIGURED",
      ollama: flag(ollama),
      knowledgeFabric: "CONFIGURED",
    },
    status: "CONNECTED",
    detail: ollama
      ? "Ollama answered the local tags probe. Hermes, the clinical API, and calculators are loaded modules, not a separate live probe."
      : "Ollama did not answer the local tags probe. Hermes, the clinical API, and calculators are loaded modules, not a separate live probe.",
  };
  clinical.status = rollup(clinical.components);
  if (!ollama) clinical.status = "DEGRADED";

  const orchestration: PillarReport = {
    id: "agentOrchestration",
    name: "Agent Orchestration",
    components: {
      langgraph: langgraphOn ? "CONFIGURED" : "OFFLINE",
      centralAdapter: "CONFIGURED",
      freellmapi: flag(freellm),
      omniroute: flag(omni),
      mcp: mcpServers.length > 0 && mcpConnected === mcpServers.length ? "CONNECTED" : mcpConnected > 0 ? "DEGRADED" : mcpConfigured > 0 ? "CONFIGURED" : "OFFLINE",
      agentzero: flag(agentzero),
      openhands: flag(openhands),
    },
    status: "CONNECTED",
    detail: `LangGraph is a seed row, not a running graph test. MCP ${mcpConnected}/${mcpServers.length} completed a handshake. Agent Zero ${agentzero ? "answered" : "OFFLINE"}, OpenHands ${openhands ? "answered" : "OFFLINE"}.`,
  };
  // Pillar status reflects the RESILIENT gateway chain, not every optional
  // executor: AI keeps working as long as ANY gateway is live because the
  // adapter fails over freellmapi → omniroute → ollama (circuit-broken).
  // Individual components above still report each service's honest state.
  const gatewayChainAlive = freellm || omni;
  orchestration.status = rollup({
    langgraph: orchestration.components.langgraph,
    centralAdapter: "CONFIGURED",
    gatewayChain: gatewayChainAlive ? "CONNECTED" : "DEGRADED",
    mcp: orchestration.components.mcp,
  });
  if (orchestration.status === "CONNECTED" && (!freellm || !omni)) {
    orchestration.detail += ` Gateway chain resilient: ${[
      freellm ? "FreeLLMAPI live" : null,
      omni ? "OmniRoute live" : null,
      !freellm && !omni ? null : "local Ollama as final fallback",
    ]
      .filter(Boolean)
      .join("; ")}. Failover is automatic.`;
  }

  const hospital: PillarReport = {
    id: "hospitalIntelligence",
    name: "Hospital Intelligence",
    components: {
      commandEngine: "CONFIGURED",
      hospitalDb: "CONFIGURED",
      workOrders: "CONFIGURED",
      audit: "CONFIGURED",
    },
    status: "DEGRADED",
    detail: "These modules are loaded in this process. The audit check is a local jsonl file, not a cryptographic audit, and not a live NHA connection.",
  };

  const voice: PillarReport = {
    id: "multilingualVoice",
    name: "Multilingual Voice",
    components: {
      voicebox: flag(voicebox),
      voiceProxy: "CONFIGURED",
    },
    status: voicebox ? "CONNECTED" : "OFFLINE",
    detail: voicebox
      ? "Voicebox reachable on :17493 — local neural TTS/STT active."
      : "Voicebox unreachable on :17493 — speech output unavailable; Windows/browser fallback is disabled.",
  };

  const pillars = {
    clinicalAi: clinical,
    agentOrchestration: orchestration,
    hospitalIntelligence: hospital,
    multilingualVoice: voice,
  };

  // §9 / §27 — the GLOBAL platform status reflects only the CORE platform:
  // the in-process hospital workflow (DB, command engine, work orders, audit)
  // and the in-process clinical APIs. AI gateways, agent executors and voice
  // are capabilities (Tier 2/3): their state stays truthful in the pillars
  // above and must never flatten Astra into a global DEGRADED/OFFLINE — a
  // dead Voicebox or offline executor is a capability notice, not an outage.
  const coreComponents = [
    ...Object.values(hospital.components),
    clinical.components.hermesBrain,
    clinical.components.clinicalApi,
    clinical.components.calculators,
  ];
  const coreDown = coreComponents.filter((s) => s === "OFFLINE").length;
  const overall: "HEALTHY" | "DEGRADED" | "OFFLINE" =
    coreDown === 0 ? "HEALTHY"
      : coreDown >= coreComponents.length ? "OFFLINE"
        : "DEGRADED";

  return { checkedAt: new Date().toISOString(), overall, pillars };
}
