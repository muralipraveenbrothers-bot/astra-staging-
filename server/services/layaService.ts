/**
 * Astra AI — Internal Service Manager :: Laya System-1 Runtime (Python) glue
 * ==========================================================================
 * Laya (plugins/laya) is a PYTHON loopback service — it does not fit the
 * git/npm install pipeline of SERVICE_DEFS, so it gets this dedicated module
 * governed by the SAME honesty rules (server/services/types.ts):
 *
 *   - NO FAKE STATUS — every state below is a real observation: install
 *     detection (files on disk), TCP reachability, HTTP probe results.
 *   - HEALTHY requires a passing live /v1/health probe; a port that merely
 *     answers is STARTING (the server can be up while the Router model is
 *     still preloading — observed live at ~90s cold).
 *   - start() NEVER double-spawns over a live port (external/pre-existing
 *     instance wins, mirroring InternalServiceManager.snapshot()).
 *   - stop() kills the PROCESS TREE (force-killed parents otherwise orphan
 *     workers that hold locks — observed with Cognee's Ladybug DB).
 *
 * Endpoints (mirror server/plugins/astra_laya_server.py, loopback only):
 *   GET /v1/health  — triggers Router preload (deep probe, long budget)
 *   GET /v1/tasks   — static allow-list (fast liveness, no model load)
 */

import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { astraDataRoot } from "./env";
import { isPortResponding } from "./runtimeDetect";
import { decide as decideWithFabric } from "../reflex/decisionFabric";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, "..", "..");

export const LAYA_HOST = "127.0.0.1";
export const LAYA_PORT = 8791;

export interface LayaInstallFacts {
  installed: boolean;
  python: string;
  script: string;
  missing: string[];
}

/** Files-on-disk detection only — no process or port assumptions. */
export function detectLaya(): LayaInstallFacts {
  const python =
    process.platform === "win32"
      ? path.join(REPO_ROOT, "plugins", "laya", ".venv", "Scripts", "python.exe")
      : path.join(REPO_ROOT, "plugins", "laya", ".venv", "bin", "python");
  const script = path.join(REPO_ROOT, "server", "plugins", "astra_laya_server.py");
  const missing: string[] = [];
  if (!fs.existsSync(python)) missing.push(python);
  if (!fs.existsSync(script)) missing.push(script);
  return { installed: missing.length === 0, python, script, missing };
}

export interface LayaServiceStatus {
  state: "NOT_INSTALLED" | "STOPPED" | "STARTING" | "HEALTHY" | "UNHEALTHY";
  installed: boolean;
  endpoint: string;
  /** True when a process we spawned is still tracked by this server run. */
  managed: boolean;
  detail: string;
  modelLoaded?: boolean;
  device?: string;
  probeLatencyMs?: number;
}

/** GET with a hard timeout; resolves {status,body} or null on transport error. */
function httpGet(url: string, timeoutMs: number): Promise<{ status: number; body: string } | null> {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = "";
      res.on("data", (c) => {
        body += c;
        if (body.length > 256_000) res.destroy();
      });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", () => resolve(null));
  });
}

const ENDPOINT = `http://${LAYA_HOST}:${LAYA_PORT}`;

export interface LayaDecideResult {
  ok: boolean;
  task: string;
  answers?: Record<string, {
    choice?: string;
    score?: number;
    noul?: number;
    legend?: Record<string, string>;
    probabilities?: Record<string, number>;
  }>;
  model?: string;
  error?: string;
  latencyMs: number;
}

/** One bounded decision on the running Laya runtime. Never throws. */
export async function decideWithLaya(task: string, text: string, timeoutMs = 8000): Promise<LayaDecideResult> {
  const started = Date.now();
  try {
    try {
      const result = await decideWithFabric({ schemaId: task, input: text, timeoutMs });
      const latencyMs = Date.now() - started;
      return {
        ok: !result.abstained || result.source !== "abstain",
        task,
        answers: {
          [task]: {
            choice: result.answer,
            score: result.confidence,
            probabilities: result.scores,
          },
        },
        model: result.trace.checkpoint,
        error: result.source === "abstain" ? "Laya did not answer" : undefined,
        latencyMs,
      };
    } finally { /* timeout is per call, not process-wide */ }
  } catch {
    return { ok: false, task, error: "Laya returned an unreadable answer", latencyMs: Date.now() - started };
  }
}

/**
 * Observe-only status. Fast path first (/v1/tasks is static — it never
 * triggers the ~90s Router preload); the deep /v1/health probe runs only
 * when `deep` is requested (start flows / diagnostics UI) within a budget.
 */
