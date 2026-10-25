/**
 * ASTRA AI — PLUGIN REGISTRY (1.6)
 * ============================================================================
 * In-memory state store for plugin runtime state across the ecosystem.
 * Manifests themselves live on disk at config/plugins/{pluginId}/manifest.json;
 * this registry tracks runtime status, health, wiring, and configuration.
 */

import { PluginManifest, PluginRuntimeState, PluginStatus, HealthState } from "./PluginTypes";

function initialState(pluginId: string): PluginRuntimeState {
  return {
    pluginId,
    status: "DISCOVERED",
    health: "OFFLINE",
    installedAt: null,
    lastHealthCheckAt: null,
    degradationReasons: [],
    configuration: {},
    missingSecrets: [],
    wired: { services: false, agents: 0, tools: 0, models: 0, knowledge: 0, permissions: 0, ui: 0 },
    healthCheckResults: {},
    providerHealth: {},
    resolvedOptionalDeps: [],
    unresolvedOptionalDeps: [],
  };
}

class PluginRegistryService {
  private states = new Map<string, PluginRuntimeState>();

  public ensure(pluginId: string): PluginRuntimeState {
    let s = this.states.get(pluginId);
    if (!s) {
      s = initialState(pluginId);
      this.states.set(pluginId, s);
    }
    return s;
  }

  public get(pluginId: string): PluginRuntimeState | undefined {
    return this.states.get(pluginId);
  }

  public has(pluginId: string): boolean {
    return this.states.has(pluginId);
  }

  public list(): PluginRuntimeState[] {
    return Array.from(this.states.values());
  }

  public setStatus(pluginId: string, status: PluginStatus): PluginRuntimeState {
    const s = this.ensure(pluginId);
    s.status = status;
    return s;
  }

  public setHealth(pluginId: string, health: HealthState, reason?: string): PluginRuntimeState {
    const s = this.ensure(pluginId);
    s.health = health;
    s.lastHealthCheckAt = new Date().toISOString();
    if (reason) {
      if (!s.degradationReasons.includes(reason)) s.degradationReasons.push(reason);
    }
    return s;
  }

  public markInstalled(pluginId: string): PluginRuntimeState {
    const s = this.ensure(pluginId);
    s.status = "INSTALLED";
    s.installedAt = new Date().toISOString();
    return s;
  }

  public update(pluginId: string, patch: Partial<PluginRuntimeState>): PluginRuntimeState {
    const s = this.ensure(pluginId);
    Object.assign(s, patch);
    return s;
  }

  public reset(pluginId: string): void {
    this.states.delete(pluginId);
    this.ensure(pluginId);
  }

  public isInstalled(pluginId: string): boolean {
    const s = this.states.get(pluginId);
    return !!s && ["INSTALLED", "CONNECTING", "READY", "ACTIVE", "DEGRADED", "FAILED", "CONFIG_REQUIRED"].includes(s.status);
  }

  public isActive(pluginId: string): boolean {
    const s = this.states.get(pluginId);
    return !!s && s.status === "ACTIVE";
  }

  public installedIds(): string[] {
    return this.list().filter((s) => this.isInstalled(s.pluginId)).map((s) => s.pluginId);
  }

  public activeIds(): string[] {
    return this.list().filter((s) => s.status === "ACTIVE").map((s) => s.pluginId);
  }

  public countByStatus(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const s of this.list()) counts[s.status] = (counts[s.status] || 0) + 1;
    return counts;
  }
}

export const PluginRegistry = new PluginRegistryService();