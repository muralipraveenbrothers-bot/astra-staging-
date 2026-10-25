import { describe, it, expect, vi } from "vitest";
import {
  MayinConversationController,
  type ControllerScheduler,
  type TurnOutcome,
  type TurnRequest,
} from "./ConversationController";
import type {
  MayinVoiceProvider,
  SpeakOptions,
  TranscriptEvent,
} from "./voiceProvider";
import type { ConversationState } from "../core/MayinTypes";

class FakeProvider implements MayinVoiceProvider {
  spoken: string[] = [];
  interruptCount = 0;
  /** When set, speak() blocks until this resolver fires (drives barge-in tests). */
  private gate: { promise: Promise<void>; resolve: () => void } | null = null;

  holdSpeech(): void {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => { resolve = r; });
    this.gate = { promise, resolve };
  }
  releaseSpeech(): void {
    this.gate?.resolve();
    this.gate = null;
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async speak(text: string, _options?: SpeakOptions): Promise<void> {
    this.spoken.push(text);
    if (this.gate) await this.gate.promise;
  }
  async interrupt(): Promise<void> {
    this.interruptCount += 1;
    this.releaseSpeech();
  }
  getStatus() {
    return {
      provider: "voicebox" as const,
      microphonePermission: "granted" as const,
      microphoneActive: true,
      voiceProviderConnected: true,
      lastAudioInput: null,
      lastTranscript: null,
      lastVoiceOutput: null,
      roundTripLatency: null,
      reconnectAttempts: 0,
      language: "en-IN",
      conversationState: "idle",
    };
  }
  onTranscript(): () => void { return () => {}; }
  onSpeechState(): () => void { return () => {}; }
}

class ManualScheduler implements ControllerScheduler {
  nowMs = 0;
  private nextId = 1;
  private tasks = new Map<number, { at: number; fn: () => void }>();

  set(fn: () => void, ms: number): number {
    const id = this.nextId++;
    this.tasks.set(id, { at: this.nowMs + ms, fn });
    return id;
  }
  clear(id: number): void {
    this.tasks.delete(id);
  }
  advance(ms: number): void {
    this.nowMs += ms;
    const due = [...this.tasks.entries()]
      .filter(([, t]) => t.at <= this.nowMs)
      .sort((a, b) => a[1].at - b[1].at);
    for (const [id, t] of due) {
      this.tasks.delete(id);
      t.fn();
    }
  }
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

function textEvent(text: string, isFinal: boolean): TranscriptEvent {
  return { text, isFinal, provider: "voicebox", ts: Date.now() };
}

function setup(opts?: {
  eagerness?: "LOW" | "NORMAL" | "FAST";
  onTurn?: (req: TurnRequest) => Promise<TurnOutcome>;
}) {
  const provider = new FakeProvider();
  const sched = new ManualScheduler();
  const states: ConversationState[] = [];
  const calls: TurnRequest[] = [];
  const onTurn =
    opts?.onTurn ??
    (async (req: TurnRequest) => {
      calls.push(req);
      return {
        speech: `reply-${calls.length}`,
        responseId: `R-${calls.length}`,
        topic: "general",
        completedSection: "answer",
        remainingSections: [],
      };
    });
  const ctl = new MayinConversationController({
    provider,
    onTurn, // default impl and custom impls each own their own call bookkeeping
    eagerness: opts?.eagerness ?? "NORMAL",
    scheduler: sched,
    now: () => sched.nowMs,
    onStateChange: (s) => states.push(s),
    context: { userId: "dr-1", role: "DOCTOR", patientId: "P-1", encounterId: "E-1" },
  });
  return { provider, sched, states, calls, ctl };
}

describe("MayinConversationController — natural turn-taking", () => {
  it("waits through a mid-sentence pause and submits only after the end-of-turn window (§14)", async () => {
    const { sched, calls, ctl } = setup();

    ctl.noteTranscript(textEvent("Mayin, show this patient's", false));
    expect(ctl.getState()).toBe("user_speaking");

    sched.advance(300); // breath inside the sentence — NORMAL window is 700 ms
    expect(calls).toHaveLength(0);

    ctl.noteTranscript(textEvent("Mayin, show this patient's latest creatinine", false));
    sched.advance(400); // deadline was reset — still quiet
    expect(calls).toHaveLength(0);

    sched.advance(400); // silence now exceeds 700 ms → end of turn
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0].text).toContain("creatinine");
    expect(ctl.getState()).toBe("listening");
  });

  it("honours FAST eagerness for short commands (§15)", async () => {
    const { sched, calls, ctl } = setup({ eagerness: "FAST" });
    ctl.noteTranscript(textEvent("Mayin, stop", false));
    sched.advance(250);
    expect(calls).toHaveLength(0);
    sched.advance(100); // > 300 ms
    await flush();
    expect(calls).toHaveLength(1);
  });

