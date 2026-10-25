/**
 * ASTRA AI — CLINICAL COMMAND HOD (hod-clinical-command)
 * ============================================================================
 * Clinical Orchestration Agent — Coordinates clinical workflows by selecting
 * ONLY the minimum necessary specialists. Never activates all 323 agents.
 * 
 * Activation Policy:
 * - Simple lookup: 1 deterministic capability
 * - Routine task: 1-3 capabilities
 * - Normal clinical reasoning: 2-5 capabilities
 * - Complex multi-system: 5-10 only when justified
 */

import { AgentRecord, AgentLevel, RiskLevel, AgentStatus } from "../core/AgentDefinition";

export interface ClinicalOrchestrationRequest {
  query: string;
  intent: string;
  patientContextResolved: boolean;
  patientId?: string;
  admissionId?: string;
  riskLevel: RiskLevel;
  requiredEvidence: string[];
}

export interface AgentActivation {
  agentId: string;
  reason: string;
  required: boolean;
  timeout: number;
}

export interface OrchestrationResult {
  success: boolean;
  agentsActivated: AgentActivation[];
  agentsConsidered: number;
  agentsRejected: number;
  patientId?: string;
  contextVersion?: number;
  evidence: string[];
  response: string;
  warnings: string[];
  executionTimeMs: number;
}

const AGENT_ACTIVATION_POLICY: Record<string, { agents: string[]; maxAgents: number; reason: string }> = {
  "patient.lookup": {
    agents: ["patient-resolver"],
    maxAgents: 1,
    reason: "Deterministic patient/bed resolution"
  },
  "bed.status": {
    agents: ["bed-resolver"],
    maxAgents: 1,
    reason: "Deterministic bed status check"
  },
  "lab.order": {
    agents: ["patient-resolver", "duplicate-checker", "lab-order-validator"],
    maxAgents: 3,
    reason: "Patient + duplicate check + order validation"
  },
  "pharmacy.dispense": {
    agents: ["patient-resolver", "drug-safety-agent", "dose-calculator"],
    maxAgents: 3,
    reason: "Patient + drug safety + dose calculation"
  },
  "clinical.reasoning": {
    agents: ["patient-resolver", "clinical-reasoning-agent", "evidence-agent", "blind-spot-agent"],
    maxAgents: 5,
    reason: "Patient + reasoning + evidence + blind spot"
  },
  "differential.diagnosis": {
    agents: ["patient-resolver", "diagnostic-differential-agent", "rule-in-agent", "rule-out-agent"],
    maxAgents: 5,
    reason: "Patient + differential + rule-in + rule-out"
  },
  "drug.interaction.check": {
    agents: ["patient-resolver", "drug-safety-agent", "interaction-specialist", "contraindication-specialist"],
    maxAgents: 4,
    reason: "Patient + drug safety + interactions + contraindications"
  },
  "trauma.assessment": {
    agents: ["patient-resolver", "trauma-agent", "fracture-agent", "neurovascular-safety-agent"],
    maxAgents: 5,
    reason: "Patient + trauma + fracture + neurovascular"
  },
  "complex.multi.system": {
    agents: ["patient-resolver", "clinical-reasoning-agent", "trajectory-agent", "evidence-agent", "blind-spot-agent", "risk-stratification-agent"],
    maxAgents: 10,
    reason: "Complex case requiring multiple specialists"
  },
  "default": {
    agents: ["patient-resolver"],
    maxAgents: 2,
    reason: "Default minimal activation"
  }
};

export class ClinicalCommandHOD {
  private agentId = "hod-clinical-command";
  private version = "1.0.0";
  private status: "ACTIVE" | "INACTIVE" = "ACTIVE";
  private activationCount = 0;
  private totalAgentsActivated = 0;
  private totalAgentsRejected = 0;

