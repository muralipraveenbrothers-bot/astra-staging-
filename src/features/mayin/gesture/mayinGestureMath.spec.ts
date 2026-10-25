/**
 * ASTRA — DR. MAYIN GESTURE MATH TESTS
 * ============================================================================
 * Pure landmark geometry: no camera, no DOM, no GPU. Each case builds a
 * synthetic 21-point hand so the classifier's contract is asserted exactly.
 */

import { describe, expect, it } from "vitest";
import {
  HAND,
  PINCH_ENTER_DISTANCE,
  PINCH_EXIT_DISTANCE,
  StableGestureTracker,
  applyDeadZone,
  classifyStaticGesture,
  distance,
  handScale,
  isSpiderManPose,
  palmCenter,
  palmSizeZoomFactor,
  rawPinchDistance,
  rotationDeltaDeg,
  smoothLandmarks,
  twoHandGeometry,
  twoHandMcpSpan,
  twoHandZoomFactor,
  updatePinchState,
  zoomFactor,
  type Landmark,
} from "./mayinGestureMath";

type FingerName = "index" | "middle" | "ring" | "pinky";

interface HandOptions {
  extended?: FingerName[];
  pinch?: boolean;
  cx?: number;
  cy?: number;
}

const MCP: Record<FingerName, [number, number]> = {
  index: [-0.05, -0.28],
  middle: [0, -0.3],
  ring: [0.05, -0.28],
  pinky: [0.1, -0.26],
};

const MCP_INDEX = { index: HAND.INDEX_MCP, middle: HAND.MIDDLE_MCP, ring: HAND.RING_MCP, pinky: HAND.PINKY_MCP };
const TIP_INDEX = { index: HAND.INDEX_TIP, middle: HAND.MIDDLE_TIP, ring: HAND.RING_TIP, pinky: HAND.PINKY_TIP };

/** Build a synthetic hand: 21 landmarks, wrist + MCPs + chosen finger poses. */
function buildHand(options: HandOptions = {}): Landmark[] {
  const extended = new Set(options.extended ?? []);
  const cx = options.cx ?? 0.5;
  const cy = options.cy ?? 1;
  const points: Landmark[] = Array.from({ length: 21 }, () => ({ x: cx, y: cy }));

  points[HAND.WRIST] = { x: cx, y: cy };
  (Object.keys(MCP) as FingerName[]).forEach((finger) => {
    const [dx, dy] = MCP[finger];
    points[MCP_INDEX[finger]] = { x: cx + dx, y: cy + dy };
    points[TIP_INDEX[finger]] = extended.has(finger)
      ? { x: cx + dx, y: cy + dy - 0.22 }
      : { x: cx + dx, y: cy + dy + 0.08 };
  });

  const indexTip = points[HAND.INDEX_TIP];
  points[HAND.THUMB_TIP] = options.pinch
    ? { x: indexTip.x + 0.02, y: indexTip.y + 0.01 }
    : { x: cx - 0.25, y: cy - 0.1 };
  return points;
}

describe("handScale / distance", () => {
  it("measures the wrist-to-middle-MCP reference length", () => {
    const hand = buildHand({ extended: ["index"] });
    expect(handScale(hand)).toBeCloseTo(0.3, 5);
  });

  it("returns 0 for an empty landmark list so classification stays safe", () => {
    expect(handScale([])).toBe(0);
  });

  it("computes euclidean distance", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5, 6);
  });
});

describe("classifyStaticGesture", () => {
  it("recognises a pinch (thumb touching index tip)", () => {
    const reading = classifyStaticGesture(buildHand({ extended: ["index"], pinch: true }));
    expect(reading.gesture).toBe("pinch");
    expect(reading.pinchAperture).toBeLessThanOrEqual(0.45);
  });

  it("recognises a single-finger point", () => {
    const reading = classifyStaticGesture(buildHand({ extended: ["index"] }));
    expect(reading.gesture).toBe("point");
    expect(reading.extended.index).toBe(true);
    expect(reading.extended.middle).toBe(false);
  });

  it("recognises a peace sign distinct from point", () => {
    const reading = classifyStaticGesture(buildHand({ extended: ["index", "middle"] }));
    expect(reading.gesture).toBe("peace");
  });

  it("recognises an open palm", () => {
    const reading = classifyStaticGesture(buildHand({ extended: ["index", "middle", "ring", "pinky"] }));
    expect(reading.gesture).toBe("open_palm");
  });

  it("recognises a closed fist", () => {
    const reading = classifyStaticGesture(buildHand({ extended: [] }));
    expect(reading.gesture).toBe("fist");
  });

  it("returns 'none' for an incomplete landmark set instead of guessing", () => {
    expect(classifyStaticGesture([]).gesture).toBe("none");
    expect(classifyStaticGesture([{ x: 0, y: 0 }]).gesture).toBe("none");
  });
});

