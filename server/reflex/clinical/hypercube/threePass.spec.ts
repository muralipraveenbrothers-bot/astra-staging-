import { describe, expect, it } from "vitest";
import { threePass } from "./threePass";

describe("three pass", () => {
  it("flags an expected fever that is absent and does not reorder the DDx", () => {
    const ddx = [{ id: "b", diagnosis: "other" }, { id: "a", diagnosis: "infection" }];
    const result = threePass({
      ddx,
      findings: ["low back pain"],
      frames: [{ diagnosis: "infection", expectedFindings: ["fever"], reviewStatus: "approved" }],
    });
    expect(result.passC.some((item) => item.text === "expected fever absent")).toBe(true);
    expect(result.ddxOrder).toEqual(["b", "a"]);
  });
});
