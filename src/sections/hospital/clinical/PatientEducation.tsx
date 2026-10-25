import { useState } from "react";
import { BookOpen, CheckCircle, Plus, Printer } from "lucide-react";
import { toast } from "sonner";
import { GlassCard, SectionTitle, Badge, Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, uid, nowTime } from "@/lib/utils";
import type { PatientEducationRecord } from "@/lib/types";

const educationTemplates = [
  { topic: "Diabetes Self-Management", content: "Monitor blood glucose before meals. Take medications as prescribed. Follow diabetic diet — limit sugars and refined carbs. Check feet daily for cuts. Attend follow-up every 3 months. Seek help if blood glucose > 250 mg/dL or < 70 mg/dL.", language: "English" },
  { topic: "Hypertension Education", content: "Take BP medications daily at same time. Limit salt intake to < 5g/day. Exercise 30 min daily. Monitor BP at home weekly. Report headaches, chest pain, or vision changes. Follow-up in 2 weeks for BP check.", language: "English" },
  { topic: "Post-Surgical Wound Care", content: "Keep wound dry for 48 hours. Change dressing daily. Watch for signs of infection: redness, swelling, discharge, fever > 100.4°F. No heavy lifting for 2 weeks. Take prescribed antibiotics complete course.", language: "English" },
  { topic: "Medication Adherence", content: "Take all medications exactly as prescribed. Use pill organizer. Set phone reminders. Do not skip doses. Do not double up missed doses. Refill before running out. Report side effects to doctor.", language: "English" },
];

export default function PatientEducation({ patientId, patientName }: { patientId: string; patientName: string }) {
  const { account } = useAuth();
  const { patientEducationRecords, setPatientEducationRecords, logAudit } = useStore();
  const doctorName = account?.name ?? "Dr. Admin";
  const [records, setRecords] = useState<PatientEducationRecord[]>(patientEducationRecords);
  const [addOpen, setAddOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [content, setContent] = useState("");
  const [language, setLanguage] = useState("English");
  const [templateOpen, setTemplateOpen] = useState(false);

  const sync = (d: PatientEducationRecord[]) => { setRecords(d); setPatientEducationRecords(d); };

  const addRecord = () => {
    if (!patientId) { toast.error("Select a patient first"); return; }
    if (!topic.trim() || !content.trim()) { toast.error("Enter topic and content"); return; }
    const r: PatientEducationRecord = {
      id: uid("pe"), patientId, patientName,
      topic: topic.trim(), content: content.trim(), language,
      providedBy: doctorName, providedAt: nowTime(), understood: false, notes: "",
    };
    sync([r, ...records]);
    logAudit("Patient education recorded", `${r.topic} for ${patientId}`, doctorName);
    setAddOpen(false); setTopic(""); setContent("");
    toast.success("Education record saved");
  };

  const useTemplate = (t: typeof educationTemplates[0]) => {
    setTopic(t.topic); setContent(t.content); setLanguage(t.language);
    setTemplateOpen(false); setAddOpen(true);
  };

  const markUnderstood = (id: string) => {
    sync(records.map((r) => r.id === id ? { ...r, understood: true } : r));
    logAudit("Patient understanding confirmed", `${records.find((r) => r.id === id)?.topic}`, doctorName);
    toast.success("Marked as understood");
  };

  const handlePrint = () => {
    logAudit("Education materials printed", `Patient ${patientId}`, doctorName);
    window.print();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle title="Patient Education" subtitle="Record and track patient education delivery" />
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setTemplateOpen(true)}><BookOpen size={14} /> Templates</button>
          <button className="btn-neon" onClick={() => setAddOpen(true)} disabled={!patientId}><Plus size={14} /> New Record</button>
        </div>
      </div>

      {records.filter((r) => r.patientId === patientId).length === 0 && (
        <GlassCard>
          <p className="text-sm text-slate-500 text-center py-4">No education records for this patient.</p>
        </GlassCard>
      )}

      <div className="space-y-2">
        {records.filter((r) => r.patientId === patientId).map((r) => (
          <GlassCard key={r.id} className={cn("!p-3", r.understood ? "border-emerald-400/30" : "")}>
            <div className="flex items-start gap-3">
              <BookOpen size={16} className="text-cyan-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-white">{r.topic}</span>
                  <Badge tone="violet" className="!text-[8px]">{r.language}</Badge>
                  {r.understood && <Badge tone="green">Understood ✓</Badge>}
                </div>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">{r.content}</p>
                <p className="text-[10px] text-slate-500 mt-1">Provided by {r.providedBy} at {r.providedAt}</p>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                {!r.understood && (
                  <button className="btn-ghost !text-xs !py-1" onClick={() => markUnderstood(r.id)}>
                    <CheckCircle size={12} /> Confirm Understanding
                  </button>
                )}
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Patient Education Record">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1 block">Topic</label>
            <input className="input-dark" placeholder="e.g. Diabetes Self-Management" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1 block">Content</label>
            <textarea className="input-dark resize-none" rows={5} value={content} onChange={(e) => setContent(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1 block">Language</label>
            <select className="input-dark" value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="English">English</option>
              <option value="Hindi">Hindi</option>
              <option value="Tamil">Tamil</option>
              <option value="Telugu">Telugu</option>
              <option value="Malayalam">Malayalam</option>
              <option value="Kannada">Kannada</option>
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn-neon" onClick={addRecord}><Plus size={14} /> Save</button>
          </div>
        </div>
      </Modal>

      <Modal open={templateOpen} onClose={() => setTemplateOpen(false)} title="Education Templates" wide>
        <div className="space-y-2">
          {educationTemplates.map((t, i) => (
            <div key={i} className="rounded-lg border border-white/10 p-3 cursor-pointer hover:bg-white/[0.04]" onClick={() => useTemplate(t)}>
              <p className="text-sm font-semibold text-white">{t.topic}</p>
              <p className="text-xs text-slate-400 mt-1 line-clamp-2">{t.content}</p>
              <Badge tone="violet" className="!text-[8px] mt-1">{t.language}</Badge>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
