import { useState, useEffect } from "react";
import { FileText, Mic, Printer, Save, CheckCircle, AlertTriangle, Eye } from "lucide-react";
import { toast } from "sonner";
import { GlassCard, SectionTitle, Badge, Modal } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, uid, nowTime, sleep } from "@/lib/utils";
import type { ClinicalNote } from "@/lib/types";

interface IntakeData {
  chiefComplaint: string;
  presentingSymptoms: string;
  historyOfPresentingIllness: string;
  pastMedicalHistory: string;
  pastSurgicalHistory: string;
  familyHistory: string;
  socialHistory: string;
  medications: string;
  allergies: string;
  vitalsTemp: string;
  vitalsBP: string;
  vitalsPulse: string;
  vitalsSpO2: string;
  examinationFindings: string;
}

const emptyIntake: IntakeData = {
  chiefComplaint: "", presentingSymptoms: "", historyOfPresentingIllness: "",
  pastMedicalHistory: "", pastSurgicalHistory: "", familyHistory: "",
  socialHistory: "", medications: "", allergies: "",
  vitalsTemp: "", vitalsBP: "", vitalsPulse: "", vitalsSpO2: "",
  examinationFindings: "",
};

export default function ClinicalIntake({ patientId, patientName }: { patientId: string; patientName: string }) {
  const { account } = useAuth();
  const { patients, logAudit, addPatient, clinicalNotes, setClinicalNotes } = useStore();
  const doctorName = account?.name ?? "Dr. Admin";
  const [data, setData] = useState<IntakeData>(emptyIntake);
  const [status, setStatus] = useState<"draft" | "finalized">("draft");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showExisting, setShowExisting] = useState(false);

  const patient = patients.find((p) => p.id === patientId);

  // Auto-populate from patient record when patient changes
  useEffect(() => {
    if (patient) {
      setData((prev) => ({
        ...prev,
        pastMedicalHistory: patient.chronicIllnesses || prev.pastMedicalHistory,
        pastSurgicalHistory: patient.previousSurgeries || prev.pastSurgicalHistory,
        medications: patient.currentMedications || prev.medications,
        allergies: patient.allergies || prev.allergies,
      }));
    }
  }, [patient?.id]);

  const set = (field: keyof IntakeData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setData((p) => ({ ...p, [field]: e.target.value }));

  const handleSave = () => {
    if (!patientId) { toast.error("Select a patient first"); return; }
    const note: ClinicalNote = {
      id: uid("cnote"), patientId, type: "consultation",
      content: JSON.stringify(data), doctor: doctorName,
      createdAt: nowTime(), updatedAt: nowTime(), status: "draft",
    };
    setClinicalNotes([note, ...clinicalNotes]);
    logAudit("Intake saved", `Patient ${patientId} — chief complaint: "${data.chiefComplaint.slice(0, 50)}"`, doctorName);
    toast.success("Intake saved as draft");
  };

  const handleFinalize = () => {
    if (!patientId) { toast.error("Select a patient first"); return; }
    setConfirmOpen(true);
  };

  const confirmFinalize = async () => {
    setConfirmOpen(false);
    await sleep(600);
    setStatus("finalized");
    const note: ClinicalNote = {
      id: uid("cnote"), patientId, type: "consultation",
      content: JSON.stringify(data), doctor: doctorName,
      createdAt: nowTime(), updatedAt: nowTime(), status: "finalized",
      signedBy: doctorName, signedAt: nowTime(),
    };
    setClinicalNotes([note, ...clinicalNotes]);
    logAudit("Intake finalized", `Patient ${patientId} — signed by ${doctorName}`, doctorName);
    toast.success("Intake finalized and signed");
  };

  const handlePrint = () => {
    if (!patientId) { toast.error("No patient selected"); return; }
    logAudit("Intake printed", `Patient ${patientId}`, doctorName);
    window.print();
  };

  const handleVoiceInput = () => {
    toast.info("Voice input", { description: "Voice transcription service — coming online." });
    logAudit("Voice input triggered", `Patient ${patientId}`, doctorName);
  };

  const handleExportPDF = () => {
    logAudit("Intake exported as PDF", `Patient ${patientId}`, doctorName);
    toast.success("PDF export queued — would download in production");
  };

  const todaySections: { key: keyof IntakeData; label: string; rows: number }[] = [
    { key: "chiefComplaint", label: "Chief Complaint (Today)", rows: 2 },
    { key: "presentingSymptoms", label: "Presenting Symptoms", rows: 3 },
    { key: "historyOfPresentingIllness", label: "History of Presenting Illness", rows: 3 },
    { key: "examinationFindings", label: "Examination Findings", rows: 3 },
  ];

  const vitalsSections: { key: keyof IntakeData; label: string }[] = [
    { key: "vitalsTemp", label: "Temperature (°C)" },
    { key: "vitalsBP", label: "BP (mmHg)" },
    { key: "vitalsPulse", label: "Pulse (/min)" },
    { key: "vitalsSpO2", label: "SpO₂ (%)" },
  ];

  const historySections: { key: keyof IntakeData; label: string; rows: number; autoFill: string }[] = [
    { key: "pastMedicalHistory", label: "Past Medical History", rows: 2, autoFill: patient?.chronicIllnesses || "" },
    { key: "pastSurgicalHistory", label: "Past Surgical History", rows: 2, autoFill: patient?.previousSurgeries || "" },
    { key: "familyHistory", label: "Family History", rows: 2, autoFill: "" },
    { key: "socialHistory", label: "Social History", rows: 2, autoFill: "" },
    { key: "medications", label: "Current Medications", rows: 2, autoFill: patient?.currentMedications || "" },
    { key: "allergies", label: "Allergies", rows: 2, autoFill: patient?.allergies || "" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <SectionTitle title="Clinical Intake" subtitle="Enter today's clinical data — history auto-populates from EMR" />
        <div className="flex items-center gap-2">
          <Badge tone={status === "finalized" ? "green" : "amber"}>{status}</Badge>
        </div>
      </div>

      {/* Existing patient data */}
      {patient && (
        <button
          className="flex items-center gap-1.5 text-xs text-neon-cyan hover:underline"
          onClick={() => setShowExisting(!showExisting)}
        >
          <Eye size={12} />
          {showExisting ? "Hide" : "View"} existing EMR data for {patientName}
        </button>
      )}
      {showExisting && patient && (
        <GlassCard>
          <SectionTitle title="Existing Patient Data (from EMR)" subtitle="Read-only reference" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {[
              { label: "UHID", value: patient.id },
              { label: "Name", value: patient.name },
              { label: "Age / Gender", value: `${patient.age || "—"}y / ${patient.gender || "—"}` },
              { label: "Phone", value: patient.phone || "—" },
              { label: "Address", value: patient.address || "—" },
              { label: "Blood Group", value: patient.bloodGroup || "—" },
              { label: "Weight / Height", value: `${patient.weight || "—"} kg / ${patient.height || "—"} cm` },
              { label: "Chronic Illnesses", value: patient.chronicIllnesses || "—" },
              { label: "Previous Surgeries", value: patient.previousSurgeries || "—" },
              { label: "Allergies", value: patient.allergies || "—" },
              { label: "Current Medications", value: patient.currentMedications || "—" },
              { label: "Previous Diagnoses", value: patient.previousDiagnoses || "—" },
              { label: "Insurance", value: patient.insurance || "—" },
              { label: "Emergency Contact", value: patient.emergencyContact || "—" },
              { label: "Linked Doctor", value: patient.linkedDoctor || "—" },
              { label: "Department", value: patient.department || "—" },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
                <p className="text-[9px] text-slate-500 uppercase mb-0.5">{label}</p>
                <p className="text-xs text-slate-300">{value}</p>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Today's clinical data */}
      <GlassCard>
        <div className="flex items-center gap-2 mb-3">
          <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <h3 className="text-xs font-bold text-emerald-300 uppercase tracking-wider">Today's Clinical Data</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {todaySections.map(({ key, label, rows }) => (
            <div key={key} className={rows > 2 ? "md:col-span-2" : ""}>
              <label className="text-xs font-semibold text-slate-400 mb-1 block">{label}</label>
              <textarea
                className="input-dark resize-none"
                rows={rows}
                value={data[key]}
                onChange={set(key)}
                placeholder={`Enter ${label.toLowerCase()}…`}
              />
            </div>
          ))}
        </div>
      </GlassCard>

      {/* Vitals */}
      <GlassCard>
        <div className="flex items-center gap-2 mb-3">
          <div className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
          <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider">Vitals (Today)</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {vitalsSections.map(({ key, label }) => (
            <div key={key}>
              <label className="text-xs font-semibold text-slate-400 mb-1 block">{label}</label>
              <input
                className="input-dark"
                type="text"
                placeholder="—"
                value={data[key]}
                onChange={set(key)}
              />
            </div>
          ))}
        </div>
      </GlassCard>

      {/* History sections (auto-populated from EMR) */}
      <GlassCard>
        <div className="flex items-center gap-2 mb-3">
          <div className="h-2 w-2 rounded-full bg-amber-400" />
          <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider">History & Background (auto-populated from EMR)</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {historySections.map(({ key, label, rows, autoFill }) => (
            <div key={key} className={rows > 2 ? "md:col-span-2" : ""}>
              <label className="text-xs font-semibold text-slate-400 mb-1 block">{label}</label>
              <textarea
                className={cn("input-dark resize-none", autoFill && "border-amber-400/20")}
                rows={rows}
                value={data[key]}
                onChange={set(key)}
                placeholder={autoFill ? `Auto-filled: ${autoFill}` : `Enter ${label.toLowerCase()}…`}
              />
              {autoFill && (
                <p className="text-[9px] text-amber-400/60 mt-0.5">Auto-populated from EMR — edit if needed</p>
              )}
            </div>
          ))}
        </div>
      </GlassCard>

      <div className="flex items-center gap-2 flex-wrap">
        <button className="btn-neon" onClick={handleSave} disabled={!patientId}>
          <Save size={14} /> Save Draft
        </button>
        <button className="btn-neon" onClick={handleFinalize} disabled={!patientId || status === "finalized"}>
          <CheckCircle size={14} /> Finalize
        </button>
        <button className="btn-ghost" onClick={handlePrint} disabled={!patientId}>
          <Printer size={14} /> Print
        </button>
        <button className="btn-ghost" onClick={handleExportPDF} disabled={!patientId}>
          <FileText size={14} /> Export PDF
        </button>
        <button className="btn-ghost" onClick={handleVoiceInput}>
          <Mic size={14} /> Voice Input
        </button>
      </div>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm Finalization">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={20} />
          <p className="text-sm text-slate-300">You are about to finalize this clinical intake for <strong className="text-white">{patientName || patientId}</strong>. This action will sign the record and it cannot be edited after finalization.</p>
        </div>
        <div className="flex gap-2 justify-end">
          <button className="btn-ghost" onClick={() => setConfirmOpen(false)}>Cancel</button>
          <button className="btn-neon" onClick={confirmFinalize}>
            <CheckCircle size={14} /> Confirm & Sign
          </button>
        </div>
      </Modal>
    </div>
  );
}
