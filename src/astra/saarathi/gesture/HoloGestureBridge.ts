// ASTRA SAARATHI — client-side Holo gesture bridge.
//
// WHY THIS FILE EXISTS
// --------------------
// The server half of the holo layer was already complete:
//   - `GesturePolicy.ts` defines the eight gestures (HoloGestureEvent)
//   - `POST /api/saarathi/gesture` sanitises them and maps each to a `ui.*`
//     action via `mapGesture()`
//   - `AstraActionBroker` refuses to let a gesture confirm a consequential
//     hospital action ("A gesture cannot confirm a consequential hospital action.")
//
// But nothing under `src/` ever CALLED that endpoint. The gesture bridge was
// inert scaffolding — `ASTRA_SAARATHI_GESTURES=false` gated an API surface that
// no client could reach anyway. This module is the missing half.
//
// WHAT IT DOES
// ------------
// A gesture source emits a raw gesture → the bridge asks the SERVER to validate
// and map it (the server stays the authority on what a gesture means, and on
// whether gesture mode is enabled at all) → the bridge applies the mapped
// `ui.*` action to whichever registered target owns that gesture.
//
// The source is pluggable on purpose. Today the only source shipped is keyboard
// (works on every machine, no hardware); a WebXR hand-tracking / Leap / camera
// source can be added by writing another `HoloGestureSource` and passing it to
// `start()` — the dispatcher and the server contract do not change.
//
// SAFETY
// ------
// Every mapped action is UI-only by construction: `mapGesture()` returns
// `consequential: false, requiresConfirmation: false`, and the server rejects
// gesture-sourced consequential tool calls. This bridge therefore never
// executes a clinical write, and it must never be given a source that can.

import { sanitizeGesture, type HoloGestureEvent, type HoloState } from "./GesturePolicy";

/** The server's mapped action for a gesture (see GesturePolicy.mapGesture). */
export interface HoloMappedAction {
  type: string;
  targetId?: string;
  consequential: boolean;
  requiresConfirmation: boolean;
}

/** Emit a raw gesture into the bridge. */
export type HoloGestureEmitter = (gesture: HoloGestureEvent, targetId?: string) => void;

/**
 * A gesture source wires some input device to the bridge and returns a
 * detach function. Keyboard is the default; anything that can call `emit` works.
 */
export type HoloGestureSource = (emit: HoloGestureEmitter) => () => void;

/** A UI surface that can respond to gestures (the 3D viewer, a list, a dock…). */
export interface HoloGestureTarget {
  id: string;
  /** Return `false` to decline the gesture so the bridge can fall through. */
  onGesture?: (gesture: HoloGestureEvent, action: HoloMappedAction) => boolean | void;
}

export type HoloBridgeStatus = "idle" | "disabled" | "active" | "error";

export interface HoloBridgeEvent {
  gesture: HoloGestureEvent;
  targetId?: string;
  action?: HoloMappedAction;
  status: HoloBridgeStatus;
  /** Honest failure text — surfaces must render this, never swallow it. */
  error?: string;
}

const GESTURE_ENDPOINT = "/api/saarathi/gesture";

export class HoloGestureBridge {
  private targets = new Map<string, HoloGestureTarget>();
  private fallback: HoloGestureTarget | null = null;
  private listeners = new Set<(event: HoloBridgeEvent) => void>();
  private detach: (() => void) | null = null;
  private inFlight = false;

  /** Register a gesture target. Returns an unregister function. */
  register(target: HoloGestureTarget): () => void {
    this.targets.set(target.id, target);
    return () => {
      this.targets.delete(target.id);
    };
  }

  /** Target used when a gesture carries no targetId, or the target declined. */
  setFallback(target: HoloGestureTarget | null): void {
    this.fallback = target;
  }

