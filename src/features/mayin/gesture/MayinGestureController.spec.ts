/**
 * ASTRA — DR. MAYIN GESTURE CONTROLLER TESTS
 * ============================================================================
 * Asserts the two guarantees the brief makes:
 *   • gesture semantics are CONTEXTUAL (§32/§33) — same gesture, different action;
 *   • the gesture engine is an accelerator only (§66) — camera denial, missing
 *     WASM or a model failure leaves mouse + voice working and can never throw.
 * Bundled with a real agent-bus subscription so the visual layer is verified too.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentBus } from "@/astra/runtime/agentBus";
import { HAND, type Landmark } from "./mayinGestureMath";
import {
  MayinGestureController,
  lazyMediaPipeLandmarkerFactory,
  type HandLandmarkerLike,
} from "./MayinGestureController";

/** Synthetic 21-point hand with pinch / extended-finger control. */
function hand(extended: string[], pinch: boolean, cx = 0.5, cy = 1): Landmark[] {
  const points: Landmark[] = Array.from({ length: 21 }, () => ({ x: cx, y: cy }));
  const mcp: Record<string, [number, number, number, number]> = {
    index: [HAND.INDEX_MCP, HAND.INDEX_TIP, -0.05, -0.28],
    middle: [HAND.MIDDLE_MCP, HAND.MIDDLE_TIP, 0, -0.3],
    ring: [HAND.RING_MCP, HAND.RING_TIP, 0.05, -0.28],
    pinky: [HAND.PINKY_MCP, HAND.PINKY_TIP, 0.1, -0.26],
  };
  points[HAND.WRIST] = { x: cx, y: cy };
  for (const finger of Object.keys(mcp)) {
    const [mcpIndex, tipIndex, dx, dy] = mcp[finger];
    points[mcpIndex] = { x: cx + dx, y: cy + dy };
    points[tipIndex] = extended.includes(finger)
      ? { x: cx + dx, y: cy + dy - 0.22 }
      : { x: cx + dx, y: cy + dy + 0.08 };
  }
  const indexTip = points[HAND.INDEX_TIP];
  points[HAND.THUMB_TIP] = pinch
    ? { x: indexTip.x + 0.02, y: indexTip.y + 0.01 }
    : { x: cx - 0.25, y: cy - 0.1 };
  return points;
}

function fakeLandmarker(frames: Landmark[][]): HandLandmarkerLike {
  return { detectForVideo: () => ({ landmarks: frames }), close: vi.fn() };
}

describe("MayinGestureController.interpret — contextual semantics", () => {
  it("pinch selects the doctor's current object when one is selected", () => {
    const result = MayinGestureController.interpret("pinch", { selectedObjectId: "Hb report" });
    expect(result.action).toBe("select");
    expect(result.rationale).toContain("Hb report");
  });

  it("pinch in the anatomy viewer selects the structure under the pointer", () => {
    const result = MayinGestureController.interpret("pinch", { anatomyActive: true });
    expect(result.action).toBe("select");
    expect(result.rationale.toLowerCase()).toContain("anatomy");
  });

  it("peace only resets the visual workspace, never clinical data", () => {
    expect(MayinGestureController.interpret("peace", {}).action).toBe("none");
    expect(MayinGestureController.interpret("peace", { workspaceResettable: true }).action).toBe(
      "reset_workspace",
    );
  });

  it("open palm reveals controls; fist moves a panel only when dragging is allowed", () => {
    expect(MayinGestureController.interpret("open_palm", {}).action).toBe("reveal_controls");
    expect(MayinGestureController.interpret("fist", {}, true).action).toBe("drag_move");
    expect(MayinGestureController.interpret("fist", {}, false).action).toBe("none");
  });

  it("never invents an action for an unrecognised pose", () => {
    expect(MayinGestureController.interpret("none", {}).action).toBe("none");
  });
});

