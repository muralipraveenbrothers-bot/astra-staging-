import { describe, expect, it } from "vitest";
import { confidenceBand, escalationAlert, setSchemaMode, takeEscalationAlerts, _resetModesForTest } from "./confidencePolicy";
import type { DecisionSchema } from "./schema/types";

const schema = {
  id: "department_routing",
  abstainKeys: ["unknown", "human_review"],
  thresholds: { auto: 0.9, assist: 0.65, minMargin: 0.25 },
} as Pick<DecisionSchema, "id" | "abstainKeys" | "thresholds">;

describe("confidence policy", () => {
  it("bands high, mid, low and treats abstain as low", () => {
    expect(confidenceBand(schema, 0.95, 0.3, "lab")).toBe("high");
    expect(confidenceBand(schema, 0.95, 0.1, "lab")).toBe("mid");
    expect(confidenceBand(schema, 0.5, 0.4, "lab")).toBe("low");
    expect(confidenceBand(schema, 0.99, 0.9, "unknown")).toBe("low");
  });

  it("refuses AUTO for a clinical schema and escalates an emergency score in SHADOW", () => {
    _resetModesForTest();
    expect(() => setSchemaMode({ id: "clinical.note", domain: "clinical" }, "AUTO")).toThrow(/ASSIST/);
    const alert = escalationAlert({ schemaId: "emergency_now", kind: "score", score: 0.31, mode: "SHADOW" });
    expect(alert.escalate).toBe(true);
    expect(takeEscalationAlerts().length).toBeGreaterThan(0);
  });
});
