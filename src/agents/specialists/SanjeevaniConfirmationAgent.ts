import { ToolRegistry } from "../core/ToolRegistry";
import { PermissionRegistry } from "../core/PermissionRegistry";

/**
 * Register the confirmation tool for Sanjeevani actions.
 * This tool receives a list of actions and executes them after confirmation.
 */
function registerSanjeevaniConfirmationTool() {
  ToolRegistry.register({
    toolId: "confirmSanjeevaniActions",
    name: "Confirm Sanjeevani Actions",
    description: "Executes confirmed actions from Sanjeevani reasoning.",
    inputSchema: {
      type: "object",
      properties: {
        actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              toolId: { type: "string" },
              input: { type: "object" },
            },
            required: ["toolId", "input"],
          },
        },
        patientId: { type: "string" },
      },
      required: ["actions"],
    },
    outputSchema: {
      type: "object",
      properties: {
        success: { type: "boolean" },
        executedActions: { type: "array", items: { type: "string" } },
      },
    },
    readOrWrite: "WRITE",
    riskLevel: "IMPORTANT",
    requiredPermissions: ["order:create", "patient:write"],
    patientScope: true,
    confirmationRequired: true,
    auditRequired: true,
    latencyMs: 200,
    healthStatus: "HEALTHY",
    execute: async ({ actions, patientId }: { actions: Array<{ toolId: string; input: any }>; patientId?: string }) => {
      const executed: string[] = [];
      for (const action of actions) {
        try {
          const tool = ToolRegistry.get(action.toolId);
          if (!tool) throw new Error(`Tool ${action.toolId} not found`);
          // Execute the action (placeholder – in real code, use CommandEngine)
          await ToolRegistry.execute(action.toolId, action.input);
          executed.push(action.toolId);
        } catch (e) {
          console.error(`Failed to execute ${action.toolId}:`, e);
        }
      }
      return {
        success: executed.length === actions.length,
        executedActions: executed,
      };
    },
  });
}

// Register on module load.
registerSanjeevaniConfirmationTool();

export default {
  pluginId: "plugin-sanjeevani-confirmation",
  name: "Sanjeevani Confirmation Plugin",
  version: "2026.09.21",
  category: "ORCHESTRATION" as const,
  description: "Handles confirmation and execution of Sanjeevani actions.",
  status: "ACTIVE" as const,
};
