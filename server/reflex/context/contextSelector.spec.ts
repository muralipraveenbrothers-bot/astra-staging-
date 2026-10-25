import { describe, expect, it } from "vitest";
import { selectChunks, selectContext } from "./contextSelector";

describe("context selector", () => {
  it("keeps pinned safety items inside a small budget", () => {
    const slices = [
      { key: "allergies", text: "penicillin", pinned: true },
      { key: "active_medications", text: "metformin", pinned: true },
      { key: "critical_alert", text: "unacknowledged potassium", pinned: true },
      { key: "code_status", text: "full code", pinned: true },
      { key: "latest_vitals", text: "bp 120/80 at 09:00", pinned: true },
      ...Array.from({ length: 20 }, (_, i) => ({ key: "note" + i, text: "x".repeat(80) })),
    ];
    const selected = selectContext(slices, 200);
    for (const key of ["allergies", "active_medications", "critical_alert", "code_status", "latest_vitals"]) {
      expect(selected.text).toContain(key);
    }
    expect(selected.droppedSummary.length).toBeGreaterThan(0);
  });

  it("keeps at most 20 chunks, drops duplicate hashes, and keeps a pinned chunk", () => {
    const chunks = [
      { id: "pin", text: "pinned", hash: "h-pin", pinned: true, relevance: "irrelevant" as const },
      ...Array.from({ length: 5 }, (_, i) => ({ id: "dup" + i, text: "same", hash: "dup", relevance: "relevant" as const })),
      ...Array.from({ length: 55 }, (_, i) => ({ id: "c" + i, text: "chunk " + i, hash: "h" + i, relevance: "relevant" as const })),
    ];
    const kept = selectChunks(chunks, 20);
    expect(kept.length).toBeLessThanOrEqual(20);
    expect(kept.filter((chunk) => chunk.hash === "dup").length).toBe(1);
    expect(kept.some((chunk) => chunk.id === "pin")).toBe(true);
  });
});
