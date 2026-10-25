import { getSecret } from "../services/secrets";
import { maskSecret, resolvedFreeLlmApiKey } from "./loadEnv";
import { canonicalPort, portEntries } from "../astra/supervisor/portRegistry";

const freellmHost = portEntries().freellmapi.host;
const freellmOrigin = `http://${freellmHost}:${canonicalPort("freellmapi")}`;
const freellmBaseUrl = `${freellmOrigin}/v1`;

function firstEnv(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

function secretStore(...ids: string[]): string | undefined {
  for (const id of ids) {
    try {
      const v = getSecret(id);
      if (v && v.trim()) return v.trim();
    } catch {
      /* store may be uninitialized */
    }
  }
  return undefined;
}

function normalizeV1(url: string): string {
  const t = url.trim().replace(/\/+$/, "");
  return t.endsWith("/v1") ? t : `${t}/v1`;
}

export interface AiServiceConfig {
  id: string;
  name: string;
  role: "PRIMARY" | "FALLBACK" | "LOCAL_FALLBACK" | "ORCHESTRATION" | "WORKFLOW" | "EXTERNAL_CLOUD" | "DISABLED";
  baseUrl: string;
  dashboardUrl: string;
  apiKey?: string;
  keyPresent: boolean;
}

export function adapterPublicUrl(): string {
  return normalizeV1(firstEnv("ASTRA_ADAPTER_BASE_URL") ?? "http://127.0.0.1:3000/v1");
}

export function adapterApiKey(): string | undefined {
  return (
    firstEnv("ASTRA_ADAPTER_API_KEY", "FREELLMAPI_API_KEY", "ASTRA_FREELLMAPI_API_KEY") ??
    secretStore("freellmapi.API_KEY", "freellmapi.UNIFIED_KEY")
  );
}

export function aiGatewayConfig(): {
  primary: AiServiceConfig;
  fallback: AiServiceConfig;
  local: AiServiceConfig;
  ollama: AiServiceConfig;
  hermes: AiServiceConfig;
  paperclip: AiServiceConfig;
  n8n: AiServiceConfig;
  langgraph: AiServiceConfig;
  openclaw: AiServiceConfig;
  agentzero: AiServiceConfig;
  openhands: AiServiceConfig;
  adapter: { publicUrl: string; keyPresent: boolean };
} {
  const freeKey = resolvedFreeLlmApiKey() ?? secretStore("freellmapi.API_KEY", "freellmapi.UNIFIED_KEY");

  // Native Astra stack: FreeLLMAPI serves its API and dashboard from the
  // canonical endpoint in config/ports.json.
  const freeBase = normalizeV1(firstEnv("FREELLMAPI_BASE_URL", "ASTRA_FREELLMAPI_BASE_URL") ?? freellmBaseUrl);

  return {
    primary: {
      id: "freellmapi",
      name: "FreeLLMAPI",
      role: "PRIMARY",
      baseUrl: freeBase,
      dashboardUrl: firstEnv("ASTRA_FREELLMAPI_DASHBOARD_URL", "FREELLMAPI_DASHBOARD_URL") ?? `${freellmOrigin}/`,
      apiKey: freeKey,
      keyPresent: maskSecret(freeKey) === "set",
    },
    fallback: {
      id: "omniroute-disabled",
      name: "OmniRoute (disabled by ASTRA policy)",
      role: "DISABLED",
      baseUrl: "",
      dashboardUrl: "",
      keyPresent: false,
    },
    local: {
      id: "ollama",
      name: "Ollama",
      role: "LOCAL_FALLBACK",
      baseUrl: normalizeV1(firstEnv("OLLAMA_BASE_URL") ?? "http://127.0.0.1:11434/v1"),
      dashboardUrl: firstEnv("OLLAMA_DASHBOARD_URL") ?? "http://127.0.0.1:11434",
      keyPresent: false,
    },
    ollama: {
      id: "ollama",
      name: "Ollama",
      role: "LOCAL_FALLBACK",
      baseUrl: normalizeV1(firstEnv("OLLAMA_BASE_URL") ?? "http://127.0.0.1:11434/v1"),
      dashboardUrl: firstEnv("OLLAMA_DASHBOARD_URL") ?? "http://127.0.0.1:11434",
      keyPresent: false,
    },
    hermes: {
      id: "hermes",
      name: "Hermes",
      role: "ORCHESTRATION",
      baseUrl: firstEnv("HERMES_BASE_URL") ?? "http://127.0.0.1:9119",
      dashboardUrl: "http://127.0.0.1:9119/chat",
      apiKey: firstEnv("HERMES_API_KEY"),
      keyPresent: maskSecret(firstEnv("HERMES_API_KEY")) === "set",
    },
    paperclip: {
      id: "paperclip",
      name: "Paperclip",
      role: "WORKFLOW",
      baseUrl: firstEnv("PAPERCLIP_BASE_URL") ?? "http://127.0.0.1:3100",
      dashboardUrl: "http://127.0.0.1:3100/onboarding",
      apiKey: firstEnv("PAPERCLIP_API_KEY"),
      keyPresent: maskSecret(firstEnv("PAPERCLIP_API_KEY")) === "set",
    },
    n8n: {
      id: "n8n",
      name: "n8n",
      role: "WORKFLOW",
      baseUrl: firstEnv("N8N_BASE_URL") ?? "http://127.0.0.1:5678",
      dashboardUrl: "http://127.0.0.1:5678/home/workflows",
      apiKey: firstEnv("N8N_API_KEY"),
      keyPresent: maskSecret(firstEnv("N8N_API_KEY")) === "set",
    },
    langgraph: {
      id: "langgraph",
      name: "LangGraph",
      role: "ORCHESTRATION",
      baseUrl: "in-process",
      dashboardUrl: "",
      keyPresent: false,
    },
    openclaw: {
      id: "openclaw",
      name: "OpenClaw",
      role: "ORCHESTRATION",
      baseUrl: firstEnv("OPENCLAW_BASE_URL") ?? "http://127.0.0.1:18789",
      dashboardUrl: "http://127.0.0.1:18789",
      apiKey: firstEnv("OPENCLAW_API_KEY"),
      keyPresent: maskSecret(firstEnv("OPENCLAW_API_KEY")) === "set",
    },
    agentzero: {
      id: "agentzero",
      name: "Agent Zero",
      role: "ORCHESTRATION",
      baseUrl: firstEnv("AGENTZERO_BASE_URL") ?? "http://127.0.0.1:5000",
      dashboardUrl: "http://127.0.0.1:5000",
      apiKey: firstEnv("AGENTZERO_API_KEY"),
      keyPresent: maskSecret(firstEnv("AGENTZERO_API_KEY")) === "set",
    },
    openhands: {
      id: "openhands",
      name: "OpenHands",
      role: "ORCHESTRATION",
      baseUrl: firstEnv("OPENHANDS_AGENTSERVER_URL") ?? "http://127.0.0.1:18000",
      dashboardUrl: "http://127.0.0.1:8080",
      apiKey: firstEnv("OPENHANDS_API_KEY"),
      keyPresent: maskSecret(firstEnv("OPENHANDS_API_KEY")) === "set",
    },
    adapter: {
      publicUrl: adapterPublicUrl(),
      keyPresent: maskSecret(adapterApiKey()) === "set",
    },
  };
}

export function publicServiceView(s: AiServiceConfig) {
  return {
    id: s.id,
    name: s.name,
    role: s.role,
    endpoint: s.baseUrl,
    dashboardUrl: s.dashboardUrl,
    keyConfigured: s.keyPresent,
  };
}
