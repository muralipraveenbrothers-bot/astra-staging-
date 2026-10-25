/**
 * ASTRA AI — ROUTER HEALTH MONITOR & CIRCUIT BREAKER (Layer 4)
 * 
 * Periodic health probes for all 5 sub-routers.
 * Circuit breaker: CLOSED → OPEN (after N failures) → HALF_OPEN (after cooldown).
 * Rate limit tracking with 429 cooldown timers.
 */

import type {
  SubRouterId,
  SubRouterHealth,
  CircuitState,
  RouterHealthSnapshot,
} from "./types";
import { DEFAULT_ROUTER_CONFIG } from "./routerConfig";

// ─── Internal Health State ────────────────────────────────────────

const healthState: Record<SubRouterId, SubRouterHealth> = {
  freellmapi: createDefaultHealth("freellmapi"),
  omniroute: createDefaultHealth("omniroute"),
  litellm: createDefaultHealth("litellm"),
  routellm: createDefaultHealth("routellm"),
  ollama: createDefaultHealth("ollama"),
};

// Retired routers read as RETIRED from the first snapshot, never UNKNOWN/red.
for (const id of Object.keys(healthState) as SubRouterId[]) {
  if (DEFAULT_ROUTER_CONFIG.subrouters[id]?.retired) healthState[id].status = "RETIRED";
}

let totalRequests = 0;
let totalFailovers = 0;
let healthCheckInterval: ReturnType<typeof setInterval> | null = null;

function createDefaultHealth(id: SubRouterId): SubRouterHealth {
  return {
    id,
    status: "UNKNOWN",
    circuitState: "CLOSED",
    latencyMs: -1,
    lastChecked: 0,
    lastSuccess: 0,
    consecutiveFailures: 0,
    modelCount: 0,
    models: [],
    rateLimit: { remaining: -1, resetAt: 0 },
  };
}

// ─── HTTP Probe ───────────────────────────────────────────────────

async function probe(url: string, timeoutMs: number): Promise<{
  ok: boolean;
  latencyMs: number;
  status?: number;
  models?: string[];
  error?: string;
}> {
  const t0 = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    const latencyMs = Math.round(performance.now() - t0);

    if (res.status === 429) {
      return { ok: false, latencyMs, status: 429, error: "Rate limited (429)" };
    }

    // Try to extract model list from response
    let models: string[] = [];
    try {
      const data = await res.json();
      if (Array.isArray(data?.data)) {
        models = data.data.map((m: any) => String(m.id ?? m.name ?? "")).filter(Boolean);
      } else if (Array.isArray(data?.models)) {
        models = data.models.map((m: any) => String(m.name ?? m.id ?? "")).filter(Boolean);
      }
    } catch {
      // Non-JSON response is fine — health endpoint might return plain text
    }

    return { ok: res.ok || res.status === 401 || res.status === 403, latencyMs, status: res.status, models };
  } catch (e) {
    clearTimeout(timer);
    const latencyMs = Math.round(performance.now() - t0);
    const error = e instanceof DOMException && e.name === "AbortError"
      ? `Timeout after ${timeoutMs}ms`
      : e instanceof Error ? e.message : String(e);
    return { ok: false, latencyMs, error };
  }
}

// ─── Circuit Breaker Logic ────────────────────────────────────────

function updateCircuitBreaker(health: SubRouterHealth, probeSuccess: boolean): void {
  const config = DEFAULT_ROUTER_CONFIG.globalSettings;

  if (probeSuccess) {
    health.consecutiveFailures = 0;
    health.circuitState = "CLOSED";
    health.lastSuccess = Date.now();
    return;
  }

  health.consecutiveFailures += 1;

  if (health.consecutiveFailures >= config.circuitBreakerThreshold) {
    health.circuitState = "OPEN";
    // Schedule HALF_OPEN after recovery period
    setTimeout(() => {
      if (health.circuitState === "OPEN") {
        health.circuitState = "HALF_OPEN";
      }
    }, config.circuitBreakerRecoveryMs);
  }
}

// ─── Health Check for Single Router ──────────────────────────────

