import { describe, expect, it } from "vitest";
import { evaluateResponseWindow } from "./responseLoop";

describe("response loop", () => {
  it("opens a blind spot when temperature does not fall in 48 h and does not change treatment", () => {
    const startedAt = "2026-09-29T00:00:00.000Z";
    const now = "2026-10-01T02:00:00.000Z";
    const result = evaluateResponseWindow({
      startedAt,
      now,
      expected: { metric: "temperature", direction: "fall", withinHours: 48, baseline: 38.5 },
      observations: [{ at: now, temperature: 38.8 }],
    });
    expect(result.blindSpots[0].kind).toBe("blind_spot");
    expect(result.blindSpots[0].text).toMatch(/temperature/);
    expect(result.treatmentChange).toBeNull();
  });
});
