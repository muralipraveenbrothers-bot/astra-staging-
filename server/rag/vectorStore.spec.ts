import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("vector store index path", () => {
  let previous: string | undefined;
  let previousThreshold: string | undefined;
  let tempDir: string;

  beforeEach(() => {
    previous = process.env.ASTRA_RAG_INDEX_PATH;
    previousThreshold = process.env.ASTRA_RAG_MIN_SIMILARITY;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "astra-rag-"));
    process.env.ASTRA_RAG_INDEX_PATH = path.join(tempDir, "index.json");
    vi.resetModules();
  });

  afterEach(() => {
    if (previous === undefined) delete process.env.ASTRA_RAG_INDEX_PATH;
    else process.env.ASTRA_RAG_INDEX_PATH = previous;
    if (previousThreshold === undefined) delete process.env.ASTRA_RAG_MIN_SIMILARITY;
    else process.env.ASTRA_RAG_MIN_SIMILARITY = previousThreshold;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("persists to the configured temporary index", async () => {
    const { vectorStore, RAG_INDEX_PATH } = await import("./vectorStore");
    vectorStore.add({ id: "synthetic-doc", text: "synthetic clinical guidance", source: "test", category: "test" });
    expect(RAG_INDEX_PATH).toBe(process.env.ASTRA_RAG_INDEX_PATH);
    expect(fs.existsSync(process.env.ASTRA_RAG_INDEX_PATH!)).toBe(true);
    expect(vectorStore.size).toBe(1);
  });

  it("returns relevant evidence and abstains on unrelated or borderline matches", async () => {
    const { vectorStore, DEFAULT_MIN_SIMILARITY } = await import("./vectorStore");
    vectorStore.add({ id: "relevant", text: "hypertension treatment guideline", source: "test", category: "test" });
    vectorStore.add({ id: "broad", text: "alpha beta gamma delta epsilon zeta eta theta iota kappa", source: "test", category: "test" });
    expect(DEFAULT_MIN_SIMILARITY).toBe(0.25);
    expect(vectorStore.search("hypertension treatment").map((x) => x.id)).toContain("relevant");
    expect(vectorStore.search("quantum entanglement")).toEqual([]);
    process.env.ASTRA_RAG_MIN_SIMILARITY = "0.5";
    expect(vectorStore.search("alpha")).toEqual([]);
  });

  it("keeps only the top matching synthetic seed note", async () => {
    const { vectorStore } = await import("./vectorStore");
    vectorStore.add({ id: "synthetic-triage", text: "synthetic triage guidance categories", source: "synthetic-triage.md", category: "medical-knowledge" });
    vectorStore.add({ id: "synthetic-medication", text: "synthetic medication safety dose route", source: "synthetic-medication.md", category: "medical-knowledge" });
    vectorStore.add({ id: "synthetic-discharge", text: "synthetic discharge follow-up", source: "synthetic-discharge.md", category: "medical-knowledge" });
    expect(vectorStore.search("triage guidance").map((x) => x.id)).toEqual(["synthetic-triage"]);
  });
});
