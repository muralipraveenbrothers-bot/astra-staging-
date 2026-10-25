/**
 * ASTRA AI — IMAGE & TRAUMA AGENT (4.6) + CLINICAL CO-PILOT (4.7)
 * ============================================================================
 * Level: SPECIALIST
 * Purpose: Upload, quality check, classification, analysis, annotation, patient link, comparison
 * Tools: analyzeImage, analyzeClinicalImage, compareImages, getDICOMSeries, createRadiologyOrder
 * Quality levels: GOOD | ACCEPTABLE | LIMITED | INSUFFICIENT
 * Visibility labels: VISIBLE | LIKELY | SUSPECTED | NOT_ASSESSABLE
 * Neurovascular Safety: Checklist mandatory; cannot infer intact neurovascular status from image alone.
 */

import { ToolRegistry } from "../core/ToolRegistry";
import { UniversalAgentContext } from "../core/UniversalAgentContext";
import { ClinicalCoPilotAgent } from "./ClinicalCoPilotAgent";

export class ImageAgent {
  public static readonly agentId = "image_agent";

  public static async execute(imageData: string, query: string, context?: UniversalAgentContext): Promise<any> {
    // Determine if this is a trauma/clinical image requiring full Clinical Co-Pilot analysis
    const lower = (query || "").toLowerCase();
    const isClinicalImage =
      /trauma|injur|laceration|bleed|wound|cut|stab|gunshot|burn|fracture|surg|clinical|thumb|finger|hand|foot|face|eye|ear/i.test(lower);

    // If clinical co-pilot analysis is needed, delegate to the Clinical Co-Pilot Agent
    if (isClinicalImage) {
      return await ClinicalCoPilotAgent.execute(imageData, query, context);
    }

    // Otherwise use the standard image analysis tool
    const analysis = await ToolRegistry.execute("analyzeImage", { imageData, query });
    return {
      status: "COMPLETED",
      imageData: imageData ? "PRESENT" : "SIMULATED",
      analysis,
      neurovascularSafetyWarning: "Neurovascular status cannot be confirmed from image alone. Physical check mandatory."
    };
  }
}