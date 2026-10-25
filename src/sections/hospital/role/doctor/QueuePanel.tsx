import React from "react";
import { CalendarClock, Users } from "lucide-react";
import { HUD_PALETTE } from "@/components/CommandCenter/hudTokens";
import { TREND_ARROWS } from "@/astra/clinical/results/resultsLoop";
import type { TrendDirection } from "@/astra/clinical/results/resultsLoop";
import { HudGlassPanel } from "./hudBits";
import type { Patient } from "./types";

/** R5-06 closed-loop results meta per patient UHID: unread result count + latest trend arrow. */
export interface QueueResultsMeta {
  unread: number;
  trend?: TrendDirection;
}

interface Props {
  patients: Patient[];
  selectedPatient: Patient;
  onSelect: (p: Patient) => void;
  resultsMeta?: Record<string, QueueResultsMeta>;
}

type Status = { label: string; accent: string };

function statusOf(p: Patient): Status {
  if (p.vitals.spo2 < 90) return { label: "CRITICAL", accent: "#b91c1c" };
  if (p.vitals.temp >= 100 || p.vitals.hr >= 110) return { label: "URGENT", accent: "#b45309" };
  return { label: "STABLE", accent: "#0f766e" };
}

const SCHEDULE = [
  { time: "09:00", label: "Ward rounds — ICU Bed 04", accent: "#b91c1c" },
  { time: "10:30", label: "OP clinic — Internal Medicine", accent: "#1d4ed8" },
  { time: "12:00", label: "Pre-op review — ORIF femur", accent: "#b45309" },
  { time: "14:00", label: "Endoscopy consult — Room 302", accent: "#6d28d9" },
  { time: "16:30", label: "Discharge planning & summaries", accent: "#0f766e" },
];

export function QueuePanel({ patients, selectedPatient, onSelect, resultsMeta }: Props) {
  return (
    <div className="space-y-4">
      <HudGlassPanel accent={"#3730a3"} delay={120} className="p-3.5" ariaLabel="Patient queue">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4" style={{ color: "#3730a3" }} />
          <span className="text-xs font-black uppercase tracking-[0.18em] text-white">Patient Queue</span>
          <span className="ml-auto text-[10px] font-bold text-white/50">{patients.length} active</span>
          <span data-testid="demo-patient-queue" className="ml-2 rounded-full border border-amber-400/40 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-200">Demo patients</span>
        </div>
        <ul className="space-y-2">
          {patients.map((p) => {
            const st = statusOf(p);
            const isSelected = selectedPatient.id === p.id;
            const meta = resultsMeta?.[p.uhid];
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelect(p)}
                  aria-pressed={isSelected}
                  className={`dh-lift w-full text-left rounded-xl border p-2.5 transition-all ${isSelected ? "dh-active" : ""}`}
                  style={{
                    ["--hud-accent" as any]: st.accent,
                    borderColor: isSelected ? st.accent : "rgba(255,255,255,0.12)",
                    background: isSelected ? `color-mix(in srgb, ${st.accent} 14%, transparent)` : "rgba(255,255,255,0.04)",
                    boxShadow: `0 0 18px -8px ${st.accent}`,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white truncate">{p.name}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {!!meta?.unread && (
                        <span
                          data-testid="result-unread-badge"
                          title="New investigation results received — unread"
                          className="rounded-full bg-sky-500/25 px-1.5 py-0.5 text-[9px] font-black text-sky-200"
                        >
                          {meta.trend ? TREND_ARROWS[meta.trend] : ""} {meta.unread} new
                        </span>
                      )}
                      <span
                        className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                        style={{ color: st.accent, background: `color-mix(in srgb, ${st.accent} 18%, transparent)` }}
                      >
                        ● {st.label}
                      </span>
                    </span>
                  </div>
                  <div className="text-[10px] text-white/55 mt-0.5 truncate">
                    {p.type} • {p.bed} • {p.department}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </HudGlassPanel>

      <HudGlassPanel accent={"#6d28d9"} delay={180} className="p-3.5" ariaLabel="Today's schedule">
        <div className="flex items-center gap-2 mb-3">
          <CalendarClock className="w-4 h-4" style={{ color: "#6d28d9" }} />
          <span className="text-xs font-black uppercase tracking-[0.18em] text-white">Demo schedule</span>
        </div>
        <ol className="relative space-y-3 pl-4">
          <span className="absolute left-[5px] top-1 bottom-1 w-px bg-white/12" aria-hidden="true" />
          {SCHEDULE.map((s) => (
            <li key={s.time} className="relative">
              <span
                className="absolute -left-4 top-1 w-2.5 h-2.5 rounded-full"
                style={{ background: s.accent, boxShadow: `0 0 10px 1px ${s.accent}` }}
                aria-hidden="true"
              />
              <div className="text-[10px] font-black tracking-wider" style={{ color: s.accent }}>{s.time}</div>
              <div className="text-[11px] text-white/80 leading-snug">{s.label}</div>
            </li>
          ))}
        </ol>
      </HudGlassPanel>
    </div>
  );
}
