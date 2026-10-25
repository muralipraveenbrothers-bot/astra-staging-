import { describe, expect, it } from "vitest";
import { safeParsePlan, type Plan } from "./planSchema";

function validPlan(): Plan {
  return {
    goal: "Open the local queue",
    dataClass: "INTERNAL",
    steps: [{
      id: "s1",
      intent: "Open queue",
      toolFamily: "queue",
      requirements: { reasoning: "low", domain: "ops", privacy: "INTERNAL", contextSize: "small" },
      browser: { goalText: "open queue", allowedHosts: ["http://localhost:5173"] },
      needsApproval: false,
      expectedObservation: "Queue heading is visible",
    }],
    successCriteria: ["Queue page opened"],
    stopConditions: ["User cancels"],
  };
}

describe("Hermes planSchema", () => {
  it("rejects 13 steps", () => {
    const plan = validPlan();
    plan.steps = Array.from({ length: 13 }, (_, i) => ({ ...plan.steps[0], id: `s${i}` }));
    expect(safeParsePlan(plan).success).toBe(false);
  });

  it("rejects browser hosts outside the allow-list", () => {
    const plan = validPlan();
    plan.steps[0].browser = { goalText: "bad host", allowedHosts: ["https://example.com"] };
    expect(safeParsePlan(plan).success).toBe(false);
  });

  it("rejects plans that name a provider or model", () => {
    const plan = validPlan() as Plan & { model?: string };
    plan.model = "gpt-test";
    expect(safeParsePlan(plan).success).toBe(false);
  });

  it("accepts a valid requirements-only plan", () => {
    const parsed = safeParsePlan(validPlan());
    expect(parsed.success).toBe(true);
  });
});
