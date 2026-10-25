import { useState } from "react";
import { Ambulance, CheckCircle, Plus, Printer, Save } from "lucide-react";
import { toast } from "sonner";
import { GlassCard, SectionTitle, Badge, Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, uid, nowTime } from "@/lib/utils";
import type { DischargePlan } from "@/lib/types";

const emptyPlan = (): DischargePlan => ({
  id: uid("dp"), patientId: "", patientName: "", admissionDate: "",
  dischargeDate: "", diagnosis: "", proceduresPerformed: [],
  conditionAtDischarge: "", medicationsAtDischarge: "", followUpInstructions: "",
  followUpDate: "", dietaryAdvice: "", activityRestrictions: "", warningSignals: [],
  prescribedBy: "", status: "draft",
});

export default function DischargePlanning({ patientId, patientName }: { patientId: string; patientName: string }) {
  const { account } = useAuth();
  const { dischargePlans, setDischargePlans, logAudit, markDischarged } = useStore();
  const doctorName = account?.name ?? "Dr. Admin";
  const [plans, setPlans] = useState<DischargePlan[]>(dischargePlans);
  const [editPlan, setEditPlan] = useState<DischargePlan>(emptyPlan());
  const [editOpen, setEditOpen] = useState(false);
  const [detailPlan, setDetailPlan] = useState<DischargePlan | null>(null);

  const sync = (d: DischargePlan[]) => { setPlans(d); setDischargePlans(d); };

  const openNew = () => {
    if (!patientId) { toast.error("Select a patient first"); return; }
    setEditPlan({ ...emptyPlan(), patientId, patientName, prescribedBy: doctorName });
    setEditOpen(true);
  };

  const openEdit = (p: DischargePlan) => {
    setEditPlan({ ...p });
    setEditOpen(true);
  };

  const savePlan = () => {
    if (!editPlan.diagnosis.trim()) { toast.error("Enter discharge diagnosis"); return; }
    const exists = plans.find((p) => p.id === editPlan.id);
    if (exists) {
      sync(plans.map((p) => p.id === editPlan.id ? editPlan : p));
      logAudit("Discharge plan updated", `Patient ${patientId}`, doctorName);
    } else {
      const plan: DischargePlan = { ...editPlan, id: uid("dp") };
      sync([plan, ...plans]);
      logAudit("Discharge plan created", `Patient ${patientId}: ${plan.diagnosis}`, doctorName);
    }
    setEditOpen(false);
    toast.success("Discharge plan saved");
  };

  const finalizePlan = () => {
    if (!editPlan.id || !editPlan.diagnosis.trim()) { toast.error("Complete the discharge plan first"); return; }
    sync(plans.map((p) => p.id === editPlan.id ? { ...p, status: "finalized" as const } : p));
    logAudit("Discharge plan finalized", `Patient ${patientId}: ${editPlan.diagnosis}`, doctorName);
    setEditPlan({ ...editPlan, status: "finalized" });
    setEditOpen(false);
    toast.success("Discharge plan finalized");
  };

  const dischargePatient = (plan: DischargePlan) => {
    sync(plans.map((p) => p.id === plan.id ? { ...p, status: "discharged" as const, dischargeDate: nowTime() } : p));
    markDischarged({ patientId: plan.patientId, dischargedAt: nowTime(), diagnosis: plan.diagnosis, followUpDate: plan.followUpDate });
    logAudit("Patient discharged", `Patient ${plan.patientId}: ${plan.diagnosis}`, doctorName);
    toast.success("Patient discharged");
  };

  const handlePrint = () => {
    logAudit("Discharge summary printed", `Patient ${patientId}`, doctorName);
    window.print();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle title="Discharge Planning" subtitle="Create and manage discharge summaries" />
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={handlePrint} disabled={plans.length === 0}><Printer size={14} /> Print</button>
          <button className="btn-neon" onClick={openNew} disabled={!patientId}><Plus size={14} /> New Plan</button>
        </div>
      </div>

      {plans.filter((p) => p.patientId === patientId).length === 0 && (
        <GlassCard>
          <p className="text-sm text-slate-500 text-center py-4">No discharge plans for this patient.</p>
        </GlassCard>
      )}

      <div className="space-y-2">
        {plans.filter((p) => p.patientId === patientId).map((p) => (
          <GlassCard key={p.id} className={cn("!p-3", p.status === "discharged" ? "border-emerald-400/30 opacity-70" : "")}>
            <div className="flex items-start gap-3">
              <Ambulance size={16} className="text-amber-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-white">DC: {p.diagnosis || "—"}</span>
                  <Badge tone={p.status === "discharged" ? "green" : p.status === "finalized" ? "cyan" : p.status === "pending-review" ? "amber" : "neutral"} className="!text-[8px]">{p.status}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1 text-xs text-slate-400">
                  {p.admissionDate && <span>Admitted: {p.admissionDate}</span>}
                  {p.dischargeDate && <span>Discharged: {p.dischargeDate}</span>}
                  {p.conditionAtDischarge && <span className="col-span-2">Condition: {p.conditionAtDischarge}</span>}
                </div>
                {p.followUpDate && <p className="text-xs text-cyan-300 mt-0.5">Follow-up: {p.followUpDate}</p>}
                {p.warningSignals.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {p.warningSignals.map((w, i) => <Badge key={i} tone="red" className="!text-[8px]">{w}</Badge>)}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                {p.status !== "discharged" && (
                  <button className="btn-ghost !text-xs !py-1" onClick={() => openEdit(p)}>Edit</button>
                )}
                {p.status === "finalized" && (
                  <button className="btn-neon !text-xs !py-1" onClick={() => dischargePatient(p)}>
                    <CheckCircle size={12} /> Discharge
                  </button>
                )}
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Discharge Plan" wide>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Diagnosis at Discharge</label>
              <input className="input-dark" value={editPlan.diagnosis} onChange={(e) => setEditPlan({ ...editPlan, diagnosis: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Admission Date</label>
              <input className="input-dark" type="date" value={editPlan.admissionDate} onChange={(e) => setEditPlan({ ...editPlan, admissionDate: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Discharge Date</label>
              <input className="input-dark" type="date" value={editPlan.dischargeDate} onChange={(e) => setEditPlan({ ...editPlan, dischargeDate: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Procedures Performed (comma separated)</label>
              <input className="input-dark" placeholder="e.g. Laparoscopic cholecystectomy" value={editPlan.proceduresPerformed.join(", ")} onChange={(e) => setEditPlan({ ...editPlan, proceduresPerformed: e.target.value.split(",").map((s) => s.trim()) })} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Condition at Discharge</label>
              <textarea className="input-dark resize-none" rows={2} value={editPlan.conditionAtDischarge} onChange={(e) => setEditPlan({ ...editPlan, conditionAtDischarge: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Medications at Discharge</label>
              <textarea className="input-dark resize-none" rows={2} value={editPlan.medicationsAtDischarge} onChange={(e) => setEditPlan({ ...editPlan, medicationsAtDischarge: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Follow-up Instructions</label>
              <textarea className="input-dark resize-none" rows={2} value={editPlan.followUpInstructions} onChange={(e) => setEditPlan({ ...editPlan, followUpInstructions: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Follow-up Date</label>
              <input className="input-dark" type="date" value={editPlan.followUpDate} onChange={(e) => setEditPlan({ ...editPlan, followUpDate: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Prescribed By</label>
              <input className="input-dark" value={editPlan.prescribedBy} onChange={(e) => setEditPlan({ ...editPlan, prescribedBy: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Dietary Advice</label>
              <textarea className="input-dark resize-none" rows={2} value={editPlan.dietaryAdvice} onChange={(e) => setEditPlan({ ...editPlan, dietaryAdvice: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Activity Restrictions</label>
              <textarea className="input-dark resize-none" rows={2} value={editPlan.activityRestrictions} onChange={(e) => setEditPlan({ ...editPlan, activityRestrictions: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Warning Signals (comma separated)</label>
              <input className="input-dark" placeholder="e.g. Fever > 100.4°F, Wound redness, Chest pain" value={editPlan.warningSignals.join(", ")} onChange={(e) => setEditPlan({ ...editPlan, warningSignals: e.target.value.split(",").map((s) => s.trim()) })} />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button className="btn-ghost" onClick={() => setEditOpen(false)}>Cancel</button>
            <button className="btn-ghost" onClick={savePlan}><Save size={14} /> Save Draft</button>
            <button className="btn-neon" onClick={finalizePlan}><CheckCircle size={14} /> Finalize</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
