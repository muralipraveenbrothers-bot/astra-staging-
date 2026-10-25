/**
 * ASTRA — VIEWER GESTURE PROCESSOR (pure, DOM-free, camera-agnostic)
 * ============================================================================
 * Turns smoothed hand-landmark frames into semantic 3D-viewer commands, using
 * the pure math in mayinGestureMath. The gesture map (prompt 07):
 *
 *   open palm moving          → cursor (hover highlights structures)
 *   pinch tap (< 300 ms)      → select structure under the cursor
 *   pinch hold + move         → rotate
 *   two-hand pinch spread     → zoom (middle-finger MCP span)
 *   open palm push / pull     → zoom (hand-size change, smoothed)
 *   peace move                → pan
 *   index + pinky ("Spidey")  → free rotate by wrist movement
 *   fist held 0.7 s           → reset view
 *   open-palm swipe L / R     → previous / next tour label
 *   both palms held 1 s       → present mode
 *
 * Robustness: exponential landmark smoothing, pinch hysteresis, 3-stable-frame
 * debounce, dead zones, an active-hand lock (a second person in view cannot
 * fight the doctor), and per-frame timestamps so tests stay deterministic.
 *
 * Everything is computed locally in the browser — landmarks never leave it.
 */

import {
  HAND,
  StableGestureTracker,
  applyDeadZone,
  classifyStaticGesture,
  handScale,
  isSpiderManPose,
  palmCenter,
  palmSizeZoomFactor,
  rawPinchDistance,
  smoothLandmarks,
  twoHandMcpSpan,
  twoHandZoomFactor,
  updatePinchState,
  type Landmark,
} from "./mayinGestureMath";

export type ViewerGestureEvent =
  | { type: "cursor"; x: number; y: number; active: boolean }
  | { type: "select" }
  | { type: "rotate"; dx: number; dy: number }
  | { type: "zoom"; factor: number }
  | { type: "pan"; dx: number; dy: number }
  | { type: "reset" }
  | { type: "tour"; dir: 1 | -1 }
  | { type: "present" }
  | { type: "gesture"; name: string };

export interface ViewerGestureSensitivity {
  rotate: number;
  zoom: number;
  pan: number;
  cursor: number;
  /** Exponential smoothing alpha for landmarks (0 = frozen, 1 = raw). */
  smoothing: number;
}

export const DEFAULT_GESTURE_SENSITIVITY: ViewerGestureSensitivity = {
  rotate: 1,
  zoom: 1,
  pan: 1,
  cursor: 1,
  smoothing: 0.55,
};

export interface ViewerGestureProcessorOptions {
  onEvent: (event: ViewerGestureEvent) => void;
  sensitivity?: Partial<ViewerGestureSensitivity>;
  /** Injectable clock for tests (ms). */
  now?: () => number;
  /** Front cameras mirror the image; flip x so the hand moves screen-naturally. */
  mirrorX?: boolean;
}

const PINCH_TAP_MS = 300;
const FIST_HOLD_MS = 700;
const BOTH_PALMS_HOLD_MS = 1000;
const SWIPE_WINDOW_MS = 260;
const SWIPE_DISTANCE = 0.22;
const SWIPE_COOLDOWN_MS = 900;
const MOVE_DEAD_ZONE = 0.004;
const CURSOR_DEAD_ZONE = 0.0015;
const ACTIVE_HAND_GRACE_FRAMES = 12;

const GESTURE_LABELS: Record<string, string> = {
  pinch: "Pinch",
  point: "Point",
  open_palm: "Open palm",
  peace: "Peace",
  fist: "Fist",
  spider_man: "Spider-Man",
  two_hand_zoom: "Two-hand zoom",
  both_palms: "Both palms",
  none: "—",
};

export class ViewerGestureProcessor {
  private readonly onEvent: (event: ViewerGestureEvent) => void;
  private readonly now: () => number;
  private readonly mirrorX: boolean;
  private sensitivity: ViewerGestureSensitivity;

  private readonly stable = new StableGestureTracker(3);
  private smoothed: (Landmark[] | null)[] = [null, null];
  private activeHand = 0;
  private activeHandMisses = 0;

  private pinchActive = false;
  private pinchStartedAt = 0;
  private pinchLastTip: { x: number; y: number } | null = null;

  private twoPinchA = false;
  private twoPinchB = false;
  private prevMcpSpan: number | null = null;

  private prevPalmSize: number | null = null;
  private prevPeaceCenter: { x: number; y: number } | null = null;
  private prevWrist: { x: number; y: number } | null = null;
  private lastCursor: { x: number; y: number } | null = null;
  private cursorVisible = false;

  private fistSince: number | null = null;
  private fistFired = false;
  private bothPalmsSince: number | null = null;
  private presentFired = false;

  private swipeTrail: { x: number; t: number }[] = [];
  private swipeCooldownUntil = 0;
  private lastLabel = "—";

  constructor(options: ViewerGestureProcessorOptions) {
    this.onEvent = options.onEvent;
    this.now = options.now ?? (() => Date.now());
    this.mirrorX = options.mirrorX ?? true;
    this.sensitivity = { ...DEFAULT_GESTURE_SENSITIVITY, ...options.sensitivity };
  }

