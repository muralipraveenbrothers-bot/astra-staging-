/**
 * ASTRA_MATRICES
 * Defines the strict boundaries for all agents within the Astra AI hierarchy.
 */

import { AgentRecord } from "./AstraAgentRegistry";

export type PermissionScope = 
  | "READ_PATIENT_BASIC"
  | "READ_PATIENT_CLINICAL"
  | "WRITE_PATIENT_NOTES"
  | "ORDER_LABS"
  | "ORDER_RADIOLOGY"
  | "DISPENSE_MEDS"
  | "READ_HOSPITAL_CENSUS"
  | "READ_FINANCE";

export type ToolID = 
  | "search_patient" 
  | "get_hospital_census" 
  | "create_lab_order" 
  | "analyze_image";

export interface AgentMatrix {
  permissions: PermissionScope[];
  tools: ToolID[];
  knowledge_scope: string[];
  memory_scope: string[];
  models: string[];
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export const ASTRA_AGENT_MATRICES: Record<string, AgentMatrix> = {
  "core-command": {
    permissions: ["READ_PATIENT_BASIC", "READ_HOSPITAL_CENSUS"],
    tools: ["search_patient", "get_hospital_census"],
    knowledge_scope: ["system-ops", "hospital-directory"],
    memory_scope: ["session"],
    models: ["local-fast"],
    risk_level: "LOW"
  },
  "core-hermes": {
    permissions: ["READ_PATIENT_BASIC", "READ_PATIENT_CLINICAL", "WRITE_PATIENT_NOTES"],
    tools: ["search_patient"],
    knowledge_scope: ["internal-medicine", "surgery", "emergency", "pharmacology"],
    memory_scope: ["patient-longitudinal", "session"],
    models: ["frontier-medical"],
    risk_level: "HIGH"
  },
  "core-langgraph": {
    permissions: [],
    tools: [],
    knowledge_scope: [],
    memory_scope: ["workflow-state"],
    models: ["local-fast"],
    risk_level: "LOW"
  },
  "core-model-router": {
    permissions: [],
    tools: [],
    knowledge_scope: [],
    memory_scope: [],
    models: ["local-fast"],
    risk_level: "LOW"
  },
  // Placeholders for other core agents
  "core-knowledge": {
    permissions: [],
    tools: [],
    knowledge_scope: ["pubmed", "guidelines", "hospital-protocols"],
    memory_scope: ["knowledge-cache"],
    models: ["embedding", "local-fast"],
    risk_level: "LOW"
  },
  "core-safety": {
    permissions: ["READ_PATIENT_CLINICAL"],
    tools: [],
    knowledge_scope: ["medication-safety", "allergies", "contraindications"],
    memory_scope: [],
    models: ["frontier-medical"],
    risk_level: "CRITICAL"
  },
  "core-memory": {
    permissions: [],
    tools: [],
    knowledge_scope: [],
    memory_scope: ["system-memory", "doctor-memory", "patient-memory"],
    models: ["local-fast"],
    risk_level: "LOW"
  },
};

export function getAgentMatrix(agentId: string): AgentMatrix | undefined {
  return ASTRA_AGENT_MATRICES[agentId];
}
