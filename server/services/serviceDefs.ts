/**
 * Astra AI — Internal Service Manager :: Managed Service Definitions
 * ==================================================================
 * Pinned upstream sources. ASTRA runs the REAL upstream server runtimes
 * (never substitute implementations, never desktop .exe shells):
 *
 *   freellmapi  → FreeLLMAPI v0.9.0, pinned commit, Node/TS workspace server
 *                 (@freellmapi/server: `tsc` build → `node dist/index.js`)
 *                 https://github.com/tashfeenahmed/freellmapi (MIT)
 *   omniroute   → OmniRoute v3.8.50 (local zip: OmniRoute-3.8.50.zip), headless gateway via
 *                 `bin/omniroute.mjs` — Electron NOT required
 *                 https://github.com/diegosouzapw/OmniRoute (MIT)
 */

import fs from "fs";
import path from "path";
import http from "http";
import crypto from "crypto";
import { getSecret, setSecret } from "./secrets";
import { isPortResponding } from "./runtimeDetect";
import { serviceDirs } from "./env";
import type { ServiceId } from "./types";
import { canonicalPort } from "../astra/supervisor/portRegistry";

export interface ManagedServiceDef {
  id: ServiceId;
  displayName: string;
  upstreamName: string;
  repoUrl: string;
  /** git ref used for clone/checkout */
  ref: string;
  /** exact commit that must be present after checkout (integrity gate) */
  pinnedCommit?: string;
  requestedVersion: string;
  license: string;
  nodeRequirementClauses: string[];
  defaultHost: string;
  defaultPort: number;
  sourceLayout: "git-workspace" | "git-package";
  installCwdRelative: string;
  installArgs: string[];
  buildStep?: { cwdRelative: string; command: string; args: string[] };
  launchScriptRelative: string;
  launchArgs: string[];
  externalInstallHints: { configPaths: string[]; defaultPorts: number[] };
}

export const SERVICE_DEFS: Record<ServiceId, ManagedServiceDef> = {
  freellmapi: {
    id: "freellmapi",
    displayName: "FreeLLMAPI",
    upstreamName: "FreeLLMAPI",
    repoUrl: "https://github.com/tashfeenahmed/freellmapi.git",
    ref: "v0.9.0",
    pinnedCommit: "3b6f40e9a3e1691dd7e561d9fa842c28d6218746",
    requestedVersion: "0.9.0",
    license: "MIT",
    nodeRequirementClauses: [">=20.18.0 <25.0.0"],
    defaultHost: "127.0.0.1",
    // Canonical FreeLLMAPI port — one process serving API + dashboard. The
    // upstream default 3001 and the old dashboard port 5170 are retired.
    defaultPort: canonicalPort("freellmapi"),
    sourceLayout: "git-workspace",
    // Full deps required: typescript/tsc performs the production server build.
    installCwdRelative: ".",
    installArgs: ["install", "--no-audit", "--no-fund"],
    buildStep: { cwdRelative: ".", command: "npm", args: ["run", "build"] },
    launchScriptRelative: "server/dist/index.js",
    launchArgs: [],
    externalInstallHints: {
      configPaths: [
        "%APPDATA%\\FreeLLMAPI",
        "%LOCALAPPDATA%\\Programs\\FreeLLMAPI",
        "%USERPROFILE%\\.config\\FreeLLMAPI",
      ],
      defaultPorts: [canonicalPort("freellmapi")],
    },
  },

  omniroute: {
    id: "omniroute",
    displayName: "OmniRoute",
    upstreamName: "OmniRoute",
    repoUrl: "https://github.com/diegosouzapw/OmniRoute.git",
    // zip-extracted: ref is used for display/fallback only; actual source from local zip
    ref: "v3.8.50",
    requestedVersion: "3.8.50",
    license: "MIT",
    // OmniRoute's own policy: patched 22.x LTS (>=22.22.2) or 24–26. 22.14.0 is rejected.
    nodeRequirementClauses: [">=22.22.2 <23", ">=24.0.0 <27"],
    defaultHost: "127.0.0.1",
    // Desktop Electron app serves :20128 (verified live 2026-09-09).
    // Keep :5171 as the portable/dev fallback — externalInstallHints lists both.
    defaultPort: 20128,
    sourceLayout: "git-package",
    installCwdRelative: ".",
    installArgs: ["install", "--no-audit", "--no-fund"],
    buildStep: { cwdRelative: ".", command: "npm", args: ["run", "build"] },
    launchScriptRelative: "scripts/dev/run-next.mjs",
    launchArgs: ["dev"],
    externalInstallHints: {
      configPaths: [
        "%APPDATA%\\omniroute",
        "%USERPROFILE%\\.omniroute",
        "%LOCALAPPDATA%\\Programs\\OmniRoute",
        "C:\\Program Files\\OmniRoute",
      ],
      defaultPorts: [20128, 5171],
    },
  },
};

export const ALL_SERVICE_IDS: ServiceId[] = ["freellmapi", "omniroute"];

// ---------------------------------------------------------------------------
// Health probes — real HTTP checks only.
// ---------------------------------------------------------------------------

