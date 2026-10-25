/**
 * ASTRA Stable — Supervisor types (safety wall, layer 1)
 * =====================================================
 * Vocabulary rule: the *user-facing* Astra state has exactly one value —
 * "online". Everything else in here is INTERNAL diagnostics for the Admin
 * Command Centre, the watchdog and PM2 logs. A failing extension must never be
 * able to express itself as a global Astra state.
 *
 * Mirrors the terminology used by server/ai/circuitBreaker.ts (closed | open |
 * half-open) so provider-level and process-level protection read the same way.
 */
import type { BreakerState } from "../../ai/circuitBreaker";

/** Service classes. Only "core" failures may affect Astra's own health. */
export type ServiceTier = "core" | "ai" | "extension";

/**
 * Internal per-service state. Deliberately does NOT contain "offline" or
 * "degraded" — those words are banned from the global model (see §26).
 */
export type ServiceState = "starting" | "healthy" | "recovering" | "isolated" | "stopped";

/** The only user-facing application status that exists. */
export type CoreStatus = "online";

export type ProbeKind = "http" | "tcp" | "none";

/** An entry from config/ports.json. */
export interface PortEntry {
  name: string;
  host: string;
  port: number;
  tier: ServiceTier;
  probe: ProbeKind;
  healthPath?: string;
  pm2?: string;
  launcher?: string;
  /** Alternatives that share one capability (e.g. Ollama ↔ FreeLLMAPI). */
  routeGroup?: string;
  /** Ports that must never be used again (drift guard). */
  aliases?: number[];
  /** Retired services are kept for history only: never probed, restarted or routed. */
  retired?: boolean;
  notes?: string;
}

export interface ServiceDefinition {
  id: string;
  name: string;
  tier: ServiceTier;
  host: string;
  port: number;
  probe: ProbeKind;
  healthPath?: string;
  pm2Name?: string;
  launcher?: string;
  routeGroup?: string;
  /** True for anything that is not core: its failure must be containable. */
  optional: boolean;
  url: string;
}

export interface ServiceSnapshot {
  id: string;
  name: string;
  tier: ServiceTier;
  state: ServiceState;
  circuit: BreakerState;
  consecutiveFailures: number;
  restartAttempts: number;
  lastError?: string;
  lastProbeAt: number;
  lastHealthyAt?: number;
}

export interface RecoveryPolicy {
  /** Consecutive failed probes before a restart is planned. */
  failureThreshold: number;
  /** Minimum ms between two automatic restarts of the SAME service. */
  cooldownMs: number;
  /** Automatic restart attempts before the service is isolated. */
  maxAttempts: number;
  /** How often the watchdog probes. Informational for the engine. */
  healthIntervalMs: number;
  /** Probe timeout for the injected probe implementation. */
  probeTimeoutMs: number;
}

export const DEFAULT_RECOVERY_POLICY: RecoveryPolicy = {
  failureThreshold: Number(process.env.ASTRA_SUP_FAIL_THRESHOLD ?? 3),
  cooldownMs: Number(process.env.ASTRA_SUP_COOLDOWN_MS ?? 300_000),
  maxAttempts: Number(process.env.ASTRA_SUP_MAX_ATTEMPTS ?? 3),
  healthIntervalMs: Number(process.env.ASTRA_SUP_INTERVAL_MS ?? 30_000),
  probeTimeoutMs: Number(process.env.ASTRA_SUP_PROBE_TIMEOUT_MS ?? 2_000),
};

export type SupervisorEventKind =
  | "health-ok"
  | "health-fail"
  | "restart-planned"
  | "restart-skipped"
  | "isolated"
  | "dependency-note";

export interface SupervisorEvent {
  at: number;
  kind: SupervisorEventKind;
  serviceId: string;
  detail?: string;
}

/** What the supervisor intends to do — intentionally restart-shaped. */
export interface RecoveryPlan {
  /** Service ids to restart. Never more than one per tick. */
  restart: string[];
  skipped: { id: string; reason: string }[];
}

export interface ProbeResult {
  ok: boolean;
  detail?: string;
}

/** Injected IO. The supervisor itself performs no I/O, no timers. */
export type ProbeFn = (service: ServiceDefinition, timeoutMs: number) => Promise<ProbeResult>;
export type RestartFn = (pm2Name: string) => Promise<void> | void;

export interface SupervisorOptions {
  policy?: Partial<RecoveryPolicy>;
  probe?: ProbeFn;
  restart?: RestartFn;
  now?: () => number;
  onEvent?: (event: SupervisorEvent) => void;
}
