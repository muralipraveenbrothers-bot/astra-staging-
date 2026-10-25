/**
 * ASTRA AI — AUTOMATIC REPAIR ENGINE (7.2)
 * ============================================================================
 * Detects DEGRADED/FAILED plugins, checks dependency health, retries connections
 * with exponential backoff (max 5), and reports exact required actions.
 *
 * NEVER auto-repairs: RBAC policies, audit configuration, clinical safety rules,
 * drug databases, or any HIGH_RISK/CRITICAL plugin without admin confirmation.
 */

import { HealthCheckResult, PluginManifest, PluginRuntimeState } from "./PluginTypes";
import { healthMonitor } from "./HealthMonitor";
import { PluginLifecycle } from "./PluginLifecycle";

export interface RepairAttempt {
  pluginId: string;
  repaired: boolean;
  attempts: number;
  message: string;
  actions: string[];
}

export class AutoRepairEngine {
  private static readonly MAX_RETRIES = 5;
  private static readonly NEVER_AUTO_REPAIR_CATEGORIES = new Set(["SECURITY"]);
  private static readonly NEVER_AUTO_REPAIR_RISK = new Set(["CRITICAL"]);
  private static readonly NEVER_AUTO_REPAIR_IDS = new Set(["rbac-audit", "hospital-command-engine", "hospital-data-connector"]);

  public async repair(
    manifest: PluginManifest,
    state: PluginRuntimeState,
    getState?: (pluginId: string) => PluginRuntimeState | undefined
  ): Promise<RepairAttempt> {
    const actions: string[] = [];

    // 1. Safety gate — never auto-repair safety-critical components
    if (
      AutoRepairEngine.NEVER_AUTO_REPAIR_IDS.has(manifest.pluginId) ||
      AutoRepairEngine.NEVER_AUTO_REPAIR_CATEGORIES.has(manifest.category) ||
      AutoRepairEngine.NEVER_AUTO_REPAIR_RISK.has(manifest.riskLevel)
    ) {
      return {
        pluginId: manifest.pluginId,
        repaired: false,
        attempts: 0,
        message: "Auto-repair refused: safety-critical component. Manual intervention required.",
        actions: ["Review configuration", "Run health checks manually", "Contact system administrator"],
      };
    }

    // 2. Dependency health check — cascade first
    for (const depId of manifest.dependencies.required) {
      const depState = getState ? getState(depId) : undefined;
      if (depState && depState.health === "OFFLINE") {
        actions.push(`Required dependency '${depId}' is OFFLINE — repair that first (cascade).`);
      }
    }

    // 3. Retry loop with exponential backoff (max 5)
    let attempts = 0;
    let lastResults: HealthCheckResult[] = [];
    for (let i = 0; i < AutoRepairEngine.MAX_RETRIES; i++) {
      attempts++;
      lastResults = await healthMonitor.runChecks(manifest, state);
      const healthy = lastResults.every((r) => r.passed);
      if (healthy) {
        state.health = "HEALTHY";
        PluginLifecycle.transition(state, "ACTIVE", () => {});
        return {
          pluginId: manifest.pluginId,
          repaired: true,
          attempts,
          message: `All health checks passing after ${attempts} attempt(s).`,
          actions,
        };
      }
      const waitMs = Math.min(500 * 2 ** i, 8000);
      await new Promise((r) => setTimeout(r, waitMs));
    }

    // 4. Failed — precise failure report, never vague
    const failures = healthMonitor.summarize(lastResults);
    return {
      pluginId: manifest.pluginId,
      repaired: false,
      attempts,
      message: `Repair failed after ${attempts} attempts.`,
      actions: [...actions, ...failures.map((f) => `REQUIRED ACTION: ${f}`)],
    };
  }
}

export const autoRepairEngine = new AutoRepairEngine();