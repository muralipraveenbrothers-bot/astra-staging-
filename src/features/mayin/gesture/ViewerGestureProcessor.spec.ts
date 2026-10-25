/**
 * ASTRA — VIEWER GESTURE PROCESSOR TESTS (prompt 07 gesture map)
 * ============================================================================
 * Deterministic: smoothing disabled (alpha 1), mirroring off, injected clock.
 */

import { describe, expect, it } from "vitest";
import { HAND, type Landmark } from "./mayinGestureMath";
import {
  ViewerGestureProcessor,
  type ViewerGestureEvent,
} from "./ViewerGestureProcessor";

type FingerName = "index" | "middle" | "ring" | "pinky";

const MCP: Record<FingerName, [number, number]> = {
  index: [-0.05, -0.28],
  middle: [0, -0.3],
  ring: [0.05, -0.28],
  pinky: [0.1, -0.26],
};
const MCP_INDEX = { index: HAND.INDEX_MCP, middle: HAND.MIDDLE_MCP, ring: HAND.RING_MCP, pinky: HAND.PINKY_MCP };
const TIP_INDEX = { index: HAND.INDEX_TIP, middle: HAND.MIDDLE_TIP, ring: HAND.RING_TIP, pinky: HAND.PINKY_TIP };

function buildHand(extended: FingerName[] = [], pinch = false, cx = 0.5, cy = 1): Landmark[] {
  const points: Landmark[] = Array.from({ length: 21 }, () => ({ x: cx, y: cy }));
  const ext = new Set(extended);
  points[HAND.WRIST] = { x: cx, y: cy };
  (Object.keys(MCP) as FingerName[]).forEach((finger) => {
    const [dx, dy] = MCP[finger];
    points[MCP_INDEX[finger]] = { x: cx + dx, y: cy + dy };
    points[TIP_INDEX[finger]] = ext.has(finger)
      ? { x: cx + dx, y: cy + dy - 0.22 }
      : { x: cx + dx, y: cy + dy + 0.08 };
  });
  const indexTip = points[HAND.INDEX_TIP];
  points[HAND.THUMB_TIP] = pinch
    ? { x: indexTip.x + 0.02, y: indexTip.y + 0.01 }
    : { x: cx - 0.25, y: cy - 0.1 };
  return points;
}

function shifted(hand: Landmark[], dx: number, dy: number): Landmark[] {
  return hand.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
}

function harness() {
  let now = 0;
  const events: ViewerGestureEvent[] = [];
  const processor = new ViewerGestureProcessor({
    now: () => now,
    mirrorX: false,
    sensitivity: { smoothing: 1 },
    onEvent: (e) => events.push(e),
  });
  return {
    events,
    processor,
    /** Feed one frame `dt` ms after the previous one. */
    frame(hands: Landmark[][], dt = 50) {
      now += dt;
      processor.processFrame(hands);
    },
    ofType<T extends ViewerGestureEvent["type"]>(type: T) {
      return events.filter((e) => e.type === type);
    },
  };
}

