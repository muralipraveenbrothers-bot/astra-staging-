import { useState } from "react";
import { Activity, Plus, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { GlassCard, SectionTitle, Badge, Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, uid, nowTime } from "@/lib/utils";
import type { MonitoringPlan } from "@/lib/types";

export default function MonitoringModule({ patientId, patientName }: { patientId: string; patientName: string }) {
  const { account } = useAuth();
  const { monitoringPlans, setMonitoringPlans, logAudit } = useStore();
  const doctorName = account?.name ?? "Dr. Admin";
  const [plans, setPlans] = useState<MonitoringPlan[]>(monitoringPlans);
  const [addOpen, setAddOpen] = useState(false);
  const [param, setParam] = useState("");
  const [freq, setFreq] = useState("");
  const [target, setTarget] = useState("");
  const [alert, setAlert] = useState("");

  const sync = (d: MonitoringPlan[]) => { setPlans(d); setMonitoringPlans(d); };

  const addPlan = () => {
    if (!patientId) { toast.error("Select a patient first"); return; }
    if (!param.trim()) { toast.error("Enter parameter name"); return; }
    const p: MonitoringPlan = {
      id: uid("mp"), patientId, patientName,
      parameter: param.trim(), frequency: freq, target, alertThreshold: alert,
      status: "active", orderedBy: doctorName, createdAt: nowTime(),
    };
    sync([...plans, p]);
    logAudit("Monitoring plan added", `${p.parameter} ${p.frequency} for ${patientId}`, doctorName);
    setAddOpen(false); setParam(""); setFreq(""); setTarget(""); setAlert("");
    toast.success("Monitoring plan created");
  };

  const toggleStatus = (id: string) => {
    sync(plans.map((p) => p.id === id ? { ...p, status: p.status === "active" ? "discontinued" as const : "active" as const } : p));
    logAudit("Monitoring plan toggled", `${plans.find((p) => p.id === id)?.parameter}`, doctorName);
    toast.success("Status updated");
  };

  const removePlan = (id: string) => {
    sync(plans.filter((p) => p.id !== id));
    logAudit("Monitoring plan removed", `${plans.find((p) => p.id === id)?.parameter}`, doctorName);
    toast.success("Plan removed");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle title="Monitoring Plan" subtitle="Track patient parameters and alerts" />
        <button className="btn-neon" onClick={() => setAddOpen(true)} disabled={!patientId}><Plus size={14} /> Add Parameter</button>
      </div>

      {plans.filter((p) => p.patientId === patientId).length === 0 && (
        <GlassCard>
          <p className="text-sm text-slate-500 text-center py-4">No monitoring parameters set.</p>
        </GlassCard>
      )}

      <div className="space-y-2">
        {plans.filter((p) => p.patientId === patientId).map((p) => (
          <GlassCard key={p.id} className={cn("!p-3", p.status === "discontinued" ? "opacity-50" : "")}>
            <div className="flex items-start gap-3">
              <Activity size={16} className={cn("mt-0.5 shrink-0", p.status === "active" ? "text-emerald-400" : "text-slate-500")} />
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn("text-sm font-semibold", p.status === "discontinued" ? "text-slate-500 line-through" : "text-white")}>{p.parameter}</span>
                  {p.frequency && <Badge tone="violet" className="!text-[8px]">{p.frequency}</Badge>}
                  <Badge tone={p.status === "active" ? "green" : "neutral"} className="!text-[8px]">{p.status}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-1 text-xs text-slate-400">
                  {p.target && <span>Target: {p.target}</span>}
                  {p.alertThreshold && (
                    <span className="flex items-center gap-1 text-amber-300">
                      <AlertTriangle size={10} /> Alert: {p.alertThreshold}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">Ordered by {p.orderedBy} at {p.createdAt}</p>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button className="btn-ghost !text-xs !py-1" onClick={() => toggleStatus(p.id)}>
                  {p.status === "active" ? "Discontinue" : "Reactivate"}
                </button>
                <button className="btn-ghost !text-xs !py-1 hover:!border-red-400/50 hover:!text-red-300" onClick={() => removePlan(p.id)}>
                  <Trash2 size={12} /> Remove
                </button>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Monitoring Parameter">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1 block">Parameter</label>
            <input className="input-dark" placeholder="e.g. Blood Pressure, SpO2, GCS" value={param} onChange={(e) => setParam(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Frequency</label>
              <input className="input-dark" placeholder="e.g. Q4H, Daily" value={freq} onChange={(e) => setFreq(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Target Range</label>
              <input className="input-dark" placeholder="e.g. 120/80, >95%" value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1 block">Alert Threshold</label>
            <textarea className="input-dark resize-none" rows={2} placeholder="e.g. SBP < 90 or > 180, SpO2 < 92%" value={alert} onChange={(e) => setAlert(e.target.value)} />
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn-neon" onClick={addPlan}><Plus size={14} /> Add</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
