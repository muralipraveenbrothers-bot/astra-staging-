/**
 * ASTRA 7D — DR. MAYIN CONVERSATION CONTROLLER
 * ============================================================================
 * Provider-independent, contextual turn-taking (spec §13-§21):
 *
 *   • end-of-turn silence windows per eagerness (LOW / NORMAL / FAST)
 *   • barge-in ("Stop.") abandons the current response — it is NEVER resumed
 *   • third-party conversation pauses Mayin; "Mayin, continue." resumes from
 *     the preserved SESSION turn (session memory — not Cognee)
 *   • unaddressed room speech is ignored (no interrupting staff discussions)
 *   • mid-conversation language switching without session restart
 *
 * Timing here is real end-of-turn logic, not simulated thinking.
 */

import type {
  ConversationState,
  LanguageState,
  MayinContext,
  TurnEagerness,
} from "../core/MayinTypes";
import { detectLanguage, mergeLanguageState } from "./languageRouter";
import type { MayinVoiceProvider, TranscriptEvent } from "./voiceProvider";
import { MAYIN_WAKE_PATTERN } from "@/astra/voice/roundTrip/wakeDetection";

/** Strongly-directed wake forms (spec §18). */
export { MAYIN_WAKE_PATTERN };

/** Immediate-abort commands — honoured FAST in every eagerness mode (§15/§16). */
const BARGE_STOP_PATTERN =
  /^\s*(stop|cancel|halt|bas|ruko|ruk|band\s*karo|बंद|रुको|aagu|aagandi|ఆగు|ఆగండి)\b/i;

/** Default end-of-turn silence windows in milliseconds. */
const END_OF_TURN_MS: Record<TurnEagerness, number> = {
  LOW: 1500,    // dictation — wait for genuine completion
  NORMAL: 700,  // hospital default — tolerate mid-sentence breaths
  FAST: 300,    // short commands ("Mayin, stop.")
};

/** How long a wake/direct-address keeps the exchange "open" for follow-ups. */
export const ADDRESS_WINDOW_MS = 8_000;

/** Explicit resume commands honoured while PAUSED (§20). */
const RESUME_PATTERN = /\b(continue|resume|proceed|go\s+on)\b/i;

export interface PausedTurn {
  topic?: string;
  patientId?: string;
  encounterId?: string;
  responseId?: string;
  lastCompletedSection: string | null;
  remainingSections: string[];
  pausedAt: number;
  reason: string;
}

export interface TurnRequest {
  text: string;
  context: MayinContext;
  language: LanguageState;
  resume: boolean;
  pausedTurn: PausedTurn | null;
}

export interface TurnOutcome {
  speech: string;
  responseId?: string;
  topic?: string;
  completedSection?: string;
  remainingSections?: string[];
}

export interface ControllerScheduler {
  set(fn: () => void, ms: number): number;
  clear(id: number): void;
}

const realScheduler: ControllerScheduler = {
  set: (fn, ms) => setTimeout(fn, ms) as unknown as number,
  clear: (id) => clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
};

export interface ConversationControllerOptions {
  provider: MayinVoiceProvider;
  onTurn: (request: TurnRequest) => Promise<TurnOutcome>;
  eagerness?: TurnEagerness;
  /** Require "Mayin …" direct address when starting a fresh exchange (§18). */
  requireAddress?: boolean;
  /** Push-to-talk sessions bypass wake-name gating. */
  pushToTalk?: boolean;
  context?: MayinContext;
  scheduler?: ControllerScheduler;
  now?: () => number;
  onStateChange?: (state: ConversationState) => void;
  onLanguageChange?: (state: LanguageState) => void;
}

export class MayinConversationController {
  private state: ConversationState = "idle";
  private eagerness: TurnEagerness;
  private requireAddress: boolean;
  private pushToTalk: boolean;
  private context: MayinContext;
  private language: LanguageState = {
    primaryLanguage: "en",
    secondaryLanguage: null,
    codeSwitching: false,
    confidence: 0.7,
  };

  private pausedTurn: PausedTurn | null = null;
  private lastAddressAt = Number.NEGATIVE_INFINITY;
  private deadlineAt = 0;
  private pendingText: string | null = null;
  private turnTimer: number | null = null;
  private speaking: TurnOutcome | null = null;
  private speakingAborted = false;

  private readonly provider: MayinVoiceProvider;
  private readonly onTurn: (request: TurnRequest) => Promise<TurnOutcome>;
  private readonly scheduler: ControllerScheduler;
  private readonly now: () => number;
  private readonly stateListeners = new Set<(state: ConversationState) => void>();
  private readonly options: ConversationControllerOptions;

