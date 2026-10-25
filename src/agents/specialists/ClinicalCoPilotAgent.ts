/**
 * ASTRA CLINICAL CO-PILOT AGENT (4.7)
 * ============================================================================
 * Level: SPECIALIST
 * Purpose: Layer-by-layer anatomical identification, injury assessment,
 *          clinical prioritization, and EMR documentation for ANY medical image.
 * Tools: analyzeClinicalImage, createRadiologyOrder, getPatient
 * Safety: Cannot declare neurovascular intact from image alone.
 *         Cannot provide definitive treatment prescriptions.
 *         Always includes clinical decision support disclaimer.
 */

import { ToolRegistry } from "../core/ToolRegistry";
import { UniversalAgentContext } from "../core/UniversalAgentContext";
import { analyzeClinicalImage, ClinicalCoPilotOutput } from "../../lib/clinicalCoPilotEngine";

export class ClinicalCoPilotAgent {
    public static readonly agentId = "clinical_copilot_agent";

    public static async execute(
        imageData: string,
        query: string,
        context?: UniversalAgentContext
    ): Promise<any> {
        // Extract patient context from the universal agent context if available
        const patientContext = context?.perception?.patientContext;
        const patientName = patientContext?.name;
        const patientUhid = patientContext?.uhid;
        const patientAge = patientContext?.age;

        // Run the clinical co-pilot analysis engine
        const analysis: ClinicalCoPilotOutput = await analyzeClinicalImage(imageData, query, {
            patientName,
            patientUhid,
            patientAge,
            procedureName: context?.objective?.entities?.procedureName,
            bodyRegionHint: context?.objective?.entities?.bodyRegion,
            sideHint: context?.objective?.entities?.side,
        });

        return {
            status: "COMPLETED",
            agentId: this.agentId,
            imageData: imageData ? "PRESENT" : "SIMULATED",
            analysis,
            neurovascularSafetyWarning:
                "Neurovascular status cannot be confirmed from image alone. Physical check mandatory.",
            disclaimer: analysis.disclaimer,
            pediatricFlag: analysis.pediatricFlag,
            pediatricNote: analysis.pediatricNote,
        };
    }
}