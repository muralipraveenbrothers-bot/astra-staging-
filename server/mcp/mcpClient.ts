/**
 * ASTRA AI — MCP CLIENT
 * ============================================================================
 * Wraps the official @modelcontextprotocol/sdk (StreamableHTTPClientTransport).
 * Connects to configured MCP servers, negotiates capabilities, discovers and
 * exposes tools/resources/prompts, and executes calls. Every operation is
 * failure-isolated: an optional MCP server that is down must never crash Astra.
 *
 * Because medical MCP servers are NOT assumed to be running, a lightweight HTTP
 * probe (probeHttp) is used for honest health status even when a full handshake
 * is unavailable.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import fs from "fs";

export interface McpTransportConfig {
  transport?: string;
  command?: string;
  args?: string[];
  cwd?: string;
}

/**
 * Resolve stdio config paths against the Astra repo root so that a config like
 * { command: "node", args: ["modules/x/dist/index.js"], cwd: "modules/x" } works
 * regardless of which directory the spawned process uses as cwd.
 */
function resolveStdioConfig(config: McpTransportConfig): { command: string; args: string[]; cwd: string } {
  const root = process.cwd();
  const cwd = config.cwd ? path.resolve(root, config.cwd) : root;
  let command = config.command ?? "";
  if (command && !path.isAbsolute(command)) {
    const abs = path.resolve(root, command);
    if (fs.existsSync(abs)) command = abs;
  }
  const args = (config.args ?? []).map((a) => {
    if (a.startsWith("--") || a.startsWith("-") || !a.includes("/") || !a.includes("\\")) {
      // flag or plain token — but still try resolving path-like tokens
      if (!a.startsWith("-")) {
        const abs = path.resolve(root, a);
        if (fs.existsSync(abs)) return abs;
      }
      return a;
    }
    const abs = path.resolve(root, a);
    return fs.existsSync(abs) ? abs : a;
  });
  return { command, args, cwd };
}


export interface McpDiscoveredCapabilities {
  tools: Array<{ name: string; description?: string; inputSchema?: unknown }>;
  resources: Array<{ uri: string; name?: string; description?: string }>;
  prompts: Array<{ name: string; description?: string }>;
}

export interface McpConnectionResult {
  connected: boolean;
  discovered: McpDiscoveredCapabilities;
  error?: string;
  latencyMs: number;
}

const EMPTY: McpDiscoveredCapabilities = { tools: [], resources: [], prompts: [] };

async function settledWithTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<PromiseSettledResult<T>> {
  return Promise.allSettled([
    Promise.race([
      operation,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("MCP capability discovery timeout")), timeoutMs),
      ),
    ]),
  ]).then(([result]) => result);
}

/** Minimal TCP/HTTP probe for honest reachability without a full MCP handshake. */
export async function probeHttp(url: string, timeoutMs = 2500): Promise<{ reachable: boolean; status: number; latencyMs: number; error?: string }> {
  const t0 = Date.now();
  const target = url.endsWith("/mcp") || url.includes("/v1") ? url : url;
  try {
    const res = await fetch(target, { method: "GET", signal: AbortSignal.timeout(timeoutMs) });
    return { reachable: true, status: res.status, latencyMs: Date.now() - t0 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      reachable: false,
      status: 0,
      latencyMs: Date.now() - t0,
      error: msg.includes("abort") || msg.includes("Timeout") ? "timeout" : "connection refused",
    };
  }
}

/**
 * Establish a full MCP session against an MCP server and discover its
 * capabilities. Supports http, stdio, and sse transports.
 * Failure-isolated: returns a disconnected result, never throws.
 */
export async function connectAndDiscover(
  endpoint: string,
  timeoutMs = 8000,
  config?: { transport?: string; command?: string; args?: string[]; cwd?: string },
): Promise<McpConnectionResult> {
  const t0 = Date.now();
  const client = new Client({ name: "astra-mcp", version: "1.0.0" });

    let transport: unknown;

  // stdio transport
  if (config?.transport === "stdio" && config.command) {
    const resolved = resolveStdioConfig(config);
    transport = new StdioClientTransport({
      command: resolved.command,
      args: resolved.args,
      cwd: resolved.cwd,
    });
  } else {
    // http/streamable-http/sse transport
    transport = new StreamableHTTPClientTransport(new URL(endpoint));
  }

  try {
    await Promise.race([
      client.connect(transport as any),
      new Promise((_, rej) => setTimeout(() => rej(new Error("MCP connect timeout")), timeoutMs)),
    ]);
    const [toolsRes, resourcesRes, promptsRes] = await Promise.all([
      settledWithTimeout(client.listTools(), timeoutMs),
      settledWithTimeout(client.listResources(), timeoutMs),
      settledWithTimeout(client.listPrompts(), timeoutMs),
    ]);
    const tools = toolsRes.status === "fulfilled" ? (toolsRes.value.tools ?? []).map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) : [];
    const resources = resourcesRes.status === "fulfilled" ? (resourcesRes.value.resources ?? []).map((r) => ({ uri: r.uri, name: r.name, description: r.description })) : [];
    const prompts = promptsRes.status === "fulfilled" ? (promptsRes.value.prompts ?? []).map((p) => ({ name: p.name, description: p.description })) : [];
    const discovered = { tools, resources, prompts };
    try {
      await client.close();
    } catch {
      /* ignore */
    }
    return { connected: true, discovered, latencyMs: Date.now() - t0 };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    try {
      await client.close();
    } catch {
      /* ignore */
    }
    return { connected: false, discovered: EMPTY, error: err, latencyMs: Date.now() - t0 };
  }
}

/** Call a single MCP tool on a fresh session. Supports http + stdio transports. Returns a structured result. */
export async function callMcpTool(
  endpoint: string,
  toolName: string,
  args: Record<string, unknown>,
  timeoutMs = 15000,
  config?: { transport?: string; command?: string; args?: string[]; cwd?: string },
): Promise<{ ok: boolean; result?: unknown; error?: string; latencyMs: number }> {
  const t0 = Date.now();
  const client = new Client({ name: "astra-mcp", version: "1.0.0" });

    let transport: unknown;
  if (config?.transport === "stdio" && config.command) {
    const resolved = resolveStdioConfig(config);
    transport = new StdioClientTransport({
      command: resolved.command,
      args: resolved.args,
      cwd: resolved.cwd,
    });
  } else {
    transport = new StreamableHTTPClientTransport(new URL(endpoint));
  }

  try {
    await Promise.race([
      client.connect(transport as any),
      new Promise((_, rej) => setTimeout(() => rej(new Error("MCP connect timeout")), timeoutMs)),
    ]);
    const result = await client.callTool({ name: toolName, arguments: args });
    const content = Array.isArray(result.content)
      ? result.content.map((c) => (c && typeof c === "object" && "text" in c ? (c as { text: string }).text : c)).join("\n")
      : result.content;
    let parsed: unknown = content;
    try {
      parsed = JSON.parse(content as string);
    } catch {
      /* keep raw text */
    }
    try {
      await client.close();
    } catch {
      /* ignore */
    }
    return { ok: !result.isError, result: parsed, latencyMs: Date.now() - t0 };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    try {
      await client.close();
    } catch {
      /* ignore */
    }
    return { ok: false, error: err, latencyMs: Date.now() - t0 };
  }
}