import React from "react";
import { Activity, AlertTriangle, FileText, FlaskConical, Layers, Pill, Zap } from "lucide-react";
import { Badge } from "@/components/ui";
import { HUD_PALETTE } from "@/components/CommandCenter/hudTokens";
import { HudGlassPanel } from "./hudBits";
import { MedicationDraftPanel } from "@/astra/clinical/medication/MedicationDraftPanel";
import { toStockItems } from "@/astra/clinical/medication/stockCheck";
import { DEMO_STOCK_LABEL, usePharmacyInventory } from "../pharmacyInventoryLive";
import type { ClinicalTab, ClinicalTabDef, Patient } from "./types";

const TABS: ClinicalTabDef[] = [
  { id: "symptom", label: "Symptom & Dx", icon: Activity },
  { id: "erx", label: "e-Rx Matrix", icon: Pill },
  { id: "lab", label: "Lab & Imaging Voice", icon: FlaskConical },
  { id: "ward", label: "Ward Telemetry", icon: Layers },
  { id: "discharge", label: "Discharge Desk", icon: FileText },
];

interface Props {
  activeTab: ClinicalTab;
  onTab: (tab: ClinicalTab) => void;
  patient: Patient;
  onQuickOrder: (item: string, category: string) => void;
  onSaveDraft: (kind: "e-prescription" | "discharge-summary", body: Record<string, string>) => void;
}

