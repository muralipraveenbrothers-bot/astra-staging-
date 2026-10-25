// ASTRA AI — MCP SERVER BASE
// A domain MCP server that wraps existing ToolRegistry tools.
// Re-checks permissions at execution time — never trusts caller claims.

import { ToolRegistry } from "../agents/core/ToolRegistry";
import { PermissionRegistry } from "../agents/core/PermissionRegistry";
import type { HospitalRole } from "../agents/core/AgentDefinition";
import { db } from "../../server/db";
import type { MCPRequest, MCPResponse, MCPTool, MCPCallContext, MCPCallResult } from "./MCPTypes";

export interface MCPServerOptions {
  serverName: string;
  description: string;
  toolIds: string[];
}

export class MCPServer {
  readonly serverName: string;
  readonly description: string;
  private readonly toolIds: string[];

  constructor(options: MCPServerOptions) {
    this.serverName = options.serverName;
    this.description = options.description;
    this.toolIds = options.toolIds;
  }

  listTools(): MCPTool[] {
    const tools: MCPTool[] = [];
    for (const id of this.toolIds) {
      const tool = ToolRegistry.get(id);
      if (!tool) continue;
      tools.push({
        name: id,
        description: tool.description,
        inputSchema: tool.inputSchema,
        readOrWrite: tool.readOrWrite,
        riskLevel: tool.riskLevel,
      });
    }
    return tools;
  }

  async callTool(toolId: string, input: unknown, context: MCPCallContext = {}): Promise<MCPCallResult> {
    const started = Date.now();
    const fail = (error: string): MCPCallResult => ({
      ok: false,
      tool: toolId,
      server: this.serverName,
      error,
      latencyMs: Date.now() - started,
    });

    const tool = ToolRegistry.get(toolId);
    if (!tool) {
      return fail(`tool '${toolId}' not registered`);
    }
    if (!this.toolIds.includes(toolId)) {
      return fail(`tool '${toolId}' not exposed by server '${this.serverName}'`);
    }

    const role = (context.role ?? "SYSTEM") as HospitalRole;
    if (tool.requiredPermissions?.length) {
      for (const perm of tool.requiredPermissions) {
        if (!PermissionRegistry.hasPermission(role, perm)) {
          return fail(`role '${role}' lacks permission '${perm}'`);
        }
      }
    }

    try {
      const data = await ToolRegistry.execute(toolId, input ?? {}, {
        agentId: context.agentId,
        userId: context.userId,
      });
      if (tool.auditRequired) {
        db.logAudit({
          actorId: context.userId ?? "system",
          actorName: context.userId ?? "system",
          actorRole: role,
          action: `mcp:${this.serverName}:${toolId}`,
          category: "MCP",
          status: "SUCCESS",
          details: `MCP tool call via ${this.serverName}`,
        });
      }
      return { ok: true, tool: toolId, server: this.serverName, data, latencyMs: Date.now() - started };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return fail(message);
    }
  }

  async handleRequest(req: MCPRequest, context?: MCPCallContext): Promise<MCPResponse> {
    const respond = (result?: unknown, error?: { code: number; message: string }) => ({
      id: req.id,
      jsonrpc: "2.0" as const,
      ...(error ? { error } : { result }),
    });

    switch (req.method) {
      case "initialize":
        return respond({ protocolVersion: "2025-06-18", serverName: this.serverName, description: this.description, capabilities: { tools: {} } });
      case "ping":
        return respond({ ok: true, server: this.serverName });
      case "tools/list":
        return respond({ tools: this.listTools() });
      case "tools/call": {
        const toolId = req.params?.name as string | undefined;
        if (!toolId) return respond(undefined, { code: -32602, message: "missing tool name" });
        const result = await this.callTool(toolId, req.params?.arguments, context);
        return respond({ result: result.ok ? result.data : null, error: result.error });
      }
      default:
        return respond(undefined, { code: -32601, message: `method not found: ${req.method}` });
    }
  }
}