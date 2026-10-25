import { useState } from "react";
import { CheckCircle, Clock, Plus, Scissors, Sparkles, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { GlassCard, SectionTitle, Badge, Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, uid, sleep, nowTime } from "@/lib/utils";
import type { CDSProcedure, ProcStatus } from "@/lib/types";

const mockProcedures = (): Omit<CDSProcedure, "status" | "confirmedBy" | "confirmedAt" | "scheduledAt" | "completedAt">[] => [
  { id: uid("proc"), procedure: "Thoracentesis (diagnostic)", specialty: "Pulmonology", urgency: "urgent", reasoning: "Pleural effusion of unknown etiology — need fluid analysis for differential", preparation: ["USG marking", "Informed consent", "Check coagulation profile"], risks: ["Pneumothorax (5-10%)", "Hemothorax", "Infection", "Re-expansion pulmonary edema"], benefits: ["Diagnostic fluid analysis", "Therapeutic symptom relief"], alternatives: ["Diagnostic thoracentesis under CT guidance", "Medical thoracoscopy"] },
  { id: uid("proc"), procedure: "Central line insertion (IJV)", specialty: "Critical Care", urgency: "urgent", reasoning: "Need for central venous access for vasopressor therapy and CVP monitoring", preparation: ["USG-guided technique", "Strict asepsis", "Check platelet count"], risks: ["Arterial puncture", "Pneumothorax", "Air embolism", "Line-related sepsis"], benefits: ["Reliable IV access", "CVP monitoring", "Vasopressor delivery"], alternatives: ["Peripheral IV access with large bore", "Intraosseous access"] },
  { id: uid("proc"), procedure: "Lumbar puncture", specialty: "Neurology", urgency: "elective", reasoning: "Suspected meningitis — CSF analysis for culture and sensitivity", preparation: ["Check coagulation", "Positioning", "Informed consent"], risks: ["Post-dural puncture headache", "Infection", "Spinal hematoma"], benefits: ["Definitive diagnosis", "CSF pressure measurement"], alternatives: ["Empiric antibiotics without LP", "CT-guided LP"] },
];

export default function Procedures({ patientId, patientName }: { patientId: string; patientName: string }) {
  const { account } = useAuth();
  const { cdsProcedures, setCdsProcedures, logAudit } = useStore();
  const doctorName = account?.name ?? "Dr. Admin";
  const [procs, setProcs] = useState<CDSProcedure[]>(cdsProcedures);
  const [generating, setGenerating] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addProc, setAddProc] = useState("");
  const [addSpec, setAddSpec] = useState("");
  const [addUrgency, setAddUrgency] = useState<"elective" | "urgent" | "emergency">("elective");

  const sync = (d: CDSProcedure[]) => { setProcs(d); setCdsProcedures(d); };

  const generate = async () => {
    if (!patientId) { toast.error("Select a patient first"); return; }
    setGenerating(true);
    logAudit("Procedure suggestions requested", `Patient ${patientId}`, doctorName);
    await sleep(2000);
    const results: CDSProcedure[] = mockProcedures().map((p) => ({ ...p, status: "draft" as ProcStatus }));
    sync(results);
    setGenerating(false);
    logAudit("Procedures suggested", `${results.length} procedures recommended`, "CDS agent");
    toast.success("Procedure recommendations ready");
  };

  const updateStatus = (id: string, status: ProcStatus) => {
    const extra: Partial<CDSProcedure> = {};
    if (status === "confirmed") { extra.confirmedBy = doctorName; extra.confirmedAt = nowTime(); }
    if (status === "scheduled") extra.scheduledAt = nowTime();
    if (status === "completed") extra.completedAt = nowTime();
    sync(procs.map((p) => p.id === id ? { ...p, status, ...extra } : p));
    logAudit(`Procedure ${status}`, `${procs.find((p) => p.id === id)?.procedure}`, doctorName);
    toast.success(`Procedure ${status}`);
  };

  const removeProc = (id: string) => {
    sync(procs.filter((p) => p.id !== id));
    logAudit("Procedure removed", `${procs.find((p) => p.id === id)?.procedure}`, doctorName);
    toast.success("Procedure removed");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle title="Procedures" subtitle="Recommended procedures with preparation and risk assessment" />
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setAddOpen(true)}><Plus size={14} /> Custom</button>
          <button className="btn-neon" onClick={() => void generate()} disabled={!patientId || generating}>
            {generating ? <><span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" /> Generating…</> : <><Sparkles size={14} /> AI Suggest</>}
          </button>
        </div>
      </div>

      {procs.length === 0 && (
        <GlassCard>
          <p className="text-sm text-slate-500 text-center py-4">No procedures yet.</p>
        </GlassCard>
      )}

      <div className="space-y-3">
        {procs.map((p) => (
          <GlassCard key={p.id} className={cn(p.status === "completed" ? "border-emerald-400/30 opacity-70" : p.status === "cancelled" ? "border-red-400/30 opacity-50" : "")}>
            <div className="flex items-start gap-3">
              <Scissors size={16} className="text-violet-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-white">{p.procedure}</span>
                  <Badge tone="violet" className="!text-[8px]">{p.specialty}</Badge>
                  <Badge tone={p.urgency === "emergency" ? "red" : p.urgency === "urgent" ? "amber" : "neutral"} className="!text-[8px] uppercase">{p.urgency}</Badge>
                  <Badge tone={p.status === "completed" ? "green" : p.status === "cancelled" ? "red" : p.status === "confirmed" ? "cyan" : p.status === "scheduled" ? "amber" : "neutral"} className="!text-[8px]">{p.status}</Badge>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{p.reasoning}</p>
                {p.preparation.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {p.preparation.map((prep, i) => <Badge key={i} tone="cyan" className="!text-[8px]">{prep}</Badge>)}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {p.risks.length > 0 && <div><p className="text-[10px] font-semibold text-slate-500">Risks</p><p className="text-xs text-slate-400">{p.risks.join(", ")}</p></div>}
                  {p.benefits.length > 0 && <div><p className="text-[10px] font-semibold text-slate-500">Benefits</p><p className="text-xs text-slate-400">{p.benefits.join(", ")}</p></div>}
                </div>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                {p.status === "draft" && <button className="btn-neon !text-xs !py-1" onClick={() => updateStatus(p.id, "pending-confirmation")}><CheckCircle size={12} /> Proceed</button>}
                {p.status === "pending-confirmation" && <button className="btn-neon !text-xs !py-1" onClick={() => updateStatus(p.id, "confirmed")}><CheckCircle size={12} /> Confirm</button>}
                {p.status === "confirmed" && <button className="btn-ghost !text-xs !py-1" onClick={() => updateStatus(p.id, "scheduled")}><Clock size={12} /> Schedule</button>}
                {p.status === "scheduled" && <button className="btn-ghost !text-xs !py-1" onClick={() => updateStatus(p.id, "completed")}><CheckCircle size={12} /> Complete</button>}
                {p.status !== "completed" && p.status !== "cancelled" && (
                  <button className="btn-ghost !text-xs !py-1 hover:!border-red-400/50 hover:!text-red-300" onClick={() => updateStatus(p.id, "cancelled")}><XCircle size={12} /> Cancel</button>
                )}
                <button className="btn-ghost !text-xs !py-1" onClick={() => removeProc(p.id)}><Trash2 size={12} /> Remove</button>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Procedure">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1 block">Procedure</label>
            <input className="input-dark" placeholder="e.g. Bronchoscopy" value={addProc} onChange={(e) => setAddProc(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1 block">Specialty</label>
            <input className="input-dark" placeholder="e.g. Pulmonology" value={addSpec} onChange={(e) => setAddSpec(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1 block">Urgency</label>
            <select className="input-dark" value={addUrgency} onChange={(e) => setAddUrgency(e.target.value as "elective" | "urgent" | "emergency")}>
              <option value="elective">Elective</option>
              <option value="urgent">Urgent</option>
              <option value="emergency">Emergency</option>
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn-neon" onClick={() => {
              const p: CDSProcedure = { id: uid("proc"), procedure: addProc, specialty: addSpec, urgency: addUrgency, reasoning: "Manual — physician preference", preparation: [], risks: [], benefits: [], alternatives: [], status: "draft" };
              sync([...procs, p]);
              logAudit("Procedure added manually", `${p.procedure}`, doctorName);
              setAddOpen(false); setAddProc(""); setAddSpec("");
              toast.success("Procedure added");
            }}><Plus size={14} /> Add</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
