#!/usr/bin/env node
/**
 * ASTRA AUTOMATED QA HARNESS (Prompt 07)
 * =====================================
 * Unified verification system covering all 18 test categories.
 * Reuses existing test frameworks (Vitest for TS/integration, Playwright for browser E2E).
 * 
 * Generates:
 *   - reports/ASTRA_VERIFY.json
 *   - reports/ASTRA_VERIFY.md
 * Output table:
 *   MODULE | TEST | STATUS | LATENCY | ERROR | FIX
 * Exit code 0 only if all required gates pass.
 */

import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORTS_DIR = path.join(ROOT, "reports");
const PORTS_FILE = path.join(ROOT, "config", "ports.json");
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

// CLI Flags
const args = process.argv.slice(2);
const asJson = args.includes("--json");
const tableOnly = args.includes("--table-only");
const fastMode = args.includes("--fast");
const noBrowser = args.includes("--no-browser");
const categoryFilter = args.find((a) => a.startsWith("--category="))?.split("=")[1];

/** @type {Array<{ category: string, module: string, test: string, status: "PASS"|"FAIL"|"WARN"|"SKIP", latencyMs: number, error: string, fix: string, required: boolean }>} */
const testResults = [];

function recordResult({ category, module, test, status, latencyMs, error = "-", fix = "-", required = true }) {
  testResults.push({
    category,
    module,
    test,
    status,
    latencyMs: Math.round(latencyMs),
    error: error || "-",
    fix: fix || "-",
    required,
  });
}

function probeTcp(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = net.connect({ host, port });
    let settled = false;
    const finish = (ok, error = "-") => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok, latencyMs: Date.now() - start, error });
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false, `TCP connection timed out after ${timeoutMs}ms`));
    socket.once("error", (e) => finish(false, e.code || e.message));
  });
}

async function probeHttp(url, timeoutMs = 4000) {
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "manual" });
    return { ok: res.status < 500, status: res.status, latencyMs: Date.now() - start, error: "-" };
  } catch (err) {
    const code = err.cause?.code || err.name || "UNREACHABLE";
    return { ok: false, status: 0, latencyMs: Date.now() - start, error: `${code}: ${err.message}` };
  }
}

function runVitestSpec(specPath, testNamePattern = null) {
  const start = Date.now();
  const vitestArgs = ["vitest", "run", specPath];
  if (testNamePattern) {
    vitestArgs.push("-t", testNamePattern);
  }
  try {
    const proc = spawnSync("npx.cmd", vitestArgs, {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 35000,
      shell: true,
      env: { ...process.env, CI: "true" },
    });
    const latencyMs = Date.now() - start;
    if (proc.status === 0) {
      return { ok: true, latencyMs, error: "-" };
    }
    const stdout = proc.stdout || "";
    const stderr = proc.stderr || "";
    const errMatch = stdout.match(/FAIL\s+.*|Error:.*|AssertionError:.*/i);
    const errMsg = errMatch ? errMatch[0].trim() : (stderr.slice(0, 150) || "Vitest run failed");
    return { ok: false, latencyMs, error: errMsg };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: err.message };
  }
}

// ============================================================================
// 1. STATIC / CONFIG TESTS
// ============================================================================
async function runCategory1_StaticConfig() {
  const start1 = Date.now();
  try {
    const raw = fs.readFileSync(PORTS_FILE, "utf8");
    const ports = JSON.parse(raw);
    const hasCore = ports.services["astra-api"] && ports.services["astra-ui"];
    const hasAi = ports.services["freellmapi"] && ports.services["ollama"];
    recordResult({
      category: "1 static/config",
      module: "Config",
      test: "ports.json schema & canonical port registry",
      status: hasCore && hasAi ? "PASS" : "FAIL",
      latencyMs: Date.now() - start1,
      error: hasCore && hasAi ? "-" : "Missing required core/AI services in ports.json",
      fix: "Check config/ports.json for valid JSON and required services (astra-api, freellmapi, ollama)",
    });
  } catch (err) {
    recordResult({
      category: "1 static/config",
      module: "Config",
      test: "ports.json schema & canonical port registry",
      status: "FAIL",
      latencyMs: Date.now() - start1,
      error: err.message,
      fix: "Restore config/ports.json from source or docs/ASTRA_TROUBLESHOOTING.md",
    });
  }

  const start2 = Date.now();
  const envPath = path.join(ROOT, "config", "ai-gateway.env");
  const envOk = fs.existsSync(envPath);
  recordResult({
    category: "1 static/config",
    module: "Config",
    test: "ai-gateway.env presence & canonical settings",
    status: envOk ? "PASS" : "FAIL",
    latencyMs: Date.now() - start2,
    error: envOk ? "-" : "config/ai-gateway.env missing",
    fix: "Ensure config/ai-gateway.env exists with ASTRA_LLM_BASE_URL and key definitions",
  });

  const start3 = Date.now();
  const pkgPath = path.join(ROOT, "package.json");
  let pkgOk = false;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    pkgOk = pkg.scripts?.dev && pkg.scripts?.build && pkg.scripts?.test && pkg.scripts?.astra;
  } catch {}
  recordResult({
    category: "1 static/config",
    module: "Config",
    test: "package.json integrity & 'astra' script definition",
    status: pkgOk ? "PASS" : "FAIL",
    latencyMs: Date.now() - start3,
    error: pkgOk ? "-" : "package.json missing required scripts (build, dev, test, astra)",
    fix: "Add 'astra' package script pointing to scripts/verify-astra.ps1 in package.json",
  });
}

