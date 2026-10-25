/**
 * Connect provider API keys from Astra Brain into the local gateways.
 * FreeLLMAPI stores provider keys AES-256-GCM encrypted in its own database.
 * OmniRoute stores them through its local provider-key API.
 * This module never logs a key and never writes one into git.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import {
  applyFreeLlmUnifiedKey,
  applyOmniRouteClientKey,
  freeLlmDatabasePath,
  maskSecret,
  omniRouteDatabasePath,
  readFreeLlmUnifiedKey,
  readOmniRouteClientKey,
  syncLocalGatewayKeys,
} from "./loadEnv";
import { canonicalPort, portEntries } from "../astra/supervisor/portRegistry";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const FREELLM_PLATFORMS = new Set([
  "google", "groq", "cerebras", "bai", "nvidia", "mistral",
  "openrouter", "github", "cohere", "cloudflare", "zhipu", "ollama",
  "kilo", "pollinations", "llm7", "huggingface", "opencode", "ovh", "agnes", "reka", "siliconflow",
  "routeway", "bazaarlink", "ainative", "aion", "anyapi", "requesty", "navy", "nara", "sealion", "orcarouter", "unorouter", "xkiro", "modelscope",
  "qianfan", "volcengine", "longcat", "xfyun", "aihorde", "custom",
]);

const FREELLMAPI_ORIGIN = `http://${portEntries().freellmapi.host}:${canonicalPort("freellmapi")}`;

export interface GatewaySideStatus {
  listening: boolean;
  live: boolean;
  key: "set" | "missing";
  detail: string;
  reason: string;
}

export interface GatewayLinkStatus {
  freellm: GatewaySideStatus;
  omniroute: GatewaySideStatus;
  order: ["freellmapi", "omniroute", "ollama"];
}

function sqlite(dbPath: string, readonly: boolean) {
  const require = createRequire(path.join(ROOT, "freellmapi", "package.json"));
  const Database = require("better-sqlite3") as new (p: string, o?: object) => {
    prepare: (s: string) => { all: (...a: unknown[]) => unknown[]; get: (...a: unknown[]) => unknown; run: (...a: unknown[]) => { changes: number } };
    close: () => void;
  };
  return new Database(dbPath, { readonly, fileMustExist: true, timeout: 4000 });
}

async function probe(url: string, apiKey?: string): Promise<number | "down"> {
  try {
    const headers: Record<string, string> = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(2500) });
    return res.status;
  } catch {
    return "down";
  }
}

export async function gatewayLinkStatus(): Promise<GatewayLinkStatus> {
  const synced = syncLocalGatewayKeys();
  const freeKey = readFreeLlmUnifiedKey().key;
  const omniKey = readOmniRouteClientKey().key;
  const [freePing, freeModels, omniModels] = await Promise.all([
    probe(`${FREELLMAPI_ORIGIN}/api/ping`),
    probe(`${FREELLMAPI_ORIGIN}/v1/models`, freeKey),
    probe("http://127.0.0.1:20128/v1/models", omniKey),
  ]);
  const freeListening = freePing !== "down";
  const omniListening = omniModels !== "down";
  let providers = 0;
  try {
    const dbPath = freeLlmDatabasePath();
    if (fs.existsSync(dbPath)) {
      const db = sqlite(dbPath, true);
      const row = db.prepare("SELECT COUNT(*) AS n FROM api_keys WHERE enabled = 1").get() as { n?: number } | undefined;
      providers = Number(row?.n ?? 0);
      db.close();
    }
  } catch {
    providers = 0;
  }
  const freeReason = !freeListening
    ? `FreeLLMAPI process is not running on ${FREELLMAPI_ORIGIN}`
    : synced.freellm === "missing"
      ? "FREELLMAPI_API_KEY missing in the local FreeLLMAPI database"
      : freeModels === 200
        ? ""
        : `FreeLLMAPI GET /v1/models returned ${freeModels}`;
  const omniReason = !omniListening
    ? "OmniRoute process is not running on 127.0.0.1:20128"
    : synced.omniroute === "missing"
      ? "OMNIROUTE_API_KEY missing in the local OmniRoute database"
      : omniModels === 200
        ? ""
        : `OmniRoute GET /v1/models returned ${omniModels}`;
  return {
    order: ["freellmapi", "omniroute", "ollama"],
    freellm: {
      listening: freeListening,
      live: freeModels === 200,
      key: maskSecret(freeKey),
      detail: `${providers} provider key${providers === 1 ? "" : "s"} stored locally`,
      reason: freeReason,
    },
    omniroute: {
      listening: omniListening,
      live: omniModels === 200,
      key: maskSecret(omniKey),
      detail: "Client key is read from the local OmniRoute database",
      reason: omniReason,
    },
  };
}

function encryptionKeyForFreeLlm(): Buffer {
  const dbPath = freeLlmDatabasePath();
  const keyFile = path.join(path.dirname(dbPath), ".encryption-key");
  if (!fs.existsSync(keyFile)) {
    throw new Error("FreeLLMAPI .encryption-key is missing beside its database");
  }
  const hex = fs.readFileSync(keyFile, "utf8").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("FreeLLMAPI .encryption-key is not a 32-byte hex key");
  }
  return Buffer.from(hex, "hex");
}

function encryptFreeLlm(text: string): { encrypted: string; iv: string; authTag: string } {
  const key = encryptionKeyForFreeLlm();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = cipher.update(text, "utf8", "hex") + cipher.final("hex");
  return { encrypted, iv: iv.toString("hex"), authTag: cipher.getAuthTag().toString("hex") };
}

function decryptFreeLlm(encrypted: string, iv: string, authTag: string): string {
  const key = encryptionKeyForFreeLlm();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"), { authTagLength: 16 });
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  return decipher.update(encrypted, "hex", "utf8") + decipher.final("utf8");
}

function storeFreeLlmProviderKey(platform: string, apiKey: string): { ok: boolean; reason: string } {
  const dbPath = freeLlmDatabasePath();
  if (!fs.existsSync(dbPath)) return { ok: false, reason: "FreeLLMAPI database was not found" };
  let db: ReturnType<typeof sqlite> | undefined;
  try {
    db = sqlite(dbPath, false);
    const rows = db.prepare("SELECT encrypted_key, iv, auth_tag FROM api_keys WHERE platform = ?").all(platform) as Array<{ encrypted_key: string; iv: string; auth_tag: string }>;
    for (const row of rows) {
      try {
        if (decryptFreeLlm(row.encrypted_key, row.iv, row.auth_tag) === apiKey) {
          return { ok: true, reason: "Already stored in FreeLLMAPI" };
        }
      } catch {
        /* a row written by another key version is left untouched */
      }
    }
    const sealed = encryptFreeLlm(apiKey);
    db.prepare(
      "INSERT INTO api_keys (platform, label, encrypted_key, iv, auth_tag, status, enabled, created_at) VALUES (?, ?, ?, ?, ?, 'unknown', 1, datetime('now'))",
    ).run(platform, "Astra Brain", sealed.encrypted, sealed.iv, sealed.authTag);
    return { ok: true, reason: "Stored in the local FreeLLMAPI database" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "FreeLLMAPI did not store the key";
    return { ok: false, reason: message.replace(apiKey, "[redacted]") };
  } finally {
    db?.close();
  }
}

