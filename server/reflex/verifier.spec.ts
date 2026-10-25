import { describe, expect, it } from "vitest";
import { verifyEffect } from "./verifier";

describe("verifier", () => {
  it("flags a mismatched effect as failed", () => {
    expect(verifyEffect({ status: "booked" }, { status: "waiting" })).toMatchObject({ failed: true, ok: false });
  });
});