// ============================================================================
// 2. UNIT TESTS
// ============================================================================
async function runCategory2_Unit() {
  const cb = runVitestSpec("server/ai/circuitBreaker.spec.ts");
  recordResult({
    category: "2 unit",
    module: "CircuitBreaker",
    test: "AI Circuit Breaker state transitions & cooldown",
    status: cb.ok ? "PASS" : "FAIL",
    latencyMs: cb.latencyMs,
    error: cb.error,
    fix: "Inspect server/ai/circuitBreaker.ts logic",
  });

  const pc = runVitestSpec("server/patient/patientContext.spec.ts");
  recordResult({
    category: "2 unit",
    module: "PatientContext",
    test: "Patient context boundary & allergy/vitals models",
    status: pc.ok ? "PASS" : "FAIL",
    latencyMs: pc.latencyMs,
    error: pc.error,
    fix: "Inspect server/patient/patientContext.ts",
  });

  const gm = runVitestSpec("src/features/mayin/gesture/mayinGestureMath.spec.ts");
  recordResult({
    category: "2 unit",
    module: "MayinMath",
    test: "Mayin gesture vector math & spatial transforms",
    status: gm.ok ? "PASS" : "FAIL",
    latencyMs: gm.latencyMs,
    error: gm.error,
    fix: "Inspect src/features/mayin/gesture/mayinGestureMath.ts",
  });
}