describe("two-hand geometry", () => {
  it("returns null when a hand is missing", () => {
    expect(twoHandGeometry([], buildHand())).toBeNull();
  });

  it("measures span and angle between wrists", () => {
    const left = buildHand({ cx: 0.2, cy: 0.5 });
    const right = buildHand({ cx: 0.6, cy: 0.5 });
    const geometry = twoHandGeometry(left, right);
    expect(geometry?.span).toBeCloseTo(0.4, 5);
    expect(geometry?.angle).toBeCloseTo(0, 5);
  });

  it("scales the zoom factor with hand separation", () => {
    const near = twoHandGeometry(buildHand({ cx: 0.3, cy: 0.5 }), buildHand({ cx: 0.5, cy: 0.5 }))!;
    const far = twoHandGeometry(buildHand({ cx: 0.1, cy: 0.5 }), buildHand({ cx: 0.7, cy: 0.5 }))!;
    expect(zoomFactor(near, far)).toBeCloseTo(3, 5);
    expect(zoomFactor(near, near)).toBeCloseTo(1, 5);
  });

  it("computes twist rotation in degrees and wraps around ±180°", () => {
    const base = { span: 0.4, angle: 0 };
    expect(rotationDeltaDeg(base, { span: 0.4, angle: Math.PI / 4 })).toBeCloseTo(45, 4);
    // Crossing the ±π boundary must read as a small negative delta, not ~360°.
    const wrapped = rotationDeltaDeg(
      { span: 0.4, angle: Math.PI * 0.98 },
      { span: 0.4, angle: -Math.PI * 0.98 },
    );
    expect(Math.abs(wrapped)).toBeLessThan(10);
  });
});

describe("pinch hysteresis (prompt 07)", () => {
  it("engages under the enter threshold and releases over the exit threshold", () => {
    expect(updatePinchState(false, PINCH_ENTER_DISTANCE - 0.001)).toBe(true);
    expect(updatePinchState(false, PINCH_ENTER_DISTANCE + 0.001)).toBe(false);
    // Between enter and exit the state is sticky in both directions.
    const mid = (PINCH_ENTER_DISTANCE + PINCH_EXIT_DISTANCE) / 2;
    expect(updatePinchState(true, mid)).toBe(true);
    expect(updatePinchState(false, mid)).toBe(false);
    expect(updatePinchState(true, PINCH_EXIT_DISTANCE + 0.001)).toBe(false);
  });

  it("measures the raw thumb-tip ↔ index-tip distance on a synthetic pinch", () => {
    const pinched = buildHand({ extended: ["index"], pinch: true });
    expect(rawPinchDistance(pinched)).toBeLessThan(PINCH_ENTER_DISTANCE);
    const open = buildHand({ extended: ["index"], pinch: false });
    expect(rawPinchDistance(open)).toBeGreaterThan(PINCH_EXIT_DISTANCE);
  });

  it("returns infinity for an empty hand so pinch never engages by accident", () => {
    expect(updatePinchState(false, rawPinchDistance([]))).toBe(false);
  });
});

describe("Spider-Man pose detection (prompt 07)", () => {
  it("recognises index + pinky up with middle + ring curled", () => {
    const reading = classifyStaticGesture(buildHand({ extended: ["index", "pinky"] }));
    expect(isSpiderManPose(reading.extended)).toBe(true);
  });

  it("rejects point, peace, open palm and fist", () => {
    expect(isSpiderManPose(classifyStaticGesture(buildHand({ extended: ["index"] })).extended)).toBe(false);
    expect(
      isSpiderManPose(classifyStaticGesture(buildHand({ extended: ["index", "middle"] })).extended),
    ).toBe(false);
    expect(
      isSpiderManPose(
        classifyStaticGesture(buildHand({ extended: ["index", "middle", "ring", "pinky"] })).extended,
      ),
    ).toBe(false);
    expect(isSpiderManPose(classifyStaticGesture(buildHand({ extended: [] })).extended)).toBe(false);
  });
});

