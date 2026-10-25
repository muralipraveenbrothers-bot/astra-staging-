/**
 * ASTRA AI — HOSPITAL QUERY AGENT (4.1)
 * ============================================================================
 * Level: SPECIALIST
 * Purpose: Deterministic hospital data retrieval (<500ms, zero LLM latency)
 * Tools: getIPPatients, getOPPatients, getICUPatients, getWardPatients,
 *        getHospitalCensus, getLabQueue, getRadiologyQueue, getPharmacyQueue,
 *        getOTStatus, getBillingSummary
 */

import { ToolRegistry } from "../core/ToolRegistry";
import { UniversalAgentContext } from "../core/UniversalAgentContext";

export class HospitalQueryAgent {
  public static readonly agentId = "hospital_query_agent";

  public static async execute(query: string, context?: UniversalAgentContext): Promise<any> {
    const intent = context?.objective.intent || "HOSPITAL_CENSUS";

    switch (intent) {
      case "HOSPITAL_CENSUS":
        return await ToolRegistry.execute("getHospitalCensus", {});
      case "IP_LIST":
        return await ToolRegistry.execute("getIPPatients", {});
      case "OP_LIST":
        return await ToolRegistry.execute("getOPPatients", {});
      case "ICU_LIST":
        return await ToolRegistry.execute("getICUPatients", {});
      case "WARD_LIST":
        return await ToolRegistry.execute("getWardPatients", {});
      case "LAB_PENDING":
        return await ToolRegistry.execute("getLabQueue", {});
      case "RADIOLOGY_PENDING":
        return await ToolRegistry.execute("getRadiologyQueue", {});
      case "PHARMACY_PENDING":
        return await ToolRegistry.execute("getPharmacyQueue", {});
      case "OT_STATUS":
        return await ToolRegistry.execute("getOTStatus", {});
      case "BILLING_SUMMARY":
        return await ToolRegistry.execute("getBillingSummary", {});
      default:
        return await ToolRegistry.execute("getHospitalCensus", {});
    }
  }
}
