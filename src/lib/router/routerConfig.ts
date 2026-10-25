/**
 * ASTRA AI — ROUTER MESH: DEFAULT CONFIGURATION
 *
 * Master configuration for the unified routing engine.
 * All sub-routers, routing policies, and global settings.
 *
 * LiteLLM and RouteLLM are RETIRED (kept below for history): every active
 * chain is freellmapi → omniroute → ollama, so each chain always ends on a
 * loopback provider and patient data can stay local.
 */

import type {
  AstraRouterConfig,
  SubRouterConfig,
  RoutingPolicy,
} from "./types";

// ─── Sub-Router Definitions ───────────────────────────────────────

const FREELLMAPI_CONFIG: SubRouterConfig = {
  id: "freellmapi",
  name: "FreeLLMAPI Unified Router",
  priority: 1,
  enabled: true,
  proxyMount: "/proxy/freellmapi",
  healthEndpoint: "/v1/models",
  modelsEndpoint: "/v1/models",
  apiKeyHeader: "Authorization",
  defaultModel: "auto",
  supportedModels: [
    "auto",                       // FreeLLMAPI auto-selects best model
    "fusion",                     // Multi-model fusion synthesis
    "gpt-4o-mini",
    "gemini-2.0-flash",
    "claude-3-haiku",
    "llama-3.1-8b",
    "mistral-small",
    "deepseek-v3",
  ],
  maxRetries: 2,
  timeoutMs: 30000,
  rateLimit: {
    maxRequestsPerMinute: 200,
    cooldownMs: 15000,
  },
  tags: ["FREE_TIER", "STREAMING", "FUSION"],
};

const OMNIROUTE_CONFIG: SubRouterConfig = {
  id: "omniroute",
  name: "OmniRoute Gateway",
  priority: 2,
  enabled: true,
  proxyMount: "/proxy/omni",
  healthEndpoint: "/health",
  modelsEndpoint: "/v1/models",
  apiKeyHeader: "Authorization",
  defaultModel: "auto",
  supportedModels: [
    "auto",
    "fast",
    "cheap",
    "gpt-4o-mini",
    "gemini-flash",
    "claude-haiku",
  ],
  maxRetries: 2,
  timeoutMs: 30000,
  rateLimit: {
    maxRequestsPerMinute: 150,
    cooldownMs: 20000,
  },
  tags: ["FREE_TIER", "STREAMING"],
};

const LITELLM_CONFIG: SubRouterConfig = {
  id: "litellm",
  name: "LiteLLM Enterprise Proxy",
  priority: 4,
  // RETIRED (Round 4 prompt 09): LiteLLM is installed but not running, port 4000
  // is closed, and FreeLLMAPI → OmniRoute → Ollama already covers everything it
  // did. Entry kept for history; never probed or routed.
  enabled: false,
  retired: true,
  proxyMount: "/proxy/litellm",
  healthEndpoint: "/health",
  modelsEndpoint: "/v1/models",
  apiKeyHeader: "Authorization",
  defaultModel: "gpt-4o-mini",
  supportedModels: [
    "gpt-4o",
    "gpt-4o-mini",
    "claude-3.5-sonnet",
    "gemini-2.0-pro",
    "gemini-2.0-flash",
  ],
  maxRetries: 1,
  timeoutMs: 45000,
  rateLimit: {
    maxRequestsPerMinute: 100,
    cooldownMs: 10000,
  },
  tags: ["PAID", "ENTERPRISE", "STREAMING"],
};

const ROUTELLM_CONFIG: SubRouterConfig = {
  id: "routellm",
  name: "RouteLLM Cost-Quality Optimizer",
  priority: 3,
  // RETIRED (Round 4 prompt 09): the cost-quality threshold below is pure
  // in-process logic; the RouteLLM service is not needed. Entry kept for
  // history; never probed or routed.
  enabled: false,
  retired: true,
  proxyMount: "/proxy/routellm",
  healthEndpoint: "/health",
  modelsEndpoint: "/v1/models",
  defaultModel: "router-mf",
  supportedModels: [
    "router-mf",                  // Matrix factorization router
    "router-bert",                // BERT-based router
  ],
  maxRetries: 1,
  timeoutMs: 10000,
  rateLimit: {
    maxRequestsPerMinute: 500,
    cooldownMs: 5000,
  },
  tags: ["COST_OPTIMIZER"],
};

const OLLAMA_CONFIG: SubRouterConfig = {
  id: "ollama",
  name: "Ollama Local Runtime",
  priority: 5,
  enabled: true,
  proxyMount: "/proxy/ollama",
  healthEndpoint: "/api/tags",
  modelsEndpoint: "/api/tags",
  defaultModel: "llama3.1:8b",
  supportedModels: [
    "llama3.1:8b",
    "llama3.1:70b",
    "mistral:7b",
    "gemma2:9b",
    "phi3:mini",
    "qwen2:7b",
    "medllama2:7b",
  ],
  maxRetries: 1,
  timeoutMs: 60000,
  rateLimit: {
    maxRequestsPerMinute: 30,     // Local GPU bound
    cooldownMs: 1000,
  },
  tags: ["LOCAL", "PRIVACY_SAFE", "STREAMING"],
};

