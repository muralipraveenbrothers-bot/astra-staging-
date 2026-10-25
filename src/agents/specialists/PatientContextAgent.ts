/**
 * ASTRA AI — PATIENT CONTEXT AGENT (4.2)
 * ============================================================================
 * Level: SPECIALIST
 * Purpose: Patient search, open, timeline, vitals, results
 * Tools: getPatient, getPatientTimeline, getVitals, getLabResult,
 *        getRadiologyReport, getActiveMedications
 */

import { ToolRegistry } from "../core/ToolRegistry";
import { UniversalAgentContext } from "../core/UniversalAgentContext";

export class PatientContextAgent {
  public static readonly agentId = "patient_context_agent";

  public static async execute(query: string, context?: UniversalAgentContext): Promise<any> {
    const patientRef = context?.objective.entities.patientName || context?.perception?.patientContext?.id || "Rajesh";
    const intent = context?.objective.intent || "PATIENT_OPEN";

    switch (intent) {
      case "PATIENT_OPEN":
      case "PATIENT_SEARCH":
        return await ToolRegistry.execute("getPatient", { query: patientRef });
      case "WARD_VITAL":
        return await ToolRegistry.execute("getPatientTimeline", { patientId: patientRef });
      case "LAB_RESULT":
        return await ToolRegistry.execute("getLabResult", {
          patientId: patientRef,
          testName: context?.objective.entities.labTests?.[0]
        });
      case "RADIOLOGY_REPORT":
        return await ToolRegistry.execute("getRadiologyReport", { patientId: patientRef });
      default:
        return await ToolRegistry.execute("getPatient", { query: patientRef });
    }
  }
}
