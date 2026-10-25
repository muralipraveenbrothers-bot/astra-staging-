/**
 * ASTRA 7D — DR. MAYIN GESTURE BRIDGE (semantic gesture → Mayin context)
 * ============================================================================
 * Consumes the agent-bus `gesture.command` events produced by
 * MayinGestureController and translates them into SEMANTIC Mayin events:
 *
 *   • SELECT   → patches MayinContext (selectedObject / selectedAnatomyNode)
 *                so "explain THIS" resolves against the doctor's selection.
 *   • WORKSPACE (zoom / rotate / drag / reset / reveal) → notified but NEVER
 *                mutates clinical context; workspace ≠ patient data.
 *   • ENGINE   (gesture.engine.started / .stopped) → surfaced for the HUD.
 *
 * Rules (spec §32-§34, §66):
 *   - Local processing only — nothing here sends landmarks anywhere.
 *   - A gesture can never create, sign or finalize a clinical action; it can
 *     only MOVE the selection pointer that Dr. Mayin already grounds.
 *   - The bridge never throws into Astra core: bad payloads are ignored.
 */

import { agentBus } from "@/astra/runtime/agentBus";
import type { MayinContext } from "../core/MayinTypes";
import type { ViewerGestureEvent } from "./ViewerGestureProcessor";
import { getActiveGestureViewer } from "./gestureViewerRegistry";

export type MayinGestureSemanticKind = "selection" | "workspace" | "engine";

export interface MayinGestureSemanticEvent {
  kind: MayinGestureSemanticKind;
  gesture?: string;
  action?: string;
  objectId?: string;
  /** The updated context — always a NEW object, never mutated in place. */
  context: MayinContext;
  ts: number;
}

export interface GestureBridgeDeps {
  initialContext?: MayinContext;
  /** Called whenever a selection changes the doctor's active context. */
  onContextChange?: (context: MayinContext) => void;
  now?: () => number;
}

const WORKSPACE_ACTIONS = new Set(["drag_move", "zoom", "rotate", "reset_workspace", "reveal_controls"]);

export class MayinGestureBridge {
  private context: MayinContext;
  private readonly deps: GestureBridgeDeps;
  private readonly listeners = new Set<(event: MayinGestureSemanticEvent) => void>();
  private unsubscribe: (() => void) | null = null;

  constructor(deps: GestureBridgeDeps = {}) {
    this.deps = deps;
    this.context = deps.initialContext ?? { userId: "", role: "" };
  }

  /** Subscribe to the real agent bus. Idempotent. */
  public start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = agentBus.subscribe((event) => {
      try {
        if (event.type === "gesture.command") {
          this.handleCommand(event.payload ?? {});
        } else if (
          event.type === "gesture.engine.started" ||
          event.type === "gesture.engine.stopped"
        ) {
          this.emit({
            kind: "engine",
            action: event.type,
            context: this.context,
            ts: this.now(),
          });
        }
      } catch {
        // A bridge fault must never break the bus (§66).
      }
    });
  }

  public stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** Translate one gesture command into a semantic Mayin event. */
  public handleCommand(payload: Record<string, unknown>): MayinGestureSemanticEvent | null {
    const action = typeof payload.action === "string" ? payload.action : "";
    const gesture = typeof payload.gesture === "string" ? payload.gesture : undefined;
    const objectId = typeof payload.objectId === "string" ? payload.objectId : undefined;
    if (!action || action === "none") return null;

    const ts = this.now();

    if (action === "select") {
      // Move ONLY the selection pointer — patient/encounter grounding is untouched.
      this.context = { ...this.context, selectedObject: objectId ?? this.context.selectedObject };
      this.deps.onContextChange?.(this.context);
      const event: MayinGestureSemanticEvent = {
        kind: "selection",
        gesture,
        action,
        objectId,
        context: this.context,
        ts,
      };
      this.emit(event);
      return event;
    }

    if (WORKSPACE_ACTIONS.has(action)) {
      const event: MayinGestureSemanticEvent = {
        kind: "workspace",
        gesture,
        action,
        objectId,
        context: this.context,
        ts,
      };
      this.emit(event);
      return event;
    }

    return null;
  }

  /** Current doctor context as the bridge sees it (never leaks internals). */
  public getContext(): MayinContext {
    return this.context;
  }

  /**
   * Route one spatial viewer event (from ViewerGestureProcessor) to the active
   * 3D viewer adapter (anatomy viewer / OrthoPlanner canvas) and mirror it as
   * a semantic event for HUD subscribers. Workspace events NEVER touch
   * clinical context; only the selection pointer moves.
   */
  public handleViewerEvent(event: ViewerGestureEvent): void {
    const ts = this.now();
    try {
      const viewer = getActiveGestureViewer();
      switch (event.type) {
        case "cursor":
          if (event.active) viewer?.moveCursor(event.x, event.y);
          else viewer?.hideCursor();
          return; // cursor motion is too chatty for the semantic stream
        case "select":
          viewer?.selectUnderCursor();
          this.emit({ kind: "selection", action: "select", context: this.context, ts });
          return;
        case "rotate":
          viewer?.rotateBy(event.dx, event.dy);
          break;
        case "zoom":
          viewer?.zoomBy(event.factor);
          break;
        case "pan":
          viewer?.pan(event.dx, event.dy);
          break;
        case "reset":
          viewer?.reset();
          break;
        case "tour":
          viewer?.tourStep(event.dir);
          break;
        case "present":
          viewer?.setPresentMode(true);
          break;
        case "gesture":
          return; // display-only label for the PiP overlay
        default:
          return;
      }
      this.emit({
        kind: "workspace",
        action: event.type,
        context: this.context,
        ts,
      });
    } catch {
      // A bridge fault must never break gesture control (§66).
    }
  }

  /** Replace context wholesale (patient opened in the EMR, module change…). */
  public setContext(context: MayinContext): void {
    this.context = context;
  }

  public subscribe(listener: (event: MayinGestureSemanticEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: MayinGestureSemanticEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.warn("gesture bridge listener error:", err);
      }
    }
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }
}

/** One bridge per session; the Mayin runtime owns its lifecycle. */
export function createMayinGestureBridge(deps: GestureBridgeDeps = {}): MayinGestureBridge {
  return new MayinGestureBridge(deps);
}
