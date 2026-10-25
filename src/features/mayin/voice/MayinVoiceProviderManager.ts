/**
 * ASTRA 7D — DR. MAYIN VOICE PROVIDER MANAGER (tiered failover)
 * ============================================================================
 * Spec priority tiers for Dr. Mayin's mouth:
 *
 *   1. Sarvam (Bulbul)     ← human Indian voice, skipped when NOT configured
 *   2. Gemini Live (cloud) ← human cloud voice, skipped when NOT configured
 *   3. Voicebox (local)    ← English, Hindi, Telugu offline mouth
 *
 * OFFLINE BEHAVIOUR
 * -----------------
 *   • If Gemini Live is offline / not configured  → skipped, Sarvam is tried.
 *   • If Sarvam is also offline / not configured  → skipped, Voicebox speaks.
 *   • Voicebox (local) is NEVER skipped — it is the guaranteed fallback.
 *   • PHI turns skip ALL cloud tiers; only Voicebox handles them.
 *
 * FAILOVER CONTRACT
 * -----------------
 *   • A tier's speak() RESOLVES = it handled the turn; THROWS = fail over.
 *   • When EVERY tier fails the manager throws — the conversation controller
 *     keeps the text answer on screen (voice failure never hides content).
 *   • `lastSpeakReport.spokenBy` records which tier actually spoke. Never faked.
 *   • PHI turns (patientContext or the Cloud Privacy Gate) skip cloud tiers
 *     entirely — identifiable clinical audio never leaves the machine.
 *   • start()/stop() follow the degradation contract: one tier failing to start
 *     degrades ONLY that tier and never throws into Astra core (§66).
 */

import { looksLikePhi } from "@/astra/voice/providers/phiGate";
import { currentVoiceSettings } from "@/astra/voice/providers/voiceSettings";
import type {
  MayinVoiceProvider,
  SpeakOptions,
  SpeechStateEvent,
  TranscriptEvent,
  VoiceProviderId,
  VoiceStatus,
} from "./voiceProvider";
import { planVoiceMouth } from "@/astra/voice/providers/layaVoiceRoute";
import { OpenAILiveProvider, SarvamProvider } from "./CloudVoiceProviders";
import { VoiceboxProvider } from "./VoiceboxProvider";

export interface MayinProviderTier {
  id: VoiceProviderId;
  provider: MayinVoiceProvider;
  /** Cloud tiers are skipped when a turn is local-only (PHI gate). */
  cloud?: boolean;
  /**
   * Skip without attempting when the probe reports disconnected.
   * Pure single-backend tiers set this; the self-cascading Voicebox tier must
   * NOT — its cascade can still speak via Gemini Live while local is down.
   */
  skipWhenDisconnected?: boolean;
}

export interface TierOutcome {
  id: VoiceProviderId;
  /** Set when the tier was skipped rather than attempted. */
  skipped?: "phi-local-only" | "disconnected" | "saved-api";
  error?: string;
}

export interface SpeakReport {
  /** The tier that handled the turn, or null when every tier failed. */
  spokenBy: VoiceProviderId | null;
  outcomes: TierOutcome[];
}

export interface MayinVoiceProviderManagerOptions {
  tiers: MayinProviderTier[];
  /**
   * Defaults to: patientContext attached OR text looks like PHI, while the
   * Cloud Privacy Gate is armed (Settings → Voice).
   */
  isLocalOnlyTurn?: (text: string, options?: SpeakOptions) => boolean;
  /**
   * When this returns allowCloud: false, cloud tiers are skipped and Voicebox
   * speaks. Production uses Laya language routing so short English, Hindi, and
   * Telugu lines do not spend a Sarvam or Gemini call. Tests omit it.
   */
  routeMouth?: (
    text: string,
    options?: SpeakOptions,
  ) => Promise<{ allowCloud: boolean; preferLocal?: boolean }>;
}

export class MayinVoiceProviderManager implements MayinVoiceProvider {
  private readonly tiers: MayinProviderTier[];
  private readonly isLocalOnly: (text: string, options?: SpeakOptions) => boolean;
  private readonly routeMouth: (
    text: string,
    options?: SpeakOptions,
  ) => Promise<{ allowCloud: boolean; preferLocal?: boolean }>;
  private readonly transcriptHandlers = new Set<(event: TranscriptEvent) => void>();
  private readonly speechHandlers = new Set<(event: SpeechStateEvent) => void>();
  private readonly tierUnsubs: Array<() => void> = [];

  /** Truthful record of the most recent speak() attempt. */
  public lastSpeakReport: SpeakReport | null = null;

  constructor(options: MayinVoiceProviderManagerOptions) {
    this.tiers = options.tiers;
    this.isLocalOnly =
      options.isLocalOnlyTurn ??
      ((text, speakOptions) => {
        const settings = currentVoiceSettings();
        if (!settings.blockPhiToCloudVoice) return false;
        return Boolean(speakOptions?.patientContext) || looksLikePhi(text);
      });
    this.routeMouth = options.routeMouth ?? (async () => ({ allowCloud: true, preferLocal: false }));

    // Forward every tier's events — each event already carries its truthful provider id.
    for (const tier of this.tiers) {
      const offT = tier.provider.onTranscript((event) => {
        for (const handler of this.transcriptHandlers) {
          try { handler(event); } catch (err) { console.warn("transcript handler error:", err); }
        }
      });
      const offS = tier.provider.onSpeechState((event) => {
        for (const handler of this.speechHandlers) {
          try { handler(event); } catch (err) { console.warn("speech handler error:", err); }
        }
      });
      this.tierUnsubs.push(offT, offS);
    }
  }

