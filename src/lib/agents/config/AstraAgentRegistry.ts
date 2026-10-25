/**
 * ASTRA_AGENT_REGISTRY
 * Defines the logical structure and current state of the entire Astra Agent hierarchy.
 */

export type AgentLevel = 
  | "CORE" 
  | "EXECUTIVE" 
  | "HOD" 
  | "MANAGER" 
  | "SPECIALIST"
  | "CROSS_HOSPITAL";

export type AgentStatus = 
  | "ACTIVE" 
  | "IDLE" 
  | "DISABLED" 
  | "ERROR" 
  | "REQUIRES_CONFIG";

export interface AgentRecord {
  agent_id: string;
  name: string;
  level: AgentLevel;
  parent_agent: string | null;
  department: string;
  purpose: string;
  status: AgentStatus;
  version: string;
  last_run: string | null;
  last_failure: string | null;
  health: number; // 0-100
}

/**
 * In-memory representation of the initial Agent Registry.
 * In a real production system, this would be loaded from a config database.
 */
export const ASTRA_AGENT_REGISTRY: Record<string, AgentRecord> = {
  // CORE AGENTS
  "core-command": {
    agent_id: "core-command",
    name: "ASTRA Command Core",
    level: "CORE",
    parent_agent: null,
    department: "SYSTEM",
    purpose: "Hospital action entry layer, RBAC enforcement, and command execution.",
    status: "ACTIVE",
    version: "1.0.0",
    last_run: null,
    last_failure: null,
    health: 100
  },
  "core-hermes": {
    agent_id: "core-hermes",
    name: "Hermes Brain",
    level: "CORE",
    parent_agent: null,
    department: "SYSTEM",
    purpose: "Central Clinical Intelligence and supervisory agent.",
    status: "ACTIVE",
    version: "1.0.0",
    last_run: null,
    last_failure: null,
    health: 100
  },
  "core-langgraph": {
    agent_id: "core-langgraph",
    name: "LangGraph Orchestration",
    level: "CORE",
    parent_agent: null,
    department: "SYSTEM",
    purpose: "Authoritative workflow and orchestration engine.",
    status: "ACTIVE",
    version: "1.0.0",
    last_run: null,
    last_failure: null,
    health: 100
  },
  "core-knowledge": {
    agent_id: "core-knowledge",
    name: "Knowledge Governor",
    level: "CORE",
    parent_agent: null,
    department: "SYSTEM",
    purpose: "Controls Medical RAG, retrieval, and evidence conflict resolution.",
    status: "ACTIVE",
    version: "1.0.0",
    last_run: null,
    last_failure: null,
    health: 100
  },
  "core-safety": {
    agent_id: "core-safety",
    name: "Safety Governor",
    level: "CORE",
    parent_agent: null,
    department: "SYSTEM",
    purpose: "Controls wrong-patient protection, high-risk actions, and emergency escalation.",
    status: "ACTIVE",
    version: "1.0.0",
    last_run: null,
    last_failure: null,
    health: 100
  },
  "core-memory": {
    agent_id: "core-memory",
    name: "Memory & Learning Governor",
    level: "CORE",
    parent_agent: null,
    department: "SYSTEM",
    purpose: "Controls conversation memory, session memory, and approved learning.",
    status: "ACTIVE",
    version: "1.0.0",
    last_run: null,
    last_failure: null,
    health: 100
  },
  "core-model-router": {
    agent_id: "core-model-router",
    name: "Model Router",
    level: "CORE",
    parent_agent: null,
    department: "SYSTEM",
    purpose: "Selects the most appropriate model based on task, complexity, and latency.",
    status: "ACTIVE",
    version: "1.0.0",
    last_run: null,
    last_failure: null,
    health: 100
  },
  
  // EXECUTIVE AGENTS (Configured and Active)
  "exec-ceo": {
    agent_id: "exec-ceo",
    name: "CEO AI",
    level: "EXECUTIVE",
    parent_agent: null,
    department: "EXECUTIVE",
    purpose: "Provides hospital-wide executive intelligence (operations, billing, staffing, performance). NO clinical authority.",
    status: "ACTIVE",
    version: "1.0.0",
    last_run: null,
    last_failure: null,
    health: 100
  },

  // HOD AGENTS (Configured and Active)
  "hod-clinical-command": {
    agent_id: "hod-clinical-command",
    name: "Clinical Command HOD",
    level: "HOD",
    parent_agent: "hermes_brain",
    department: "CLINICAL",
    purpose: "Clinical orchestration with minimal agent activation policy. Routes to specialists based on intent.",
    status: "ACTIVE",
    version: "1.0.0",
    last_run: null,
    last_failure: null,
    health: 100
  },
};

export function getAgent(agentId: string): AgentRecord | undefined {
  return ASTRA_AGENT_REGISTRY[agentId];
}

export function listActiveAgents(): AgentRecord[] {
  return Object.values(ASTRA_AGENT_REGISTRY).filter(a => a.status === "ACTIVE");
}
