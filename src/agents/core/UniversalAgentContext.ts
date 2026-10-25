/**
 * ASTRA AI — UNIVERSAL AGENT CONTRACT & CONTEXT BUILDER (3.3)
 * ============================================================================
 * Assembles the 6 standardized layers for every agent execution:
 *   LAYER 1: OBJECTIVE
 *   LAYER 2: ROLE
 *   LAYER 3: PERCEPTION
 *   LAYER 4: CAPABILITY (Authorized Tools runtime discovery)
 *   LAYER 5: LEARNING (Approved skills & few-shot examples)
 *   LAYER 6: KNOWLEDGE (Grounded RAG & guidelines)
 */

import { RiskLevel, HospitalRole, ToolDefinition } from "./AgentDefinition";
import { PermissionRegistry } from "./PermissionRegistry";
import { ToolRegistry } from "./ToolRegistry";
import { SkillRegistry } from "./SkillRegistry";

export interface AgentObjectiveLayer {
  rawRequest: string;
  normalizedRequest: string;
  intent: string;
  entities: Record<string, any>;
  riskLevel: RiskLevel;
}

export interface AgentRoleLayer {
  agentId: string;
  agentName: string;
  userRole: HospitalRole;
  userName: string;
  userId: string;
  permissions: string[];
  patientScope: boolean;
  departmentScope?: string;
  constraints: string[];
}

export interface AgentPerceptionLayer {
  hospitalState?: any;
  patientContext?: any;
  departmentState?: any;
  imageData?: string;
  voiceAudio?: string;
}

export interface AgentCapabilityLayer {
  authorizedTools: ToolDefinition[];
  toolMap: Map<string, ToolDefinition>;
}

export interface AgentLearningLayer {
  applicableSkills: any[];
  approvedExamples: any[];
}

export interface AgentKnowledgeLayer {
  retrievedGuideline?: string;
  evidenceSnippets?: any[];
  hospitalProtocols?: string[];
}

export interface UniversalAgentContext {
  traceId: string;
  timestamp: string;
  objective: AgentObjectiveLayer;
  role: AgentRoleLayer;
  perception: AgentPerceptionLayer;
  capability: AgentCapabilityLayer;
  learning: AgentLearningLayer;
  knowledge: AgentKnowledgeLayer;
}

export class UniversalAgentContextBuilder {
  public static buildContext(params: {
    rawRequest: string;
    normalizedRequest: string;
    intent: string;
    entities: Record<string, any>;
    riskLevel: RiskLevel;
    agentId: string;
    agentName: string;
    user: { userId: string; name: string; role: HospitalRole; department: string };
    perception?: { hospitalState?: any; patientContext?: any; departmentState?: any; imageData?: string; voiceAudio?: string };
    candidateToolIds: string[];
    knowledge?: { retrievedGuideline?: string; evidenceSnippets?: any[]; hospitalProtocols?: string[] };
  }): UniversalAgentContext {
    const permissions = PermissionRegistry.getRolePermissions(params.user.role);

    // Filter tools based on user's server-side permissions
    const authorizedTools: ToolDefinition[] = [];
    const toolMap = new Map<string, ToolDefinition>();

    for (const toolId of params.candidateToolIds) {
      const tool = ToolRegistry.get(toolId);
      if (tool && PermissionRegistry.authorizeTools(params.user.role, tool.requiredPermissions)) {
        authorizedTools.push(tool);
        toolMap.set(toolId, tool);
      }
    }

    // Discover applicable skills
    const skills = SkillRegistry.listActive().filter(s => s.agentTypes.includes(params.agentId));

    return {
      traceId: `TRC-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      objective: {
        rawRequest: params.rawRequest,
        normalizedRequest: params.normalizedRequest,
        intent: params.intent,
        entities: params.entities,
        riskLevel: params.riskLevel
      },
      role: {
        agentId: params.agentId,
        agentName: params.agentName,
        userRole: params.user.role,
        userName: params.user.name,
        userId: params.user.userId,
        permissions,
        patientScope: true,
        departmentScope: params.user.department,
        constraints: [
          "Do not hallucinate patient data",
          "Mutations must use CommandEngine",
          "Respect role boundary"
        ]
      },
      perception: params.perception || {},
      capability: {
        authorizedTools,
        toolMap
      },
      learning: {
        applicableSkills: skills,
        approvedExamples: skills.flatMap(s => s.examples)
      },
      knowledge: params.knowledge || {}
    };
  }
}
