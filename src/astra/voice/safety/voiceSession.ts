/**
 * R5-08 — one voice session for the whole app.
 * It does not open a second ear or mouth. Callers keep startSaarathiListening and speakAstra;
 * this session decides when those may run, and records stop / mute / state changes without audio.
 */

import { astraEventBus } from "@/astra/events/astraEventBus";
import {
  classifyVoiceSurface,
  DEFAULT_AGENT_NAMES,
  dispatchVoiceGesture,
  registerSilenceDetector,
  registerVoiceGestureHandler,
  STOP_REPLY,
  VOICE_STATE_VISUAL,
  voiceFlightEvent,
  type VoiceGestureIntent,
  type VoiceState,
  type VoiceSurface,
} from "./voiceSafety";

export interface VoiceSnapshot {
  state: VoiceState;
  silent: boolean;
  pushToTalk: boolean;
  doctorBargeIn: boolean;
  tone: (typeof VOICE_STATE_VISUAL)[VoiceState]["tone"];
  motion: (typeof VOICE_STATE_VISUAL)[VoiceState]["motion"];
  label: string;
  route: string;
}

export interface VoiceTurnHints {
  clinical: boolean;
  approvalDecisionId?: string;
}

type Speaker = (text: string, signal: AbortSignal) => Promise<void>;
type FlightLog = (eventType: string, fields: Record<string, unknown>) => void;

function publishFlight(eventType: string, fields: Record<string, unknown>): void {
  const event = voiceFlightEvent(eventType, fields);
  void astraEventBus.publish({
    source: "voice-safety",
    target: "flight-recorder",
    eventType: event.eventType,
    actorId: "voice-safety",
    actorRole: "system",
    privacyClass: "INTERNAL",
    riskClass: "R0",
    payload: event.payload,
  }).catch(() => undefined);
}

export class VoiceSession {
  private state: VoiceState = "IDLE";
  private silent = false;
  private paused = false;
  private pushToTalk = false;
  private doctorBargeIn = false;
  private speakInFlight = false;
  private okayInFlight = false;
  private epochValue = 0;
  private route = "";
  private roleName = "";
  private dashboardName = "";
  private surfaceName: VoiceSurface = "staff";
  private userId = "";
  private names: string[] = [...DEFAULT_AGENT_NAMES];
  private turnClinical = false;
  private approvalDecisionId: string | undefined;
  private lastSpoken = "";
  private controlLatencyMs = 0;
  private speakAbort: AbortController | null = null;
  private speakGate: Promise<void> = Promise.resolve();
  private micStop: (() => void) | null = null;
  private speaker: Speaker | null = null;
  private boundSpeaker: Speaker | null = null;
  private grantFetcher: (approvalDecisionId: string | undefined, surface: "patient" | "attender") => Promise<boolean> = async () => false;
  private readonly listeners = new Set<() => void>();
  private readonly startHandlers = new Set<() => void>();
  private readonly now: () => number;
  private readonly log: FlightLog;
  private cancelPlayback: () => void;

