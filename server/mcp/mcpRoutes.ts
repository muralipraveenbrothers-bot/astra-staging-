/**
 * ASTRA AI — MCP REST API (mounted under /api/mcp)
 * ============================================================================
 * Uses the existing Express + `authenticate` + `requireRole` conventions from
 * server/rbac.ts. High-risk tool calls require `approval: "APPROVED"` in the
 * body (documented policy §17). All operations are audit-logged and
 * failure-isolated.
 */
import type { Express, Request } from "express";
import { mcpRegistry } from "./mcpRegistry";
import { callMcpTool } from "./mcpClient";
import { gateMcpTool, mcpAudit, sanitizeMcpResult, type McpRisk } from "./mcpSecurity";
import type { UserSession } from "../types";

// `authenticate` (server/rbac.ts) attaches `req.user`, but Express's Request
// type does not declare it, so the direct cast was TS2352. Route through
// `unknown` to make the assertion explicit.
function who(req: Request): UserSession {
  return (req as unknown as { user: UserSession }).user;
}

/** Admin / CEO role gate for registry mutations. */
function isAdmin(u: UserSession): boolean {
  return u.role === "admin" || u.role === "ceo";
}

export function registerMcpRoutes(app: Express): void {
  // LIST servers
  app.get("/api/mcp/servers", (_req, res) => {
    res.json({ servers: mcpRegistry.listAll() });
  });

  // GET one server
  app.get("/api/mcp/servers/:id", (req, res) => {
    const s = mcpRegistry.get(req.params.id);
    if (!s) return res.status(404).json({ error: "UNKNOWN_MCP_SERVER", id: req.params.id });
    res.json({ server: s });
  });

  // ADD server (admin / ceo)
  app.post("/api/mcp/servers", (req, res) => {
    const u = who(req);
    if (!isAdmin(u)) return res.status(403).json({ error: "FORBIDDEN", message: "admin or ceo required" });
    const body = req.body ?? {};
    for (const k of ["id", "name", "repo", "endpoint"] as const) {
      if (!String(body[k] ?? "").trim()) {
        return res.status(400).json({ error: `MISSING_FIELD_${k.toUpperCase()}`, message: `${k} is required` });
      }
    }
    const result = mcpRegistry.addServer(body);
    if (!result.ok) return res.status(409).json(result);
    mcpAudit({
      actorId: u.userId, actorName: u.name, actorRole: u.role, actorIp: req.ip,
      serverId: result.id, operation: "create", capability: "registry", target: result.id,
      risk: "MEDIUM" as McpRisk, approvalState: "AUTO", status: "SUCCESS", durationMs: 0,
    });
    res.status(201).json(result.state);
  });

  // REMOVE server (admin / ceo)
  app.delete("/api/mcp/servers/:id", (req, res) => {
    const u = who(req);
    if (!isAdmin(u)) return res.status(403).json({ error: "FORBIDDEN", message: "admin or ceo required" });
    const removed = mcpRegistry.removeServer(req.params.id);
    if (!removed) return res.status(404).json({ error: "UNKNOWN", id: req.params.id });
    mcpAudit({
      actorId: u.userId, actorName: u.name, actorRole: u.role, actorIp: req.ip,
      serverId: req.params.id, operation: "remove", capability: "registry", target: req.params.id,
      risk: "HIGH" as McpRisk, approvalState: "AUTO", status: "SUCCESS", durationMs: 0,
    });
    res.json({ ok: true });
  });

  // ENABLE / DISABLE (admin / ceo)
  app.post("/api/mcp/servers/:id/enable", (req, res) => {
    const u = who(req);
    if (!isAdmin(u)) return res.status(403).json({ error: "FORBIDDEN", message: "admin or ceo required" });
    const s = mcpRegistry.setEnabled(req.params.id, true);
    if (!s) return res.status(404).json({ error: "UNKNOWN" });
    mcpAudit({
      actorId: u.userId, actorName: u.name, actorRole: u.role, actorIp: req.ip,
      serverId: req.params.id, operation: "enable", capability: "registry", target: req.params.id,
      risk: "LOW" as McpRisk, approvalState: "AUTO", status: "SUCCESS", durationMs: 0,
    });
    res.json({ server: s });
  });
  app.post("/api/mcp/servers/:id/disable", (req, res) => {
    const u = who(req);
    if (!isAdmin(u)) return res.status(403).json({ error: "FORBIDDEN", message: "admin or ceo required" });
    const s = mcpRegistry.setEnabled(req.params.id, false);
    if (!s) return res.status(404).json({ error: "UNKNOWN" });
    mcpAudit({
      actorId: u.userId, actorName: u.name, actorRole: u.role, actorIp: req.ip,
      serverId: req.params.id, operation: "disable", capability: "registry", target: req.params.id,
      risk: "MEDIUM" as McpRisk, approvalState: "AUTO", status: "SUCCESS", durationMs: 0,
    });
    res.json({ server: s });
  });

  // CONNECT (full capability discovery). Failure-isolated.
  app.post("/api/mcp/servers/:id/connect", async (req, res) => {
    try {
      const st = await mcpRegistry.checkHealth(req.params.id, true);
      res.json({ server: st });
    } catch (e) {
      res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  // HEALTH — lightweight reachability only.
  app.post("/api/mcp/servers/:id/health", async (req, res) => {
    try {
      const st = await mcpRegistry.checkHealth(req.params.id, false);
      res.json({ server: st });
    } catch (e) {
      res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  // CAPABILITIES (tools / resources / prompts)
  app.get("/api/mcp/servers/:id/capabilities", (req, res) => {
    const s = mcpRegistry.get(req.params.id);
    if (!s) return res.status(404).json({ error: "UNKNOWN" });
    res.json({ capabilities: s.capabilities, tools: s.tools, resources: s.resources, prompts: s.prompts });
  });

  // CALL TOOL (permission + risk + optional approval gate)
  app.post("/api/mcp/servers/:id/tools/:toolName", async (req, res) => {
    const serverId = req.params.id;
    const toolName = req.params.toolName;
    const cfg = mcpRegistry.getConfig(serverId);
    if (!cfg) return res.status(404).json({ error: "UNKNOWN" });
    const u = who(req);
    const args = (req.body?.arguments ?? {}) as Record<string, unknown>;
    const decision = gateMcpTool(cfg.permissions, u.role, toolName, args);
    if (!decision.allowed) {
      mcpAudit({
        actorId: u.userId, actorName: u.name, actorRole: u.role, actorIp: req.ip,
        serverId, operation: "call", capability: "tool", target: toolName,
        risk: decision.risk, approvalState: "DENIED", status: "DENIED",
        durationMs: 0, errorCode: "PERMISSION_DENIED",
      });
      return res.status(403).json({ ok: false, requiresApproval: false, risk: decision.risk, reason: decision.reason });
    }
    if (decision.requiresApproval) {
      const approved = req.body?.approval === "APPROVED";
      if (!approved) {
        mcpAudit({
          actorId: u.userId, actorName: u.name, actorRole: u.role, actorIp: req.ip,
          serverId, operation: "call", capability: "tool", target: toolName,
          risk: decision.risk, approvalState: "PENDING", status: "CONFIRMATION_REQUIRED",
          durationMs: 0, errorCode: "APPROVAL_REQUIRED",
        });
        return res.status(202).json({ ok: false, requiresApproval: true, risk: decision.risk, reason: decision.reason });
      }
    }
    const t0 = Date.now();
    try {
      const out = await callMcpTool(cfg.endpoint, toolName, args, 15000, {
      transport: cfg.transport as "http" | "stdio" | "sse" | undefined,
      command: (cfg as { command?: string }).command,
      args: (cfg as { args?: string[] }).args,
      cwd: (cfg as { cwd?: string }).cwd,
    });
      if (!out.ok) {
        mcpAudit({
          actorId: u.userId, actorName: u.name, actorRole: u.role, actorIp: req.ip,
          serverId, operation: "call", capability: "tool", target: toolName, risk: decision.risk,
          approvalState: "AUTO", status: "FAILED", durationMs: Date.now() - t0, errorCode: out.error,
        });
        res.status(502).json({ ok: false, error: out.error, latencyMs: out.latencyMs });
        return;
      }
      mcpAudit({
        actorId: u.userId, actorName: u.name, actorRole: u.role, actorIp: req.ip,
        serverId, operation: "call", capability: "tool", target: toolName, risk: decision.risk,
        approvalState: decision.requiresApproval ? "APPROVED" : "AUTO", status: "SUCCESS",
        durationMs: Date.now() - t0,
      });
      res.json({ ok: true, risk: decision.risk, result: sanitizeMcpResult(out.result) });
    } catch (e) {
      res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  // MCP audit pointer (admin / ceo) — entries live in the shared audit trail.
  app.get("/api/mcp/audit", (_req, res) => {
    res.json({ note: "MCP audit entries are written to the shared Astra audit trail (GET /api/audit/trail)." });
  });
}
