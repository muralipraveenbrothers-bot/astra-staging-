import { beforeEach, describe, expect, it } from "vitest";
import { astraEventBus } from "@/astra/events/astraEventBus";
import {
  CLINICAL_ACK,
  UNCLEAR_PROMPT,
  listenResumeAfterSpeech,
  classifyVoiceSurface,
  confidenceFromWhisperPayload,
  consultSilenceDetector,
  dispatchVoiceGesture,
  evaluateClinicalSpeech,
  interpretHeard,
  matchStopUtterance,
  planSpokenLine,
  splitSentences,
  registerSilenceDetector,
  registerVoiceGestureHandler,
  voiceFlightEvent,
} from "./voiceSafety";
import { attachVoiceDashboard, VoiceSession, voiceSession } from "./voiceSession";
import { speakControlled } from "./speakControlled";
import { deliverAstraVoiceResponse } from "@/astra/voice/roundTrip/deliverResponse";
import { ASTRA_VOICE_EVENTS } from "@/astra/voice/roundTrip/contracts";
import { extractWakeCommand, isCallingAstra } from "@/astra/voice/roundTrip/wakeDetection";

const LISTED_STOP_WORDS = [
  "stop",
  "pause",
  "silence",
  "exit",
  "aapu",
  "Mitra aapu",
  "Kasepu agu",
  "Silence Mitra",
  "Mitra stop",
  "Mayin stop",
] as const;

describe("R5-08 stop words", () => {
  it.each(LISTED_STOP_WORDS)("transcript matcher triggers stop for %s", (line) => {
    const heard = interpretHeard({
      text: line,
      agentNames: ["Mayin"],
      unclearAlreadyAsked: false,
    });
    expect(heard.kind).toBe("stop");
    expect(matchStopUtterance(line, ["Mayin"])).not.toBeNull();
  });

  it("does not fire on ordinary sentences", () => {
    for (const line of ["the bus stopped", "stop the bleeding and call the theatre", "we stopped for the bus"]) {
      expect(matchStopUtterance(line, ["Mayin"]), line).toBeNull();
      expect(interpretHeard({ text: line, agentNames: ["Mayin"], unclearAlreadyAsked: false }).kind).toBe("accept");
    }
  });
});

describe("R5-08 brevity and unclear speech", () => {
  it("keeps a short line and caps a long line at two sentences", () => {
    expect(planSpokenLine("Bed 4 is free.")).toBe("Bed 4 is free.");
    const long = "One is here. Two is here. Three is here. Four is here. Five is here.";
    const spoken = planSpokenLine(long);
    expect(spoken).toBe("One is here. Two is here.");
  });

  it("starts a long clinical answer with the short acknowledgement", () => {
    const long = "Creatinine is 4.2. Stop the NSAID. Check the potassium. Repeat the test tomorrow. Call nephrology.";
    expect(planSpokenLine(long, { clinical: true })).toBe(CLINICAL_ACK);
  });

  it("asks once when confidence is low, then waits", () => {
    const names = ["Mayin"];
    expect(interpretHeard({ text: "uh creatinine", confidence: 0.2, agentNames: names, unclearAlreadyAsked: false })).toEqual({
      kind: "unclear-once",
      prompt: UNCLEAR_PROMPT,
    });
    expect(interpretHeard({ text: "uh creatinine", confidence: 0.2, agentNames: names, unclearAlreadyAsked: true }).kind).toBe("unclear-wait");
    expect(interpretHeard({ text: "stop", confidence: 0.1, agentNames: names, unclearAlreadyAsked: false }).kind).toBe("stop");
    expect(interpretHeard({ text: "open pharmacy", confidence: 0.9, agentNames: names, unclearAlreadyAsked: false }).kind).toBe("accept");
  });
});

