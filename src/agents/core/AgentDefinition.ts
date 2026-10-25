/**
 * ASTRA AI — AGENT DEFINITIONS & CORE TYPES
 * ============================================================================
 * Canonical schema definitions for agents, tools, permissions, execution contexts,
 * risk classifications, and verification protocols.
 */

export type AgentLevel =
  | "CORE"
  | "EXECUTIVE"
  | "CTO"
  | "HOD"
  | "MANAGER"
  | "ASSOCIATE"
  | "SPECIALIST"
  | "WORKER";

export type AgentStatus =
  | "ACTIVE"
  | "IDLE"
  | "DISABLED"
  | "ERROR"
  | "REQUIRES_CONFIG";

export type RiskLevel =
  | "INFO"          // Read-only queries, census, status lookups
  | "REVERSIBLE"    // Internal tasks, draft notes, queue filters
  | "IMPORTANT"     // Standard lab/radiology orders, routine prescriptions
  | "HIGH_RISK"     // Dangerous drugs, blood products, surgeries, discharges, financial mutations
  | "CRITICAL";     // RBAC/security gatekeepers whose bypass would compromise the hospital OS

export type AstraRiskClass =
  | "R0" // READ
  | "R1" // DRAFT
  | "R2" // REVERSIBLE_WRITE
  | "R3" // CONSEQUENTIAL_WRITE
  | "R4"; // CRITICAL

export type AstraPrivacyClass = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "PHI" | "HIGH_RISK_CLINICAL";

export type HospitalRole =
  | "DOCTOR"
  | "NURSE"
  | "RECEPTION"
  | "PHARMACIST"
  | "LAB_TECH"
  | "RADIOLOGIST"
  | "OT_STAFF"
  | "BILLING"
  | "INSURANCE"
  | "MANAGEMENT"
  | "CEO"
  | "ADMIN"
  | "SYSTEM";

export interface AgentRecord {
  agentId: string;
  name: string;
  version: string;
  level: AgentLevel;
  parentAgent: string | null;
  domain: string;
  role: string;
  objective: string;
  scope: string;
  constraints: string[];
  permissions: string[];
  riskLevel: RiskLevel;
  perceptionSchema: Record<string, any>;
  capabilitySchema: { toolIds: string[] };
  learningExamples: string[];
  knowledgeSources: string[];
  memoryPolicy: string;
  modelPolicy: string;
  verificationPolicy: string;
  outputSchema: Record<string, any>;
  status: AgentStatus;
  health: number; // 0 - 100
  createdAt: string;
  updatedAt: string;
}

export interface ToolDefinition {
  toolId: string;
  id?: string;
  name: string;
  primaryDuty?: string;
  description: string;
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
  readOrWrite: "READ" | "WRITE";
  riskLevel: RiskLevel;
  riskClass?: AstraRiskClass;
  allowedRoles?: string[];
  privacyClasses?: AstraPrivacyClass[];
  timeout?: number;
  retryPolicy?: { maxRetries: number; backoffMs: number } | string;
  healthCheck?: () => Promise<boolean> | boolean;
  requiredPermissions: string[];
  patientScope: boolean;
  departmentScope?: string;
  confirmationRequired: boolean;
  auditRequired: boolean;
  mcpServerId?: string;
  endpoint?: string;
  fallbackToolId?: string;
  latencyMs: number;
  healthStatus: "HEALTHY" | "DEGRADED" | "OFFLINE";
  execute: (input: any, context?: any) => Promise<any>;
}

export interface UserContext {
  userId: string;
  name: string;
  role: HospitalRole;
  department: string;
  permissions: string[];
  sessionId: string;
  ipAddress?: string;
}

/**
 * AgentCapability — a named capability an agent can perform.
 * Used by specialist agents to declare their functional scope.
 */
export type AgentCapability = string;

/**
 * AgentDefinition — the canonical registration schema for an agent.
 * Used by specialist agents (Mitra, Pragnya, etc.) to self-describe
 * their identity, capabilities, permissions, and execution policy.
 */
export interface AgentDefinition {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  capabilities: AgentCapability[];
  requiredPermissions: string[];
  maxConcurrentExecutions: number;
  timeoutMs: number;
  retryPolicy: {
    maxRetries: number;
    backoffMs: number;
  };
  status: AgentStatus;
}
