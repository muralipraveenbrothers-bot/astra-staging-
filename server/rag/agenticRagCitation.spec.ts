import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };
vi.mock("../ai/centralCore", () => ({
  centralAiChat: vi.fn(async () => ({ service: "ollama", requestId: "synthetic", model: "synthetic", status: 200, latencyMs: 1, fallbackAttempts: 0, json: null, text: "Uncited synthetic answer", agent: "rag-synthesizer", policyApplied: true })),
  chatText: (result: { text: string }) => result.text,
}));

describe("RAG citation safety", () => {
  let temp = "";
  beforeEach(() => { vi.resetModules(); temp = fs.mkdtempSync(path.join(os.tmpdir(), "astra-rag-citation-")); process.env = { ...originalEnv, ASTRA_RAG_INDEX_PATH: path.join(temp, "index.json") }; });
  afterEach(() => { process.env = { ...originalEnv }; fs.rmSync(temp, { recursive: true, force: true }); vi.resetModules(); });

  it("rejects an uncited model answer when evidence sources exist", async () => {
    const { ingestDocument, runAgenticRag, RAG_ABSTENTION_SENTENCE } = await import("./agenticRag");
    ingestDocument({ id: "synthetic-triage", text: "synthetic triage guidance", source: "synthetic-triage.md", category: "medical-knowledge" });
    const result = await runAgenticRag("synthetic triage guidance");
    expect(result.answer).toBe(RAG_ABSTENTION_SENTENCE);
    expect(result.citationIntegrity.valid).toBe(false);
    expect(result.sufficient).toBe(false);
  });
});
