export interface VoiceGuardianResult {
  isSafe: boolean;
  escalationMessage?: string;
  intent?: "EMERGENCY" | "COMPLAINT" | "CLINICAL" | "APPOINTMENT" | "GENERAL";
}

export class AstraVoiceGuardian {
  static check(prompt: string, role: string): VoiceGuardianResult {
    const text = prompt.toLowerCase();
    
    // 1. Emergency Detection
    if (text.includes("emergency") || text.includes("unconscious") || text.includes("heart attack") || text.includes("not breathing") || text.includes("blood") || text.includes("cpr")) {
      return {
        isSafe: false,
        intent: "EMERGENCY",
        escalationMessage: "This may be a medical emergency. Please bring the patient to the emergency room immediately or activate the Code Blue workflow."
      };
    }

    // 2. Complaint / Anger Detection
    if (text.includes("angry") || text.includes("complaint") || text.includes("terrible service") || text.includes("frustrated")) {
      return {
        isSafe: false,
        intent: "COMPLAINT",
        escalationMessage: "I hear your frustration and I want to help resolve this. I am transferring this context immediately to a human supervisor."
      };
    }

    // 3. Clinical Safety (RBAC) - e.g. Receptionist asking for Potassium
    if (role === "reception" && (text.includes("potassium") || text.includes("lab") || text.includes("hemoglobin") || text.includes("surgery"))) {
      return {
        isSafe: false,
        intent: "CLINICAL",
        escalationMessage: "I am currently in Reception mode and cannot access clinical EMR records. Please consult the clinical dashboard."
      };
    }

    // Safe to proceed
    let intent: VoiceGuardianResult["intent"] = "GENERAL";
    if (text.includes("appointment") || text.includes("book")) intent = "APPOINTMENT";
    else if (text.includes("lab") || text.includes("potassium") || text.includes("hb")) intent = "CLINICAL";

    return {
      isSafe: true,
      intent
    };
  }
}