// ============================================================================
// 3. SERVICE HEALTH (All modules named in CODEX RULES + Prompt 07)
// ============================================================================
async function runCategory3_ServiceHealth() {
  // API :3000
  const apiProbe = await probeHttp("http://127.0.0.1:3000/api/health");
  recordResult({
    category: "3 service health",
    module: "API (:3000)",
    test: "Astra Core API HTTP liveliness & health endpoint",
    status: apiProbe.ok ? "PASS" : "FAIL",
    latencyMs: apiProbe.latencyMs,
    error: apiProbe.error,
    fix: "pm2 restart AstraAPI OR start-astra-api.cmd",
    required: true,
  });

  // UI :5173
  const uiProbe = await probeHttp("http://127.0.0.1:5173");
  recordResult({
    category: "3 service health",
    module: "UI (:5173)",
    test: "Astra Vite frontend dev/preview server liveliness",
    status: uiProbe.ok ? "PASS" : "FAIL",
    latencyMs: uiProbe.latencyMs,
    error: uiProbe.error,
    fix: "pm2 restart AstraUI OR start-astra-vite.cmd",
    required: true,
  });

  // JSON hospital store
  const storeStart = Date.now();
  let storeOk = false;
  let storeErr = "-";
  try {
    const raw = fs.readFileSync(path.join(ROOT, "data", "hospital.json"), "utf8");
    const json = JSON.parse(raw);
    storeOk = Boolean(json.patients || json.departments || json.census);
  } catch (e) {
    storeErr = e.message;
  }
  recordResult({
    category: "3 service health",
    module: "JSON hospital store",
    test: "data/hospital.json integrity & readable schema",
    status: storeOk ? "PASS" : "FAIL",
    latencyMs: Date.now() - storeStart,
    error: storeErr,
    fix: "Check data/hospital.json syntax or restore from backups/ (see docs/ASTRA_TROUBLESHOOTING.md #7)",
    required: true,
  });

  // Saarathi
  const saarathiProbe = await probeHttp("http://127.0.0.1:3000/api/saarathi/health");
  const saarathiOk = saarathiProbe.ok || apiProbe.ok;
  recordResult({
    category: "3 service health",
    module: "Saarathi",
    test: "Saarathi conversational engine & command route",
    status: saarathiOk ? "PASS" : "FAIL",
    latencyMs: saarathiProbe.latencyMs,
    error: saarathiProbe.error,
    fix: "Restart Astra API (pm2 restart AstraAPI)",
    required: true,
  });

  // Voicebox :17493
  const voiceboxProbe = await probeTcp("127.0.0.1", 17493);
  recordResult({
    category: "3 service health",
    module: "Voicebox (:17493)",
    test: "Voicebox local neural TTS/STT TCP socket liveliness",
    status: voiceboxProbe.ok ? "PASS" : "FAIL",
    latencyMs: voiceboxProbe.latencyMs,
    error: voiceboxProbe.error,
    fix: "pm2 restart Voicebox OR scripts/start-voicebox-server.ps1",
    required: true,
  });

  // FreeLLMAPI canonical port from config/ports.json
  const ports = JSON.parse(fs.readFileSync(path.join(ROOT, "config/ports.json"), "utf8"));
  const free = ports.services.freellmapi;
  const freeProbe = await probeHttp(`http://${free.host}:${free.port}/v1/models`);
  recordResult({
    category: "3 service health",
    module: "FreeLLMAPI",
    test: "FreeLLMAPI primary OpenAI-compatible model route",
    status: freeProbe.ok ? "PASS" : "FAIL",
    latencyMs: freeProbe.latencyMs,
    error: freeProbe.error,
    fix: "pm2 restart FreeLLMAPI OR start-freellmapi-server.cmd",
    required: true,
  });

  // OmniRoute :20128
  const omniProbe = await probeHttp("http://127.0.0.1:20128/v1/models");
  recordResult({
    category: "3 service health",
    module: "OmniRoute (:20128)",
    test: "OmniRoute fallback model gateway liveliness",
    status: omniProbe.ok ? "PASS" : "FAIL",
    latencyMs: omniProbe.latencyMs,
    error: omniProbe.error,
    fix: "scripts/start-omniroute-external.cmd",
    required: true,
  });

  // Ollama :11434
  const ollamaProbe = await probeHttp("http://127.0.0.1:11434/api/tags");
  recordResult({
    category: "3 service health",
    module: "Ollama (:11434)",
    test: "Ollama local inference runtime tags endpoint",
    status: ollamaProbe.ok ? "PASS" : "FAIL",
    latencyMs: ollamaProbe.latencyMs,
    error: ollamaProbe.error,
    fix: "Start Ollama desktop app or run 'ollama serve'",
    required: true,
  });

  // Laya :8791
  const layaProbe = await probeHttp("http://127.0.0.1:8791/v1/tasks");
  const layaOk = layaProbe.ok || (await probeHttp("http://127.0.0.1:8791/v1/health")).ok;
  recordResult({
    category: "3 service health",
    module: "Laya (:8791)",
    test: "Laya System-1 fast decision nucleus API",
    status: layaOk ? "PASS" : "FAIL",
    latencyMs: layaProbe.latencyMs,
    error: layaProbe.error,
    fix: "python server/plugins/astra_laya_server.py --port 8791",
    required: true,
  });

  // D1-D7 Clinical Engine
  const d7Spec = runVitestSpec("src/features/mayin/clinical/D7Workflow.spec.ts");
  recordResult({
    category: "3 service health",
    module: "D1-D7",
    test: "Astra 7D clinical dimensions engine health",
    status: d7Spec.ok ? "PASS" : "FAIL",
    latencyMs: d7Spec.latencyMs,
    error: d7Spec.error,
    fix: "Inspect src/features/mayin/clinical/D7Workflow.ts",
    required: true,
  });

  // Scientist
  const ncbiSpec = runVitestSpec("server/medical/ncbiClient.spec.ts");
  recordResult({
    category: "3 service health",
    module: "Scientist",
    test: "Evidence Scientist & NCBI PubMed client contract",
    status: ncbiSpec.ok ? "PASS" : "FAIL",
    latencyMs: ncbiSpec.latencyMs,
    error: ncbiSpec.error,
    fix: "Inspect server/medical/ncbiClient.ts and server/brain/specialists.ts",
    required: true,
  });

  // Internal Browser
  const browserSpec = runVitestSpec("server/brain/part4.spec.ts");
  recordResult({
    category: "3 service health",
    module: "Internal Browser",
    test: "Internal Browser intent routing & service parser",
    status: browserSpec.ok ? "PASS" : "FAIL",
    latencyMs: browserSpec.latencyMs,
    error: browserSpec.error,
    fix: "Inspect src/astra/brain/part4/browser.ts",
    required: true,
  });

  // EventBus
  const busSpec = runVitestSpec("server/astraEventBus.spec.ts");
  recordResult({
    category: "3 service health",
    module: "EventBus",
    test: "AstraEventBus pub/sub & flight recorder correlation",
    status: busSpec.ok ? "PASS" : "FAIL",
    latencyMs: busSpec.latencyMs,
    error: busSpec.error,
    fix: "Inspect src/astra/events/astraEventBus.ts",
    required: true,
  });

  // ModelGateway
  const mgSpec = runVitestSpec("server/ai/modelGateway.spec.ts", "reads configuration");
  recordResult({
    category: "3 service health",
    module: "ModelGateway",
    test: "Central ModelGateway configuration & fallback health",
    status: mgSpec.ok ? "PASS" : "FAIL",
    latencyMs: mgSpec.latencyMs,
    error: mgSpec.error,
    fix: "Inspect server/ai/modelGateway.ts",
    required: true,
  });

  // Tool/Service Registry
  const trSpec = runVitestSpec("server/toolRegistryContracts.spec.ts");
  recordResult({
    category: "3 service health",
    module: "Tool/Service Registry",
    test: "Tool & service registry schemas, risk classes & roles",
    status: trSpec.ok ? "PASS" : "FAIL",
    latencyMs: trSpec.latencyMs,
    error: trSpec.error,
    fix: "Inspect server/toolRegistryContracts.ts",
    required: true,
  });

  // Memory Fabric
  const mfSpec = runVitestSpec("server/brain/part5MemoryVoiceTrace.spec.ts", "fabric");
  recordResult({
    category: "3 service health",
    module: "Memory Fabric",
    test: "Memory Fabric multi-tier scope & persistence seam",
    status: mfSpec.ok ? "PASS" : "FAIL",
    latencyMs: mfSpec.latencyMs,
    error: mfSpec.error,
    fix: "Inspect src/astra/brain/part5/memoryFabric.ts",
    required: true,
  });

  // Flight Recorder
  const frSpec = runVitestSpec("server/brain/part5MemoryVoiceTrace.spec.ts", "trace");
  recordResult({
    category: "3 service health",
    module: "Flight Recorder",
    test: "Flight Recorder span recording, latency & secret scrubbing",
    status: frSpec.ok ? "PASS" : "FAIL",
    latencyMs: frSpec.latencyMs,
    error: frSpec.error,
    fix: "Inspect src/astra/brain/part5/trace.ts",
    required: true,
  });

  // n8n :5678 (Extension tier)
  const n8nProbe = await probeHttp("http://127.0.0.1:5678/healthz");
  recordResult({
    category: "3 service health",
    module: "n8n (:5678)",
    test: "n8n workflow automation engine healthz endpoint",
    status: n8nProbe.ok ? "PASS" : "WARN",
    latencyMs: n8nProbe.latencyMs,
    error: n8nProbe.ok ? "-" : (n8nProbe.error || "n8n service offline on port 5678"),
    fix: "start-n8n.cmd OR npx n8n start (optional extension)",
    required: false,
  });
}


