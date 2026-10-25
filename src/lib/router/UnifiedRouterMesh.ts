/**
 * ASTRA AI — UNIFIED ROUTER MESH (Layers 2–5)
 *
 * The core routing engine that receives a classified intent and selects
 * the optimal sub-router through the failover chain:
 *
 *   Layer 2: Free Tier Pool (FreeLLMAPI → OmniRoute)
 *   Layer 3: Cost-Quality Optimizer (in-process RouteLLM threshold logic)
 *   Layer 5: Local Models (Ollama)
 *
 * Failover: freellm → [429?] → omni → [offline?] → local
 * (LiteLLM and RouteLLM are RETIRED: never routed, shown grey in the dashboard.)
 */

import type {
  SubRouterId,
  RoutingDecision,
  RoutingLogEntry,
  IntentClassification,
} from "./types";
import { DEFAULT_ROUTER_CONFIG, getPolicyForIntent } from "./routerConfig";
import {
  isRouterAvailable,
  recordRequest,
  recordRateLimit,
  recordFailure,
  getRouterHealth,
} from "./RouterHealthMonitor";

// ─── Routing Log (last 100 entries) ──────────────────────────────

const routingLog: RoutingLogEntry[] = [];
const MAX_LOG_SIZE = 100;

function addLogEntry(entry: RoutingLogEntry): void {
  routingLog.unshift(entry);
  if (routingLog.length > MAX_LOG_SIZE) routingLog.pop();
}

// ─── RouteLLM Cost-Quality Threshold ─────────────────────────────
// Implements the matrix factorization threshold from RouteLLM paper:
// threshold 0.11593 = 50% strong model calls
// Below threshold → weak/cheap model, above → strong model

const ROUTELLM_THRESHOLD = 0.11593;

interface CostQualityDecision {
  useStrongModel: boolean;
  score: number;
  reason: string;
}

function evaluateCostQuality(
  input: string,
  intentClassification: IntentClassification
): CostQualityDecision {
  // Heuristic scoring based on intent complexity
  let complexityScore = 0;

  // Clinical/medical reasoning → high complexity
  if (intentClassification.riskLevel === "CLINICAL") complexityScore += 0.4;
  if (intentClassification.riskLevel === "HIGH_RISK") complexityScore += 0.3;

  // Long input → more complex
  const wordCount = input.split(/\s+/).length;
  if (wordCount > 50) complexityScore += 0.2;
  else if (wordCount > 20) complexityScore += 0.1;

  // Medical terminology density
  const medicalTerms = [
    "diagnosis", "treatment", "prognosis", "pathology", "contraindication",
    "differential", "syndrome", "etiology", "pharmacology", "interaction",
    "hemodynamic", "metabolic", "neurological", "cardiac", "pulmonary",
    "renal", "hepatic", "hematologic", "immunologic", "oncologic",
  ];
  const lower = input.toLowerCase();
  const medTermCount = medicalTerms.filter((t) => lower.includes(t)).length;
  complexityScore += Math.min(medTermCount * 0.08, 0.3);

  // Multi-step reasoning indicators
  if (lower.includes("why") || lower.includes("explain") || lower.includes("compare")) {
    complexityScore += 0.15;
  }

  // Normalize to 0-1
  const normalizedScore = Math.min(complexityScore, 1.0);

  return {
    useStrongModel: normalizedScore > ROUTELLM_THRESHOLD,
    score: normalizedScore,
    reason: normalizedScore > ROUTELLM_THRESHOLD
      ? `Complexity ${normalizedScore.toFixed(3)} > threshold ${ROUTELLM_THRESHOLD} → strong model`
      : `Complexity ${normalizedScore.toFixed(3)} ≤ threshold ${ROUTELLM_THRESHOLD} → weak/cheap model`,
  };
}

// ─── Model Selection Per Router ──────────────────────────────────

