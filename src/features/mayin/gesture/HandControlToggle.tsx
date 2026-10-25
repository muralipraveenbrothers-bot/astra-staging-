import React from "react";
import { Hand } from "lucide-react";
import { useGesturePrefs } from "./useGesturePrefs";

/**
 * "Hand control" on/off switch. Mirrors the wake-word switch (prompt 03):
 * default OFF, persisted in localStorage (astra.gesture.enabled), and the
 * camera NEVER starts until the doctor flips it on.
 *
 * variant "pill"  → matches the floating wake-word switch on the dashboard.
 * variant "tool"  → matches the 3D viewer toolbar buttons.
 */
export function HandControlToggle({ variant = "pill" }: { variant?: "pill" | "tool" }) {
  const { gestureEnabled, setGestureEnabled } = useGesturePrefs();

  if (variant === "tool") {
    return (
      <button
        type="button"
        onClick={() => setGestureEnabled(!gestureEnabled)}
        aria-pressed={gestureEnabled}
        aria-label={`Hand control ${gestureEnabled ? "on" : "off"}, toggle`}
        title="Hand control (camera gestures)"
        style={{
          padding: "5px 10px",
          fontSize: 10,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          border: "1px solid",
          borderColor: gestureEnabled ? "#5ef2c2" : "rgba(255,255,255,0.14)",
          borderRadius: 8,
          background: gestureEnabled ? "rgba(94,242,194,0.15)" : "rgba(255,255,255,0.04)",
          color: gestureEnabled ? "#5ef2c2" : "rgba(255,255,255,0.5)",
          cursor: "pointer",
          transition: "all 0.2s",
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        <Hand size={12} />
        Hand{gestureEnabled ? ": ON" : ""}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setGestureEnabled(!gestureEnabled)}
      className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-[10px] font-bold uppercase tracking-wider backdrop-blur-xl transition-all ${
        gestureEnabled
          ? "border-emerald-400/60 bg-emerald-950/85 text-emerald-200 shadow-[0_0_20px_-4px_rgba(57,255,136,0.6)]"
          : "border-white/15 bg-black/70 text-slate-300 hover:border-white/30"
      }`}
      aria-pressed={gestureEnabled}
      aria-label={`Hand control camera ${gestureEnabled ? "on" : "off"}, toggle`}
      title="Hand control (camera gestures)"
    >
      {gestureEnabled && <span className="h-2 w-2 rounded-full bg-emerald-300 animate-pulse" />}
      <Hand size={12} />
      Hand control: {gestureEnabled ? "ON" : "OFF"}
    </button>
  );
}
