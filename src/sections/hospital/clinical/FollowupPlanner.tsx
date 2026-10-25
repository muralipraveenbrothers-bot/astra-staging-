import { useState } from "react";
import { Calendar, HeartPulse, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { GlassCard, SectionTitle, Badge, Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, uid, nowTime } from "@/lib/utils";
import type { FollowUpPlan } from "@/lib/types";

export default function FollowupPlanner({ patientId, patientName }: { patientId: string; patientName: string }) {
  const { account } = useAuth();
  const { followUpPlans, setFollowUpPlans, logAudit } = useStore();
  const doctorName = account?.name ?? "Dr. Admin";
  const [plans, setPlans] = useState<FollowUpPlan[]>(followUpPlans);
  const [addOpen, setAddOpen] = useState(false);
  const [date, setDate] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [doctor, setDoctor] = useState("");
  const [reason, setReason] = useState("");
  const [investigations, setInvestigations] = useState("");
  const [notes, setNotes] = useState("");

  const sync = (d: FollowUpPlan[]) => { setPlans(d); setFollowUpPlans(d); };

  const addPlan = () => {
    if (!patientId) { toast.error("Select a patient first"); return; }
    if (!date || !specialty.trim()) { toast.error("Enter date and specialty"); return; }
    const p: FollowUpPlan = {
      id: uid("fup"), patientId, patientName,
      date, specialty: specialty.trim(), doctor: doctor, reason,
      investigationsOrdered: investigations.split(",").map((s) => s.trim()).filter(Boolean),
      status: "planned", notes, createdAt: nowTime(),
    };
    sync([p, ...plans]);
    logAudit("Follow-up planned", `${p.specialty} follow-up for ${patientId} on ${p.date}`, doctorName);
    setAddOpen(false); setDate(""); setSpecialty(""); setDoctor(""); setReason(""); setInvestigations(""); setNotes("");
    toast.success("Follow-up planned");
  };

  const updateStatus = (id: string, status: FollowUpPlan["status"]) => {
    sync(plans.map((p) => p.id === id ? { ...p, status } : p));
    logAudit(`Follow-up ${status}`, `${plans.find((p) => p.id === id)?.specialty}`, doctorName);
    toast.success(`Follow-up ${status}`);
  };

  const removePlan = (id: string) => {
    sync(plans.filter((p) => p.id !== id));
    logAudit("Follow-up removed", `${plans.find((p) => p.id === id)?.specialty}`, doctorName);
    toast.success("Follow-up removed");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle title="Follow-up Planner" subtitle="Schedule and track patient follow-up visits" />
        <button className="btn-neon" onClick={() => setAddOpen(true)} disabled={!patientId}><Plus size={14} /> New Follow-up</button>
      </div>

      {plans.filter((p) => p.patientId === patientId).length === 0 && (
        <GlassCard>
          <p className="text-sm text-slate-500 text-center py-4">No follow-up plans for this patient.</p>
        </GlassCard>
      )}

      <div className="space-y-2">
        {plans.filter((p) => p.patientId === patientId).map((p) => (
          <GlassCard key={p.id} className={cn("!p-3", p.status === "missed" || p.status === "cancelled" ? "opacity-50" : "")}>
            <div className="flex items-start gap-3">
              <HeartPulse size={16} className={cn("mt-0.5 shrink-0", p.status === "completed" ? "text-emerald-400" : "text-violet-400")} />
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-white">{p.specialty}</span>
                  <Badge tone="neutral" className="!text-[8px]"><Calendar size={10} className="inline mr-1" />{p.date}</Badge>
                  <Badge tone={p.status === "planned" ? "amber" : p.status === "completed" ? "green" : p.status === "missed" ? "red" : "neutral"} className="!text-[8px]">{p.status}</Badge>
                </div>
                {p.doctor && <p className="text-xs text-slate-400 mt-0.5">Doctor: {p.doctor}</p>}
                {p.reason && <p className="text-xs text-slate-400">Reason: {p.reason}</p>}
                {p.investigationsOrdered.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {p.investigationsOrdered.map((inv, i) => <Badge key={i} tone="cyan" className="!text-[8px]">{inv}</Badge>)}
                  </div>
                )}
                {p.notes && <p className="text-xs text-slate-400 mt-1">{p.notes}</p>}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                {p.status === "planned" && (
                  <>
                    <button className="btn-ghost !text-xs !py-1" onClick={() => updateStatus(p.id, "completed")}>Complete</button>
                    <button className="btn-ghost !text-xs !py-1 hover:!border-red-400/50 hover:!text-red-300" onClick={() => updateStatus(p.id, "missed")}>Missed</button>
                    <button className="btn-ghost !text-xs !py-1" onClick={() => updateStatus(p.id, "cancelled")}>Cancel</button>
                  </>
                )}
                <button className="btn-ghost !text-xs !py-1" onClick={() => removePlan(p.id)}><Trash2 size={12} /> Remove</button>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Schedule Follow-up">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Date</label>
              <input className="input-dark" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Specialty</label>
              <input className="input-dark" placeholder="e.g. Cardiology" value={specialty} onChange={(e) => setSpecialty(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1 block">Doctor</label>
            <input className="input-dark" placeholder="e.g. Dr. Smith" value={doctor} onChange={(e) => setDoctor(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1 block">Reason for Follow-up</label>
            <textarea className="input-dark resize-none" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1 block">Investigations Ordered (comma separated)</label>
            <input className="input-dark" placeholder="e.g. HbA1c, Lipid profile" value={investigations} onChange={(e) => setInvestigations(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1 block">Notes</label>
            <textarea className="input-dark resize-none" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn-neon" onClick={addPlan}><Plus size={14} /> Schedule</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