function requestOnce(url: string, timeoutMs = 4000): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: "GET", timeout: timeoutMs }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; if (data.length > 256_000) res.destroy(); });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error(`Timeout after ${timeoutMs}ms`)));
    req.on("error", reject);
    req.end();
  });
}

/** Multi-candidate health probe; returns the real latency of the successful probe. */
export async function probeEndpoint(
  urlCandidates: string[],
  /** Per-attempt budget. Omitted -> requestOnce()'s 4s default. The OmniRoute
   *  caller passes 8s: its desktop app can be slow to answer on a cold start. */
  timeoutMs?: number,
): Promise<{ ok: boolean; latencyMs: number; detail: string }> {
  const started = Date.now();
  const errors: string[] = [];
  for (const url of urlCandidates) {
    try {
      const res = await requestOnce(url, timeoutMs);
      const latencyMs = Date.now() - started;
      if (res.status >= 200 && res.status < 500) {
        return { ok: true, latencyMs, detail: `${url} → HTTP ${res.status}` };
      }
      errors.push(`${url} → HTTP ${res.status}`);
    } catch (err: any) {
      errors.push(`${url} → ${err?.message ?? String(err)}`);
    }
  }
  return { ok: false, latencyMs: Date.now() - started, detail: errors.join("; ") || "No endpoint reachable" };
}

// ---------------------------------------------------------------------------
// Launch env + probe construction — reads installed layout + secret store.
// Raw secret values are pulled only into child-process env, never logged.
// ---------------------------------------------------------------------------

export function buildEnv(id: ServiceId, host: string, port: number): Record<string, string> {
  const dirs = serviceDirs(id);
  const env: Record<string, string> = {
    HOST: host,
    PORT: String(port),
    NODE_ENV: "production",
    HOST_BIND: host, // localhost-only by default (§31)
  };
  if (id === "freellmapi") {
    // FreeLLMAPI requires ENCRYPTION_KEY for at-rest key storage (§5/Phase 5).
    // Auto-generate + persist one when the administrator has not provided one,
    // so the base open-source service can install/start WITHOUT any Premium key.
    let encKey = getSecret("freellmapi.ENCRYPTION_KEY");
    if (!encKey) {
      encKey = crypto.randomBytes(32).toString("hex");
      setSecret("freellmapi.ENCRYPTION_KEY", encKey);
    }
    env.ENCRYPTION_KEY = encKey;
    // Persist the SQLite state in ASTRA's managed data dir (Phase 5).
    env.FREEAPI_DB_PATH = path.join(dirs.data, "freeapi.db");
    fs.mkdirSync(dirs.data, { recursive: true });
    const envFile = path.join(dirs.config, ".env");
    if (fs.existsSync(envFile)) env.FREEAPI_ENV_PATH = envFile;
  }
  if (id === "omniroute") {
    const key = getSecret("omniroute.OMNIROUTE_API_KEY");
    if (key) env.OMNIROUTE_API_KEY = key;
    env.OMNIROUTE_HEADLESS = "1"; // headless hint; harmless if upstream ignores it
    // Allow Astra Internal Browser (localhost:5173) to iframe the dashboard.
    env.DASHBOARD_ALLOW_EMBED = "astra";
  }
  return env;
}

export function healthUrlCandidates(id: ServiceId, host: string, port: number): string[] {
  // FreeLLMAPI has no /health. Verified live endpoints:
  // /api/ping, /livez, /readyz, /v1/models.
  // OmniRoute desktop app (:20128) serves dashboard + API on one port —
  // /v1/models is canonical (verified 3627 models 2026-09-09), then / and /health.
  if (id === "freellmapi")
    return [
        `http://${host}:${port}/api/ping`,
        `http://${host}:${port}/livez`,
        `http://${host}:${port}/readyz`,
        `http://${host}:${port}/v1/models`,
      ];
  if (id === "omniroute")
    // Root "/" is fast (<1s) — probe it first so health checks return quickly.
    // /v1/models can take 15-35s cold; only checked if root is unreachable.
    return [
        `http://${host}:${port}/`,
        `http://${host}:${port}/health`,
        `http://${host}:${port}/v1/models`,
      ];
  return [
      `http://${host}:${port}/health`,
      `http://${host}:${port}/v1/models`,
      `http://${host}:${port}/`,
    ];
}

/** Build the async health probe used by a service supervisor. */
export function makeProbe(id: ServiceId, host: string, port: number) {
  return async (): Promise<{ ok: boolean; latencyMs: number; detail: string }> => {
    if (!(await isPortResponding(host, port))) {
      return { ok: false, latencyMs: 0, detail: `TCP ${host}:${port} not responding` };
    }
    // OmniRoute desktop app (:20128) root "/" responds in <1s; /v1/models
    // can take 15-35s cold. Since we probe root first, 8s is plenty.
    const timeoutMs = id === "omniroute" ? 8_000 : undefined;
    return probeEndpoint(healthUrlCandidates(id, host, port), timeoutMs);
  };
}

