export type HoloGestureEvent = "select" | "open" | "move" | "zoom" | "reset" | "cancel" | "dock" | "stop";
export interface HoloState { gesture: HoloGestureEvent; targetId?: string; timestamp: number }
export function sanitizeGesture(input: unknown): HoloState | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  const allowed = new Set<HoloGestureEvent>(["select", "open", "move", "zoom", "reset", "cancel", "dock", "stop"]);
  if (!allowed.has(value.gesture as HoloGestureEvent)) return null;
  const targetId = typeof value.targetId === "string" ? value.targetId.slice(0, 120) : undefined;
  return { gesture: value.gesture as HoloGestureEvent, targetId, timestamp: Date.now() };
}
export function mapGesture(state: HoloState) { return { type: `ui.${state.gesture}`, targetId: state.targetId, consequential: false, requiresConfirmation: false }; }