describe("R5-08 clinical voice policy", () => {
  it("speaks clinical answers on the doctor dashboard with push-to-talk", () => {
    expect(evaluateClinicalSpeech({
      clinical: true,
      role: "doctor",
      dashboard: "doctor",
      surface: "staff",
    })).toMatchObject({ speak: true, pushToTalk: true, pauseIfDoctorSpeaks: true, reason: "doctor-dashboard" });
  });

  it("withholds clinical speech on a non-doctor dashboard unless a patient-message is approved", () => {
    expect(evaluateClinicalSpeech({
      clinical: true,
      role: "pharmacy",
      dashboard: "pharmacy",
      surface: "staff",
    })).toMatchObject({ speak: false, reason: "patient-message-required" });
    expect(evaluateClinicalSpeech({
      clinical: true,
      role: "doctor",
      dashboard: "pharmacy",
      surface: "staff",
      patientMessageAllowed: false,
    }).speak).toBe(false);
    expect(evaluateClinicalSpeech({
      clinical: true,
      role: "reception",
      dashboard: "reception",
      surface: "staff",
      patientMessageAllowed: true,
    })).toMatchObject({ speak: true, reason: "approved-patient-message" });
  });

  it("speaks clinical content on a patient surface only with an approved patient-message grant", () => {
    expect(classifyVoiceSurface("/advisor")).toBe("patient");
    expect(classifyVoiceSurface("/attender/family")).toBe("attender");
    expect(evaluateClinicalSpeech({
      clinical: true,
      role: "doctor",
      dashboard: "doctor",
      surface: "patient",
      patientMessageAllowed: false,
    }).reason).toBe("patient-message-required");
    expect(evaluateClinicalSpeech({
      clinical: true,
      role: "doctor",
      dashboard: "doctor",
      surface: "attender",
      patientMessageAllowed: true,
    }).reason).toBe("approved-patient-message");
  });

  it("still speaks operational lines", () => {
    expect(evaluateClinicalSpeech({
      clinical: false,
      role: "reception",
      dashboard: "reception",
      surface: "staff",
    })).toMatchObject({ speak: true, pushToTalk: false });
  });
});

