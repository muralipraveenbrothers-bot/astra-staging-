/**
 * Load backend env files without exposing values to the Vite client.
 * Files (later wins): config/ai-gateway.env, .env, .env.local
 * Never logs secret values.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { canonicalPort } from "../astra/supervisor/portRegistry";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Canonical FreeLLMAPI port — read from config/ports.json (single source of truth).
 *
 * WHY THIS EXISTS: applyFreeLlmUnifiedKey() below used to hardcode
 * a FreeLLMAPI base URL pinned to the retired port 3001 and write it into
 * config/ai-gateway.env whenever that line was absent. That silently
 * RE-INTRODUCED the retired port 3001 on every key save, undoing the :31415
 * migration: the gateway stayed healthy on 31415 while every probe pointed at a
 * dead 3001, so the UI reported OFFLINE for a live service. The port now comes
 * from the registry and cannot drift again.
 */
function canonicalFreeLlmPort(): number {
  try {
    const raw = fs.readFileSync(path.join(ROOT, "config", "ports.json"), "utf8");
    const parsed = JSON.parse(raw) as { services?: Record<string, { port?: number }> };
    const port = parsed.services?.freellmapi?.port;
    if (typeof port === "number" && Number.isInteger(port) && port > 0) return port;
  } catch {
    /* fall through to the frozen canonical default */
  }
  return canonicalPort("freellmapi");
}

const ENV_FILES = [
  path.join(ROOT, "config", "ai-gateway.env"),
  path.join(ROOT, ".env"),
  path.join(ROOT, ".env.local"),
];

const SECRET_SUFFIXES = ["_API_KEY", "_KEY", "_TOKEN", "_SECRET"];

function isSecretName(name: string): boolean {
  return SECRET_SUFFIXES.some((s) => name.endsWith(s));
}

function parseEnvFile(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return out;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}

export function loadBackendEnv(): { loadedFiles: string[]; appliedKeys: string[] } {
  const loadedFiles: string[] = [];
  const appliedKeys: string[] = [];
  for (const file of ENV_FILES) {
    const parsed = parseEnvFile(file);
    if (Object.keys(parsed).length === 0) continue;
    loadedFiles.push(file);
    for (const [k, v] of Object.entries(parsed)) {
      if (process.env[k] === undefined || process.env[k] === "") {
        process.env[k] = v;
        appliedKeys.push(isSecretName(k) ? `${k}=***` : k);
      }
    }
  }
  const synced = readFreeLlmUnifiedKey();
  // The Keys tab is the source of truth. A stale key left in the env file
  // makes FreeLLMAPI return 401 and the voice turn never reaches it.
  if (synced.key && process.env.FREELLMAPI_API_KEY !== synced.key) {
    applyFreeLlmUnifiedKey(synced.key);
    appliedKeys.push("FREELLMAPI_API_KEY=*** (synced from FreeLLMAPI Keys tab)");
  }
  const omni = readOmniRouteClientKey();
  if (omni.key && process.env.OMNIROUTE_API_KEY !== omni.key) {
    applyOmniRouteClientKey(omni.key);
    appliedKeys.push("OMNIROUTE_API_KEY=*** (synced from local OmniRoute database)");
  }
  return { loadedFiles, appliedKeys };
}


export function freeLlmDatabasePath(): string {
  const roaming = process.env.APPDATA ? path.join(process.env.APPDATA, "FreeLLMAPI", "freeapi.db") : "";
  if (roaming && fs.existsSync(roaming)) return roaming;
  return path.join(ROOT, "freellmapi", "server", "data", "freeapi.db");
}

/** Same order as OmniRoute getDefaultDataDir: a legacy ~/.omniroute install wins. */
export function omniRouteDatabasePath(): string {
  const legacy = path.join(os.homedir(), ".omniroute", "storage.sqlite");
  if (fs.existsSync(legacy)) return legacy;
  const roaming = process.env.APPDATA ? path.join(process.env.APPDATA, "omniroute", "storage.sqlite") : "";
  if (roaming && fs.existsSync(roaming)) return roaming;
  return legacy;
}

function openGatewayDb(dbPath: string, readonly: boolean) {
  const require = createRequire(path.join(ROOT, "freellmapi", "package.json"));
  const Database = require("better-sqlite3") as new (p: string, o?: object) => {
    prepare: (s: string) => { get: (...a: unknown[]) => unknown };
    close: () => void;
  };
  return new Database(dbPath, { readonly, fileMustExist: true, timeout: 4000 });
}