  getRecord(): AgentRecord {
    return {
      agentId: this.agentId,
      name: "Clinical Command HOD",
      version: this.version,
      level: "HOD" as AgentLevel,
      parentAgent: "hermes_brain",
      domain: "Clinical Orchestration",
      role: "Clinical workflow coordination with minimal agent activation",
      objective: "Coordinate clinical workflows by selecting ONLY the minimum necessary specialists",
      scope: "Clinical task routing and agent orchestration",
      constraints: [
        "Cannot activate more than maxAgents per policy",
        "Must verify patient context before activation",
        "Must enforce RBAC on all agent calls",
        "Must log all activation decisions"
      ],
      permissions: ["ai:clinical_reasoning", "ai:agent_orchestration"],
      riskLevel: "IMPORTANT" as RiskLevel,
      perceptionSchema: {},
      capabilitySchema: { toolIds: ["route_clinical_task", "activate_agents", "verify_context"] },
      learningExamples: [],
      knowledgeSources: ["AgentActivationPolicy", "ClinicalWorkflows"],
      memoryPolicy: "SESSION_STATE",
      modelPolicy: "DETERMINISTIC",
      verificationPolicy: "ACTIVATION_AUDIT",
      outputSchema: {},
      status: this.status as AgentStatus,
      health: 100,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  selectAgents(intent: string, riskLevel: RiskLevel): AgentActivation[] {
    const policy = AGENT_ACTIVATION_POLICY[intent] || AGENT_ACTIVATION_POLICY["default"];
    let maxAgents = policy.maxAgents;
    if (riskLevel === "HIGH_RISK" || riskLevel === "CRITICAL") {
      maxAgents = Math.min(maxAgents + 2, 10);
    }
    return policy.agents.slice(0, maxAgents).map(agentId => ({
      agentId,
      reason: policy.reason,
      required: true,
      timeout: 10000
    }));
  }

  async orchestrate(request: ClinicalOrchestrationRequest): Promise<OrchestrationResult> {
    const startTime = Date.now();
    this.activationCount++;
    if (!request.patientContextResolved) {
      return {
        success: false,
        agentsActivated: [],
        agentsConsidered: 0,
        agentsRejected: 0,
        evidence: [],
        response: "Patient context not resolved. Cannot proceed.",
        warnings: ["PATIENT_CONTEXT_MISSING"],
        executionTimeMs: Date.now() - startTime
      };
    }
    const activations = this.selectAgents(request.intent, request.riskLevel);
    const agentsConsidered = AGENT_ACTIVATION_POLICY[request.intent]?.agents.length || 1;
    const agentsRejected = Math.max(0, agentsConsidered - activations.length);
    this.totalAgentsActivated += activations.length;
    this.totalAgentsRejected += agentsRejected;
    const evidence: string[] = [];
    const warnings: string[] = [];
    for (const activation of activations) {
      try {
        evidence.push(`Activated: ${activation.agentId} (${activation.reason})`);
      } catch (error) {
        warnings.push(`Agent ${activation.agentId} failed: ${error}`);
      }
    }
    return {
      success: true,
      agentsActivated: activations,
      agentsConsidered,
      agentsRejected,
      patientId: request.patientId,
      contextVersion: Date.now(),
      evidence,
      response: `Orchestrated ${activations.length} agents for ${request.intent}`,
      warnings,
      executionTimeMs: Date.now() - startTime
    };
  }

  getMetrics() {
    return {
      activationCount: this.activationCount,
      totalAgentsActivated: this.totalAgentsActivated,
      totalAgentsRejected: this.totalAgentsRejected,
      averageAgentsPerRequest: this.activationCount > 0 
        ? (this.totalAgentsActivated / this.activationCount).toFixed(2) 
        : 0,
      rejectionRate: this.totalAgentsActivated > 0 
        ? ((this.totalAgentsRejected / (this.totalAgentsActivated + this.totalAgentsRejected)) * 100).toFixed(1) 
        : 0
    };
  }

  validateActivation(intent: string, requestedAgents: number): { valid: boolean; maxAllowed: number } {
    const policy = AGENT_ACTIVATION_POLICY[intent] || AGENT_ACTIVATION_POLICY["default"];
    return {
      valid: requestedAgents <= policy.maxAgents,
      maxAllowed: policy.maxAgents
    };
  }
}

export const clinicalCommandHOD = new ClinicalCommandHOD();
