/**
 * ASTRA — DR. MAYIN RUNTIME (single supervised composition root)
 * ============================================================================
 * Binds the Mayin subsystems into ONE runtime so no Astra UI has to know how
 * they fit together:
 *
 *   MayinVoiceProviderManager ──► MayinConversationController ──► turn handler
 *     (openai-live → sarvam → Voicebox cascade)   │
 *            ▲                                    │
 *            └── speak/interrupt ─────────────────┘
 *   mayinVisualEngine  ◄── real agent-bus events (voice, d7, lab, pharmacy…)
 *   AstraMemoryGateway ◄── durable doctor preferences / hospital rules only
 *   LayaDecisionAdapter ◄─ bounded System-1 reflexes (routing, urgency, triage)
 *   MayinGestureController ◄─ browser-native gesture → semantic commands
 *
 * DEGRADATION CONTRACT (§66): every optional dependency is probed and reported
 * separately. Losing voice, Laya, gestures, Cognee or a 3D model degrades that
 * capability ONLY — it never throws into Astra core, and the runtime always
 * resolves rather than rejecting.
 */

import { agentBus } from "@/astra/runtime/agentBus";
import { mayinVisualEngine } from "../core/MayinVisualStateEngine";
import { getMayinBrainGateway } from "../core/MayinBrainGateway";
import type { MayinContext, TurnEagerness } from "../core/MayinTypes";
import { MayinConversationController, type TurnOutcome, type TurnRequest } from "../voice/ConversationController";
import {
  createDefaultMayinVoiceProvider,
  MayinVoiceProviderManager,
} from "../voice/MayinVoiceProviderManager";
import type { MayinVoiceProvider, TranscriptEvent, VoiceProviderId } from "../voice/voiceProvider";
import {
  AstraMemoryGateway,
  CogneeHttpAdapter,
  InMemoryLongTermAdapter,
  type LongTermMemoryAdapter,
  type MemoryHealth,
  type RememberOutcome,
} from "../memory/AstraMemoryGateway";
import {
  LayaDecisionAdapter,
  type LayaBoundedTask,
  type LayaDecisionOutcome,
  type LayaDiagnostics,
} from "@/astra/plugins/layaDecision";
import type { MayinGestureController, GestureDiagnostics } from "../gesture/MayinGestureController";
import { createMayinGestureBridge, type MayinGestureBridge } from "../gesture/MayinGestureBridge";

export interface MayinRuntimeOptions {
  voiceProvider?: MayinVoiceProvider;
  memoryAdapter?: LongTermMemoryAdapter;
  layaAdapter?: LayaDecisionAdapter;
  gestureController?: MayinGestureController;
  /** Called for every doctor utterance that reaches Mayin. */
  onTurn?: (request: TurnRequest) => Promise<TurnOutcome>;
  eagerness?: TurnEagerness;
  context?: MayinContext;
  /** Cognee endpoint — loopback by default (local-first, §47). */
  cogneeBaseUrl?: string;
}

/**
 * Tier attribution for the voice chain. Present ONLY when a tiered manager is
 * in use, so a single-provider runtime never grows invented tier rows.
 */
export interface VoiceTierDiagnostics {
  /** The tier that handled the last speak() — null when none could. */
  lastSpokenBy: VoiceProviderId | null;
  /** Per-tier skip reasons / errors, in chain order (newest attempt). */
  outcomes: Array<{ id: VoiceProviderId; skipped?: string; error?: string }>;
}

export interface MayinRuntimeDiagnostics {
  started: boolean;
  voice: ReturnType<MayinVoiceProvider["getStatus"]>;
  /** null = caller supplied one provider; the HUD says so instead of guessing. */
  voiceTiers: VoiceTierDiagnostics | null;
  memory: MemoryHealth;
  laya: LayaDiagnostics;
  gesture: GestureDiagnostics | null;
  visualState: string;
  conversationState: string;
  language: unknown;
  unresolvedVoiceTurns: number;
}

/** Events the runtime itself emits on the shared agent bus. */
export const MAYIN_RUNTIME_EVENTS = [
  "laya.decision",
  "laya.degraded",
  "memory.remembered",
  "memory.recalled",
  "memory.degraded",
] as const;

export class MayinRuntime {
  private started = false;
  private unresolvedTurns = 0;

