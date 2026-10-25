/**
 * ASTRA AI — MCP SERVER REGISTRY
 * ============================================================================
 * Centralized, config-driven registry for every configured MCP server. Tracks
 * lifecycle state (DISABLED / CONFIGURED / CONNECTING / CONNECTED / ERROR),
 * discovered capabilities, health, last-seen and last-error. Optional servers
 * that fail never crash Astra (§26).
 *
 * Secrets NEVER leave this module. Only safe metadata is exposed (used by the
 * API and frontend).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { connectAndDiscover, probeHttp } from "./mcpClient";
import type { McpCapabilityRule } from "./mcpSecurity";

export type McpServerStatus = "DISABLED" | "CONFIGURED" | "CONNECTING" | "CONNECTED" | "ERROR";

export interface McpServerConfig {
  id: string;
  name: string;
  repo: string;
  description: string;
  transport: string;
  endpoint: string;
  command?: string;
  args?: string[];
  cwd?: string;
  status: "enabled" | "disabled";
  reason?: string;
  required: boolean;
  capabilities: string[];
  authentication: string;
  permissions: McpCapabilityRule;
}

export interface McpServerState {
  id: string;
  name: string;
  repo: string;
  description: string;
  transport: string;
  endpoint: string;
  configured: boolean;
  required: boolean;
  status: McpServerStatus;
  displayStatus: string;
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

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

const CONFIG_PATH = path.join(repoRoot(), "config", "mcp-servers.json");

export function formatMcpDisplayStatus(status: McpServerStatus, reason?: string): string {
  return status === "DISABLED" && reason ? `disabled (${reason})` : status;
}

class McpRegistryService {
  private configs: Map<string, McpServerConfig> = new Map();
  private states: Map<string, Omit<McpServerState, "id" | "name" | "displayStatus">> = new Map();

  constructor() {
    this.loadConfig();
  }

  private loadConfig(): void {
    try {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as { mcp_servers: McpServerConfig[] };
      for (const c of raw.mcp_servers ?? []) {
        this.configs.set(c.id, c);
        this.states.set(c.id, {
          repo: c.repo, description: c.description, transport: c.transport, endpoint: c.endpoint,
          configured: true, required: c.required ?? false,
          status: c.status === "enabled" ? "CONFIGURED" : "DISABLED",
          capabilities: c.capabilities ?? [],
          allRoles: c.permissions?.allowedRoles ?? [],
          denyTools: c.permissions?.denyTools ?? [],
          tools: [], resources: [], prompts: [],
          reachable: false, lastSeen: null, lastChecked: null, lastError: null, latencyMs: null,
        });
      }
    } catch (err) {
      console.error("[mcp-registry] failed to load config:", err instanceof Error ? err.message : err);
    }
  }

  public listAll(): McpServerState[] {
    return Array.from(this.configs.keys()).map((id) => this.get(id)!);
  }

  public get(id: string): McpServerState | undefined {
    const cfg = this.configs.get(id);
    const st = this.states.get(id);
    if (!cfg || !st) return undefined;
    return { id: cfg.id, name: cfg.name, ...st, displayStatus: formatMcpDisplayStatus(st.status, cfg.reason) };
  }

  public getConfig(id: string): McpServerConfig | undefined {
    return this.configs.get(id);
  }

  public idSet(): string[] {
    return Array.from(this.configs.keys());
  }

  private persist(): void {
    try {
      const payload = { mcp_servers: Array.from(this.configs.values()) };
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(payload, null, 2) + "\n", "utf-8");
    } catch (err) {
      console.error("[mcp-registry] failed to persist config:", err instanceof Error ? err.message : err);
    }
  }

  public addServer(input: McpServerConfig): { ok: boolean; error?: string; id: string; state?: McpServerState } {
    if (this.configs.has(input.id)) {
      return { ok: false, error: `MCP server '${input.id}' already registered`, id: input.id };
    }
    const full: McpServerConfig = { ...input };
    this.configs.set(full.id, full);
    this.states.set(full.id, {
      repo: full.repo, description: full.description, transport: full.transport, endpoint: full.endpoint,
      configured: true, required: full.required ?? false,
      status: "CONFIGURED", capabilities: full.capabilities ?? [],
      allRoles: full.permissions?.allowedRoles ?? [], denyTools: full.permissions?.denyTools ?? [],
      tools: [], resources: [], prompts: [], reachable: false, lastSeen: null, lastChecked: null,
      lastError: null, latencyMs: null,
    });
    this.persist();
    return { ok: true, id: full.id, state: this.get(full.id) };
  }

  public removeServer(id: string): boolean {
    const existed = this.configs.delete(id);
    this.states.delete(id);
    if (existed) this.persist();
    return existed;
  }

  public setEnabled(id: string, enabled: boolean): McpServerState | undefined {
    const cfg = this.configs.get(id);
    const st = this.states.get(id);
    if (!cfg || !st) return undefined;
    cfg.status = enabled ? "enabled" : "disabled";
    st.status = enabled ? (st.reachable ? "CONNECTED" : "CONFIGURED") : "DISABLED";
    this.persist();
    return this.get(id);
  }

  /** Return a stale connection attempt to the retryable configured state. */
  public markRetryable(id: string, error: string): McpServerState | undefined {
    const st = this.states.get(id);
    const cfg = this.configs.get(id);
    if (!st || !cfg || cfg.status === "disabled") return this.get(id);
    st.status = "CONFIGURED";
    st.reachable = false;
    st.lastError = error;
    st.lastChecked = new Date().toISOString();
    return this.get(id);
  }

  /** Health probe + optional full capability discovery. Failure-isolated. */
  public async checkHealth(id: string, discoverAll = true): Promise<McpServerState> {
    const cfg = this.configs.get(id);
    const st = this.states.get(id);
    if (!cfg || !st) throw new Error(`unknown MCP server: ${id}`);
    if (cfg.status === "disabled") {
      st.status = "DISABLED";
      st.lastChecked = new Date().toISOString();
      return this.get(id)!;
    }
    st.status = "CONNECTING";
    st.lastChecked = new Date().toISOString();
    if (discoverAll) {
      // Full capability discovery works for http, sse, and stdio transports
            const conn = await connectAndDiscover(
        cfg.endpoint,
        8000,
        cfg.transport === "stdio" ? { transport: "stdio", command: cfg.command!, args: cfg.args, cwd: cfg.cwd } : undefined,
      );
      if (conn.connected) {
        st.status = "CONNECTED";
        st.tools = conn.discovered.tools;
        st.resources = conn.discovered.resources;
        st.prompts = conn.discovered.prompts;
        st.reachable = true;
        st.lastError = null;
        st.lastSeen = new Date().toISOString();
        st.latencyMs = conn.latencyMs;
      } else {
        st.status = "CONFIGURED";
        st.reachable = false;
        st.lastError = conn.error ?? "discovery failed";
        st.latencyMs = conn.latencyMs;
      }
    } else {
      // Lightweight probing only for http/sse
            if (cfg.transport === "stdio") {
        st.reachable = ["CONNECTED", "ERROR"].includes(st.status);
      } else {
        const probe = await probeHttp(cfg.endpoint.replace(/\/mcp$/, ""), 3000);
        st.reachable = probe.reachable;
        st.latencyMs = probe.latencyMs;
        if (probe.reachable === false) {
          st.status = "CONFIGURED";
          st.lastError = probe.error ?? "unreachable";
        } else {
          st.status = probe.status >= 200 && probe.status < 500 ? "CONNECTED" : "CONFIGURED";
          st.lastSeen = new Date().toISOString();
          st.lastError = null;
        }
      }
    }
    return this.get(id)!;
  }
}

export const mcpRegistry = new McpRegistryService();
