/**
 * ASTRA AI — PLUGIN MANAGER (ONE PLUGIN MANAGER RULE)
 * ============================================================================
 * The single entry point for the entire plugin ecosystem:
 *  - loads manifests from config/plugins/{pluginId}/manifest.json
 *  - resolves dependency graphs
 *  - runs the installation cascade (required first, optional if permitted)
 *  - executes health checks, auto-repair, configuration, uninstall
 * No plugin installs outside this manager. No plugin shows ACTIVE without
 * passing its critical health checks.
 */

import fs from "fs";
import path from "path";
import {
  DependencyResolutionResult,
  HealthCheckResult,
  InstallResult,
  PluginManifest,
  PluginRuntimeState,
} from "./PluginTypes";
import { PluginRegistry } from "./PluginRegistry";
import { dependencyResolver } from "./DependencyResolver";
import { pluginInstaller } from "./PluginInstaller";
import { pluginUninstaller } from "./PluginUninstaller";
import { healthMonitor } from "./HealthMonitor";
import { autoRepairEngine } from "./AutoRepairEngine";

const MANIFEST_DIR = path.join(process.cwd(), "config", "plugins");

export interface PluginManagerOptions {
  autoInstallOptional?: boolean;
  secrets?: Record<string, string>;
}

export class PluginManager {
  private manifests = new Map<string, PluginManifest>();
  private states = PluginRegistry;
  private options: PluginManagerOptions;

  constructor(options: PluginManagerOptions = {}) {
    this.options = { autoInstallOptional: false, ...options };
  }

