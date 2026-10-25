import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { KnowledgeReviewQueue, reviewQueueEmpty } from "./KnowledgeReviewQueue";

describe("knowledge review queue", () => {
  it("shows an empty state and lists provenance when items exist", () => {
    expect(reviewQueueEmpty([])).toBe(true);
    const empty = renderToStaticMarkup(<KnowledgeReviewQueue items={[]} />);
    expect(empty).toContain("Nothing waiting for review");
    const filled = renderToStaticMarkup(<KnowledgeReviewQueue items={[{ kind: "knowledge", id: "1", title: "Policy draft", provenance: "admin upload", tier: 4 }]} />);
    expect(filled).toContain("Policy draft");
    expect(filled).toContain("admin upload");
    expect(filled).not.toContain("Nothing waiting");
  });
});
