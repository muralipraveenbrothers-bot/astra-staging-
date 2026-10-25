import { describe, expect, it } from "vitest";
import { toCauseFinder } from "./causeFinderView";

describe("cause finder view", () => {
  it("labels hypotheses as suggestions and does not state them as fact", () => {
    const view = toCauseFinder({
      causeChain: "example mechanism -> tissue -> finding",
      hypotheses: [{ diagnosis: "pneumonia", tier: "most-likely" }],
    });
    expect(view?.suggestionsOnly).toBe(true);
    expect(view?.statedAsFact).toBe(false);
    expect(view?.autoOrders).toBe(false);
    expect(view?.items[0].text).toContain("Suggestion only, not a diagnosis");
    expect(view?.items[0].text).not.toMatch(/diagnosed with/i);
  });
});
