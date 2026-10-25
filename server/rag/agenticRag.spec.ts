import { describe, expect, it } from "vitest";
import { citationIntegrity, getRagStats, RAG_ABSTENTION_SENTENCE, routeQuery } from "./agenticRag";

describe("agentic RAG evidence safeguards", () => {
  it("routes clinical categories and rejects out-of-range citations", () => {
    expect(routeQuery("drug interaction and CBC investigation").categories).toEqual(["pharmacology", "investigation"]);
    expect(citationIntegrity("Claim [1] and unsupported [3]", 1)).toEqual({ cited: [1, 3], invalid: [3], sourceCount: 1 });
  });

  it("reports the live indexed document count", () => {
    const stats = getRagStats();
    expect(stats.documents).toBeTypeOf("number");
    expect(stats.documents).toBeGreaterThanOrEqual(0);
  });

  it("keeps the evidence abstention sentence exact", () => {
    expect(RAG_ABSTENTION_SENTENCE).toBe("Astra could not find an authorized source for this question. No evidence-backed answer is available.");
  });
});
