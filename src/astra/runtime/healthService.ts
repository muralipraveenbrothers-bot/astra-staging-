/**
 * ASTRA AI — HEALTH SERVICE
 * ============================================================================
 * Runs background health checks on all ACTIVE plugins every 30 seconds.
 * Publishes live results to System Health and Plugin Center badges.
 * Auto-degrades failing plugins and removes their tools from the AgentBus
 * so the central brain never calls dead endpoints.
 */

import { pluginRuntime, AstraPluginDefinition, HealthReport } from './pluginRuntime';
import { agentBus } from './agentBus';

export interface EcosystemHealthSnapshot {
  timestamp: string;
  totalPlugins: number;
  activeCount: number;
  healthyCount: number;
  degradedCount: number;
  configRequiredCount: number;
  disabledCount: number;
  plugins: Array<{
    id: string;
    name: string;
    status: string;
    health: string;
    missingConfig?: string;
  }>;
}

type HealthListener = (snapshot: EcosystemHealthSnapshot) => void;

class HealthService {
  private timer: any = null;
  private intervalMs = 30000; // 30s interval
  private listeners = new Set<HealthListener>();
  private lastSnapshot: EcosystemHealthSnapshot | null = null;

  public start(): void {
    if (this.timer) return;
    this.runCheckCycle();
    this.timer = setInterval(() => this.runCheckCycle(), this.intervalMs);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async runCheckCycle(): Promise<EcosystemHealthSnapshot> {
    await pluginRuntime.init();
    const all = pluginRuntime.list();

    for (const plugin of all) {
      if (plugin.status === 'ACTIVE') {
        try {
          const report: HealthReport = await plugin.healthCheck();
          plugin.health = report.health;
          plugin.missingConfig = report.missingConfig;

          // If health degraded or failed, unregister its tools from the bus
          if (report.health === 'OFFLINE' || report.health === 'DEGRADED') {
            plugin.health = report.health;
            agentBus.unregisterPluginTools(plugin.id);
          }
        } catch (err: any) {
          plugin.health = 'DEGRADED';
          plugin.missingConfig = err?.message || 'Health check error';
          agentBus.unregisterPluginTools(plugin.id);
        }
      }
    }

    const snapshot: EcosystemHealthSnapshot = {
      timestamp: new Date().toISOString(),
      totalPlugins: all.length,
      activeCount: all.filter((p) => p.status === 'ACTIVE').length,
      healthyCount: all.filter((p) => p.health === 'HEALTHY').length,
      degradedCount: all.filter((p) => p.health === 'DEGRADED').length,
      configRequiredCount: all.filter((p) => p.status === 'CONFIG_REQUIRED').length,
      disabledCount: all.filter((p) => p.status === 'DISABLED').length,
      plugins: all.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        health: p.health,
        missingConfig: p.missingConfig,
      })),
    };

    this.lastSnapshot = snapshot;
    this.notify(snapshot);
    return snapshot;
  }

  public getLatestSnapshot(): EcosystemHealthSnapshot {
    if (!this.lastSnapshot) {
      const all = pluginRuntime.list();
      return {
        timestamp: new Date().toISOString(),
        totalPlugins: all.length,
        activeCount: all.filter((p) => p.status === 'ACTIVE').length,
        healthyCount: all.filter((p) => p.health === 'HEALTHY').length,
        degradedCount: all.filter((p) => p.health === 'DEGRADED').length,
        configRequiredCount: all.filter((p) => p.status === 'CONFIG_REQUIRED').length,
        disabledCount: all.filter((p) => p.status === 'DISABLED').length,
        plugins: all.map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          health: p.health,
          missingConfig: p.missingConfig,
        })),
      };
    }
    return this.lastSnapshot;
  }

  public subscribe(listener: HealthListener): () => void {
    this.listeners.add(listener);
    if (this.lastSnapshot) {
      listener(this.lastSnapshot);
    }
    return () => this.listeners.delete(listener);
  }

  private notify(snapshot: EcosystemHealthSnapshot): void {
    for (const l of this.listeners) {
      try {
        l(snapshot);
      } catch (err) {
        console.warn('HealthListener error:', err);
      }
    }
  }
}

export const healthService = new HealthService();
