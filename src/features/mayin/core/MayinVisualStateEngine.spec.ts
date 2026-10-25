import { describe, it, expect, beforeEach } from "vitest";
import { mayinVisualEngine } from "./MayinVisualStateEngine";

describe("MayinVisualStateEngine — real-event visual states", () => {
  beforeEach(() => {
    mayinVisualEngine.__resetForTest();
  });

  it("maps retrieval events to RETRIEVING", () => {
    expect(mayinVisualEngine.publish({ type: "lab.query.started" })).toBe(true);
    expect(mayinVisualEngine.getState()).toBe("retrieving");
    mayinVisualEngine.publish({ type: "radiology.query.started" });
    expect(mayinVisualEngine.getState()).toBe("retrieving");
  });

  it("maps reasoning lifecycle: THINKING → ANALYSING → comparing → COMPLETE", () => {
    mayinVisualEngine.publish({ type: "reasoning.started" });
    expect(mayinVisualEngine.getState()).toBe("thinking");

    mayinVisualEngine.publish({ type: "d7.node", payload: { node: "extract_1D" } });
    expect(mayinVisualEngine.getState()).toBe("analysing");

    mayinVisualEngine.publish({ type: "d7.node", payload: { node: "synthesize_7D_decision" } });
    expect(mayinVisualEngine.getState()).toBe("comparing");

    mayinVisualEngine.publish({ type: "reasoning.completed" });
    expect(mayinVisualEngine.getState()).toBe("complete");
  });

  it("maps pharmacy dispatch lifecycle to DISPATCHING → WAITING → COMPLETE", () => {
    mayinVisualEngine.publish({ type: "pharmacy.order.created" });
    expect(mayinVisualEngine.getState()).toBe("dispatching");
    mayinVisualEngine.publish({ type: "pharmacy.order.acknowledged" });
    expect(mayinVisualEngine.getState()).toBe("waiting");
    mayinVisualEngine.publish({ type: "pharmacy.order.dispensed" });
    expect(mayinVisualEngine.getState()).toBe("complete");
  });

  it("keeps critical alerts sticky until acknowledged, then restores previous state", () => {
    mayinVisualEngine.publish({ type: "lab.query.started" });
    expect(mayinVisualEngine.getState()).toBe("retrieving");

    mayinVisualEngine.publish({ type: "lab.critical" });
    expect(mayinVisualEngine.getState()).toBe("critical");

    // Ordinary events must not displace an unacknowledged critical alert.
    expect(mayinVisualEngine.publish({ type: "reasoning.started" })).toBe(false);
    expect(mayinVisualEngine.getState()).toBe("critical");

    mayinVisualEngine.acknowledgeCritical();
    expect(mayinVisualEngine.getState()).toBe("retrieving");
  });

  it("ignores unknown event types and never fakes states without events", () => {
    expect(mayinVisualEngine.publish({ type: "some.unknown.event" as never })).toBe(false);
    expect(mayinVisualEngine.getState()).toBe("idle");
  });

  it("notifies subscribers immediately with the current state", () => {
    mayinVisualEngine.publish({ type: "voice.speaking" });
    const seen: string[] = [];
    mayinVisualEngine.subscribe((s) => seen.push(s));
    expect(seen).toEqual(["speaking"]);
  });
});
