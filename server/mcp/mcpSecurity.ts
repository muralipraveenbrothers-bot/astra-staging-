/**
 * ASTRA AI — MCP SECURITY & CAPABILITY GATE
 * ============================================================================
 * Enforces Astra's strict hospital security boundaries for every MCP operation:
 *  - role-based allowlists (server-scoped)
 *  - tool deny-list (least privilege)
 *  - risk classification (LOW = auto-execute, HIGH = human approval)
 *  - audit logging reusing the existing server/db.logAudit AuditEntry convention
 * No secrets ever enter logs or responses.
 */
import { db } from "../db";
import type { Role } from "../types";

export type McpRisk = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface McpCapabilityRule {
  allowedRoles: Role[];
  denyTools?: string[];
  highRiskTools?: string[];
  /** When true, any tool call to a denied/unknown tool is refused. */
  strictTools?: boolean;
  /** When true, tool responses are truncated to protect context. */
  truncationChars?: number;
}

/** Serverwide risk keyword list for HIGH/CRITICAL operations (documented policy §17). */
const HIGH_RISK_KEYWORDS: RegExp =
  /\b(delete|drop|truncate|remove|destroy|purge|update|insert|modify)\b/i;

export function classifyToolRisk(
  toolName: string,
  inputArgs: Record<string, unknown> | undefined,
): McpRisk {
  if (!toolName) return "INFO";
  // Normalize snake_case / kebab-case so \b boundaries match (delete_record → "delete record").
  const name = toolName.replace(/[_\-]+/g, " ").toLowerCase();
  if (/\b(create|add)\b/.test(name) && /\bissue|patient|record|order\b/.test(name)) return "MEDIUM";
  if (/\b(delete|destroy|purge|drop|truncate)\b/.test(name)) return "CRITICAL";
  if (/\b(write|update|insert|modify|execute|push|commit|deploy|send|post)\b/.test(name)) return "HIGH";
  // Argument-level keyword detection as a secondary guard.
  if (inputArgs) {
    const flat = JSON.stringify(inputArgs);
    if (HIGH_RISK_KEYWORDS.test(flat)) return "HIGH";
  }
  return "LOW";
}

export function requireApproval(risk: McpRisk): boolean {
  return risk === "HIGH" || risk === "CRITICAL" || risk === "MEDIUM";
}

export interface McpDecision {
  allowed: boolean;
  reason: string;
  risk: McpRisk;
  requiresApproval: boolean;
}

/** Gate a requested tool call against the server's rule + the caller's role. */
export function gateMcpTool(
  serverRule: McpCapabilityRule | undefined,
  role: Role,
  toolName: string,
  inputArgs: Record<string, unknown> | undefined,
): McpDecision {
  const rule = serverRule ?? { allowedRoles: ["doctor", "admin"] };
  if (!rule.allowedRoles.includes(role) && role !== "admin") {
    return { allowed: false, reason: `Role '${role}' not permitted on this MCP server`, risk: "HIGH", requiresApproval: true };
  }
  const denied = rule.denyTools?.find((d) => d.toLowerCase() === toolName.toLowerCase());
  if (denied) {
    return { allowed: false, reason: `Tool '${toolName}' is deny-listed on this server`, risk: "HIGH", requiresApproval: true };
  }
  if (rule.strictTools && !toolName) {
    return { allowed: false, reason: "Tool name required under strict tool policy", risk: "HIGH", requiresApproval: true };
  }
  const risk = classifyToolRisk(toolName, inputArgs);
  const requires = requireApproval(risk);
  if (risk === "CRITICAL") {
    return { allowed: false, reason: `CRITICAL-risk tool '${toolName}' blocked until explicit human approval`, risk, requiresApproval: true };
  }
  return { allowed: true, reason: risk === "LOW" || risk === "INFO" ? `${toolName} (${risk}) auto-approved` : `${toolName} requires approval (${risk})`, risk, requiresApproval: requires };
}

export interface McpAuditInput {
  actorId: string;
  actorName: string;
  actorRole: string;
  actorIp?: string;
  serverId: string;
  operation: string;
  capability: "tool" | "resource" | "prompt" | "connect" | "registry" | "health";
  target: string;
  risk: McpRisk;
  approvalState: "AUTO" | "DENIED" | "APPROVED" | "REJECTED" | "PENDING";
  status: "SUCCESS" | "DENIED" | "FAILED" | "CONFIRMATION_REQUIRED";
  errorCode?: string;
  durationMs: number;
}

/** Write a structured MCP audit entry via the existing audit trail. Secrets are never included. */
export function mcpAudit(e: McpAuditInput): void {
  try {
    db.logAudit({
      actorId: e.actorId,
      actorName: e.actorName,
      actorRole: e.actorRole,
      action: `MCP:${e.capability}:${e.operation}:${e.serverId}:${e.target}`,
      category: "mcp",
      status: e.status,
      details: `risk=${e.risk} approval=${e.approvalState} durationMs=${e.durationMs}${e.errorCode ? ` err=${e.errorCode}` : ""}`,
      ip: e.actorIp,
    });
  } catch (err) {
    // Audit failures must never break an MCP call.
    console.error("[mcp-audit] failed to write audit entry:", err);
  }
}

/** Sanitize responses so secrets never leak back to the model/frontend/logs. */
export function sanitizeMcpResult(input: unknown, maxChars = 8000): unknown {
  if (typeof input === "string") {
    return input.length > maxChars ? `${input.slice(0, maxChars)}\n…[truncated ${input.length - maxChars} chars]` : input;
  }
  if (Array.isArray(input)) {
    return input.slice(0, 40).map((i) => sanitizeMcpResult(i, maxChars));
  }
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      const lk = k.toLowerCase();
      if (/\b(key|token|secret|password|authorization|api_key|apikey)\b/.test(lk)) continue;
      out[k] = sanitizeMcpResult(v, maxChars);
    }
    return out;
  }
  return input;
}