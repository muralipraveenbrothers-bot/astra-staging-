import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDecisionCacheForTests, decideBatch, setReflexRecorder } from "./decisionFabric";

describe("decisionFabric", () => {
  beforeEach(() => {
    clearDecisionCacheForTests();
    vi.restoreAllMocks();
  });
  afterEach(() => setReflexRecorder({ record: () => undefined }));

  it("a batch of 4 makes exactly 1 HTTP call and preserves scoreMeaning", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      version: "0.3.6",
      results: ["urgency_classification", "department_routing", "intent_routing", "needs_human_confirmation"].map((id) => ({
        schemaId: id,
        answer: id === "department_routing" ? "lab" : "unknown",
        confidence: 0.9,
        scores: { lab: 0.9, unknown: 0.05, human_review: 0.03, other: 0.02 },
        scoreMeaning: "routing_confidence_not_clinical_probability",
      })),
    })));
    const results = await decideBatch({ schemaIds: ["urgency_classification", "department_routing", "intent_routing", "needs_human_confirmation"], input: "SYNTHETIC reception message" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results[0].scoreMeaning).toBe("routing_confidence_not_clinical_probability");
    expect(results[1].alternatives.map((a) => a.p)).toEqual([...results[1].alternatives.map((a) => a.p)].sort((a, b) => b - a));
    expect(results[0].trace.decisionId).toBeTruthy();
    expect(results[0].trace.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("cache hit makes 0 calls", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true, results: [{ schemaId: "department_routing", answer: "lab", confidence: 0.9, scores: { lab: 0.9, unknown: 0.1 } }] })));
    await decideBatch({ schemaIds: ["department_routing"], input: "SYNTHETIC lab counter" });
    vi.restoreAllMocks();
    const second = vi.spyOn(globalThis, "fetch");
    const result = await decideBatch({ schemaIds: ["department_routing"], input: "SYNTHETIC lab counter" });
    expect(second).not.toHaveBeenCalled();
    expect(result[0].trace.cacheHit).toBe(true);
  });

  it("timeout or Laya down abstains without throwing", async () => {
    process.env.ASTRA_REFLEX_TIMEOUT_MS = "10";
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(new Response("{}")), 1600)));
    await expect(decideBatch({ schemaIds: ["department_routing"], input: "SYNTHETIC slow message" })).resolves.toMatchObject([{ abstained: true }]);
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("down"));
    await expect(decideBatch({ schemaIds: ["department_routing"], input: "SYNTHETIC down message" })).resolves.toMatchObject([{ source: "abstain" }]);
    delete process.env.ASTRA_REFLEX_TIMEOUT_MS;
  });

  it("recorder receives stateHash but not raw text", async () => {
    const seen: Record<string, unknown>[] = [];
    setReflexRecorder({ record: (event) => { seen.push(event); } });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true, results: [{ schemaId: "department_routing", answer: "lab", confidence: 0.9, scores: { lab: 0.9, unknown: 0.1 } }] })));
    await decideBatch({ schemaIds: ["department_routing"], input: "SYNTHETIC raw phrase should not appear" });
    expect(seen[0].stateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(seen)).not.toContain("raw phrase");
  });
});
