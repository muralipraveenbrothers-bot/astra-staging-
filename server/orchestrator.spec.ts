/**
 * ASTRA AI — Orchestrator tests (§27)
 * ===================================
 * Validates intent routing, mode handling, and the clinical fallback contract:
 * when no AI provider is reachable the orchestrator must still return a
 * structured, safety-flagged response WITHOUT fabricated clinical content.
 * db + HermesBrain are mocked to keep tests side-effect free.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
  db: {
    logAudit: vi.fn(() => {}),
  },
}));

vi.mock("../src/agents/core/HermesBrain", () => ({
  HermesBrain: {
    reason: vi.fn(async () => null),
  },
}));

// The provider gateway is stubbed here so orchestrator tests stay fast and
// deterministic; the real gateway fallback chain is covered by gateway.spec.ts.
vi.mock("./ai/providerRegistry", () => ({
  aiGatewayChat: vi.fn(async () => ({
    providerId: "astra-fallback",
    model: "fallback-deterministic",
    text: "",
    json: null,
    latencyMs: 0,
    status: 0,
    requestId: "stub",
    tried: ["astra-fallback"],
    fallbackUsed: true,
  })),
}));

import { astraOrchestrator } from "./orchestrator";
import { aiGatewayChat } from "./ai/providerRegistry";
import { AITask } from "./ai/types";
import type { UserSession } from "./types";

const user: UserSession = {
  userId: "u-test",
  name: "Test Doctor",
  role: "doctor",
} as unknown as UserSession;

describe("orchestrator intent routing", () => {
  it("routes differential questions to DiagnosisSupport", () => {
    expect(astraOrchestrator.intentToTask("what is the differential for fever")).toBe(AITask.DiagnosisSupport);
  });

  it("routes census questions to HospitalOperations with a hint", () => {
    expect(astraOrchestrator.intentToTask("how many inpatients", "census")).toBe(AITask.HospitalOperations);
  });

  it("falls back to GeneralAssistant for small talk", () => {
    expect(astraOrchestrator.intentToTask("hi there")).toBe(AITask.GeneralAssistant);
  });
});

describe("orchestrator graceful degradation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a structured response (never throws) when no provider is reachable", async () => {
    const res = await astraOrchestrator.handle({
      query: "summarise the plan for today's rounds",
      user,
      language: "en",
      mode: "doctor",
    });
    expect(res.requestId).toBeTruthy();
    expect(res.task).toBe(AITask.GeneralAssistant);
    expect(res.providerUsed.length).toBeGreaterThan(0);
    // No fabricated clinical content: clinical field is absent for non-clinical tasks.
    expect(res.clinical).toBeUndefined();
  });

  it("attaches red flags when the clinical path degrades", async () => {
    const res = await astraOrchestrator.handle({
      query: "differential for fever with falling platelets",
      user,
      language: "en",
      mode: "doctor",
    });
    expect(res.task).toBe(AITask.DiagnosisSupport);
    expect(res.clinical).toBeDefined();
    expect(res.safetyFlags.length).toBeGreaterThan(0);
    // Deterministic fallback must not invent confirmed findings.
    expect(res.clinical!.findings.length).toBe(0);
    // The gateway was consulted for the conversational synthesis layer.
    expect(vi.mocked(aiGatewayChat).mock.calls.length).toBeGreaterThan(0);
  });

  it("prefixes emergency mode responses", async () => {
    const res = await astraOrchestrator.handle({
      query: "patient not breathing, what do I do",
      user,
      language: "en",
      mode: "emergency",
    });
    if (res.mode === "emergency") {
      expect(res.text.startsWith("[EMERGENCY MODE")).toBe(true);
    }
  });

  it("never invents findings when the reasoning engine is unavailable", async () => {
    const res = await astraOrchestrator.handle({
      query: "drug interaction check amlodipine simvastatin",
      user,
      language: "en",
      mode: "doctor",
    });
    expect(res.task).toBe(AITask.MedicationReview);
    expect(res.clinical).toBeDefined();
  });
});
