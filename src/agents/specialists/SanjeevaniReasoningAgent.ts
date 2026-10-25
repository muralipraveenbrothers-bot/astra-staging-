import { LangGraphOrchestrator } from "@/agents/core/LangGraphOrchestrator";
import { ToolRegistry } from "@/agents/core/ToolRegistry";
import { PermissionRegistry } from "@/agents/core/PermissionRegistry";

/**
 * Register the Sanjeevani reasoning tool.
 * This tool receives a free‑form query (text) and optional patientId,
 * builds a UniversalAgentContext, then runs the Sanjeevani LangGraph.
 */
function registerSanjeevaniReasoningTool() {
  ToolRegistry.register({
    toolId: "runSanjeevaniReasoning",
    name: "Run Sanjeevani Reasoning",
    description: "Executes the Sanjeevani clinical reasoning flow for a given query and patient context.",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string" },
        patientId: { type: "string" },
      },
      required: ["text"],
    },
    outputSchema: {
      type: "object",
      properties: {
        summary: { type: "string" },
        differential: { type: "array", items: { type: "string" } },
        recommendations: { type: "array", items: { type: "string" } },
        // For actions that require confirmation (e.g., creating orders)
        rawResult: { type: "object" },
      },
    },
    readOrWrite: "READ",
    riskLevel: "INFO",
    requiredPermissions: ["ai:clinical_reasoning"],
    patientScope: true,
    confirmationRequired: false,
    auditRequired: false,
    latencyMs: 500,
    healthStatus: "HEALTHY",
    execute: async ({ text, patientId }: { text: string; patientId?: string }) => {
      // Build a minimal context – using PermissionRegistry to fetch user role defaults (placeholder "doctor").
      const user = { userId: "user1", name: "Dr. Murali Praveen", role: "DOCTOR" as const, department: "Clinical" };
      const context = (await import("@/agents/core/UniversalAgentContext")).UniversalAgentContextBuilder.buildContext({
        rawRequest: text,
        normalizedRequest: text,
        intent: "clinical_query",
        entities: {},
        riskLevel: "INFO",
        agentId: "sanjeevani_reasoning",
        agentName: "Sanjeevani Reasoning",
        user,
        perception: {},
        candidateToolIds: [
          "getPatient",
          "getPatientTimeline",
          "getVitals",
          "searchPubMed",
          "retrieveGuideline",
          "checkDrugInteraction",
        ],
        knowledge: {},
      });

      // Execute the graph – we reuse the existing LangGraphOrchestrator with a custom query.
      const result = await LangGraphOrchestrator.executeGraph(text, context, { maxSteps: 12, requireHumanApproval: true });

      // Extract a friendly response for the UI.
      const { finalResult } = result as any;
      const summary = finalResult?.understanding ?? "";
      const differential = finalResult?.differential?.likely ?? [];
      const recommendations = finalResult?.keyFindings ?? [];

      // Simulate action detection: if the query contains certain keywords, we suggest actions.
      // In a real implementation, this would come from the LangGraph or a specialized agent.
      const lowerText = text.toLowerCase();
      const actions = [];
      let requiresConfirmation = false;

      if (lowerText.includes("order") || lowerText.includes("schedule") || lowerText.includes("request")) {
        // Example: order a lab or radiology
        if (lowerText.includes("cbc") || lowerText.includes("blood")) {
          actions.push({
            toolId: "createLabOrder",
            input: {
              patientId: patientId ?? "UNKNOWN",
              testName: "CBC",
              priority: "ROUTINE",
              clinicalNotes: "Ordered via Sanjeevani voice command",
            },
          });
          requiresConfirmation = true;
        }
        if (lowerText.includes("xray") || lowerText.includes("x-ray") || lowerText.includes("radiology")) {
          actions.push({
            toolId: "createRadiologyOrder",
            input: {
              patientId: patientId ?? "UNKNOWN",
              modality: "X-Ray",
              bodyPart: "Chest",
              priority: "ROUTINE",
            },
          });
          requiresConfirmation = true;
        }
        if (lowerText.includes("medicine") || lowerText.includes("prescribe") || lowerText.includes("drug")) {
          actions.push({
            toolId: "createPrescription",
            input: {
              patientId: patientId ?? "UNKNOWN",
              medications: [{ name: "Paracetamol", dosage: "500mg", frequency: "OD" }],
            },
          });
          requiresConfirmation = true;
        }
      }

      // Add language and persona information to the rawResult
      const rawResult = {
        ...finalResult,
        requiresConfirmation,
        actions,
        language: "en",
        persona: "doctor",
      };

      return {
        summary,
        differential,
        recommendations,
        rawResult,
      };
    },
  });
}

// Register on module load.
registerSanjeevaniReasoningTool();

export default {
  pluginId: "plugin-sanjeevani-reasoning",
  name: "Sanjeevani Reasoning Plugin",
  version: "2026.09.21",
  category: "ORCHESTRATION" as const,
  description: "Runs the Sanjeevani clinical reasoning LangGraph for voice/text queries.",
  status: "ACTIVE" as const,
};
