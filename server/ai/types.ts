/**
 * ASTRA AI — Unified AI Provider Abstraction
 * =====================================================
 * Provider-neutral interface that every model provider adapter implements.
 *
 * Sits ABOVE the existing gatewayAdapter.ts / openaiCompatible.ts chain
 * (which is preserved). Gemini and future providers plug in here so the
 * orchestrator can route by task and fall back honestly.
 *
 * Rules:
 *  - No provider may hard-code keys. Keys come from server env / secret store.
 *  - No provider reports "healthy" before a real probe succeeds.
 *  - Requests carry a requestId for tracing and an AbortSignal for cancel.
 */
/** High-level task categories driving provider selection. */
export enum AITask {
  ClinicalReasoning = "clinical_reasoning",
  DiagnosisSupport = "diagnosis_support",
  DifferentialGeneration = "differential_generation",
  InvestigationPlanning = "investigation_planning",
  MedicationReview = "medication_review",
  DrugInteraction = "drug_interaction",
  EvidenceSearch = "evidence_search",
  LiteratureSearch = "literature_search",
  PatientEducation = "patient_education",
  CommunicationCoach = "communication_coach",
  PatientPsychology = "patient_psychology",
  AttendantPsychology = "attendant_psychology",
  HospitalOperations = "hospital_operations",
  PatientRegistry = "patient_registry",
  Documentation = "documentation",
  DischargeSummary = "discharge_summary",
  Referral = "referral",
  MultilingualTranslation = "multilingual_translation",
  VoiceConversation = "voice_conversation",
  AvatarResponse = "avatar_response",
  GeneralAssistant = "general_assistant",
  FastConversation = "fast_conversation",
  Vision = "vision",
}

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string | unknown[];
}

export interface AIRequest {
  messages: AIMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  task?: AITask;
  language?: string;
  requestId?: string;
}

export interface AIUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface AIResponse {
  providerId: string;
  model: string;
  text: string;
  json: unknown;
  usage?: AIUsage;
  latencyMs: number;
  status: number;
  requestId: string;
  fallbackUsed?: boolean;
  error?: string;
}

export interface AIStreamChunk {
  providerId: string;
  model: string;
  delta?: string;
  usage?: AIUsage;
  done: boolean;
}

export type ProviderStatus = "healthy" | "degraded" | "unavailable" | "unknown";

export interface AIProviderHealth {
  id: string;
  provider: string;
  status: ProviderStatus;
  latencyMs: number;
  detail?: string;
  model?: string;
  keyConfigured: boolean;
  checkedAt: string;
}

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  /** Prerequisite config (endpoint and/or key) is present — not the same as healthy. */
  readonly configured: boolean;
  chat(request: AIRequest): Promise<AIResponse>;
  stream?(request: AIRequest): AsyncIterable<AIStreamChunk>;
  healthCheck(): Promise<AIProviderHealth>;
}

/** Structured errors. Never leak credentials in `message`. */
export abstract class AIProviderError extends Error {
  abstract readonly code: string;
  constructor(
    message: string,
    public readonly providerId: string,
    public readonly requestId: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class AIProviderUnavailable extends AIProviderError {
  readonly code = "AIProviderUnavailable";
}
export class AIProviderTimeout extends AIProviderError {
  readonly code = "AIProviderTimeout";
}
export class AIProviderRateLimited extends AIProviderError {
  readonly code = "AIProviderRateLimited";
}

export interface ProviderSelection {
  providerId: string;
  model: string;
  rationale: string;
}
