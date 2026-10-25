/**
 * R5-08 mouth gate. Brevity, doctor-only clinical speech, and the single speak lock.
 * Playback stays on the caller (Voicebox / speakAstra) — this does not add a voice.
 */

import { classifyLocally } from "@/astra/voice/roundTrip/voiceGuardian";
import type { AstraSpeechResult } from "@/astra/voice/roundTrip/ttsFallback";
import { evaluateClinicalSpeech, isDoctorClinicalDashboard, planSpokenLine } from "./voiceSafety";
import { voiceSession } from "./voiceSession";

export async function speakControlled(
  text: string,
  language: string,
  play: (line: string, signal: AbortSignal) => Promise<AstraSpeechResult>
): Promise<AstraSpeechResult> {
  void language;
  const hints = voiceSession.turnHints();
  // The hint applies to this answer only. A later ack or repeat-prompt must not inherit it.
  voiceSession.setTurnHints({ clinical: false });
  const clinical = hints.clinical || classifyLocally(text).risk !== "normal";
  const surface = voiceSession.surface();
  const doctorDashboard = isDoctorClinicalDashboard({
    role: voiceSession.role(),
    dashboard: voiceSession.dashboard(),
    surface,
  });
  let patientMessageAllowed = false;
  if (clinical && !doctorDashboard) {
    const recipient = surface === "attender" ? "attender" : "patient";
    patientMessageAllowed = await voiceSession.grant(hints.approvalDecisionId, recipient);
  }
  const decision = evaluateClinicalSpeech({
    clinical,
    role: voiceSession.role(),
    dashboard: voiceSession.dashboard(),
    surface,
    patientMessageAllowed,
  });
  voiceSession.setInteractionMode({
    pushToTalk: decision.pushToTalk,
    doctorBargeIn: decision.pauseIfDoctorSpeaks,
  });
  const snap = voiceSession.snapshot();
  if (!decision.speak || snap.silent || snap.state === "MUTED") {
    voiceSession.finishThinking();
    return { ok: true, provider: "none", withheld: true };
  }
  const line = planSpokenLine(text, { clinical });
  if (!line.trim()) {
    voiceSession.finishThinking();
    return { ok: false, provider: "none", error: "Nothing to speak" };
  }
  let result: AstraSpeechResult = { ok: false, provider: "none", error: "stopped" };
  const outcome = await voiceSession.safeSpeak(line, async (signal) => {
    result = await play(line, signal);
    if (!result.ok && signal.aborted) return;
  });
  if (outcome === "blocked") {
    voiceSession.finishThinking();
    return { ok: true, provider: "none", withheld: true };
  }
  if (outcome === "cancelled") return { ok: false, provider: "none", error: "stopped" };
  return result;
}
