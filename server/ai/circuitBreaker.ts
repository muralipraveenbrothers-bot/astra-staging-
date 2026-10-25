/**
 * ASTRA AI — Provider Circuit Breaker (Phase 2 §26)
 * =================================================
 * Lightweight per-provider protection: after repeated failures a provider
 * enters an OPEN state and is skipped (routed elsewhere) for a cooldown
 * period, then HALF-OPENs so a single probe can recover it. Prevents hammering
 * offline services and keeps fallback routing responsive.
 *
 * Pure in-process, no timers, no I/O — safe for tests and hot paths.
 */

export type BreakerState = "closed" | "open" | "half-open";

export interface BreakerOptions {
  /** Consecutive failures before opening. Default 3. */
  failureThreshold?: number;
  /** Ms to wait before allowing a half-open probe. Default 30_000. */
  cooldownMs?: number;
  /** Clock injection for tests. */
  now?: () => number;
}

interface BreakerMemory {
  state: BreakerState;
  consecutiveFailures: number;
  openedAt: number;
}

const memories = new Map<string, BreakerMemory>();

function opts(o?: BreakerOptions) {
  return {
    failureThreshold: o?.failureThreshold ?? Number(process.env.ASTRA_BREAKER_THRESHOLD ?? 3),
    cooldownMs: o?.cooldownMs ?? Number(process.env.ASTRA_BREAKER_COOLDOWN_MS ?? 30_000),
    now: o?.now ?? Date.now,
  };
}

export function breakerState(providerId: string, o?: BreakerOptions): BreakerState {
  const { cooldownMs, now } = opts(o);
  const m = memories.get(providerId);
  if (!m) return "closed";
  if (m.state === "open" && now() - m.openedAt >= cooldownMs) {
    m.state = "half-open";
  }
  return m.state;
}

/** True when the provider may be attempted right now. */
export function canAttempt(providerId: string, o?: BreakerOptions): boolean {
  return breakerState(providerId, o) !== "open";
}

export function recordFailure(providerId: string, o?: BreakerOptions): void {
  const { failureThreshold, now } = opts(o);
  const m = memories.get(providerId) ?? { state: "closed" as BreakerState, consecutiveFailures: 0, openedAt: 0 };
  m.consecutiveFailures += 1;
  if (m.consecutiveFailures >= failureThreshold || m.state === "half-open") {
    m.state = "open";
    m.openedAt = now();
  }
  memories.set(providerId, m);
}

export function recordSuccess(providerId: string): void {
  memories.set(providerId, { state: "closed", consecutiveFailures: 0, openedAt: 0 });
}

/** Snapshot for health/metrics endpoints (no secrets). */
export function breakerSnapshot(): Record<string, { state: BreakerState; consecutiveFailures: number }> {
  const out: Record<string, { state: BreakerState; consecutiveFailures: number }> = {};
  for (const [id, m] of memories) out[id] = { state: m.state, consecutiveFailures: m.consecutiveFailures };
  return out;
}

export function resetBreakers(): void {
  memories.clear();
}
