import { useState } from "react";
import { Users, Plus, Calendar, User, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { GlassCard, SectionTitle, Badge, Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, uid, nowTime } from "@/lib/utils";
import type { MDTEntry } from "@/lib/types";

export default function MDTModule({ patientId, patientName }: { patientId: string; patientName: string }) {
  const { account } = useAuth();
  const { mdtEntries, setMdtEntries, logAudit } = useStore();
  const doctorName = account?.name ?? "Dr. Admin";
  const [entries, setEntries] = useState<MDTEntry[]>(mdtEntries);
  const [addOpen, setAddOpen] = useState(false);
  const [diagnosis, setDiagnosis] = useState("");
  const [participants, setParticipants] = useState("");
  const [discussion, setDiscussion] = useState("");
  const [recommendations, setRecommendations] = useState("");
  const [decisions, setDecisions] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const sync = (d: MDTEntry[]) => { setEntries(d); setMdtEntries(d); };

  const addEntry = () => {
    if (!patientId) { toast.error("Select a patient first"); return; }
    if (!discussion.trim()) { toast.error("Enter discussion notes"); return; }
    const e: MDTEntry = {
      id: uid("mdt"), patientId, patientName, diagnosis,
      discussionDate: nowTime(),
      participants: participants.split(",").map((s) => s.trim()).filter(Boolean),
      discussion: discussion.trim(),
      recommendations: recommendations.split("\n").filter(Boolean),
      decisions: decisions.split("\n").filter(Boolean),
      createdBy: doctorName, createdAt: nowTime(),
    };
    sync([e, ...entries]);
    logAudit("MDT entry created", `Patient ${patientId} — ${e.participants.length} participants`, doctorName);
    setAddOpen(false); setDiagnosis(""); setParticipants(""); setDiscussion(""); setRecommendations(""); setDecisions("");
    toast.success("MDT discussion recorded");
  };

  const removeEntry = (id: string) => {
    sync(entries.filter((e) => e.id !== id));
    logAudit("MDT entry removed", `Patient ${patientId}`, doctorName);
    toast.success("Entry removed");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle title="Multi-Disciplinary Team" subtitle="Record MDT discussions and decisions" />
        <button className="btn-neon" onClick={() => setAddOpen(true)} disabled={!patientId}><Plus size={14} /> New MDT Entry</button>
      </div>

      {entries.filter((e) => e.patientId === patientId).length === 0 && (
        <GlassCard>
          <p className="text-sm text-slate-500 text-center py-4">No MDT entries for this patient.</p>
        </GlassCard>
      )}

      <div className="space-y-2">
        {entries.filter((e) => e.patientId === patientId).map((e) => (
          <GlassCard key={e.id} className="!p-3">
            <div className="flex items-start gap-3">
              <Users size={16} className="text-amber-400 mt-1 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-white">MDT — {e.discussionDate}</span>
                  {e.diagnosis && <Badge tone="violet" className="!text-[8px]">{e.diagnosis}</Badge>}
                  <span className="text-xs text-slate-500">by {e.createdBy}</span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {e.participants.map((p, i) => (
                    <Badge key={i} tone="cyan" className="!text-[8px]"><User size={8} className="inline mr-0.5" />{p}</Badge>
                  ))}
                </div>
                {expanded === e.id ? (
                  <div className="mt-2 space-y-2">
                    <div>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">Discussion</p>
                      <p className="text-xs text-slate-300">{e.discussion}</p>
                    </div>
                    {e.recommendations.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-slate-500 uppercase">Recommendations</p>
                        <ul className="list-disc list-inside text-xs text-slate-300 space-y-0.5">
                          {e.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                        </ul>
                      </div>
                    )}
                    {e.decisions.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-slate-500 uppercase">Decisions</p>
                        <ul className="list-disc list-inside text-xs text-slate-300 space-y-0.5">
                          {e.decisions.map((d, i) => <li key={i}>{d}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 mt-1 truncate">{e.discussion.slice(0, 120)}…</p>
                )}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <button className="btn-ghost !text-xs !py-1" onClick={() => setExpanded(expanded === e.id ? null : e.id)}>
                  {expanded === e.id ? "Collapse" : "Expand"}
                </button>
                <button className="btn-ghost !text-xs !py-1 hover:!border-red-400/50 hover:!text-red-300" onClick={() => removeEntry(e.id)}>Remove</button>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="New MDT Entry" wide>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Diagnosis</label>
              <input className="input-dark" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Participants (comma separated)</label>
              <input className="input-dark" placeholder="e.g. Dr. Smith (Surgery), Dr. Jones (Oncology)" value={participants} onChange={(e) => setParticipants(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Discussion</label>
              <textarea className="input-dark resize-none" rows={4} value={discussion} onChange={(e) => setDiscussion(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Recommendations (one per line)</label>
              <textarea className="input-dark resize-none" rows={3} value={recommendations} onChange={(e) => setRecommendations(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Decisions (one per line)</label>
              <textarea className="input-dark resize-none" rows={3} value={decisions} onChange={(e) => setDecisions(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn-neon" onClick={addEntry}><MessageSquare size={14} /> Record</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
