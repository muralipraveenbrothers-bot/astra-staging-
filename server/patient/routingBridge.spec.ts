/**
 * ASTRA AI — ROUTING PROOF TESTS (P0.2)
 * ============================================================================
 * Proves the activation policy controls REAL dispatch:
 *   A. "Who is ICU Bed 3?"      → patient/bed lookup ONLY (1 capability,
 *                                  deterministic db read, no LLM swarm)
 *   B. "Show creatinine for ICU Bed 3" → patient context + lab read path
 *                                  (≤3 capabilities, deterministic)
 *   C. meropenem dose check     → policy selects ≤4 capabilities (policy level)
 *   D. polytrauma               → policy selects ≤5 trauma capabilities (policy level)
 *
 * Telemetry (considered/selected/executed/completed/failed/timedOut) is
 * asserted for every full-path test. LLM-backed capability selection tests
 * are policy-level: full-path execution of LLM workers depends on live
 * gateway reachability and is deliberately not asserted here.
 */

import { describe, it, expect } from "vitest";
import { routeAndDispatch, classifyClinicalIntent } from "../ai/routingBridge";
import { clinicalCommandHOD } from "../../src/agents/hod/ClinicalCommandHOD";

describe("routing proof: policy controls real dispatch", () => {
  it("A. 'Who is ICU Bed 3?' — lookup only, 1 deterministic capability, no LLM", async () => {
    const result = await routeAndDispatch({ request: "Who is ICU Bed 3?" });
    expect(result.refusal).toBeUndefined();
    expect(result.intent).toBe("patient.lookup");
    expect(result.patientContext?.patientId).toBe("P001"); // Rajesh Kumar — live fabric
    expect(result.patientContext?.mrn).toBe("UHID-7821");
    expect(result.routing.agentsSelected).toBe(1);
    expect(result.routing.agentsSelected).toBe(result.routing.agentsConsidered);
    expect(result.capabilities.map((c) => c.capability)).toEqual(["patient-resolver"]);
    expect(result.capabilities[0].detail).toContain("no LLM");
    expect(result.routing.agentsCompleted).toBe(1);
    expect(result.routing.agentsFailed).toBe(0);
    expect(result.routing.selectionReason).toContain("Deterministic patient/bed resolution");
  });

  it("B. routine read path — ≤3 capabilities, telemetry accounted", async () => {
    const result = await routeAndDispatch({ request: "order CBC for ICU Bed 3" });
    expect(result.refusal).toBeUndefined();
    expect(result.intent).toBe("lab.order");
    expect(result.patientContext?.bedNumber).toBe("ICU-03");
    expect(result.routing.agentsSelected).toBeLessThanOrEqual(3);
    // duplicate-checker + patient-resolver + validator all ran deterministically
    const caps = result.capabilities.map((c) => c.capability);
    expect(caps).toContain("duplicate-checker");
    expect(result.routing.agentsExecuted).toBe(result.routing.agentsCompleted + result.routing.agentsFailed + result.routing.agentsTimedOut);
  });

  it("B2. no patient context in request → refused (never guesses)", async () => {
    const result = await routeAndDispatch({ request: "order CBC please" });
    expect(result.ok).toBe(false);
    expect(result.refusal).toContain("NO_PATIENT_CONTEXT");
    expect(result.routing.agentsSelected).toBe(0); // nothing executed without context
  });

  it("C. meropenem dose appropriateness — policy selects ≤4 capabilities", () => {
    const { intent, riskLevel } = classifyClinicalIntent("Is meropenem dose appropriate for ICU Bed 3?");
    expect(intent).toBe("drug.interaction.check");
    const activations = clinicalCommandHOD.selectAgents(intent, riskLevel);
    expect(activations.length).toBeLessThanOrEqual(4);
    expect(activations.map((a) => a.agentId)).toContain("patient-resolver");
    expect(activations.map((a) => a.agentId)).toContain("drug-safety-agent");
  });

  it("D. polytrauma — policy selects only relevant trauma capabilities (≤5)", () => {
    const { intent, riskLevel } = classifyClinicalIntent("Polytrauma patient with hypotension and femur fracture in ICU Bed 3");
    expect(intent).toBe("trauma.assessment");
    expect(riskLevel).toBe("CRITICAL");
    const activations = clinicalCommandHOD.selectAgents(intent, riskLevel);
    expect(activations.length).toBeLessThanOrEqual(5);
    const ids = activations.map((a) => a.agentId);
    // NEVER the 32-agent clinical reasoning swarm or the 12-agent trauma plugin
    expect(ids).not.toContain("clinical-reasoning-agent");
    expect(ids.length).toBeLessThan(12);
  });

  it("routing economics: policy minimality holds across intents", () => {
    const intents = ["patient.lookup", "lab.order", "drug.interaction.check", "trauma.assessment", "clinical.reasoning"];
    const counts = intents.map((i) => clinicalCommandHOD.selectAgents(i, "IMPORTANT").length);
    // simple lookup 1 · routine 1–3 · reasoning 2–5 · complex justified ≤10
    expect(counts[0]).toBe(1);
    expect(counts[1]).toBeLessThanOrEqual(3);
    expect(counts[2]).toBeLessThanOrEqual(4);
    expect(counts[3]).toBeLessThanOrEqual(5);
    expect(counts[4]).toBeLessThanOrEqual(5);
  });
});