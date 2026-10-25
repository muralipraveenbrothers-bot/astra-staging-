// Saarathi Gesture Vision has been removed. This surface stays mounted only so
// older dashboards that still import it render nothing.

import type { HoloGestureEvent } from "@/astra/saarathi/gesture/GesturePolicy";

// The useHoloGestures hook is intentionally NOT called here anymore — the retired
// surface must not start any input source on mount.

/** Gesture vocabulary (accessibility/debug fallback types only — NOT UI). */
export type { HoloGestureEvent };

export default function HoloGesturePanel() {
  return null;
}
