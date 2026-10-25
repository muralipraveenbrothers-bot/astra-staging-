import { useState } from "react";
import { FileText, Printer, Download, Search, Clock, CheckCircle, Eye } from "lucide-react";
import { toast } from "sonner";
import { GlassCard, SectionTitle, Badge, Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type ReportType = "all" | "discharge" | "clinical" | "lab" | "radiology";

interface ReportEntry {
  id: string;
  patientId: string;
  patientName: string;
  type: "discharge" | "clinical" | "lab" | "radiology";
  title: string;
  summary: string;
  doctor: string;
  createdAt: string;
  status: "draft" | "finalized";
}

export function ReceptionReports() {
  const { patients, clinicalNotes, dischargePlans } = useStore();
  const [reportType, setReportType] = useState<ReportType>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState("");
  const [viewReport, setViewReport] = useState<ReportEntry | null>(null);

  const generatedReports: ReportEntry[] = [
    ...clinicalNotes.map((n) => ({
      id: n.id,
      patientId: n.patientId,
      patientName: patients.find((p) => p.id === n.patientId)?.name ?? "Unknown",
      type: n.type === "discharge" ? "discharge" as const : n.type === "progress" ? "clinical" as const : "clinical" as const,
      title: n.type.charAt(0).toUpperCase() + n.type.slice(1) + " Note",
      summary: n.content.slice(0, 150) + (n.content.length > 150 ? "..." : ""),
      doctor: n.doctor,
      createdAt: n.createdAt,
      status: n.status,
    })),
    ...dischargePlans.map((d) => ({
      id: d.id,
      patientId: d.patientId,
      patientName: d.patientName,
      type: "discharge" as const,
      title: "Discharge Summary",
      summary: `Diagnosis: ${d.diagnosis}. Condition: ${d.conditionAtDischarge}. Follow-up: ${d.followUpDate}`,
      doctor: d.prescribedBy,
      createdAt: d.dischargeDate,
      status: d.status === "discharged" ? "finalized" as const : "draft" as const,
    })),
  ];

  const filteredReports = generatedReports.filter((r) => {
    if (reportType !== "all" && r.type !== reportType) return false;
    if (selectedPatient && r.patientId !== selectedPatient) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return r.title.toLowerCase().includes(q) || r.patientName.toLowerCase().includes(q) || r.doctor.toLowerCase().includes(q);
    }
    return true;
  });

  const handlePrint = () => {
    window.print();
    toast.success("Printing report");
  };

  return (
    <div className="space-y-4">
      <GlassCard>
        <SectionTitle title="Reports & Discharge Summaries" subtitle="View all clinical notes, lab reports, radiology reports, and discharge summaries" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <select className="input-dark" value={selectedPatient} onChange={(e) => setSelectedPatient(e.target.value)}>
            <option value="">All patients</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>{p.id} — {p.name}</option>
            ))}
          </select>
          <div className="flex gap-1">
            {(["all", "discharge", "clinical", "lab", "radiology"] as ReportType[]).map((t) => (
              <button key={t} onClick={() => setReportType(t)}
                className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold border transition-all flex-1",
                  reportType === t ? "bg-cyan-500/20 text-white border-cyan-400/50" : "text-slate-400 border-white/10 hover:text-white")}>
                {t === "all" ? "All" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className="input-dark !pl-9" placeholder="Search reports..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
          <button className="btn-ghost" onClick={handlePrint}><Printer size={14} /> Print All</button>
        </div>
      </GlassCard>

      <GlassCard>
        <SectionTitle title={`${filteredReports.length} Report(s)`} subtitle="Newest first" />
        {filteredReports.length === 0 && <p className="text-xs text-slate-500">No reports found.</p>}
        <div className="space-y-2">
          {filteredReports.slice().reverse().map((r) => {
            const typeColors: Record<string, string> = {
              discharge: "text-amber-400 border-amber-400/30 bg-amber-500/10",
              clinical: "text-cyan-400 border-cyan-400/30 bg-cyan-500/10",
              lab: "text-violet-400 border-violet-400/30 bg-violet-500/10",
              radiology: "text-emerald-400 border-emerald-400/30 bg-emerald-500/10",
            };
            return (
              <div key={r.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 hover:border-white/20 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={cn("rounded-lg p-2 border", typeColors[r.type])}>
                    <FileText size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-white">{r.title}</span>
                      <Badge tone={r.status === "finalized" ? "green" : "amber"} className="!text-[9px]">{r.status}</Badge>
                      <Badge tone={r.type === "discharge" ? "amber" : r.type === "clinical" ? "cyan" : r.type === "lab" ? "violet" : "green"} className="!text-[9px]">{r.type}</Badge>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">Patient: {r.patientName} ({r.patientId})  Dr. {r.doctor}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{r.summary}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-slate-500 flex items-center gap-1"><Clock size={10} /> {r.createdAt}</span>
                    <button className="btn-ghost !text-[10px] !py-1" onClick={() => setViewReport(r)}><Eye size={12} /> View</button>
                    <button className="btn-ghost !text-[10px] !py-1"><Download size={12} /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>

      <Modal open={!!viewReport} onClose={() => setViewReport(null)} title={viewReport?.title ?? "Report"} wide>
        {viewReport && (
          <div className="space-y-4">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2 mb-3">
                <Badge tone={viewReport.status === "finalized" ? "green" : "amber"} className="!text-[10px]">{viewReport.status}</Badge>
                <Badge tone={viewReport.type === "discharge" ? "amber" : "cyan"} className="!text-[10px]">{viewReport.type}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><span className="text-slate-500">Patient:</span> <span className="text-white">{viewReport.patientName} ({viewReport.patientId})</span></div>
                <div><span className="text-slate-500">Doctor:</span> <span className="text-white">{viewReport.doctor}</span></div>
                <div><span className="text-slate-500">Date:</span> <span className="text-white">{viewReport.createdAt}</span></div>
                <div><span className="text-slate-500">Type:</span> <span className="text-white capitalize">{viewReport.type}</span></div>
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <h4 className="text-xs font-bold text-slate-300 uppercase mb-2">Summary</h4>
              <p className="text-xs text-slate-300 leading-relaxed">{viewReport.summary}</p>
            </div>
            <div className="flex gap-2">
              <button className="btn-neon" onClick={handlePrint}><Printer size={14} /> Print</button>
              <button className="btn-ghost"><Download size={14} /> Download PDF</button>
              <button className="btn-ghost" onClick={() => setViewReport(null)}>Close</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