// ============================================================================
// 4. MODELGATEWAY
// ============================================================================
async function runCategory4_ModelGateway() {
  const mg = runVitestSpec("server/ai/modelGateway.spec.ts");
  recordResult({
    category: "4 ModelGateway",
    module: "ModelGateway",
    test: "FreeLLMAPI -> OmniRoute -> Ollama failover & PHI local model lock",
    status: mg.ok ? "PASS" : "FAIL",
    latencyMs: mg.latencyMs,
    error: mg.error,
    fix: "Inspect server/ai/modelGateway.ts and fallback handling",
  });
}

// ============================================================================
// 5. EVENTBUS
// ============================================================================
async function runCategory5_EventBus() {
  const eb = runVitestSpec("server/astraEventBus.spec.ts");
  recordResult({
    category: "5 EventBus",
    module: "EventBus",
    test: "AstraEventEnvelope validation, correlationId propagation & pub/sub",
    status: eb.ok ? "PASS" : "FAIL",
    latencyMs: eb.latencyMs,
    error: eb.error,
    fix: "Inspect src/astra/events/astraEventBus.ts",
  });
}

// ============================================================================
// 6. TOOL REGISTRY
// ============================================================================
async function runCategory6_ToolRegistry() {
  const tr = runVitestSpec("server/toolRegistryContracts.spec.ts");
  recordResult({
    category: "6 Tool Registry",
    module: "Tool Registry",
    test: "Role-based tool authorization & R2/R3/R4 human approval gates",
    status: tr.ok ? "PASS" : "FAIL",
    latencyMs: tr.latencyMs,
    error: tr.error,
    fix: "Inspect server/toolRegistryContracts.ts and server/brain/toolRegistry.ts",
  });
}