  // -------------------------------------------------------------------------
  // CATALOG
  // -------------------------------------------------------------------------
  public loadCatalog(dir: string = MANIFEST_DIR): number {
    this.manifests.clear();
    if (!fs.existsSync(dir)) return 0;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let loaded = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(dir, entry.name, "manifest.json");
      if (!fs.existsSync(manifestPath)) continue;
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as PluginManifest;
        if (!manifest.pluginId || !manifest.name || !manifest.version) {
          console.warn(`[plugin-manager] Skipping invalid manifest at ${manifestPath}`);
          continue;
        }
        this.manifests.set(manifest.pluginId, manifest);
        this.states.ensure(manifest.pluginId);
        loaded++;
      } catch (e: any) {
        console.warn(`[plugin-manager] Failed to parse ${manifestPath}: ${e.message}`);
      }
    }
    return loaded;
  }

  public getManifest(pluginId: string): PluginManifest | undefined {
    return this.manifests.get(pluginId);
  }

  public getCatalog(): PluginManifest[] {
    return Array.from(this.manifests.values()).sort((a, b) => a.tier.localeCompare(b.tier) || a.pluginId.localeCompare(b.pluginId));
  }

  public getManifestsByTier(tier: string): PluginManifest[] {
    return this.getCatalog().filter((m) => m.tier === tier);
  }

  public getState(pluginId: string): PluginRuntimeState | undefined {
    return this.states.get(pluginId);
  }

  public getAllStates(): PluginRuntimeState[] {
    return this.states.list();
  }

  // -------------------------------------------------------------------------
  // INSTALL CASCADE
  // -------------------------------------------------------------------------
  public async install(pluginId: string, opts: PluginManagerOptions = {}): Promise<InstallResult> {
    const merged = { ...this.options, ...opts };
    const manifest = this.manifests.get(pluginId);
    if (!manifest) {
      return {
        pluginId,
        success: false,
        status: "FAILED",
        steps: [{ step: "VALIDATE", ok: false, detail: `Plugin '${pluginId}' not found in catalog` }],
        healthChecks: [],
        error: "NOT_IN_CATALOG",
      };
    }

    // Dependency resolution (honest: blocked = blocked)
    const resolution = dependencyResolver.resolve(manifest, this.manifests, this.states as any);
    if (!resolution.ok) {
      const state = this.states.ensure(pluginId);
      state.status = "INSTALL_BLOCKED";
      state.degradationReasons = resolution.blockedBy;
      return {
        pluginId,
        success: false,
        status: "INSTALL_BLOCKED",
        steps: resolution.blockedBy.map((b) => ({ step: "DEPENDENCY_RESOLUTION", ok: false, detail: b })),
        resolution,
        healthChecks: [],
      };
    }

    // Cascade: install missing required dependencies first (in topo order)
    const state = this.states.ensure(pluginId);
    state.status = "INSTALLING";
    const cascadeResults: InstallResult[] = [];
    for (const depId of resolution.installOrder) {
      if (depId === pluginId) continue;
      if (this.states.isInstalled(depId)) continue;
      const depManifest = this.manifests.get(depId);
      if (!depManifest) continue;
      const depResult = await this.install(depId, merged);
      cascadeResults.push(depResult);
      if (!depResult.success) {
        state.status = "INSTALL_BLOCKED";
        return {
          pluginId,
          success: false,
          status: "INSTALL_BLOCKED",
          steps: [{ step: "CASCADE", ok: false, detail: `Required dependency '${depId}' failed to install (${depResult.status})` }],
          resolution,
          healthChecks: [],
        };
      }
    }

    // Optional dependencies: offered, auto-installed only if permitted
    for (const optId of resolution.optionalMissing) {
      if (merged.autoInstallOptional && this.manifests.has(optId)) {
        await this.install(optId, merged);
      }
    }

    const result = await pluginInstaller.install(manifest, state, {
      available: this.manifests,
      installed: this.states as any,
      autoInstallOptional: !!merged.autoInstallOptional,
      secrets: merged.secrets,
    });

    this.audit("PLUGIN_INSTALL", pluginId, result.status);
    return result;
  }

  public async uninstall(pluginId: string): Promise<InstallResult> {
    const manifest = this.manifests.get(pluginId);
    const state = this.states.ensure(pluginId);
    if (!manifest) {
      return { pluginId, success: false, status: "FAILED", steps: [], healthChecks: [], error: "NOT_IN_CATALOG" };
    }
    if (!this.states.isInstalled(pluginId)) {
      return { pluginId, success: false, status: "DISABLED", steps: [{ step: "UNINSTALL", ok: false, detail: "Not installed" }], healthChecks: [] };
    }
    const result = await pluginUninstaller.uninstall(manifest, state, this.states as any);
    for (const m of this.getCatalog()) {
      if (m.pluginId === pluginId) continue;
      const required = m.dependencies.required.includes(pluginId);
      const optional = m.dependencies.optional.includes(pluginId);
      if (!required && !optional) continue;
      const depState = this.states.get(m.pluginId);
      if (!depState) continue;
      if (["ACTIVE", "READY", "DEGRADED", "CONNECTING"].includes(depState.status)) {
        depState.status = "DEGRADED";
        depState.degradationReasons.push(
          `${required ? "Required" : "Optional"} dependency '${pluginId}' uninstalled`,
        );
      }
    }
    this.audit("PLUGIN_UNINSTALL", pluginId, result.status);
    return result;
  }

  // -------------------------------------------------------------------------
  // HEALTH & REPAIR
  // -------------------------------------------------------------------------
  public async healthCheck(pluginId: string): Promise<{ health: PluginRuntimeState["health"]; results: HealthCheckResult[] }> {
    const manifest = this.manifests.get(pluginId);
    const state = this.states.ensure(pluginId);
    if (!manifest) return { health: "OFFLINE", results: [] };
    const results = await healthMonitor.runChecks(manifest, state);
    state.health = healthMonitor.aggregate(manifest, results);
    if (state.health === "HEALTHY" && (state.status === "DEGRADED" || state.status === "CONFIG_REQUIRED" || state.status === "FAILED")) {
      state.status = "ACTIVE";
    }
    return { health: state.health, results };
  }

  public async repair(pluginId: string): Promise<any> {
    const manifest = this.manifests.get(pluginId);
    const state = this.states.ensure(pluginId);
    if (!manifest) return { pluginId, repaired: false, message: "NOT_IN_CATALOG" };
    const attempt = await autoRepairEngine.repair(manifest, state, (id) => this.states.get(id));
    this.audit("PLUGIN_REPAIR", pluginId, attempt.repaired ? "REPAIRED" : "REPAIR_FAILED");
    return attempt;
  }

  // -------------------------------------------------------------------------
  // CONFIGURATION
  // -------------------------------------------------------------------------
  public configure(pluginId: string, config: Record<string, string>): PluginRuntimeState {
    const state = this.states.ensure(pluginId);
    state.configuration = { ...state.configuration, ...config };
    const manifest = this.manifests.get(pluginId);
    if (manifest) {
      state.missingSecrets = manifest.configurationSchema.secrets.filter((s) => !state.configuration[s]);
      if (state.missingSecrets.length === 0 && state.status === "CONFIG_REQUIRED") {
        state.status = "READY";
      }
    }
    this.audit("PLUGIN_CONFIG", pluginId, "CONFIG_UPDATED");
    return state;
  }

  public getMissingSecrets(pluginId: string): string[] {
    return this.states.get(pluginId)?.missingSecrets || [];
  }

  // -------------------------------------------------------------------------
  // DEPENDENCY GRAPH (for visualizer + cascade-failure detection)
  // -------------------------------------------------------------------------
  public getDependencyGraph(): Array<{ from: string; to: string; type: "required" | "optional" }> {
    const edges: Array<{ from: string; to: string; type: "required" | "optional" }> = [];
    for (const [id, m] of this.manifests) {
      for (const dep of m.dependencies.required) edges.push({ from: id, to: dep, type: "required" });
      for (const dep of m.dependencies.optional) edges.push({ from: id, to: dep, type: "optional" });
    }
    return edges;
  }

  public getInstallOrderFor(pluginId: string): string[] {
    const manifest = this.manifests.get(pluginId);
    if (!manifest) return [];
    const r = dependencyResolver.resolve(manifest, this.manifests, this.states as any);
    return r.installOrder;
  }

  public getEcosystemSummary() {
    const states = this.states.list();
    const counts = this.states.countByStatus();
    const healthCounts: Record<string, number> = {};
    for (const s of states) healthCounts[s.health] = (healthCounts[s.health] || 0) + 1;
    return {
      catalogSize: this.manifests.size,
      installed: this.states.installedIds().length,
      active: this.states.activeIds().length,
      byStatus: counts,
      byHealth: healthCounts,
      degraded: states.filter((s) => s.status === "DEGRADED" || s.status === "CONFIG_REQUIRED").map((s) => ({
        pluginId: s.pluginId,
        status: s.status,
        reasons: s.degradationReasons,
      })),
      tiers: {
        P0: this.getManifestsByTier("P0").length,
        P1: this.getManifestsByTier("P1").length,
        P2: this.getManifestsByTier("P2").length,
        P2_5: this.getManifestsByTier("P2.5").length,
        P3: this.getManifestsByTier("P3").length,
        P4: this.getManifestsByTier("P4").length,
      },
    };
  }

  // -------------------------------------------------------------------------
  // CASCADE FAILURE HANDLING (7.3)
  // -------------------------------------------------------------------------
  public propagateCoreFailure(corePluginId: string): string[] {
    const degraded: string[] = [];
    for (const [id, m] of this.manifests) {
      if (id === corePluginId) continue;
      const closure = this.requiredClosureOf(m, corePluginId);
      if (closure) {
        const state = this.states.ensure(id);
        if (state.status === "ACTIVE" || state.status === "READY") {
          state.status = "DEGRADED";
          state.degradationReasons.push(`CASCADE: core dependency '${corePluginId}' offline (SAFE MODE)`);
          degraded.push(id);
        }
      }
    }
    this.audit("CASCADE_DEGRADE", corePluginId, `Degraded ${degraded.length} dependents`);
    return degraded;
  }

  private requiredClosureOf(manifest: PluginManifest, targetId: string): boolean {
    const seen = new Set<string>();
    const stack = [...manifest.dependencies.required];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (id === targetId) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      const dep = this.manifests.get(id);
      if (dep) stack.push(...dep.dependencies.required);
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // AUDIT
  // -------------------------------------------------------------------------
  private audit(action: string, pluginId: string, result: string): void {
    try {
      import("../../server/db").then(({ db }) => {
        db.logAudit({
          actorId: "system",
          actorName: "PluginManager",
          actorRole: "SYSTEM" as any,
          action,
          category: "plugin",
          status: result as "SUCCESS" | "DENIED" | "FAILED" | "CONFIRMATION_REQUIRED",
          details: `${action} for plugin ${pluginId} -> ${result}`,
        });
      });
    } catch {
      // audit best-effort — never block plugin operations on audit failure
    }
  }
}

export const pluginManager = new PluginManager();