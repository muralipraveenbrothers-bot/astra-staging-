/**
 * ASTRA AI — CENTRAL SERVICE REGISTRY (frontend)
 * ============================================================================
 * ONE authoritative list of every Astra-integrated local service.
 * NEVER duplicate service definitions in React components — import from here.
 *
 * PORT SOURCE RULE: every URL/port below comes from the canonical port registry.
 * Cross-check: vite.config.ts (same-origin /proxy/* targets),
 * server/services/serviceDefs.ts, src/services/gatewayManager.ts.
 */

import { GATEWAYS, gatewayHealth, type GatewayDef } from "./gatewayManager";
import { readableHealth, statusWords } from "./healthWords";
import capabilityRegistry from "@/config/capability-registry.json";

/** Canonical capability facts (no secrets). Live status: GET /api/services */
export const CAPABILITY_REGISTRY = capabilityRegistry;

export type ServiceStatusKind =
  | "web" // real web dashboard/API — health-probed
  | "cli" // CLI/API-only runtime — Astra-native console (no fabricated dashboard)
  | "in-process" // in-project orchestration core (library), not a network server
  | "not-installed" // honestly reported as absent
  | "external"; // external service, no local runtime

export interface ServiceDefinition {
  id: string;
  name: string;
  description: string;
  category: "ai-infrastructure" | "orchestration" | "automation" | "media" | "runtime" | "external-ai" | "core" | "clinical-intelligence";
  /** Human-facing base URL for the dashboard/UI (browser + iframe target). */
  baseUrl: string;
  dashboardUrl: string;
  /**
   * Internal API base URL — server-side calls only, NEVER exposed to the browser.
   * Distinct from dashboardUrl for services with separate API and UI processes
   * (e.g. FreeLLMAPI serves API + dashboard from one port). Undefined for services where
   * the dashboard and API share the same port (e.g. OmniRoute, LiteLLM).
   */
  apiBaseUrl?: string;
  healthPath?: string;
  proxyPrefix?: string;
  /**
   * When true the Internal Browser iframes the same-origin `/proxy/<svc>/…` URL
   * (Astra main origin :5173) instead of the raw localhost port. Only safe for
   * apps whose root-relative assets can be referer-passthrough'd (n8n, Paperclip).
   * Vite/Next apps must keep their own origin so /@vite and /_next do not collide.
   */
  embedViaProxy?: boolean;
  /** Dashboard port (human-facing UI). For API-only services this is the API port. */
  port: number;
  /**
   * API gateway port when it differs from the dashboard port.
   * FreeLLMAPI registry port (API + dashboard, one process). OmniRoute desktop app: 20128 (dashboard + API).
   */
  apiPort?: number;
  supportsBrowser: boolean;
  supportsEmbed: boolean;
  /** Flag for archived / retired components */
  retired?: boolean;
  /** Flag for on-demand tools not expected to run 24/7 */
  onDemand?: boolean;
  /** Honest presentation kind — drives which status badge the UI may show. */
  statusKind?: ServiceStatusKind;
  /**
   * Real URL for Open External. NEVER an Astra hash route (`#/browser?service=`).
   * Omit when the component has no legitimate external web endpoint.
   */
  externalUrl?: string;
  /** Real runtime facts for CLI/in-process services (shown in the Astra console panel). */
  runtimeNote?: string;
  installPath?: string;
  version?: string;
  /**
   * Truthful runtime provenance for "REAL RUNTIME" vs "ASTRA-CUSTOM" labels.
   * Integrity is VERIFIED only when the source/package provenance is actually provable.
   */
  provenance?: {
    classification: string; // e.g. "VERIFIED REAL RUNTIME" | "ASTRA CUSTOM ORCHESTRATOR" | "PROVENANCE UNVERIFIED"
    officialProject: string;
    sourceUrl: string;
    installedVersion?: string;
    repository?: string;
    commit?: string;
    installation?: string;
    executable?: string;
    implementation?: string;
    packageManager?: string;
    integrity: "VERIFIED" | "UNVERIFIED" | "ASTRA-CUSTOM";
  };
}