  subscribe(listener: (event: HoloBridgeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: HoloBridgeEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  /**
   * Validate + map one gesture through the server, then apply the mapped action.
   *
   * The server is deliberately in the loop: it owns gesture-mode enablement, and
   * keeping validation server-side means a compromised client cannot invent a
   * gesture the policy does not allow.
   */
  async submit(gesture: HoloGestureEvent, targetId?: string, token?: string | null): Promise<HoloBridgeEvent> {
    const state: HoloState | null = sanitizeGesture({ gesture, targetId });
    if (!state) {
      const event: HoloBridgeEvent = { gesture, targetId, status: "error", error: `Unknown gesture "${gesture}".` };
      this.emit(event);
      return event;
    }
    // Drop re-entrant gestures: a held key must not queue a backlog of fetches.
    if (this.inFlight) {
      return { gesture, targetId, status: "active" };
    }

    this.inFlight = true;
    try {
      const res = await fetch(GESTURE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(state),
      });

      // 503 GESTURES_DISABLED is a policy answer, not a failure. Report it as
      // such so the UI can explain the gate instead of looking broken.
      if (res.status === 503) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        const event: HoloBridgeEvent = {
          gesture,
          targetId,
          status: "disabled",
          error: body.message ?? "Gesture mode is disabled.",
        };
        this.emit(event);
        return event;
      }
      if (!res.ok) throw new Error(`gesture endpoint HTTP ${res.status}`);

      const body = (await res.json()) as { action?: HoloMappedAction };
      const action = body.action;
      if (!action) throw new Error("gesture endpoint returned no action");

      this.apply(gesture, action);
      const event: HoloBridgeEvent = { gesture, targetId, action, status: "active" };
      this.emit(event);
      return event;
    } catch (error) {
      const event: HoloBridgeEvent = {
        gesture,
        targetId,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      };
      this.emit(event);
      return event;
    } finally {
      this.inFlight = false;
    }
  }

  /** Route a mapped action to its target, falling through to the fallback. */
  private apply(gesture: HoloGestureEvent, action: HoloMappedAction): void {
    if (gesture === "stop" && typeof window !== "undefined") {
      window.dispatchEvent(new Event("astra-saarathi-stop"));
    }
    const explicit = action.targetId ?? undefined;
    if (explicit) {
      const target = this.targets.get(explicit);
      if (target?.onGesture?.(gesture, action) !== false) return;
    }
    for (const target of this.targets.values()) {
      if (target.id === explicit) continue;
      if (target.onGesture?.(gesture, action) !== false) return;
    }
    this.fallback?.onGesture?.(gesture, action);
  }

  /** Begin listening via `source`. Returns a detach function. */
  start(source: HoloGestureSource, token?: string | null): () => void {
    this.stop();
    this.detach = source((gesture, targetId) => {
      void this.submit(gesture, targetId, token);
    });
    return () => this.stop();
  }

  stop(): void {
    this.detach?.();
    this.detach = null;
  }

  get listening(): boolean {
    return this.detach !== null;
  }
}

/** Default key bindings — one key per gesture in the policy. */
export const DEFAULT_HOLO_KEYMAP: Record<string, HoloGestureEvent> = {
  Enter: "select",
  o: "open",
  ArrowUp: "move",
  ArrowDown: "move",
  ArrowLeft: "move",
  ArrowRight: "move",
  "+": "zoom",
  "=": "zoom",
  "-": "zoom",
  _: "zoom",
  "0": "reset",
  Home: "reset",
  Escape: "cancel",
  d: "dock",
  s: "stop",
};

/**
 * True when a keystroke is destined for a text field.
 *
 * Without this guard the holo keymap would hijack ordinary typing: pressing
 * "d" in the patient search box would dock a panel, and Escape in a clinical
 * note would cancel a gesture the user never made. Every keyboard-driven
 * gesture source must gate on this.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return el.isContentEditable === true;
}

/**
 * Keyboard gesture source.
 *
 * Held keys are debounced by the bridge's in-flight guard rather than here, so a
 * key-repeat burst collapses into one round trip.
 */
export function createKeyboardGestureSource(
  getTargetId: () => string | undefined,
  keymap: Record<string, HoloGestureEvent> = DEFAULT_HOLO_KEYMAP,
): HoloGestureSource {
  return (emit) => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      const gesture = keymap[event.key];
      if (!gesture) return;
      event.preventDefault();
      emit(gesture, getTargetId());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  };
}