describe("R5-08 voice session", () => {
  beforeEach(() => {
    voiceSession.resetForTest();
    astraEventBus.clearFlightRecorder();
  });

  it("walks idle, listening, thinking, speaking, and muted", async () => {
    const session = new VoiceSession({ log: () => undefined });
    await session.safeListen(async () => {
      expect(session.snapshot().state).toBe("LISTENING");
      expect(session.snapshot().tone).toBe("blue");
      expect(session.snapshot().motion).toBe("waveform");
    });
    session.markThinking();
    expect(session.snapshot()).toMatchObject({ state: "THINKING", tone: "amber", motion: "pulse" });
    await session.safeSpeak("Bed 4 is free.", async () => {
      expect(session.snapshot()).toMatchObject({ state: "SPEAKING", tone: "light", motion: "ring" });
    });
    expect(session.snapshot().state).toBe("IDLE");
    session.pause();
    expect(session.snapshot()).toMatchObject({ state: "MUTED", tone: "red" });
  });

  it("while TTS is speaking, the stop command sets IDLE or MUTED, cancels audio, and logs latency under 300ms", async () => {
    let cancelled = false;
    const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
    const session = new VoiceSession({
      log: (eventType, fields) => events.push(voiceFlightEvent(eventType, fields)),
      cancelPlayback: () => { cancelled = true; },
    });
    const pending = session.safeSpeak("a long spoken answer", (signal) => new Promise((resolve) => {
      signal.addEventListener("abort", () => resolve(), { once: true });
    }));
    await Promise.resolve();
    expect(session.snapshot().state).toBe("SPEAKING");

    const heard = interpretHeard({
      text: "stop",
      agentNames: session.agentNames(),
      unclearAlreadyAsked: false,
    });
    expect(heard.kind).toBe("stop");
    const started = performance.now();
    if (heard.kind === "stop") session.hardStop({ reason: "stop-word", replyOkay: false });
    const elapsed = performance.now() - started;

    expect(["IDLE", "MUTED"]).toContain(session.snapshot().state);
    expect(session.snapshot().state).not.toBe("SPEAKING");
    expect(cancelled).toBe(true);
    expect(elapsed).toBeLessThan(300);
    const logged = events.find((event) => event.eventType === "voice.stopped");
    expect(typeof logged?.payload.latencyMs).toBe("number");
    expect(logged?.payload.latencyMs).toBeLessThan(300);
    expect(logged?.payload.audioStored).toBe(false);
    await pending;
  });

  it("never opens the mic while TTS is playing", async () => {
    const session = new VoiceSession({ log: () => undefined });
    let releaseSpeech: () => void = () => undefined;
    const speaking = session.safeSpeak("hello", () => new Promise((resolve) => {
      releaseSpeech = resolve;
    }));
    await Promise.resolve();
    expect(session.snapshot().state).toBe("SPEAKING");

    let opened = false;
    const listening = session.safeListen(async () => { opened = true; });
    session.markListening();
    await Promise.resolve();
    await Promise.resolve();

    expect(opened).toBe(false);
    expect(session.snapshot().state).toBe("SPEAKING");
    expect(session.earBlocked()).toBe(true);

    releaseSpeech();
    await speaking;
    await listening;
    expect(opened).toBe(true);
    expect(session.snapshot().state).not.toBe("SPEAKING");
  });

  it("stops doctor-dashboard audio in the same frame the route unmounts", async () => {
    let cancelled = false;
    const session = new VoiceSession({
      log: () => undefined,
      cancelPlayback: () => { cancelled = true; },
    });
    const leaveDoctor = attachVoiceDashboard("/doctor", session);
    const pending = session.safeSpeak("still speaking on the doctor dashboard", (signal) => new Promise((resolve) => {
      signal.addEventListener("abort", () => resolve(), { once: true });
    }));
    await Promise.resolve();
    expect(session.snapshot().state).toBe("SPEAKING");

    let frame = 0;
    const queuedFrames: Array<() => void> = [];
    queuedFrames.push(() => { frame += 1; });

    leaveDoctor();
    attachVoiceDashboard("/pharmacy", session);

    expect(cancelled).toBe(true);
    expect(["IDLE", "MUTED"]).toContain(session.snapshot().state);
    expect(frame).toBe(0);
    queuedFrames.forEach((paint) => paint());
    expect(frame).toBe(1);
    expect(session.lastControlLatencyMs()).toBeLessThan(300);
    await pending;
  });

  it("does not open the mic until speak finishes", async () => {
    const session = new VoiceSession({ log: () => undefined });
    const order: string[] = [];
    const speaking = session.safeSpeak("hello", () => new Promise((resolve) => {
      order.push("speak-start");
      setTimeout(() => {
        order.push("speak-end");
        resolve();
      }, 40);
    }));
    await Promise.resolve();
    let opened = false;
    const listening = session.safeListen(async () => {
      opened = true;
      order.push("listen");
    });
    await Promise.resolve();
    expect(opened).toBe(false);
    expect(session.earBlocked()).toBe(true);
    await speaking;
    await listening;
    expect(order).toEqual(["speak-start", "speak-end", "listen"]);
  });

  it("stops playback and the mic inside 300ms and replies at most Okay", async () => {
    let cancelled = false;
    let closed = false;
    const spoken: string[] = [];
    const session = new VoiceSession({
      log: () => undefined,
      cancelPlayback: () => { cancelled = true; },
    });
    let releaseOkay: () => void = () => undefined;
    session.bindSpeaker((text) => {
      spoken.push(text);
      return new Promise((resolve) => { releaseOkay = resolve; });
    });
    const pending = session.safeSpeak("a long answer", (signal) => new Promise((resolve) => {
      signal.addEventListener("abort", () => resolve(), { once: true });
    }));
    session.registerMic(() => { closed = true; });
    await Promise.resolve();
    const elapsed = session.hardStop({ reason: "stop-word", replyOkay: true });
    expect(elapsed).toBeLessThan(300);
    expect(["IDLE", "MUTED"]).toContain(session.snapshot().state);
    expect(cancelled).toBe(true);
    expect(closed).toBe(true);
    expect(session.lastSpokenText()).toBe("Okay");
    await Promise.resolve();
    expect(spoken).toEqual(["Okay"]);
    session.hardStop({ reason: "stop-word", replyOkay: true });
    await Promise.resolve();
    expect(spoken).toEqual(["Okay"]);
    releaseOkay();
    await pending;
  });

  it("stops on route change and panel close without a spoken reply", async () => {
    let cancelled = false;
    const session = new VoiceSession({
      log: () => undefined,
      cancelPlayback: () => { cancelled = true; },
    });
    session.bindSpeaker(async () => { throw new Error("should not speak"); });
    session.onRoute("/doctor");
    const pending = session.safeSpeak("still talking", (signal) => new Promise((resolve) => {
      signal.addEventListener("abort", () => resolve(), { once: true });
    }));
    await Promise.resolve();
    session.onRoute("/pharmacy");
    expect(cancelled).toBe(true);
    expect(session.snapshot().state).toBe("IDLE");
    expect(session.lastSpokenText()).toBe("");
    await pending;
    session.releasePanel();
    expect(session.lastSpokenText()).toBe("");
  });

  it("logs state, stop, and mute with no audio payload", () => {
    const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
    const session = new VoiceSession({
      log: (eventType, fields) => events.push(voiceFlightEvent(eventType, { ...fields, audio: "should-drop", transcript: "should-drop" })),
    });
    session.pause();
    session.setSilent(true);
    expect(events.some((event) => event.eventType === "voice.muted")).toBe(true);
    expect(events.some((event) => event.eventType === "voice.silent")).toBe(true);
    expect(events.some((event) => event.eventType === "voice.state.changed")).toBe(true);
    for (const event of events) {
      expect(event.payload.audioStored).toBe(false);
      expect(event.payload.audio).toBeUndefined();
      expect(event.payload.transcript).toBeUndefined();
    }
    const flight = voiceFlightEvent("voice.stopped", { reason: "button-stop", blob: new Uint8Array([1, 2]) });
    expect(flight.payload.blob).toBeUndefined();
    expect(JSON.stringify(flight.payload)).not.toMatch(/wav|pcm|blob/i);
  });

  it("records a live stop on the flight recorder", () => {
    voiceSession.pause();
    const trace = astraEventBus.flightRecorderSnapshot();
    expect(trace.some((event) => event.eventType === "voice.muted" || event.eventType === "voice.state.changed")).toBe(true);
  });

  it("keeps silent mode manual and leaves gesture and silence detection as hooks", () => {
    const session = new VoiceSession({ log: () => undefined });
    expect(consultSilenceDetector({ route: "/doctor", state: "IDLE", atMs: 1 })).toBe("abstain");
    registerSilenceDetector(() => "silent");
    expect(consultSilenceDetector({ route: "/doctor", state: "LISTENING", atMs: 2 })).toBe("silent");
    expect(session.isSilent()).toBe(false);
    registerSilenceDetector(null);

    expect(dispatchVoiceGesture("stop")).toBe(false);
    session.bridgeGestures();
    expect(dispatchVoiceGesture("pause")).toBe(true);
    expect(session.snapshot().state).toBe("MUTED");
    registerVoiceGestureHandler(null);
  });
});