/** Gateway services reuse the dual-gateway manager definitions verbatim. */
function gatewayService(id: "freellmapi" | "omniroute"): ServiceDefinition {
  const g: GatewayDef = GATEWAYS[id];
  return {
    id: g.id,
    name: g.name,
    description:
      id === "freellmapi"
        ? "Unified LLM API gateway — PRIMARY path behind the Astra Central AI Adapter."
        : "Provider-routing LLM gateway — FALLBACK path behind the Astra Central AI Adapter.",
    category: "ai-infrastructure",
    // baseUrl / port = human-facing dashboard (never the API port).
    // FreeLLMAPI: UI + API on the canonical registry origin (single process)
    // OmniRoute:  desktop Electron app http://127.0.0.1:20128 (verified live 2026-09-09).
    baseUrl: `http://127.0.0.1:${g.dashboardPort}`,
    dashboardUrl: g.dashboardUrl,
    externalUrl: g.dashboardUrl,
    // apiBaseUrl is server-side only — NEVER handed to the browser for direct calls.
    apiBaseUrl: g.apiBaseUrl,
    healthPath: id === "freellmapi" ? "/proxy/freellmapi/api/ping" : "/proxy/omni/v1/models",
    proxyPrefix: id === "freellmapi" ? "/proxy/freellmapi" : "/proxy/omni",
    port: g.dashboardPort,
    apiPort: g.port !== g.dashboardPort ? g.port : undefined,
    supportsBrowser: true,
    // Dashboards stay on their own origin (FreeLLMAPI registry origin / OmniRoute app :20128) so assets
    // resolve; the user-facing URL is always #/browser?service=<id> on :5173.
    supportsEmbed: true,
    embedViaProxy: false,
    statusKind: "web",
  };
}

/**
 * ALL Astra-integrated services. Ports are the project's existing,
 * verified configuration — PRESERVED, never standardized.
 */