export async function layaStatus(
  opts: { deep?: boolean; deepBudgetMs?: number } = {},
): Promise<LayaServiceStatus> {
  const facts = detectLaya();
  const base = { installed: facts.installed, endpoint: ENDPOINT, managed: child != null };
  if (!facts.installed) {
    return { ...base, state: "NOT_INSTALLED" as const, detail: `missing: ${facts.missing.join(", ")}` };
  }
  if (!(await isPortResponding(LAYA_HOST, LAYA_PORT))) {
    return {
      ...base,
      state: "STOPPED" as const,
      detail: `TCP ${LAYA_HOST}:${LAYA_PORT} not responding`,
    };
  }
  // Port is up: confirm it is OUR server before claiming anything.
  const fast = await httpGet(`${ENDPOINT}/v1/tasks`, 2_500);
  if (!fast || fast.status !== 200) {
    return {
      ...base,
      state: "STARTING" as const,
      detail: `TCP up but /v1/tasks not answerable yet (${
        fast ? `HTTP ${fast.status}` : "transport error"
      })`,
    };
  }
  if (!opts.deep) {
    return {
      ...base,
      state: "STARTING" as const,
      detail: "serving /v1/tasks; /v1/health not probed (pass deep:true — Router preload may take ~90s)",
    };
  }
  const t0 = Date.now();
  const health = await httpGet(`${ENDPOINT}/v1/health`, opts.deepBudgetMs ?? 120_000);
  const probeLatencyMs = Date.now() - t0;
  if (!health) {
    return {
      ...base,
      state: "STARTING" as const,
      detail: `TCP up; /v1/health no answer in ${probeLatencyMs}ms (Router preload can take ~90s cold)`,
      probeLatencyMs,
    };
  }
  if (health.status === 200) {
    try {
      const parsed = JSON.parse(health.body) as {
        reachable?: boolean;
        modelLoaded?: boolean;
        device?: string;
      };
      if (parsed.reachable) {
        return {
          ...base,
          state: "HEALTHY" as const,
          detail: `live /v1/health 200 in ${probeLatencyMs}ms`,
          modelLoaded: parsed.modelLoaded,
          device: parsed.device,
          probeLatencyMs,
        };
      }
      return {
        ...base,
        state: "UNHEALTHY" as const,
        detail: `/v1/health 200 but reachable=false: ${health.body.slice(0, 300)}`,
        probeLatencyMs,
      };
    } catch {
      return {
        ...base,
        state: "UNHEALTHY" as const,
        detail: "/v1/health returned non-JSON",
        probeLatencyMs,
      };
    }
  }
  return {
    ...base,
    state: "UNHEALTHY" as const,
    detail: `/v1/health HTTP ${health.status}: ${health.body.slice(0, 300)}`,
    probeLatencyMs,
  };
}

// ---------------------------------------------------------------------------
// Lifecycle (managed child — one at a time, tracked for this server run)
// ---------------------------------------------------------------------------

let child: ChildProcess | null = null;

function layaLogPath(): string {
  const dir = path.join(astraDataRoot(), "logs");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "laya-runtime.log");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Spawn the runtime unless something already answers the port (an external
 * or previously spawned instance always wins — never a second model load).
 * Resolves with a real observed status; never claims HEALTHY on spawn alone.
 */
export async function startLaya(opts: { bindBudgetMs?: number } = {}): Promise<LayaServiceStatus> {
  const facts = detectLaya();
  if (!facts.installed) {
    return {
      state: "NOT_INSTALLED",
      installed: false,
      endpoint: ENDPOINT,
      managed: false,
      detail: `missing: ${facts.missing.join(", ")}`,
    };
  }
  if (await isPortResponding(LAYA_HOST, LAYA_PORT)) {
    const st = await layaStatus();
    return { ...st, detail: `already serving (not respawned) — ${st.detail}` };
  }
  if (child && child.exitCode != null) child = null; // reap exited child

  const logPath = layaLogPath();
  const out = fs.openSync(logPath, "a");
  child = spawn(facts.python, [facts.script], {
    cwd: REPO_ROOT,
    env: { ...process.env, ASTRA_LAYA_HOST: LAYA_HOST, ASTRA_LAYA_PORT: String(LAYA_PORT) },
    stdio: ["ignore", out, out],
    windowsHide: true,
  });
  child.on("exit", (code, signal) => {
    fs.writeSync(
      out,
      `\n[layaService] child exited code=${code} signal=${signal} at ${new Date().toISOString()}\n`,
    );
    fs.closeSync(out);
    child = null;
  });

  // Bind budget: uvicorn binds after module import (torch/laya import can be
  // slow); Router preload is NOT awaited here — that is /v1/health's job.
  const deadline = Date.now() + (opts.bindBudgetMs ?? 45_000);
  while (Date.now() < deadline) {
    if (child == null) {
      return {
        state: "STOPPED",
        installed: true,
        endpoint: ENDPOINT,
        managed: false,
        detail: `child exited before binding — see ${logPath}`,
      };
    }
    if (await isPortResponding(LAYA_HOST, LAYA_PORT)) {
      const st = await layaStatus();
      return { ...st, detail: `spawned (log: ${logPath}) — ${st.detail}` };
    }
    await sleep(500);
  }
  return {
    state: "STARTING",
    installed: true,
    endpoint: ENDPOINT,
    managed: child != null,
    detail: `spawned but port not bound in budget — see ${logPath}`,
  };
}

/**
 * Stop the managed child INCLUDING its process tree. A plain kill leaves
 * workers orphaned that keep file locks (observed: Ladybug DB Error 33).
 * External instances (not ours to own) are reported, not killed.
 */
export async function stopLaya(): Promise<LayaServiceStatus> {
  if (!child) {
    const st = await layaStatus();
    if (st.state === "STOPPED") return st;
    return {
      ...st,
      managed: false,
      detail: `instance on ${ENDPOINT} is external (not spawned by this server) — not stopped; ${st.detail}`,
    };
  }
  const pid = child.pid;
  const target = child;
  child = null;
  if (pid != null) {
    if (process.platform === "win32") {
      // /T kills the tree; /F is required for python children on Windows.
      await new Promise<void>((resolve) => {
        const killer = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });
        killer.on("exit", () => resolve());
        killer.on("error", () => resolve());
      });
    } else {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        /* already gone */
      }
    }
  }
  target.unref?.();
  // Wait for the port to actually free — the stop must be observed, not assumed.
  for (let i = 0; i < 20; i++) {
    if (!(await isPortResponding(LAYA_HOST, LAYA_PORT))) break;
    await sleep(250);
  }
  const st = await layaStatus();
  return st.state === "STOPPED"
    ? { ...st, detail: "stopped (process tree terminated, port freed)" }
    : { ...st, detail: `stop issued but endpoint still answers — ${st.detail}` };
}