export function OrdersPanel({ activeTab, onTab, patient, onQuickOrder, onSaveDraft }: Props) {
  const stock = usePharmacyInventory();
  return (
    <HudGlassPanel accent={"#3730a3"} delay={180} className="p-3.5" ariaLabel="Clinical orders workspace">
      {/* Tab bar */}
      <div className="flex items-center gap-1.5 border-b border-white/10 pb-2 mb-3 overflow-x-auto no-scrollbar" role="tablist" aria-label="Clinical workspaces">
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTab(tab.id)}
              className={`dh-chip px-3.5 py-2 text-xs font-bold flex items-center gap-2 whitespace-nowrap ${active ? "is-active" : ""}`}
              style={{ ["--hud-accent" as any]: active ? "#1d4ed8" : "#3730a3" }}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: SYMPTOM & DX */}
      {activeTab === "symptom" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4" style={{ color: "#b45309" }} />
              <span className="text-xs font-black uppercase tracking-wide text-white">AI Decision Engine: Differential Diagnoses</span>
            </div>
            <Badge tone="cyan">Clinical Decision Support Active</Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="dh-lift p-3 rounded-xl border space-y-1" style={{ borderColor: "color-mix(in srgb, #FFD84D 40%, transparent)", background: "rgba(255,216,77,0.07)" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-white">1. Dengue Viral Fever (88% Prob)</span>
                <Badge tone="amber">High Risk</Badge>
              </div>
              <p className="text-[11px] leading-snug text-white/70">
                Classic high fever, headache, retro-orbital pain, myalgia, leukopenia, and thrombocytopenia risk.
              </p>
              <span className="text-[9px] block font-semibold" style={{ color: "#1d4ed8" }}>Ref: WHO Dengue Guidelines 2024 (Section 4.2)</span>
            </div>

            <div className="dh-lift p-3 rounded-xl border border-white/10 bg-white/[0.04] space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-white">2. Malaria (Plasmodium vivax)</span>
                <Badge tone="cyan">Moderate</Badge>
              </div>
              <p className="text-[11px] leading-snug text-white/70">
                Intermittent fever spikes with rigors and splenomegaly potential. Requires peripheral blood smear.
              </p>
              <span className="text-[9px] block font-semibold" style={{ color: "#1d4ed8" }}>Ref: Harrison's Internal Medicine 21st Ed</span>
            </div>
          </div>

          <div className="p-3 rounded-xl border text-xs flex items-start gap-2.5" style={{ borderColor: "color-mix(in srgb, #FF7A6B 45%, transparent)", background: "rgba(255,122,107,0.09)", color: "#7f1d1d" }}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#b91c1c" }} />
            <div>
              <strong className="block font-bold uppercase text-[11px]" style={{ color: "#b91c1c" }}>
                CLINICAL ALERT: Scrub Typhus / Leptospirosis Screening
              </strong>
              Check patient's skin for hidden eschar or conjunctival suffusion. Recommend Weil-Felix or Scrub Typhus IgM if fever persists &gt; 5 days.
            </div>
          </div>

          <div className="p-2.5 rounded-lg border border-white/10 bg-white/[0.03] text-xs text-white/75">
            <strong className="font-bold uppercase text-[10px] block mb-0.5 text-white/50">Chief Complaints:</strong>
            {patient.complaints}
          </div>

          <div className="pt-2 border-t border-white/10 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 text-white/50">
              <Zap className="w-3 h-3 fill-current" style={{ color: "#1d4ed8" }} /> AI Recommended Quick Orders:
            </span>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onQuickOrder("Complete Blood Count (CBC) + Platelets", "laboratory")} className="dh-chip px-3 py-1.5 text-xs font-semibold" style={{ ["--hud-accent" as any]: "#1d4ed8" }}>
                + Order CBC (Platelet + WBC)
              </button>
              <button type="button" onClick={() => onQuickOrder("Dengue NS1 / IgM Antibody Combo", "laboratory")} className="dh-chip px-3 py-1.5 text-xs font-semibold" style={{ ["--hud-accent" as any]: "#1d4ed8" }}>
                + Order Dengue NS1 / IgM
              </button>
              <button type="button" onClick={() => onQuickOrder("USG Abdomen & Pelvis", "radiology")} className="dh-chip px-3 py-1.5 text-xs font-semibold" style={{ ["--hud-accent" as any]: "#0f766e" }}>
                + Order USG Abdomen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: e-Rx Matrix */}
      {activeTab === "erx" && (
        <div className="space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-white">Computerized e-Prescription (MCI-101 Format)</h3>
          <div className="p-3 rounded-xl border border-white/10 bg-white/[0.03] text-xs space-y-2 text-white/80">
            <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
              <span className="font-bold" style={{ color: "#1d4ed8" }}>1. Tab. Dolo 650mg (Paracetamol)</span>
              <span>1-1-1 (TID) after meals • 5 Days</span>
            </div>
            <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
              <span className="font-bold" style={{ color: "#1d4ed8" }}>2. Tab. Pantoprazole 40mg</span>
              <span>1-0-0 (OD) before breakfast • 5 Days</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-bold" style={{ color: "#1d4ed8" }}>3. ORS Sachet in 1 Litre Water</span>
              <span>Frequent sips daily</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onSaveDraft("e-prescription", { patient: patient.name, uhid: patient.uhid, lines: "Dolo 650mg TID 5 days; Pantoprazole 40mg OD 5 days; ORS sachets" })}
            className="dh-btn px-4 py-2 text-xs font-bold"
            style={{ ["--hud-accent" as any]: "#0f766e", background: "color-mix(in srgb, #5EF2C2 18%, transparent)" }}
          >
            Save draft on this computer
          </button>
          {!stock.loading && !stock.live && (
            <p data-testid="demo-stock-label" className="rounded-lg border border-amber-500/40 bg-amber-950/30 px-2 py-1 text-[10px] font-bold text-amber-200">{DEMO_STOCK_LABEL}</p>
          )}
          <MedicationDraftPanel
            audience="doctor"
            patientId={patient.uhid}
            patientName={patient.name}
            inventory={toStockItems(stock.items)}
          />
        </div>
      )}

      {/* TAB 3: Lab & Imaging */}
      {activeTab === "lab" && (
        <div className="space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-white">Laboratory & Imaging Studies on Record</h3>
          <div className="space-y-2 text-xs">
            <div className="dh-lift p-3 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-between gap-2">
              <div>
                <span className="font-bold text-white">Complete Blood Count (CBC)</span>
                <p className="text-[11px] text-white/55">Platelets: 82,000/uL • WBC: 14,800/uL • Hb: 13.2 g/dL</p>
              </div>
              <Badge tone="red">Critical Value</Badge>
            </div>
            <div className="dh-lift p-3 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-between gap-2">
              <div>
                <span className="font-bold text-white">USG Whole Abdomen & Pelvis</span>
                <p className="text-[11px] text-white/55">6.2 mm calculus in Gallbladder neck. Mild hepatomegaly.</p>
              </div>
              <Badge tone="green">Verified</Badge>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Ward Telemetry */}
      {activeTab === "ward" && (
        <div className="space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-white">Continuous Ward / ICU Telemetry</h3>
          <p className="text-xs text-white/70">Continuous 12-lead ECG, waveform plethysmography, and ventilator loop active on Bed {patient.bed}.</p>
          <div className="p-3 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-between text-xs text-white/80">
            <span>Ventilator Synchronization</span>
            <Badge tone="cyan">Spontaneous Breathing (CPAP)</Badge>
          </div>
        </div>
      )}

      {/* TAB 5: Discharge Desk */}
      {activeTab === "discharge" && (
        <div className="space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-white">Automated WHO/MCI Discharge Summary</h3>
          <p className="text-xs text-white/70">Auto-synthesized discharge document with ICD-10 coding and course in hospital.</p>
          <button
            type="button"
            onClick={() => onSaveDraft("discharge-summary", { patient: patient.name, uhid: patient.uhid, summary: "WHO/MCI discharge summary kept locally. No billing endpoint accepted it." })}
            className="dh-btn px-4 py-2 text-xs font-bold"
            style={{ ["--hud-accent" as any]: "#1d4ed8", background: "color-mix(in srgb, #7CC8FF 18%, transparent)" }}
          >
            Save draft on this computer
          </button>
        </div>
      )}
    </HudGlassPanel>
  );
}