export const ASTRA_SERVICES: ServiceDefinition[] = [
  gatewayService("freellmapi"),
  gatewayService("omniroute"),
  {
    id: "ollama",
    name: "Ollama",
    description: "Local LLM runtime — LOCAL FALLBACK behind the Astra Central AI Adapter (not a separate brain).",
    category: "runtime",
    baseUrl: "http://127.0.0.1:11434",
    dashboardUrl: "http://127.0.0.1:11434",
    healthPath: "/proxy/ollama/api/tags",
    proxyPrefix: "/proxy/ollama",
    port: 11434,
    supportsBrowser: true,
    supportsEmbed: false,
  },
{
    id: "paperclip",
    name: "Paperclip",
    retired: true,
    description: "Agent organization runtime — orgs, agents, tasks, issues, goals.",
    category: "orchestration",
    baseUrl: "http://127.0.0.1:3100",
    dashboardUrl: "",
    externalUrl: "",
    healthPath: "/proxy/paperclip/",
    proxyPrefix: "/proxy/paperclip",
    port: 3100,
    supportsBrowser: true,
    supportsEmbed: true,
    embedViaProxy: true,
    statusKind: "web",
    installPath: "D:\\sahastra ai\\external\\paperclip",
    version: "0.3.1",
    provenance: {
      classification: "VERIFIED REAL RUNTIME",
      officialProject: "paperclipai/paperclip",
      sourceUrl: "https://github.com/paperclipai/paperclip",
      installedVersion: "0.3.1",
      repository: "https://github.com/paperclipai/paperclip",
      installation: "Local clone at D:\\sahastra ai\\external\\paperclip · Node 22 · PORT=3100 SERVE_UI=true",
      implementation: "Official Paperclip server (@paperclipai/server)",
      packageManager: "pnpm",
      integrity: "VERIFIED",
    },
  },
  {
    id: "voicebox",
    name: "Voicebox",
    description: "Official local voice studio — Qwen3-TTS + Whisper (jamiepine/voicebox).",
    category: "runtime",
    baseUrl: "http://127.0.0.1:17493",
    dashboardUrl: "http://127.0.0.1:17493/docs",
    healthPath: "/proxy/voicebox/health",
    proxyPrefix: "/proxy/voicebox",
    port: 17493,
    supportsBrowser: true,
    supportsEmbed: true,
    // Iframe the real FastAPI URL. Do NOT strip Voicebox security headers via the embed proxy.
    embedViaProxy: false,
    statusKind: "web",
    version: "0.5.0",
    installPath: "C:\\Users\\mural\\AppData\\Local\\voicebox",
    externalUrl: "http://127.0.0.1:17493/docs",
    runtimeNote: "Official jamiepine/voicebox v0.5.0 Windows install (%LOCALAPPDATA%\\voicebox). FastAPI sidecar voicebox-server.exe on 127.0.0.1:17493 (CPU PyTorch). Full studio UI is the Tauri desktop app; HTTP surface is the API + Swagger /docs. Astra plugin voicebox.ts is a browser-speech wrapper — not a substitute runtime. TTS/STT models download on first use (not pre-cached).",
    provenance: {
      classification: "VERIFIED REAL RUNTIME",
      officialProject: "jamiepine/voicebox",
      sourceUrl: "https://github.com/jamiepine/voicebox",
      installedVersion: "0.5.0",
      repository: "https://github.com/jamiepine/voicebox",
      commit: "2bcb98d1a8b6fe05e15fbc1559e3085669e4035d",
      installation: "Official Windows installer Voicebox_0.5.0_x64-setup.exe at %LOCALAPPDATA%\\voicebox (voicebox.exe + voicebox-server.exe + voicebox-mcp.exe). Data: %APPDATA%\\sh.voicebox.app",
      executable: "C:/Users/mural/AppData/Local/voicebox/voicebox-server.exe",
      implementation: "Tauri desktop + FastAPI (Qwen3-TTS, Whisper, Kokoro) — not an Astra clone",
      integrity: "VERIFIED",
    },
  },
  {
    id: "n8n",
    name: "n8n",
    description: "Official n8n workflow automation (n8n-io/n8n) — hospital webhook bus.",
    category: "automation",
    baseUrl: "http://127.0.0.1:5678",
    dashboardUrl: "http://127.0.0.1:5678",
    externalUrl: "http://127.0.0.1:5678",
    healthPath: "/proxy/n8n/healthz",
    proxyPrefix: "/proxy/n8n",
    port: 5678,
    supportsBrowser: true,
    supportsEmbed: true,
    embedViaProxy: true,
    statusKind: "web",
    version: "2.8.4",
    installPath: "%APPDATA%\\npm\\node_modules\\n8n",
    runtimeNote: "Official n8n from n8n.io / github.com/n8n-io/n8n. Global npm package n8n@2.8.4. Dashboard http://127.0.0.1:5678. Start with start-n8n.cmd.",
    provenance: {
      classification: "VERIFIED REAL RUNTIME",
      officialProject: "n8n-io/n8n",
      sourceUrl: "https://n8n.io",
      installedVersion: "2.8.4",
      repository: "https://github.com/n8n-io/n8n.git",
      installation: "npm install -g n8n (official npm package)",
      implementation: "n8n editor + workflow engine",
      packageManager: "npm",
      integrity: "VERIFIED",
    },
  },
  {
    id: "hermes",
    name: "Hermes Agent",
    description: "Planning / reasoning agent — must call Astra /v1 (FreeLLMAPI). Does not host its own model.",
    category: "orchestration",
    baseUrl: "http://127.0.0.1:9119",
    dashboardUrl: "http://127.0.0.1:9119",
    externalUrl: "http://127.0.0.1:9119",
    healthPath: "/proxy/hermes/",
    proxyPrefix: "/proxy/hermes",
    port: 9119,
    supportsBrowser: true,
    supportsEmbed: true,
    embedViaProxy: false,
    statusKind: "web",
    runtimeNote: "Official Hermes Agent (hermes-ai.net → NousResearch/hermes-agent). Git install v0.18.2. Web dashboard: hermes dashboard --port 9119 --host 127.0.0.1 (start-hermes.cmd). CLI remains available: hermes chat -q \"<prompt>\" -Q --safe-mode --max-turns 1.",
    installPath: "C:\\Users\\mural\\AppData\\Local\\hermes\\hermes-agent",
    version: "0.18.2",
    provenance: {
      classification: "VERIFIED REAL RUNTIME",
      officialProject: "NousResearch/hermes-agent",
      sourceUrl: "https://hermes-ai.net/docs/quickstart/",
      installedVersion: "0.18.2",
      repository: "https://github.com/NousResearch/hermes-agent.git",
      commit: "05b5e2b6e941eff9c014644eec4a40f6d676afd7",
      installation: "Official git install (install.sh / Windows git) at %LOCALAPPDATA%\\hermes\\hermes-agent",
      executable: "C:/Users/mural/AppData/Local/hermes/hermes-agent/venv/Scripts/hermes.exe",
      implementation: "Native Python CLI (Python 3.11.15) — not the npm package named hermes (segmentio)",
      packageManager: "pip (venv)",
      integrity: "VERIFIED",
    },
  },
  {
    id: "langgraph-orchestrator",
    name: "LangGraph Orchestrator",
    description: "In-project orchestration core — bounded DAG workflows, checkpoints, human-approval gates.",
    category: "orchestration",
    baseUrl: "",
    dashboardUrl: "",
    port: 0,
    supportsBrowser: false,
    supportsEmbed: false,
    statusKind: "in-process",
    runtimeNote: "Official LangGraph.js (@langchain/langgraph 1.4.13) from langchain-ai/langgraphjs, wrapped by Astra's in-process orchestrator. No HTTP server — Open External is omitted because there is no local web endpoint.",
    installPath: "node_modules/@langchain/langgraph",
    version: "1.4.13",
    provenance: {
      classification: "VERIFIED REAL RUNTIME",
      officialProject: "langchain-ai/langgraphjs",
      sourceUrl: "https://www.langchain.com/langgraph",
      installedVersion: "1.4.13",
      repository: "https://github.com/langchain-ai/langgraphjs",
      installation: "npm install @langchain/langgraph @langchain/core (official JS SDK)",
      implementation: "StateGraph + MemorySaver + interrupt (browser build @langchain/langgraph/web)",
      packageManager: "npm",
      integrity: "VERIFIED",
    },
  },
  {
    id: "openclaw",
    name: "OpenClaw",
    description: "OpenClaw tool/agent runtime — custom provider openai-completions → Astra /v1.",
    category: "orchestration",
    baseUrl: "http://127.0.0.1:18789",
    dashboardUrl: "http://127.0.0.1:18789",
    externalUrl: "http://127.0.0.1:18789",
    healthPath: "/proxy/openclaw/",
    proxyPrefix: "/proxy/openclaw",
    port: 18789,
    supportsBrowser: true,
    supportsEmbed: true,
    embedViaProxy: true,
    statusKind: "web",
    runtimeNote: "Official OpenClaw gateway (openclaw.ai). Start with start-openclaw.cmd. Dashboard http://127.0.0.1:18789. Requires Node 22.22.3+.",
    version: "2026.8.2",
    provenance: {
      classification: "VERIFIED REAL RUNTIME",
      officialProject: "openclaw/openclaw",
      sourceUrl: "https://docs.openclaw.ai/start/getting-started",
      repository: "https://github.com/openclaw/openclaw",
      installation: "npm install -g openclaw@latest (Node 22) · start-openclaw.cmd",
      implementation: "Official OpenClaw gateway Control UI",
      packageManager: "npm",
      integrity: "VERIFIED",
    },
  },
  {
    id: "astra-api",
    name: "Astra API Server",
    description: "The Astra AI Hospital OS backend (plugins, agents, auth, health).",
    category: "core",
    baseUrl: "http://127.0.0.1:3000",
    dashboardUrl: "http://127.0.0.1:3000/api/health",
    healthPath: "/api/live",
    port: 3000,
    supportsBrowser: false,
    supportsEmbed: false,
    statusKind: "web",
  },
  {
    id: "openhands",
    name: "OpenHands",
    retired: true,
    onDemand: true,
    description: "OpenHands Agent Canvas — approval-gated autonomous executor. UI on :8080, agent-server on :18000. Calls Astra /v1 (FreeLLMAPI) for all inference.",
    category: "orchestration",
    baseUrl: "http://127.0.0.1:8080",
    dashboardUrl: "http://127.0.0.1:8080",
    apiBaseUrl: "http://127.0.0.1:18000",
    healthPath: "/proxy/openhands-api/server_info",
    proxyPrefix: "/proxy/openhands",
    port: 8080,
    apiPort: 18000,
    supportsBrowser: true,
    supportsEmbed: false,
    statusKind: "web",
    runtimeNote: "TypeScript Agent Canvas v1.16. Requires Node >=22. Every mutating step requires explicit human approval (RBAC gate). Inference delegated to Astra /v1.",
    provenance: {
      classification: "VERIFIED",
      officialProject: "All-Hands-AI/OpenHands",
      sourceUrl: "https://github.com/All-Hands-AI/OpenHands",
      repository: "https://github.com/All-Hands-AI/OpenHands",
      installation: "modules/OpenHands (shallow clone) · npm install · npm run dev:minimal",
      implementation: "OpenHands Agent Canvas UI + uv-managed agent-server",
      integrity: "VERIFIED",
    },
  },
  {
    id: "agentzero",
    name: "Agent Zero",
    retired: true,
    description: "Agent Zero — multi-agent orchestration runtime. Flask/uvicorn on :5000. Inference delegated to Astra /v1 (FreeLLMAPI).",
    category: "orchestration",
    baseUrl: "http://127.0.0.1:5000",
    dashboardUrl: "http://127.0.0.1:5000",
    healthPath: "/proxy/agentzero/",
    proxyPrefix: "/proxy/agentzero",
    port: 5000,
    supportsBrowser: true,
    supportsEmbed: false,
    statusKind: "web",
    runtimeNote: "frdel/agent-zero v2.11. Python 3.12 venv via uv. Multi-agent orchestration — inference goes through Astra /v1 via the openai-completions provider; no separate model keys. RFC-password warnings in log are non-fatal.",
    provenance: {
      classification: "VERIFIED",
      officialProject: "frdel/agent-zero",
      sourceUrl: "https://github.com/frdel/agent-zero",
      repository: "https://github.com/frdel/agent-zero",
      installation: "modules/agentzero (shallow clone) · py -3.12 venv · uv pip install",
      implementation: "Agent Zero Flask/uvicorn web UI + multi-agent runtime",
      integrity: "VERIFIED",
    },
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    description: "External AI chat (OpenAI ChatGPT) — monitored tab inside Astra. Isolated iframe, no Astra secrets; embedding may be blocked by the provider, in which case use Open External.",
    category: "external-ai",
    baseUrl: "https://chatgpt.com",
    dashboardUrl: "https://chatgpt.com",
    healthPath: "https://chatgpt.com",
    port: 0,
    supportsBrowser: true,
    supportsEmbed: true,
    statusKind: "external",
    externalUrl: "https://chatgpt.com",
    runtimeNote: "External cloud service — monitored tab only. Astra logs tab open/close and shows ONLINE/OFFLINE reachability; traffic is NOT routed through Astra gateways.",
  },
  {
    id: "grok",
    name: "Grok",
    description: "External AI chat (xAI Grok) — monitored tab inside Astra. Isolated iframe, no Astra secrets; embedding may be blocked by the provider, in which case use Open External.",
    category: "external-ai",
    baseUrl: "https://grok.com",
    dashboardUrl: "https://grok.com",
    healthPath: "https://grok.com",
    port: 0,
    supportsBrowser: true,
    supportsEmbed: true,
    statusKind: "external",
    externalUrl: "https://grok.com",
    runtimeNote: "External cloud service — monitored tab only. Astra logs tab open/close and shows ONLINE/OFFLINE reachability; traffic is NOT routed through Astra gateways.",
  },
  {
    id: "kimi",
    name: "Kimi AI",
    description: "External AI chat (Moonshot Kimi) — monitored tab inside Astra. Isolated iframe, no Astra secrets; embedding may be blocked by the provider, in which case use Open External.",
    category: "external-ai",
    baseUrl: "https://www.kimi.com",
    dashboardUrl: "https://www.kimi.com",
    healthPath: "https://www.kimi.com",
    port: 0,
    supportsBrowser: true,
    supportsEmbed: true,
    statusKind: "external",
    externalUrl: "https://www.kimi.com",
    runtimeNote: "External cloud service — monitored tab only. Astra logs tab open/close and shows ONLINE/OFFLINE reachability; traffic is NOT routed through Astra gateways.",
  },
  {
    id: "laya",
    name: "Laya",
    description: "Fast local decision brain. Routes language, urgency, and department before the big model speaks.",
    category: "clinical-intelligence",
    baseUrl: "http://127.0.0.1:8791",
    dashboardUrl: "http://127.0.0.1:8791/v1/tasks",
    healthPath: "http://127.0.0.1:8791/v1/health",
    port: 8791,
    supportsBrowser: true,
    supportsEmbed: false,
    statusKind: "in-process",
    runtimeNote: "Loopback on :8791. Used on every clinical turn for urgency and department, and on voice for English, Hindi, and Telugu.",
    version: "0.3.6",
  },
  {
    id: "astra-micro",
    name: "Micro Astra",
    description: "Mini local model for short hospital commands: open a desk, find a bed, send a message.",
    category: "clinical-intelligence",
    baseUrl: "http://127.0.0.1:11434",
    dashboardUrl: "http://127.0.0.1:11434",
    healthPath: "/proxy/ollama/api/tags",
    port: 11434,
    supportsBrowser: true,
    supportsEmbed: false,
    statusKind: "in-process",
    runtimeNote: "Runs through Ollama when the astra-micro model is installed. Operational lines are classified here before the cloud model.",
  },
  {
    id: "scientist",
    name: "Scientist",
    description: "Evidence skills: papers, trials, drug databases, and scientific writing. Drafts only — the doctor decides.",
    category: "clinical-intelligence",
    baseUrl: "http://127.0.0.1:3000/api/intelligence/skills",
    dashboardUrl: "http://127.0.0.1:3000/api/intelligence/skills",
    healthPath: "/api/intelligence/skills",
    port: 3000,
    supportsBrowser: true,
    supportsEmbed: false,
    statusKind: "in-process",
    runtimeNote: "Attached when a question asks for evidence, trials, or a paper. Patient identifiers are stripped before a skill runs.",
  },
  {
    id: "clinical-books",
    name: "Book skills",
    description: "Clinical writing skills: discharge drafts, treatment-plan format, and textbook-style evidence briefs.",
    category: "clinical-intelligence",
    baseUrl: "http://127.0.0.1:3000/api/intelligence/skills",
    dashboardUrl: "http://127.0.0.1:3000/api/intelligence/skills",
    healthPath: "/api/intelligence/skills",
    port: 3000,
    supportsBrowser: true,
    supportsEmbed: false,
    statusKind: "in-process",
    runtimeNote: "clinical-reports, treatment-plans, and scientific-writing. They structure a document. They do not sign an order.",
  },
  {
    id: "astra-7d",
    name: "Astra 7D",
    description: "Symptom to management: complaint, timeline, differentials, mechanism, and what to watch.",
    category: "clinical-intelligence",
    baseUrl: "http://127.0.0.1:3000/api/saarathi/health",
    dashboardUrl: "http://127.0.0.1:3000/api/saarathi/health",
    healthPath: "/api/live",
    port: 3000,
    supportsBrowser: true,
    supportsEmbed: false,
    statusKind: "in-process",
    runtimeNote: "Runs beside every clinical answer. The screen keeps the 7D plan. The voice speaks the short line.",
  },
];

