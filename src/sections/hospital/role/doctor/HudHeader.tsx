import React from "react";
import { Gauge, Moon, Sun } from "lucide-react";
import { Badge } from "@/components/ui";
import { HUD_PALETTE } from "@/components/CommandCenter/hudTokens";
import { HudGlassPanel, useCountUp } from "./hudBits";

export interface Kpi {
  label: string;
  value: number;
  accent: string;
}

interface Props {
  isDarkTheme: boolean;
  onToggleTheme: () => void;
  perf: boolean;
  onTogglePerf: () => void;
  perfAuto: boolean;
  kpis: Kpi[];
}

function KpiTile({ kpi }: { kpi: Kpi }) {
  const n = useCountUp(kpi.value);
  return (
    <div
      className="hud-glass dh-lift px-3.5 py-2 text-center min-w-[78px]"
      style={{ ["--hud-accent" as any]: kpi.accent, ["--hud-radius" as any]: "14px" }}
    >
      <span className="text-[10px] font-bold uppercase tracking-wider block text-white/70">{kpi.label}</span>
      <span className="text-xl font-black leading-tight tabular-nums" style={{ color: ({ "#FF7A6B": "#b91c1c", "#FFD84D": "#b45309", "#7CC8FF": "#1d4ed8", "#5EF2C2": "#0f766e" } as Record<string, string>)[kpi.accent] || "#111111" }}>
        {String(n).padStart(2, "0")}
      </span>
    </div>
  );
}

export function HudHeader({ isDarkTheme, onToggleTheme, perf, onTogglePerf, perfAuto, kpis }: Props) {
  return (
    <HudGlassPanel
      accent={"#3730a3"}
      delay={0}
      className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
      ariaLabel="Doctor command header"
    >
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-sky-200/70">
          TUESDAY, 10 AUGUST 2026 • CLINICAL COMMAND OS
        </div>
        <div className="flex items-center gap-2.5 mt-1 flex-wrap">
          <h1 className="text-2xl font-black tracking-tight text-white">Good morning, Dr. Murali</h1>
          <Badge tone="cyan">Astra AI Active</Badge>
          <button
            type="button"
            onClick={onToggleTheme}
            className="dh-btn px-2.5 py-1 text-[10px] font-bold"
            aria-label={isDarkTheme ? "Switch to clinical white theme" : "Switch to dark cockpit theme"}
          >
            {isDarkTheme ? <Sun size={13} /> : <Moon size={13} />}
            {isDarkTheme ? "Clinical White" : "Dark Cockpit"}
          </button>
          <button
            type="button"
            onClick={onTogglePerf}
            aria-pressed={perf}
            className={`dh-chip px-2.5 py-1 text-[10px] font-bold inline-flex items-center gap-1 ${perf ? "is-active" : ""}`}
            style={{ ["--hud-accent" as any]: "#b45309" }}
            title="Turns off blur, particles and heavy animation"
          >
            <Gauge size={13} />
            Performance mode{perfAuto ? " (auto)" : ""}: {perf ? "ON" : "OFF"}
          </button>
        </div>
        <p className="text-xs mt-1 text-white/60">
          Real-time Decision Support • Hospital Intelligence Engine • White cards with black borders, this screen only
        </p>
      </div>

      <div className="flex items-center gap-2.5 flex-wrap">
        {/* Demo strip: values are illustrative until live KPI APIs feed this header */}
        <span data-testid="demo-kpi-strip" className="text-[9px] font-black uppercase tracking-wider text-amber-200/80 mr-1">Demo KPIs</span>
        {kpis.map((kpi) => (
          <KpiTile key={kpi.label} kpi={kpi} />
        ))}
      </div>
    </HudGlassPanel>
  );
}