  constructor(deps: { now?: () => number; log?: FlightLog; cancelPlayback?: () => void } = {}) {
    this.now = deps.now ?? (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    this.log = deps.log ?? publishFlight;
    this.cancelPlayback = deps.cancelPlayback ?? (() => undefined);
  }

  bindPlaybackCancel(cancel: () => void): void {
    this.cancelPlayback = cancel;
  }

  bindSpeaker(speaker: Speaker | null): void {
    this.boundSpeaker = speaker;
    this.speaker = speaker;
  }

  setGrantFetcher(fetcher: VoiceSession["grantFetcher"]): void {
    this.grantFetcher = fetcher;
  }

  /** Connects a future hand-gesture adapter. No gesture detector is started. */
  bridgeGestures(): () => void {
    return registerVoiceGestureHandler((intent: VoiceGestureIntent) => {
      if (intent === "stop") this.hardStop({ reason: "gesture", replyOkay: false });
      else if (intent === "pause") this.pause();
      else if (intent === "resume") this.resume();
    });
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStart(handler: () => void): () => void {
    this.startHandlers.add(handler);
    return () => this.startHandlers.delete(handler);
  }

  snapshot(): VoiceSnapshot {
    const visual = VOICE_STATE_VISUAL[this.state];
    return {
      state: this.state,
      silent: this.silent,
      pushToTalk: this.pushToTalk,
      doctorBargeIn: this.doctorBargeIn,
      tone: visual.tone,
      motion: visual.motion,
      label: visual.label,
      route: this.route,
    };
  }

  epoch(): number {
    return this.epochValue;
  }

  agentNames(): string[] {
    return [...this.names];
  }

  setAgentNames(names: readonly string[]): void {
    const next = names.map((name) => name.trim()).filter(Boolean);
    this.names = next.length ? next : [...DEFAULT_AGENT_NAMES];
  }

  isSilent(): boolean {
    return this.silent;
  }

  isPaused(): boolean {
    return this.paused || this.state === "MUTED";
  }

  role(): string {
    return this.roleName;
  }

  dashboard(): string {
    return this.dashboardName;
  }

  surface(): VoiceSurface {
    return this.surfaceName;
  }

  turnHints(): VoiceTurnHints {
    return { clinical: this.turnClinical, approvalDecisionId: this.approvalDecisionId };
  }

  lastSpokenText(): string {
    return this.lastSpoken;
  }

  lastControlLatencyMs(): number {
    return this.controlLatencyMs;
  }

  setContext(ctx: { role?: string; dashboard?: string; route?: string; userId?: string }): void {
    if (ctx.role != null) this.roleName = ctx.role;
    if (ctx.dashboard != null) this.dashboardName = ctx.dashboard;
    if (ctx.userId != null) this.userId = ctx.userId;
    if (ctx.route != null) this.surfaceName = classifyVoiceSurface(ctx.route);
  }

  setTurnHints(hints: VoiceTurnHints): void {
    this.turnClinical = hints.clinical;
    this.approvalDecisionId = hints.approvalDecisionId;
  }

  setInteractionMode(mode: { pushToTalk: boolean; doctorBargeIn: boolean }): void {
    this.pushToTalk = mode.pushToTalk;
    this.doctorBargeIn = mode.doctorBargeIn;
    this.emit();
  }

  async grant(approvalDecisionId: string | undefined, surface: "patient" | "attender"): Promise<boolean> {
    try {
      return await this.grantFetcher(approvalDecisionId, surface);
    } catch {
      return false;
    }
  }

  onRoute(route: string): void {
    if (this.route === route) return;
    const previous = this.route;
    this.route = route;
    this.surfaceName = classifyVoiceSurface(route);
    if (previous) this.hardStop({ reason: "route", replyOkay: false });
  }

  earBlocked(): boolean {
    return this.speakInFlight || this.state === "SPEAKING";
  }

  blocksNewEar(manual: boolean): boolean {
    if (this.paused || this.state === "MUTED") return true;
    if (this.silent && !manual) return true;
    return false;
  }

  waitUntilQuiet(): Promise<void> {
    return this.speakGate;
  }

  registerMic(stop: () => void): void {
    if (this.micStop && this.micStop !== stop) {
      const previous = this.micStop;
      this.micStop = stop;
      try { previous(); } catch { /* previous ear already closed */ }
      return;
    }
    this.micStop = stop;
  }

  clearMic(stop: () => void): void {
    if (this.micStop === stop) this.micStop = null;
  }

  markListening(): void {
    if (this.blocksNewEar(true) || this.earBlocked()) return;
    this.transition("LISTENING", "listen-start");
  }

  markIdleIfListening(): void {
    if (this.state === "LISTENING") this.transition("IDLE", "listen-end");
  }

  markThinking(): void {
    if (this.state === "MUTED" || this.paused) return;
    this.closeEar();
    this.transition("THINKING", "thinking");
  }

  finishThinking(): void {
    if (this.state === "THINKING") this.transition(this.paused ? "MUTED" : "IDLE", "think-end");
  }

  requestStart(): void {
    this.paused = false;
    if (this.state === "MUTED") this.transition("IDLE", "start");
    for (const handler of [...this.startHandlers]) handler();
  }

  resume(): void {
    this.requestStart();
  }

  pause(): void {
    this.controlStop("pause", "MUTED");
    this.record("voice.muted", { reason: "pause", state: this.state });
  }

  /** Doctor started speaking during a clinical answer. Speech ends; the conversational ear stays closed until onend. */
  pauseForDoctorSpeech(): boolean {
    if (!this.doctorBargeIn || this.state !== "SPEAKING") return false;
    this.controlStop("doctor-speech", "IDLE");
    this.record("voice.stopped", { reason: "doctor-speech", state: this.state });
    return true;
  }

  releasePanel(): number {
    return this.hardStop({ reason: "panel", replyOkay: false });
  }

  /**
   * Cancel TTS, drop the audio buffer, and close the mic.
   * The synchronous part is the <300ms target. "Okay" is scheduled after that, and only then.
   */
  hardStop(opts: { reason: string; replyOkay?: boolean }): number {
    const started = this.now();
    const speakingOkay = this.okayInFlight;
    this.controlStop(opts.reason, "IDLE");
    const elapsed = this.now() - started;
    this.controlLatencyMs = elapsed;
    this.record("voice.stopped", {
      reason: opts.reason,
      state: this.state,
      latencyMs: elapsed,
    });
    if (opts.replyOkay && !this.silent && !speakingOkay) {
      this.lastSpoken = STOP_REPLY;
      this.okayInFlight = true;
      // The stop itself leaves IDLE/MUTED. "Okay" is a later turn, not part of the cancel.
      queueMicrotask(() => {
        void this.safeSpeak(STOP_REPLY, async (signal) => {
          if (this.speaker) await this.speaker(STOP_REPLY, signal);
        }).finally(() => {
          this.okayInFlight = false;
        });
      });
    }
    return elapsed;
  }

  setSilent(on: boolean): void {
    if (this.silent === on) return;
    this.silent = on;
    if (on) {
      const abort = this.speakAbort;
      this.speakAbort = null;
      abort?.abort();
      try { this.cancelPlayback(); } catch { /* buffer already clear */ }
      if (this.state === "SPEAKING") this.transition("IDLE", "silent");
    }
    this.record("voice.silent", { silent: on, state: this.state });
    this.emit();
  }

  async safeSpeak(text: string, play: (signal: AbortSignal) => Promise<void>): Promise<"ended" | "cancelled" | "blocked"> {
    if (!text.trim() || this.silent || this.paused || this.state === "MUTED") return "blocked";
    this.closeEar();
    if (this.state === "LISTENING") this.transition("IDLE", "listen-preempt");

    const abort = new AbortController();
    this.speakAbort = abort;
    this.speakInFlight = true;
    let resolveGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      resolveGate = resolve;
    });
    this.speakGate = gate;
    this.transition("SPEAKING", "speak-start");
    let outcome: "ended" | "cancelled" = "ended";
    try {
      await new Promise<void>((resolve) => {
        let settled = false;
        const finish = (value: "ended" | "cancelled") => {
          if (settled) return;
          settled = true;
          outcome = value;
          resolve();
        };
        abort.signal.addEventListener("abort", () => finish("cancelled"), { once: true });
        Promise.resolve(play(abort.signal)).then(
          () => finish(abort.signal.aborted ? "cancelled" : "ended"),
          () => finish("cancelled"),
        );
      });
    } finally {
      const owns = this.speakAbort === abort;
      if (owns) {
        this.speakAbort = null;
        this.speakInFlight = false;
        if (this.state === "SPEAKING") {
          this.transition(this.paused ? "MUTED" : "IDLE", abort.signal.aborted ? "speak-cancel" : "speak-end");
        }
      }
      resolveGate();
    }
    return outcome;
  }