  constructor(options: ConversationControllerOptions) {
    this.options = options;
    this.provider = options.provider;
    this.onTurn = options.onTurn;
    this.eagerness = options.eagerness ?? "NORMAL";
    this.requireAddress = options.requireAddress ?? true;
    this.pushToTalk = options.pushToTalk ?? false;
    this.context = options.context ?? { userId: "", role: "" };
    this.scheduler = options.scheduler ?? realScheduler;
    this.now = options.now ?? (() => Date.now());
  }

  // ------------------------------------------------------------------ state

  public getState(): ConversationState {
    return this.state;
  }

  public getLanguage(): LanguageState {
    return this.language;
  }

  public getPausedTurn(): PausedTurn | null {
    return this.pausedTurn;
  }

  public subscribe(listener: (state: ConversationState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  public setEagerness(eagerness: TurnEagerness): void {
    this.eagerness = eagerness;
  }

  public setContext(context: MayinContext): void {
    this.context = context;
  }

  public setPushToTalk(enabled: boolean): void {
    this.pushToTalk = enabled;
  }

  // ------------------------------------------------------------- transcript

  /**
   * Feed every transcript (interim or final) through the controller.
   * Unaddressed speech is silently ignored; "Stop." aborts immediately.
   */
  public noteTranscript(event: TranscriptEvent): void {
    const text = event.text.trim();
    if (!text) return;

    const detected = detectLanguage(text);
    const merged = mergeLanguageState(this.language, detected);
    if (
      merged.primaryLanguage !== this.language.primaryLanguage ||
      merged.codeSwitching !== this.language.codeSwitching
    ) {
      this.language = merged;
      this.options.onLanguageChange?.(merged);
      // Language change never restarts the conversation session (§26).
    }

    // --- mayin is speaking: barge-in / third-party pause rules (§16, §19) ---
    if (this.state === "mayin_speaking") {
      if (BARGE_STOP_PATTERN.test(text)) {
        void this.interrupt();
        return;
      }
      if (MAYIN_WAKE_PATTERN.test(text)) {
        // Doctor starts a NEW directed request over Mayin → abandon current turn.
        void this.interrupt();
        // fall through: this utterance becomes the next turn
      } else {
        // Not addressed to Mayin → treat as staff conversation → PAUSE (§19).
        this.pause("third_party_conversation");
        return;
      }
    }

    // --- paused: only an explicit continue/resume wakes Mayin (§20) ---------
    if (this.state === "paused") {
      if (RESUME_PATTERN.test(text)) {
        void this.resume(text);
        return;
      }
      if (MAYIN_WAKE_PATTERN.test(text)) this.lastAddressAt = this.now();
      return; // room conversation continues; Mayin stays quiet
    }

    // --- directedness gating (§17/§18) -------------------------------------
    if (MAYIN_WAKE_PATTERN.test(text)) {
      this.lastAddressAt = this.now();
    } else if (!this.isAddressed()) {
      return; // remain silent rather than joining a staff discussion
    } else if (this.state === "idle" || this.state === "listening") {
      this.lastAddressAt = this.now();
    }

    // --- immediate abort commands ------------------------------------------
    if (BARGE_STOP_PATTERN.test(text)) {
      void this.interrupt();
      this.setState(this.pushToTalk ? "idle" : "listening");
      return;
    }

    // --- turn end detection -------------------------------------------------
    if (event.isFinal) {
      this.clearTurnTimer();
      this.pendingText = null;
      void this.submitTurn(text);
      return;
    }

    this.pendingText = text;
    this.setState("user_speaking");
    this.deadlineAt = this.now() + END_OF_TURN_MS[this.eagerness];
    this.scheduleDeadlineCheck();
  }

  /** True while the exchange is open enough for follow-up words like "this". */
  private isAddressed(): boolean {
    if (this.pushToTalk || !this.requireAddress) return true;
    return this.now() - this.lastAddressAt <= ADDRESS_WINDOW_MS;
  }

  private scheduleDeadlineCheck(): void {
    this.clearTurnTimer();
    const delay = Math.max(0, this.deadlineAt - this.now());
    this.turnTimer = this.scheduler.set(() => {
      this.turnTimer = null;
      if (this.state === "user_speaking" && this.pendingText) {
        // Silence lasted past the eagerness window → likely end of turn (§14).
        if (this.now() >= this.deadlineAt) {
          const text = this.pendingText;
          this.pendingText = null;
          void this.submitTurn(text);
        } else {
          this.scheduleDeadlineCheck();
        }
      }
    }, delay);
  }

  private clearTurnTimer(): void {
    if (this.turnTimer !== null) {
      this.scheduler.clear(this.turnTimer);
      this.turnTimer = null;
    }
  }

  // ------------------------------------------------------------- turn cycle

  private async submitTurn(text: string): Promise<void> {
    if (this.state === "thinking") return; // one turn at a time
    this.setState("thinking");
    await this.runTurn({ text, resume: false, pausedTurn: null });
  }

  private async runTurn(opts: {
    text: string;
    resume: boolean;
    pausedTurn: PausedTurn | null;
  }): Promise<void> {
    this.speakingAborted = false;
    let outcome: TurnOutcome;
    try {
      outcome = await this.onTurn({
        text: opts.text,
        context: this.context,
        language: this.language,
        resume: opts.resume,
        pausedTurn: opts.pausedTurn,
      });
    } catch {
      this.setState(this.pushToTalk ? "idle" : "listening");
      return;
    }

    if (this.speakingAborted && this.state === "interrupted") {
      // The doctor abandoned this response — never resume it automatically (§16).
      return;
    }

    this.speaking = outcome;
    this.setState("mayin_speaking");
    try {
      await this.provider.speak(outcome.speech, { language: this.languageTag() });
    } catch {
      // Voice failure keeps the text answer visible; state still settles.
    }
    this.speaking = null;
    if (this.state === "mayin_speaking") {
      this.pausedTurn = null;
      this.setState(this.pushToTalk ? "idle" : "listening");
    }
  }

  // ----------------------------------------------------- pause / resume / stop

  /**
   * Pause because the doctor is talking to someone else (§19).
   * Stores SESSION-level turn memory only — no Cognee query is needed (§49).
   */
  public pause(reason: string): void {
    if (
      this.state !== "mayin_speaking" &&
      this.state !== "thinking" &&
      this.state !== "user_speaking"
    ) {
      return;
    }
    const current = this.speaking;
    this.pausedTurn = {
      topic: current?.topic,
      patientId: this.context.patientId,
      encounterId: this.context.encounterId,
      responseId: current?.responseId,
      lastCompletedSection: current?.completedSection ?? null,
      // Without audio sentence alignment the whole current section is preserved.
      remainingSections: current?.remainingSections ?? (current ? ["full_response"] : []),
      pausedAt: this.now(),
      reason,
    };
    this.clearTurnTimer();
    this.pendingText = null;
    void this.provider.interrupt();
    this.setState("paused");
  }

  /**
   * "Dr. Mayin, continue." → resume from the preserved logical point (§20).
   * Returns false when there is nothing to resume (never fakes memory).
   */
  public async resume(resumeText = "continue"): Promise<boolean> {
    if (!this.pausedTurn || this.state !== "paused") return false;
    const paused = this.pausedTurn;
    this.setState("thinking");
    await this.runTurn({ text: resumeText, resume: true, pausedTurn: paused });
    return true;
  }

  /**
   * Hard interruption ("Stop.") — the abandoned response is discarded and
   * will NOT auto-resume later (§16).
   */
  public async interrupt(): Promise<void> {
    this.speakingAborted = true;
    this.clearTurnTimer();
    this.pendingText = null;
    if (this.state === "mayin_speaking" || this.state === "thinking") {
      this.pausedTurn = null;
      await this.provider.interrupt();
      this.setState("interrupted");
    }
  }

  // ------------------------------------------------------------------ misc

  private setState(next: ConversationState): void {
    if (next === this.state) return;
    this.state = next;
    this.options.onStateChange?.(next);
    for (const listener of this.stateListeners) {
      try { listener(next); } catch (err) { console.warn("conversation listener error:", err); }
    }
  }

  private languageTag(): string {
    switch (this.language.primaryLanguage) {
      case "te":
      case "te-en": return "te-IN";
      case "hi":
      case "hi-en": return "hi-IN";
      default: return "en-IN";
    }
  }

  /** Test/diagnostic hook — force a deadline evaluation at a given time. */
  public evaluateDeadline(nowOverride?: number): void {
    if (this.state !== "user_speaking" || !this.pendingText) return;
    const effectiveNow = nowOverride ?? this.now();
    if (effectiveNow >= this.deadlineAt) {
      const text = this.pendingText;
      this.pendingText = null;
      this.clearTurnTimer();
      void this.submitTurn(text);
    }
  }
}