export function readOmniRouteClientKey(): { key?: string; error?: string } {
  const dbPath = omniRouteDatabasePath();
  if (!fs.existsSync(dbPath)) return { error: "OmniRoute database not found" };
  try {
    const db = openGatewayDb(dbPath, true);
    const row = db.prepare(
      "SELECT key FROM api_keys WHERE revoked_at IS NULL AND is_active = 1 AND key IS NOT NULL AND length(key) > 0 ORDER BY COALESCE(created_at, '') DESC LIMIT 1",
    ).get() as { key?: string } | undefined;
    db.close();
    if (!row?.key) return { error: "OMNIROUTE_API_KEY missing" };
    return { key: row.key };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export function applyOmniRouteClientKey(key: string): void {
  process.env.OMNIROUTE_API_KEY = key;
  process.env.ASTRA_LLM_GATEWAY_API_KEY = key;
  const envPath = path.join(ROOT, "config", "ai-gateway.env");
  let existing = "";
  try {
    existing = fs.readFileSync(envPath, "utf8");
  } catch {
    existing = "";
  }
  const line = `OMNIROUTE_API_KEY=${key}`;
  const next = existing.includes("OMNIROUTE_API_KEY=")
    ? existing.replace(/^OMNIROUTE_API_KEY=.*$/m, line)
    : `${existing.trim()}\n${line}\n`;
  fs.writeFileSync(envPath, next.endsWith("\n") ? next : `${next}\n`, "utf8");
}

export function syncLocalGatewayKeys(): { freellm: "set" | "missing"; omniroute: "set" | "missing" } {
  const free = readFreeLlmUnifiedKey();
  if (free.key) applyFreeLlmUnifiedKey(free.key);
  const omni = readOmniRouteClientKey();
  if (omni.key) applyOmniRouteClientKey(omni.key);
  return {
    freellm: free.key ? "set" : "missing",
    omniroute: omni.key ? "set" : "missing",
  };
}

export function maskSecret(value: string | undefined): "missing" | "set" {
  return value && value.trim() && !value.includes("xxxx") ? "set" : "missing";
}

/** Read the unified key from the local FreeLLMAPI Keys-tab database. Never logs it. */
export function readFreeLlmUnifiedKey(): { key?: string; userId?: number; email?: string; error?: string } {
  const dbPath = freeLlmDatabasePath();
  if (!fs.existsSync(dbPath)) return { error: "FreeLLMAPI database not found" };
  try {
    const require = createRequire(path.join(ROOT, "freellmapi", "server", "package.json"));
    const Database = require("better-sqlite3") as new (p: string, o?: object) => {
      prepare: (s: string) => { get: (...a: unknown[]) => unknown; all: (...a: unknown[]) => unknown[] };
      close: () => void;
    };
    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get("unified_api_key") as { value?: string } | undefined;
    const user = db.prepare("SELECT id, email FROM users ORDER BY id LIMIT 1").get() as { id?: number; email?: string } | undefined;
    db.close();
    if (!row?.value?.startsWith("freellmapi-")) return { error: "unified key missing in FreeLLMAPI settings", userId: user?.id, email: user?.email };
    return { key: row.value, userId: user?.id, email: user?.email };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Single credential resolution used by gateway and Hermes callers. */
export function resolvedFreeLlmApiKey(): string | undefined {
  const unified = readFreeLlmUnifiedKey().key;
  if (unified) return unified;
  return process.env.FREELLMAPI_API_KEY || process.env.ASTRA_FREELLMAPI_API_KEY || process.env.ASTRA_ADAPTER_API_KEY;
}

export function applyFreeLlmUnifiedKey(key: string): void {
  process.env.FREELLMAPI_API_KEY = key;
  process.env.ASTRA_FREELLMAPI_API_KEY = key;
  process.env.ASTRA_LLM_API_KEY = key;
  const envPath = path.join(ROOT, "config", "ai-gateway.env");
  let existing = "";
  try {
    existing = fs.readFileSync(envPath, "utf8");
  } catch {
    existing = "";
  }
  const line = `FREELLMAPI_API_KEY=${key}`;
  const next = existing.includes("FREELLMAPI_API_KEY=")
    ? existing.replace(/^FREELLMAPI_API_KEY=.*$/m, line)
    : `${existing.trim()}\n${line}\n`;
  // NEVER hardcode a port here. Derive it from config/ports.json so a key save
  // can never resurrect a retired port (see canonicalFreeLlmPort above).
  if (!next.includes("FREELLMAPI_BASE_URL=")) {
    fs.writeFileSync(envPath, `FREELLMAPI_BASE_URL=http://127.0.0.1:${canonicalFreeLlmPort()}/v1\n${next.trim()}\n`, "utf8");
  } else {
    fs.writeFileSync(envPath, next.endsWith("\n") ? next : `${next}\n`, "utf8");
  }
}
