/**
 * ASTRA AI — PLUGIN ECOSYSTEM VALIDATION TEST (v1)
 * ============================================================================
 * Executes the real plugin cascade: loads catalog, installs P0 -> P1 -> P2,
 * runs live health checks, exercises repair/configure/uninstall, and prints
 * an honest report. Run: npx tsx test_plugin_ecosystem.ts
 */

import { pluginManager } from "./src/plugins/PluginManager";
import { registerAllMCPServers } from "./src/mcp/bootstrap";
import { FreeApiGateway } from "./src/integrations/FreeAPIGateway";
import { MCPClient } from "./src/mcp/MCPClient";

interface TestLine {
  pass: boolean;
  label: string;
  detail?: string;
}

const results: TestLine[] = [];
let passed = 0;
let failed = 0;

function record(pass: boolean, label: string, detail?: string) {
  results.push({ pass, label, detail });
  if (pass) passed++;
  else failed++;
}

function section(title: string) {
  console.log(`\n${"═".repeat(72)}\n  ${title}\n${"═".repeat(72)}`);
}

async function main() {
  section("1. CATALOG LOAD");
  const loaded = pluginManager.loadCatalog();
  record(loaded === 45, `Catalog loads all 45 plugin manifests (loaded=${loaded})`, `config/plugins/*/manifest.json`);
  const tiers = pluginManager.getEcosystemSummary().tiers;
  record(
    tiers.P0 === 9 && tiers.P1 === 8 && tiers.P2 === 12 && tiers.P2_5 === 1 && tiers.P3 === 13 && tiers.P4 === 2,
    `Tier counts correct (P0=${tiers.P0} P1=${tiers.P1} P2=${tiers.P2} P2.5=${tiers.P2_5} P3=${tiers.P3} P4=${tiers.P4})`
  );

  section("2. DEPENDENCY GRAPH");
  const edges = pluginManager.getDependencyGraph();
  record(edges.length > 40, `Dependency graph has ${edges.length} edges`);
  const cycles = detectCycles(edges);
  record(cycles.length === 0, `No dependency cycles (found ${cycles.length})`, cycles.join(", ") || undefined);

  section("3. MCP BOOTSTRAP");
  const servers = registerAllMCPServers();
  record(servers.length === 7, `All 7 MCP domain servers registered (${servers.join(", ")})`);
  const hospitalTools = MCPClient.listTools("hospital");
  record(hospitalTools.length >= 10, `MCP hospital server exposes ${hospitalTools.length} tools`);

  section("4. INSTALL CASCADE — P0");
  for (const id of ["astra-brain-core", "hospital-data-connector", "hospital-command-engine", "rbac-audit", "medical-knowledge-gateway", "voicebox", "langgraph-orchestrator"]) {
    const r = await pluginManager.install(id);
    record(r.success, `${id} → ${r.status}`, r.error ?? `${r.steps.length} steps`);
    if (!r.success) {
      record(false, `[cascade-abort] ${id} failed; cannot continue`, r.error);
      printReport();
      process.exit(1);
    }
  }
  const p0Installed = pluginManager.getAllStates().filter((s) => ["ACTIVE", "DEGRADED", "CONFIG_REQUIRED"].includes(s.status)).length;
  record(p0Installed >= 7, `All P0 plugins installed (ACTIVE/DEGRADED/CONFIG_REQUIRED = ${p0Installed}/7)`, "ACTIVE requires real health checks + no missing secrets");

  section("5. INSTALL CASCADE — P1");
  for (const id of ["omniroute-gateway", "freellm-provider", "medical-model-pack", "medical-vision-dicom", "daily-learning-evaluation"]) {
    const r = await pluginManager.install(id);
    record(r.success, `${id} → ${r.status}`, r.error ?? `${r.steps.length} steps`);
  }

  section("6. INSTALL CASCADE — P2");
  for (const id of ["reception-plugin", "pharmacy-plugin", "laboratory-plugin", "radiology-plugin", "ward-icu-plugin", "ot-plugin", "billing-plugin", "insurance-plugin", "nabh-quality-plugin", "hr-plugin", "patient-experience-plugin", "executive-analytics-plugin"]) {
    const r = await pluginManager.install(id);
    record(r.success, `${id} → ${r.status}`, r.error ?? `${r.steps.length} steps`);
  }

  section("7. LIVE HEALTH CHECKS");
  const summary = pluginManager.getEcosystemSummary();
  record(summary.installed >= 24, `Installed plugins >= 24 (installed=${summary.installed})`, `active=${summary.active}`);
  const degraded = summary.degraded.map((d: any) => d.pluginId);
  const noSecretsDeclared = new Set(
    pluginManager.getCatalog().filter((m) => m.configurationSchema.secrets.length === 0).map((m) => m.pluginId)
  );
  const wronglyConfigRequired = degraded.filter((id: string) => noSecretsDeclared.has(id) && pluginManager.getState(id)?.status === "CONFIG_REQUIRED");
  record(wronglyConfigRequired.length === 0, `No plugin without declared secrets is CONFIG_REQUIRED (${wronglyConfigRequired.length})`, `${degraded.join(", ") || "none"} awaiting secrets or degraded honestly`);

  section("8. HEALTH CHECK HONESTY (no fake ACTIVE)");
  const health = await pluginManager.healthCheck("astra-brain-core");
  const localOk = health.results.filter((r) => r.passed && r.critical).length;
  record(localOk >= 2, `astra-brain-core: ${localOk}/${health.results.length} real critical checks healthy`, `aggregate=${health.health} (${health.results.map((r) => `${r.name}=${r.passed ? "PASS" : "FAIL"}`).join(", ")})`);
  const gatewayStatus = await FreeApiGateway.getStatus();
  const pubmedReachable = gatewayStatus.routes["pubmed-search"]?.reachable;
  const voiceboxReachable = gatewayStatus.routes["voicebox-health"]?.reachable;
  record(
    typeof pubmedReachable === "boolean",
    `PubMed probe reported honestly (reachable=${pubmedReachable})`,
    "false does NOT block install; critical checks gate ACTIVE"
  );
  record(
    typeof voiceboxReachable === "boolean",
    `Voicebox probe reported honestly (reachable=${voiceboxReachable})`,
    "local 127.0.0.1:17493"
  );

  section("9. MCP EXECUTION (real tool calls)");
  const census = await MCPClient.callTool("hospital", "getHospitalCensus", {}, { role: "DOCTOR" });
  record(census.ok && typeof (census.data as any)?.totalPatients === "number", `hospital.getHospitalCensus → ${census.ok ? `ok (${(census.data as any).totalPatients} patients)` : census.error}`);
  const denied = await MCPClient.callTool("pharmacy", "createPrescription", { patientId: "P-1", medications: [] }, { role: "RECEPTION" });
  record(!denied.ok, `Reception denied createPrescription (${denied.error})`, "RBAC re-checked at execution time");

  section("10. REPAIR + CONFIGURE + UNINSTALL");
  const repair = await pluginManager.repair("pharmacy-plugin");
  record(typeof repair.repaired === "boolean", `pharmacy-plugin repair engine ran (repaired=${repair.repaired})`);
  const before = pluginManager.getState("laboratory-plugin");
  pluginManager.configure("laboratory-plugin", { LIS_INTERFACE_ENDPOINT: "http://lis:8080" });
  const after = pluginManager.getState("laboratory-plugin");
  record(
    !after.missingSecrets.includes("LIS_INTERFACE_ENDPOINT"),
    `configure() cleared missing secret (missing now: ${after.missingSecrets.join(", ") || "none"})`,
    `status ${before?.status} → ${after?.status}`
  );
  const uninstalled = await pluginManager.uninstall("ot-plugin");
  record(uninstalled.success, `ot-plugin uninstalled → ${uninstalled.status}`, `dependents degraded count=${pluginManager.getEcosystemSummary().degraded.length}`);

  section("11. SAFE MODE CASCADE (core failure propagation)");
  const safeMode = pluginManager.propagateCoreFailure("hospital-data-connector");
  record(safeMode.length > 0, `Core failure cascaded to ${safeMode.length} dependents (${safeMode.slice(0, 5).join(", ")})`);

  printReport();
}

function detectCycles(edges: Array<{ from: string; to: string }>): string[] {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const cycles: string[] = [];
  for (const node of adj.keys()) {
    if (color.get(node) === WHITE && dfs(node)) {
      cycles.push(`cycle involving ${node}`);
    }
  }
  function dfs(u: string): boolean {
    color.set(u, GRAY);
    for (const v of adj.get(u) ?? []) {
      if (color.get(v) === GRAY) return true;
      if (color.get(v) === WHITE && dfs(v)) return true;
    }
    color.set(u, BLACK);
    return false;
  }
  return cycles;
}

function printReport() {
  console.log(`\n${"═".repeat(72)}\n  VALIDATION REPORT\n${"═".repeat(72)}`);
  for (const r of results) {
    console.log(`  ${r.pass ? "✅ PASS" : "❌ FAIL"}  ${r.label}`);
    if (r.detail) console.log(`        ↳ ${r.detail}`);
  }
  console.log(`\n${"─".repeat(72)}`);
  console.log(`  PASSED: ${passed}   FAILED: ${failed}   TOTAL: ${results.length}`);
  console.log(`  EXIT: ${failed === 0 ? "SUCCESS" : "FAILURE"}\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  printReport();
});