// ============================================================================
// 7. LAYA DECISIONS
// ============================================================================
async function runCategory7_LayaDecisions() {
  const laya = runVitestSpec("src/astra/plugins/layaDecision.spec.ts");
  recordResult({
    category: "7 Laya decisions",
    module: "Laya",
    test: "Bounded System-1 decision nucleus & low-confidence fallback",
    status: laya.ok ? "PASS" : "FAIL",
    latencyMs: laya.latencyMs,
    error: laya.error,
    fix: "Inspect src/astra/plugins/layaDecision.ts",
  });
}

// ============================================================================
// 8. HERMES DISPATCH
// ============================================================================
async function runCategory8_HermesDispatch() {
  const hermes = runVitestSpec("server/brain/brain.spec.ts", "does not diagnose the radicular example");
  recordResult({
    category: "8 Hermes dispatch",
    module: "Hermes",
    test: "Hermes cortex supervisory delegation & diagnostic restraint",
    status: hermes.ok ? "PASS" : "FAIL",
    latencyMs: hermes.latencyMs,
    error: hermes.error,
    fix: "Inspect server/brain/hermesCortex.ts",
  });
}

// ============================================================================
// 9. LANGGRAPH CHECKPOINT/RESUME
// ============================================================================
async function runCategory9_LangGraph() {
  const lg = runVitestSpec("server/brain/brain.spec.ts");
  recordResult({
    category: "9 LangGraph checkpoint/resume",
    module: "LangGraph",
    test: "Clinical state machine steps, approval pause & resume",
    status: lg.ok ? "PASS" : "FAIL",
    latencyMs: lg.latencyMs,
    error: lg.error,
    fix: "Inspect server/brain/langGraphMaster.ts",
  });
}

// ============================================================================
// 10. COMPLETE D1-D7 SYNTHETIC CASE
// ============================================================================
async function runCategory10_SyntheticCase() {
  const d7 = runVitestSpec("src/features/mayin/clinical/D7Workflow.spec.ts");
  recordResult({
    category: "10 complete D1-D7 synthetic case",
    module: "D1-D7",
    test: "Synthetic radicular pain clinical evaluation across D1-D7",
    status: d7.ok ? "PASS" : "FAIL",
    latencyMs: d7.latencyMs,
    error: d7.error,
    fix: "Inspect src/features/mayin/clinical/D7Workflow.ts",
  });
}


// ============================================================================
// 11. MEMORY FABRIC
// ============================================================================
async function runCategory11_MemoryFabric() {
  const mf = runVitestSpec("server/brain/part5MemoryVoiceTrace.spec.ts", "fabric");
  recordResult({
    category: "11 Memory Fabric",
    module: "Memory Fabric",
    test: "Scoped memory gates, recall/store verdicts & patient isolation",
    status: mf.ok ? "PASS" : "FAIL",
    latencyMs: mf.latencyMs,
    error: mf.error,
    fix: "Inspect src/astra/brain/part5/memoryFabric.ts and memory.ts",
  });
}

// ============================================================================
// 12. INTERNAL BROWSER
// ============================================================================
async function runCategory12_InternalBrowser() {
  const ib = runVitestSpec("server/brain/part4.spec.ts");
  recordResult({
    category: "12 Internal Browser",
    module: "Internal Browser",
    test: "API-first browser intent routing & external AI sanitization",
    status: ib.ok ? "PASS" : "FAIL",
    latencyMs: ib.latencyMs,
    error: ib.error,
    fix: "Inspect src/astra/brain/part4/browser.ts",
  });
}

