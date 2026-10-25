/**
 * ASTRA AI — PLUGIN HEALTH MONITOR (7)
 * ============================================================================
 * Executes manifest health checks for real. No fake status:
 *  - http(s) endpoints  -> live fetch probe with timeout
 *  - local named checks -> deterministic integration probe against live registries
 *
 * RULES:
 *  - Critical check failing -> plugin FAILED (or DEGRADED per statusRule)
 *  - Non-critical check failing -> DEGRADED with reason
 *  - Baseline metrics recorded on every run
 */

import {
  HealthCheckResult,
  HealthState,
  PluginManifest,
  PluginRuntimeState,
} from "./PluginTypes";
import { AgentRegistry } from "../agents/core/AgentRegistry";
import { ToolRegistry } from "../agents/core/ToolRegistry";
import { ModelRegistry } from "../agents/core/ModelRegistry";
import { KnowledgeRegistry } from "../agents/core/KnowledgeRegistry";
import { PermissionRegistry } from "../agents/core/PermissionRegistry";

const PROBE_TIMEOUT_MS = 6000;

interface LocalCheck {
  (m: PluginManifest): Promise<{ passed: boolean; detail: string }>;
}

const LOCAL_CHECKS: Record<string, LocalCheck> = {
  "hermes-brain": async () => {
    const a = AgentRegistry.get("hermes_brain");
    return { passed: !!a && a.status === "ACTIVE", detail: a ? `Hermes Brain ${a.status} health ${a.health}` : "hermes_brain not registered" };
  },
  "model-router": async () => {
    const models = ModelRegistry.list();
    const connected = models.filter((m) => m.healthStatus === "CONNECTED").length;
    return { passed: connected > 0, detail: `${connected}/${models.length} model routes connected` };
  },
  "agent-registry": async () => {
    const agents = AgentRegistry.listActive();
    return { passed: agents.length > 0, detail: `${agents.length} active agents registered` };
  },
  "tool-registry": async () => {
    const tools = ToolRegistry.list();
    const healthy = tools.filter((t) => t.healthStatus === "HEALTHY").length;
    return { passed: tools.length > 0, detail: `${healthy}/${tools.length} tools healthy` };
  },
  "command-engine": async () => {
    const a = AgentRegistry.get("command_agent");
    return { passed: !!a, detail: a ? `CommandAgent ${a.status}` : "command_agent not registered" };
  },
  "db-connectivity": async () => {
    try {
      const { db } = await import("../../server/db");
      const patients = db.getPatients();
      return { passed: Array.isArray(patients), detail: `Hospital DB reachable (${patients.length} patients)` };
    } catch (e: any) {
      return { passed: false, detail: `DB probe failed: ${e.message}` };
    }
  },
  "rbac-permissions": async () => {
    const okDoctor = PermissionRegistry.hasPermission("DOCTOR", "patient:read");
    const okReception = PermissionRegistry.hasPermission("RECEPTION", "patient:read");
    const blocked = !PermissionRegistry.hasPermission("RECEPTION", "lab:verify");
    return { passed: okDoctor && okReception && blocked, detail: "Role matrix sane (doctor/read OK, reception lab:verify DENIED)" };
  },
  "knowledge-registry": async () => {
    const sources = KnowledgeRegistry.list ? KnowledgeRegistry.list() : [];
    return { passed: sources.length > 0, detail: `${sources.length} knowledge sources registered` };
  },
  "voicebox-local": async () => {
    const { db } = await import("../../server/db");
    void db;
    const { PluginRegistry } = await import("../plugins/PluginRegistry");
    void PluginRegistry;
    try {
      const res = await fetch("http://127.0.0.1:17493/health", { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const body = await res.json();
        return { passed: true, detail: `Voicebox upstream online: ${JSON.stringify(body).slice(0, 120)}` };
      }
      return { passed: false, detail: `Voicebox upstream HTTP ${res.status}` };
    } catch {
      return { passed: false, detail: "Voicebox upstream (127.0.0.1:17493) unreachable" };
    }
  },
  "ollama-local": async () => {
    try {
      const res = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const body: any = await res.json();
        const models = (body.models || []).map((m: any) => m.name);
        return { passed: models.length > 0, detail: `Ollama online: ${models.join(", ") || "no models pulled"}` };
      }
      return { passed: false, detail: `Ollama HTTP ${res.status}` };
    } catch {
      return { passed: false, detail: "Ollama (127.0.0.1:11434) unreachable" };
    }
  },
  "external-pubmed": async () => {
    try {
      const res = await fetch(
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=dengue+guideline&retmax=1&retmode=json",
        { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) }
      );
      if (res.ok) {
        const body: any = await res.json();
        const count = body?.esearchresult?.count;
        return { passed: !!count, detail: `NCBI E-utilities online (${count} dengue hits)` };
      }
      return { passed: false, detail: `NCBI HTTP ${res.status}` };
    } catch (e: any) {
      return { passed: false, detail: `PubMed unreachable: ${e.message}` };
    }
  },
};

export class HealthMonitor {
  public async runChecks(manifest: PluginManifest, state: PluginRuntimeState): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];
    for (const check of manifest.healthChecks) {
      const started = Date.now();
      let passed = false;
      let detail = "";
      try {
        if (/^https?:\/\//.test(check.endpoint)) {
          const res = await fetch(check.endpoint, { signal: AbortSignal.timeout(check.timeoutMs || PROBE_TIMEOUT_MS) });
          passed = res.ok;
          detail = `HTTP ${res.status}`;
        } else if (LOCAL_CHECKS[check.endpoint]) {
          const r = await LOCAL_CHECKS[check.endpoint](manifest);
          passed = r.passed;
          detail = r.detail;
        } else {
          passed = false;
          detail = `Unknown health check '${check.endpoint}' — no registered probe`;
        }
      } catch (e: any) {
        passed = false;
        detail = e?.name === "TimeoutError" ? "TIMEOUT" : e.message || String(e);
      }
      results.push({
        name: check.name,
        endpoint: check.endpoint,
        passed,
        critical: check.critical,
        latencyMs: Date.now() - started,
        detail,
        checkedAt: new Date().toISOString(),
      });
    }
    state.healthCheckResults = Object.fromEntries(results.map((r) => [r.name, r]));
    state.lastHealthCheckAt = new Date().toISOString();
    return results;
  }

  /**
   * Aggregate check results into plugin health state.
   *  - All critical pass + >=1 non-critical warn  -> DEGRADED
   *  - Any critical fail                           -> OFFLINE (or DEGRADED if statusRule allows)
   *  - All pass                                    -> HEALTHY
   */
  public aggregate(manifest: PluginManifest, results: HealthCheckResult[]): HealthState {
    const criticalFails = results.filter((r) => r.critical && !r.passed);
    const nonCriticalFails = results.filter((r) => !r.critical && !r.passed);
    if (criticalFails.length > 0) {
      const tolerant = manifest.statusRule?.includes("DEGRADED") || manifest.statusRule?.includes("CONFIG_REQUIRED");
      return tolerant ? "DEGRADED" : "OFFLINE";
    }
    if (nonCriticalFails.length > 0) return "DEGRADED";
    return "HEALTHY";
  }

  public summarize(results: HealthCheckResult[]): string[] {
    return results.filter((r) => !r.passed).map((r) => `${r.name}: ${r.detail}`);
  }
}

export const healthMonitor = new HealthMonitor();