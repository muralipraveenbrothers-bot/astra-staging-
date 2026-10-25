import { describe, expect, it } from "vitest";
import { buildTimeline } from "./timeline";

describe("timeline", () => {
  it("flags a new drug six hours before a rash", () => {
    const rash = "2026-09-29T12:00:00.000Z";
    const drug = "2026-09-29T06:00:00.000Z";
    const timeline = buildTimeline([
      { at: drug, kind: "medication", label: "new drug" },
      { at: rash, kind: "symptom", label: "rash" },
    ], rash);
    expect(timeline.flags).toContain("new medication preceded new symptom");
    expect(timeline.items.find((item) => item.kind === "medication")?.offsetHours).toBe(-6);
  });
});
