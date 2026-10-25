import { useState } from "react";
import { Beaker, CheckCircle, ClipboardList, FileText, FlaskConical, Plus, Printer } from "lucide-react";
import { toast } from "sonner";
import { GlassCard, SectionTitle, Badge, Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, uid, nowTime } from "@/lib/utils";
import type { InvCategory, InvStatus, OrderUrgency } from "@/lib/types";

interface LabTest {
  id: string;
  test: string;
  category: string;
  sample: string;
  status: "ordered" | "collected" | "processing" | "completed";
  result?: string;
  reference: string;
  flag?: "normal" | "high" | "low" | "critical";
  orderedBy: string;
  orderedAt: string;
  collectedAt?: string;
  completedAt?: string;
}

export default function LaboratoryModule({ patientId, patientName }: { patientId: string; patientName: string }) {
  const { account } = useAuth();
  const { logAudit } = useStore();
  const doctorName = account?.name ?? "Dr. Admin";
  const [tests, setTests] = useState<LabTest[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addTest, setAddTest] = useState("");
  const [addCat, setAddCat] = useState("biochemistry");
  const [addSample, setAddSample] = useState("blood");

  const addNew = () => {
    if (!patientId) { toast.error("Select a patient first"); return; }
    if (!addTest.trim()) return;
    const t: LabTest = {
      id: uid("lab"), test: addTest.trim(), category: addCat, sample: addSample,
      status: "ordered", reference: "—", orderedBy: doctorName, orderedAt: nowTime(),
    };
    setTests((p) => [...p, t]);
    logAudit("Lab test ordered", `${t.test} (${t.category}) for ${patientId}`, doctorName);
    setAddOpen(false); setAddTest("");
    toast.success("Lab test ordered");
  };

  const advanceStatus = (id: string) => {
    setTests((p) =>
      p.map((t) => {
        if (t.id !== id) return t;
        const next = t.status === "ordered" ? "collected" as const : t.status === "collected" ? "processing" as const : "completed" as const;
        return { ...t, status: next, collectedAt: next === "collected" ? nowTime() : t.collectedAt, completedAt: next === "completed" ? nowTime() : t.completedAt };
      })
    );
    const test = tests.find((t) => t.id === id);
    logAudit("Lab status advanced", `${test?.test} → ${test?.status}`, doctorName);
    toast.success("Status updated");
  };

  const setResult = (id: string) => {
    const test = tests.find((t) => t.id === id);
    if (!test) return;
    const mockResults: Record<string, { result: string; flag: "normal" | "high" | "low" | "critical" }> = {
      "CBC": { result: "Hb 13.2, WBC 11.4, Plt 245", flag: "high" },
      "CRP": { result: "CRP 45 mg/L", flag: "high" },
      "Glucose": { result: "108 mg/dL", flag: "high" },
      "Creatinine": { result: "2.4 mg/dL", flag: "critical" },
    };
    const mock = mockResults[test.test] || { result: `${(Math.random() * 100).toFixed(1)} (simulated)`, flag: "normal" as const };
    setTests((p) =>
      p.map((t) => t.id === id ? { ...t, result: mock.result, flag: mock.flag, status: "completed" as const, completedAt: nowTime() } : t)
    );
    logAudit("Lab result entered", `${test.test}: ${mock.result}`, doctorName);
    toast.success("Result recorded");
  };

  const handlePrint = () => {
    logAudit("Lab report printed", `Patient ${patientId}`, doctorName);
    window.print();
  };

  const flagColor = (f?: string) =>
    f === "critical" ? "red" : f === "high" ? "amber" : f === "low" ? "cyan" : "neutral";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle title="Laboratory" subtitle="Order and review lab investigations" />
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={handlePrint} disabled={tests.length === 0}><Printer size={14} /> Print</button>
          <button className="btn-neon" onClick={() => setAddOpen(true)} disabled={!patientId}><Plus size={14} /> Order Test</button>
        </div>
      </div>

      {tests.length === 0 && (
        <GlassCard>
          <p className="text-sm text-slate-500 text-center py-4">No lab tests ordered yet.</p>
        </GlassCard>
      )}

      <div className="space-y-2">
        {tests.map((t) => (
          <GlassCard key={t.id} className="!p-3">
            <div className="flex items-start gap-3">
              <FlaskConical size={16} className="text-cyan-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-white">{t.test}</span>
                  <Badge tone="violet" className="!text-[8px]">{t.category}</Badge>
                  <Badge tone={t.status === "completed" ? "green" : t.status === "processing" ? "amber" : t.status === "collected" ? "cyan" : "neutral"} className="!text-[8px]">{t.status}</Badge>
                  {t.flag && <Badge tone={flagColor(t.flag)} className="!text-[8px] uppercase">{t.flag}</Badge>}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Sample: {t.sample} · Ordered: {t.orderedAt} {t.collectedAt && `· Collected: ${t.collectedAt}`}
                </p>
                {t.result && (
                  <div className="mt-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1">
                    <p className="text-xs font-mono text-slate-200">{t.result}</p>
                    <p className="text-[10px] text-slate-500">Ref: {t.reference}</p>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                {t.status === "ordered" && (
                  <button className="btn-ghost !text-xs !py-1" onClick={() => advanceStatus(t.id)}><Beaker size={12} /> Collect</button>
                )}
                {t.status === "collected" && (
                  <button className="btn-ghost !text-xs !py-1" onClick={() => advanceStatus(t.id)}><ClipboardList size={12} /> Process</button>
                )}
                {t.status === "processing" && (
                  <button className="btn-ghost !text-xs !py-1" onClick={() => setResult(t.id)}><CheckCircle size={12} /> Result</button>
                )}
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Order Lab Test">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1 block">Test Name</label>
            <input className="input-dark" placeholder="e.g. CBC, CRP, HbA1c" value={addTest} onChange={(e) => setAddTest(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Category</label>
              <select className="input-dark" value={addCat} onChange={(e) => setAddCat(e.target.value)}>
                <option value="biochemistry">Biochemistry</option>
                <option value="hematology">Hematology</option>
                <option value="microbiology">Microbiology</option>
                <option value="immunology">Immunology</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Sample Type</label>
              <select className="input-dark" value={addSample} onChange={(e) => setAddSample(e.target.value)}>
                <option value="blood">Blood</option>
                <option value="urine">Urine</option>
                <option value="stool">Stool</option>
                <option value="swab">Swab</option>
                <option value="csf">CSF</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn-neon" onClick={addNew}><Plus size={14} /> Order</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
