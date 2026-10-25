/**
 * Round 4 prompt 09 — router chain contract after the LiteLLM retirement.
 *
 * LiteLLM is installed but retired and not running (port 4000 closed), so no
 * routing chain may route through it: requests that did only wasted time on a
 * dead hop. Every active chain must end on a loopback provider so patient data
 * can stay local even when the cloud gateways are down.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROUTER_CONFIG,
  getPolicyForIntent,
  isRouterAvailable,
  recordFailure,
  routeRequest,
  getSubRouterConfig,
} from "./index";

/** Loopback providers a chain may legitimately terminate on. */
const LOCAL_PROVIDERS = new Set(["ollama", "freellmapi"]);

function classification(routeId: string) {
  return {
    routeId,
    confidence: 1,
    department: "CLINICAL",
    riskLevel: "CLINICAL",
    requiresLLM: true,
    matchedTokens: [],
    fallbackUsed: false,
  };
}

describe("router chain contract (post-LiteLLM retirement)", () => {
  it("contains no litellm or routellm entry in any routing chain", () => {
    for (const policy of DEFAULT_ROUTER_CONFIG.routingPolicies) {
      expect(policy.routerChain, `policy ${policy.id}`).not.toContain("litellm");
      expect(policy.routerChain, `policy ${policy.id}`).not.toContain("routellm");
    }
  });

  it("ends every active chain on a local provider (patient data stays local)", () => {
    for (const policy of DEFAULT_ROUTER_CONFIG.routingPolicies) {
      if (policy.skipLLM || policy.routerChain.length === 0) continue;
      const last = policy.routerChain[policy.routerChain.length - 1];
      expect(LOCAL_PROVIDERS.has(last), `policy ${policy.id} ends on ${last}`).toBe(true);
      // ...and Ollama is reachable in every chain as the final local backstop.
      expect(policy.routerChain, `policy ${policy.id}`).toContain("ollama");
    }
  });

  it("ends the clinical, radiology and evidence chains on ollama specifically", () => {
    for (const id of ["clinical-reasoning", "radiology-imaging", "evidence-search"]) {
      const policy = DEFAULT_ROUTER_CONFIG.routingPolicies.find((p) => p.id === id);
      expect(policy).toBeDefined();
      const chain = policy!.routerChain;
      expect(chain[chain.length - 1]).toBe("ollama");
    }
  });

  it("keeps radiology-imaging on freellmapi → omniroute → ollama (was a dead [freellmapi, litellm] hop)", () => {
    expect(getPolicyForIntent("image_analysis").routerChain).toEqual(["freellmapi", "omniroute", "ollama"]);
    expect(getPolicyForIntent("evidence_search").routerChain).toEqual(["freellmapi", "omniroute", "ollama"]);
    expect(getPolicyForIntent("clinical_reasoning").routerChain).toEqual(["freellmapi", "omniroute", "ollama"]);
  });

  it("marks LiteLLM and RouteLLM as retired and never available for routing", () => {
    for (const id of ["litellm", "routellm"] as const) {
      const config = getSubRouterConfig(id);
      expect(config?.retired).toBe(true);
      expect(config?.enabled).toBe(false);
      expect(isRouterAvailable(id)).toBe(false);
    }
  });

  it("falls back to OmniRoute, then Ollama, with FreeLLMAPI stopped (simulated)", () => {
    const threshold = DEFAULT_ROUTER_CONFIG.globalSettings.circuitBreakerThreshold;
    for (let i = 0; i < threshold; i++) recordFailure("freellmapi", "simulated outage");

    const clinical = routeRequest("chest pain workup", classification("clinical_reasoning"));
    expect(clinical.decision.selectedRouter).toBe("omniroute");
    expect(clinical.decision.triedRouters).toContainEqual({ routerId: "freellmapi", result: "CIRCUIT_OPEN" });

    const radiology = routeRequest("chest x-ray finding", classification("image_analysis"));
    expect(radiology.decision.selectedRouter).toBe("omniroute");

    const evidence = routeRequest("sepsis bundles trial", classification("evidence_search"));
    expect(evidence.decision.selectedRouter).toBe("omniroute");

    // OmniRoute down too → every chain must land on local Ollama.
    for (let i = 0; i < threshold; i++) recordFailure("omniroute", "simulated outage");

    const local = routeRequest("chest pain workup", classification("clinical_reasoning"));
    expect(local.decision.selectedRouter).toBe("ollama");
    expect(local.decision.costTier).toBe("local");

    expect(routeRequest("chest x-ray finding", classification("image_analysis")).decision.selectedRouter).toBe("ollama");
    expect(routeRequest("sepsis bundles trial", classification("evidence_search")).decision.selectedRouter).toBe("ollama");
  });
});
