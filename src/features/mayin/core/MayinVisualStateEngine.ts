/**
 * ASTRA 7D — DR. MAYIN VISUAL STATE ENGINE
 * ============================================================================
 * Subscribes to the Astra agent bus and maps REAL events onto Mayin's visual
 * states. There are NO timers that fake "thinking" — every transition is
 * caused by an observable system event:
 *
 *   lab.query.started            → RETRIEVING
 *   reasoning.started            → THINKING
 *   d7.node (synthesize_7D)      → ANALYSING
 *   voice.speaking               → SPEAKING
 *   pharmacy.order.created       → DISPATCHING
 *   pharmacy.order.dispensed     → COMPLETE
 *   lab.critical                 → CRITICAL (sticky until acknowledged)
 */

import { agentBus } from "@/astra/runtime/agentBus";
import type { MayinEvent, MayinEventType, MayinState, VisualQuality } from "./MayinTypes";

/** Direct event → state map. Events absent here never change visual state. */
const EVENT_STATE_MAP: Partial<Record<MayinEventType, MayinState>> = {
  "patient.registered": "wake",
  "patient.selected": "wake",

  "lab.query.started": "retrieving",
  "radiology.query.started": "retrieving",
  "evidence.search.started": "retrieving",

  "lab.query.completed": "showing_result",
  "lab.resulted": "showing_result",
  "radiology.reported": "showing_result",

  "reasoning.started": "thinking",
  "d7.node": "analysing",
  "reasoning.completed": "complete",

  "voice.listening": "listening",
  "voice.transcript": "understanding",
  "voice.speaking": "speaking",
  "voice.paused": "paused",
  "voice.interrupted": "listening",

  "pharmacy.order.created": "dispatching",
  "task.created": "dispatching",
  "pharmacy.order.acknowledged": "waiting",
  "task.acknowledged": "waiting",
  "pharmacy.order.dispensed": "complete",
  "task.completed": "complete",
  "pharmacy.order.failed": "attention",
  "task.failed": "attention",
  "confirmation.required": "attention",

  "lab.critical": "critical",
  "radiology.critical": "critical",

  // System-1 reflex: a fast Laya routing decision reads as brief comprehension.
  // A degraded Laya runtime is deliberately ABSENT from this map — an optional
  // component failing must never change what the doctor sees (§66).
  "laya.decision": "understanding",

  // Gesture engine (browser-native): camera opening is a vision state.
  "gesture.engine.started": "vision",
  "vision.camera.started": "vision",
  "vision.analysis.completed": "showing_result",

  // Memory gateway: retrieval is real work and is shown as such.
  "memory.recalled": "retrieving",
};

class MayinVisualStateEngine {
  private state: MayinState = "idle";
  private stateBeforeCritical: MayinState | null = null;
  private quality: VisualQuality = "BALANCED";
  private listeners = new Set<(state: MayinState) => void>();
  private busUnsubscribe: (() => void) | null = null;

  /** Wire the engine to the shared Astra agent bus (idempotent). */
  public attachToAgentBus(): () => void {
    if (this.busUnsubscribe) return this.busUnsubscribe;
    this.busUnsubscribe = agentBus.subscribe((event) => {
      if (!event?.type) return;
      this.publish({ type: event.type as MayinEventType, payload: event.payload });
    });
    return this.busUnsubscribe;
  }

  /** Push an event into the engine. Returns true when it changed the state. */
  public publish(event: MayinEvent): boolean {
    const next = EVENT_STATE_MAP[event.type];
    if (!next) return false;

    if (next === "critical") {
      if (this.state !== "critical") this.stateBeforeCritical = this.state;
      this.setState("critical");
      return true;
    }
    if (this.state === "critical") {
      // A critical alert stays sticky; ordinary events queue behind it until
      // the clinician acknowledges the alert.
      return false;
    }
    if (event.type === "d7.node") {
      // Final synthesis node reads as comparing; earlier nodes as analysing.
      const node = String(event.payload?.node ?? "");
      this.setState(node.startsWith("synthesize") ? "comparing" : "analysing");
      return true;
    }
    const changed = next !== this.state;
    this.setState(next);
    return changed;
  }

  /** Clinician acknowledges a critical result → restore the pre-alert state. */
  public acknowledgeCritical(): void {
    if (this.state !== "critical") return;
    const restored = this.stateBeforeCritical ?? "idle";
    this.stateBeforeCritical = null;
    this.setState(restored);
  }

  public getState(): MayinState {
    return this.state;
  }

  public setQuality(quality: VisualQuality): void {
    this.quality = quality;
  }

  public getQuality(): VisualQuality {
    return this.quality;
  }

  public subscribe(listener: (state: MayinState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  /** Test-only reset — production code never calls this. */
  public __resetForTest(): void {
    this.state = "idle";
    this.stateBeforeCritical = null;
  }

  private setState(next: MayinState): void {
    if (next === this.state) return;
    this.state = next;
    for (const listener of this.listeners) {
      try {
        listener(next);
      } catch (err) {
        console.warn("MayinVisualStateEngine listener error:", err);
      }
    }
  }
}

export const mayinVisualEngine = new MayinVisualStateEngine();
