import { useState } from "react";
import { Upload, FileText, BrainCircuit, CheckCircle, XCircle, Clock, Search, Trash2, Download } from "lucide-react";
import { toast } from "sonner";
import { GlassCard, SectionTitle, Badge, Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, nowTime, uid } from "@/lib/utils";

interface DocumentEntry {
  id: string;
  patientId: string;
  patientName: string;
  fileName: string;
  fileType: string;
  uploadedAt: string;
  status: "pending" | "ai-review" | "approved" | "rejected";
  aiSummary?: string;
  approvedBy?: string;
  approvedAt?: string;
}

const FILE_CATEGORIES = [
  "Previous Reports", "Lab Reports", "Radiology Films", "Discharge Summary",
  "Insurance Docs", "ID Proof", "Consent Forms", "Referral Letter", "Other",
];

export function ReceptionDocuments() {
  const { account } = useAuth();
  const { patients, logAudit } = useStore();
  const [documents, setDocuments] = useState<DocumentEntry[]>([]);
  const [selectedPatient, setSelectedPatient] = useState("");
  const [selectedCategory, setSelectedCategory] = useState(FILE_CATEGORIES[0]);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [viewDoc, setViewDoc] = useState<DocumentEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !selectedPatient) {
      toast.error("Select a patient first");
      return;
    }
    const patient = patients.find((p) => p.id === selectedPatient);
    const newDocs: DocumentEntry[] = Array.from(files).map((f) => ({
      id: uid("doc"),
      patientId: selectedPatient,
      patientName: patient?.name ?? "Unknown",
      fileName: f.name,
      fileType: selectedCategory,
      uploadedAt: nowTime(),
      status: "pending",
    }));
    setDocuments((prev) => [...newDocs, ...prev]);
    logAudit("Document upload", `${files.length} file(s) for ${selectedPatient}`, account?.name ?? "Reception");
    toast.success(`${files.length} file(s) uploaded`);
    e.target.value = "";
  };

  const runAiAnalysis = (docId: string) => {
    setAiBusy(docId);
    setTimeout(() => {
      setDocuments((prev) => prev.map((d) =>
        d.id === docId
          ? { ...d, status: "ai-review", aiSummary: `AI analysis complete. Key findings extracted from ${d.fileName}. No urgent abnormalities detected. Recommended follow-up in 2 weeks.` }
          : d
      ));
      setAiBusy(null);
      toast.success("AI analysis complete");
    }, 2000);
  };

  const approveDoc = (docId: string) => {
    setDocuments((prev) => prev.map((d) =>
      d.id === docId
        ? { ...d, status: "approved", approvedBy: account?.name ?? "Reception", approvedAt: nowTime() }
        : d
    ));
    logAudit("Document approved", docId, account?.name ?? "Reception");
    toast.success("Document approved");
  };

  const rejectDoc = (docId: string) => {
    setDocuments((prev) => prev.map((d) =>
      d.id === docId ? { ...d, status: "rejected" } : d
    ));
    toast.success("Document rejected");
  };

  const removeDoc = (docId: string) => {
    setDocuments((prev) => prev.filter((d) => d.id !== docId));
    toast.success("Document removed");
  };

  const filteredDocs = documents.filter((d) => {
    if (searchQuery) return d.fileName.toLowerCase().includes(searchQuery.toLowerCase()) || d.patientName.toLowerCase().includes(searchQuery.toLowerCase());
    if (selectedPatient) return d.patientId === selectedPatient;
    return true;
  });

  return (
    <div className="space-y-4">
      <GlassCard>
        <SectionTitle title="Documents & AI Analysis" subtitle="Upload previous reports, AI review, and doctor approval" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <select className="input-dark" value={selectedPatient} onChange={(e) => setSelectedPatient(e.target.value)}>
            <option value="">Select patient</option>
            {patients.map((p) => (
              <option key={p.id} value={p.id}>{p.id} — {p.name}</option>
            ))}
          </select>
          <select className="input-dark" value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
            {FILE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <label className="btn-neon cursor-pointer text-center">
            <Upload size={15} /> Upload Files
            <input type="file" multiple className="hidden" onChange={handleFileUpload} />
          </label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className="input-dark !pl-9" placeholder="Search documents..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <SectionTitle title="Document List" subtitle={`${filteredDocs.length} document(s)`} />
        {filteredDocs.length === 0 && <p className="text-xs text-slate-500">No documents uploaded. Select a patient and upload files above.</p>}
        <div className="space-y-2">
          {filteredDocs.map((doc) => (
            <div key={doc.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center gap-3">
                <FileText size={18} className="text-cyan-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white truncate">{doc.fileName}</span>
                    <Badge tone="cyan" className="!text-[9px]">{doc.fileType}</Badge>
                  </div>
                  <p className="text-[10px] text-slate-500">{doc.patientName} · {doc.uploadedAt}</p>
                </div>
                <div className="flex items-center gap-2">
                  {doc.status === "pending" && (
                    <button className="btn-ghost !text-[10px] !py-1" onClick={() => runAiAnalysis(doc.id)} disabled={aiBusy === doc.id}>
                      {aiBusy === doc.id ? <span className="h-3 w-3 rounded-full border-2 border-black/40 border-t-transparent animate-spin" /> : <BrainCircuit size={12} />}
                      AI Analyse
                    </button>
                  )}
                  {doc.status === "ai-review" && (
                    <>
                      <button className="btn-ghost !text-[10px] !py-1 text-emerald-400" onClick={() => approveDoc(doc.id)}><CheckCircle size={12} /> Approve</button>
                      <button className="btn-ghost !text-[10px] !py-1 text-red-400" onClick={() => rejectDoc(doc.id)}><XCircle size={12} /> Reject</button>
                    </>
                  )}
                  {doc.status === "approved" && <Badge tone="green" className="!text-[9px]">Approved</Badge>}
                  {doc.status === "rejected" && <Badge tone="red" className="!text-[9px]">Rejected</Badge>}
                  <button className="btn-ghost !text-[10px] !py-1" onClick={() => setViewDoc(doc)}><FileText size={12} /> View</button>
                  <button className="btn-ghost !text-[10px] !py-1 text-red-400" onClick={() => removeDoc(doc.id)}><Trash2 size={12} /></button>
                </div>
              </div>
              {doc.aiSummary && (
                <div className="mt-2 rounded-lg bg-violet-500/10 border border-violet-400/20 px-3 py-2">
                  <p className="text-[10px] text-violet-300 font-semibold mb-0.5">AI Summary</p>
                  <p className="text-[11px] text-slate-300">{doc.aiSummary}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </GlassCard>

      <Modal open={!!viewDoc} onClose={() => setViewDoc(null)} title="Document Details" wide>
        {viewDoc && (
          <div className="space-y-3">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs font-semibold text-white">{viewDoc.fileName}</p>
              <p className="text-[11px] text-slate-400">Patient: {viewDoc.patientName} · {viewDoc.patientId}</p>
              <p className="text-[11px] text-slate-400">Category: {viewDoc.fileType} · Uploaded: {viewDoc.uploadedAt}</p>
              <p className="text-[11px] text-slate-400">Status: {viewDoc.status}</p>
            </div>
            {viewDoc.aiSummary && (
              <div className="rounded-lg bg-violet-500/10 border border-violet-400/20 p-3">
                <p className="text-[10px] text-violet-300 font-semibold mb-1">AI Analysis</p>
                <p className="text-xs text-slate-300">{viewDoc.aiSummary}</p>
              </div>
            )}
            {viewDoc.approvedBy && (
              <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 p-3">
                <p className="text-xs text-emerald-300">Approved by {viewDoc.approvedBy} at {viewDoc.approvedAt}</p>
              </div>
            )}
            <div className="flex gap-2">
              <button className="btn-neon"><Download size={14} /> Download</button>
              <button className="btn-ghost" onClick={() => setViewDoc(null)}>Close</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
