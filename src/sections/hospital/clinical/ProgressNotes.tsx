import { useState } from "react";
import { FileText, Plus, Printer, Save, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { GlassCard, SectionTitle, Badge, Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, uid, nowTime } from "@/lib/utils";
import type { ProgressNote, NoteStatus } from "@/lib/types";

export default function ProgressNotes({ patientId, patientName }: { patientId: string; patientName: string }) {
  const { account } = useAuth();
  const { progressNotes, setProgressNotes, logAudit } = useStore();
  const doctorName = account?.name ?? "Dr. Admin";
  const [notes, setNotes] = useState<ProgressNote[]>(progressNotes);
  const [subjective, setSubjective] = useState("");
  const [objective, setObjective] = useState("");
  const [assessment, setAssessment] = useState("");
  const [plan, setPlan] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const sync = (d: ProgressNote[]) => { setNotes(d); setProgressNotes(d); };

  const saveNote = (finalize = false) => {
    if (!patientId) { toast.error("Select a patient first"); return; }
    if (!subjective.trim() && !objective.trim()) { toast.error("Enter at least subjective or objective"); return; }
    if (editId) {
      sync(notes.map((n) => n.id === editId ? { ...n, subjective, objective, assessment, plan, updatedAt: nowTime(), status: finalize ? "finalized" as NoteStatus : n.status } : n));
      logAudit("Progress note updated", `Patient ${patientId}`, doctorName);
    } else {
      const n: ProgressNote = {
        id: uid("pnote"), patientId, subjective, objective, assessment, plan,
        doctor: doctorName, createdAt: nowTime(), updatedAt: nowTime(),
        status: finalize ? "finalized" as NoteStatus : "draft" as NoteStatus,
      };
      sync([n, ...notes]);
      logAudit("Progress note created", `Patient ${patientId} — status: ${n.status}`, doctorName);
    }
    setEditId(null); setSubjective(""); setObjective(""); setAssessment(""); setPlan("");
    toast.success(finalize ? "Note finalized" : "Draft saved");
  };

  const editNote = (n: ProgressNote) => {
    setEditId(n.id); setSubjective(n.subjective); setObjective(n.objective);
    setAssessment(n.assessment); setPlan(n.plan);
  };

  return (
    <div className="space-y-4">
      <SectionTitle title="Progress Notes" subtitle="SOAP-format clinical progress documentation" />

      <GlassCard>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1 block">Subjective (S)</label>
            <textarea className="input-dark resize-none" rows={2} placeholder="Patient's reported symptoms, concerns…" value={subjective} onChange={(e) => setSubjective(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1 block">Objective (O)</label>
            <textarea className="input-dark resize-none" rows={2} placeholder="Vitals, exam findings, lab results…" value={objective} onChange={(e) => setObjective(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1 block">Assessment (A)</label>
            <textarea className="input-dark resize-none" rows={2} placeholder="Clinical impression, problem list updates…" value={assessment} onChange={(e) => setAssessment(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1 block">Plan (P)</label>
            <textarea className="input-dark resize-none" rows={2} placeholder="Treatment plan, investigations, follow-up…" value={plan} onChange={(e) => setPlan(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={() => saveNote(false)} disabled={!patientId}><Save size={14} /> Save Draft</button>
            <button className="btn-neon" onClick={() => saveNote(true)} disabled={!patientId}><CheckCircle size={14} /> Finalize</button>
          </div>
        </div>
      </GlassCard>

      <div className="space-y-2">
        {notes.filter((n) => n.patientId === patientId || !patientId).length === 0 && (
          <GlassCard><p className="text-sm text-slate-500 text-center py-4">No progress notes yet.</p></GlassCard>
        )}
        {notes.filter((n) => n.patientId === patientId || !patientId).map((n) => (
          <GlassCard key={n.id} className="!p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-cyan-400" />
                  <span className="text-xs text-slate-500 font-mono">{n.createdAt}</span>
                  <Badge tone={n.status === "finalized" ? "green" : "amber"} className="!text-[8px]">{n.status}</Badge>
                  <span className="text-xs text-slate-500">by {n.doctor}</span>
                </div>
                {expanded === n.id ? (
                  <div className="mt-2 space-y-2 text-xs">
                    {n.subjective && <div><span className="font-semibold text-slate-400">S:</span> <span className="text-slate-300">{n.subjective}</span></div>}
                    {n.objective && <div><span className="font-semibold text-slate-400">O:</span> <span className="text-slate-300">{n.objective}</span></div>}
                    {n.assessment && <div><span className="font-semibold text-slate-400">A:</span> <span className="text-slate-300">{n.assessment}</span></div>}
                    {n.plan && <div><span className="font-semibold text-slate-400">P:</span> <span className="text-slate-300">{n.plan}</span></div>}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 mt-1 truncate">{n.subjective || n.objective || "(empty)"}</p>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                {n.status === "draft" && (
                  <button className="btn-ghost !text-xs !py-1" onClick={() => editNote(n)}>Edit</button>
                )}
                <button className="btn-ghost !text-xs !py-1" onClick={() => setExpanded(expanded === n.id ? null : n.id)}>
                  {expanded === n.id ? "Collapse" : "Expand"}
                </button>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