  it("stays silent when nobody addresses Mayin (§17/§18)", async () => {
    const { calls, ctl, states } = setup();
    ctl.noteTranscript(textEvent("please check the lab values", true));
    await flush();
    expect(calls).toHaveLength(0);
    expect(ctl.getState()).toBe("idle");
    expect(states.filter((s) => s === "thinking")).toHaveLength(0);
  });

  it("barge-in with 'Stop.' interrupts immediately and NEVER auto-resumes the abandoned turn (§16)", async () => {
    let turn = 0;
    const { provider, ctl, calls, states } = setup({
      onTurn: async (req) => {
        calls.push(req);
        turn += 1;
        provider.holdSpeech(); // Mayin starts speaking and keeps speaking
        return turn === 1
          ? { speech: "The haemoglobin is eleven and the white count is…", responseId: "R-1" }
          : { speech: "Creatinine is 2.4 milligrams per decilitre, sir.", responseId: "R-2" };
      },
    });

    ctl.noteTranscript(textEvent("Mayin, read out the full CBC panel", true));
    await flush();
    expect(ctl.getState()).toBe("mayin_speaking");

    ctl.noteTranscript(textEvent("Stop", true));
    await flush();
    expect(provider.interruptCount).toBeGreaterThanOrEqual(1);
    expect(ctl.getState()).toBe("interrupted");
    expect(ctl.getPausedTurn()).toBeNull();

    // Doctor asks something else — only the NEW turn runs (R-1 never resumes).
    ctl.noteTranscript(textEvent("Mayin, just give me creatinine", true));
    await flush();
    expect(calls).toHaveLength(2);
    expect(states).toContain("interrupted");
    // The abandoned speech never continues after interruption.
    expect(provider.spoken.filter((s) => s.includes("white count"))).toHaveLength(1);
  });

  it("pauses for third-party speech and resumes from the preserved session turn (§19/§20/§49)", async () => {
    let call = 0;
    const { provider, ctl, calls } = setup({
      onTurn: async (req) => {
        calls.push(req);
        call += 1;
        provider.holdSpeech();
        if (call === 1) {
          return {
            speech: "Regarding the CT…",
            responseId: "R-CT",
            topic: "CT chest interpretation",
            completedSection: "findings",
            remainingSections: ["clinical significance", "comparison"],
          };
        }
        return { speech: "Continuing from the CT findings…", responseId: "R-CT-2" };
      },
    });

    ctl.noteTranscript(textEvent("Mayin, open this CT chest report", true));
    await flush();
    expect(ctl.getState()).toBe("mayin_speaking");

    // Doctor turns to a nurse — NOT addressed to Mayin → PAUSED, context kept.
    ctl.noteTranscript(textEvent("please bring that file", true));
    await flush();
    expect(ctl.getState()).toBe("paused");
    const paused = ctl.getPausedTurn();
    expect(paused).not.toBeNull();
    expect(paused!.responseId).toBe("R-CT");
    expect(paused!.patientId).toBe("P-1");
    expect(paused!.remainingSections).toEqual(["clinical significance", "comparison"]);

    // More staff conversation must NOT restart or derail Mayin.
    ctl.noteTranscript(textEvent("and send it to the ward", true));
    await flush();
    expect(ctl.getState()).toBe("paused");
    expect(calls).toHaveLength(1);

    // Resume command → continues from preserved context, does not restart.
    ctl.noteTranscript(textEvent("Dr. Mayin, continue", true));
    await flush();
    expect(calls).toHaveLength(2);
    expect(calls[1].resume).toBe(true);
    expect(calls[1].pausedTurn?.responseId).toBe("R-CT");
    expect(calls[1].context.patientId).toBe("P-1");
    expect(provider.spoken[provider.spoken.length - 1]).toBe("Continuing from the CT findings…");
  });

  it("switches language mid-session without restarting the conversation (§26/§57)", async () => {
    const { ctl, calls } = setup();

    ctl.noteTranscript(textEvent("Mayin, latest creatinine enti?", true));
    await flush();
    expect(calls).toHaveLength(1);
    expect(ctl.getLanguage().primaryLanguage).toMatch(/^(te|te-en)$/);

    ctl.noteTranscript(textEvent("अब कल का value बताओ", true));
    await flush();
    expect(calls).toHaveLength(2);
    expect(["hi", "hi-en"]).toContain(ctl.getLanguage().primaryLanguage);

    // Same controller, same patient context — no session restart.
    expect(calls[1].context.patientId).toBe("P-1");
    expect(ctl.getState()).toBe("listening");
  });

  it("keeps conversation mode open for 8 seconds, then ignores unaddressed speech", async () => {
    const { sched, calls, ctl } = setup();
    ctl.noteTranscript(textEvent("Mayin, open the lab", true));
    await flush();
    expect(calls).toHaveLength(1);

    sched.advance(7_999);
    ctl.noteTranscript(textEvent("show the pending results", true));
    await flush();
    expect(calls).toHaveLength(2);

    sched.advance(8_001);
    ctl.noteTranscript(textEvent("and the critical ones", true));
    await flush();
    expect(calls).toHaveLength(2);
    expect(ctl.getState()).toBe("listening");
  });
});


