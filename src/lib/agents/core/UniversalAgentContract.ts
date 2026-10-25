/**
 * UNIVERSAL AGENT CONTRACT
 * The mandatory 6-layer protocol and 21-property AgentDefinition schema for every ASTRA AI Agent.
 */

// 1. CANONICAL AGENT DEFINITION
export interface AstraAgentDefinition {
  agent_id: string;
  name: string;
  version: string;
  domain: string;
  parent_agent: string | null;
  role: string;
  objective: string;
  scope: string;
  constraints: string[];
  permissions: string[];
  risk_level: "LOW" | "IMPORTANT" | "HIGH_RISK" | "CLINICAL";
  perception_schema: string[];
  capability_schema: string[]; // Tool IDs
  learning_examples: any[];
  knowledge_sources: string[];
  memory_policy: string[];
  model_policy: string[];
  verification_policy: string[];
  output_schema: string;
  enabled: boolean;
  health_status: "ONLINE" | "DEGRADED" | "OFFLINE" | "ERROR";
}

// 2. OBJECTIVE LAYER RESOLUTION (from IntentResolver)
export interface AstraObjective {
  raw_request: string;
  normalized_request: string;
  intent: string;
  entities: Record<string, string>;
  patient_reference?: string;
  department?: string;
  requested_output?: string;
  risk_level: "LOW" | "IMPORTANT" | "HIGH_RISK" | "CLINICAL";
  confidence: number;
}

// 3. PERCEPTION LAYER
export interface AstraPerception {
  patient?: any;       // demographics, history, vitals, etc.
  hospital?: any;      // census, beds, queues
  ward?: any;          // bed status, nursing tasks
  radiology?: any;     // DICOM, reports
  pharmacy?: any;      // inventory, prescriptions
  reception?: any;     // tokens, registration
  voice?: any;         // audio streams, transcripts
  image?: any;         // clinical images, modalities
}

// 4. CAPABILITY LAYER
export interface AstraCapability {
  availableTools: string[];
  executeTool(toolId: string, args: any, auditContext: any): Promise<any>;
}

// 5. LEARNING LAYER
export interface AstraLearning {
  recordFeedback(request_id: string, success: boolean, correction?: string): void;
  getRelevantExamples(intent: string): string[];
}

// 6. KNOWLEDGE LAYER
export interface AstraKnowledge {
  retrieveEvidence(query: string, scope: string[]): Promise<any[]>;
  verifyEvidence(claim: string, evidence: any[]): boolean;
}

// THE UNIVERSAL AGENT INTERFACE
export interface IAstraAgent {
  definition: AstraAgentDefinition;
  
  // Execution lifecycle
  execute(objective: AstraObjective, perception: AstraPerception): Promise<AstraExecutionResult>;
}

// Execution State & Result
export type ExecutionState = 
  | "QUEUED" 
  | "PLANNING" 
  | "RUNNING" 
  | "WAITING_TOOL" 
  | "WAITING_APPROVAL" 
  | "VERIFYING" 
  | "COMPLETED" 
  | "FAILED" 
  | "CANCELLED" 
  | "ESCALATED";

export interface AstraExecutionResult {
  request_id: string;
  trace_id: string;
  session_id: string;
  final_status: ExecutionState;
  findings: any;
  actions_taken: any[];
  warnings: string[];
  missing_information: string[];
  next_step: string | null;
  audit_metadata: any;
}
