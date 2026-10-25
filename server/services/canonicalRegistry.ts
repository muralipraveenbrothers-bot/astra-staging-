/**
 * ASTRA AI — CANONICAL SERVICE REGISTRY (single source of truth)
 * ============================================================================
 * ONE registry for every Astra-integrated service. All other modules
 * (ai/config.ts, serviceRegistry.ts, /api/services) resolve from here — never
 * re-define a service in multiple places (spec §2, §28).
 * Secret values (apiKey) live ONLY in the backend; publicServiceView strips them.
 */
import { maskSecret } from "../ai/loadEnv";
import { canonicalPort, portEntries } from "../astra/supervisor/portRegistry";

const freellmHost = portEntries().freellmapi.host;
const freellmOrigin = `http://${freellmHost}:${canonicalPort("freellmapi")}`;
const freellmApiUrl = `${freellmOrigin}/v1`;

function firstEnv(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

export type ServiceRole =
  | "PRIMARY" | "FALLBACK" | "LOCAL_FALLBACK" | "ORCHESTRATION"
  | "WORKFLOW" | "EXTERNAL_CLOUD" | "CORE";
export type ServiceCategory =
  | "ai-infrastructure" | "orchestration" | "automation" | "media" | "core";

export interface CanonicalService {
  id: string; name: string; category: ServiceCategory; role: ServiceRole;
  dashboardUrl: string; apiUrl: string; healthUrl: string;
  apiKeyEnv: string[]; capabilities: string[];
  upstream?: { name: string; url: string; license?: string };
  externalUrl?: string;
}

export const RETIRED_SERVICE_IDS = new Set(["paperclip", "openclaw", "n8n", "agentzero", "openhands"]);

export const CANONICAL_SERVICES: CanonicalService[] = [
  {
    id: "freellmapi", name: "FreeLLMAPI", category: "ai-infrastructure", role: "PRIMARY",
    dashboardUrl: firstEnv("FREELLMAPI_DASHBOARD_URL") ?? `${freellmOrigin}/`,
    apiUrl: firstEnv("FREELLMAPI_BASE_URL") ?? freellmApiUrl,
    healthUrl: `${(firstEnv("FREELLMAPI_BASE_URL") ?? freellmApiUrl).replace(/\/+$/, "")}/models`,
    apiKeyEnv: ["FREELLMAPI_API_KEY", "ASTRA_FREELLMAPI_API_KEY"],
    capabilities: ["provider-management", "model-catalog", "openai-proxy"],
    upstream: { name: "FreeLLMAPI", url: "https://github.com/tashfeenahmed/freellmapi" },
  },
  {
    id: "omniroute", name: "OmniRoute", category: "ai-infrastructure", role: "FALLBACK",
    // Desktop Electron app :20128 (verified live 2026-09-09: /v1/models = 3627 models).
    // Uses /v1/* NOT /api/v1/*. Env OMNIROUTE_* in config/ai-gateway.env wins when set.
    dashboardUrl: firstEnv("OMNIROUTE_DASHBOARD_URL") ?? "http://127.0.0.1:20128/home",
    apiUrl: "http://127.0.0.1:20128/v1", healthUrl: "http://127.0.0.1:20128/v1/models",
    apiKeyEnv: ["OMNIROUTE_API_KEY", "ASTRA_LLM_GATEWAY_API_KEY"],
    capabilities: ["model-routing", "fallback", "load-balancing", "mcp", "a2a"],
    upstream: { name: "OmniRoute", url: "https://github.com/diegosouzapw/OmniRoute" },
  },
  {
    id: "ollama", name: "Ollama", category: "ai-infrastructure", role: "LOCAL_FALLBACK",
    dashboardUrl: firstEnv("OLLAMA_DASHBOARD_URL") ?? "http://127.0.0.1:11434",
    apiUrl: "http://127.0.0.1:11434/v1", healthUrl: "http://127.0.0.1:11434/api/tags",
    apiKeyEnv: ["OLLAMA_API_KEY"],
    capabilities: ["local-inference", "private", "tool-calls", "vision", "embeddings"],
    upstream: { name: "Ollama", url: "https://github.com/ollama/ollama" },
  },
  {
    id: "astra", name: "Astra AI Core", category: "core", role: "CORE",
    dashboardUrl: "http://127.0.0.1:5173", apiUrl: "http://127.0.0.1:3000/v1",
    healthUrl: "http://127.0.0.1:3000/api/live", apiKeyEnv: [],
    capabilities: ["central-adapter", "command", "clinical-safety", "memory", "routing"],
  },
  {
    id: "hermes", name: "Hermes", category: "orchestration", role: "ORCHESTRATION",
    dashboardUrl: "http://127.0.0.1:9119/chat", apiUrl: "", healthUrl: "",
    apiKeyEnv: ["HERMES_API_KEY"], capabilities: ["planning", "reasoning", "tool-use"],
    externalUrl: "https://hermes-ai.net",
    upstream: { name: "hermes-agent", url: "https://github.com/NousResearch/hermes-agent" },
  },
  {
    id: "langgraph", name: "LangGraph", category: "orchestration", role: "ORCHESTRATION",
    dashboardUrl: "", apiUrl: "", healthUrl: "", apiKeyEnv: ["LANGGRAPH_API_KEY"],
    capabilities: ["workflow-orchestration", "stateful-agents", "clinical-workflows"],
    upstream: { name: "LangGraph", url: "https://github.com/langchain-ai/langgraph" },
  },
  {
    id: "laya", name: "Laya System-1", category: "orchestration", role: "ORCHESTRATION",
    dashboardUrl: "", apiUrl: "http://127.0.0.1:8791/v1/decide", healthUrl: "http://127.0.0.1:8791/v1/health",
    apiKeyEnv: [], capabilities: ["bounded-decisions", "classification", "scoring"],
  },
  {
    id: "paperclip", name: "Paperclip", category: "orchestration", role: "WORKFLOW",
    dashboardUrl: "http://127.0.0.1:3100/onboarding", apiUrl: "http://127.0.0.1:3100",
    healthUrl: "http://127.0.0.1:3100/api/health", apiKeyEnv: ["PAPERCLIP_API_KEY"],
    capabilities: ["task-execution", "agent-organization", "goals"],
    upstream: { name: "Paperclip", url: "https://github.com/paperclipai/paperclip" },
  },
  {
    id: "openclaw", name: "OpenClaw", category: "orchestration", role: "WORKFLOW",
    dashboardUrl: "http://127.0.0.1:18789", apiUrl: "http://127.0.0.1:18789",
    healthUrl: "http://127.0.0.1:18789/healthz", apiKeyEnv: ["OPENCLAW_API_KEY"],
    capabilities: ["tool-execution", "agent-execution", "custom-providers"],
    externalUrl: "https://openclaw.ai",
    upstream: { name: "OpenClaw", url: "https://github.com/openclaw/openclaw" },
  },
  {
    id: "n8n", name: "n8n", category: "automation", role: "WORKFLOW",
    dashboardUrl: "http://127.0.0.1:5678/home/workflows", apiUrl: "http://127.0.0.1:5678",
    healthUrl: "http://127.0.0.1:5678/healthz", apiKeyEnv: ["N8N_API_KEY"],
    capabilities: ["automation", "workflow-bus", "webhooks", "ehr-integrations"],
    externalUrl: "https://n8n.io", upstream: { name: "n8n", url: "https://github.com/n8n-io/n8n" },
  },
  {
    id: "voicebox", name: "Voicebox", category: "media", role: "WORKFLOW",
    dashboardUrl: "http://127.0.0.1:17493", apiUrl: "http://127.0.0.1:17493",
    healthUrl: "http://127.0.0.1:17493/health", apiKeyEnv: ["VOICEBOX_API_KEY"],
    capabilities: ["voice-interface", "tts", "stt", "multilingual"],
    upstream: { name: "Voicebox", url: "https://github.com/jamiepine/voicebox" },
  },
  {
    id: "agentzero", name: "Agent Zero", category: "orchestration", role: "ORCHESTRATION",
    dashboardUrl: "http://127.0.0.1:5000", apiUrl: "http://127.0.0.1:5000",
    healthUrl: "http://127.0.0.1:5000/api/live", apiKeyEnv: ["AGENTZERO_API_KEY"],
    capabilities: ["multi-agent", "orchestration"],
    upstream: { name: "Agent Zero", url: "https://github.com/frdel/agent-zero" },
  },
  {
    id: "openhands", name: "OpenHands", category: "orchestration", role: "ORCHESTRATION",
    dashboardUrl: "http://127.0.0.1:8080", apiUrl: "http://127.0.0.1:18000",
    healthUrl: "http://127.0.0.1:18000/server_info", apiKeyEnv: ["OPENHANDS_API_KEY"],
    capabilities: ["approval-executor", "agent-canvas"],
    upstream: { name: "OpenHands", url: "https://github.com/All-Hands-AI/OpenHands" },
  },
].filter((service) => !RETIRED_SERVICE_IDS.has(service.id)) as CanonicalService[];

const BY_ID = new Map(CANONICAL_SERVICES.map((s) => [s.id, s]));

export function getCanonicalService(id: string): CanonicalService | undefined {
  return BY_ID.get(id);
}

export function listCanonicalServices(): CanonicalService[] {
  return CANONICAL_SERVICES;
}

/** Resolve the API key for a service from its apiKeyEnv list (server-side only). */
export function resolveServiceKey(s: CanonicalService): string | undefined {
  return firstEnv(...s.apiKeyEnv);
}

/** Public-safe view: strips secrets, adds keyConfigured (spec §2, §31). */
export function publicServiceView(s: CanonicalService) {
  return {
    id: s.id,
    name: s.name,
    category: s.category,
    role: s.role,
    dashboardUrl: s.dashboardUrl,
    apiUrl: s.apiUrl,
    healthUrl: s.healthUrl,
    capabilities: s.capabilities,
    externalUrl: s.externalUrl,
    keyConfigured: maskSecret(resolveServiceKey(s)) === "set",
  };
}

export function listPublicServices() {
  return CANONICAL_SERVICES.map(publicServiceView);
}


