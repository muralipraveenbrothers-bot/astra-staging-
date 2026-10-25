/**
 * ASTRA AI — COMMAND AGENT (4.3)
 * ============================================================================
 * Level: MANAGER
 * Purpose: Authorized hospital mutations (orders, tasks, transfers) via CommandEngine
 * Tools: createLabOrder, createRadiologyOrder, createPrescription,
 *        createTask, transferBed, updateOTStatus
 */

import { commandEngine } from "../../command/CommandEngine";
import { UniversalAgentContext } from "../core/UniversalAgentContext";

export class CommandAgent {
  public static readonly agentId = "command_agent";

  public static async execute(query: string, context: UniversalAgentContext): Promise<any> {
    return await commandEngine.execute({
      query,
      user: {
        userId: context.role.userId,
        name: context.role.userName,
        role: context.role.userRole,
        department: context.role.departmentScope || "CLINICAL",
        sessionId: "SESSION-ACTIVE"
      },
      contextPatient: context.perception.patientContext
    });
  }
}
