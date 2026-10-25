/**
 * Astra AI — Internal Service Manager :: Types
 * =============================================
 * Real lifecycle states only. No fabricated status values are permitted:
 * every state transition must be caused by a real observation (process exit,
 * HTTP probe result, install step result).
 *
 * Governing rules (ASTRA_MASTER_PROMPT.md):
 *   - NO FAKE STATUS — HEALTHY requires a passing live health probe.
 *   - Values in snapshots reflect the actual OS process and actual endpoint.
 */

/** Canonical ASTRA-managed internal service IDs. */
export type ServiceId = "freellmapi" | "omniroute";

/** Lifecycle states exposed to Plugin Center / System Health. */
export type ServiceState =
  | "NOT_INSTALLED"
  | "INSTALLING"
  | "STARTING"
  | "HEALTHY"
  | "DEGRADED"
  | "UNHEALTHY"
  | "STOPPED"
  | "CRASHED"
  | "UPDATING"
  | "DISABLED";

export interface InstallStep {
  step: string;
  status: "PENDING" | "RUNNING" | "DONE" | "FAILED" | "SKIPPED";
  detail?: string;
}

/** Latest installation pipeline progress (mirrors INSTALLATION UX spec §33). */
export interface InstallProgress {
  running: boolean;
  steps: InstallStep[];
  startedAt?: string;
  finishedAt?: string;
  error?: string;
}

export interface ServiceRuntimeFacts {
  nodeRequired: string;
  nodeCompatible: boolean;
  nodeBinUsed?: string;
  nodeVersionUsed?: string;
  diskFreeMB?: number;
}

/** Everything the UI needs — all fields measured, never invented. */
export interface ServiceSnapshot {
  id: ServiceId;
  displayName: string;
  restartCount: number;
  crashLoopDetected: boolean;
  managed: boolean;
  upstreamName: string;
  upstreamRepo: string;
  upstreamRef: string;
  upstreamLicense: string;
  requestedVersion: string;
  installedVersion?: string;
  verifiedCommit?: string;
  state: ServiceState;
  /** Real listening endpoint once known; never a fake placeholder. */
  endpoint?: string;
  host: string;
  port?: number;
  process?: {
    pid?: number;
    startedAt?: string;
    uptimeMs: number;
    command: string;
    args: string[];
    exitCode?: number | null;
    restartCount: number;
    crashLoopDetected: boolean;
    restartPending: boolean;
  };
  health?: {
    lastProbeAt?: string;
    latencyMs?: number;
    consecutiveFailures: number;
    detail?: string;
  };
  metrics: {
    /** Requests actually proxied by ASTRA through this service. */
    requests: number;
    errors: number;
  };
  runtime: ServiceRuntimeFacts;
  installProgress?: InstallProgress;
  lastError?: string;
  disabledReason?: string;
  logTailSizeBytes: number;
}

export interface ServiceConfig {
  host: string;
  port: number;
  autoStart: boolean;
  /** Launch overrides persisted by/for administrators. */
  nodeBinOverride?: string;
  extraEnv?: Record<string, string>;
}

/** Persisted manifest.json schema (one per service directory). */
export interface ServiceManifest {
  id: ServiceId;
  requestedVersion: string;
  upstreamRef: string;
  verifiedCommit?: string;
  installedAt?: string;
  sourceLayout: "git-workspace" | "git-package";
  launch: {
    cwdRelative: string;
    nodeBin?: string;
    scriptRelative: string;
    args: string[];
  };
  config: ServiceConfig;
  history: Array<{
    at: string;
    action: string;
    result: "OK" | "FAILED";
    detail?: string;
  }>;
}

export interface ProbeResult {
  ok: boolean;
  latencyMs: number;
  detail: string;
  version?: string;
}

export interface UnifiedModelEntry {
  stableId: string;
  modelId: string;
  providerLabel: string;
  sourceService: ServiceId | "static";
  available: boolean;
  capabilities: string[];
  contextWindow?: number;
  requestCount: number;
  errorCount: number;
  route: string;
  fallbackRoute?: string;
}