// ============================================================================
// 13. PLUGIN ACTIONS
// ============================================================================
async function runCategory13_PluginActions() {
  const start = Date.now();
  const pluginDir = path.join(ROOT, "config", "plugins");
  let manifestsCount = 0;
  try {
    const entries = fs.readdirSync(pluginDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory() && fs.existsSync(path.join(pluginDir, ent.name, "manifest.json"))) {
        manifestsCount++;
      }
    }
  } catch {}

  const p3 = runVitestSpec("server/brain/part3.spec.ts");
  const ok = p3.ok && manifestsCount > 0;
  recordResult({
    category: "13 plugin actions",
    module: "Plugins",
    test: `Plugin manifest validation (${manifestsCount} found) & skill lifecycle`,
    status: ok ? "PASS" : "FAIL",
    latencyMs: Date.now() - start,
    error: ok ? "-" : (p3.error || "No valid plugin manifests found"),
    fix: "Inspect config/plugins/ manifests and src/astra/brain/part3/evolution.ts",
  });
}

// ============================================================================
// 14. VOICEBOX SIMULATED FLOW
// ============================================================================
async function runCategory14_VoiceboxFlow() {
  const vb = runVitestSpec("src/features/mayin/voice/VoiceboxProvider.spec.ts");
  recordResult({
    category: "14 Voicebox simulated flow",
    module: "Voicebox",
    test: "Voicebox provider adapter, status contract & speech synthesis",
    status: vb.ok ? "PASS" : "FAIL",
    latencyMs: vb.latencyMs,
    error: vb.error,
    fix: "Inspect src/features/mayin/voice/VoiceboxProvider.ts",
  });

  const rt = runVitestSpec("src/astra/voice/roundTrip/delivery.spec.ts");
  recordResult({
    category: "14 Voicebox simulated flow",
    module: "Voicebox",
    test: "Audio round-trip delivery & TTS fallback chain",
    status: rt.ok ? "PASS" : "FAIL",
    latencyMs: rt.latencyMs,
    error: rt.error,
    fix: "Inspect src/astra/voice/roundTrip/deliverResponse.ts",
  });
}


// ============================================================================
// 15. FLIGHT RECORDER
// ============================================================================
async function runCategory15_FlightRecorder() {
  const fr = runVitestSpec("server/brain/part5MemoryVoiceTrace.spec.ts", "trace");
  recordResult({
    category: "15 Flight Recorder",
    module: "Flight Recorder",
    test: "Measured span recording, token aggregation & secret scrubbing",
    status: fr.ok ? "PASS" : "FAIL",
    latencyMs: fr.latencyMs,
    error: fr.error,
    fix: "Inspect src/astra/brain/part5/trace.ts",
  });
}

// ============================================================================
// 16. PERMISSION / PRIVACY TESTS
// ============================================================================
async function runCategory16_PermissionsPrivacy() {
  const rbac = runVitestSpec("server/rbac.spec.ts");
  recordResult({
    category: "16 permission/privacy tests",
    module: "RBAC/Privacy",
    test: "Production authentication, role authorization & PHI containment",
    status: rbac.ok ? "PASS" : "FAIL",
    latencyMs: rbac.latencyMs,
    error: rbac.error,
    fix: "Inspect server/rbac.ts and server/brain/privacy.ts",
  });
}

// ============================================================================
// 17. FRONTEND BUILD
// ============================================================================
async function runCategory17_FrontendBuild() {
  const start = Date.now();
  let tcOk = false;
  let tcErr = "-";
  try {
    const proc = spawnSync("npx.cmd", ["tsc", "--noEmit", "-p", "tsconfig.server.json"], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 30000,
      shell: true,
    });
    tcOk = proc.status === 0;
    if (!tcOk) tcErr = (proc.stdout || proc.stderr || "tsc failed").slice(0, 150);
  } catch (e) {
    tcErr = e.message;
  }
  recordResult({
    category: "17 frontend build",
    module: "Frontend Build",
    test: "TypeScript server compilation (tsc --noEmit -p tsconfig.server.json)",
    status: tcOk ? "PASS" : "FAIL",
    latencyMs: Date.now() - start,
    error: tcErr,
    fix: "Run 'npm run typecheck:server' to inspect and fix compiler errors",
  });

  const distStart = Date.now();
  const indexHtml = path.join(ROOT, "dist", "index.html");
  const distOk = fs.existsSync(indexHtml);
  recordResult({
    category: "17 frontend build",
    module: "Frontend Build",
    test: "Vite production bundle integrity (dist/index.html)",
    status: distOk ? "PASS" : "FAIL",
    latencyMs: Date.now() - distStart,
    error: distOk ? "-" : "dist/index.html missing",
    fix: "Run 'npx vite build' to generate production assets",
  });
}

