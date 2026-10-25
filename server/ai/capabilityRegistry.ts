import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { collectAiHealth, type ServiceHealth } from "./health";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REGISTRY_PATH = path.join(ROOT, "src", "config", "capability-registry.json");

export interface CapabilityFact {
  id: string;
  name: string;
  category: string;
  role: string;
  dashboard_url: string;
  api_url: string;
  health_url: string;
  api_protocol: string;
  authentication: string;
  model_provider: boolean;
  supports_custom_provider: boolean;
  supports_openai_compatible: boolean;
  supports_streaming: boolean;
  supports_tools: boolean;
  supports_vision: boolean;
  supports_files: boolean;
  supports_webhooks: boolean;
  supports_websocket: boolean;
  supports_iframe: boolean;
  open_mode: string;
  port: number;
  apiPort?: number;
  statusKind?: string;
  proxyPrefix?: string;
  embedViaProxy?: boolean;
  installPath?: string;
}

export type HonestStatus = "LIVE" | "DEGRADED" | "AUTH_REQUIRED" | "OFFLINE" | "STARTING" | "FAILED" | "UNKNOWN";

function loadFacts(): CapabilityFact[] {
  const raw = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8")) as { services: CapabilityFact[] };
  return raw.services;
}

function mapStatus(h?: ServiceHealth): HonestStatus {
  if (!h) return "UNKNOWN";
  if (!h.reachable) return "OFFLINE";
  if (h.authenticated === false) return "AUTH_REQUIRED";
  if (h.error) return "DEGRADED";
  // Reaching here means `reachable` is truthy and `authenticated` is not false
  // (both established above), so the former condition here was a tautology —
  // TS2367 flagged it as an unintentional comparison against `false`.
  return "LIVE";
}

export async function listCapabilities() {
  const facts = loadFacts();
  const health = await collectAiHealth();
  const healthById: Record<string, ServiceHealth> = health.services;
  const alias: Record<string, string> = { langgraph: "langgraph", "langgraph-orchestrator": "langgraph" };
  return facts.map((f) => {
    const hid = alias[f.id] ?? f.id;
    const h = healthById[hid] ?? healthById[f.id === "astra" ? "astra" : f.id];
    return {
      ...f,
      status: mapStatus(h),
      latency: h?.latencyMs ?? null,
      last_success: h?.reachable ? h.checkedAt : null,
      last_error: h?.error ?? null,
      keyConfigured: h?.keyConfigured ?? false,
    };
  });
}

export function getCapabilityFact(id: string): CapabilityFact | undefined {
  return loadFacts().find((s) => s.id === id);
}
