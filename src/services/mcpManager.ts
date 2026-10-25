/**
 * ASTRA AI — MCP MANAGER (frontend)
 * ============================================================================
 * Typed client for the Astra MCP REST API (/api/mcp/*). Surfaces only safe
 * metadata — secrets never reach the frontend. Status values are REAL: servers
 * report CONFIGURED (reachable endpoint not verified) / CONNECTED / ERROR /
 * DISABLED exactly as the backend health probes observe.
 */

export type McpServerStatus = "DISABLED" | "CONFIGURED" | "CONNECTING" | "CONNECTED" | "ERROR";

export interface McpServer {
  id: string;
  name: string;
  repo: string;
  description: string;
  transport: string;
  endpoint: string;
  configured: boolean;
  required: boolean;
  status: McpServerStatus;
  displayStatus?: string;
  capabilities: string[];
  allRoles: string[];
  denyTools: string[];
  tools: Array<{ name: string; description?: string }>;
  resources: Array<{ uri: string; name?: string }>;
  prompts: Array<{ name: string; description?: string }>;
  reachable: boolean;
  lastSeen: string | null;
  lastChecked: string | null;
  lastError: string | null;
  latencyMs: number | null;
}

export interface McpToolCallResult {
  ok: boolean;
  risk?: string;
  requiresApproval?: boolean;
  reason?: string;
  result?: unknown;
  error?: string;
  latencyMs?: number;
}

async function jfetch<T>(url: string, init?: RequestInit, timeoutMs = 15000): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 202) {
    throw new Error((body as { message?: string; error?: string }).message ?? (body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return body as T;
}

export const mcpManager = {
  async listServers(): Promise<McpServer[]> {
    const data = await jfetch<{ servers: McpServer[] }>("/api/mcp/servers");
    return data.servers;
  },

  async getServer(id: string): Promise<McpServer> {
    const data = await jfetch<{ server: McpServer }>(`/api/mcp/servers/${encodeURIComponent(id)}`);
    return data.server;
  },

  async addServer(input: { id: string; name: string; repo: string; endpoint: string; description?: string; capabilities?: string[] }): Promise<McpServer> {
    return jfetch<McpServer>("/api/mcp/servers", { method: "POST", body: JSON.stringify(input) });
  },

  async removeServer(id: string): Promise<void> {
    await jfetch(`/api/mcp/servers/${encodeURIComponent(id)}`, { method: "DELETE" });
  },

  async setEnabled(id: string, enabled: boolean): Promise<McpServer> {
    const data = await jfetch<{ server: McpServer }>(`/api/mcp/servers/${encodeURIComponent(id)}/${enabled ? "enable" : "disable"}`, { method: "POST" });
    return data.server;
  },

  /** Full handshake + capability discovery. Failure-isolated server-side. */
  async connect(id: string): Promise<McpServer> {
    const data = await jfetch<{ server: McpServer }>(`/api/mcp/servers/${encodeURIComponent(id)}/connect`, { method: "POST" }, 20000);
    return data.server;
  },

  /** Lightweight reachability probe. */
  async health(id: string): Promise<McpServer> {
    const data = await jfetch<{ server: McpServer }>(`/api/mcp/servers/${encodeURIComponent(id)}/health`, { method: "POST" }, 8000);
    return data.server;
  },

  async capabilities(id: string): Promise<{ capabilities: string[]; tools: McpServer["tools"]; resources: McpServer["resources"]; prompts: McpServer["prompts"] }> {
    return jfetch(`/api/mcp/servers/${encodeURIComponent(id)}/capabilities`);
  },

  /**
   * Execute an MCP tool. High-risk tools return ok=false with
   * requiresApproval=true until the caller passes approval:"APPROVED".
   */
  async callTool(id: string, toolName: string, args: Record<string, unknown>, approval?: "APPROVED"): Promise<McpToolCallResult> {
    return jfetch<McpToolCallResult>(
      `/api/mcp/servers/${encodeURIComponent(id)}/tools/${encodeURIComponent(toolName)}`,
      { method: "POST", body: JSON.stringify({ arguments: args, ...(approval ? { approval } : {}) }) },
      30000,
    );
  },
};
