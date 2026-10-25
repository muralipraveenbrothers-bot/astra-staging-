/**
 * ASTRA AI — MCP CONNECTION MANAGER
 * ============================================================================
 * Drives the real MCP connection lifecycle that the registry alone never
 * performed. On startup, every enabled server is swept through:
 *
 *   CONFIGURED → CONNECTING → CONNECTED → DISCOVERING_TOOLS → READY
 *
 * with typed failure states and bounded reconnect backoff. A server only
 * reaches CONNECTED after a real protocol negotiation (the MCP SDK handles
 * modern server/discover and legacy initialize automatically), and only
 * reaches READY after listTools() succeeds.
 */
import { mcpRegistry } from "./mcpRegistry";

const MIN_RETRY_INTERVAL_MS = 15 * 60 * 1000;
const MAX_RETRY_DELAY_MS = 4 * 60 * 60 * 1000;
const STABLE_WINDOW_MS = 120_000;

interface McpConnState {
  attempt: number;
  lastAttemptAt?: number;
  connectedAt?: number;
  stableSince?: number;
  lastError?: string;
}

const connStates = new Map<string, McpConnState>();
const inFlight = new Set<string>();
let sweepTimer: NodeJS.Timeout | null = null;

function stateOf(id: string): McpConnState {
  let s = connStates.get(id);
  if (!s) { s = { attempt: 0 }; connStates.set(id, s); }
  return s;
}

export function mcpReconnectDelay(failureCount: number): number {
  const exponent = Math.max(0, Math.floor(failureCount) - 1);
  return Math.min(MAX_RETRY_DELAY_MS, MIN_RETRY_INTERVAL_MS * (2 ** exponent));
}

async function connectOne(id: string): Promise<void> {
  if (inFlight.has(id)) return;
  inFlight.add(id);
  try {
  const cfg = mcpRegistry.getConfig(id);
  if (!cfg || cfg.status === "disabled") return;

  const st = stateOf(id);
  st.lastAttemptAt = Date.now();

  // checkHealth performs the real handshake and, unlike the old direct
  // connectAndDiscover call, persists the discovered capabilities and public
  // CONNECTED/ERROR status in the registry used by the health dashboard.
  const updated = await mcpRegistry.checkHealth(id, true);
  const connected = updated.status === "CONNECTED";

  if (connected) {
    st.attempt = 0;
    st.connectedAt = Date.now();
    st.stableSince = st.stableSince ?? Date.now();
    st.lastError = undefined;
  } else {
    st.attempt += 1;
    st.lastError = updated.lastError ?? "discovery failed";
    st.stableSince = undefined;
  }
  } finally {
    inFlight.delete(id);
  }
}

async function sweepOnce(): Promise<void> {
  const servers = mcpRegistry.listAll();
  await Promise.all(servers.map(async (s) => {
    if (s.status === "DISABLED") return;
    const st = stateOf(s.id);
    // A crashed transport or a process restart can leave the registry in
    // CONNECTING even though no request is still active. Reclassify stale
    // attempts so the normal bounded retry schedule can recover them.
    if (s.status === "CONNECTING" && s.lastChecked) {
      const ageMs = Date.now() - Date.parse(s.lastChecked);
      if (Number.isFinite(ageMs) && ageMs > 20_000 && !inFlight.has(s.id)) {
        mcpRegistry.markRetryable(s.id, "connection attempt expired");
      }
    }
    if (s.status === "CONNECTED" && st.stableSince && Date.now() - st.stableSince > STABLE_WINDOW_MS) {
      st.stableSince = Date.now();
    }
    const current = mcpRegistry.get(s.id);
    if (current && (current.status === "CONFIGURED" || current.status === "ERROR")) {
      const delay = mcpReconnectDelay(st.attempt);
      const due = !st.lastAttemptAt || Date.now() - st.lastAttemptAt >= delay;
      if (due) {
        try { await connectOne(s.id); } catch (e) { st.lastError = e instanceof Error ? e.message : String(e); }
      }
    }
  }));
}

export function startMcpConnectionSweep(intervalMs = 30_000): void {
  if (sweepTimer) return;
  void sweepOnce();
  sweepTimer = setInterval(() => { void sweepOnce(); }, intervalMs);
  sweepTimer.unref?.();
}

export function stopMcpConnectionSweep(): void {
  if (sweepTimer) { clearInterval(sweepTimer); sweepTimer = null; }
}

export async function connectMcpNow(id: string): Promise<{ ok: boolean; error?: string }> {
  try { await connectOne(id); const s = mcpRegistry.get(id); return { ok: s?.status === "CONNECTED" }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export function getMcpConnectionStates(): Array<{ id: string; attempt: number; lastError?: string; connectedAt?: number }> {
  return Array.from(connStates.entries()).map(([id, s]) => ({ id, ...s }));
}
