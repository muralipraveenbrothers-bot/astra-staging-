import React from "react";
import { Bot, Stethoscope } from "lucide-react";
import { HUD_PALETTE } from "@/components/CommandCenter/hudTokens";
import { OrderStatusChip } from "@/astra/clinical/workflow/OrderStatusChip";
import { HudGlassPanel } from "./hudBits";
import type { Patient } from "./types";

interface Props {
  patients: Patient[];
  selectedPatient: Patient;
  onSelect: (p: Patient) => void;
  showAiCopilot: boolean;
  onToggleCopilot: () => void;
}

export function PatientContextBar({ patients, selectedPatient, onSelect, showAiCopilot, onToggleCopilot }: Props) {
  return (
    <HudGlassPanel
      accent={"#0f766e"}
      delay={60}
      className="p-2.5 flex items-center justify-between gap-3 overflow-x-auto no-scrollbar"
      ariaLabel="Active patient context"
    >
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2 pr-3 border-r border-white/10">
          <div
            className="p-1.5 rounded-lg border border-white/15 bg-white/5 text-mint"
            style={{ color: "#0f766e" }}
          >
            <Stethoscope className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[9px] font-bold uppercase flex items-center gap-1 text-white/60">
              DEMO ACTIVE PATIENTS <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
            <div className="text-xs font-bold truncate max-w-[160px] text-white">
              {selectedPatient.name} ({selectedPatient.type})
            </div>
            <OrderStatusChip patientUhid={selectedPatient.uhid} role="doctor" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {patients.map((p) => {
            const isSelected = selectedPatient.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelect(p)}
                aria-pressed={isSelected}
                className={`dh-chip px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap ${isSelected ? "is-active" : ""}`}
                style={{ ["--hud-accent" as any]: isSelected ? "#1d4ed8" : "#3730a3" }}
              >
                <span className={`w-2 h-2 rounded-full ${isSelected ? "bg-sky-300" : "bg-white/40"}`} />
                <span>{p.name}</span>
                <span className="text-[10px] opacity-70 font-normal">({p.department})</span>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={onToggleCopilot}
        aria-pressed={showAiCopilot}
        className="dh-chip px-3 py-1.5 text-xs font-semibold flex items-center gap-1.5 shrink-0 is-active"
        style={{ ["--hud-accent" as any]: "#3730a3" }}
      >
        <Bot className="w-3.5 h-3.5" />
        <span>{showAiCopilot ? "Hide AI Co-Pilot" : "Show AI Co-Pilot"}</span>
      </button>
    </HudGlassPanel>
  );
}
