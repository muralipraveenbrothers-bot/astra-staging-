/**
 * ASTRA Stable — AstraSupervisor (safety wall: layer 5)
 * ====================================================
 * Central protection layer described in §4 of the stability plan. The UI and
 * the watchdog talk to THIS, never directly to PM2 or to individual services.
 *
 * Guarantees enforced here (and proven by supervisor.spec.ts):
 *   • core status is always "online" — optional failures cannot change it;
 *   • at most one service is restarted per tick;
 *   • a probe that throws is contained and reported, never propagated;
 *   • capability state (voice / gesture / automation) is reported per
 *     capability, so a broken camera can never read as "Astra degraded".
 */
import { allDefinitions, routeGroups, supervisedServices } from "./portRegistry";
import {
  applyProbe,
  coreStatus,
  markIsolated,
  markRestarted,
  newRecord,
  planRecovery,
  toSnapshot,
  type ServiceRecord,
} from "./recoveryManager";
import { nodeProbe, restartViaPm2 } from "./healthProbe";
import {
  DEFAULT_RECOVERY_POLICY,
  type ProbeFn,
  type RecoveryPlan,
  type RecoveryPolicy,
  type RestartFn,
  type ServiceDefinition,
  type ServiceSnapshot,
  type SupervisorEvent,
  type SupervisorOptions,
} from "./types";

export interface TickResult {
  checked: number;
  failed: string[];
  plan: RecoveryPlan;
  restarted: string[];
}

export interface CapabilitySnapshot {
  id: string;
  label: string;
  state: "online" | "needs-attention" | "recovering";
  detail?: string;
}

export class AstraSupervisor {
  private readonly records = new Map<string, ServiceRecord>();
  private readonly events: SupervisorEvent[] = [];
  private readonly capabilities = new Map<string, CapabilitySnapshot>();
  private readonly policy: RecoveryPolicy;
  private readonly probe: ProbeFn;
  private readonly restart: RestartFn;
  private readonly now: () => number;
  private readonly onEvent?: (event: SupervisorEvent) => void;

  constructor(options: SupervisorOptions = {}) {
    this.policy = { ...DEFAULT_RECOVERY_POLICY, ...(options.policy ?? {}) };
    this.probe = options.probe ?? nodeProbe;
    this.restart = options.restart ?? restartViaPm2;
    this.now = options.now ?? Date.now;
    this.onEvent = options.onEvent;
    for (const def of allDefinitions()) this.records.set(def.id, newRecord(def, this.now()));
  }

  private emit(event: SupervisorEvent): void {
    this.events.push(event);
    if (this.events.length > 500) this.events.splice(0, this.events.length - 500);
    this.onEvent?.(event);
  }

  definitions(): ServiceDefinition[] {
    return [...this.records.values()].map((r) => r.definition);
  }

  /** Probe one service. A throwing probe is a failed probe, never a crash. */
  async checkService(id: string): Promise<boolean> {
    const record = this.records.get(id);
    if (!record) throw new Error(`AstraSupervisor: unknown service "${id}"`);
    let ok = false;
    let detail: string | undefined;
    try {
      const result = await this.probe(record.definition, this.policy.probeTimeoutMs);
      ok = result.ok;
      detail = result.detail;
    } catch (err) {
      ok = false;
      detail = err instanceof Error ? err.message : String(err);
    }
    record.lastProbeAt = this.now();
    applyProbe(record, ok, this.policy, this.now(), detail);
    this.emit({ at: this.now(), kind: ok ? "health-ok" : "health-fail", serviceId: id, detail });
    return ok;
  }

  async checkAll(): Promise<string[]> {
    const failed: string[] = [];
    for (const id of this.records.keys()) {
      const ok = await this.checkService(id);
      if (!ok) failed.push(id);
    }
    return failed;
  }

