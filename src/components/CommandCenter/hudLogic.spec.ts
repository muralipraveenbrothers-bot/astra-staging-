import { describe, expect, it } from "vitest";
import { eventToFlow, gaugeTone, metricToGauge } from "./hudLogic";

describe("Command Centre HUD logic", () => {
  it("maps ratio metrics to clamped gauge values", () => {
    const gauge = metricToGauge({
      id: "beds",
      label: "Bed occupancy",
      liveCount: 9,
      total: 10,
      display: "9/10",
    });

    expect(gauge.value).toBe(90);
    expect(gauge.display).toBe("9/10");
    expect(gauge.tone).toBe("red");
    expect(gauge.state).toBe("DEGRADED");
  });

  it("uses neutral state when a metric is unavailable", () => {
    const gauge = metricToGauge({ id: "empty", label: "No feed" });

    expect(gauge.value).toBeNull();
    expect(gauge.tone).toBe("neutral");
    expect(gauge.state).toBe("UNKNOWN");
    expect(gauge.display).toBe("No data");
  });

  it("supports inverted health gauges", () => {
    expect(gaugeTone(100, true)).toBe("emerald");
    expect(gaugeTone(40, true)).toBe("red");
  });

  it("maps event envelopes into redacted data-flow rows", () => {
    const flow = eventToFlow({
      eventId: "evt-1",
      correlationId: "corr",
      causationId: "cause",
      timestamp: "2026-09-27T10:00:00.000Z",
      source: "lab",
      target: "command",
      eventType: "lab.critical.alert",
      actorId: "system",
      actorRole: "system",
      privacyClass: "PHI",
      riskClass: "R4",
      schemaVersion: "1.0",
      payloadRedacted: true,
    });

    expect(flow).toMatchObject({
      id: "evt-1",
      label: "lab.critical.alert",
      source: "lab",
      target: "command",
      tone: "red",
    });
  });
});