const HIDDEN_FROM_DOCTOR = new Set(["paperclip", "litellm", "openhands", "agentzero"]);

/** Doctor-facing lists hide products the hospital already removed. Server trees stay. */
export function isHiddenFromDoctor(id?: string, name?: string): boolean {
  const key = (id ?? "").toLowerCase();
  if (HIDDEN_FROM_DOCTOR.has(key)) return true;
  if (/(paperclip|litellm|openhands|agentzero|agent zero)/i.test(key)) return true;
  return /(paperclip|litellm|openhands|agentzero|agent zero)/i.test(name ?? "");
}

export function getService(id: string): ServiceDefinition | undefined {
  return ASTRA_SERVICES.find((s) => s.id === id);
}

/**
 * Plugin Center card id → Internal Browser service id.
 * Opening always stays on Astra's main URL: http://localhost:5173/#/browser?service=…
 */
export const PLUGIN_TO_SERVICE: Record<string, string> = {
  "freellm-provider": "freellmapi",
  "omniroute-gateway": "omniroute",
  voicebox: "voicebox",
  "langgraph-orchestrator": "langgraph-orchestrator",
  "n8n-automation-addon": "n8n",
  "openhands-executor-addon": "openhands",
  "agentzero-executor-addon": "agentzero",
  "medical-knowledge-gateway": "paperclip",
  "browser-ai-addon": "browser-home",
  "astra-brain-core": "hermes",
  hermes: "hermes",
  paperclip: "paperclip",
  n8n: "n8n",
  ollama: "ollama",
  litellm: "litellm",
  routellm: "routellm",
  openclaw: "openclaw",
  openhands: "openhands",
  agentzero: "agentzero",
  "astra-api": "astra-api",
  chatgpt: "chatgpt",
  grok: "grok",
  kimi: "kimi",
  laya: "laya",
  "astra-micro": "astra-micro",
  minimind: "astra-micro",
  scientist: "scientist",
  "clinical-books": "clinical-books",
  "book-skills": "clinical-books",
  "astra-7d": "astra-7d",
  "7d": "astra-7d",
};