  /** Plan and execute at most ONE scoped restart for this tick. */
  async tick(): Promise<TickResult> {
    const failed = await this.checkAll();
    const plan = planRecovery([...this.records.values()], this.policy, this.now());
    const restarted: string[] = [];

    for (const skip of plan.skipped) {
      this.emit({ at: this.now(), kind: "restart-skipped", serviceId: skip.id, detail: skip.reason });
    }

    for (const id of plan.restart) {
      const record = this.records.get(id);
      if (!record?.definition.pm2Name) continue;
      const pm2Name = record.definition.pm2Name;
      this.emit({
        at: this.now(),
        kind: "restart-planned",
        serviceId: id,
        detail: `pm2 restart ${pm2Name}`,
      });
      try {
        await this.restart(pm2Name);
        markRestarted(record, this.now());
        restarted.push(id);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        if (record.restartAttempts >= this.policy.maxAttempts) {
          markIsolated(record, detail);
          this.emit({ at: this.now(), kind: "isolated", serviceId: id, detail });
        }
        this.emit({ at: this.now(), kind: "dependency-note", serviceId: id, detail });
      }
    }

    for (const record of this.records.values()) {
      if (record.state === "isolated") continue;
      const exhausted = record.restartAttempts >= this.policy.maxAttempts;
      const stillFailing = record.consecutiveFailures >= this.policy.failureThreshold;
      if (exhausted && stillFailing && record.definition.optional) {
        markIsolated(record, "restart budget exhausted");
        this.emit({
          at: this.now(),
          kind: "isolated",
          serviceId: record.definition.id,
          detail: "restart budget exhausted — isolated, stack unaffected",
        });
      }
    }

    return { checked: this.records.size, failed, plan, restarted };
  }

  /** Admin Command Centre view (§28). Internal vocabulary only. */
  snapshot(): ServiceSnapshot[] {
    return [...this.records.values()].map(toSnapshot);
  }

  /**
   * Dependency report (§19). Note the shape: top-level status is always
   * "online"; per-dependency detail describes the DEPENDENCY, not Astra.
   */
  dependencyReport(): {
    status: "online";
    dependencies: Record<string, string>;
    routes: Record<string, "available" | "unavailable">;
  } {
    const dependencies: Record<string, string> = {};
    for (const snap of this.snapshot()) dependencies[snap.id] = snap.state;

    const routes: Record<string, "available" | "unavailable"> = {};
    for (const [group, defs] of Object.entries(routeGroups())) {
      const anyHealthy = defs.some((d) => this.records.get(d.id)?.state === "healthy");
      routes[group] = anyHealthy ? "available" : "unavailable";
    }

    return { status: coreStatus([...this.records.values()]), dependencies, routes };
  }

  /** Browser-reported capability state — gesture lives here, not in PM2. */
  reportCapability(
    id: string,
    label: string,
    state: CapabilitySnapshot["state"],
    detail?: string,
  ): void {
    this.capabilities.set(id, { id, label, state, detail });
  }

  /**
   * User-facing status (§20): ASTRA is online, and each capability is described
   * in its own row. There is no global degraded/offline value to return.
   */
  capabilityReport(): { status: "online"; capabilities: CapabilitySnapshot[] } {
    return { status: "online", capabilities: [...this.capabilities.values()] };
  }

  isolatedServices(): string[] {
    return this.snapshot().filter((s) => s.state === "isolated").map((s) => s.id);
  }

  /** Manual, explicit recovery of an isolated service (admin action). */
  resolve(id: string): void {
    const record = this.records.get(id);
    if (!record) return;
    record.state = "recovering";
    record.restartAttempts = 0;
    record.consecutiveFailures = 0;
    record.lastRestartAt = undefined;
    this.emit({ at: this.now(), kind: "dependency-note", serviceId: id, detail: "manually resolved" });
  }

  recentEvents(limit = 50): SupervisorEvent[] {
    return this.events.slice(-limit);
  }

  supervisedIds(): string[] {
    return supervisedServices().map((s) => s.id);
  }
}
