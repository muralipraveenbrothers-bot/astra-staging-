/**
 * MODEL ROUTER
 * Level 0 Platform Intelligence Service.
 * 
 * Selects the most appropriate model tier for a given task.
 */

export type ModelTier = 
  | "LOCAL_FAST" 
  | "FRONTIER_MEDICAL" 
  | "VISION" 
  | "EMBEDDING" 
  | "VOICE_STT_TTS";

export interface ModelRoutingRequest {
  taskComplexity: "LOW" | "MEDIUM" | "HIGH";
  requiresVision: boolean;
  requiresVoice: boolean;
  medicalSpecialty?: boolean;
}

export class ModelRouter {
  private agentId = "core-model-router";

  public selectModel(request: ModelRoutingRequest): ModelTier {
    if (request.requiresVoice) return "VOICE_STT_TTS";
    if (request.requiresVision) return "VISION";
    
    if (request.taskComplexity === "HIGH" || request.medicalSpecialty) {
      return "FRONTIER_MEDICAL"; // e.g., Gemini MedLM or Pro
    }

    return "LOCAL_FAST"; // e.g., local small models
  }
}

export const modelRouter = new ModelRouter();
