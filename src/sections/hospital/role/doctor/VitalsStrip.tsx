import React, { useMemo } from "react";
import { Activity, FileText, FlaskConical, Mic, Pill, Printer, ScanLine } from "lucide-react";
import { HUD_PALETTE } from "@/components/CommandCenter/hudTokens";
import { HudGlassPanel, Sparkline } from "./hudBits";
import type { ClinicalTab, Patient } from "./types";

interface Props {
  patient: Patient;
  onTab: (tab: ClinicalTab) => void;
  onQuickOrder: (item: string, category: string) => void;
  onSpeakOrder: () => void;
  onPrint: () => void;
}

function series(base: number, seed: number, spread: number): number[] {
  return Array.from({ length: 16 }, (_, i) => {
    const wobble = Math.sin((i + seed) * 1.1) * spread + Math.cos((i + seed) * 0.6) * (spread / 2);
    return Math.round((base + wobble) * 10) / 10;
  });
}

export function VitalsStrip({ patient, onTab, onQuickOrder, onSpeakOrder, onPrint }: Props) {
  const v = patient.vitals;
  const tiles = useMemo(
    () => [
      { label: "BLOOD PRESSURE", value: v.bp, sub: "Normal range", color: "#1d4ed8", data: series(120, 1, 6) },
      { label: "PULSE RATE", value: `${v.hr} bpm`, sub: "Regular rhythm", color: "#0f766e", data: series(v.hr, 2, 5) },
      { label: "BODY TEMP", value: `${v.temp} °F`, sub: "↑ 1.2°F (10m ago)", color: "#b45309", data: series(v.temp, 3, 0.6) },
      { label: "SPO2 SAT", value: `${v.spo2} %`, sub: "Room air", color: "#6d28d9", data: series(v.spo2, 4, 2) },
      { label: "RESP RATE", value: `${v.rr} /min`, sub: "Eupneic", color: "#b91c1c", data: series(v.rr, 5, 2) },
    ],
    [v],
  );

  const actions = [
    { label: "Rx", icon: Pill, accent: "#0f766e", onClick: () => onTab("erx"), aria: "Open e-Prescription matrix" },
    { label: "Labs", icon: FlaskConical, accent: "#1d4ed8", onClick: () => onTab("lab"), aria: "Open lab and imaging records" },
    { label: "Imaging", icon: ScanLine, accent: "#6d28d9", onClick: () => onQuickOrder("USG Abdomen & Pelvis", "radiology"), aria: "Order imaging" },
    { label: "Discharge", icon: FileText, accent: "#b45309", onClick: () => onTab("discharge"), aria: "Open discharge desk" },
    { label: "Speak Order", icon: Mic, accent: "#047857", onClick: onSpeakOrder, aria: "Speak a voice order" },
  ];

  return (
    <HudGlassPanel accent={"#0f766e"} delay={240} className="p-3.5" ariaLabel="Vitals strip and quick actions">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4" style={{ color: "#0f766e" }} />
          <span className="text-xs font-black uppercase tracking-[0.18em] text-white">Real-Time Vitals Telemetry</span>
        </div>
        <button type="button" onClick={onPrint} className="dh-btn px-3 py-1 text-xs font-semibold" aria-label="Print barcoded OP slip">
          <Printer className="w-3.5 h-3.5" style={{ color: "#1d4ed8" }} /> Print Barcoded OP Slip
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="dh-lift rounded-xl border border-white/10 bg-white/[0.04] p-2.5"
            style={{ boxShadow: `0 0 18px -10px ${t.color}` }}
          >
            <span className="text-[10px] font-bold uppercase block text-white/60">{t.label} ●</span>
            <div className="text-base font-black mt-0.5 text-white tabular-nums">{t.value}</div>
            <div className="flex items-end justify-between gap-1 mt-1">
              <Sparkline data={t.data} color={t.color} width={92} height={26} />
            </div>
            <span className="text-[9px] text-white/45 block mt-0.5">{t.sub}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-white/10">
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/45 mr-1">Quick actions:</span>
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            aria-label={a.aria}
            className="dh-chip px-3 py-1.5 text-xs font-bold inline-flex items-center gap-1.5"
            style={{ ["--hud-accent" as any]: a.accent }}
          >
            <a.icon className="w-3.5 h-3.5" />
            {a.label}
          </button>
        ))}
      </div>
    </HudGlassPanel>
  );
}
