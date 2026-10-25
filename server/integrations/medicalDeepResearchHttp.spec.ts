import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../rag/agenticRag", () => ({
  runAgenticRag: vi.fn(async () => ({ answer: "grounded", sources: [], steps: [], cycleCount: 1, sufficient: true, trace: [], citationIntegrity: { cited: [], invalid: [], sourceCount: 0 } })),
}));

import { runMedicalDeepResearch } from "./medicalDeepResearchHttp";

describe("Medical Deep Research HTTP-service wrapper", () => {
  beforeEach(() => { process.env.ASTRA_MEDICAL_DEEP_RESEARCH_ENABLED = "true"; });
  it("fails closed while disabled", async () => {
    process.env.ASTRA_MEDICAL_DEEP_RESEARCH_ENABLED = "false";
    expect(await runMedicalDeepResearch("influenza" )).toMatchObject({ ok: false, provider: "HTTP-service", error: "feature_disabled" });
  });
  it("calls the real HTTP contract and then existing RAG flow", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("data: {\"report\":\"ok\"}\n", { status: 200 })));
    const result = await runMedicalDeepResearch("influenza");
    expect(result).toMatchObject({ ok: true, provider: "HTTP-service", report: expect.stringContaining("report") });
    expect(result.rag?.answer).toBe("grounded");
  });
});