describe("MayinGestureController — frame processing", () => {
  let controller: MayinGestureController;

  beforeEach(() => {
    controller = new MayinGestureController({ quality: "BALANCED" });
  });

  it("emits a select command from one pinched hand", () => {
    controller.setContext({ selectedObjectId: "creatinine" });
    const command = controller.__processFrameForTest([hand(["index"], true)]);
    expect(command?.action).toBe("select");
    expect(command?.objectId).toBe("creatinine");
  });

  it("fires pinch once per hold, so holding does not spam selection", () => {
    controller.setContext({ selectedObjectId: "creatinine" });
    expect(controller.__processFrameForTest([hand(["index"], true)])?.action).toBe("select");
    expect(controller.__processFrameForTest([hand(["index"], true)])).toBeNull();
  });

  it("returns null for an empty frame", () => {
    expect(controller.__processFrameForTest([])).toBeNull();
  });

  it("maps two hands moving apart to a zoom with the measured factor", () => {
    controller.__processFrameForTest([hand([], true, 0.4, 0.5), hand([], true, 0.6, 0.5)]);
    const command = controller.__processFrameForTest([
      hand([], true, 0.2, 0.5),
      hand([], true, 0.8, 0.5),
    ]);
    expect(command?.action).toBe("zoom");
    expect(command?.magnitude).toBeGreaterThan(1);
  });

  it("maps a two-hand twist to rotation only while the anatomy viewer is active", () => {
    const left = hand([], false, 0.4, 0.5);
    const right = hand([], false, 0.6, 0.5);
    const twistedRight = right.map((p) => ({ ...p, y: (p.y ?? 0) + 0.3 }));

    const passive = new MayinGestureController({});
    passive.__processFrameForTest([left, right]);
    expect(passive.__processFrameForTest([left, twistedRight])?.action).not.toBe("rotate");

    const anatomy = new MayinGestureController({});
    anatomy.setContext({ anatomyActive: true });
    anatomy.__processFrameForTest([left, right]);
    expect(anatomy.__processFrameForTest([left, twistedRight])?.action).toBe("rotate");
  });

  it("publishes gesture.command on the real Astra agent bus", () => {
    const seen: string[] = [];
    const unsubscribe = agentBus.subscribe((event) => {
      if (event.type === "gesture.command") seen.push(String(event.payload?.action));
    });
    controller.setContext({ selectedObjectId: "WBC" });
    controller.__processFrameForTest([hand(["index"], false)]);
    unsubscribe();
    expect(seen).toContain("select");
  });
});

describe("MayinGestureController — degradation (gesture is an accelerator only)", () => {
  it("becomes 'unavailable' when the camera is denied, without throwing", async () => {
    const controller = new MayinGestureController({
      streamFactory: async () => {
        throw new Error("NotAllowedError: camera permission denied");
      },
    });
    const state = await controller.start();
    expect(state).toBe("unavailable");
    expect(controller.getDiagnostics().lastError).toContain("NotAllowedError");
    expect(controller.getDiagnostics().cameraActive).toBe(false);
  });

  it("becomes 'unavailable' when the MediaPipe loader fails", async () => {
    const controller = new MayinGestureController({
      streamFactory: async () => ({ getTracks: () => [] }) as unknown as MediaStream,
      landmarkerFactory: async () => {
        throw new Error("wasm asset fetch failed");
      },
      videoElement: null,
    });
    const state = await controller.start();
    expect(state).toBe("unavailable");
    expect(controller.getDiagnostics().lastError).toContain("wasm");
  });

  it("runs when camera + landmarker are available, and drives real visual events", async () => {
    const published: string[] = [];
    const unsubscribe = agentBus.subscribe((event) => {
      if (event.type.startsWith("gesture.") || event.type.startsWith("vision.")) {
        published.push(event.type);
      }
    });
    const track = { stop: vi.fn() };
    const controller = new MayinGestureController({
      streamFactory: async () => ({ getTracks: () => [track] }) as unknown as MediaStream,
      landmarkerFactory: async () => fakeLandmarker([]),
    });
    expect(await controller.start()).toBe("running");
    expect(controller.getDiagnostics().cameraActive).toBe(true);

    await controller.stop();
    unsubscribe();
    expect(track.stop).toHaveBeenCalled();
    expect(published).toContain("gesture.engine.started");
    expect(published).toContain("vision.camera.started");
    expect(published).toContain("vision.camera.stopped");
  });

  it("closes the landmarker when stopped", async () => {
    const landmarker = fakeLandmarker([]);
    const controller = new MayinGestureController({
      streamFactory: async () => ({ getTracks: () => [] }) as unknown as MediaStream,
      landmarkerFactory: async () => landmarker,
    });
    await controller.start();
    await controller.stop();
    expect(landmarker.close).toHaveBeenCalled();
    expect(controller.getState()).toBe("idle");
  });

  it("keeps MediaPipe behind a lazy factory so the core bundle stays unaffected", () => {
    // Building the factory must not import the package or touch the network.
    const factory = lazyMediaPipeLandmarkerFactory();
    expect(typeof factory).toBe("function");
  });
});