export function getServiceIdForPlugin(pluginId: string): string | undefined {
  return PLUGIN_TO_SERVICE[pluginId];
}

/**
 * Real Open External URL. Returns null when the service has no legitimate
 * external web endpoint (CLI-only without a running dashboard, in-process core).
 * Never returns an Astra hash route.
 */
export function serviceExternalUrl(svc: ServiceDefinition): string | null {
  if (svc.externalUrl) return svc.externalUrl;
  if (svc.statusKind === "web" && svc.dashboardUrl) return svc.dashboardUrl;
  if (svc.statusKind === "external" && (svc.dashboardUrl || svc.baseUrl)) {
    return svc.dashboardUrl || svc.baseUrl;
  }
  return null;
}

/** Same-origin (or native) URL the Internal Browser should iframe. */
export function serviceEmbedSrc(svc: ServiceDefinition): string {
  if (svc.embedViaProxy && svc.proxyPrefix) {
    if (!svc.dashboardUrl) return `${svc.proxyPrefix}/`;
    try {
      const u = new URL(svc.dashboardUrl);
      const path = u.pathname === "/" ? "/" : u.pathname;
      return `${svc.proxyPrefix}${path}${u.search}`;
    } catch {
      return `${svc.proxyPrefix}/`;
    }
  }
  return svc.dashboardUrl || svc.baseUrl;
}

