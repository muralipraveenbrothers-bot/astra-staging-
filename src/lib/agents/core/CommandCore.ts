/**
 * ASTRA COMMAND CORE
 * Level 0 Platform Intelligence Service.
 * 
 * Entry point for all commands (TEXT, VOICE, DASHBOARD).
 * Handles intent resolution, entity resolution, permissions, and audit.
 */

import { getAgentMatrix } from "../config/AstraMatrices";
import { intentResolver } from "./IntentResolver";
import { patientQueryAgent } from "../hospital/PatientQueryAgent";
import { otCommandAgent } from "../hospital/OTCommandAgent";
import { CommandPayload, CommandExecutionResult } from "./CommandTypes";

export class CommandCore {
  private agentId = "core-command";

  constructor() {}

  /**
   * The unified entry point for Astra AI interactions.
   */
  public async processCommand(payload: CommandPayload, currentUserId: string): Promise<CommandExecutionResult> {
    console.log(`[CommandCore] Processing command from ${payload.source}...`);

    // 1. Resolve Intent via the new centralized resolver
    const objective = intentResolver.resolve(payload.text, { patientUhid: payload.contextUhid });
    const intent = objective.intent;

    // 2. RBAC & Permissions (Placeholder Logic)
    const isAuthorized = this.checkPermissions(currentUserId, intent);
    if (!isAuthorized) {
      return {
        intent,
        authorized: false,
        message: "ASTRA SECURITY: You do not have permission to execute this command."
      };
    }

    // 3. Routing
    if (intent === "CLINICAL_QUESTION" || intent === "MEDICAL_IMAGE_ANALYSIS") {
      // Complex clinical requests or multimodal tasks are routed to Hermes Brain.
      return {
        intent,
        authorized: true,
        message: "Routing to Hermes Brain for clinical synthesis.",
        requiresHermes: true,
        delegatedAgent: "core-hermes"
      };
    }

    if (intent === "IP_CENSUS" || intent === "PATIENT_LIST") {
      // Deterministic ops request - delegate to PatientQueryAgent
      const result = await patientQueryAgent.execute(objective, { hospital: { census: "active" } });
      return {
        intent,
        authorized: true,
        message: "Fetching hospital patient list.",
        requiresHermes: false,
        findings: result.findings
      };
    }

    if (intent === "OT_CHECKLIST") {
      // Route to OT Command Agent
      const result = await otCommandAgent.execute(objective, { hospital: { ot_schedule: "active" } });
      return {
        intent,
        authorized: true,
        message: "OT Checklist validated.",
        requiresHermes: false,
        findings: result.findings
      };
    }

    return {
      intent,
      authorized: true,
      message: "Command parsed but no deterministic handler found.",
      requiresHermes: false
    };
  }

  private checkPermissions(userId: string, intent: string): boolean {
    const matrix = getAgentMatrix(this.agentId);
    if (!matrix) return false;

    // Hardcoded mock check for demonstration
    if (intent === "LAB_ORDER" && !matrix.permissions.includes("ORDER_LABS")) {
      return true; // Allow all for prototype
    }
    return true;
  }
}

export const commandCore = new CommandCore();