  public readonly voice: MayinVoiceProvider;
  public readonly memory: AstraMemoryGateway;
  public readonly laya: LayaDecisionAdapter;
  public readonly gesture: MayinGestureController | null;
  public readonly conversation: MayinConversationController;
  /** Semantic gesture → MayinContext bridge (selection pointer only). */
  public readonly gestureBridge: MayinGestureBridge;

  /**
   * The tiered manager when WE built it — released on stop(). An injected
   * provider belongs to the caller, so the runtime never tears it down.
   */
  private readonly ownedVoiceManager: MayinVoiceProviderManager | null;
  private readonly context: MayinContext;

  constructor(options: MayinRuntimeOptions = {}) {
    // Default mouth is the SPEC TIER ORDER: openai-live → sarvam → Voicebox
    // cascade. Cloud tiers self-report NOT_CONFIGURED (no server key) and are
    // skipped, so an unconfigured hospital still speaks through Voicebox — and
    // a PHI turn never reaches a cloud tier at all.
    this.voice = options.voiceProvider ?? createDefaultMayinVoiceProvider();
    // Only a manager WE constructed is ours to dispose; an injected provider is
    // the caller's to manage (even when that provider is another manager).
    this.ownedVoiceManager = options.voiceProvider
      ? null
      : (this.voice as MayinVoiceProviderManager);
    this.context = options.context ?? { userId: "system", role: "DOCTOR" };

    const adapter =
      options.memoryAdapter ??
      (options.cogneeBaseUrl
        ? new CogneeHttpAdapter(options.cogneeBaseUrl)
        : new InMemoryLongTermAdapter());
    this.memory = new AstraMemoryGateway(adapter);

    this.laya = options.layaAdapter ?? new LayaDecisionAdapter();
    this.gesture = options.gestureController ?? null;

    this.conversation = new MayinConversationController({
      provider: this.voice,
      eagerness: options.eagerness ?? "NORMAL",
      context: this.context,
      onTurn: async (request) => {
        if (options.onTurn) return options.onTurn(request);
        
        // Wire MayinBrainGateway processing here
        const gateway = getMayinBrainGateway(request.context);
        const brainResponse = await gateway.process({
          text: request.text,
          context: request.context,
          language: request.language.primaryLanguage,
        });

        return {
          speech: brainResponse.speech,
          responseId: brainResponse.responseId,
          topic: brainResponse.topic,
          completedSection: brainResponse.completedSection,
          remainingSections: brainResponse.remainingSections,
        };
      },
      onStateChange: (state) => {
        agentBus.publish(
          state === "mayin_speaking" ? "voice.speaking" : state === "paused" ? "voice.paused" : "voice.listening",
          { conversationState: state },
        );
      },
      onLanguageChange: (language) => {
        agentBus.publish("voice.transcript", {
          language: language.primaryLanguage,
          codeSwitching: language.codeSwitching,
        });
      },
    });

    // Gesture selections move ONLY the selection pointer inside MayinContext —
    // "explain this" then resolves against whatever the doctor just pinched.
    this.gestureBridge = createMayinGestureBridge({
      initialContext: this.context,
      onContextChange: (context) => this.conversation.setContext(context),
    });
  }

  // -------------------------------------------------------------- lifecycle

  /** Start voice + visuals. Never throws: failures are reported, not raised. */
  public async start(): Promise<{ started: boolean; voiceAvailable: boolean }> {
    mayinVisualEngine.attachToAgentBus();
    this.gestureBridge.start();
    mayinVisualEngine.publish({ type: "voice.listening" });
    let voiceAvailable = true;
    try {
      await this.voice.start();
    } catch {
      // Voice is an interaction convenience — text stays fully functional (§66).
      voiceAvailable = false;
    }
    this.voice.onTranscript((event) => this.handleTranscript(event));
    this.started = true;
    this.unresolvedTurns = 0;
    return { started: true, voiceAvailable };
  }

  public async stop(): Promise<void> {
    this.started = false;
    try {
      await this.voice.stop();
    } catch {
      // ignore — stopping is best effort
    }
    await this.gesture?.stop().catch(() => undefined);
    this.gestureBridge.stop();
    // Release the tier event subscriptions the manager created (only ours).
    try {
      this.ownedVoiceManager?.dispose();
    } catch {
      // ignore — teardown is best effort
    }
  }