async function storeOmniRouteProviderKey(provider: string, apiKey: string): Promise<{ ok: boolean; reason: string }> {
  const client = readOmniRouteClientKey();
  if (!client.key) return { ok: false, reason: client.error ?? "OMNIROUTE_API_KEY missing" };
  const listening = await probe("http://127.0.0.1:20128/v1/models");
  if (listening === "down") return { ok: false, reason: "OmniRoute process is not running on 127.0.0.1:20128" };
  try {
    const res = await fetch("http://127.0.0.1:20128/api/v1/providers/keys", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${client.key}`,
      },
      body: JSON.stringify({ provider, apiKey }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return { ok: true, reason: "Stored by the local OmniRoute provider API" };
    if (res.status === 404 || res.status === 405) {
      return { ok: false, reason: "OmniRoute has no POST /api/v1/providers/keys on this install" };
    }
    return { ok: false, reason: `OmniRoute HTTP ${res.status}` };
  } catch {
    return { ok: false, reason: "OmniRoute did not answer POST /api/v1/providers/keys" };
  }
}

export async function connectProviderKey(input: { platform?: unknown; apiKey?: unknown; freellm?: unknown; omniroute?: unknown }): Promise<{
  ok: boolean;
  freellm?: { ok: boolean; reason: string };
  omniroute?: { ok: boolean; reason: string };
  error?: string;
}> {
  const platform = String(input.platform ?? "").trim().toLowerCase();
  const apiKey = String(input.apiKey ?? "").trim();
  const toFree = input.freellm !== false;
  const toOmni = input.omniroute !== false;
  if (!/^[a-z][a-z0-9-]{0,40}$/.test(platform)) return { ok: false, error: "Name the provider, for example groq" };
  if (apiKey.length < 8 || apiKey.length > 4000) return { ok: false, error: "The provider key is missing" };
  if (!toFree && !toOmni) return { ok: false, error: "Choose FreeLLM, OmniRoute, or both" };
  const freellm = toFree
    ? FREELLM_PLATFORMS.has(platform)
      ? storeFreeLlmProviderKey(platform, apiKey)
      : { ok: false, reason: "That provider name is not in the FreeLLMAPI key list" }
    : undefined;
  const omniroute = toOmni ? await storeOmniRouteProviderKey(platform, apiKey) : undefined;
  if (freellm?.ok) {
    const unified = readFreeLlmUnifiedKey();
    if (unified.key) applyFreeLlmUnifiedKey(unified.key);
  }
  if (omniroute?.ok) {
    const client = readOmniRouteClientKey();
    if (client.key) applyOmniRouteClientKey(client.key);
  }
  const ok = Boolean((!toFree || freellm?.ok) && (!toOmni || omniroute?.ok));
  return { ok, freellm, omniroute };
}
