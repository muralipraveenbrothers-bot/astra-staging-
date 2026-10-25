import { useEffect, useState } from "react";
import { Activity, BedDouble, FlaskConical, RefreshCw, Scissors } from "lucide-react";
import { HUD_PALETTE } from "@/components/CommandCenter/hudTokens";
import { HudGlassPanel } from "./hudBits";
import { apiFetch } from "@/services/apiFetch";

async function getJson(path: string): Promise<any> {
  const r = await apiFetch(path);
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
}

/**
 * Compact hospital-wide pulse: inpatients with open red flags, pending STAT
 * labs, and today's OT list. Read-only over the existing hospital APIs.
 */
export function HospitalPulseCard() {
  const [data, setData] = useState<{ redFlagIP: number; critLabs: number; otToday: number } | null>(null);
  const [updatedAt, setUpdatedAt] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    try {
      const [patientsJ, attentionJ, ordersJ, otJ] = await Promise.all([
        getJson("/api/hospital/patients"),
        getJson("/api/hospital/attention"),
        getJson("/api/hospital/orders"),
        getJson("/api/hospital/ot"),
      ]);
      const patients: any[] = patientsJ.patients ?? [];
      const attention: any[] = attentionJ.attentionItems ?? [];
      const orders: any[] = ordersJ.orders ?? [];
      const otCases: any[] = otJ.otCases ?? [];

      const openClinicalFlags = attention.filter(
        (a) => a.status !== "RESOLVED" && (a.severity === "critical" || a.severity === "high") && a.category === "clinical",
      );
      const flagUHIDs = new Set(openClinicalFlags.map((a) => a.uhid).filter(Boolean));
      const redFlagIP = patients.filter((p) => p.admissionStatus === "inpatient" && flagUHIDs.has(p.uhid)).length;

      const critLabs = orders.filter(
        (o) => o.category === "laboratory" && o.priority === "stat" && o.status !== "completed" && o.status !== "cancelled",
      ).length;

      const otToday = otCases.filter((c) => c.stage !== "transferred").length;

      setData({ redFlagIP, critLabs, otToday });
      setUpdatedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      setErr("");
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60000);
    return () => clearInterval(t);
  }, []);

  const tiles = [
    { label: "IP w/ Open Red Flags", value: data?.redFlagIP ?? "—", icon: BedDouble, color: (data?.redFlagIP ?? 0) > 0 ? "#b91c1c" : "#0f766e" },
    { label: "Pending STAT Labs", value: data?.critLabs ?? "—", icon: FlaskConical, color: (data?.critLabs ?? 0) > 0 ? "#b45309" : "#0f766e" },
    { label: "OT Cases Today", value: data?.otToday ?? "—", icon: Scissors, color: "#1d4ed8" },
  ];

  return (
    <HudGlassPanel accent={"#0f766e"} delay={60} lift={false} className="p-3" ariaLabel="Hospital pulse">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 text-white/80">
          <Activity className="w-3.5 h-3.5" style={{ color: "#0f766e" }} /> Hospital Pulse
        </div>
        <button type="button" onClick={refresh} aria-label="Refresh hospital pulse" className="dh-chip px-1.5 py-0.5 text-[9px] font-bold" style={{ ["--hud-accent" as any]: "#1d4ed8" }}>
          <RefreshCw className={`w-3 h-3 ${busy ? "animate-spin" : ""}`} />
        </button>
      </div>

      {err && <div className="text-[10px] text-rose-300 mb-2">{err} — retrying on next refresh</div>}

      <div className="grid grid-cols-3 gap-1.5">
        {tiles.map((t) => (
          <div key={t.label} className="px-2 py-2 rounded-lg border border-white/10 bg-black/25 text-center">
            <t.icon className="w-3.5 h-3.5 mx-auto mb-1" style={{ color: t.color }} />
            <div className="text-lg font-black leading-none text-white">{t.value}</div>
            <div className="text-[8px] font-bold uppercase tracking-wide text-white/45 mt-1 leading-tight">{t.label}</div>
          </div>
        ))}
      </div>

      {updatedAt && <div className="text-[8px] text-white/35 mt-1.5 text-right">live · updated {updatedAt}</div>}
    </HudGlassPanel>
  );
}
