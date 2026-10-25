/**
 * Permanent voice controls. One bar for the whole app: Start, Pause, Resume, Stop, Silent.
 * Colours follow the HUD palette. Listening waveform, thinking pulse, speaking ring, muted red.
 */

import { useEffect, useLayoutEffect, useState } from "react";
import { HUD_PALETTE } from "@/components/CommandCenter/hudTokens";
import { useAuth } from "@/lib/auth";
import { useHashRoute } from "@/lib/hashRoute";
import { dashboardFromRoute } from "@/components/Communications/useAstraVoiceTurn";
import { VOICE_STATE_VISUAL, type VoiceState } from "./voiceSafety";
import { attachVoiceDashboard, voiceSession, type VoiceSnapshot } from "./voiceSession";
import "./clinicalVoiceClient";

export function voiceVisualStyle(state: VoiceState): { color: string; glow: string } {
  switch (state) {
    case "LISTENING":
      return { color: HUD_PALETTE.sky, glow: HUD_PALETTE.mint };
    case "THINKING":
      return { color: HUD_PALETTE.sunflower, glow: HUD_PALETTE.sunflower };
    case "SPEAKING":
      return { color: "#f8fafc", glow: HUD_PALETTE.lilac };
    case "MUTED":
      return { color: HUD_PALETTE.coral, glow: HUD_PALETTE.coral };
    default:
      return { color: "#94a3b8", glow: "#64748b" };
  }
}

export function VoiceSafetyChrome() {
  const route = useHashRoute();
  const { account } = useAuth();
  const [snap, setSnap] = useState<VoiceSnapshot>(() => voiceSession.snapshot());

  useEffect(() => voiceSession.subscribe(() => setSnap(voiceSession.snapshot())), []);
  useEffect(() => voiceSession.bridgeGestures(), []);

  useLayoutEffect(() => {
    voiceSession.setContext({
      role: account?.role ?? "",
      dashboard: dashboardFromRoute(route),
      route,
      userId: account?.id,
    });
    // Cleanup runs on route change and on unmount, before the browser paints the next frame.
    return attachVoiceDashboard(route);
  }, [account?.id, account?.role, route]);

  useEffect(() => {
    const onHide = () => {
      if (document.hidden) voiceSession.hardStop({ reason: "hidden", replyOkay: false });
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, []);

  const visual = VOICE_STATE_VISUAL[snap.state];
  const style = voiceVisualStyle(snap.state);
  const isEmrRoute = String(route).includes("emr");
  const waveform = snap.motion === "waveform";

  // Reception is a focused operational workspace; its staff-facing shell does
  // not expose the global Start/Pause/Resume/Stop/Silent control strip.
  if (String(route).includes("command-os") || String(route).split("?")[0] === "/reception") return null;

  return (
    <div
      role="region"
      aria-label="Voice safety"
      style={{
        position: "fixed",
        zIndex: 120,
        left: isEmrRoute ? 34 : 12,
        bottom: isEmrRoute ? 16 : 96,
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexWrap: isEmrRoute ? "wrap" : "nowrap",
        maxWidth: isEmrRoute ? 266 : undefined,
        padding: "6px 8px",
        borderRadius: 999,
        background: "rgba(11,16,38,0.92)",
        border: `1px solid ${style.color}`,
        boxShadow: snap.state === "SPEAKING" ? `0 0 0 4px ${style.glow}55` : `0 0 16px ${style.glow}33`,
        color: style.color,
      }}
    >
      <style>{`
        @keyframes astra-voice-pulse { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }
        @keyframes astra-voice-bar { 0%, 100% { transform: scaleY(0.35); } 50% { transform: scaleY(1); } }
      `}</style>
      <span
        aria-live="polite"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          minWidth: 88,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          animation: snap.motion === "pulse" ? "astra-voice-pulse 1s ease-in-out infinite" : undefined,
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: 99, background: style.color, boxShadow: `0 0 8px ${style.glow}` }} />
        {visual.label}
      </span>
      <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "flex-end", gap: 2, height: 14, width: 28 }}>
        {[0, 1, 2, 3].map((bar) => (
          <span
            key={bar}
            style={{
              width: 3,
              height: waveform ? 8 + ((bar * 5) % 8) : 4,
              borderRadius: 2,
              background: waveform ? `linear-gradient(${HUD_PALETTE.sky}, ${HUD_PALETTE.mint})` : style.color,
              transformOrigin: "bottom",
              animation: waveform ? `astra-voice-bar 0.7s ease-in-out ${bar * 0.08}s infinite` : undefined,
              opacity: waveform || snap.state === "SPEAKING" ? 1 : 0.35,
            }}
          />
        ))}
      </span>
      {snap.silent && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: HUD_PALETTE.coral,
            border: `1px solid ${HUD_PALETTE.coral}`,
            borderRadius: 999,
            padding: "1px 6px",
          }}
        >
          Silent
        </span>
      )}
      <Control label="Start" onClick={() => voiceSession.requestStart()} />
      <Control label="Pause" onClick={() => voiceSession.pause()} />
      <Control label="Resume" onClick={() => voiceSession.resume()} />
      <Control label="Stop" onClick={() => voiceSession.hardStop({ reason: "button-stop", replyOkay: true })} />
      <Control label={snap.silent ? "Sound" : "Silent"} onClick={() => voiceSession.setSilent(!snap.silent)} pressed={snap.silent} />
    </div>
  );
}

function Control({ label, onClick, pressed }: { label: string; onClick: () => void; pressed?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      style={{
        border: "1px solid rgba(255,255,255,0.16)",
        background: pressed ? "rgba(255,122,107,0.2)" : "rgba(255,255,255,0.04)",
        color: "inherit",
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.04em",
        padding: "3px 8px",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