async function checkRouterHealth(routerId: SubRouterId): Promise<void> {
  const config = DEFAULT_ROUTER_CONFIG.subrouters[routerId];
  if (!config) {
    healthState[routerId].status = "OFFLINE";
    return;
  }

  // Retired routers are history, not alarms: never probe them (the proxy is
  // gone), never let them read as OFFLINE/red, never route through them.
  if (config.retired) {
    healthState[routerId].status = "RETIRED";
    healthState[routerId].error = undefined;
    return;
  }

  if (!config.enabled) {
    healthState[routerId].status = "OFFLINE";
    return;
  }

  const url = `${config.proxyMount}${config.healthEndpoint}`;
  const result = await probe(url, config.timeoutMs > 10000 ? 5000 : config.timeoutMs);

  const health = healthState[routerId];
  health.lastChecked = Date.now();
  health.latencyMs = result.latencyMs;

  if (result.status === 429) {
    health.status = "RATE_LIMITED";
    health.rateLimit.remaining = 0;
    health.rateLimit.resetAt = Date.now() + config.rateLimit.cooldownMs;
    updateCircuitBreaker(health, false);
    health.error = result.error;
    return;
  }

  if (result.ok) {
    health.status = result.latencyMs > 3000 ? "DEGRADED" : "ONLINE";
    health.error = undefined;
    if (result.models && result.models.length > 0) {
      health.models = result.models;
      health.modelCount = result.models.length;
    }
    updateCircuitBreaker(health, true);
  } else {
    health.status = "OFFLINE";
    health.error = result.error;
    updateCircuitBreaker(health, false);
  }
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Run health checks on all enabled sub-routers.
 */
export async function checkAllRouters(): Promise<void> {
  const routerIds = Object.keys(DEFAULT_ROUTER_CONFIG.subrouters) as SubRouterId[];
  await Promise.allSettled(routerIds.map((id) => checkRouterHealth(id)));
}

/**
 * Get health status for a specific sub-router.
 */
export function getRouterHealth(routerId: SubRouterId): SubRouterHealth {
  return { ...healthState[routerId] };
}

/**
 * Get a snapshot of all router health states.
 */
export function getHealthSnapshot(): RouterHealthSnapshot {
  const subrouters = {} as Record<SubRouterId, SubRouterHealth>;
  for (const id of Object.keys(healthState) as SubRouterId[]) {
    subrouters[id] = { ...healthState[id] };
  }
  return {
    timestamp: Date.now(),
    subrouters,
    activePolicy: "auto",
    totalRequests,
    totalFailovers,
  };
}

/**
 * Check if a sub-router is available for routing.
 */
export function isRouterAvailable(routerId: SubRouterId): boolean {
  // Retired routers are excluded from routing even before the first health check.
  if (DEFAULT_ROUTER_CONFIG.subrouters[routerId]?.retired) return false;
  const health = healthState[routerId];
  if (health.status === "RETIRED") return false;
  if (health.circuitState === "OPEN") return false;
  if (health.status === "OFFLINE") return false;
  if (health.status === "RATE_LIMITED" && Date.now() < health.rateLimit.resetAt) return false;
  return true;
}

/**
 * Record a request for metrics tracking.
 */
export function recordRequest(wasFailover: boolean): void {
  totalRequests++;
  if (wasFailover) totalFailovers++;
}

/**
 * Record a rate limit hit for a specific router.
 */
export function recordRateLimit(routerId: SubRouterId): void {
  const config = DEFAULT_ROUTER_CONFIG.subrouters[routerId];
  const health = healthState[routerId];
  health.status = "RATE_LIMITED";
  health.rateLimit.remaining = 0;
  health.rateLimit.resetAt = Date.now() + (config?.rateLimit.cooldownMs ?? 15000);
  updateCircuitBreaker(health, false);
}

/**
 * Record a failure for a specific router (non-rate-limit).
 */
export function recordFailure(routerId: SubRouterId, error: string): void {
  const health = healthState[routerId];
  health.error = error;
  updateCircuitBreaker(health, false);
}

/**
 * Start periodic health checks.
 */
export function startHealthMonitor(): void {
  if (healthCheckInterval) return;
  const interval = DEFAULT_ROUTER_CONFIG.globalSettings.healthCheckIntervalMs;
  
  // Initial check
  checkAllRouters().catch(console.error);
  
  healthCheckInterval = setInterval(() => {
    checkAllRouters().catch(console.error);
  }, interval);

  console.log(`[RouterHealthMonitor] Started. Checking every ${interval / 1000}s`);
}

/**
 * Stop periodic health checks.
 */
export function stopHealthMonitor(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
    console.log("[RouterHealthMonitor] Stopped.");
  }
}
