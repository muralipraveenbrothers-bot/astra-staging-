import { useState } from "react";
import { BedDouble, CheckCircle, DoorOpen, Plus, Printer, Save, XCircle } from "lucide-react";
import { toast } from "sonner";
import { GlassCard, SectionTitle, Badge, Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, uid, nowTime } from "@/lib/utils";
import type { AdmissionDecision, RiskLevel } from "@/lib/types";

const emptyAdmission = (): AdmissionDecision => ({
  id: uid("adm"), patientId: "", patientName: "", diagnosis: "",
  severity: "moderate", recommendedWard: "General Ward",
  admittingDoctor: "", expectedStay: "", reason: "",
  status: "draft",
});

export default function AdmissionDecisionComp({ patientId, patientName }: { patientId: string; patientName: string }) {
  const { account } = useAuth();
  const { admissionDecisions, setAdmissionDecisions, logAudit } = useStore();
  const doctorName = account?.name ?? "Dr. Admin";
  const [decisions, setDecisions] = useState<AdmissionDecision[]>(admissionDecisions);
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState<AdmissionDecision>(emptyAdmission());

  const sync = (d: AdmissionDecision[]) => { setDecisions(d); setAdmissionDecisions(d); };

  const openNew = () => {
    if (!patientId) { toast.error("Select a patient first"); return; }
    setEdit({ ...emptyAdmission(), patientId, patientName, admittingDoctor: doctorName });
    setEditOpen(true);
  };

  const saveDecision = () => {
    if (!edit.diagnosis.trim()) { toast.error("Enter diagnosis"); return; }
    const exists = decisions.find((d) => d.id === edit.id);
    if (exists) {
      sync(decisions.map((d) => d.id === edit.id ? { ...edit } : d));
    } else {
      const ad: AdmissionDecision = { ...edit, id: uid("adm") };
      sync([...decisions, ad]);
    }
    logAudit("Admission decision saved", `Patient ${patientId}: ${edit.diagnosis} → ${edit.recommendedWard}`, doctorName);
    setEditOpen(false);
    toast.success("Admission decision saved");
  };

  const advance = (id: string) => {
    const d = decisions.find((x) => x.id === id);
    if (!d) return;
    const next = d.status === "draft" ? "pending-confirmation" as const : d.status === "pending-confirmation" ? "admitted" as const : "transferred" as const;
    sync(decisions.map((x) => x.id === id ? { ...x, status: next, confirmedBy: next === "pending-confirmation" ? doctorName : x.confirmedBy, confirmedAt: next === "pending-confirmation" ? nowTime() : x.confirmedAt, admittedAt: next === "admitted" ? nowTime() : x.admittedAt } : x));
    logAudit(`Admission ${next}`, `Patient ${patientId}`, doctorName);
    toast.success(`Decision: ${next}`);
  };

  const wardColor = (s: RiskLevel) => s === "critical" ? "red" : s === "high" ? "amber" : s === "moderate" ? "cyan" : "green";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle title="Admission Decision" subtitle="Assess and document admission recommendations" />
        <button className="btn-neon" onClick={openNew} disabled={!patientId}><Plus size={14} /> New Decision</button>
      </div>

      {decisions.filter((d) => d.patientId === patientId).length === 0 && (
        <GlassCard>
          <p className="text-sm text-slate-500 text-center py-4">No admission decisions for this patient.</p>
        </GlassCard>
      )}

      <div className="space-y-2">
        {decisions.filter((d) => d.patientId === patientId).map((d) => (
          <GlassCard key={d.id} className={cn("!p-3", d.status === "discharged" ? "opacity-60" : "")}>
            <div className="flex items-start gap-3">
              <DoorOpen size={16} className="text-amber-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-white">Admission: {d.patientName || patientName}</span>
                  <Badge tone={wardColor(d.severity)} className="!text-[8px] uppercase">{d.severity}</Badge>
                  <Badge tone={d.status === "admitted" ? "green" : d.status === "discharged" ? "neutral" : d.status === "transferred" ? "cyan" : d.status === "pending-confirmation" ? "amber" : "neutral"} className="!text-[8px]">{d.status}</Badge>
                </div>
                <p className="text-xs text-slate-300 mt-0.5"><strong>Dx:</strong> {d.diagnosis}</p>
                <p className="text-xs text-slate-400">Ward: {d.recommendedWard} · Expected stay: {d.expectedStay || "—"}</p>
                <p className="text-xs text-slate-400">Reason: {d.reason}</p>
                {d.confirmedBy && <p className="text-[10px] text-slate-500">Confirmed by {d.confirmedBy} at {d.confirmedAt}</p>}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button className="btn-ghost !text-xs !py-1" onClick={() => { setEdit(d); setEditOpen(true); }}>Edit</button>
                {d.status === "draft" && <button className="btn-neon !text-xs !py-1" onClick={() => advance(d.id)}><CheckCircle size={12} /> Confirm</button>}
                {d.status === "pending-confirmation" && <button className="btn-ghost !text-xs !py-1" onClick={() => advance(d.id)}><BedDouble size={12} /> Admit</button>}
                {d.status === "admitted" && <button className="btn-ghost !text-xs !py-1" onClick={() => advance(d.id)}>Transfer</button>}
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Admission Decision">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Diagnosis</label>
              <input className="input-dark" value={edit.diagnosis} onChange={(e) => setEdit({ ...edit, diagnosis: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Severity</label>
              <select className="input-dark" value={edit.severity} onChange={(e) => setEdit({ ...edit, severity: e.target.value as RiskLevel })}>
                <option value="low">Low</option>
                <option value="moderate">Moderate</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Recommended Ward</label>
              <select className="input-dark" value={edit.recommendedWard} onChange={(e) => setEdit({ ...edit, recommendedWard: e.target.value })}>
                <option value="General Ward">General Ward</option>
                <option value="Semi-private">Semi-private</option>
                <option value="ICU">ICU</option>
                <option value="ICU step-down">ICU step-down</option>
                <option value="HDU">HDU</option>
                <option value="Private Room">Private Room</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Admitting Doctor</label>
              <input className="input-dark" value={edit.admittingDoctor} onChange={(e) => setEdit({ ...edit, admittingDoctor: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Expected Stay</label>
              <input className="input-dark" placeholder="e.g. 3-5 days" value={edit.expectedStay} onChange={(e) => setEdit({ ...edit, expectedStay: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Reason for Admission</label>
              <textarea className="input-dark resize-none" rows={3} value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn-ghost" onClick={() => setEditOpen(false)}>Cancel</button>
            <button className="btn-neon" onClick={saveDecision}><Save size={14} /> Save</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