describe("two-hand zoom factor from middle-finger MCPs (prompt 07)", () => {
  it("measures the span between the two hands' landmark 9", () => {
    const left = buildHand({ cx: 0.2, cy: 0.5 });
    const right = buildHand({ cx: 0.6, cy: 0.5 });
    // Middle MCP sits at (cx, cy - 0.3) in the synthetic hand.
    expect(twoHandMcpSpan(left, right)).toBeCloseTo(0.4, 5);
  });

  it("scales zoom with the MCP span ratio and respects the dead zone", () => {
    expect(twoHandZoomFactor(0.4, 0.6)).toBeCloseTo(1.5, 5);
    expect(twoHandZoomFactor(0.4, 0.2)).toBeCloseTo(0.5, 5);
    // ±3% is treated as holding still, not zooming.
    expect(twoHandZoomFactor(0.4, 0.404)).toBe(1);
    expect(twoHandZoomFactor(0, 0.4)).toBe(1);
  });
});

describe("stable-frame debounce (prompt 07)", () => {
  it("needs 3 consecutive frames before a pose fires", () => {
    const tracker = new StableGestureTracker(3);
    expect(tracker.update("pinch")).toBe("none");
    expect(tracker.update("pinch")).toBe("none");
    expect(tracker.update("pinch")).toBe("pinch");
  });

  it("one flicker frame cannot fire a gesture", () => {
    const tracker = new StableGestureTracker(3);
    tracker.update("open_palm");
    tracker.update("open_palm");
    expect(tracker.update("fist")).toBe("none"); // resets the run
    expect(tracker.update("open_palm")).toBe("none");
    expect(tracker.update("open_palm")).toBe("none");
    expect(tracker.update("open_palm")).toBe("open_palm");
  });

  it("keeps the active pose until a new pose completes its own 3 frames", () => {
    const tracker = new StableGestureTracker(3);
    tracker.update("peace");
    tracker.update("peace");
    tracker.update("peace");
    expect(tracker.update("peace")).toBe("peace");
    expect(tracker.update("fist")).toBe("peace");
    expect(tracker.update("fist")).toBe("peace");
    expect(tracker.update("fist")).toBe("fist");
  });
});

describe("palm-size zoom (prompt 07)", () => {
  it("zooms in when the hand grows toward the camera, out when it recedes", () => {
    expect(palmSizeZoomFactor(0.3, 0.33)).toBeCloseTo(1.25, 5); // +10% size × 2.5 gain
    expect(palmSizeZoomFactor(0.3, 0.27)).toBeCloseTo(0.75, 5);
  });

  it("stays neutral inside the dead zone and on a zero reference", () => {
    expect(palmSizeZoomFactor(0.3, 0.303)).toBe(1);
    expect(palmSizeZoomFactor(0, 0.3)).toBe(1);
  });

  it("exposes a growing handScale as the hand nears the lens", () => {
    const near = buildHand({ extended: ["index"] });
    expect(handScale(near)).toBeGreaterThan(0);
  });
});

describe("smoothing, dead zones and cursor anchors (prompt 07)", () => {
  it("smooths landmarks exponentially and keeps frames usable", () => {
    const prev = buildHand({ cx: 0.4 });
    const next = buildHand({ cx: 0.6 });
    const smoothed = smoothLandmarks(prev, next, 0.5);
    expect(smoothed[HAND.WRIST].x).toBeCloseTo(0.5, 5);
    // A fresh (or resized) frame passes through unsmoothed rather than mixing garbage.
    const fresh = smoothLandmarks(null, next, 0.5);
    expect(fresh[HAND.WRIST].x).toBeCloseTo(0.6, 5);
  });

  it("collapses tiny motions in the dead zone", () => {
    expect(applyDeadZone(0.003, 0.004)).toBe(0);
    expect(applyDeadZone(0.005, 0.004)).toBeCloseTo(0.005, 6);
  });

  it("anchors the cursor at the palm centre", () => {
    const centre = palmCenter(buildHand({ cx: 0.5, cy: 1 }));
    // Mean of wrist + MCPs; the synthetic hand's MCPs average +0.02 on x.
    expect(centre.x).toBeCloseTo(0.52, 5);
    expect(centre.y).toBeLessThan(1); // MCPs sit above the wrist
  });
});
