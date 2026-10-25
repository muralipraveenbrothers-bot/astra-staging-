// ASTRA AI — MCP CLIENT
// Dispatches MCP requests to registered in-process servers with typed results.

import { MCPRegistry } from "./MCPRegistry";
import type { MCPCallContext, MCPCallResult, MCPTool, MCPRequest, MCPResponse } from "./MCPTypes";

export class MCPClientService {
  async callTool(serverName: string, toolId: string, input?: unknown, context: MCPCallContext = {}): Promise<MCPCallResult> {
    const server = MCPRegistry.get(serverName);
    if (!server) {
      return { ok: false, tool: toolId, server: serverName, error: `MCP server '${serverName}' not registered`, latencyMs: 0 };
    }
    return server.callTool(toolId, input, context);
  }

  listTools(serverName: string): MCPTool[] {
    const server = MCPRegistry.get(serverName);
    if (!server) return [];
    return server.listTools();
  }

  ping(serverName: string): boolean {
    const server = MCPRegistry.get(serverName);
    return server !== undefined;
  }

  async request(serverName: string, req: MCPRequest, context?: MCPCallContext): Promise<MCPResponse> {
    const server = MCPRegistry.get(serverName);
    if (!server) {
      return { id: req.id, jsonrpc: "2.0", error: { code: -32002, message: `MCP server '${serverName}' not registered` } };
    }
    return server.handleRequest(req, context);
  }
}

export const MCPClient = new MCPClientService();