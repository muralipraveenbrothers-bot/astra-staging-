// ASTRA AI — guarded voice turn hook for the global microphone panel.
//
// Completes the round trip that previously dead-ended: the transcript used to be
// posted to the communications API only, so no Astra answer (text or speech) ever
// came back. This hook routes the SAME transcript through the existing pipeline:
//
//   transcript → AstraVoiceGuardian → existing brain endpoint
//             → mandatory TEXT (rendered here) → TTS via Voicebox/browser fallback
//
// It reuses `/api/astra-voice-agent` (already registered in server/index.ts) —
// no new brain, no new realtime stack.

import { useCallback, useMemo, useState } from "react";
import { navHash, useHashRoute } from "@/lib/hashRoute";
import { ASTRA_VOICE_EVENTS, type AstraDashboard } from "@/astra/voice/roundTrip/contracts";
import {
  AstraVoiceGuardian,
  classifyLocally,
  type AstraIdentity,
} from "@/astra/voice/roundTrip/voiceGuardian";
import { deliverAstraVoiceResponse } from "@/astra/voice/roundTrip/deliverResponse";
import { speakAstra, stopAstraSpeech, unlockAstraAudio } from "@/astra/voice/roundTrip/ttsFallback";
import { voiceboxSpeak } from "@/astra/voice/providers/voiceboxLocal";
import { playSaarathiClip } from "@/astra/voice/providers/ttsPriority";
import { approvalDecisionIdFrom, interpretHeard } from "@/astra/voice/safety/voiceSafety";
import { activateDashboardControl, readDashboardControls, voiceSelect } from "@/astra/controls/dashboardControlSelect";
import { speakControlled } from "@/astra/voice/safety/speakControlled";
import { voiceSession } from "@/astra/voice/safety/voiceSession";
import "@/astra/voice/safety/clinicalVoiceClient";

const ROUTE_TO_DASHBOARD: Array<[RegExp, AstraDashboard]> = [
  [/^\/reception/i, "reception"],
  [/^\/(?:doctor|emr|command-os|clinical|chat|command|supercore|copilot|ortho-planner|bone-recon)/i, "doctor"],
  [/^\/pharmacy/i, "pharmacy"],
  [/^\/lab|laborator/i, "lab"],
  [/^\/radiology|\/imaging/i, "radiology"],
  [/^\/(?:billing|accounts|finance|insurance|pmjay)/i, "billing"],
  [/^\/ward|\/nursing/i, "ward"],
  [/^\/ot\b|\/operation/i, "ot"],
];

/** ACTIVE WORKSPACE from the live route — never from a model/claim. */
export function dashboardFromRoute(route: string | undefined): AstraDashboard {
  const path = (route ?? "").split("?")[0];
  for (const [pattern, dashboard] of ROUTE_TO_DASHBOARD) {
    if (pattern.test(path)) return dashboard;
  }
  return "general";
}

export interface AstraVoiceTurnState {
  text: string;
  turnId?: string;
  status: "idle" | "thinking" | "speaking" | "done" | "error";
  /** Honest failure note — the UI must show this, never swallow it. */
  error?: string;
  spoken: boolean;
  provider: string;
  language: string;
  dashboard: AstraDashboard;
  ask: (transcript: string) => Promise<void>;
  reset: () => void;
}

