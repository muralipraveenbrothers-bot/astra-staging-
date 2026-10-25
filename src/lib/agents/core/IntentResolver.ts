/**
 * INTENT RESOLVER
 * A central parser that maps raw inputs (voice, text, image, dashboard)
 * into a standardized AstraObjective matching the Universal Contract.
 */

import { AstraObjective } from "./UniversalAgentContract";

export class IntentResolver {
  
  public resolve(raw_request: string, sourceContext?: any): AstraObjective {
    console.log(`[IntentResolver] Resolving raw request: "${raw_request}"`);
    
    const lower = raw_request.toLowerCase();
    
    // Default fallback objective matching the required output format
    const objective: AstraObjective = {
      raw_request,
      normalized_request: raw_request.trim(),
      intent: "UNKNOWN",
      entities: {},
      risk_level: "LOW",
      confidence: 0.5
    };

    // Very basic regex-based intent classification for the prototype:
    if (lower.includes("ot checklist") || lower.includes("ot status") || lower.includes("surgery")) {
      objective.intent = "OT_CHECKLIST";
      objective.department = "OT";
      objective.requested_output = "OT_CHECKLIST_REPORT";
      objective.risk_level = "HIGH_RISK";
      objective.confidence = 0.95;
      
      // Extract specialty if present
      const specialties = ["Orthopaedics", "General Surgery", "OBG/GYN", "Surgical Gastro", "ENT", "Urology", "Oncology"];
      for (const spec of specialties) {
        if (lower.includes(spec.toLowerCase())) {
          objective.entities["specialty"] = spec;
          break;
        }
      }
    }
    else if (lower.includes("ip list") || lower.includes("ip patients")) {
      objective.intent = "IP_CENSUS";
      objective.department = "WARD";
      objective.requested_output = "PATIENT_TABLE";
      objective.confidence = 0.95;
    } 
    else if (lower.includes("analyze") && (lower.includes("wound") || lower.includes("image"))) {
      objective.intent = "MEDICAL_IMAGE_ANALYSIS";
      objective.department = "CLINICAL";
      objective.risk_level = "CLINICAL";
      objective.confidence = 0.9;
    }
    else if (lower.includes("order") && (lower.includes("cbc") || lower.includes("lab"))) {
      objective.intent = "LAB_ORDER";
      objective.department = "LABORATORY";
      objective.risk_level = "IMPORTANT";
      objective.entities["test"] = "CBC";
      objective.confidence = 0.85;
    }
    else {
      objective.intent = "CLINICAL_QUESTION";
      objective.department = "CLINICAL";
      objective.risk_level = "CLINICAL";
      objective.confidence = 0.6;
    }

    // Merge external context (e.g. current patient from UI)
    if (sourceContext?.patientUhid) {
      objective.patient_reference = sourceContext.patientUhid;
    }

    return objective;
  }
}

export const intentResolver = new IntentResolver();