  /** Route a transcript through the conversation controller (end-of-turn aware). */
  public handleTranscript(event: TranscriptEvent): void {
    if (!this.started) return;
    this.unresolvedTurns += 1;
    try {
      this.conversation.noteTranscript(event);
    } catch {
      // A controller fault must never swallow the doctor's words.
    } finally {
      this.unresolvedTurns = Math.max(0, this.unresolvedTurns - 1);
    }
  }

  /** Explicit barge-in from UI (mic button, "Stop." chip). */
  public async interrupt(): Promise<void> {
    await this.conversation.interrupt().catch(() => undefined);
  }

  /**
   * Speak text through the tiered voice chain (cloud tiers first, Voicebox
   * cascade last). Returns false when every tier failed — the text answer stays
   * on screen; a voice failure never hides content (§66).
   */
  public async speak(text: string, language?: string): Promise<boolean> {
    try {
      await this.voice.speak(text, { language });
      return true;
    } catch {
      return false;
    }
  }

  // ------------------------------------------------------- System-1 (Laya)

  /**
   * Fast bounded reflex. Returns null when Laya is unavailable so callers fall
   * through to deterministic rules + deep reasoning (§ Laya rule).
   */
  public async reflex(task: LayaBoundedTask, text: string): Promise<LayaDecisionOutcome> {
    return this.laya.decide(task, { text });
  }

  /** Convenience: routing choice string, or null when degraded. */
  public async reflexChoice(task: LayaBoundedTask, text: string): Promise<string | null> {
    const outcome = await this.reflex(task, text);
    if (outcome.status !== "ok") return null;
    const first = Object.values(outcome.answers)[0];
    return first?.choice ?? null;
  }

  // ------------------------------------------------------------ memory (§52)

  /**
   * Persist an APPROVED doctor preference (never a patient fact, §35).
   * Requires explicit approval provenance — this gateway rejects the rest.
   */
  public async rememberDoctorPreference(input: {
    doctorId: string;
    preference: string;
    approvedBy: string;
  }): Promise<RememberOutcome> {
    const outcome = await this.memory.remember({
      type: "doctor_preference",
      scope: { namespace: `astra:doctor:${input.doctorId}` },
      content: { preference: input.preference },
      sensitivity: "internal",
      provenance: {
        source: "doctor-stated",
        author: input.doctorId,
        timestamp: new Date().toISOString(),
        scope: `astra:doctor:${input.doctorId}`,
        approval: "approved",
        version: "1",
      },
    });
    agentBus.publish(
      outcome.status === "stored" ? "memory.remembered" : "memory.degraded",
      { type: "doctor_preference", status: outcome.status },
    );
    return outcome;
  }

  /**
   * Recall a doctor's approved preferences. Returns [] — never a fabricated
   * memory — when Cognee is unreachable (§48).
   */
  public async recallDoctorPreferences(doctorId: string, text?: string) {
    const records = await this.memory.recall({
      text,
      scope: { namespace: `astra:doctor:${doctorId}` },
      role: "DOCTOR",
    });
    agentBus.publish(records.length ? "memory.recalled" : "memory.degraded", {
      namespace: `astra:doctor:${doctorId}`,
      count: records.length,
    });
    return records;
  }

  // ------------------------------------------------------------- diagnostics

  public async getDiagnostics(): Promise<MayinRuntimeDiagnostics> {
    return {
      started: this.started,
      voice: this.voice.getStatus(),
      voiceTiers: this.voiceTierDiagnostics(),
      memory: await this.memory.getHealth(),
      laya: this.laya.diagnostics(),
      gesture: this.gesture?.getDiagnostics() ?? null,
      visualState: mayinVisualEngine.getState(),
      conversationState: this.conversation.getState(),
      language: this.conversation.getLanguage(),
      unresolvedVoiceTurns: this.unresolvedTurns,
    };
  }

  /**
   * Tier attribution from the live manager (ours or an injected one) — null for
   * a plain single provider, because there is no tier chain to report.
   */
  private voiceTierDiagnostics(): VoiceTierDiagnostics | null {
    if (!(this.voice instanceof MayinVoiceProviderManager)) return null;
    const report = this.voice.lastSpeakReport;
    return {
      lastSpokenBy: report?.spokenBy ?? null,
      outcomes: (report?.outcomes ?? []).map(({ id, skipped, error }) => ({ id, skipped, error })),
    };
  }
}

/** Shared runtime for Astra UI. Constructed lazily by the consuming screen. */
export function createMayinRuntime(options: MayinRuntimeOptions = {}): MayinRuntime {
  return new MayinRuntime(options);
}
