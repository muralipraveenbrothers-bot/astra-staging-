import { useState } from "react";
import { CheckCircle, ClipboardList, Eye, FlaskConical, Plus, RefreshCw, Sparkles, XCircle } from "lucide-react";
import { toast } from "sonner";
import { GlassCard, SectionTitle, Badge, Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, uid, sleep, nowTime } from "@/lib/utils";
import type { CDSInvestigation, InvCategory, OrderUrgency, InvStatus } from "@/lib/types";

const mockInvestigations = (): CDSInvestigation[] => [
  { id: uid("inv"), test: "Complete Blood Count", category: "lab", reasoning: "Evaluate for infection, anemia, and platelet status", priority: "routine", guidelineRef: "WHO Basic Lab Panel", status: "recommended" },
  { id: uid("inv"), test: "C-Reactive Protein", category: "lab", reasoning: "Quantitative inflammatory marker — guide antibiotic response", priority: "routine", guidelineRef: "IDSA Guidelines 2024", status: "recommended" },
  { id: uid("inv"), test: "Blood Cultures × 2 sets", category: "microbiology", reasoning: "Identify causative organism in suspected sepsis", priority: "urgent", guidelineRef: "SSC Guidelines 2023", status: "recommended" },
  { id: uid("inv"), test: "Chest X-ray PA view", category: "radiology", reasoning: "Evaluate for pneumonia, effusion, or mass lesion", priority: "urgent", guidelineRef: "BTS CAP Guidelines", status: "recommended" },
  { id: uid("inv"), test: "Lactate", category: "lab", reasoning: "Screen for tissue hypoperfusion in suspected sepsis", priority: "stat", guidelineRef: "SSC Hour-1 Bundle", status: "recommended" },
  { id: uid("inv"), test: "Urinalysis + Culture", category: "microbiology", reasoning: "Rule out UTI as source of fever", priority: "routine", guidelineRef: "IDSA UTI Guidelines", status: "recommended" },
];

const categoryColors: Record<InvCategory, "cyan" | "green" | "red" | "violet" | "neutral" | "amber"> = { lab: "violet", radiology: "cyan", pathology: "amber", microbiology: "green" };
const urgencyOrder: Record<OrderUrgency, number> = { stat: 0, urgent: 1, routine: 2 };