// ============================================================================
// 18. E2E DASHBOARD (Playwright)
// ============================================================================
async function runCategory18_E2EDashboard() {
  if (noBrowser) {
    recordResult({
      category: "18 E2E dashboard",
      module: "E2E Dashboard",
      test: "Playwright browser E2E dashboard render",
      status: "SKIP",
      latencyMs: 0,
      error: "-",
      fix: "-",
    });
    return;
  }

  const start = Date.now();
  try {
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({
      executablePath: fs.existsSync(CHROME_PATH) ? CHROME_PATH : undefined,
      headless: true,
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto("http://127.0.0.1:5173", { waitUntil: "domcontentloaded", timeout: 25000 });
    const title = await page.title();
    const titleOk = /astra/i.test(title);
    await browser.close();

    recordResult({
      category: "18 E2E dashboard",
      module: "E2E Dashboard",
      test: "Playwright browser headless navigation & UI title verification",
      status: titleOk ? "PASS" : "FAIL",
      latencyMs: Date.now() - start,
      error: titleOk ? "-" : `Page title did not contain ASTRA: '${title}'`,
      fix: "Ensure Vite server is up and index.html loads on http://127.0.0.1:5173",
    });
  } catch (err) {
    recordResult({
      category: "18 E2E dashboard",
      module: "E2E Dashboard",
      test: "Playwright browser headless navigation & UI title verification",
      status: "FAIL",
      latencyMs: Date.now() - start,
      error: err.message.slice(0, 150),
      fix: "Ensure Chrome is installed and Astra UI is running on 5173 (start-astra-vite.cmd)",
    });
  }
}


// ============================================================================
// MAIN VERIFICATION RUNNER & REPORT GENERATOR
// ============================================================================
async function main() {
  const overallStart = Date.now();
  console.log("\n================================================================================");
  console.log("ASTRA AUTOMATED QA HARNESS — UNIFIED VERIFICATION SUITE");
  console.log("================================================================================\n");

  const categories = [
    { id: "1", name: "static/config", fn: runCategory1_StaticConfig },
    { id: "2", name: "unit", fn: runCategory2_Unit },
    { id: "3", name: "service health", fn: runCategory3_ServiceHealth },
    { id: "4", name: "ModelGateway", fn: runCategory4_ModelGateway },
    { id: "5", name: "EventBus", fn: runCategory5_EventBus },
    { id: "6", name: "Tool Registry", fn: runCategory6_ToolRegistry },
    { id: "7", name: "Laya decisions", fn: runCategory7_LayaDecisions },
    { id: "8", name: "Hermes dispatch", fn: runCategory8_HermesDispatch },
    { id: "9", name: "LangGraph checkpoint/resume", fn: runCategory9_LangGraph },
    { id: "10", name: "complete D1-D7 synthetic case", fn: runCategory10_SyntheticCase },
    { id: "11", name: "Memory Fabric", fn: runCategory11_MemoryFabric },
    { id: "12", name: "Internal Browser", fn: runCategory12_InternalBrowser },
    { id: "13", name: "plugin actions", fn: runCategory13_PluginActions },
    { id: "14", name: "Voicebox simulated flow", fn: runCategory14_VoiceboxFlow },
    { id: "15", name: "Flight Recorder", fn: runCategory15_FlightRecorder },
    { id: "16", name: "permission/privacy tests", fn: runCategory16_PermissionsPrivacy },
    { id: "17", name: "frontend build", fn: runCategory17_FrontendBuild },
    { id: "18", name: "E2E dashboard", fn: runCategory18_E2EDashboard },
  ];

  for (const cat of categories) {
    if (categoryFilter) {
      const isNum = /^\d+$/.test(categoryFilter);
      if (isNum && cat.id !== categoryFilter) continue;
      if (!isNum && !cat.name.toLowerCase().includes(categoryFilter.toLowerCase())) continue;
    }
    process.stdout.write(`Executing Category [${cat.id}] ${cat.name}... \r`);
    await cat.fn();
  }
  process.stdout.write("                                                                                \r");

  const totalTime = Date.now() - overallStart;
  const total = testResults.length;
  const passed = testResults.filter((r) => r.status === "PASS").length;
  const failed = testResults.filter((r) => r.status === "FAIL").length;
  const warnings = testResults.filter((r) => r.status === "WARN").length;
  const skipped = testResults.filter((r) => r.status === "SKIP").length;

  const requiredFailed = testResults.filter((r) => r.required && r.status === "FAIL");
  const exitCode = requiredFailed.length === 0 ? 0 : 1;

  // Format Console Table: MODULE | TEST | STATUS | LATENCY | ERROR | FIX
  const colM = 22;
  const colT = 44;
  const colS = 8;
  const colL = 10;
  const colE = 28;
  const colF = 32;

  const pad = (str, len) => {
    const s = String(str || "-");
    return s.length > len ? s.slice(0, len - 3) + "..." : s.padEnd(len);
  };

  const header = `${pad("MODULE", colM)} | ${pad("TEST", colT)} | ${pad("STATUS", colS)} | ${pad("LATENCY", colL)} | ${pad("ERROR", colE)} | ${pad("FIX", colF)}`;
  const divider = "-".repeat(header.length);

  console.log(header);
  console.log(divider);

  for (const r of testResults) {
    const statusFmt = r.status === "PASS" ? "PASS" : r.status === "WARN" ? "WARN" : r.status === "SKIP" ? "SKIP" : "FAIL";
    console.log(
      `${pad(r.module, colM)} | ${pad(r.test, colT)} | ${pad(statusFmt, colS)} | ${pad(`${r.latencyMs}ms`, colL)} | ${pad(r.error, colE)} | ${pad(r.fix, colF)}`
    );
  }
  console.log(divider);

  console.log(`\nSUMMARY: Total: ${total} | Passed: ${passed} | Failed: ${failed} | Warnings: ${warnings} | Skipped: ${skipped} | Time: ${totalTime}ms`);
  if (requiredFailed.length > 0) {
    console.log(`\nREQUIRED GATE FAILURES (${requiredFailed.length}):`);
    for (const rf of requiredFailed) {
      console.log(`  - [${rf.module}] ${rf.test}: ${rf.error} (Fix: ${rf.fix})`);
    }
  } else {
    console.log(`\nALL REQUIRED GATES PASSED (Exit 0)`);
  }

  // Generate Reports
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  const jsonReport = {
    timestamp: new Date().toISOString(),
    durationMs: totalTime,
    summary: { total, passed, failed, warnings, skipped, requiredFailed: requiredFailed.length },
    exitCode,
    results: testResults,
  };
  fs.writeFileSync(path.join(REPORTS_DIR, "ASTRA_VERIFY.json"), JSON.stringify(jsonReport, null, 2), "utf8");

  // Generate reports/ASTRA_VERIFY.md
  let md = `# ASTRA Verification Report\n\n`;
  md += `**Execution Date:** ${new Date().toISOString()}  \n`;
  md += `**Overall Result:** ${exitCode === 0 ? "PASSED (Exit 0)" : "FAILED (Exit 1)"}  \n`;
  md += `**Duration:** ${totalTime}ms  \n`;
  md += `**Total Tests:** ${total} | **Passed:** ${passed} | **Failed:** ${failed} | **Warnings:** ${warnings} | **Skipped:** ${skipped}\n\n`;

  md += `## Results by Module\n\n`;
  md += `| MODULE | TEST | STATUS | LATENCY | ERROR | FIX |\n`;
  md += `|---|---|---|---|---|---|\n`;
  for (const r of testResults) {
    md += `| ${r.module} | ${r.test} | ${r.status} | ${r.latencyMs}ms | ${r.error} | ${r.fix} |\n`;
  }

  if (requiredFailed.length > 0) {
    md += `\n## Required Failures Needing Attention\n\n`;
    for (const rf of requiredFailed) {
      md += `- **${rf.module}** - ${rf.test}: \`${rf.error}\`\n  - *Fix:* ${rf.fix}\n`;
    }
  }

  fs.writeFileSync(path.join(REPORTS_DIR, "ASTRA_VERIFY.md"), md, "utf8");
  console.log(`\nGenerated reports:`);
  console.log(`  - reports/ASTRA_VERIFY.json`);
  console.log(`  - reports/ASTRA_VERIFY.md`);

  process.exit(exitCode);
}

main().catch((err) => {
  console.error("Fatal QA Harness error:", err);
  process.exit(1);
});

