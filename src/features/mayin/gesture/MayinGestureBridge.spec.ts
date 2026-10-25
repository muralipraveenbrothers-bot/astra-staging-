import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { agentBus } from "@/astra/runtime/agentBus";
import { MayinGestureBridge, createMayinGestureBridge } from "./MayinGestureBridge";
import type { MayinContext } from "../core/MayinTypes";

const baseContext: MayinContext = { userId: "U-1", role: "DOCTOR", patientId: "P-1" };

describe("MayinGestureBridge — semantic gesture → Mayin context", () => {
  let bridge: MayinGestureBridge;

  beforeEach(() => {
    bridge = createMayinGestureBridge({ initialContext: baseContext });
    bridge.start();
  });

  afterEach(() => {
    bridge.stop();
  });

  it("moves ONLY the selection pointer on select — clinical grounding untouched", () => {
    const changes: MayinContext[] = [];
    bridge.subscribe((e) => changes.push(e.context));

    agentBus.publish("gesture.command", { gesture: "pinch", action: "select", objectId: "Hb report" });

    const ctx = bridge.getContext();
    expect(ctx.selectedObject).toBe("Hb report");
    expect(ctx.patientId).toBe("P-1");
    expect(ctx.encounterId).toBeUndefined();
    expect(changes).toHaveLength(1);
  });

  it("emits a selection semantic event with truthful metadata", () => {
    const events: Array<{ kind: string; action?: string; objectId?: string }> = [];
    bridge.subscribe((e) => events.push({ kind: e.kind, action: e.action, objectId: e.objectId }));

    agentBus.publish("gesture.command", { gesture: "pinch", action: "select", objectId: "CT chest" });

    expect(events).toEqual([
      { kind: "selection", action: "select", objectId: "CT chest" },
    ]);
  });

  it("workspace actions notify listeners but NEVER mutate clinical context", () => {
    const kinds: string[] = [];
    bridge.subscribe((e) => kinds.push(e.kind));

    agentBus.publish("gesture.command", { gesture: "open_palm", action: "zoom", objectId: undefined });
    agentBus.publish("gesture.command", { gesture: "open_palm", action: "rotate" });
    agentBus.publish("gesture.command", { gesture: "open_palm", action: "reset_workspace" });

    expect(kinds).toEqual(["workspace", "workspace", "workspace"]);
    expect(bridge.getContext()).toEqual(baseContext);
  });

  it("ignores 'none' and malformed payloads without throwing", () => {
    expect(bridge.handleCommand({ action: "none" })).toBeNull();
    expect(bridge.handleCommand({})).toBeNull();
    expect(bridge.handleCommand({ action: 42 })).toBeNull();
    expect(bridge.getContext()).toEqual(baseContext);
  });

  it("surfaces engine started/stopped events for the HUD", () => {
    const kinds: string[] = [];
    bridge.subscribe((e) => kinds.push(e.kind));

    agentBus.publish("gesture.engine.started", {});
    agentBus.publish("gesture.engine.stopped", {});

    expect(kinds).toEqual(["engine", "engine"]);
  });

  it("stops consuming events after stop()", () => {
    let seen = 0;
    bridge.subscribe(() => { seen += 1; });
    bridge.stop();

    agentBus.publish("gesture.command", { action: "select", objectId: "X" });
    expect(seen).toBe(0);
    expect(bridge.getContext()).toEqual(baseContext);
  });

  it("start() is idempotent (no duplicate events)", () => {
    let seen = 0;
    bridge.subscribe(() => { seen += 1; });
    bridge.start(); // second start must not double-subscribe

    agentBus.publish("gesture.command", { action: "select", objectId: "Y" });
    expect(seen).toBe(1);
  });
});
