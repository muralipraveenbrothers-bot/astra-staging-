import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Plan } from "./planSchema";

const adapter = vi.hoisted(() => ({ hermesExecute: vi.fn() }));
const gateway = vi.hoisted(() => ({
  modelGatewayChat: vi.fn(),
  readModelGatewayEnv: vi.fn(() => ({ localModel: "local-test" })),
  LocalModelUnavailableError: class LocalModelUnavailableError extends Error {},
}));

vi.mock("../../agents/hermesAdapter", () => adapter);
vi.mock("../../ai/modelGateway", () => gateway);

function planJson(stepIntent = "Open queue"): Plan {
  return {
    goal: "Open queue",
    dataClass: "INTERNAL",
    steps: [{
      id: "s1",
      intent: stepIntent,
      toolFamily: "queue",
      requirements: { reasoning: "low", domain: "ops", privacy: "INTERNAL", contextSize: "small" },
      needsApproval: false,
      expectedObservation: "done",
    }],
    successCriteria: ["done"],
    stopConditions: ["stop"],
  };
}

describe("hermesPlanner", () => {
  beforeEach(async () => {
    vi.resetModules();
    adapter.hermesExecute.mockReset();
    gateway.modelGatewayChat.mockReset();
    gateway.readModelGatewayEnv.mockReturnValue({ localModel: "local-test" });
    const mod = await import("./hermesPlanner");
    mod.resetPlannerRunsForTests();
  });

  it("uses Hermes adapter for an INTERNAL goal", async () => {
    adapter.hermesExecute.mockReturnValue({ stdout: JSON.stringify(planJson()), stderr: "" });
    const { plan } = await import("./hermesPlanner");
    const run = await plan("department queue workflow", { decide: async (schemaId) => ({ answer: schemaId === "router.delegate_to" ? "none" : "proceed", abstained: false, confidence: 0.9, margin: 0.5 }) });
    expect(adapter.hermesExecute).toHaveBeenCalled();
    expect(gateway.modelGatewayChat).not.toHaveBeenCalled();
    expect(run.status).toBe("completed");
  });

  it("keeps PHI away from Hermes and uses the local gateway or refuses", async () => {
    gateway.modelGatewayChat.mockResolvedValue({ text: JSON.stringify({ ...planJson(), dataClass: "PHI", steps: [{ ...planJson().steps[0], requirements: { ...planJson().steps[0].requirements, privacy: "PHI" } }] }) });
    const { plan } = await import("./hermesPlanner");
    const run = await plan("patient name Test Person UHID 123456", { decide: async () => ({ answer: "proceed", abstained: false, confidence: 0.9, margin: 0.5 }) });
    expect(adapter.hermesExecute).not.toHaveBeenCalled();
    expect(gateway.modelGatewayChat).toHaveBeenCalled();
    expect(run.dataClass).toBe("PHI");
  });

  it("fails closed after invalid JSON twice", async () => {
    adapter.hermesExecute.mockReturnValue({ stdout: "not json", stderr: "" });
    const { plan } = await import("./hermesPlanner");
    const run = await plan("department queue workflow");
    expect(adapter.hermesExecute).toHaveBeenCalledTimes(2);
    expect(run.status).toBe("failed");
    expect(run.reason).toContain("plan_invalid_json_fail_closed");
  });

  it("stops on repeated step and observation hash three times", async () => {
    const p = planJson("Repeat status");
    p.steps = [0, 1, 2].map((i) => ({ ...p.steps[0], id: `s${i}` }));
    adapter.hermesExecute.mockReturnValue({ stdout: JSON.stringify(p), stderr: "" });
    const { plan } = await import("./hermesPlanner");
    const run = await plan("department queue workflow", {
      decide: async (schemaId) => ({ answer: schemaId === "router.delegate_to" ? "none" : "proceed", abstained: false, confidence: 0.9, margin: 0.5 }),
      observeStep: () => "same observation",
    });
    expect(run.status).toBe("failed");
    expect(run.reason).toBe("loop_detected");
  });

  it("refuses secret-looking goals and does not call models", async () => {
    const { plan } = await import("./hermesPlanner");
    const run = await plan("use sk-testsecret123456 password=cleartext");
    expect(run.status).toBe("failed");
    expect(run.reason).toBe("secret_refused");
    expect(JSON.stringify(run)).not.toContain("cleartext");
    expect(adapter.hermesExecute).not.toHaveBeenCalled();
    expect(gateway.modelGatewayChat).not.toHaveBeenCalled();
  });

  it("routes unknown delegated agents to human_review", async () => {
    adapter.hermesExecute.mockReturnValue({ stdout: JSON.stringify(planJson()), stderr: "" });
    const { plan } = await import("./hermesPlanner");
    const run = await plan("department queue workflow", {
      decide: async (schemaId) => schemaId === "router.delegate_to"
        ? { answer: "New Agent", abstained: false, confidence: 0.9, margin: 0.5 }
        : { answer: "proceed", abstained: false, confidence: 0.9, margin: 0.5 },
    });
    expect(run.status).toBe("human_review");
    expect(run.reason).toBe("unknown_delegate");
  });

  it("supports STEER, CANCEL and paused runs executing nothing", async () => {
    const { controlPlanRun, executePlanRun } = await import("./hermesPlanner");
    const run: any = { runId: "r1", goal: "g", dataClass: "INTERNAL", status: "paused", constraints: [], steps: [], startedAt: Date.now(), updatedAt: Date.now(), cancelled: false, plan: planJson() };
    expect(await executePlanRun(run, { observeStep: () => "should not run" })).toMatchObject({ status: "paused", steps: [] });
    const steered = controlPlanRun("missing", { action: "STEER", constraint: "exclude bill" });
    expect(steered).toBeNull();
    run.status = "running";
    const mapMod = await import("./hermesPlanner");
    mapMod.resetPlannerRunsForTests();
    adapter.hermesExecute.mockReturnValue({ stdout: JSON.stringify(planJson()), stderr: "" });
    const created = await mapMod.plan("department queue workflow", {
      decide: async () => ({ answer: "proceed", abstained: false, confidence: 0.9, margin: 0.5 }),
      observeStep: () => "done",
    });
    const steeredRun = mapMod.controlPlanRun(created.runId, { action: "STEER", constraint: "exclude provisional bill" });
    expect(steeredRun?.constraints.join(" ")).toContain("exclude provisional bill");
    const cancelled = mapMod.controlPlanRun(created.runId, { action: "CANCEL" });
    expect(cancelled?.status).toBe("cancelled");
  });
});
