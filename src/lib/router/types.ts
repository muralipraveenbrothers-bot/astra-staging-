/**
 * ASTRA AI — UNIFIED ROUTER MESH: TYPE DEFINITIONS
 *
 * Core type system for the unified routing engine that unifies
 * FreeLLMAPI, OmniRoute, and Ollama. LiteLLM and RouteLLM are RETIRED:
 * their configs/entries are kept for history but are never probed or routed.
 */

// ─── Sub-Router Identity ──────────────────────────────────────────
export type SubRouterId =
  | "freellmapi"
  | "omniroute"
  | "litellm"
  | "routellm"
  | "ollama";

// ─── Circuit Breaker States ───────────────────────────────────────
export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

// ─── Per-Router Configuration ─────────────────────────────────────
export interface SubRouterConfig {
  id: SubRouterId;
  name: string;
  priority: number;              // Lower = preferred (1 = first try)
  enabled: boolean;
  proxyMount: string;            // Vite proxy path, e.g. "/proxy/freellmapi"
  healthEndpoint: string;        // Relative path for health probe
  modelsEndpoint: string;        // Relative path for model listing
  apiKeyHeader?: string;         // e.g. "Authorization: Bearer ..."
  defaultModel: string;          // Default model to use
  supportedModels: string[];     // Known available models
  maxRetries: number;
  timeoutMs: number;
  rateLimit: {
    maxRequestsPerMinute: number;
    cooldownMs: number;          // Cooldown after 429
  };
  tags: SubRouterTag[];          // Capability tags
  /** Retired routers are kept for history but never probed or routed. */
  retired?: boolean;
}

export type SubRouterTag =
  | "FREE_TIER"
  | "PAID"
  | "ENTERPRISE"
  | "LOCAL"
  | "PRIVACY_SAFE"
  | "VISION"
  | "VOICE"
  | "STREAMING"
  | "FUSION"
  | "COST_OPTIMIZER";

// ─── Master Router Configuration ──────────────────────────────────
export interface AstraRouterConfig {
  version: string;
  masterKeyEnvVar: string;
  subrouters: Record<SubRouterId, SubRouterConfig>;
  routingPolicies: RoutingPolicy[];
  globalSettings: {
    healthCheckIntervalMs: number;
    circuitBreakerThreshold: number;   // Consecutive failures to open
    circuitBreakerRecoveryMs: number;  // Time before HALF_OPEN
    enableAuditLogging: boolean;
    privacyMode: boolean;              // Force all traffic through local
  };
}

// ─── Routing Policy ───────────────────────────────────────────────
export interface RoutingPolicy {
  /** Unique ID for this policy */
  id: string;
  /** Intent categories this policy handles */
  intentCategories: string[];
  /** Ordered chain of sub-routers to try */
  routerChain: SubRouterId[];
  /** Skip LLM entirely (deterministic handler) */
  skipLLM: boolean;
  /** Force local models (privacy-sensitive data) */
  forceLocal: boolean;
  /** Maximum cost tier allowed */
  maxCostTier?: "free" | "cheap" | "standard" | "premium";
  /** Description for dashboard display */
  description: string;
}

// ─── Health Status ────────────────────────────────────────────────
export interface SubRouterHealth {
  id: SubRouterId;
  status: "ONLINE" | "DEGRADED" | "OFFLINE" | "RATE_LIMITED" | "UNKNOWN" | "RETIRED";
  circuitState: CircuitState;
  latencyMs: number;
  lastChecked: number;            // timestamp
  lastSuccess: number;            // timestamp
  consecutiveFailures: number;
  modelCount: number;
  models: string[];
  rateLimit: {
    remaining: number;
    resetAt: number;              // timestamp
  };
  error?: string;
}

export interface RouterHealthSnapshot {
  timestamp: number;
  subrouters: Record<SubRouterId, SubRouterHealth>;
  activePolicy: string;
  totalRequests: number;
  totalFailovers: number;
}

// ─── Routing Decision (output of the mesh) ────────────────────────
export interface RoutingDecision {
  requestId: string;
  timestamp: number;
  intent: string;
  intentConfidence: number;
  policyId: string;
  /** The sub-router that was ultimately selected */
  selectedRouter: SubRouterId;
  /** The specific model selected */
  selectedModel: string;
  /** Sub-routers that were tried but failed/skipped */
  triedRouters: {
    routerId: SubRouterId;
    result: "SUCCESS" | "RATE_LIMITED" | "TIMEOUT" | "ERROR" | "CIRCUIT_OPEN" | "SKIPPED";
    latencyMs?: number;
    error?: string;
  }[];
  /** Was this a failover from the primary router? */
  wasFailover: boolean;
  /** Cost tier of the selected route */
  costTier: "free" | "cheap" | "standard" | "premium" | "local";
  /** Total routing decision time (excludes LLM call) */
  routingLatencyMs: number;
}

// ─── Semantic Intent Classification ───────────────────────────────
export interface IntentRoute {
  id: string;
  name: string;
  department: string;
  utterances: string[];           // Canonical examples for matching
  riskLevel: "LOW" | "IMPORTANT" | "HIGH_RISK" | "CLINICAL";
  requiresLLM: boolean;
  requiredTools?: string[];
}

export interface IntentClassification {
  routeId: string;
  confidence: number;
  department: string;
  riskLevel: string;
  requiresLLM: boolean;
  matchedTokens: string[];
  fallbackUsed: boolean;
}

// ─── MCP Tool Definition ──────────────────────────────────────────
export interface MCPToolDefinition {
  name: string;
  description: string;
  namespace: string;              // e.g. "mcp-hospital", "mcp-clinical"
  inputSchema: Record<string, any>;
  outputSchema: Record<string, any>;
  requiredPermissions: string[];
  riskLevel: "LOW" | "IMPORTANT" | "HIGH_RISK" | "CLINICAL";
}

// ─── Department Dispatch ──────────────────────────────────────────
export type DepartmentId =
  | "LAB"
  | "PHARMACY"
  | "WARD"
  | "OT"
  | "BILLING"
  | "RADIOLOGY"
  | "RECEPTION"
  | "ICU"
  | "BLOOD_BANK";

export interface DepartmentNotification {
  id: string;
  departmentId: DepartmentId;
  type: "ORDER" | "ALERT" | "UPDATE" | "CLEARANCE" | "ESCALATION";
  priority: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  title: string;
  body: string;
  patientUhid?: string;
  orderId?: string;
  createdBy: string;
  createdAt: number;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: number;
}

// ─── Plugin Registry ──────────────────────────────────────────────
export interface RouterPlugin {
  id: string;
  name: string;
  version: string;
  type: "ROUTER" | "CLASSIFIER" | "TOOL_MESH" | "DISPATCHER";
  status: "READY" | "INSTALLING" | "ERROR" | "DISABLED" | "NOT_DETECTED" | "RETIRED";
  healthEndpoint?: string;
  lastHealthCheck?: number;
  config: Record<string, any>;
}

// ─── Routing Log Entry ───────────────────────────────────────────
export interface RoutingLogEntry {
  requestId: string;
  timestamp: number;
  input: string;
  intent: string;
  intentConfidence: number;
  selectedRouter: SubRouterId;
  selectedModel: string;
  wasFailover: boolean;
  routingLatencyMs: number;
  llmLatencyMs?: number;
  tokenCount?: number;
  costTier: string;
  success: boolean;
  error?: string;
}
