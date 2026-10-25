import fs from "fs";
import os from "os";
import path from "path";
import { verify } from "../persistence/durableJsonl";
import { astraDataRoot } from "../services/env";
import { canonicalPort } from "../astra/supervisor/portRegistry";

export type HealthState = "HEALTHY" | "DEGRADED" | "FAILED" | "MISCONFIGURED";
export interface HealthComponent { id: string; state: HealthState; reason: string; latencyMs: number }

const REQUIRED_ENV = ["ASTRA_LLM_LOCAL_MODEL", "ASTRA_BACKUP_DIR"] as const;

type FetchLike = (url: string) => Promise<{ ok: boolean; json?: () => Promise<unknown> }>;

function readPorts(): Record<string, { host?: string; port?: number; healthPath?: string }> {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.resolve("config/ports.json"), "utf8")) as { services?: Record<string, { host?: string; port?: number; healthPath?: string }> };
    return parsed.services ?? {};
  } catch {
    return {};
  }
}

async function probe(fetchImpl: FetchLike, url: string): Promise<{ ok: boolean; body: unknown; latencyMs: number; reason: string }> {
  const started = Date.now();
  try {
    const response = await fetchImpl(url);
    const body = response.json ? await response.json().catch(() => ({})) : {};
    return { ok: response.ok, body, latencyMs: Date.now() - started, reason: response.ok ? "ok" : "http_error" };
  } catch (error) {
    return { ok: false, body: null, latencyMs: Date.now() - started, reason: error instanceof Error ? error.message : "unreachable" };
  }
}

export async function buildAstraDoctor(opts: {
  fetchImpl?: FetchLike;
  env?: NodeJS.ProcessEnv;
  ports?: Record<string, { host?: string; port?: number; healthPath?: string }>;
  stuckCount?: number;
  scheduleCount?: number;
} = {}): Promise<{ components: HealthComponent[]; credentials: Array<{ name: string; present: boolean }>; ramPercent: number }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const env = opts.env ?? process.env;
  const ports = opts.ports ?? readPorts();
  const components: HealthComponent[] = [];
  const endpoint = (id: string, fallbackPort: number, healthPath: string) => {
    const row = ports[id];
    const host = row?.host ?? "127.0.0.1";
    const port = row?.port ?? fallbackPort;
    return `http://${host}:${port}${row?.healthPath ?? healthPath}`;
  };

  const api = await probe(fetchImpl, endpoint("astra-api", 3000, "/api/health"));
  components.push({ id: "AstraAPI", state: api.ok ? "HEALTHY" : "FAILED", reason: api.reason, latencyMs: api.latencyMs });
  const ui = await probe(fetchImpl, endpoint("astra-ui", 5173, "/"));
  components.push({ id: "AstraUI", state: ui.ok ? "HEALTHY" : "FAILED", reason: ui.reason, latencyMs: ui.latencyMs });

  const laya = await probe(fetchImpl, "http://127.0.0.1:8791/v1/health");
  const warming = JSON.stringify(laya.body ?? "").toLowerCase().includes("warm");
  components.push({ id: "Laya", state: !laya.ok ? "FAILED" : warming ? "DEGRADED" : "HEALTHY", reason: warming ? "warming" : laya.reason, latencyMs: laya.latencyMs });

  const hermes = await probe(fetchImpl, `http://127.0.0.1:${ports.hermes?.port ?? 9119}/`);
  components.push({ id: "Hermes", state: hermes.ok ? "HEALTHY" : "FAILED", reason: hermes.reason, latencyMs: hermes.latencyMs });
  const freellm = await probe(fetchImpl, endpoint("freellmapi", canonicalPort("freellmapi"), "/v1/models"));
  components.push({ id: "FreeLLMAPI", state: freellm.ok ? "HEALTHY" : "FAILED", reason: freellm.reason, latencyMs: freellm.latencyMs });
  const ollama = await probe(fetchImpl, "http://127.0.0.1:11434/api/tags");
  components.push({ id: "Ollama", state: ollama.ok ? "HEALTHY" : "FAILED", reason: ollama.ok ? "ok" : ollama.reason, latencyMs: ollama.latencyMs });

  const voice = await probe(fetchImpl, endpoint("voicebox", ports.voicebox?.port ?? 17493, "/health"));
  components.push({ id: "Voicebox", state: voice.ok ? "HEALTHY" : "DEGRADED", reason: voice.reason, latencyMs: voice.latencyMs });

  let durableOk = false;
  try { durableOk = verify("agentops-tasks", astraDataRoot()).ok; } catch { durableOk = false; }
  components.push({ id: "durable-log", state: durableOk ? "HEALTHY" : "DEGRADED", reason: durableOk ? "chain_ok" : "chain_unverified", latencyMs: 0 });

  let diskReason = "ok";
  let diskState: HealthState = "HEALTHY";
  try {
    const stats = fs.statfsSync(astraDataRoot());
    diskReason = `free_bytes:${stats.bavail * stats.bsize}`;
  } catch {
    diskState = "DEGRADED";
    diskReason = "disk_free_unavailable";
  }
  components.push({ id: "disk", state: diskState, reason: diskReason, latencyMs: 0 });
  const ramPercent = Math.round((1 - os.freemem() / os.totalmem()) * 100);
  components.push({ id: "ram", state: ramPercent >= 90 ? "DEGRADED" : "HEALTHY", reason: `ram_percent:${ramPercent}`, latencyMs: 0 });

  const stuck = opts.stuckCount ?? 0;
  components.push({ id: "tasks", state: stuck ? "DEGRADED" : "HEALTHY", reason: "stuck_or_failed:" + stuck, latencyMs: 0 });
  components.push({ id: "schedules", state: "HEALTHY", reason: "jobs:" + (opts.scheduleCount ?? 0), latencyMs: 0 });

  if (!env.ASTRA_BACKUP_DIR) components.push({ id: "backup", state: "MISCONFIGURED", reason: "no backup path", latencyMs: 0 });
  else components.push({ id: "backup", state: "HEALTHY", reason: "backup_path_set", latencyMs: 0 });

  const credentials = REQUIRED_ENV.map((name) => ({ name, present: Boolean(env[name]) }));
  for (const row of credentials) {
    if (!row.present) components.push({ id: `env:${row.name}`, state: "MISCONFIGURED", reason: row.name, latencyMs: 0 });
  }
  return { components, credentials, ramPercent };
}
