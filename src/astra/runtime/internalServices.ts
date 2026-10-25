/**
 * Astra AI runtime :: Internal Services API client
 * ================================================
 * Thin typed access to the ASTRA Internal Service Manager backend
 * (/api/services). All values displayed come from real runtime state —
 * the server never fabricates status, ports or metrics (§11/§30).
 */

/**
 * Ids of services the LOCAL SUPERVISOR can install / start / stop / restart.
 * Only these two are managed locally; the remaining canonical services
 * (ollama, astra, hermes, langgraph, n8n, …) are external and merely observed.
 */
export type ServiceId = "freellmapi" | "omniroute";

export type ServiceState =
  | "NOT_INSTALLED" | "INSTALLING" | "STARTING" | "HEALTHY"
  | "DEGRADED" | "UNHEALTHY" | "STOPPED" | "CRASHED"
  | "UPDATING" | "DISABLED";

export interface ServiceSnapshot {
  /**
   * Canonical service id — deliberately `string`, NOT `ServiceId`.
   * GET /api/services returns a snapshot for every canonical service (12 of
   * them, see server/services/canonicalRegistry.ts), most of which are not
   * supervisor-managed. Typing this as the two-value managed union made every
   * canonical snapshot built in server/ai/routes.ts a TS2322.
   */
  id: string;
  displayName: string;
  managed: boolean;
  upstreamName: string;
  upstreamRepo: string;
  upstreamRef: string;
  upstreamLicense: string;
  requestedVersion: string;
  installedVersion?: string;
  verifiedCommit?: string;
  state: ServiceState;
  endpoint?: string;
  host: string;
  port?: number;
  process?: {
    pid?: number;
    startedAt?: string;
    uptimeMs: number;
    command: string;
    exitCode?: number | null;
    restartCount: number;
    crashLoopDetected: boolean;
    restartPending: boolean;
  };
  health?: { latencyMs?: number; consecutiveFailures: number; detail?: string };
  metrics: { requests: number; errors: number };
  runtime: {
    nodeRequired: string;
    nodeCompatible: boolean;
    nodeVersionUsed?: string;
    diskFreeMB?: number;
  };
  installProgress?: {
    running: boolean;
    steps: Array<{ step: string; status: string; detail?: string }>;
    error?: string;
  };
  lastError?: string;
  disabledReason?: string;
}

let authToken: string | null = null;

/**
 * Set the Bearer token used for ALL /api/services calls.
 * The ASTRA backend RBAC defaults to role `doctor` when no token is sent,
 * which 403s admin-gated operations (install/start/stop/restart/diagnose).
 * The console sets this from the logged-in session role.
 */
export function setServiceAuthToken(token: string | null): void {
  authToken = token;
}

function authHeaders(): Record<string, string> {
  return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

export const internalServices = {
  async all(): Promise<{ services: ServiceSnapshot[] }> {
    return (await fetch("/api/services", { headers: authHeaders() })).json() as Promise<{ services: ServiceSnapshot[] }>;
  },
  async snapshot(id: ServiceId): Promise<ServiceSnapshot> {
    return (await fetch(`/api/admin/services/${id}/status`, { headers: authHeaders() })).json() as Promise<ServiceSnapshot>;
  },
  async start(id: ServiceId): Promise<ServiceSnapshot> {
    return (await fetch(`/api/admin/services/${id}/start`, { method: "POST", headers: authHeaders() })).json() as Promise<ServiceSnapshot>;
  },
  async stop(id: ServiceId): Promise<ServiceSnapshot> {
    return (await fetch(`/api/admin/services/${id}/stop`, { method: "POST", headers: authHeaders() })).json() as Promise<ServiceSnapshot>;
  },
  async restart(id: ServiceId): Promise<ServiceSnapshot> {
    return (await fetch(`/api/admin/services/${id}/restart`, { method: "POST", headers: authHeaders() })).json() as Promise<ServiceSnapshot>;
  },
  async diagnose(id: ServiceId): Promise<{
    probe: { ok: boolean; latencyMs: number; detail: string };
    endpoint?: string;
    pid?: number;
    uptimeMs: number;
  }> {
    return (await fetch(`/api/admin/services/${id}/diagnose`, { method: "POST", headers: authHeaders() })).json() as Promise<{
      probe: { ok: boolean; latencyMs: number; detail: string };
      endpoint?: string;
      pid?: number;
      uptimeMs: number;
    }>;
  },
  async logs(id: ServiceId, lines = 200): Promise<{ lines: string[] }> {
    return (await fetch(`/api/admin/services/${id}/logs?lines=${lines}`, { headers: authHeaders() })).json() as Promise<{ lines: string[] }>;
  },
  async models(id: ServiceId): Promise<{ count: number; models: Array<Record<string, unknown>> }> {
    return (await fetch(`/api/admin/services/${id}/models`, { headers: authHeaders() })).json() as Promise<{
      count: number;
      models: Array<Record<string, unknown>>;
    }>;
  },
};

/** Compact uptime formatting for status displays. */
export function formatUptime(ms: number): string {
  if (!ms || ms < 1000) return "—";
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export const STATE_TONE: Record<ServiceState, "green" | "amber" | "red" | "neutral"> = {
  HEALTHY: "green",
  STARTING: "amber",
  INSTALLING: "amber",
  UPDATING: "amber",
  DEGRADED: "amber",
  UNHEALTHY: "red",
  CRASHED: "red",
  DISABLED: "red",
  STOPPED: "neutral",
  NOT_INSTALLED: "neutral",
};
