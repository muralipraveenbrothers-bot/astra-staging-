/**
 * ASTRA AI — MODEL REGISTRY (1.7)
 * ============================================================================
 * Schema and registry for local, medical, vision, speech, and cloud frontier models.
 */

export type ModelType =
  | "FAST"
  | "REASONING"
  | "MEDICAL"
  | "VISION"
  | "EMBEDDING"
  | "RERANKER"
  | "STT"
  | "TTS";

export const SupportedLanguage = {
  ENGLISH: "en",
  HINDI: "hi",
  TELUGU: "te",
  TAMIL: "ta",
  KANNADA: "kn",
  MALAYALAM: "ml",
} as const;

export type SupportedLanguage = (typeof SupportedLanguage)[keyof typeof SupportedLanguage];

export interface ModelEntry {
  modelId: string;
  provider: "LOCAL" | "KIMI" | "GEMINI" | "OPENAI" | "ANTHROPIC" | "VOICEBOX";
  type: ModelType;
  modality: "text" | "vision" | "voice" | "multimodal";
  localOrCloud: "LOCAL" | "CLOUD" | "HYBRID";
  totalParams?: string;
  activeParams?: string;
  contextWindow: number;
  supportsTools: boolean;
  supportsVision: boolean;
  healthStatus: "CONNECTED" | "DEGRADED" | "OFFLINE" | "CONFIG_REQUIRED";
  latencyMs: number;
  costPer1K: number;
  privacyLevel: "HIPAA_LOCAL" | "ENTERPRISE_CLOUD";
  hardwareRequirements?: string;
  fallbackModelId?: string;
}

class ModelRegistryService {
  private models: Map<string, ModelEntry> = new Map();

  constructor() {
    this.seedModels();
  }

  private seedModels() {
    const defaultModels: ModelEntry[] = [
      {
        modelId: "qwen-2.5-7b-local",
        provider: "LOCAL",
        type: "FAST",
        modality: "text",
        localOrCloud: "LOCAL",
        totalParams: "7.6B",
        activeParams: "7.6B",
        contextWindow: 32768,
        supportsTools: true,
        supportsVision: false,
        healthStatus: "CONNECTED",
        latencyMs: 120,
        costPer1K: 0.0,
        privacyLevel: "HIPAA_LOCAL",
        hardwareRequirements: "8GB VRAM / 16GB RAM"
      },
      {
        modelId: "gemini-3.1-pro",
        provider: "GEMINI",
        type: "REASONING",
        modality: "multimodal",
        localOrCloud: "CLOUD",
        totalParams: "MoE",
        activeParams: "Variable",
        contextWindow: 1000000,
        supportsTools: true,
        supportsVision: true,
        healthStatus: "CONNECTED",
        latencyMs: 650,
        costPer1K: 0.00125,
        privacyLevel: "ENTERPRISE_CLOUD",
        fallbackModelId: "qwen-2.5-7b-local"
      },
      {
        modelId: "kimi-2.8t-moe",
        provider: "KIMI",
        type: "REASONING",
        modality: "text",
        localOrCloud: "CLOUD",
        totalParams: "2.8T",
        activeParams: "104B",
        contextWindow: 256000,
        supportsTools: true,
        supportsVision: false,
        healthStatus: "CONNECTED",
        latencyMs: 800,
        costPer1K: 0.002,
        privacyLevel: "ENTERPRISE_CLOUD",
        fallbackModelId: "gemini-3.1-pro"
      },
      {
        modelId: "medical-vision-vit",
        provider: "LOCAL",
        type: "VISION",
        modality: "vision",
        localOrCloud: "LOCAL",
        totalParams: "1.2B",
        activeParams: "1.2B",
        contextWindow: 8192,
        supportsTools: false,
        supportsVision: true,
        healthStatus: "CONNECTED",
        latencyMs: 250,
        costPer1K: 0.0,
        privacyLevel: "HIPAA_LOCAL"
      },
      {
        modelId: "voicebox-speech-v3",
        provider: "VOICEBOX",
        type: "STT",
        modality: "voice",
        localOrCloud: "LOCAL",
        totalParams: "300M",
        activeParams: "300M",
        contextWindow: 4096,
        supportsTools: false,
        supportsVision: false,
        healthStatus: "CONNECTED",
        latencyMs: 90,
        costPer1K: 0.0,
        privacyLevel: "HIPAA_LOCAL"
      }
    ];

    for (const m of defaultModels) {
      this.models.set(m.modelId, m);
    }
  }

  public register(model: ModelEntry): void {
    this.models.set(model.modelId, model);
  }

  public get(modelId: string): ModelEntry | undefined {
    return this.models.get(modelId);
  }

  public list(): ModelEntry[] {
    return Array.from(this.models.values());
  }

  public getFastModel(): ModelEntry {
    return this.models.get("qwen-2.5-7b-local") || this.list()[0];
  }

  public getReasoningModel(): ModelEntry {
    return this.models.get("gemini-3.1-pro") || this.models.get("kimi-2.8t-moe") || this.getFastModel();
  }
}

export const ModelRegistry = new ModelRegistryService();
