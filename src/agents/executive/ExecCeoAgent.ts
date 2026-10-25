/**
 * ASTRA AI — EXECUTIVE CEO AGENT (exec-ceo)
 * ============================================================================
 * Executive Intelligence Agent — Provides hospital-wide operational intelligence.
 * 
 * DOMAIN: operations, billing, staffing, performance, resource utilization
 * 
 * CONSTRAINTS:
 * - NO clinical signing authority
 * - NO prescription authority
 * - NO raw infrastructure shell access
 * - NO database admin access
 * - NO RBAC modification
 * - NO policy modification
 * - NO credential access
 * 
 * If clinical issue detected: escalate to hod-clinical-command
 */

import { AgentRecord, AgentLevel, RiskLevel, AgentStatus } from "../core/AgentDefinition";

export interface ExecutiveQuery {
  query: string;
  domain: "operations" | "billing" | "staffing" | "performance" | "resources" | "kpis";
  timeRange?: { from: string; to: string };
  department?: string;
}

export interface ExecutiveReport {
  success: boolean;
  domain: string;
  data: Record<string, unknown>;
  alerts: string[];
  recommendations: string[];
  timestamp: string;
}

export interface ExecutiveSnapshot {
  orders?: Array<{ department?: string; status?: string; amount?: number; dueAt?: string }>;
  bills?: Array<{ totalAmount?: number; paidAmount?: number }>;
  staff?: Array<{ department?: string; status?: string }>;
  alerts?: Array<{ severity?: string; status?: string }>;
}

const EXEC_CEO_DOMAINS = ["operations", "billing", "staffing", "performance", "resources", "kpis"];

export class ExecCeoAgent {
  private agentId = "exec-ceo";
  private version = "1.0.0";
  private status: "ACTIVE" | "INACTIVE" = "ACTIVE";

  getRecord(): AgentRecord {
    return {
      agentId: this.agentId,
      name: "Executive CEO Agent",
      version: this.version,
      level: "EXECUTIVE" as AgentLevel,
      parentAgent: null,
      domain: "Hospital Operations & Administration",
      role: "Executive intelligence for hospital operations, billing, staffing, performance",
      objective: "Provide hospital-wide operational intelligence without clinical authority",
      scope: "Operations, billing, staffing, performance, resource utilization, KPIs",
      constraints: [
        "NO clinical signing authority",
        "NO prescription authority",
        "NO raw infrastructure shell access",
        "NO database admin access",
        "NO RBAC modification",
        "NO policy modification",
        "NO credential access",
        "Clinical issues must be escalated to hod-clinical-command"
      ],
      permissions: ["read:operations", "read:billing", "read:staffing", "read:performance"],
      riskLevel: "IMPORTANT" as RiskLevel,
      perceptionSchema: {},
      capabilitySchema: { toolIds: ["generate_report", "list_alerts", "escalate_clinical"] },
      learningExamples: [],
      knowledgeSources: ["HospitalOperations", "BillingSystem", "StaffingData", "PerformanceMetrics"],
      memoryPolicy: "SESSION_STATE",
      modelPolicy: "FAST_LANGUAGE",
      verificationPolicy: "DATA_INTEGRITY_CHECK",
      outputSchema: {},
      status: this.status as AgentStatus,
      health: 100,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  async generateReport(query: ExecutiveQuery, snapshot: ExecutiveSnapshot = {}): Promise<ExecutiveReport> {
    if (!EXEC_CEO_DOMAINS.includes(query.domain)) {
      return {
        success: false,
        domain: query.domain,
        data: {},
        alerts: [`Domain "${query.domain}" is outside exec-ceo scope`],
        recommendations: ["Route to appropriate agent"],
        timestamp: new Date().toISOString()
      };
    }
    const orders = snapshot.orders ?? [];
    const bills = snapshot.bills ?? [];
    const staff = snapshot.staff ?? [];
    const alerts = snapshot.alerts ?? [];
    const outstanding = bills.reduce((sum, bill) => sum + Math.max(0, (bill.totalAmount ?? 0) - (bill.paidAmount ?? 0)), 0);
    const openOrders = orders.filter((order) => !["COMPLETED", "CANCELLED", "CLOSED"].includes(String(order.status))).length;
    const overdueOrders = orders.filter((order) => order.dueAt && new Date(order.dueAt).getTime() < Date.now() && !["COMPLETED", "CANCELLED", "CLOSED"].includes(String(order.status))).length;
    const activeStaff = staff.filter((member) => String(member.status ?? "active").toLowerCase() === "active").length;
    const criticalAlerts = alerts.filter((alert) => String(alert.status ?? "open").toLowerCase() === "open" && ["critical", "high"].includes(String(alert.severity ?? "").toLowerCase())).length;
    const data = { source: "authorized-operational-snapshot", orders: { total: orders.length, open: openOrders, overdue: overdueOrders }, billing: { bills: bills.length, outstanding }, staffing: { total: staff.length, active: activeStaff }, alerts: { openCritical: criticalAlerts } };
    const reportAlerts = [
      ...(overdueOrders ? [`${overdueOrders} overdue operational order(s) require owner follow-up`] : []),
      ...(outstanding ? [`Outstanding billing balance ₹${outstanding}`] : []),
      ...(criticalAlerts ? [`${criticalAlerts} open critical/high alert(s) require clinical escalation`] : []),
    ];
    return {
      success: true,
      domain: query.domain,
      data,
      alerts: reportAlerts,
      recommendations: reportAlerts.length ? ["Review the accountable owner and escalation path in the Command Center"] : ["No exception detected in the supplied snapshot"],
      timestamp: new Date().toISOString()
    };
  }

  escalateClinicalIssue(patientId: string, issue: string): { escalated: boolean; to: string } {
    return {
      escalated: true,
      to: "hod-clinical-command"
    };
  }
}

export const execCeoAgent = new ExecCeoAgent();