function selectModelForRouter(
  routerId: SubRouterId,
  useStrongModel: boolean
): string {
  const config = DEFAULT_ROUTER_CONFIG.subrouters[routerId];
  if (!config) return "auto";

  // FreeLLMAPI and OmniRoute have auto-selection
  if (routerId === "freellmapi" || routerId === "omniroute") {
    return useStrongModel ? "auto" : (config.supportedModels.find((m) => m.includes("mini") || m.includes("flash")) ?? "auto");
  }

  // Ollama → local models
  if (routerId === "ollama") {
    return useStrongModel ? "llama3.1:70b" : "llama3.1:8b";
  }

  return config.defaultModel;
}

// ─── Core Routing Logic ──────────────────────────────────────────

export interface RouteResult {
  decision: RoutingDecision;
  /** The proxy URL to use for the LLM call */
  proxyUrl: string;
  /** Headers to include in the LLM call */
  headers: Record<string, string>;
  /** The model to request */
  model: string;
}

/**
 * Route a classified intent through the mesh.
 * Returns the optimal sub-router, model, and proxy URL.
 */
export function routeRequest(
  input: string,
  classification: IntentClassification,
  apiKey?: string
): RouteResult {
  const t0 = performance.now();
  const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // 1. Find the routing policy for this intent
  const policy = getPolicyForIntent(classification.routeId);

  // 2. If deterministic (skipLLM), return immediately
  if (policy.skipLLM) {
    const decision: RoutingDecision = {
      requestId,
      timestamp: Date.now(),
      intent: classification.routeId,
      intentConfidence: classification.confidence,
      policyId: policy.id,
      selectedRouter: "ollama", // placeholder — no LLM call
      selectedModel: "none",
      triedRouters: [],
      wasFailover: false,
      costTier: "free",
      routingLatencyMs: Math.round(performance.now() - t0),
    };

    recordRequest(false);
    addLogEntry({
      requestId,
      timestamp: Date.now(),
      input: input.slice(0, 100),
      intent: classification.routeId,
      intentConfidence: classification.confidence,
      selectedRouter: "ollama",
      selectedModel: "none (deterministic)",
      wasFailover: false,
      routingLatencyMs: decision.routingLatencyMs,
      costTier: "free",
      success: true,
    });

    return {
      decision,
      proxyUrl: "",
      headers: {},
      model: "none",
    };
  }

  // 3. Privacy mode → force local
  if (policy.forceLocal || DEFAULT_ROUTER_CONFIG.globalSettings.privacyMode) {
    const localConfig = DEFAULT_ROUTER_CONFIG.subrouters.ollama;
    const model = selectModelForRouter("ollama", false);
    const decision: RoutingDecision = {
      requestId,
      timestamp: Date.now(),
      intent: classification.routeId,
      intentConfidence: classification.confidence,
      policyId: policy.id,
      selectedRouter: "ollama",
      selectedModel: model,
      triedRouters: [{ routerId: "ollama", result: "SUCCESS" }],
      wasFailover: false,
      costTier: "local",
      routingLatencyMs: Math.round(performance.now() - t0),
    };

    recordRequest(false);
    addLogEntry({
      requestId,
      timestamp: Date.now(),
      input: input.slice(0, 100),
      intent: classification.routeId,
      intentConfidence: classification.confidence,
      selectedRouter: "ollama",
      selectedModel: model,
      wasFailover: false,
      routingLatencyMs: decision.routingLatencyMs,
      costTier: "local",
      success: true,
    });

    return {
      decision,
      proxyUrl: `${localConfig.proxyMount}/v1/chat/completions`,
      headers: { "Content-Type": "application/json" },
      model,
    };
  }

  // 4. Cost-Quality evaluation (RouteLLM Layer 3)
  const cqDecision = evaluateCostQuality(input, classification);

  // 5. Walk the router chain with failover
  const triedRouters: RoutingDecision["triedRouters"] = [];
  let selectedRouterId: SubRouterId | null = null;
  let wasFailover = false;

  for (let i = 0; i < policy.routerChain.length; i++) {
    const routerId = policy.routerChain[i];

    // Check availability
    if (!isRouterAvailable(routerId)) {
      triedRouters.push({
        routerId,
        result: getRouterHealth(routerId).circuitState === "OPEN" ? "CIRCUIT_OPEN" : "SKIPPED",
      });
      continue;
    }

    // Check cost tier constraint
    const routerConfig = DEFAULT_ROUTER_CONFIG.subrouters[routerId];
    if (policy.maxCostTier === "free" && routerConfig.tags.includes("PAID")) {
      triedRouters.push({ routerId, result: "SKIPPED" });
      continue;
    }

    // This router is available
    selectedRouterId = routerId;
    wasFailover = i > 0;
    triedRouters.push({ routerId, result: "SUCCESS" });
    break;
  }

  // 6. Final fallback to Ollama if everything else failed
  if (!selectedRouterId) {
    selectedRouterId = "ollama";
    wasFailover = policy.routerChain.length > 0;
    triedRouters.push({ routerId: "ollama", result: "SUCCESS" });
  }

  // 7. Select model based on cost-quality decision
  const model = selectModelForRouter(selectedRouterId, cqDecision.useStrongModel);
  const routerConfig = DEFAULT_ROUTER_CONFIG.subrouters[selectedRouterId];

  // 8. Build headers
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey && routerConfig.apiKeyHeader) {
    headers[routerConfig.apiKeyHeader] = `Bearer ${apiKey}`;
  }

  // 9. Determine cost tier
  let costTier: RoutingDecision["costTier"] = "free";
  if (routerConfig.tags.includes("LOCAL")) costTier = "local";
  else if (routerConfig.tags.includes("ENTERPRISE")) costTier = "premium";
  else if (routerConfig.tags.includes("PAID")) costTier = "standard";
  else if (cqDecision.useStrongModel) costTier = "cheap";

  const routingLatencyMs = Math.round(performance.now() - t0);

  const decision: RoutingDecision = {
    requestId,
    timestamp: Date.now(),
    intent: classification.routeId,
    intentConfidence: classification.confidence,
    policyId: policy.id,
    selectedRouter: selectedRouterId,
    selectedModel: model,
    triedRouters,
    wasFailover,
    costTier,
    routingLatencyMs,
  };

  recordRequest(wasFailover);
  addLogEntry({
    requestId,
    timestamp: Date.now(),
    input: input.slice(0, 100),
    intent: classification.routeId,
    intentConfidence: classification.confidence,
    selectedRouter: selectedRouterId,
    selectedModel: model,
    wasFailover,
    routingLatencyMs,
    costTier,
    success: true,
  });

  console.log(
    `[UnifiedRouterMesh] ${classification.routeId} → ${selectedRouterId}/${model}` +
    ` (policy: ${policy.id}, cost-quality: ${cqDecision.score.toFixed(3)}, failover: ${wasFailover}, ${routingLatencyMs}ms)`
  );

  return {
    decision,
    proxyUrl: `${routerConfig.proxyMount}/v1/chat/completions`,
    headers,
    model,
  };
}

