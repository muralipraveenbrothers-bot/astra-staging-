import { useState } from "react";
import { Eye, FileText, Plus, Radiation, Printer } from "lucide-react";
import { toast } from "sonner";
import { GlassCard, SectionTitle, Badge, Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, uid, nowTime } from "@/lib/utils";

interface RadiologyOrder {
  id: string;
  study: string;
  modality: string;
  region: string;
  reason: string;
  status: "ordered" | "scheduled" | "completed" | "reported";
  priority: "routine" | "urgent" | "stat";
  orderedBy: string;
  orderedAt: string;
  report?: string;
  reportedAt?: string;
}

export default function RadiologyModule({ patientId, patientName }: { patientId: string; patientName: string }) {
  const { account } = useAuth();
  const { logAudit } = useStore();
  const doctorName = account?.name ?? "Dr. Admin";
  const [orders, setOrders] = useState<RadiologyOrder[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addStudy, setAddStudy] = useState("");
  const [addModality, setAddModality] = useState("X-ray");
  const [addRegion, setAddRegion] = useState("");
  const [addReason, setAddReason] = useState("");
  const [addPriority, setAddPriority] = useState<"routine" | "urgent" | "stat">("routine");
  const [viewReport, setViewReport] = useState<RadiologyOrder | null>(null);

  const addOrder = () => {
    if (!patientId) { toast.error("Select a patient first"); return; }
    if (!addStudy.trim()) return;
    const o: RadiologyOrder = {
      id: uid("rad"), study: addStudy.trim(), modality: addModality, region: addRegion,
      reason: addReason, status: "ordered", priority: addPriority,
      orderedBy: doctorName, orderedAt: nowTime(),
    };
    setOrders((p) => [...p, o]);
    logAudit("Radiology ordered", `${o.modality} ${o.study} (${o.region}) for ${patientId}`, doctorName);
    setAddOpen(false); setAddStudy(""); setAddRegion(""); setAddReason("");
    toast.success("Imaging ordered");
  };

  const advanceStatus = (id: string) => {
    setOrders((p) =>
      p.map((o) => {
        const next = o.status === "ordered" ? "scheduled" as const : o.status === "scheduled" ? "completed" as const : "reported" as const;
        return { ...o, status: next, reportedAt: next === "reported" ? nowTime() : o.reportedAt };
      })
    );
    logAudit("Radiology status updated", `Order status advanced`, doctorName);
    toast.success("Status updated");
  };

  const generateReport = (id: string) => {
    const mockReports: Record<string, string> = {
      "Chest X-ray": "Normal heart size. Clear lung fields. No consolidation, effusion, or pneumothorax.",
      "CT Head": "No acute intracranial hemorrhage. No mass effect. Normal ventricles.",
      "MRI Knee": "Medial meniscus tear. Mild joint effusion. Intact cruciate ligaments.",
      "USG Abdomen": "Normal liver, spleen, kidneys. No free fluid. Gallbladder unremarkable.",
    };
    const order = orders.find((o) => o.id === id);
    if (!order) return;
    const report = mockReports[order.study] || `Normal ${order.modality} study of ${order.region}. No significant abnormality detected. (AI-generated preliminary report)`;
    setOrders((p) => p.map((o) => o.id === id ? { ...o, report, status: "reported" as const, reportedAt: nowTime() } : o));
    logAudit("Radiology report generated", `${order.study} report for ${patientId}`, "CDS agent");
    toast.success("Report generated");
  };

  const prioColor = (p: string) => p === "stat" ? "red" : p === "urgent" ? "amber" : "neutral";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle title="Radiology" subtitle="Order and review imaging studies" />
        <button className="btn-neon" onClick={() => setAddOpen(true)} disabled={!patientId}><Plus size={14} /> Order Imaging</button>
      </div>

      {orders.length === 0 && (
        <GlassCard>
          <p className="text-sm text-slate-500 text-center py-4">No imaging studies ordered yet.</p>
        </GlassCard>
      )}

      <div className="space-y-2">
        {orders.map((o) => (
          <GlassCard key={o.id} className={cn("!p-3", o.status === "reported" ? "border-emerald-400/30" : "")}>
            <div className="flex items-start gap-3">
              <Radiation size={16} className="text-cyan-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-white">{o.study}</span>
                  <Badge tone="violet" className="!text-[8px]">{o.modality}</Badge>
                  {o.region && <Badge tone="neutral" className="!text-[8px]">{o.region}</Badge>}
                  <Badge tone={prioColor(o.priority)} className="!text-[8px] uppercase">{o.priority}</Badge>
                  <Badge tone={o.status === "reported" ? "green" : o.status === "completed" ? "cyan" : o.status === "scheduled" ? "amber" : "neutral"} className="!text-[8px]">{o.status}</Badge>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">Reason: {o.reason || "—"}</p>
                <p className="text-[10px] text-slate-500">Ordered by {o.orderedBy} at {o.orderedAt}</p>
                {o.report && (
                  <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] p-2">
                    <p className="text-xs text-slate-300">{o.report}</p>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                {o.status === "ordered" && <button className="btn-ghost !text-xs !py-1" onClick={() => advanceStatus(o.id)}>Schedule</button>}
                {o.status === "scheduled" && <button className="btn-ghost !text-xs !py-1" onClick={() => advanceStatus(o.id)}>Complete</button>}
                {o.status === "completed" && <button className="btn-neon !text-xs !py-1" onClick={() => generateReport(o.id)}><FileText size={12} /> Generate Report</button>}
                {o.status === "reported" && <button className="btn-ghost !text-xs !py-1" onClick={() => setViewReport(o)}><Eye size={12} /> View</button>}
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Order Imaging Study">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Modality</label>
              <select className="input-dark" value={addModality} onChange={(e) => setAddModality(e.target.value)}>
                <option value="X-ray">X-ray</option>
                <option value="CT">CT</option>
                <option value="MRI">MRI</option>
                <option value="USG">USG</option>
                <option value="Mammography">Mammography</option>
                <option value="Fluoroscopy">Fluoroscopy</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-400 mb-1 block">Priority</label>
              <select className="input-dark" value={addPriority} onChange={(e) => setAddPriority(e.target.value as "routine" | "urgent" | "stat")}>
                <option value="routine">Routine</option>
                <option value="urgent">Urgent</option>
                <option value="stat">STAT</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1 block">Study</label>
            <input className="input-dark" placeholder="e.g. Chest PA view" value={addStudy} onChange={(e) => setAddStudy(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1 block">Region</label>
            <input className="input-dark" placeholder="e.g. Chest, Abdomen, Head" value={addRegion} onChange={(e) => setAddRegion(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 mb-1 block">Reason</label>
            <textarea className="input-dark resize-none" rows={2} placeholder="Clinical indication" value={addReason} onChange={(e) => setAddReason(e.target.value)} />
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            <button className="btn-neon" onClick={addOrder}><Plus size={14} /> Order</button>
          </div>
        </div>
      </Modal>

      <Modal open={!!viewReport} onClose={() => setViewReport(null)} title="Radiology Report" wide>
        {viewReport && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-white">{viewReport.study}</h3>
              <Badge tone="violet">{viewReport.modality}</Badge>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Preliminary Report</p>
              <p className="text-sm text-slate-200">{viewReport.report}</p>
            </div>
            <p className="text-xs text-slate-500">Reported at: {viewReport.reportedAt}</p>
            <p className="text-xs text-slate-500 italic">This is an AI-generated preliminary report. Final interpretation by radiologist required.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
