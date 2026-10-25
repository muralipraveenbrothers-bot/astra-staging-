/**
 * ASTRA — DR. MAYIN GESTURE MATH (browser-native, pure functions)
 * ============================================================================
 * Landmark geometry for the MediaPipe-based gesture engine. Kept pure and
 * dependency-free so it is unit-testable in Node and so the gesture engine can
 * degrade to "unavailable" without breaking Mayin: mouse and voice always work.
 *
 * GESTURE SEMANTICS ARE CONTEXTUAL (§32). The same physical gesture means
 * different things depending on what the doctor has selected; that mapping lives
 * in MayinGestureController, not here. This module only answers:
 * "which physical gesture is this?"
 */

/** One MediaPipe hand landmark: normalised image coordinates. */
export interface Landmark {
  x: number;
  y: number;
  z?: number;
}

/** MediaPipe hand landmark indices used below. */
export const HAND = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_TIP: 20,
} as const;

export type PhysicalGesture =
  | "none"
  | "pinch"
  | "point"
  | "open_palm"
  | "peace"
  | "fist";

export function distance(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Reference length that is stable across hand sizes and camera distance:
 * wrist → middle-finger MCP.
 */
export function handScale(landmarks: Landmark[]): number {
  const wrist = landmarks[HAND.WRIST];
  const middleMcp = landmarks[HAND.MIDDLE_MCP];
  if (!wrist || !middleMcp) return 0;
  return distance(wrist, middleMcp);
}

/** Tips measured against their own MCPs — orientation independent. */
function fingerExtended(landmarks: Landmark[], tip: number, mcp: number): boolean {
  const t = landmarks[tip];
  const m = landmarks[mcp];
  const wrist = landmarks[HAND.WRIST];
  if (!t || !m || !wrist) return false;
  return distance(t, wrist) > distance(m, wrist) * 1.15;
}

export interface StaticGestureResult {
  gesture: PhysicalGesture;
  /** Normalised pinch aperture: thumb-to-index distance / hand scale. */
  pinchAperture: number;
  extended: { index: boolean; middle: boolean; ring: boolean; pinky: boolean };
}

/**
 * Classify a single-hand pose. Thresholds are deliberately conservative: a
 * missed gesture is harmless, a false "select" during lecture/camera drift is not.
 */
export function classifyStaticGesture(landmarks: Landmark[]): StaticGestureResult {
  const scale = handScale(landmarks);
  const empty: StaticGestureResult = {
    gesture: "none",
    pinchAperture: Number.POSITIVE_INFINITY,
    extended: { index: false, middle: false, ring: false, pinky: false },
  };
  if (!landmarks || landmarks.length < 21 || scale <= 0) return empty;

  const pinchAperture =
    distance(landmarks[HAND.THUMB_TIP], landmarks[HAND.INDEX_TIP]) / scale;

  const extended = {
    index: fingerExtended(landmarks, HAND.INDEX_TIP, HAND.INDEX_MCP),
    middle: fingerExtended(landmarks, HAND.MIDDLE_TIP, HAND.MIDDLE_MCP),
    ring: fingerExtended(landmarks, HAND.RING_TIP, HAND.RING_MCP),
    pinky: fingerExtended(landmarks, HAND.PINKY_TIP, HAND.PINKY_MCP),
  };

  // Pinch takes priority: it is the selection gesture doctors use most.
  if (pinchAperture <= 0.45) return { gesture: "pinch", pinchAperture, extended };
  if (extended.index && !extended.middle && !extended.ring && !extended.pinky) {
    return { gesture: "point", pinchAperture, extended };
  }
  if (extended.index && extended.middle && !extended.ring && !extended.pinky) {
    return { gesture: "peace", pinchAperture, extended };
  }
  if (extended.index && extended.middle && extended.ring && extended.pinky) {
    return { gesture: "open_palm", pinchAperture, extended };
  }
  if (!extended.index && !extended.middle && !extended.ring && !extended.pinky) {
    return { gesture: "fist", pinchAperture, extended };
  }
  return { gesture: "none", pinchAperture, extended };
}

/** Two-hand geometry used for zoom (apart) and rotate (twist). */
export interface TwoHandGeometry {
  /** Normalised span between the two palms. */
  span: number;
  /** Angle (radians) of the line between the two palms. */
  angle: number;
}

export function twoHandGeometry(left: Landmark[], right: Landmark[]): TwoHandGeometry | null {
  if (!left?.length || !right?.length) return null;
  const l = left[HAND.WRIST];
  const r = right[HAND.WRIST];
  if (!l || !r) return null;
  return {
    span: Math.hypot(r.x - l.x, r.y - l.y),
    angle: Math.atan2(r.y - l.y, r.x - l.x),
  };
}

/** Continuous zoom factor from span change: >1 apart (zoom in), <1 together. */
export function zoomFactor(previous: TwoHandGeometry, current: TwoHandGeometry): number {
  if (!previous.span) return 1;
  return current.span / previous.span;
}

/** Rotation delta in degrees from twist change, normalised to (-180, 180]. */
export function rotationDeltaDeg(previous: TwoHandGeometry, current: TwoHandGeometry): number {
  let delta = ((current.angle - previous.angle) * 180) / Math.PI;
  while (delta > 180) delta -= 360;
  while (delta <= -180) delta += 360;
  return delta;
}

// ---------------------------------------------------------------------------
// Prompt 07 — spatial viewer-control math (all pure, all local)
// ---------------------------------------------------------------------------

/**
 * Pinch hysteresis on the RAW normalised thumb-tip (4) ↔ index-tip (8)
 * distance (Jarvis-style, not scale-normalised): a pinch ENGAGES under 0.045
 * and only RELEASES over 0.06, so borderline apertures never flicker.
 */
export const PINCH_ENTER_DISTANCE = 0.045;
export const PINCH_EXIT_DISTANCE = 0.06;

/** Raw normalised distance between thumb tip and index tip. */
export function rawPinchDistance(landmarks: Landmark[]): number {
  const thumb = landmarks[HAND.THUMB_TIP];
  const index = landmarks[HAND.INDEX_TIP];
  if (!thumb || !index) return Number.POSITIVE_INFINITY;
  return distance(thumb, index);
}

/**
 * Hysteresis state machine: once pinched, stay pinched until the aperture
 * clearly opens (exit), and once open, stay open until clearly closed (enter).
 */
export function updatePinchState(
  active: boolean,
  rawDistance: number,
  enter: number = PINCH_ENTER_DISTANCE,
  exit: number = PINCH_EXIT_DISTANCE,
): boolean {
  if (active) return rawDistance < exit;
  return rawDistance < enter;
}

export interface FingerExtension {
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
}

/** "Spider-Man" pose: index + pinky up, middle + ring curled. */
export function isSpiderManPose(extended: FingerExtension): boolean {
  return extended.index && extended.pinky && !extended.middle && !extended.ring;
}

/** Distance between the two hands' middle-finger MCPs (landmark 9). */
export function twoHandMcpSpan(left: Landmark[], right: Landmark[]): number {
  const l = left?.[HAND.MIDDLE_MCP];
  const r = right?.[HAND.MIDDLE_MCP];
  if (!l || !r) return 0;
  return distance(l, r);
}

/**
 * Zoom factor from two-hand pinch spread/close: ratio of current to previous
 * MCP span with a dead zone so idle jitter reads as exactly 1 (no zoom).
 */
export function twoHandZoomFactor(
  previousSpan: number,
  currentSpan: number,
  deadZone = 0.03,
): number {
  if (!previousSpan || previousSpan <= 0) return 1;
  const ratio = currentSpan / previousSpan;
  return Math.abs(ratio - 1) < deadZone ? 1 : ratio;
}

/**
 * Palm-size zoom (push toward / pull from the camera): the hand's reference
 * scale grows as it approaches the lens. Amplified so a natural push covers a
 * useful zoom range; dead zone filters breathing-distance noise.
 */
export function palmSizeZoomFactor(
  previousSize: number,
  currentSize: number,
  deadZone = 0.02,
  gain = 2.5,
): number {
  if (!previousSize || previousSize <= 0) return 1;
  const delta = currentSize / previousSize - 1;
  if (Math.abs(delta) < deadZone) return 1;
  return 1 + delta * gain;
}

/** Dead zone for tiny motions: values inside ±threshold collapse to 0. */
export function applyDeadZone(value: number, threshold: number): number {
  return Math.abs(value) < threshold ? 0 : value;
}

/** Exponential smoothing for one landmark frame (alpha = weight of the new frame). */
export function smoothLandmarks(
  previous: Landmark[] | null,
  next: Landmark[],
  alpha: number,
): Landmark[] {
  const a = Math.min(1, Math.max(0, alpha));
  if (!previous || previous.length !== next.length) return next.map((p) => ({ ...p }));
  return next.map((p, i) => {
    const q = previous[i];
    return {
      x: q.x + (p.x - q.x) * a,
      y: q.y + (p.y - q.y) * a,
      z: p.z !== undefined || q.z !== undefined ? (q.z ?? 0) + ((p.z ?? 0) - (q.z ?? 0)) * a : undefined,
    };
  });
}

/** Exponential smoothing for a scalar (palm size, span…). */
export function smoothScalar(previous: number, next: number, alpha: number): number {
  const a = Math.min(1, Math.max(0, alpha));
  return previous + (next - previous) * a;
}

/** Palm centre used as the cursor anchor: mean of wrist + finger MCPs. */
export function palmCenter(landmarks: Landmark[]): { x: number; y: number } {
  const indices = [HAND.WRIST, HAND.INDEX_MCP, HAND.MIDDLE_MCP, HAND.RING_MCP, HAND.PINKY_MCP];
  let x = 0;
  let y = 0;
  let n = 0;
  for (const i of indices) {
    const p = landmarks[i];
    if (!p) continue;
    x += p.x;
    y += p.y;
    n += 1;
  }
  return n ? { x: x / n, y: y / n } : { x: 0.5, y: 0.5 };
}

/**
 * Stable-frame debounce: a pose must be seen for `requiredFrames` consecutive
 * frames before it becomes the ACTIVE gesture. A single odd frame (tracking
 * flicker, a passer-by's hand) can never fire an action.
 */
export class StableGestureTracker {
  private candidate = "none";
  private count = 0;
  private active = "none";

  constructor(private readonly requiredFrames = 3) {}

  /** Feed the pose seen in this frame; returns the debounced active pose. */
  public update(pose: string): string {
    if (pose === this.candidate) {
      this.count += 1;
    } else {
      this.candidate = pose;
      this.count = 1;
    }
    if (this.count >= this.requiredFrames) this.active = this.candidate;
    return this.active;
  }

  public getActive(): string {
    return this.active;
  }

  public reset(): void {
    this.candidate = "none";
    this.count = 0;
    this.active = "none";
  }
}