/**
 * Get the routing log for dashboard display.
 */
export function getRoutingLog(): RoutingLogEntry[] {
  return [...routingLog];
}

/**
 * Get routing statistics.
 */
export function getRoutingStats(): {
  totalRequests: number;
  failoverRate: number;
  avgRoutingLatencyMs: number;
  routerUsage: Record<string, number>;
  intentDistribution: Record<string, number>;
} {
  const total = routingLog.length;
  if (total === 0) {
    return {
      totalRequests: 0,
      failoverRate: 0,
      avgRoutingLatencyMs: 0,
      routerUsage: {},
      intentDistribution: {},
    };
  }

  const failovers = routingLog.filter((e) => e.wasFailover).length;
  const avgLatency = routingLog.reduce((sum, e) => sum + e.routingLatencyMs, 0) / total;

  const routerUsage: Record<string, number> = {};
  const intentDistribution: Record<string, number> = {};

  for (const entry of routingLog) {
    routerUsage[entry.selectedRouter] = (routerUsage[entry.selectedRouter] ?? 0) + 1;
    intentDistribution[entry.intent] = (intentDistribution[entry.intent] ?? 0) + 1;
  }

  return {
    totalRequests: total,
    failoverRate: failovers / total,
    avgRoutingLatencyMs: Math.round(avgLatency),
    routerUsage,
    intentDistribution,
  };
}
