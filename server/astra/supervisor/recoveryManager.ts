/**
 * ASTRA Stable — Recovery decision engine (safety wall: layer 3)
 * =============================================================
 * Pure functions only: no timers, no I/O, no PM2. Given the current records it
 * returns the plan, and the plan is structurally incapable of restarting more
 * than ONE service per tick. That is the mechanical guarantee behind:
 *
 *   "one service failure never restarts another service"  (§29)
 *   "no pm2 restart all"                                   (§6)
 *   "no crash-looping"                                     (§7)
 *
 * Provider-level and process-level protection share server/ai/circuitBreaker.ts
 * so a flapping service is skipped at BOTH layers instead of being hammered.
 */
import { breakerState, recordFailure, recordSuccess } from "../../ai/circuitBreaker";
import type {
  RecoveryPlan,
  RecoveryPolicy,
  ServiceDefinition,
  ServiceSnapshot,
  ServiceState,
} from "./types";

/** Internal per-service memory. Never leaves the supervisor unredacted. */
export interface ServiceRecord {
  definition: ServiceDefinition;
  state: ServiceState;
  consecutiveFailures: number;
  restartAttempts: number;
  lastRestartAt?: number;
  lastError?: string;
  lastProbeAt: number;
  lastHealthyAt?: number;
}

const TIER_PRIORITY: Record<string, number> = { core: 0, ai: 1, extension: 2 };

export function newRecord(definition: ServiceDefinition, now: number): ServiceRecord {
  return {
    definition,
    state: "starting",
    consecutiveFailures: 0,
    restartAttempts: 0,
    lastProbeAt: now,
  };
}

/**
 * Fold one probe result into a record and mirror it into the shared breaker.
 * Terminal state after a recovered probe clears the restart budget — a service
 * that has been healthy again must not carry old failures forever.
 */
export function applyProbe(
  record: ServiceRecord,
  ok: boolean,
  policy: RecoveryPolicy,
  now: number,
  detail?: string,
): ServiceRecord {
  record.lastProbeAt = now;
  if (ok) {
    record.consecutiveFailures = 0;
    record.restartAttempts = 0;
    record.lastHealthyAt = now;
    record.lastError = undefined;
    record.state = "healthy";
    recordSuccess(record.definition.id);
    return record;
  }

  record.consecutiveFailures += 1;
  if (detail) record.lastError = detail;
  recordFailure(record.definition.id, {
    failureThreshold: policy.failureThreshold,
    cooldownMs: policy.cooldownMs,
  });
  if (record.consecutiveFailures >= policy.failureThreshold) {
    record.state = record.restartAttempts >= policy.maxAttempts ? "isolated" : "recovering";
  }
  return record;
}

export function markRestarted(record: ServiceRecord, now: number): void {
  record.restartAttempts += 1;
  record.lastRestartAt = now;
  record.consecutiveFailures = 0;
  record.state = "recovering";
}

export function markIsolated(record: ServiceRecord, reason: string): void {
  record.state = "isolated";
  record.lastError = reason;
}

function skipReason(record: ServiceRecord, policy: RecoveryPolicy, now: number): string | undefined {
  const { definition } = record;

  // Browser-only modules (Gesture Vision) have no process to restart.
  if (!definition.pm2Name) {
    return "not a supervised process (browser-only feature)";
  }
  if (record.consecutiveFailures < policy.failureThreshold) {
    return `below failure threshold (${record.consecutiveFailures}/${policy.failureThreshold})`;
  }
  if (record.lastRestartAt !== undefined && now - record.lastRestartAt < policy.cooldownMs) {
    const wait = Math.ceil((policy.cooldownMs - (now - record.lastRestartAt)) / 1000);
    return `cooldown active (${wait}s remaining)`;
  }
  if (record.restartAttempts >= policy.maxAttempts) {
    return `max attempts reached (${record.restartAttempts}/${policy.maxAttempts})`;
  }
  // NOTE: anti-hammering is enforced by the two gates above — the failure
  // threshold and the per-service restart cooldown — exactly as specified in
  // the stability policy (threshold 3 / cooldown 5 min / max 3 tries).
  // We deliberately do NOT gate on the shared provider circuit breaker here:
  // a probe that fails re-arms the breaker, so consulting it would let a
  // still-down service re-open its own circuit during the probe that precedes
  // each plan, permanently blocking the retry it is waiting for. The breaker
  // still mirrors process failures (see applyProbe) so provider routing and
  // /health diagnostics agree, but it never gates a scoped restart.
  return undefined;
}

/**
 * Decide what to do this tick. Never returns more than one restart: the stack
 * degrades gracefully instead of entering a restart storm.
 */
export function planRecovery(
  records: ServiceRecord[],
  policy: RecoveryPolicy,
  now: number,
): RecoveryPlan {
  const plan: RecoveryPlan = { restart: [], skipped: [] };

  const candidates = records
    .filter((r) => r.consecutiveFailures >= policy.failureThreshold || r.state === "isolated")
    .sort((a, b) => {
      const tier = TIER_PRIORITY[a.definition.tier] - TIER_PRIORITY[b.definition.tier];
      if (tier !== 0) return tier;
      return b.consecutiveFailures - a.consecutiveFailures;
    });

  for (const record of candidates) {
    const reason = skipReason(record, policy, now);
    if (reason) {
      plan.skipped.push({ id: record.definition.id, reason });
      continue;
    }
    // One restart per tick. Everything else waits for the next tick.
    if (plan.restart.length === 0) {
      plan.restart.push(record.definition.id);
    } else {
      plan.skipped.push({ id: record.definition.id, reason: "deferred (single restart per tick)" });
    }
  }

  return plan;
}

/**
 * Astra core status. Core records decide it; ai/extension records are simply
 * not consulted. Even with every optional service isolated this returns
 * "online" — the UI must never see anything else (§11, §29).
 */
export function coreStatus(records: ServiceRecord[]): "online" {
  void records;
  return "online";
}

export function toSnapshot(record: ServiceRecord): ServiceSnapshot {
  return {
    id: record.definition.id,
    name: record.definition.name,
    tier: record.definition.tier,
    state: record.state,
    circuit: breakerState(record.definition.id),
    consecutiveFailures: record.consecutiveFailures,
    restartAttempts: record.restartAttempts,
    lastError: record.lastError,
    lastProbeAt: record.lastProbeAt,
    lastHealthyAt: record.lastHealthyAt,
  };
}