describe("R5-08 speakControlled", () => {
  beforeEach(() => voiceSession.resetForTest());

  it("withholds clinical speech off the doctor dashboard", async () => {
    voiceSession.setContext({ role: "pharmacy", dashboard: "pharmacy", route: "/pharmacy" });
    voiceSession.setTurnHints({ clinical: true });
    const result = await speakControlled("Creatinine is 4.2. Stop the NSAID. Repeat tomorrow.", "en", async () => {
      throw new Error("mouth should stay closed");
    });
    expect(result.withheld).toBe(true);
  });

  it("speaks only the acknowledgement for a long doctor-dashboard answer", async () => {
    voiceSession.setContext({ role: "doctor", dashboard: "doctor", route: "/doctor" });
    voiceSession.setTurnHints({ clinical: true });
    let heard = "";
    const result = await speakControlled(
      "Creatinine is 4.2. Stop the NSAID. Check potassium. Repeat tomorrow.",
      "en",
      async (line) => {
        heard = line;
        return { ok: true, provider: "voicebox" };
      }
    );
    expect(result.ok).toBe(true);
    expect(heard).toBe(CLINICAL_ACK);
    expect(voiceSession.snapshot().pushToTalk).toBe(true);
    expect(voiceSession.snapshot().doctorBargeIn).toBe(true);
  });

  it("does not keep a clinical hint for the next operational line", async () => {
    voiceSession.setContext({ role: "pharmacy", dashboard: "pharmacy", route: "/pharmacy" });
    voiceSession.setTurnHints({ clinical: true });
    const blocked = await speakControlled("Creatinine is 4.2. Stop the NSAID. Repeat tomorrow.", "en", async () => {
      throw new Error("mouth should stay closed");
    });
    expect(blocked.withheld).toBe(true);
    let heard = "";
    const next = await speakControlled("Opening the pharmacy dashboard.", "en", async (line) => {
      heard = line;
      return { ok: true, provider: "voicebox" };
    });
    expect(next.ok).toBe(true);
    expect(next.withheld).toBeUndefined();
    expect(heard).toContain("pharmacy");
  });

  it("shows the full answer and speaks at most two sentences", async () => {
    voiceSession.setContext({ role: "doctor", dashboard: "doctor", route: "/doctor" });
    const full = "Sentence one is on screen. Sentence two is spoken. Sentence three stays on screen only. Sentence four stays on screen only.";
    let screen = "";
    let spoken = "";
    await deliverAstraVoiceResponse(
      (event, payload) => {
        if (event === ASTRA_VOICE_EVENTS.text) screen = String(payload.text ?? "");
      },
      {
        turnId: "voice_turn_brevity",
        text: full,
        speechText: full,
        language: "en",
        speak: true,
        dashboard: "doctor",
        risk: "normal",
      },
      {
        synthesize: async ({ text }) => speakControlled(text, "en", async (line) => {
          spoken = line;
          return { ok: true, provider: "voicebox" };
        }),
      },
    );
    expect(screen).toBe(full);
    expect(splitSentences(spoken).length).toBeLessThanOrEqual(2);
    expect(spoken).toBe("Sentence one is on screen. Sentence two is spoken.");
    expect(screen).toContain("Sentence four stays on screen only.");
  });

  it("does not speak clinical text on a non-doctor dashboard without an approved patient-message", async () => {
    voiceSession.setContext({ role: "pharmacy", dashboard: "pharmacy", route: "/pharmacy" });
    voiceSession.setTurnHints({ clinical: true });
    let played = false;
    const blocked = await speakControlled(
      "Creatinine is 4.2. Stop the NSAID. Repeat the test tomorrow.",
      "en",
      async () => {
        played = true;
        return { ok: true, provider: "voicebox" };
      },
    );
    expect(blocked.withheld).toBe(true);
    expect(played).toBe(false);

    voiceSession.setTurnHints({ clinical: true, approvalDecisionId: "dec-9" });
    voiceSession.setGrantFetcher(async (id) => id === "dec-9");
    let heard = "";
    const allowed = await speakControlled("Creatinine is 4.2. Rest today.", "en", async (line) => {
      heard = line;
      return { ok: true, provider: "voicebox" };
    });
    expect(allowed.withheld).toBeUndefined();
    expect(allowed.ok).toBe(true);
    expect(heard).toContain("Creatinine");
  });

  it("keeps wake word and Dr. Mayin press-to-open", async () => {
    expect(isCallingAstra("Dr Mayin")).toBe(true);
    expect(extractWakeCommand("Dr. Mayin open pharmacy")).toEqual({ woke: true, command: "open pharmacy" });
    expect(extractWakeCommand("hey Mayin")).toEqual({ woke: true, command: "" });
    expect(listenResumeAfterSpeech({
      pushToTalk: false,
      wakeWordEnabled: true,
      panelOpen: false,
      armed: false,
    })).toBe("wake");
    expect(listenResumeAfterSpeech({
      pushToTalk: true,
      wakeWordEnabled: true,
      panelOpen: true,
      armed: true,
    })).toBe("press-to-open");

    const session = new VoiceSession({ log: () => undefined });
    expect(session.blocksNewEar(false)).toBe(false);
    expect(session.blocksNewEar(true)).toBe(false);
    let pressed = false;
    const opened = await session.safeListen(async () => { pressed = true; }, { manual: true });
    expect(opened).toBe("opened");
    expect(pressed).toBe(true);
  });

  it("requires the patient-message grant before speaking on a patient surface", async () => {
    voiceSession.setContext({ role: "doctor", dashboard: "doctor", route: "/patient/portal" });
    voiceSession.setTurnHints({ clinical: true, approvalDecisionId: "dec-1" });
    let asked = "";
    voiceSession.setGrantFetcher(async (id) => {
      asked = id ?? "";
      return false;
    });
    const blocked = await speakControlled("Your haemoglobin is 9.2. Please rest.", "en", async () => {
      throw new Error("patient surface blocked");
    });
    expect(blocked.withheld).toBe(true);
    expect(asked).toBe("dec-1");

    voiceSession.setGrantFetcher(async () => true);
    let heard = "";
    const allowed = await speakControlled("Your haemoglobin is 9.2.", "en", async (line) => {
      heard = line;
      return { ok: true, provider: "voicebox" };
    });
    expect(allowed.ok).toBe(true);
    expect(heard).toContain("haemoglobin");
  });
});

describe("whisper confidence", () => {
  it("reads a direct score and segment log-probabilities", () => {
    expect(confidenceFromWhisperPayload({ confidence: 42 })).toBeCloseTo(0.42);
    const clear = confidenceFromWhisperPayload({ segments: [{ avg_logprob: -0.1, no_speech_prob: 0 }] });
    const muddy = confidenceFromWhisperPayload({ segments: [{ avg_logprob: -2.2, no_speech_prob: 0.8 }] });
    expect(clear).toBeGreaterThan(0.8);
    expect(muddy).toBeLessThan(0.2);
    expect(confidenceFromWhisperPayload({})).toBeUndefined();
  });
});