export default function Investigations({ patientId, patientName }: { patientId: string; patientName: string }) {
  const { account } = useAuth();
  const { cdsInvestigations, setCdsInvestigations, logAudit } = useStore();
  const doctorName = account?.name ?? "Dr. Admin";
  const [investigations, setInvestigations] = useState<CDSInvestigation[]>(cdsInvestigations);
  const [generating, setGenerating] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addTest, setAddTest] = useState("");
  const [addCat, setAddCat] = useState<InvCategory>("lab");
  const [addReason, setAddReason] = useState("");
  const [addPriority, setAddPriority] = useState<OrderUrgency>("routine");

  const sync = (d: CDSInvestigation[]) => { setInvestigations(d); setCdsInvestigations(d); };

  const generate = async () => {
    if (!patientId) { toast.error("Select a patient first"); return; }
    setGenerating(true);
    logAudit("Investigations suggested", `Patient ${patientId}`, doctorName);
    await sleep(1800);
    const results = mockInvestigations().sort((a, b) => urgencyOrder[a.priority] - urgencyOrder[b.priority]);
    sync(results);
    setGenerating(false);
    logAudit("Investigations generated", `${results.length} tests recommended`, "CDS agent");
    toast.success("Investigations ready");
  };

  const orderTest = (id: string) => {
    sync(investigations.map((i) => i.id === id ? { ...i, status: "ordered" as InvStatus } : i));
    logAudit("Test ordered", `${investigations.find((i) => i.id === id)?.test} ordered by ${doctorName}`, doctorName);
    toast.success("Test ordered");
  };

  const addCustom = () => {
    if (!addTest.trim()) return;
    const inv: CDSInvestigation = {
      id: uid("inv"), test: addTest.trim(), category: addCat,
      reasoning: addReason || "Manual — physician preference", priority: addPriority,
      guidelineRef: "Local protocol", status: "ordered",
    };
    sync([...investigations, inv]);
    logAudit("Custom investigation added", `${inv.test} (${inv.category})`, doctorName);
    setAddOpen(false); setAddTest(""); setAddReason("");
    toast.success("Investigation added");
  };

  const markResult = (id: string) => {
    sync(investigations.map((i) => i.id === id ? { ...i, status: "result-available" as InvStatus, resultAt: nowTime() } : i));
    logAudit("Result marked available", `${investigations.find((i) => i.id === id)?.test}`, doctorName);
    toast.success("Result noted");
  };

  const markReviewed = (id: string) => {
    sync(investigations.map((i) => i.id === id ? { ...i, status: "reviewed" as InvStatus, reviewedBy: doctorName, reviewedAt: nowTime() } : i));
    logAudit("Result reviewed", `${investigations.find((i) => i.id === id)?.test} reviewed by ${doctorName}`, doctorName);
    toast.success("Result reviewed");
  };

  const removeTest = (id: string) => {
    sync(investigations.filter((i) => i.id !== id));
    logAudit("Investigation removed", `${investigations.find((i) => i.id === id)?.test}`, doctorName);
    toast.success("Test removed");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle title="Investigations" subtitle="Recommended diagnostic workup with prioritization" />
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => setAddOpen(true)}><Plus size={14} /> Custom</button>
          <button className="btn-neon" onClick={() => void generate()} disabled={!patientId || generating}>
            {generating ? <><RefreshCw size={14} className="animate-spin" /> Suggesting…</> : <><Sparkles size={14} /> AI Suggest</>}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {investigations.sort((a, b) => urgencyOrder[a.priority] - urgencyOrder[b.priority]).map((inv) => (
          <GlassCard key={inv.id} className={cn("!p-3", inv.status === "reviewed" ? "opacity-60" : "")}>
            <div className="flex items-start gap-3">
              <FlaskConical size={16} className="text-violet-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={cn("text-sm font-semibold", inv.status === "reviewed" ? "text-slate-500 line-through" : "text-white")}>{inv.test}</span>
                  <Badge tone={categoryColors[inv.category]} className="!text-[8px]">{inv.category}</Badge>
                  <Badge tone={inv.priority === "stat" ? "red" : inv.priority === "urgent" ? "amber" : "neutral"} className="!text-[8px] uppercase">{inv.priority}</Badge>
                  <Badge tone={inv.status === "ordered" ? "cyan" : inv.status === "result-available" ? "green" : inv.status === "reviewed" ? "neutral" : "amber"} className="!text-[8px]">{inv.status}</Badge>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{inv.reasoning}</p>
                <p className="text-[10px] text-slate-500 mt-0.5 font-mono">Guideline: {inv.guidelineRef}</p>
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                {inv.status === "recommended" && (
                  <button className="btn-neon !text-xs !py-1" onClick={() => orderTest(inv.id)}><ClipboardList size={12} /> Order</button>
                )}
                {inv.status === "ordered" && (
                  <button className="btn-ghost !text-xs !py-1" onClick={() => markResult(inv.id)}><Eye size={12} /> Result</button>
                )}
                {inv.status === "result-available" && (
                  <button className="btn-ghost !text-xs !py-1" onClick={() => markReviewed(inv.id)}><CheckCircle size={12} /> Review</button>
                )}
                <button className="btn-ghost !text-xs !py-1 hover:!border-red-400/50 hover:!text-red-300" onClick={() => removeTest(inv.id)}><XCircle size={12} /> Remove</button>
              </div>
            </div>
          </GlassCard>
        ))}
        {investigations.length === 0 && !generating && (
          <GlassCard>
            <p className="text-sm text-slate-500 text-center py-4">No investigations yet. Use AI Suggest to generate a recommended diagnostic panel.</p>
          </GlassCard>
        )}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Investigation">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1 block">Test Name</label>
            <input className="input-dark" placeholder="e.g. HbA1c" value={addTest} onChange={(e) => setAddTest(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Category</label>
              <select className="input-dark" value={addCat} onChange={(e) => setAddCat(e.target.value as InvCategory)}>
                <option value="lab">Lab</option>
                <option value="radiology">Radiology</option>
                <option value="pathology">Pathology</option>
                <option value="microbiology">Microbiology</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Priority</label>
              <select className="input-dark" value={addPriority} onChange={(e) => setAddPriority(e.target.value as OrderUrgency)}>
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
                <option value="stat">STAT</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1 block">Reasoning</label>
            <textarea className="input-dark resize-none" rows={2} placeholder="Why this test?" value={addReason} onChange={(e) => setAddReason(e.target.value)} />
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn-neon" onClick={addCustom}><Plus size={14} /> Add</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
