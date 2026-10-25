// ASTRA AI — MCP TYPE DEFINITIONS
// Minimal JSON-RPC 2.0 message shapes for in-process Model Context Protocol.

export type MCPMethod = "initialize" | "ping" | "tools/list" | "tools/call";

export interface MCPRequest {
  id: string | number;
  jsonrpc: "2.0";
  method: MCPMethod | string;
  params?: Record<string, unknown>;
}

export interface MCPError {
  code: number;
  message: string;
  data?: unknown;
}

export interface MCPResponse {
  id: string | number;
  jsonrpc: "2.0";
  result?: unknown;
  error?: MCPError;
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
  readOrWrite?: string;
  riskLevel?: string;
}

export interface MCPCallContext {
  agentId?: string;
  userId?: string;
  role?: string;
  requestId?: string;
}

export interface MCPCallResult {
  ok: boolean;
  tool: string;
  server: string;
  data?: unknown;
  error?: string;
  latencyMs: number;
}