/** User-facing Astra URL for a service (always on the main Astra origin). */
export function astraServiceHash(serviceId: string, subPath?: string): string {
  const q = new URLSearchParams({ service: serviceId });
  if (subPath) q.set("path", subPath);
  return `/browser?${q.toString()}`;
}

export type RuntimeLevel = "live" | "degraded" | "offline" | "retired";

export interface RuntimeHealth {
  online: boolean;
  level: RuntimeLevel;
  latencyMs: number;
  detail: string;
}

/** Server-side status for every loopback service (honest LIVE / DEGRADED / OFFLINE). */
export async function fetchRuntimeStatus(timeoutMs = 8000): Promise<Record<string, RuntimeHealth>> {
  const started = Date.now();
  try {
    const res = await fetch("/api/runtime/status", { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as {
      services?: Record<string, { level?: RuntimeLevel; online?: boolean; latencyMs?: number; detail?: string }>;
    };
    const out: Record<string, RuntimeHealth> = {};
    for (const [id, s] of Object.entries(body.services ?? {})) {
      const level =
        s.level === "retired"
          ? "retired"
          : s.level === "degraded" || s.level === "live" || s.level === "offline"
            ? s.level
            : s.online
              ? "live"
              : "offline";
      out[id] = { online: level !== "offline" && level !== "retired", level, latencyMs: s.latencyMs ?? 0, detail: s.detail ?? "" };
    }
    return out;
  } catch (e: any) {
    return {
      "astra-api": {
        online: false,
        level: "offline",
        latencyMs: Date.now() - started,
        detail: e?.name === "TimeoutError" || e?.name === "AbortError" ? "timeout" : "Astra API unreachable",
      },
    };
  }
}

/** Browser-reachable health URL. Same-origin proxy paths stay relative. */
export function serviceHealthUrl(svc: ServiceDefinition): string | null {
  const raw = svc.healthPath?.trim();
  if (raw && /^https?:\/\//i.test(raw)) return raw;
  if (raw && raw.startsWith("/")) {
    if (raw.startsWith("/proxy/") || raw.startsWith("/api/") || !svc.baseUrl) return raw;
    try {
      return new URL(raw, svc.baseUrl).toString();
    } catch {
      return raw;
    }
  }
  if (raw) return raw;
  if (svc.proxyPrefix) return `${svc.proxyPrefix.replace(/\/$/, "")}/`;
  if (svc.baseUrl) return svc.baseUrl;
  return null;
}

/** Real health check for any registered service (uses same-origin proxy when present). */
export async function serviceHealth(
  svc: ServiceDefinition,
  timeoutMs = 2500,
): Promise<{ online: boolean; level: RuntimeLevel; latencyMs: number; detail: string }> {
  const started = Date.now();
  const url = serviceHealthUrl(svc);
  // GET /v1/health runs a CPU predict on Laya's loop and often takes about 7s.
  // A budget under 10s aborts a live process and looks like a hang.
  const budget = svc.id === "laya" ? Math.max(timeoutMs, 15_000) : timeoutMs;
  const done = (online: boolean, level: RuntimeLevel, detail: string) => ({
    online,
    level,
    latencyMs: Date.now() - started,
    detail,
  });
  if (svc.id === "astra-micro") {
    return done(false, "offline", "Not connected. Micro Astra is the offline training model. This check does not start it.");
  }
  if (svc.id === "astra-7d") {
    return done(false, "offline", "Not connected as its own service. The 7D lines are written inside a clinical answer. This check does not diagnose.");
  }
  if (svc.statusKind === "external") {
    return done(false, "offline", "Not an Astra connection. This is an outside website.");
  }
  if (svc.id === "langgraph-orchestrator") {
    try {
      const res = await fetch("/api/runtime/status", { signal: AbortSignal.timeout(budget) });
      if (!res.ok) return done(false, "offline", statusWords(res.status));
      const body = (await res.json()) as { services?: Record<string, { online?: boolean; detail?: string; level?: RuntimeLevel }> };
      const row = body.services?.["langgraph-orchestrator"];
      const online = row?.online === true && row.level !== "offline";
      return done(online, online ? "live" : "offline", readableHealth(row?.detail, online));
    } catch {
      return done(false, "offline", "Not connected. The Astra API did not answer the in-process check.");
    }
  }
  if (!url) return done(false, "offline", "Not connected. Nothing is listening on this PC.");
  try {
    const res = await fetch(url, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(budget) });
    void res.body?.cancel().catch(() => {});
    const online = res.status >= 200 && res.status < 400;
    return done(online, online ? "live" : "degraded", statusWords(res.status));
  } catch {
    try {
      await fetch(url, { method: "GET", mode: "no-cors", cache: "no-store", signal: AbortSignal.timeout(budget) });
      return done(true, "live", "Connected. The port answered. The browser could not read a page from it.");
    } catch {
      return done(false, "offline", "Not connected. Nothing is listening on this PC.");
    }
  }
}

/** Gateway health re-export (delegates to the gateway manager). */
export const gatewayServiceHealth = gatewayHealth;
