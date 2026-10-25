/**
 * ASTRA — LAYA ADAPTER TESTS
 * ============================================================================
 * Verifies the isolation contract: Laya can only accelerate bounded decisions,
 * can never be asked to diagnose, and can never take Astra down when absent.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  LayaDecisionAdapter,
  LAYA_BOUNDED_TASKS,
  LAYA_TASK_QUESTIONS,
  LAYA_CLINICAL_CALIBRATION_REQUIREMENTS,
} from "@/astra/plugins/layaDecision";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const okBody = {
  ok: true,
  model: "laya-rl-agent",
  routing: { model: "multilingual", repo: "convaiinnovations/laya", reason: "devanagari script" },
  answers: {
    department: {
      type: "choice" as const,
      choice: "lab",
      probabilities: { reception: 0.05, lab: 0.86, pharmacy: 0.09 },
      confidence: 0.86,
    },
  },
};

describe("LayaDecisionAdapter — bounded scope", () => {
  it("rejects any task that is not an approved bounded task", async () => {
    const adapter = new LayaDecisionAdapter({ fetchImpl: vi.fn() });
    const result = await adapter.decide("what_disease_is_this", { text: "chest pain" });
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") return;
    expect(result.reason).toMatch(/bounded/i);
    expect((adapter.diagnostics().calls)).toBe(0);
  });

  it("covers every bounded task with exactly one approved question template", () => {
    for (const task of LAYA_BOUNDED_TASKS) {
      const questions = LAYA_TASK_QUESTIONS[task];
      expect(questions, task).toBeDefined();
      expect(Object.keys(questions).length).toBe(1);
      const [q] = Object.values(questions);
      expect(["choice", "score", "noul"]).toContain(q.type);
      expect(q.instructions.length).toBeGreaterThan(8);
    }
  });

  it("never reports a Laya score as a clinical probability", async () => {
    const adapter = new LayaDecisionAdapter({
      fetchImpl: async () => jsonResponse(okBody),
    });
    const result = await adapter.decide("department_routing", { text: "send this to lab" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.scoreMeaning).toBe("routing_confidence_not_clinical_probability");
    expect(adapter.isCalibratedForClinicalUse()).toBe(false);
    expect(LAYA_CLINICAL_CALIBRATION_REQUIREMENTS).toContain("external validation");
  });
});

describe("LayaDecisionAdapter — graceful degradation", () => {
  let adapter: LayaDecisionAdapter;

  beforeEach(() => {
    adapter = new LayaDecisionAdapter({
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED 127.0.0.1:8791");
      },
      timeoutMs: 50,
    });
  });

  it("resolves to degraded instead of throwing when the runtime is stopped", async () => {
    const result = await adapter.decide("urgency_classification", { text: "patient collapsed" });
    expect(result.status).toBe("degraded");
    if (result.status !== "degraded") return;
    expect(result.reason).toContain("ECONNREFUSED");
    expect(adapter.diagnostics().degradedCalls).toBe(1);
    expect(adapter.diagnostics().reachable).toBe(false);
  });

  it("degrades on a non-2xx runtime response", async () => {
    const failing = new LayaDecisionAdapter({
      fetchImpl: async () => jsonResponse({ ok: false, error: "model not loaded" }, 503),
    });
    const result = await failing.decide("message_triage", { text: "hello" });
    expect(result.status).toBe("degraded");
  });

  it("degrades when the runtime returns no usable answers", async () => {
    const empty = new LayaDecisionAdapter({
      fetchImpl: async () => jsonResponse({ ok: true, answers: {} }),
    });
    const result = await empty.decide("command_type", { text: "show labs" });
    expect(result.status).toBe("degraded");
    if (result.status !== "degraded") return;
    expect(result.reason).toMatch(/no usable answers/i);
  });

  it("returns degraded immediately when disabled, without calling the runtime", async () => {
    const fetchImpl = vi.fn();
    const disabled = new LayaDecisionAdapter({ enabled: false, fetchImpl });
    const result = await disabled.decide("note_type", { text: "progress note" });
    expect(result.status).toBe("degraded");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports unhealthy without throwing when the probe fails", async () => {
    const health = await adapter.health();
    expect(health.reachable).toBe(false);
  });
});

describe("LayaDecisionAdapter — happy path & diagnostics", () => {
  it("returns typed answers with routing metadata and latency", async () => {
    const adapter = new LayaDecisionAdapter({ fetchImpl: async () => jsonResponse(okBody) });
    const result = await adapter.decide("department_routing", { text: "lab report status" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.answers.department.choice).toBe("lab");
    expect(result.routing?.model).toBe("multilingual");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);

    const diag = adapter.diagnostics();
    expect(diag.calls).toBe(1);
    expect(diag.degradedCalls).toBe(0);
    expect(diag.reachable).toBe(true);
    expect(diag.lastLatencyMs).toBeGreaterThanOrEqual(0);
    expect(diag.lastError).toBeUndefined();
  });

  it("marks itself reachable after a successful health probe", async () => {
    const adapter = new LayaDecisionAdapter({
      fetchImpl: async () => jsonResponse({ ok: true, modelLoaded: true, device: "cpu" }),
    });
    const health = await adapter.health();
    expect(health).toEqual({ reachable: true, modelLoaded: true, device: "cpu" });
    expect(adapter.diagnostics().device).toBe("cpu");
  });
});