  public setSensitivity(sensitivity: Partial<ViewerGestureSensitivity>): void {
    this.sensitivity = { ...this.sensitivity, ...sensitivity };
  }

  public getSensitivity(): ViewerGestureSensitivity {
    return { ...this.sensitivity };
  }

  /** Feed one raw landmark frame (up to two hands, 21 points each). */
  public processFrame(rawHands: Landmark[][]): void {
    const now = this.now();

    const hands = rawHands.slice(0, 2).map((hand, i) => {
      const mirrored = this.mirrorX ? hand.map((p) => ({ ...p, x: 1 - p.x })) : hand;
      this.smoothed[i] = smoothLandmarks(this.smoothed[i], mirrored, this.sensitivity.smoothing);
      return this.smoothed[i]!;
    });
    for (let i = hands.length; i < 2; i += 1) this.smoothed[i] = null;

    if (hands.length === 0) {
      this.resetTransientState();
      this.updateLabel("none");
      return;
    }

    // Active-hand lock: keep the hand we started with; only switch after it
    // has been missing for several frames (a second person cannot steal it).
    if (!hands[this.activeHand]) {
      this.activeHandMisses += 1;
      if (this.activeHandMisses > ACTIVE_HAND_GRACE_FRAMES) {
        this.activeHand = this.activeHand === 0 ? 1 : 0;
        this.activeHandMisses = 0;
        this.resetTransientState();
        this.stable.reset();
      }
    } else {
      this.activeHandMisses = 0;
    }
    const active = hands[this.activeHand] ?? hands[0];
    if (!active) return;

    // ---- Two-hand gestures take priority over anything single-hand. --------
    if (hands.length >= 2) {
      const [a, b] = hands;
      const aReading = classifyStaticGesture(a);
      const bReading = classifyStaticGesture(b);

      const bothPalms =
        aReading.gesture === "open_palm" && bReading.gesture === "open_palm";
      if (bothPalms) {
        this.bothPalmsSince ??= now;
        if (!this.presentFired && now - this.bothPalmsSince >= BOTH_PALMS_HOLD_MS) {
          this.presentFired = true;
          this.onEvent({ type: "present" });
        }
        this.updateLabel("both_palms");
      } else {
        this.bothPalmsSince = null;
        this.presentFired = false;
      }

      this.twoPinchA = updatePinchState(this.twoPinchA, rawPinchDistance(a));
      this.twoPinchB = updatePinchState(this.twoPinchB, rawPinchDistance(b));
      if (this.twoPinchA && this.twoPinchB) {
        const span = twoHandMcpSpan(a, b);
        if (this.prevMcpSpan && span > 0) {
          const raw = twoHandZoomFactor(this.prevMcpSpan, span);
          const factor = 1 + (raw - 1) * this.sensitivity.zoom;
          if (Math.abs(factor - 1) > 0.001) this.onEvent({ type: "zoom", factor });
        }
        this.prevMcpSpan = span;
        this.resetSingleHandState();
        this.updateLabel("two_hand_zoom");
        return;
      }
      this.prevMcpSpan = null;
      if (bothPalms) return; // palms timing in progress; suppress single-hand noise
    }

    // ---- Single-hand pose with hysteresis + debounce. ----------------------
    const reading = classifyStaticGesture(active);
    const wasPinch = this.pinchActive;
    this.pinchActive = updatePinchState(this.pinchActive, rawPinchDistance(active));

    let pose = "none";
    if (this.pinchActive) pose = "pinch";
    else if (isSpiderManPose(reading.extended)) pose = "spider_man";
    else pose = reading.gesture;

    const stablePose = this.stable.update(pose);

    // Pinch edges run on the hysteresis state (not the 3-frame debounce) so a
    // quick tap stays snappy; hysteresis itself blocks flicker.
    if (this.pinchActive && !wasPinch) {
      this.pinchStartedAt = now;
      const tip = active[HAND.INDEX_TIP];
      this.pinchLastTip = tip ? { x: tip.x, y: tip.y } : null;
    } else if (!this.pinchActive && wasPinch) {
      if (now - this.pinchStartedAt < PINCH_TAP_MS) this.onEvent({ type: "select" });
      this.pinchLastTip = null;
    }

    if (this.pinchActive && this.pinchLastTip && stablePose === "pinch") {
      const tip = active[HAND.INDEX_TIP];
      if (tip) {
        const dx = applyDeadZone(tip.x - this.pinchLastTip.x, MOVE_DEAD_ZONE);
        const dy = applyDeadZone(tip.y - this.pinchLastTip.y, MOVE_DEAD_ZONE);
        if (dx || dy) {
          this.onEvent({
            type: "rotate",
            dx: dx * 220 * this.sensitivity.rotate,
            dy: dy * 220 * this.sensitivity.rotate,
          });
        }
        this.pinchLastTip = { x: tip.x, y: tip.y };
      }
    }

    this.runStablePose(stablePose, active, now);
    this.updateLabel(
      hands.length >= 2 && this.twoPinchA && this.twoPinchB ? "two_hand_zoom" : stablePose,
    );
  }