  /** Opens `open` only after the current speak gate (onend or cancel). Never during SPEAKING. */
  async safeListen(open: (signal: AbortSignal) => Promise<void>, opts?: { manual?: boolean }): Promise<"opened" | "blocked"> {
    if (this.blocksNewEar(Boolean(opts?.manual))) return "blocked";
    const epoch = this.epochValue;
    await this.speakGate;
    if (epoch !== this.epochValue) return "blocked";
    if (this.blocksNewEar(Boolean(opts?.manual)) || this.earBlocked()) return "blocked";
    const abort = new AbortController();
    const stop = () => abort.abort();
    this.registerMic(stop);
    this.transition("LISTENING", "listen-start");
    try {
      await open(abort.signal);
      return "opened";
    } finally {
      this.clearMic(stop);
      if (this.state === "LISTENING") this.transition("IDLE", "listen-end");
    }
  }

  resetForTest(): void {
    this.epochValue += 1;
    this.speakAbort?.abort();
    this.speakAbort = null;
    this.micStop = null;
    this.state = "IDLE";
    this.silent = false;
    this.paused = false;
    this.pushToTalk = false;
    this.doctorBargeIn = false;
    this.speakInFlight = false;
    this.okayInFlight = false;
    this.route = "";
    this.roleName = "";
    this.dashboardName = "";
    this.surfaceName = "staff";
    this.userId = "";
    this.turnClinical = false;
    this.approvalDecisionId = undefined;
    this.lastSpoken = "";
    this.controlLatencyMs = 0;
    this.names = [...DEFAULT_AGENT_NAMES];
    this.speaker = this.boundSpeaker;
    this.grantFetcher = async () => false;
    this.speakGate = Promise.resolve();
    registerVoiceGestureHandler(null);
    registerSilenceDetector(null);
  }

  private controlStop(reason: string, next: VoiceState): void {
    this.epochValue += 1;
    this.paused = next === "MUTED";
    const abort = this.speakAbort;
    this.speakAbort = null;
    abort?.abort();
    try { this.cancelPlayback(); } catch { /* buffer already clear */ }
    this.closeEar();
    this.speakInFlight = false;
    if (next === "IDLE") this.paused = false;
    this.transition(next, reason);
  }

  private closeEar(): void {
    const stop = this.micStop;
    this.micStop = null;
    try { stop?.(); } catch { /* mic already closed */ }
  }

  private transition(next: VoiceState, reason: string): void {
    if (this.state === next) {
      this.emit();
      return;
    }
    const from = this.state;
    this.state = next;
    this.record("voice.state.changed", { from, to: next, reason, state: next });
    this.emit();
  }

  private record(eventType: string, fields: Record<string, unknown>): void {
    this.log(eventType, {
      ...fields,
      role: this.roleName || "system",
      actor: this.userId || "voice-safety",
    });
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const voiceSession = new VoiceSession();

/**
 * Bind the active dashboard route. The returned cleanup is the unmount path:
 * it cancels audio synchronously, in the same turn as the route change,
 * before the next animation frame.
 */
export function attachVoiceDashboard(route: string, session: VoiceSession = voiceSession): () => void {
  session.onRoute(route);
  return () => {
    session.hardStop({ reason: "unmount", replyOkay: false });
  };
}

/** Used by tests and by the gesture bridge. Re-export so callers do not import two gesture paths. */
export { dispatchVoiceGesture };
