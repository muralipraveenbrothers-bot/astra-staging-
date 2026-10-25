/**
 * ASTRA AI — HERMES AGENT ADAPTER (SERVER-SIDE)
 * ============================================================================
 * Adapter around the REAL Hermes CLI installation on this machine:
 *   C:\Users\mural\AppData\Local\hermes\hermes-agent  (v0.18.2, Python venv)
 *
 * Invocation mechanism (verified by audit, NOT invented):
 *   hermes --version                       → version probe
 *   hermes chat -q "<prompt>" -Q --safe-mode --max-turns 1 --provider custom:astra
 *                                          → one-shot non-interactive task
 *
 * CRITICAL — why --provider custom:astra is required on every spawn:
 *   The frozen hermes.exe (PyInstaller bundle) has intermittently failed to
 *   resolve model.provider from config.yaml at runtime, silently falling back
 *   to provider=openrouter (no key) → HTTP 401 "Missing Authentication header".
 *   Passing --provider custom:astra explicitly bypasses that resolver. Verified:
 *   without the flag → 401/openrouter; with the flag → LIVE, real responses
 *   routed Astra adapter (:3000/v1) → FreeLLMAPI → model. DO NOT REMOVE.
 *
 * NO fake HTTP server, NO fake dashboard. Health is truth-based:
 *   LIVE                   → CLI exists + version ok + a REAL execution succeeded
 *   CONFIGURATION_REQUIRED → CLI exists but not configured (~/.hermes missing)
 *   ERROR                  → CLI exists but execution fails
 *   NOT_FOUND              → executable missing
 */

import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { runHermesPath } from "../../src/astra/brain/hermesPath";
import { db } from "../db";
import { resolvedFreeLlmApiKey } from "../ai/loadEnv";

// Official Hermes Agent only (NousResearch/hermes-agent — hermes-ai.net quickstart).
// Do NOT use the npm package named "hermes" (segmentio/hermes) if it appears on PATH.
const configuredHermesCli = process.env.ASTRA_HERMES_CLI_PATH?.trim();
const HERMES_CANDIDATES = [
  configuredHermesCli,
  path.join(os.homedir(), "AppData", "Local", "hermes", "hermes-agent", ".venv", "Scripts", "hermes.exe"),
  path.join(os.homedir(), "AppData", "Local", "hermes", "hermes-agent", "venv", "Scripts", "hermes.exe"),
  path.join(os.homedir(), "AppData", "Local", "hermes", "hermes-agent", "hermes"),
];

/**
 * Real Hermes home on this Windows install (HERMES_HOME). This is the directory
 * that actually holds config.yaml / context_length_cache.yaml — NOT ~/.hermes,
 * which does not exist on Windows. Verified against
 * C:\Users\mural\AppData\Local\hermes.
 */
export function hermesHomeDir(): string {
  return process.env.ASTRA_HERMES_HOME?.trim() || path.join(os.homedir(), "AppData", "Local", "hermes");
}

/** Hermes Agent's required minimum model context window (from the real runtime error). */
const REQUIRED_CONTEXT = 64000;

/**
 * Child-process env for the Hermes CLI. Hermes resolves a custom (non-OpenRouter)
 * provider's key from the OPENAI_API_KEY environment variable (see hermes-agent
 * cli.py: `self.api_key = api_key or os.getenv("OPENAI_API_KEY")` for custom base_url).
 *
 * Astra routes Hermes through the PRIMARY gateway (FreeLLMAPI) by injecting the
 * unified key that the backend already loaded from config/ai-gateway.env — so the
 * credential stays centralized server-side and is never written into a second
 * Hermes secrets file or exposed to the browser.
 */
function hermesChildEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  env.HERMES_HOME = hermesHomeDir();
  // The local git installation is intentionally editable, but its venv was
  // recreated without the editable-package marker. Keep the checkout on
  // PYTHONPATH so the installed hermes.exe can always import hermes_cli.
  const configuredCli = process.env.ASTRA_HERMES_CLI_PATH?.trim();
  const checkout = configuredCli ? path.dirname(configuredCli) : path.join(os.homedir(), "AppData", "Local", "hermes", "hermes-agent");
  env.PYTHONPATH = [checkout, env.PYTHONPATH].filter(Boolean).join(path.delimiter);
  const gatewayKey = resolvedFreeLlmApiKey() || process.env.ASTRA_LLM_GATEWAY_API_KEY || env.OPENAI_API_KEY || "";
  if (gatewayKey) {
    env.OPENAI_API_KEY = gatewayKey;
    // Hermes' custom_providers "astra" entry declares key_env: ASTRA_ADAPTER_API_KEY.
    env.ASTRA_ADAPTER_API_KEY = gatewayKey;
  }
  return env;
}