  private runStablePose(pose: string, hand: Landmark[], now: number): void {
    if (pose !== "fist") {
      this.fistSince = null;
      this.fistFired = false;
    }
    if (pose !== "open_palm") {
      this.prevPalmSize = null;
      this.swipeTrail = [];
      if (this.cursorVisible) {
        this.cursorVisible = false;
        this.lastCursor = null;
        this.onEvent({ type: "cursor", x: 0, y: 0, active: false });
      }
    }
    if (pose !== "peace") this.prevPeaceCenter = null;
    if (pose !== "spider_man") this.prevWrist = null;

    switch (pose) {
      case "open_palm": {
        const centre = palmCenter(hand);
        const gain = this.sensitivity.cursor;
        const x = Math.min(1, Math.max(0, 0.5 + (centre.x - 0.5) * gain));
        const y = Math.min(1, Math.max(0, 0.5 + (centre.y - 0.5) * gain));
        const moved =
          !this.lastCursor ||
          Math.hypot(x - this.lastCursor.x, y - this.lastCursor.y) > CURSOR_DEAD_ZONE;
        if (moved) {
          this.lastCursor = { x, y };
          this.cursorVisible = true;
          this.onEvent({ type: "cursor", x, y, active: true });
        }

        // Palm push / pull → smoothed zoom from hand-size change.
        const size = handScale(hand);
        if (this.prevPalmSize) {
          const raw = palmSizeZoomFactor(this.prevPalmSize, size);
          const factor = 1 + (raw - 1) * this.sensitivity.zoom;
          if (Math.abs(factor - 1) > 0.001) this.onEvent({ type: "zoom", factor });
        }
        this.prevPalmSize = size;

        // Open-palm swipe left / right → previous / next tour label.
        this.swipeTrail.push({ x: centre.x, t: now });
        this.swipeTrail = this.swipeTrail.filter((p) => now - p.t <= SWIPE_WINDOW_MS);
        if (now >= this.swipeCooldownUntil && this.swipeTrail.length >= 3) {
          const dxTotal = centre.x - this.swipeTrail[0].x;
          if (Math.abs(dxTotal) >= SWIPE_DISTANCE) {
            this.onEvent({ type: "tour", dir: dxTotal > 0 ? 1 : -1 });
            this.swipeCooldownUntil = now + SWIPE_COOLDOWN_MS;
            this.swipeTrail = [];
          }
        }
        break;
      }
      case "peace": {
        const centre = palmCenter(hand);
        if (this.prevPeaceCenter) {
          const dx = applyDeadZone(centre.x - this.prevPeaceCenter.x, MOVE_DEAD_ZONE);
          const dy = applyDeadZone(centre.y - this.prevPeaceCenter.y, MOVE_DEAD_ZONE);
          if (dx || dy) {
            this.onEvent({
              type: "pan",
              dx: dx * 260 * this.sensitivity.pan,
              dy: dy * 260 * this.sensitivity.pan,
            });
          }
        }
        this.prevPeaceCenter = centre;
        break;
      }
      case "spider_man": {
        const wrist = hand[HAND.WRIST];
        if (wrist) {
          if (this.prevWrist) {
            const dx = applyDeadZone(wrist.x - this.prevWrist.x, MOVE_DEAD_ZONE);
            const dy = applyDeadZone(wrist.y - this.prevWrist.y, MOVE_DEAD_ZONE);
            if (dx || dy) {
              this.onEvent({
                type: "rotate",
                dx: dx * 260 * this.sensitivity.rotate,
                dy: dy * 260 * this.sensitivity.rotate,
              });
            }
          }
          this.prevWrist = { x: wrist.x, y: wrist.y };
        }
        break;
      }
      case "fist": {
        this.fistSince ??= now;
        if (!this.fistFired && now - this.fistSince >= FIST_HOLD_MS) {
          this.fistFired = true;
          this.onEvent({ type: "reset" });
        }
        break;
      }
      default:
        break;
    }
  }

  private resetSingleHandState(): void {
    this.pinchActive = false;
    this.pinchLastTip = null;
    this.prevPalmSize = null;
    this.prevPeaceCenter = null;
    this.prevWrist = null;
    this.swipeTrail = [];
    this.fistSince = null;
    this.fistFired = false;
    this.stable.reset();
    if (this.cursorVisible) {
      this.cursorVisible = false;
      this.lastCursor = null;
      this.onEvent({ type: "cursor", x: 0, y: 0, active: false });
    }
  }

  private resetTransientState(): void {
    this.resetSingleHandState();
    this.twoPinchA = false;
    this.twoPinchB = false;
    this.prevMcpSpan = null;
    this.bothPalmsSince = null;
    this.presentFired = false;
    this.activeHandMisses = 0;
  }

  private updateLabel(pose: string): void {
    const label = GESTURE_LABELS[pose] ?? "—";
    if (label !== this.lastLabel) {
      this.lastLabel = label;
      this.onEvent({ type: "gesture", name: label });
    }
  }
}