// ─── Routing Policies ─────────────────────────────────────────────

const ROUTING_POLICIES: RoutingPolicy[] = [
  {
    id: "deterministic-ops",
    intentCategories: [
      "hospital_census",
      "patient_lookup",
      "bed_status",
      "billing_query",
      "identity_query",
    ],
    routerChain: [],
    skipLLM: true,
    forceLocal: false,
    description: "Hospital operational queries → deterministic handlers, no LLM needed",
  },
  {
    id: "clinical-reasoning",
    intentCategories: [
      "clinical_reasoning",
      "differential_diagnosis",
      "drug_interaction",
      "treatment_plan",
    ],
    routerChain: ["freellmapi", "omniroute", "ollama"],
    skipLLM: false,
    forceLocal: false,
    maxCostTier: "premium",
    description: "Clinical reasoning → strong models, full failover chain",
  },
  {
    id: "simple-chat",
    intentCategories: [
      "general_chat",
      "greeting",
      "help",
    ],
    routerChain: ["freellmapi", "omniroute", "ollama"],
    skipLLM: false,
    forceLocal: false,
    maxCostTier: "free",
    description: "Simple chat → cheapest available model",
  },
  {
    id: "lab-pharmacy-orders",
    intentCategories: [
      "lab_order",
      "pharmacy_order",
    ],
    routerChain: ["freellmapi", "ollama"],
    skipLLM: false,
    forceLocal: false,
    maxCostTier: "free",
    description: "Lab/Pharmacy orders → parse entities then deterministic execution",
  },
  {
    id: "radiology-imaging",
    intentCategories: [
      "radiology_order",
      "image_analysis",
    ],
    routerChain: ["freellmapi", "omniroute", "ollama"],
    skipLLM: false,
    forceLocal: false,
    maxCostTier: "standard",
    // Ollama fallback is TEXT-ONLY for now: no local vision model is installed
    // (verified 2026-09-28 — Ollama has qwen2.5:1.5b and bge-m3 only). Pull a
    // vision model (e.g. llava / qwen2.5vl) to enable local image analysis.
    description: "Radiology/Imaging → vision-capable models",
  },
  {
    id: "evidence-search",
    intentCategories: [
      "evidence_search",
      "literature_search",
      "guideline_lookup",
    ],
    routerChain: ["freellmapi", "omniroute", "ollama"],
    skipLLM: false,
    forceLocal: false,
    maxCostTier: "standard",
    description: "Evidence/literature → RAG-enhanced models",
  },
  {
    id: "voice-command",
    intentCategories: [
      "voice_command",
      "voice_dictation",
    ],
    routerChain: ["ollama", "freellmapi"],
    skipLLM: false,
    forceLocal: false,
    maxCostTier: "free",
    description: "Voice commands → local first for latency, then cloud",
  },
  {
    id: "privacy-sensitive",
    intentCategories: [
      "patient_notes",
      "consent_generation",
      "discharge_summary",
    ],
    routerChain: ["ollama"],
    skipLLM: false,
    forceLocal: true,
    description: "Privacy-sensitive patient data → local models only (Ollama)",
  },
];

// ─── Master Configuration ─────────────────────────────────────────

export const DEFAULT_ROUTER_CONFIG: AstraRouterConfig = {
  version: "1.0.0",
  masterKeyEnvVar: "ASTRA_MASTER_KEY",
  subrouters: {
    freellmapi: FREELLMAPI_CONFIG,
    omniroute: OMNIROUTE_CONFIG,
    litellm: LITELLM_CONFIG,
    routellm: ROUTELLM_CONFIG,
    ollama: OLLAMA_CONFIG,
  },
  routingPolicies: ROUTING_POLICIES,
  globalSettings: {
    healthCheckIntervalMs: 30000,
    circuitBreakerThreshold: 3,
    circuitBreakerRecoveryMs: 60000,
    enableAuditLogging: true,
    privacyMode: false,
  },
};

/**
 * Get the routing policy for a given intent category.
 * Returns the "simple-chat" policy as default fallback.
 */
export function getPolicyForIntent(intentCategory: string): RoutingPolicy {
  const policy = DEFAULT_ROUTER_CONFIG.routingPolicies.find((p) =>
    p.intentCategories.includes(intentCategory)
  );
  return policy ?? DEFAULT_ROUTER_CONFIG.routingPolicies.find((p) => p.id === "simple-chat")!;
}

/**
 * Get sub-router config by ID.
 */
export function getSubRouterConfig(id: string): SubRouterConfig | undefined {
  return DEFAULT_ROUTER_CONFIG.subrouters[id as keyof typeof DEFAULT_ROUTER_CONFIG.subrouters];
}