describe("ViewerGestureProcessor — gesture map", () => {
  it("moves the cursor with an open palm (after 3 stable frames)", () => {
    const h = harness();
    const palm = buildHand(["index", "middle", "ring", "pinky"], false, 0.4, 0.9);
    h.frame([palm]);
    h.frame([palm]);
    expect(h.ofType("cursor")).toHaveLength(0);
    h.frame([palm]);
    const cursor = h.ofType("cursor");
    expect(cursor.length).toBeGreaterThan(0);
    expect(cursor[0]).toMatchObject({ active: true });
  });

  it("fires select on a quick pinch tap (< 300 ms) but not on a long hold", () => {
    const h = harness();
    const pinch = buildHand(["index"], true);
    h.frame([pinch]);
    h.frame([pinch], 100);
    h.frame([pinch], 100); // held 200 ms
    h.frame([buildHand(["index"], false)], 50); // release at 250 ms
    expect(h.ofType("select")).toHaveLength(1);

    const h2 = harness();
    h2.frame([pinch]);
    h2.frame([pinch], 200);
    h2.frame([pinch], 200); // held 400 ms
    h2.frame([buildHand(["index"], false)], 50);
    expect(h2.ofType("select")).toHaveLength(0);
  });

  it("rotates while a pinch is held and moved, without selecting on release", () => {
    const h = harness();
    const pinch = buildHand(["index"], true);
    h.frame([pinch]);
    h.frame([pinch], 100);
    h.frame([pinch], 100); // stable pinch
    h.frame([shifted(pinch, 0.03, 0)], 100);
    h.frame([shifted(pinch, 0.06, 0)], 100);
    h.frame([buildHand(["index"], false)], 100); // release after 500 ms
    const rotates = h.ofType("rotate");
    expect(rotates.length).toBeGreaterThan(0);
    expect((rotates[0] as { dx: number }).dx).toBeGreaterThan(0);
    expect(h.ofType("select")).toHaveLength(0);
  });

  it("zooms when two pinched hands spread apart", () => {
    const h = harness();
    h.frame([buildHand(["index"], true, 0.3, 0.5), buildHand(["index"], true, 0.7, 0.5)]);
    h.frame([buildHand(["index"], true, 0.2, 0.5), buildHand(["index"], true, 0.8, 0.5)]);
    const zooms = h.ofType("zoom");
    expect(zooms.length).toBeGreaterThan(0);
    expect((zooms[0] as { factor: number }).factor).toBeGreaterThan(1.2);
  });

  it("pans with a moving peace sign", () => {
    const h = harness();
    const peace = buildHand(["index", "middle"], false, 0.5, 0.9);
    h.frame([peace]);
    h.frame([peace]);
    h.frame([peace]); // stable
    h.frame([shifted(peace, 0.02, 0)]);
    const pans = h.ofType("pan");
    expect(pans.length).toBeGreaterThan(0);
    expect((pans[0] as { dx: number }).dx).toBeGreaterThan(0);
  });

  it("free-rotates with the Spider-Man pose by wrist movement", () => {
    const h = harness();
    const spidey = buildHand(["index", "pinky"], false, 0.5, 0.9);
    h.frame([spidey]);
    h.frame([spidey]);
    h.frame([spidey]); // stable
    h.frame([shifted(spidey, 0.025, 0.01)]);
    expect(h.ofType("rotate").length).toBeGreaterThan(0);
  });

  it("resets once when a fist is held for 0.7 s", () => {
    const h = harness();
    const fist = buildHand([]);
    h.frame([fist]);
    h.frame([fist], 100);
    h.frame([fist], 100); // stable fist at t=200
    h.frame([fist], 400); // t=600, 400 ms held — too soon
    expect(h.ofType("reset")).toHaveLength(0);
    h.frame([fist], 200); // t=800 → 600 ms held... still short
    expect(h.ofType("reset")).toHaveLength(0);
    h.frame([fist], 200); // t=1000 → 800 ms held → fires
    expect(h.ofType("reset")).toHaveLength(1);
    h.frame([fist], 200);
    expect(h.ofType("reset")).toHaveLength(1); // once per hold
  });

  it("steps the tour on a fast open-palm swipe", () => {
    const h = harness();
    const palm = buildHand(["index", "middle", "ring", "pinky"], false, 0.3, 0.9);
    h.frame([palm]);
    h.frame([palm], 50);
    h.frame([palm], 50); // stable
    h.frame([buildHand(["index", "middle", "ring", "pinky"], false, 0.45, 0.9)], 50);
    h.frame([buildHand(["index", "middle", "ring", "pinky"], false, 0.6, 0.9)], 50);
    h.frame([buildHand(["index", "middle", "ring", "pinky"], false, 0.75, 0.9)], 50);
    const tours = h.ofType("tour");
    expect(tours).toHaveLength(1);
    expect((tours[0] as { dir: number }).dir).toBe(1);
  });

  it("enters present mode when both palms are held open for 1 s", () => {
    const h = harness();
    const left = buildHand(["index", "middle", "ring", "pinky"], false, 0.3, 0.9);
    const right = buildHand(["index", "middle", "ring", "pinky"], false, 0.7, 0.9);
    h.frame([left, right]);
    h.frame([left, right], 500);
    expect(h.ofType("present")).toHaveLength(0);
    h.frame([left, right], 600); // 1.1 s held
    expect(h.ofType("present")).toHaveLength(1);
    h.frame([left, right], 200);
    expect(h.ofType("present")).toHaveLength(1); // once per hold
  });

  it("locks onto the active hand so a second hand cannot fight it", () => {
    const h = harness();
    const peace = buildHand(["index", "middle"], false, 0.4, 0.9);
    const palm = buildHand(["index", "middle", "ring", "pinky"], false, 0.8, 0.9);
    h.frame([peace, palm]);
    h.frame([peace, palm]);
    h.frame([peace, palm]);
    h.frame([shifted(peace, 0.02, 0), palm]);
    // Hand 0 (peace) drives: pan fires, the other palm never moves the cursor.
    expect(h.ofType("pan").length).toBeGreaterThan(0);
    expect(h.ofType("cursor")).toHaveLength(0);
  });

  it("hides the cursor when the hand leaves the frame", () => {
    const h = harness();
    const palm = buildHand(["index", "middle", "ring", "pinky"], false, 0.4, 0.9);
    h.frame([palm]);
    h.frame([palm]);
    h.frame([palm]);
    expect(h.ofType("cursor").length).toBeGreaterThan(0);
    h.frame([]);
    const last = h.events.filter((e) => e.type === "cursor").pop();
    expect(last).toMatchObject({ active: false });
  });
});