export interface HermesModelConfig {
  model: string | null;
  provider: string | null;
  baseUrl: string | null;
  contextLength: number | null;
  requiredContext: number;
  /** true when a real context >= required is configured; null when unknown. */
  compatible: boolean | null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readText(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/**
 * Truthful model configuration from the REAL Hermes install. Reads config.yaml
 * and context_length_cache.yaml — never modifies them. This drives the
 * CONFIGURATION_REQUIRED status when the configured model's context window is
 * below Hermes' 64K minimum.
 */
function yamlScalar(v: string | undefined): string | null {
  if (!v) return null;
  const t = v.trim().replace(/['"]/g, "");
  return t.length ? t : null;
}

function parseModelBlock(cfg: string): { model: string | null; provider: string | null; baseUrl: string | null; contextLength: number | null } {
  const block = cfg.match(/^model:\r?\n((?:[ \t]+.+\r?\n)+)/m)?.[1] ?? "";
  const model = yamlScalar(block.match(/^\s*default:\s*(.+)$/m)?.[1]) ?? yamlScalar(cfg.match(/\bdefault:\s*["']?([^\s#]+)/)?.[1]);
  const provider = yamlScalar(block.match(/^\s*provider:\s*(.+)$/m)?.[1]) ?? yamlScalar(cfg.match(/\bprovider:\s*["']?([^\s#]+)/)?.[1]);
  let baseUrl = yamlScalar(block.match(/^\s*base_url:\s*(.+)$/m)?.[1]);
  const ctxLine = block.match(/^\s*context_length:\s*(\d+)/m);
  const contextFromConfig = ctxLine ? parseInt(ctxLine[1], 10) : null;

  const providers = [...cfg.matchAll(/^\s*- name:\s*(.+)\r?\n(?:\s{2,}.+\r?\n)*/gm)];
  for (const p of providers) {
    const chunk = p[0];
    const name = yamlScalar(p[1]);
    const slug = name?.toLowerCase().replace(/\s+/g, "-");
    const pUrl = yamlScalar(chunk.match(/base_url:\s*(.+)/)?.[1]);
    if (!baseUrl && provider && (provider === `custom:${slug}` || provider === slug || name === "astra")) {
      baseUrl = pUrl;
    }
    if (!baseUrl && slug === "astra" && provider?.includes("astra")) baseUrl = pUrl;
  }
  return { model, provider, baseUrl, contextLength: contextFromConfig };
}

export function hermesConfig(): HermesModelConfig {
  const home = hermesHomeDir();
  const cfg = readText(path.join(home, "config.yaml"));
  const parsed = cfg ? parseModelBlock(cfg) : { model: null, provider: null, baseUrl: null, contextLength: null };
  let contextLength = parsed.contextLength;
  const ctxCache = readText(path.join(home, "context_length_cache.yaml"));
  if (contextLength == null && ctxCache && parsed.model) {
    const base = parsed.model.replace(/:latest$/, "").trim();
    const re = new RegExp(`^\\s*[\\w.:/@\\-]*${escapeRegExp(base)}[\\w.:/@\\-]*:\\s*(\\d+)\\s*$`, "m");
    const m = ctxCache.match(re);
    if (m) contextLength = parseInt(m[1], 10);
  }
  return {
    model: parsed.model,
    provider: parsed.provider,
    baseUrl: parsed.baseUrl,
    contextLength,
    requiredContext: REQUIRED_CONTEXT,
    compatible: contextLength != null ? contextLength >= REQUIRED_CONTEXT : null,
  };
}

/** Message describing the model-context configuration gap (no fabrication, no config change). */
function modelContextDetail(cfg: HermesModelConfig, lastExecution: HermesTask | null): string {
  const model = cfg.model ? `"${cfg.model}"` : "the configured model";
  const ctx = cfg.contextLength != null ? `${cfg.contextLength.toLocaleString("en-US")} tokens` : "an unknown context window";
  const req = cfg.requiredContext.toLocaleString("en-US");
  const exec = lastExecution ? ` A real execution failed (exit ${lastExecution.exitCode}).` : "";
  return (
    `Hermes installed and verified. Runtime available. Current model ${model} has a context window of ` +
    `${ctx}, which is below the ${req} minimum required by Hermes Agent.${exec} ` +
    `No model was changed automatically. Configure a model with >= ${req} context (or raise context_length) to move to LIVE.`
  );
}

export type HermesStatus = "LIVE" | "CONFIGURATION_REQUIRED" | "ERROR" | "NOT_FOUND" | "UNKNOWN";

export interface HermesTask {
  taskId: string;
  prompt: string;
  status: "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "TIMEOUT";
  startedAt: number;
  finishedAt?: number;
  exitCode?: number;
  stdout: string;
  stderr: string;
  source: "test" | "task";
  /** Explicit provenance: a planner fallback must never be presented as CLI output. */
  execution: "CLI" | "PLANNER_FALLBACK";
}

const MAX_LOG = 200;
const tasks = new Map<string, HermesTask>();
const running = new Map<string, ChildProcess>();

/**
 * Caller identity used only for PHI-safe task lifecycle audit events. Prompts,
 * tool input and model output are deliberately excluded from these records.
 */
export interface HermesAuditContext {
  actorId: string;
  actorName: string;
  actorRole: string;
}

const auditContexts = new Map<string, HermesAuditContext>();

function auditTaskAccepted(task: HermesTask, audit: HermesAuditContext | undefined): void {
  if (!audit) return;
  auditContexts.set(task.taskId, audit);
  const model = hermesConfig();
  db.logAudit({
    ...audit,
    action: "HERMES_TASK_ACCEPTED",
    category: "ai-orchestration",
    status: "SUCCESS",
    details: JSON.stringify({
      taskId: task.taskId,
      source: task.source,
      status: task.status,
      provider: model.provider,
      model: model.model,
    }),
  });
}

export type HermesFailureReason =
  | "CLI_NOT_FOUND"
  | "TIMEOUT"
  | "CANCELLED"
  | "DEPENDENCY_ENVIRONMENT_INVALID"
  | "AUTHENTICATION_FAILED"
  | "PROVIDER_CONFIGURATION_FAILED"
  | "PROCESS_SPAWN_ERROR"
  | "PROCESS_EXIT_NONZERO";

/**
 * Redacts a process failure down to a stable class for the audit trail. Raw
 * stderr can contain paths or provider diagnostics and must remain in the
 * ephemeral task record, never in the audit log.
 */
export function hermesFailureReason(task: HermesTask): HermesFailureReason | null {
  if (task.status === "COMPLETED") return null;
  if (task.status === "TIMEOUT") return "TIMEOUT";
  if (task.status === "CANCELLED") return "CANCELLED";
  const diagnostic = task.stderr.toLowerCase();
  if (/dependency environment is missing|automatic dependency repair retry limit|source-update completion failed/.test(diagnostic)) {
    return "DEPENDENCY_ENVIRONMENT_INVALID";
  }
  if (/missing authentication|\b401\b|authentication failed/.test(diagnostic)) return "AUTHENTICATION_FAILED";
  if (/provider.*(?:missing|invalid|not found)|custom:astra/.test(diagnostic)) return "PROVIDER_CONFIGURATION_FAILED";
  if (/spawn|enoent|not found/.test(diagnostic)) return "PROCESS_SPAWN_ERROR";
  if (task.exitCode == null) return "CLI_NOT_FOUND";
  return "PROCESS_EXIT_NONZERO";
}

export function hermesTaskAuditDetails(task: HermesTask, model = hermesConfig()): Record<string, unknown> {
  return {
    taskId: task.taskId,
    source: task.source,
    execution: task.execution,
    status: task.status,
    durationMs: Math.max(0, (task.finishedAt ?? Date.now()) - task.startedAt),
    exitCode: task.exitCode ?? null,
    failureReason: hermesFailureReason(task),
    provider: model.provider,
    model: model.model,
  };
}

function auditTaskFinished(task: HermesTask): void {
  const audit = auditContexts.get(task.taskId);
  if (!audit) return;
  auditContexts.delete(task.taskId);
  const model = hermesConfig();
  db.logAudit({
    ...audit,
    action: "HERMES_TASK_FINISHED",
    category: "ai-orchestration",
    status: task.status === "COMPLETED" ? "SUCCESS" : "FAILED",
    details: JSON.stringify(hermesTaskAuditDetails(task, model)),
  });
}

function resolveCli(): string | null {
  for (const c of HERMES_CANDIDATES) {
    try {
      if (c.includes(path.sep) ? fs.existsSync(c) : true) return c;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function spawnHermes(cli: string, args: string[]): ChildProcess {
  // The supported Windows launcher owns the short C:\h runtime, its UV
  // directories and the working directory. Calling the packaged AppData venv
  // directly causes Windows package redirection and Hermes tries to repair a
  // dependency environment that is outside that installation.
  const launcherScript = path.resolve(process.cwd(), "scripts", "start-hermes.ps1");
  if (process.platform === "win32" && fs.existsSync(launcherScript)) {
    return spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", launcherScript, ...args],
      { windowsHide: true, cwd: process.cwd(), env: hermesChildEnv() },
    );
  }
  const checkout = path.basename(cli).toLowerCase() === "hermes" && path.basename(path.dirname(cli)) === "hermes-agent"
    ? path.dirname(cli)
    : path.join(hermesHomeDir(), "hermes-agent");
  const python = path.join(checkout, ".venv", "Scripts", "python.exe");
  const launcher = path.join(checkout, "hermes");
  if (fs.existsSync(python) && fs.existsSync(launcher)) {
    return spawn(python, [launcher, ...args], { windowsHide: true, env: hermesChildEnv() });
  }
  return spawn(cli, args, { windowsHide: true, shell: cli.endsWith(".cmd"), env: hermesChildEnv() });
}

export function hermesInstallPath(): string | null {
  const cli = resolveCli();
  if (!cli) return null;
  return cli.includes("hermes-agent") ? path.dirname(path.dirname(path.dirname(cli))) : path.dirname(cli);
}

export async function hermesVersion(timeoutMs = 15000): Promise<string | null> {
  const cli = resolveCli();
  if (!cli) return null;
  return new Promise((resolve) => {
    let out = "";
    const child = spawnHermes(cli, ["--version"]);
    const timer = setTimeout(() => {
      child.kill();
      resolve(null);
    }, timeoutMs);
    child.stdout?.on("data", (d) => (out += String(d)));
    child.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on("close", () => {
      clearTimeout(timer);
      const m = out.match(/Hermes Agent v([0-9.]+)/);
      resolve(m ? m[1] : out.trim().split("\n")[0] || null);
    });
  });
}

export async function hermesCapabilities() {
  const installPath = hermesInstallPath();
  const home = hermesHomeDir();
  const configPresent = fs.existsSync(path.join(home, "config.yaml"));
  return {
    cli: resolveCli(),
    installPath,
    configPresent,
    home,
    modelConfig: hermesConfig(),
    runtime: "Native Windows CLI (Python venv)",
    networkListener: false as const,
    invocation: 'hermes chat -q "<prompt>" -Q --safe-mode --max-turns 1',
    streaming: false as const,
  };
}
export function hermesExecute(
  prompt: string,
  source: "test" | "task",
  timeoutMs = 120000,
  audit?: HermesAuditContext,
): HermesTask {
  const planned = runHermesPath(prompt, source === "test" ? "cli" : "cli");
  if (source !== "test" && process.env.HERMES_USE_CLI !== "1") {
    const taskId = `hermes-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
    const task: HermesTask = {
      taskId,
      prompt: prompt.slice(0, 4000),
      status: "COMPLETED",
      startedAt: Date.now(),
      finishedAt: Date.now(),
      stdout: planned.text,
      stderr: "",
      source,
      execution: "PLANNER_FALLBACK",
    };
    tasks.set(taskId, task);
    auditTaskAccepted(task, audit);
    auditTaskFinished(task);
    return task;
  }
  const cli = resolveCli();
  const taskId = `hermes-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const task: HermesTask = {
    taskId,
    prompt: prompt.slice(0, 4000),
    status: "RUNNING",
    startedAt: Date.now(),
    stdout: "",
    stderr: "",
    source,
    execution: "CLI",
  };
  if (!cli) {
    task.status = "FAILED";
    task.finishedAt = Date.now();
    task.stderr = "Hermes CLI not found";
    tasks.set(taskId, task);
    auditTaskAccepted(task, audit);
    auditTaskFinished(task);
    return task;
  }
  tasks.set(taskId, task);
  auditTaskAccepted(task, audit);
  if (tasks.size > MAX_LOG) {
    const oldest = tasks.keys().next().value;
    if (oldest) tasks.delete(oldest);
  }

  const child = spawnHermes(
    cli,
    [
      "chat",
      "-q",
      task.prompt,
      "-Q",
      "--safe-mode",
      "--max-turns",
      "1",
      // Force the named custom provider explicitly. The frozen hermes.exe
      // config resolver has ignored model.provider in some runs (resolving
      // to openrouter); the --provider flag bypasses that path entirely.
      "--provider",
      "custom:astra",
    ],
  );
  running.set(taskId, child);

  const timer = setTimeout(() => {
    if (task.status === "RUNNING") {
      task.status = "TIMEOUT";
      child.kill();
    }
  }, timeoutMs);

  child.stdout?.on("data", (d) => {
    task.stdout = (task.stdout + String(d)).slice(-20000);
  });
  child.stderr?.on("data", (d) => {
    task.stderr = (task.stderr + String(d)).slice(-20000);
  });
  child.on("error", (e) => {
    task.stderr = (task.stderr + String(e)).slice(-20000);
  });
  child.on("close", (code) => {
    clearTimeout(timer);
    running.delete(taskId);
    task.exitCode = code ?? -1;
    if (task.status === "RUNNING") {
      task.status = code === 0 && task.stdout.trim().length > 0 ? "COMPLETED" : "FAILED";
    }
    task.finishedAt = Date.now();
    auditTaskFinished(task);
  });
  return task;
}

export function hermesCancel(taskId: string): boolean {
  const child = running.get(taskId);
  const task = tasks.get(taskId);
  if (!child || !task || task.status !== "RUNNING") return false;
  task.status = "CANCELLED";
  child.kill();
  running.delete(taskId);
  task.finishedAt = Date.now();
  auditTaskFinished(task);
  return true;
}

export function hermesTaskList(): HermesTask[] {
  return [...tasks.values()].sort((a, b) => b.startedAt - a.startedAt);
}

export function hermesTask(taskId: string): HermesTask | undefined {
  return tasks.get(taskId);
}

/**
 * Truth-based health: CLI exists + version succeeds + safe execution test.
 * Status becomes LIVE only after a REAL execution test succeeds.
 */
export interface HermesHealthResult {
  kind: "CLI" | "SERVER" | "CLI_OR_SERVER";
  status: "LIVE" | "CONFIGURATION_REQUIRED" | "ERROR" | "NOT_FOUND" | "DOWN";
  version: string | null;
  mode: "CLI" | "SERVER";
  supportsServe: boolean;
  endpoint?: string;
  transport: string;
  detail: string;
  lastCheckedAt: string;
}

/**
 * Detect whether the installed Hermes CLI exposes a headless backend
 * (`hermes serve`). The current hermes-agent (v0.18.2) is CLI-only, so the
 * health decision MUST NOT assume :9119 is a backend until `hermes serve`
 * actually exists in this install.
 */
interface HermesCapabilities {
  installed: boolean;
  version: string | null;
  supportsServe: boolean;
  supportsDashboard: boolean;
  supportsMcp: boolean;
  supportsSkills: boolean;
}

/** Where `hermes serve` exposes the real Agent dashboard on this install. */
const HERMES_SERVE_ENDPOINT = "http://127.0.0.1:9119";

/** Cheap HTTP liveness check — no subprocess, ~130ms against :9119. */
async function httpAlive(url: string, timeoutMs: number): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    void res.body?.cancel().catch(() => {});
    // LIVE needs a real successful answer (2xx/3xx). A 4xx is not a working dashboard.
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  }
}

/**
 * Cached Hermes capability detection.
 *
 * WHY THIS IS SPLIT IN TWO
 * ------------------------
 * `hermes --version` on this Windows install costs 17-23s EVERY time — the
 * PyInstaller/Python venv cold-starts on every spawn, warm or not. Measured
 * three times back to back: 22600ms, 17594ms, 17008ms. There is no "warm" run
 * to amortise against.
 *
 * The previous design derived `installed` FROM that spawn: version came back
 * null on timeout → `installed = false` → probeHermes() reported
 * NOT_FOUND ("Hermes executable not found on this machine") for a Hermes whose
 * dashboard was answering HTTP 200 on :9119. And because the capability cache
 * expired every 10 minutes, the grid then paid ~40s of sequential spawns
 * (20s version + 15s inside hermesHealth) on every expiry, blowing past the
 * client's 20s budget and stalling /api/runtime/status entirely.
 *
 * So the two questions are now answered by two different mechanisms:
 *
 *   "is Hermes installed?"  → a filesystem check (resolveCli), ~1ms, exact.
 *   "is Hermes running?"    → an HTTP probe of :9119, ~130ms, exact.
 *   "which version?"        → a subprocess, but ONLY as background enrichment.
 *
 * The version string never gates a status decision, so it can be slow without
 * making the grid slow or wrong.
 */
const HERMES_CAPS_TTL_MS = 10 * 60 * 1000;

let hermesCapsCache: { at: number; value: HermesCapabilities } | null = null;
let hermesCapsPending: Promise<HermesCapabilities> | null = null;

/**
 * Synchronous, spawn-free view of what is already known. Safe to call from a
 * status probe: it never blocks and never starts a process.
 */
export function hermesCapabilitySnapshot(): { value: HermesCapabilities; fresh: boolean } {
  const installed = Boolean(resolveCli());
  if (!hermesCapsCache) {
    return {
      value: {
        installed,
        version: null,
        supportsServe: false,
        supportsDashboard: false,
        supportsMcp: false,
        supportsSkills: false,
      },
      fresh: false,
    };
  }
  return { value: hermesCapsCache.value, fresh: Date.now() - hermesCapsCache.at < HERMES_CAPS_TTL_MS };
}

/** Refresh in the background. Dedupes concurrent callers. Never rejects. */
export function refreshHermesCapabilities(): Promise<HermesCapabilities> {
  if (hermesCapsPending) return hermesCapsPending;
  const run = detectHermesCapabilitiesUncached()
    .then((value) => {
      hermesCapsCache = { at: Date.now(), value };
      return value;
    })
    .catch(() => hermesCapabilitySnapshot().value)
    .finally(() => {
      hermesCapsPending = null;
    });
  hermesCapsPending = run;
  return run;
}

/**
 * Stale-while-revalidate.
 *
 * - Fresh cache          → return it.
 * - Stale cache present  → return the stale value IMMEDIATELY and refresh in
 *                          the background. This is what keeps the grid fast
 *                          after the TTL expires instead of stalling ~40s.
 * - No cache at all      → await the first detection (only path that blocks).
 */
export async function detectHermesCapabilities(opts: { force?: boolean } = {}): Promise<HermesCapabilities> {
  const snap = hermesCapabilitySnapshot();
  if (!opts.force && snap.fresh) return snap.value;
  if (!opts.force && hermesCapsCache) {
    void refreshHermesCapabilities();
    return hermesCapsCache.value;
  }
  return refreshHermesCapabilities();
}

// Warm the cache at boot. Costs one ~20s venv cold start, in the background,
// so no grid request ever has to pay it.
//
// Delayed a few seconds on purpose: `hermes --version` burns a full CPU core
// for ~20s, and starting it at module load put it in direct competition with
// the server's own boot work (DB, MCP connections, the first runtime probe),
// which was enough to make unrelated loopback probes miss tight timeouts. The
// version string is enrichment only — nothing blocks on it — so it can wait.
setTimeout(() => {
  void refreshHermesCapabilities();
}, 5000);

async function detectHermesCapabilitiesUncached(): Promise<HermesCapabilities> {
  // Filesystem truth first — this is the ONLY thing that decides "installed".
  const installed = Boolean(resolveCli());

  let version: string | null = null;
  if (installed) {
    try {
      // Budget well above the worst observed spawn (23s). This runs in the
      // background, so a long budget costs latency nowhere.
      version = (await hermesVersion(60000)) ?? null;
    } catch {
      version = null;
    }
  }

  // `hermes serve` support is detected by probing the port it serves on.
  // Spawning `hermes serve` merely to test the subcommand cost a full venv
  // cold start and ALWAYS blew the old 4000ms budget — which is why
  // supportsServe read false for an install whose dashboard was live, forcing
  // every probe down the slow CLI-only path. The port is the real evidence.
  const serveUp = await httpAlive(HERMES_SERVE_ENDPOINT, 2500);

  return {
    installed,
    version,
    supportsServe: serveUp,
    supportsDashboard: serveUp,
    // mcp/skills were probed the same way and were likewise always false; they
    // are not consumed anywhere, so they are no longer spawned for.
    supportsMcp: false,
    supportsSkills: false,
  };
}

/**
 * Real Hermes health probe.
 *
 * Decision tree:
 *   1. CLI missing            → NOT_FOUND
 *   2. CLI ok + serve supported + :9119 responding → SERVER (real backend)
 *   3. CLI ok + serve supported + :9119 absent    → CONFIGURATION_REQUIRED
 *      (backend capability exists but isn't running — NOT a failure of Hermes)
 *   4. CLI ok + serve NOT supported               → CLI
 *      (current v0.18.2 is CLI-only; this is HEALTHY when version resolves)
 *
 * A CLI-only Hermes MUST NOT be reported as DEGRADED/UNREACHABLE just because
 * there is no HTTP endpoint. That was the original bug.
 */
export async function probeHermes(): Promise<HermesHealthResult> {
  const startedAt = new Date().toISOString();

  // 1. FILESYSTEM TRUTH. The executable on disk is the only evidence that can
  //    produce NOT_FOUND. Previously a slow `--version` spawn was used as the
  //    proxy for "installed", so a Hermes that was installed AND serving HTTP
  //    was reported as "not found on this machine" whenever that spawn lost a
  //    race with its timeout.
  const cli = resolveCli();
  if (!cli) {
    return {
      kind: "CLI",
      status: "NOT_FOUND",
      version: null,
      mode: "CLI",
      supportsServe: false,
      transport: "CLI",
      detail: "Hermes executable not found on this machine",
      lastCheckedAt: startedAt,
    };
  }

  // 2. Spawn-free capability view. Refresh in the background when stale — this
  //    probe must never wait on a ~20s venv cold start.
  const snap = hermesCapabilitySnapshot();
  if (!snap.fresh) void refreshHermesCapabilities();
  const caps = snap.value;
  const version = caps.version;

  // 3. THE SERVE BACKEND IS A REAL HTTP ENDPOINT — probe it directly. This is
  //    the actual runtime, it answers in ~130ms, and it is the strongest
  //    evidence available. No subprocess can beat it for either speed or truth.
  //
  //    The budget is deliberately generous: this probe runs alongside the boot
  //    warm-up, whose `hermes --version` spawn burns ~20s of CPU. At a 2500ms
  //    budget that contention occasionally starved the event loop long enough
  //    to time out a backend that answers in 87ms, dropping Hermes onto the
  //    CLI-only path for one refresh.
  const endpoint = HERMES_SERVE_ENDPOINT;
  const backendUp = await httpAlive(endpoint, 5000);

  if (backendUp) {
    return {
      kind: "CLI_OR_SERVER",
      status: "LIVE",
      version,
      mode: "SERVER",
      supportsServe: true,
      endpoint,
      transport: "CLI + HTTP",
      detail: `Hermes${version ? ` CLI v${version}` : " CLI"} — serve backend LIVE on ${endpoint} (dashboard answering HTTP).`,
      lastCheckedAt: startedAt,
    };
  }

  // 4. No backend on :9119 — assess the CLI-only install. This needs a version,
  //    but the probe never blocks waiting for one: if the background detection
  //    has not produced a version yet we report that honestly instead.
  if (version) {
    return {
      kind: "CLI",
      status: "DOWN",
      version,
      mode: "CLI",
      supportsServe: caps.supportsServe,
      endpoint,
      transport: "CLI",
      detail: `Hermes CLI v${version} is installed, but the real dashboard/backend on ${endpoint} is not responding.`,
      lastCheckedAt: startedAt,
    };
  }

  // Installed (the executable is right there on disk) but the backend is down
  // and the version probe has not finished. Report exactly that. Claiming
  // NOT_FOUND here is what made the tile flap.
  return {
    kind: "CLI",
    status: "DOWN",
    version: null,
    mode: "CLI",
    supportsServe: caps.supportsServe,
    endpoint,
    transport: "CLI",
    detail:
      `Hermes CLI present at ${cli}, but the serve backend on ${endpoint} is not responding and the ` +
      `version probe has not completed yet. Start it with: powershell -File scripts/start-hermes.ps1`,
    lastCheckedAt: startedAt,
  };
}

/** @deprecated Use probeHermes() for new code. Kept for backward compatibility.
 *
 * `versionOverride` lets a caller that ALREADY resolved the version (e.g.
 * probeHermes, which gets it from the capability cache) skip the ~20s
 * `hermes --version` spawn. Passing `null` means "known to be unresolved" and
 * deliberately avoids spawning at all.
 */
export async function hermesHealth(versionOverride?: string | null): Promise<{
  status: "LIVE" | "CONFIGURATION_REQUIRED" | "ERROR" | "NOT_FOUND";
  version: string | null;
  installPath: string | null;
  configPresent: boolean;
  config: HermesModelConfig;
  lastExecution: HermesTask | null;
  detail: string;
}> {
  const cli = resolveCli();
  const installPath = hermesInstallPath();
  const home = hermesHomeDir();
  const configPresent = fs.existsSync(path.join(home, "config.yaml"));
  const config = hermesConfig();
  if (!cli || !installPath) {
    return {
      status: "NOT_FOUND",
      version: null,
      installPath: null,
      configPresent,
      config,
      lastExecution: hermesTaskList()[0] ?? null,
      detail: "Hermes executable not found on this machine",
    };
  }
  const version =
    versionOverride !== undefined
      ? versionOverride
      : hermesCapabilitySnapshot().value.version ?? (await hermesVersion(60000));
  if (!version) {
    return {
      status: "ERROR",
      version: null,
      installPath,
      configPresent,
      config,
      lastExecution: hermesTaskList()[0] ?? null,
      detail: "hermes --version failed",
    };
  }
  const lastExecution = hermesTaskList().find((t) => t.status !== "RUNNING") ?? null;
  if (lastExecution?.status === "COMPLETED" && config.compatible !== false) {
    return { status: "LIVE", version, installPath, configPresent, config, lastExecution, detail: "CLI verified; real execution test succeeded" };
  }
  if (lastExecution && ["FAILED", "TIMEOUT", "CANCELLED"].includes(lastExecution.status)) {
    const combined = lastExecution.stderr + " " + lastExecution.stdout;
    const isContextError = /context window/i.test(combined) && /required by Hermes/i.test(combined);
    if (isContextError) {
      return {
        status: "CONFIGURATION_REQUIRED",
        version,
        installPath,
        configPresent,
        config,
        lastExecution,
        detail: modelContextDetail(config, lastExecution),
      };
    }
    return {
      status: configPresent ? "ERROR" : "CONFIGURATION_REQUIRED",
      version,
      installPath,
      configPresent,
      config,
      lastExecution,
      detail: configPresent
        ? `Last execution ${lastExecution.status} (exit ${lastExecution.exitCode})`
        : "CLI verified but Hermes configuration file missing — run `hermes setup` once",
    };
  }
  if (configPresent && config.compatible === false) {
    let extra = "";
    const usingOllama = /ollama/i.test(`${config.provider ?? ""} ${config.baseUrl ?? ""}`);
    if (usingOllama && config.model) {
      try {
        const tags = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(2500) });
        if (tags.ok) {
          const json = (await tags.json()) as { models?: { name?: string }[] };
          const names = (json.models ?? []).map((m) => String(m.name ?? ""));
          if (!names.some((n) => n === config.model || n.startsWith(`${config.model}:`))) {
            extra = ` Ollama does not currently have "${config.model}" installed (have: ${names.join(", ") || "none"}). Do not invent a 64K window for it.`;
          }
        }
      } catch {
        extra = " Ollama was not reachable to confirm the model is installed.";
      }
    }
    return {
      status: "CONFIGURATION_REQUIRED",
      version,
      installPath,
      configPresent,
      config,
      lastExecution,
      detail: modelContextDetail(config, null) + extra,
    };
  }
  return {
    status: configPresent ? "LIVE" : "CONFIGURATION_REQUIRED",
    version,
    installPath,
    configPresent,
    config,
    lastExecution,
    detail: configPresent
      ? "CLI and configuration verified; ready for execution"
      : "CLI verified but Hermes configuration file missing — run `hermes setup` once",
  };
}
