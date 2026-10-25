import { useState } from "react";
import { Beef, Calendar, CheckCircle, Clock, ClipboardList, Plus, Printer, Save, User, XCircle } from "lucide-react";
import { toast } from "sonner";
import { GlassCard, SectionTitle, Badge, Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, uid, nowTime } from "@/lib/utils";
import type { SurgicalPlan } from "@/lib/types";

const emptyPlan = (): SurgicalPlan => ({
  id: uid("sp"), procedure: "", surgeon: "", assistantSurgeon: "",
  anaesthetist: "", date: "", time: "", theatre: "",
  side: "n/a", approach: "", preoperativePreparation: [],
  intraoperativePlan: "", postoperativePlan: "", implants: [],
  specialEquipment: [], bloodRequired: false, bloodUnits: 0,
  consentObtained: false, status: "draft", createdBy: "", createdAt: nowTime(),
});

export default function SurgicalPlanning({ patientId, patientName }: { patientId: string; patientName: string }) {
  const { account } = useAuth();
  const { surgicalPlans, setSurgicalPlans, logAudit } = useStore();
  const doctorName = account?.name ?? "Dr. Admin";
  const [plans, setPlans] = useState<SurgicalPlan[]>(surgicalPlans);
  const [editPlan, setEditPlan] = useState<SurgicalPlan>(emptyPlan());
  const [editOpen, setEditOpen] = useState(false);
  const [detailPlan, setDetailPlan] = useState<SurgicalPlan | null>(null);

  const sync = (d: SurgicalPlan[]) => { setPlans(d); setSurgicalPlans(d); };

  const openNew = () => {
    setEditPlan({ ...emptyPlan(), createdBy: doctorName, createdAt: nowTime() });
    setEditOpen(true);
  };

  const openEdit = (p: SurgicalPlan) => {
    setEditPlan({ ...p });
    setEditOpen(true);
  };

  const savePlan = () => {
    if (!editPlan.procedure.trim()) { toast.error("Enter procedure name"); return; }
    const exists = plans.find((p) => p.id === editPlan.id);
    if (exists) {
      sync(plans.map((p) => p.id === editPlan.id ? editPlan : p));
      logAudit("Surgical plan updated", `${editPlan.procedure} for ${patientId}`, doctorName);
    } else {
      const plan = { ...editPlan, id: uid("sp"), createdAt: nowTime() };
      sync([...plans, plan]);
      logAudit("Surgical plan created", `${plan.procedure} for ${patientId}`, doctorName);
    }
    setEditOpen(false);
    toast.success("Surgical plan saved");
  };

  const advanceStatus = (id: string) => {
    const p = plans.find((x) => x.id === id);
    if (!p) return;
    const next = p.status === "draft" ? "planned" as const : p.status === "planned" ? "scheduled" as const : p.status === "scheduled" ? "in-progress" as const : "completed" as const;
    sync(plans.map((x) => x.id === id ? { ...x, status: next } : x));
    logAudit("Surgical plan status advanced", `${p.procedure} → ${next}`, doctorName);
    toast.success(`Plan status: ${next}`);
  };

  const cancelPlan = (id: string) => {
    sync(plans.map((p) => p.id === id ? { ...p, status: "cancelled" as const } : p));
    logAudit("Surgical plan cancelled", `${plans.find((p) => p.id === id)?.procedure}`, doctorName);
    toast.success("Plan cancelled");
  };

  const handlePrint = () => {
    logAudit("Surgical plan printed", `Patient ${patientId}`, doctorName);
    window.print();
  };

  const statusColor = (s: string) =>
    s === "completed" ? "green" : s === "in-progress" ? "cyan" : s === "scheduled" ? "amber" : s === "cancelled" ? "red" : "neutral";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle title="Surgical Planning" subtitle="Pre-operative planning and scheduling" />
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={handlePrint} disabled={plans.length === 0}><Printer size={14} /> Print</button>
          <button className="btn-neon" onClick={openNew}><Plus size={14} /> New Plan</button>
        </div>
      </div>

      {plans.length === 0 && (
        <GlassCard>
          <p className="text-sm text-slate-500 text-center py-4">No surgical plans yet.</p>
        </GlassCard>
      )}

      <div className="space-y-2">
        {plans.map((p) => (
          <GlassCard key={p.id} className={cn("!p-3", p.status === "completed" ? "border-emerald-400/30" : p.status === "cancelled" ? "border-red-400/30 opacity-60" : "")}>
            <div className="flex items-start gap-3">
              <Beef size={16} className="text-violet-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-white">{p.procedure || "New surgical plan"}</span>
                  <Badge tone={statusColor(p.status)} className="!text-[8px] uppercase">{p.status}</Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 mt-1.5">
                  {p.surgeon && <p className="text-xs text-slate-400"><User size={10} className="inline mr-1" />Surgeon: {p.surgeon}</p>}
                  {p.date && <p className="text-xs text-slate-400"><Calendar size={10} className="inline mr-1" />{p.date}</p>}
                  {p.time && <p className="text-xs text-slate-400"><Clock size={10} className="inline mr-1" />{p.time}</p>}
                  {p.theatre && <p className="text-xs text-slate-400">{p.theatre}</p>}
                </div>
                {p.bloodRequired && <p className="text-xs text-red-300 mt-0.5">Blood: {p.bloodUnits} units required</p>}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button className="btn-ghost !text-xs !py-1" onClick={() => openEdit(p)}><ClipboardList size={12} /> Edit</button>
                {(p.status === "draft" || p.status === "planned") && <button className="btn-ghost !text-xs !py-1" onClick={() => advanceStatus(p.id)}><CheckCircle size={12} /> Advance</button>}
                {p.status !== "completed" && p.status !== "cancelled" && (
                  <button className="btn-ghost !text-xs !py-1 hover:!border-red-400/50 hover:!text-red-300" onClick={() => cancelPlan(p.id)}><XCircle size={12} /> Cancel</button>
                )}
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={editPlan.status === "draft" ? "New Surgical Plan" : "Edit Surgical Plan"} wide>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className="text-xs font-semibold text-slate-400 mb-1 block">Procedure</label><input className="input-dark" value={editPlan.procedure} onChange={(e) => setEditPlan({ ...editPlan, procedure: e.target.value })} /></div>
            <div><label className="text-xs font-semibold text-slate-400 mb-1 block">Surgeon</label><input className="input-dark" value={editPlan.surgeon} onChange={(e) => setEditPlan({ ...editPlan, surgeon: e.target.value })} /></div>
            <div><label className="text-xs font-semibold text-slate-400 mb-1 block">Assistant Surgeon</label><input className="input-dark" value={editPlan.assistantSurgeon} onChange={(e) => setEditPlan({ ...editPlan, assistantSurgeon: e.target.value })} /></div>
            <div><label className="text-xs font-semibold text-slate-400 mb-1 block">Anaesthetist</label><input className="input-dark" value={editPlan.anaesthetist} onChange={(e) => setEditPlan({ ...editPlan, anaesthetist: e.target.value })} /></div>
            <div><label className="text-xs font-semibold text-slate-400 mb-1 block">Side</label><select className="input-dark" value={editPlan.side} onChange={(e) => setEditPlan({ ...editPlan, side: e.target.value as "left" | "right" | "bilateral" | "n/a" })}><option value="n/a">N/A</option><option value="left">Left</option><option value="right">Right</option><option value="bilateral">Bilateral</option></select></div>
            <div><label className="text-xs font-semibold text-slate-400 mb-1 block">Approach</label><input className="input-dark" placeholder="e.g. Laparoscopic" value={editPlan.approach} onChange={(e) => setEditPlan({ ...editPlan, approach: e.target.value })} /></div>
            <div><label className="text-xs font-semibold text-slate-400 mb-1 block">Date</label><input className="input-dark" type="date" value={editPlan.date} onChange={(e) => setEditPlan({ ...editPlan, date: e.target.value })} /></div>
            <div><label className="text-xs font-semibold text-slate-400 mb-1 block">Time</label><input className="input-dark" type="time" value={editPlan.time} onChange={(e) => setEditPlan({ ...editPlan, time: e.target.value })} /></div>
            <div className="col-span-2"><label className="text-xs font-semibold text-slate-400 mb-1 block">Theatre</label><input className="input-dark" placeholder="e.g. OT-1" value={editPlan.theatre} onChange={(e) => setEditPlan({ ...editPlan, theatre: e.target.value })} /></div>
            <div className="col-span-2"><label className="text-xs font-semibold text-slate-400 mb-1 block">Pre-operative Preparation</label><input className="input-dark" placeholder="Comma separated" value={editPlan.preoperativePreparation.join(", ")} onChange={(e) => setEditPlan({ ...editPlan, preoperativePreparation: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></div>
            <div className="col-span-2"><label className="text-xs font-semibold text-slate-400 mb-1 block">Intra-operative Plan</label><textarea className="input-dark resize-none" rows={2} value={editPlan.intraoperativePlan} onChange={(e) => setEditPlan({ ...editPlan, intraoperativePlan: e.target.value })} /></div>
            <div className="col-span-2"><label className="text-xs font-semibold text-slate-400 mb-1 block">Post-operative Plan</label><textarea className="input-dark resize-none" rows={2} value={editPlan.postoperativePlan} onChange={(e) => setEditPlan({ ...editPlan, postoperativePlan: e.target.value })} /></div>
            <div className="col-span-2"><label className="text-xs font-semibold text-slate-400 mb-1 block">Implants / Special Equipment</label><input className="input-dark" placeholder="Comma separated" value={editPlan.implants.join(", ")} onChange={(e) => setEditPlan({ ...editPlan, implants: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></div>
            <div className="flex items-center gap-4 col-span-2">
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" className="accent-amber-400" checked={editPlan.bloodRequired} onChange={(e) => setEditPlan({ ...editPlan, bloodRequired: e.target.checked })} />
                Blood Required
              </label>
              {editPlan.bloodRequired && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">Units:</span>
                  <input className="input-dark !w-20" type="number" min={0} value={editPlan.bloodUnits} onChange={(e) => setEditPlan({ ...editPlan, bloodUnits: Number(e.target.value) })} />
                </div>
              )}
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input type="checkbox" className="accent-amber-400" checked={editPlan.consentObtained} onChange={(e) => setEditPlan({ ...editPlan, consentObtained: e.target.checked })} />
                Consent Obtained
              </label>
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button className="btn-ghost" onClick={() => setEditOpen(false)}>Cancel</button>
            <button className="btn-neon" onClick={savePlan}><Save size={14} /> Save Plan</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
