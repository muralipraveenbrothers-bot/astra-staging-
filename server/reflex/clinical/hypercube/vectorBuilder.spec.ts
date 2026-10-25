import { describe, expect, it } from "vitest";
import { buildVectors, countsTowardCompleteness } from "./vectorBuilder";

describe("vector builder", () => {
  it("keeps a documented field documented, leaves other axes missing, and excludes unconfirmed drafts", () => {
    const [documented, draft] = buildVectors({
      documented: [{ kind: "symptom", axes: { D1: "low back" }, sourceRefs: ["SYNTHETIC note"] }],
      extracted: [{ kind: "symptom", axes: { D6: "into the thigh" }, sourceRefs: ["micro-astra draft"] }],
    });
    expect(documented.axes.D1).toEqual({ value: "low back", status: "documented" });
    expect(documented.axes.D4).toEqual({ value: null, status: "missing" });
    expect(documented.axes.D6.value).toBeNull();
    expect(draft.status).toBe("draft_extracted");
    expect(draft.axes.D6.status).toBe("draft_extracted");
    expect(countsTowardCompleteness(draft)).toBe(false);
    expect(countsTowardCompleteness({ ...draft, confirmedBy: "doctor-1" })).toBe(true);
  });
});
