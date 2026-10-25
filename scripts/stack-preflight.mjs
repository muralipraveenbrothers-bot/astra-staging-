#!/usr/bin/env node
/**
 * ASTRA Stable — preflight (§25)
 * =============================
 * Runs BEFORE PM2 starts anything. If a required item is missing the stack must
 * NOT start: starting ten crash loops hides the real error and burns the machine.
 *
 * Required failures -> exit 1 ("DO NOT START STACK").
 * Warnings          -> reported, exit 0. A missing optional key is a capability
 *                      notice, not an outage (an empty GEMINI_API_KEY must not
 *                      stop Astra from running).
 *
 * Usage: node scripts/stack-preflight.mjs [--quiet]
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NODE22 = "D:\\tools\\node-v22.22.3-win-x64\\node.exe";
const VENV_PY = path.join(ROOT, "modules", "RouteLLM", "venv312", "Scripts", "python.exe");
const LOCAL = process.env.LOCALAPPDATA || "C:\\Users\\mural\\AppData\\Local";

const results = [];
function check(name, ok, detail, level = "required") {
  results.push({ name, ok, detail, level });
}
function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}
function tryRun(file, args, timeoutMs = 20000) {
  try {
    return { ok: true, out: execFileSync(file, args, { encoding: "utf8", timeout: timeoutMs }).trim() };
  } catch (err) {
    return { ok: false, out: err instanceof Error ? err.message : String(err) };
  }
}

// ── 1. Runtimes ────────────────────────────────────────────────────────────
const node22 = fs.existsSync(NODE22) ? tryRun(NODE22, ["--version"]) : { ok: false, out: "missing" };
check("Node 22 toolchain", node22.ok, NODE22 + (node22.ok ? ` (${node22.out})` : " not found"));

const tsxOk = exists("node_modules/tsx/dist/cli.mjs");
check("tsx CLI present", tsxOk, "node_modules/tsx/dist/cli.mjs");

const pyOk = fs.existsSync(VENV_PY);
check("RouteLLM venv python", pyOk, VENV_PY);

// ── 2. Service entry points ────────────────────────────────────────────────
check("Astra API entry", exists("server/index.ts"), "server/index.ts");
check(
  "FreeLLMAPI build",
  exists("freellmapi/server/dist/index.js"),
  "freellmapi/server/dist/index.js (built)",
);

const voiceboxExe = path.join(LOCAL, "Voicebox", "voicebox-server.exe");
check("Voicebox executable", fs.existsSync(voiceboxExe), voiceboxExe);

// ── 3. The Python dependency that actually broke LiteLLM ──────────────────
if (pyOk) {
  // `import litellm` is genuinely slow (heavy package, compiles bytecode on
  // first run) — a 20s timeout produced a false ETIMEDOUT here.
  const ws = tryRun(VENV_PY, ["-c", "import websockets, litellm; print('ok')"], 120000);
  check(
    "litellm[proxy] importable",
    ws.ok && ws.out.includes("ok"),
    ws.ok ? "websockets + litellm import cleanly" : ws.out.split("\n").slice(-1)[0],
  );
} else {
  check("litellm[proxy] importable", false, "venv python missing", "warning");
}

// ── 4. Config integrity ───────────────────────────────────────────────────
let registry = null;
try {
  registry = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "ports.json"), "utf8"));
  check("ports.json parses", true, `${Object.keys(registry.services).length} services`);
} catch (err) {
  check("ports.json parses", false, err instanceof Error ? err.message : String(err));
}

const envFile = path.join(ROOT, "config", "ai-gateway.env");
let sourceEnv = "";
try {
  sourceEnv = fs.readFileSync(envFile, "utf8");
  check("ai-gateway.env present", true, "config/ai-gateway.env");
} catch {
  check("ai-gateway.env present", false, "config/ai-gateway.env missing");
}

function envValue(key) {
  const line = sourceEnv.split(/\r?\n/).find((l) => l.trim().startsWith(`${key}=`));
  return line ? line.slice(line.indexOf("=") + 1).trim() : undefined;
}

const freeKey = envValue("FREELLMAPI_API_KEY") ?? "";
check("gateway key set", freeKey.length > 20, freeKey ? "present" : "MISSING in ai-gateway.env");

const freeBase = envValue("FREELLMAPI_BASE_URL") ?? "";
const canonical = registry?.services?.freellmapi?.port;
check(
  "gateway base URL is canonical",
  freeBase.includes(String(canonical)),
  `${freeBase || "unset"} (expected :${canonical})`,
);

const gemini = envValue("GEMINI_API_KEY");
check(
  "GEMINI_API_KEY present",
  gemini !== undefined,
  gemini ? "set" : "EMPTY — cloud reasoning/vision unavailable until filled",
  "warning",
);

// ── 5. Gesture assets must be LOCAL (§13) ─────────────────────────────────
const gestureAssets = [
  "public/mediapipe/vision_bundle.mjs",
  "public/mediapipe/wasm/vision_wasm_internal.js",
  "public/mediapipe/wasm/vision_wasm_internal.wasm",
  "public/mediapipe/models/hand_landmarker.task",
];
const missingAssets = gestureAssets.filter((a) => !exists(a));
check(
  "MediaPipe assets vendored locally",
  missingAssets.length === 0,
  missingAssets.length ? `missing: ${missingAssets.join(", ")}` : "bundle + wasm + model",
  "warning",
);

// ── 6. Launcher / config hygiene (structural, not textual) ────────────────
// Rules are evaluated against PARSED config objects and against the LAST
// command of each launcher, so documentation comments can never produce a
// false failure (the earlier text-matching version flagged its own comments).
function launcherPrimaryDetaches(file) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.trim());
  const commands = lines.filter(
    (l) => l && !l.startsWith("@") && !/^rem\b/i.test(l) && !/^echo[. ]/i.test(l),
  );
  const last = commands[commands.length - 1] ?? "";
  // `start` in the final position detaches the primary process, so PM2 would
  // supervise a cmd.exe that exits immediately while the real server runs
  // unmanaged (the bug that made Voicebox look online while it was dead).
  return /^start\b/i.test(last) ? last : null;
}

const registryLaunchers = Object.values(registry?.services ?? {})
  .map((s) => s.launcher)
  .filter(Boolean);
const detachingLaunchers = registryLaunchers.filter((l) => {
  const file = path.join(ROOT, l);
  if (!fs.existsSync(file)) return false;
  return launcherPrimaryDetaches(file) !== null;
});
check(
  "PM2 launchers keep the primary process in the foreground",
  detachingLaunchers.length === 0,
  detachingLaunchers.length
    ? detachingLaunchers.map((l) => `${l} ends with 'start ...'`).join("; ")
    : `${registryLaunchers.length} launchers checked`,
);

const requireModule = createRequire(path.join(ROOT, "package.json"));
const CANDIDATE_CONFIGS = [
  "ecosystem.recovery.config.cjs",
  "ecosystem.config.next.cjs",
  "ecosystem.extensions.config.cjs",
  "ecosystem.ui.config.cjs",
];

for (const cfg of CANDIDATE_CONFIGS) {
  const file = path.join(ROOT, cfg);
  if (!fs.existsSync(file)) continue;

  let apps = [];
  try {
    apps = requireModule(file).apps ?? [];
    check(`${cfg}: loads`, true, `${apps.length} apps`);
  } catch (err) {
    check(`${cfg}: loads`, false, err instanceof Error ? err.message : String(err));
    continue;
  }

  // .ts files must be launched by tsx, never handed to Node directly.
  const tsScripts = apps.filter((a) => String(a.script ?? "").endsWith(".ts"));
  check(
    `${cfg}: no .ts script launched directly`,
    tsScripts.length === 0,
    tsScripts.map((a) => a.name).join(", ") || "all TypeScript goes through tsx",
  );

  const bareNode = apps.filter((a) => a.interpreter === "node");
  check(
    `${cfg}: no bare "node" interpreter (system Node 20)`,
    bareNode.length === 0,
    bareNode.map((a) => a.name).join(", ") || "Node apps pin the Node 22 toolchain",
  );

  const tsNodeHook = apps.filter((a) => String(a.interpreter_args ?? "").includes("ts-node"));
  check(
    `${cfg}: no ts-node/register hook`,
    tsNodeHook.length === 0,
    tsNodeHook.map((a) => a.name).join(", ") ||
      "removed (this hook caused ERR_UNKNOWN_FILE_EXTENSION)",
  );

  const interactiveCmd = apps.filter((a) => a.interpreter === "cmd");
  check(
    `${cfg}: no interactive cmd interpreter`,
    interactiveCmd.length === 0,
    interactiveCmd.map((a) => a.name).join(", ") ||
      "cmd launchers use cmd.exe /d /s /c so PM2 owns the PID",
  );

  const legacyPort = apps.filter((a) => JSON.stringify(a.env ?? {}).includes("3001"));
  check(
    `${cfg}: no retired port 3001`,
    legacyPort.length === 0,
      legacyPort.map((a) => a.name).join(", ") || "FreeLLMAPI endpoint is sourced from config/ports.json",
  );

  const gestureApps = apps.filter((a) => /gesture/i.test(String(a.name)));
  check(
    `${cfg}: no GestureService (browser-only feature)`,
    gestureApps.length === 0,
    gestureApps.map((a) => a.name).join(", ") ||
      "MediaPipe vision runs in the browser, never as a PM2 process",
  );

  const missingScripts = apps
    .filter((a) => a.interpreter !== "none")
    .filter((a) => !fs.existsSync(path.resolve(a.cwd ?? ROOT, String(a.script))));
  check(
    `${cfg}: every supervised script exists`,
    missingScripts.length === 0,
    missingScripts.map((a) => `${a.name}: ${a.script}`).join("; ") || "all present",
  );
}

// ── Report ────────────────────────────────────────────────────────────────
if (!process.argv.includes("--quiet")) {
  console.log("\nASTRA STABLE — preflight");
  console.log("========================");
  for (const r of results) {
    const tag = r.ok ? "PASS" : r.level === "required" ? "FAIL" : "WARN";
    console.log(`  ${tag}  ${r.name.padEnd(34)} ${r.detail ?? ""}`);
  }
}

const failed = results.filter((r) => !r.ok && r.level === "required");
if (failed.length > 0) {
  console.error(`\nDO NOT START STACK — ${failed.length} required check(s) failed:`);
  for (const r of failed) console.error(`  - ${r.name}: ${r.detail}`);
  process.exit(1);
}
console.log("\nPreflight OK — safe to start the stack.");
process.exit(0);