  /** Degradation contract: a tier that fails to start degrades ONLY itself (§66). */
  public async start(): Promise<void> {
    for (const tier of this.tiers) {
      try {
        await tier.provider.start();
      } catch {
        // Reported honestly through that tier's own getStatus().
      }
    }
  }

  public async stop(): Promise<void> {
    for (const tier of this.tiers) {
      try {
        await tier.provider.stop();
      } catch {
        // stopping is best effort
      }
    }
  }

  /**
   * Walk the tiers in spec order. A resolving tier handled the turn; a
   * throwing tier fails over with its error preserved. When every tier
   * fails this THROWS — the controller keeps the text answer visible.
   */
  public async speak(text: string, options?: SpeakOptions): Promise<void> {
    const outcomes: TierOutcome[] = [];
    const localOnly = this.isLocalOnly(text, options);
    const route = localOnly
      ? { allowCloud: false, preferLocal: true }
      : await this.routeMouth(text, options);
    const ordered = !localOnly && route.preferLocal
      ? [...this.tiers].sort((a, b) => Number(Boolean(a.cloud)) - Number(Boolean(b.cloud)))
      : this.tiers;

    for (const tier of ordered) {
      if (localOnly && tier.cloud) {
        outcomes.push({ id: tier.id, skipped: "phi-local-only" });
        continue;
      }
      if (!route.allowCloud && tier.cloud) {
        outcomes.push({ id: tier.id, skipped: "saved-api" });
        continue;
      }
      if (tier.skipWhenDisconnected && !tier.provider.getStatus().voiceProviderConnected) {
        outcomes.push({ id: tier.id, skipped: "disconnected" });
        continue;
      }
      try {
        await tier.provider.speak(text, options);
        this.lastSpeakReport = { spokenBy: tier.id, outcomes };
        return;
      } catch (e) {
        outcomes.push({ id: tier.id, error: e instanceof Error ? e.message : String(e) });
      }
    }

    this.lastSpeakReport = { spokenBy: null, outcomes };
    for (const handler of this.speechHandlers) {
      try {
        handler({ state: "failed", provider: "none", ts: Date.now() });
      } catch (err) { console.warn("speech handler error:", err); }
    }
    const detail = outcomes
      .map((o) => (o.skipped ? `${o.id}: skipped (${o.skipped})` : `${o.id}: ${o.error}`))
      .join("; ");
    throw new Error(`No voice provider could speak — ${detail}`);
  }

  /** Barge-in fans out to every tier so nothing keeps talking. */
  public async interrupt(): Promise<void> {
    for (const tier of this.tiers) {
      try {
        await tier.provider.interrupt();
      } catch {
        // already stopped
      }
    }
  }

  /**
   * Truthful status: the tier that last spoke, else the first connected tier,
   * else tier one — never an invented "ACTIVE".
   */
  public getStatus(): VoiceStatus {
    if (this.lastSpeakReport?.spokenBy) {
      const spoken = this.tiers.find((t) => t.id === this.lastSpeakReport!.spokenBy);
      if (spoken) return spoken.provider.getStatus();
    }
    const connected = this.tiers.find((t) => t.provider.getStatus().voiceProviderConnected);
    return (connected ?? this.tiers[0]).provider.getStatus();
  }

  public onTranscript(handler: (event: TranscriptEvent) => void): () => void {
    this.transcriptHandlers.add(handler);
    return () => { this.transcriptHandlers.delete(handler); };
  }

  public onSpeechState(handler: (event: SpeechStateEvent) => void): () => void {
    this.speechHandlers.add(handler);
    return () => { this.speechHandlers.delete(handler); };
  }

  /** Release forwarded subscriptions when the runtime is torn down. */
  public dispose(): void {
    for (const off of this.tierUnsubs) {
      try { off(); } catch { /* already released */ }
    }
    this.tierUnsubs.length = 0;
  }
}

/**
 * Production composition:
 *   Tier 1 — Sarvam        (human Indian voice, key server-side)
 *   Tier 2 — Gemini Live   (human cloud voice, key server-side)
 *   Tier 3 — Voicebox      (local English / Hindi / Telugu)
 *
 * Short lines in those three languages skip the cloud tiers (`saved-api`)
 * via Laya language routing. PHI turns skip the cloud entirely.
 * Voicebox never has skipWhenDisconnected — it must always attempt.
 */
export function createDefaultMayinVoiceProvider(): MayinVoiceProviderManager {
  return new MayinVoiceProviderManager({
    tiers: [
      {
        id: "sarvam",
        provider: new SarvamProvider(),
        cloud: true,
        skipWhenDisconnected: true,
      },
      {
        id: "openai-live",
        provider: new OpenAILiveProvider(),
        cloud: true,
        skipWhenDisconnected: true,
      },
      { id: "voicebox", provider: new VoiceboxProvider() },
    ],
    routeMouth: async (text, speakOptions) => {
      const plan = await planVoiceMouth(text, speakOptions?.language, {
        patientContext: speakOptions?.patientContext,
      });
      return {
        allowCloud: plan.mouths.some((mouth) => mouth !== "voicebox-local"),
        preferLocal: plan.reason === "voicebox-save-api",
      };
    },
  });
}