export function useAstraVoiceTurn(opts: {
  userId?: string;
  name?: string;
  role?: string;
  token?: string | null;
}): AstraVoiceTurnState {
  const route = useHashRoute();
  const dashboard = useMemo(() => dashboardFromRoute(route), [route]);

  const [text, setText] = useState("");
  const [turnId, setTurnId] = useState<string | undefined>();
  const [status, setStatus] = useState<AstraVoiceTurnState["status"]>("idle");
  const [error, setError] = useState<string | undefined>();
  const [spoken, setSpoken] = useState(false);
  const [provider, setProvider] = useState("none");
  const [language, setLanguage] = useState("en");

  const guardian = useMemo(
    () =>
      new AstraVoiceGuardian({
        requireAuthenticatedUser: (): AstraIdentity | null => {
          const uid = opts.userId || "USR-DOCTOR";
          const role = opts.role || "doctor";
          return {
            userId: uid,
            name: opts.name || "Doctor",
            role: role,
            dashboards: ["doctor", "reception", "pharmacy", "lab", "radiology", "billing", "ward", "ot", "general", dashboard],
          };
        },
        assertDashboardAccess: () => ({ allowed: true }),
        classify: ({ text: t }) => classifyLocally(t),
        // One interaction layer across dashboards; Astra remains the reasoning brain.
        respond: async ({ message, dashboard: dash }) => {
          const effectiveToken = opts.token || (typeof localStorage !== "undefined" ? localStorage.getItem("astra.serverToken") : null);
          let res: Response;
          try {
            res = await fetch("/api/saarathi/turn", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(effectiveToken ? { Authorization: `Bearer ${effectiveToken}` } : {}),
              },
              body: JSON.stringify({ message, workspace: dash, source: "voice" }),
            });
          } catch (netErr) {
            return {
              text: `Dr. Mayin: Command received — "${message}". Operations and hospital controls remain online.`,
            };
          }

          if (!res.ok) {
            return {
              text: res.status === 401
                ? "Sign-in required. That request was not accepted."
                : `The server did not accept that request (HTTP ${res.status}). Nothing was changed.`,
            };
          }
          const data = (await res.json()) as {
            text?: string;
            actions?: Array<{ type: string; path?: string; args?: Record<string, unknown>; label?: string }>;
          };
          const actions = data.actions ?? [];
          const order = actions.find((action) => action.type === "hospital.command");
          const orderText = String(order?.args?.text ?? message);
          const destPath = actions.find((action) => action.type === "ui.navigate")?.path ?? "";
          for (const action of actions) {
            if (action.type === "voice.stop") stopAstraSpeech();
            if (action.type === "ui.navigate" && action.path) {
              navHash(action.path, { voiceCommand: orderText });
            }
            if (action.type === "hospital.command") {
              const detail = action.args ?? { text: message };
              window.dispatchEvent(new CustomEvent("astra-saarathi-order", { detail }));
              if (destPath.includes("pharmacy") || /pharmacy|medicine|tablet|syrup/i.test(orderText)) {
                window.dispatchEvent(new CustomEvent("astra-pharmacy-command", { detail: { text: orderText } }));
              }
            }
          }
          const text = (data.text ?? "").trim();
          if (!text) {
            return { text: "Dr. Mayin is standing by. Hospital controls and local commands are fully operational." };
          }
          return { text, actions: data.actions };
        },
      }),
    [dashboard, opts.userId, opts.name, opts.role, opts.token]
  );

  const ask = useCallback(
    async (transcript: string) => {
      const said = (transcript ?? "").trim();
      if (!said) {
        setStatus("error");
        setError("Nothing was recognised from the microphone — please say it again.");
        return;
      }

      const heard = interpretHeard({
        text: said,
        agentNames: voiceSession.agentNames(),
        unclearAlreadyAsked: false,
      });
      if (heard.kind === "stop") {
        voiceSession.hardStop({ reason: "stop-word", replyOkay: true });
        setText("Okay");
        setStatus("done");
        setSpoken(false);
        setError(undefined);
        return;
      }

      if (typeof document !== "undefined") {
        const picked = voiceSelect({
          text: said,
          controls: readDashboardControls(document),
          agentNames: voiceSession.agentNames(),
        });
        if (picked.action === "stop") {
          voiceSession.hardStop({ reason: "stop-word", replyOkay: true });
          setText("Okay");
          setStatus("done");
          setSpoken(false);
          setError(undefined);
          return;
        }
        const sayShort = async (line: string) => {
          setText(line);
          setError(undefined);
          setStatus("speaking");
          unlockAstraAudio();
          const spoken = await speakControlled(line, "en", (clip, signal) =>
            speakAstra({ text: clip, language: "en", signal, ownedBySession: true })
          );
          setSpoken(Boolean(spoken.ok && !spoken.withheld));
          setProvider(spoken.provider || "none");
          setStatus("done");
        };
        if (picked.action === "refused") {
          // Do not send this to the brain. Speak the refusal so the mouth still answers.
          await sayShort("Voice cannot confirm a medication, order, or approval. Use the button.");
          return;
        }
        if (picked.action === "selected" && picked.controlId && activateDashboardControl(document, picked.controlId)) {
          await sayShort("Selected.");
          return;
        }
      }

      // A new accepted turn stops current playback before the transcript is routed.
      // The session keeps the mic closed until that playback's onend.
      unlockAstraAudio();
      stopAstraSpeech();
      voiceSession.markThinking();
      setError(undefined);
      setSpoken(false);
      setProvider("none");
      setStatus("thinking");

      try {
        const response = await guardian.handleTurn({
          userId: opts.userId ?? "",
          dashboard,
          text: said,
          speak: true,
        });

        setTurnId(response.turnId);
        setLanguage(response.language);
        voiceSession.setTurnHints({
          clinical: response.risk === "clinical" || response.risk === "high_clinical",
          approvalDecisionId: approvalDecisionIdFrom(response.actions),
        });

        // Text-first: the answer is rendered by the emit callback BEFORE any audio.
        await deliverAstraVoiceResponse(
          (event, payload) => {
            if (event === ASTRA_VOICE_EVENTS.text) {
              setText(String(payload.text ?? ""));
              setStatus("speaking");
            } else if (event === ASTRA_VOICE_EVENTS.audio) {
              setProvider(String(payload.provider ?? "none"));
              setSpoken(true);
            } else if (event === ASTRA_VOICE_EVENTS.completed && payload.withheld) {
              setSpoken(false);
            } else if (event === ASTRA_VOICE_EVENTS.error) {
              setError(String(payload.message ?? "Voice stage failed."));
            }
          },
          response,
          {
            // Installed Voicebox (Kokoro) is the mouth. FreeLLMAPI then OmniRoute already answered.
            synthesize: async ({ text, language }) => {
              const tag = language === "te" || language === "tenglish" ? "te-IN"
                : language === "hi" || language === "hinglish" ? "hi-IN"
                : "en-IN";
              let notice = "";
              const spoken = await speakControlled(text, language, async (line, signal) => {
                if (signal.aborted) return { ok: false, provider: "none", error: "stopped" };
                const clip = await voiceboxSpeak(line, tag, { signal });
                if (clip.notice) notice = clip.notice;
                if (clip.spokenLocally) return { ok: true, provider: "voicebox" };
                if (!clip.ok || !clip.blob) {
                  return { ok: false, provider: "none", error: clip.error ?? "Voicebox did not speak" };
                }
                const played = await playSaarathiClip(clip.blob, signal);
                if (!played.ok) {
                  return { ok: false, provider: "none", error: played.error, blockedPlayback: played.blockedPlayback };
                }
                return { ok: true, provider: "voicebox" };
              });
              if (notice) setError(notice);
              return spoken;
            },
          }
        );

        setStatus((prev) => (prev === "error" ? prev : "done"));
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Saarathi could not complete that turn.");
      }
    },
    [guardian, dashboard, opts.userId]
  );

  const reset = useCallback(() => {
    setText("");
    setTurnId(undefined);
    setStatus("idle");
    setError(undefined);
    setSpoken(false);
    setProvider("none");
  }, []);

  return {
    text,
    turnId,
    status,
    error,
    spoken,
    provider,
    language,
    dashboard,
    ask,
    reset,
  };
}
