import { useState, useMemo } from "react";
import {
  Activity,
  AlertOctagon,
  Ambulance,
  Beef,
  BookOpen,
  Brain,
  ClipboardList,
  DoorOpen,
  FileText,
  FlaskConical,
  HeartPulse,
  ListChecks,
  MessageSquare,
  Microscope,
  Pencil,
  Pill,
  Radiation,
  Scissors,
  Search,
  Stethoscope,
  Users,
  Waypoints,
  X,
  ChevronDown,
  ChevronUp,
  Phone,
  MapPin,
  Syringe,
  AlertTriangle,
  Heart,
  User,
  Fingerprint,
  Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { GlassCard, Badge } from "@/components/ui";
import type { CDSSubModule, VitalsEntry, PatientRecord } from "@/lib/types";
import ClinicalIntake from "./ClinicalIntake";
import ClinicalInsight from "./ClinicalInsight";
import ClinicalRoadmap from "./ClinicalRoadmap";
import DifferentialDiagnosis from "./DifferentialDiagnosis";
import Investigations from "./Investigations";
import LaboratoryModule from "./LaboratoryModule";
import RadiologyModule from "./RadiologyModule";
import MedicationAssistant from "./MedicationAssistant";
import Procedures from "./Procedures";
import SurgicalPlanning from "./SurgicalPlanning";
import AdmissionDecision from "./AdmissionDecision";
import ProgressNotes from "./ProgressNotes";
import MonitoringModule from "./MonitoringModule";
import PatientEducation from "./PatientEducation";
import ClinicalReferences from "./ClinicalReferences";
import FollowupPlanner from "./FollowupPlanner";
import AICaseDiscussion from "./AICaseDiscussion";
import MDTModule from "./MDTModule";
import DoctorOrders from "./DoctorOrders";
import DischargePlanning from "./DischargePlanning";
import { ClinicalDecisionModule } from "./ClinicalDecisionModule";

const submodules: { key: CDSSubModule; label: string; icon: any }[] = [
  { key: "clinical-intake", label: "Clinical Intake", icon: ClipboardList },
  { key: "clinical-insight", label: "Clinical Insight", icon: Brain },
  { key: "clinical-roadmap", label: "Clinical Roadmap", icon: Waypoints },
  { key: "differential-diagnosis", label: "Differential Dx", icon: Stethoscope },
  { key: "investigations", label: "Investigations", icon: Search },
  { key: "laboratory", label: "Laboratory", icon: Microscope },
  { key: "radiology", label: "Radiology", icon: Radiation },
  { key: "medication-assistant", label: "Medication Asst.", icon: Pill },
  { key: "procedures", label: "Procedures", icon: Scissors },
  { key: "surgical-planning", label: "Surgical Planning", icon: Beef },
  { key: "admission-decision", label: "Admission Decision", icon: DoorOpen },
  { key: "progress-notes", label: "Progress Notes", icon: FileText },
  { key: "monitoring", label: "Monitoring", icon: Activity },
  { key: "patient-education", label: "Patient Education", icon: BookOpen },
  { key: "clinical-references", label: "References", icon: BookOpen },
  { key: "followup-planner", label: "Follow-up Planner", icon: HeartPulse },
  { key: "ai-case-discussion", label: "AI Case Discussion", icon: MessageSquare },
  { key: "mdt", label: "MDT", icon: Users },
  { key: "doctor-orders", label: "Doctor Orders", icon: ListChecks },
  { key: "discharge-planning", label: "Discharge Planning", icon: Ambulance },
  { key: "surgical-r1", label: "Surgical R1", icon: Scissors },
];

const moduleComponents: Record<CDSSubModule, React.ComponentType<{ patientId: string; patientName: string }>> = {
  "clinical-intake": ClinicalIntake,
  "clinical-insight": ClinicalInsight,
  "clinical-roadmap": ClinicalRoadmap,
  "differential-diagnosis": DifferentialDiagnosis,
  investigations: Investigations,
  laboratory: LaboratoryModule,
  radiology: RadiologyModule,
  "medication-assistant": MedicationAssistant,
  procedures: Procedures,
  "surgical-planning": SurgicalPlanning,
  "admission-decision": AdmissionDecision,
  "progress-notes": ProgressNotes,
  monitoring: MonitoringModule,
  "patient-education": PatientEducation,
  "clinical-references": ClinicalReferences,
  "followup-planner": FollowupPlanner,
  "ai-case-discussion": AICaseDiscussion,
  mdt: MDTModule,
  "doctor-orders": DoctorOrders,
  "discharge-planning": DischargePlanning,
  "surgical-r1": ClinicalDecisionModule,
};

function PatientInfoPanel({ patient }: { patient: PatientRecord }) {
  const [locked, setLocked] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const fields: { label: string; value: string | undefined; icon: any }[] = [
    { label: "UHID", value: patient.id, icon: Fingerprint },
    { label: "Name", value: patient.name, icon: User },
    { label: "Age", value: patient.age ? `${patient.age}y` : undefined, icon: User },
    { label: "Gender", value: patient.gender, icon: User },
    { label: "Phone", value: patient.phone, icon: Phone },
    { label: "Address", value: patient.address, icon: MapPin },
    { label: "Weight", value: patient.weight ? `${patient.weight} kg` : undefined, icon: Heart },
    { label: "Height", value: patient.height ? `${patient.height} cm` : undefined, icon: Heart },
    { label: "Blood Group", value: patient.bloodGroup, icon: Heart },
    { label: "Emergency Contact", value: patient.emergencyContact, icon: Phone },
    { label: "Department", value: patient.department, icon: Stethoscope },
    { label: "Linked Doctor", value: patient.linkedDoctor, icon: User },
    { label: "Admission Status", value: patient.admissionStatus, icon: Activity },
    { label: "Insurance", value: patient.insurance, icon: Shield },
  ];

  const extendedFields: { label: string; value: string | undefined; icon: any }[] = [
    { label: "Allergies", value: patient.allergies, icon: AlertTriangle },
    { label: "Chronic Illnesses", value: patient.chronicIllnesses, icon: AlertTriangle },
    { label: "Previous Surgeries", value: patient.previousSurgeries, icon: Syringe },
    { label: "Previous Diagnoses", value: patient.previousDiagnoses, icon: FileText },
    { label: "Previous Visits", value: patient.previousVisits, icon: ClipboardList },
    { label: "Current Medications", value: patient.currentMedications, icon: Pill },
    { label: "Past Investigations", value: patient.pastInvestigations, icon: Microscope },
    { label: "Chief Complaint (at registration)", value: patient.complaint, icon: Stethoscope },
  ];

  return (
    <GlassCard className="!p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-base font-bold text-gradient">Patient Information</h3>
          <Badge tone={patient.admissionStatus === "inpatient" ? "red" : patient.admissionStatus === "discharged" ? "neutral" : "green"} className="!text-[8px] uppercase">
            {patient.admissionStatus ?? "outpatient"}
          </Badge>
        </div>
        <button
          className={cn("btn-ghost !text-xs !py-1", !locked && "border-amber-400/40 text-amber-300")}
          onClick={() => setLocked(!locked)}
        >
          <Pencil size={12} /> {locked ? "Unlock to edit" : "Locked"}
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
        {fields.map(({ label, value, icon: Icon }) => (
          <div key={label} className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5", locked ? "border-white/5 bg-white/[0.02]" : "border-amber-400/20 bg-amber-400/5")}>
            <Icon size={12} className="text-slate-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-[9px] text-slate-500 uppercase">{label}</p>
              <p className="text-xs font-medium text-white truncate">{value || "—"}</p>
            </div>
          </div>
        ))}
      </div>
      <button
        className="flex items-center gap-1 mt-3 text-[10px] text-slate-500 hover:text-neon-cyan"
        onClick={() => setShowAll(!showAll)}
      >
        {showAll ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {showAll ? "Hide" : "Show"} clinical history & EMR data
      </button>
      {showAll && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 pt-2 border-t border-white/5">
          {extendedFields.map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-start gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
              <Icon size={12} className="text-slate-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[9px] text-slate-500 uppercase">{label}</p>
                <p className="text-xs text-slate-300 whitespace-pre-wrap">{value || "—"}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

export default function ClinicalWorkspace() {
  const { account } = useAuth();
  const { patients, vitals, audit, logAudit, cdsActivePatientId, setCdsActivePatientId } = useStore();
  const doctorName = account?.name ?? "Dr. Admin";
  const [activeModule, setActiveModule] = useState<CDSSubModule>("clinical-intake");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchResults, setShowSearchResults] = useState(false);

  const selectedPatient = patients.find((p) => p.id === cdsActivePatientId);
  const patientVitals = cdsActivePatientId ? vitals.filter((v) => v.patientId === cdsActivePatientId) : [];

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return patients.filter(
      (p) =>
        p.id.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.phone && p.phone.includes(q)) ||
        (p.address && p.address.toLowerCase().includes(q))
    );
  }, [searchQuery, patients]);

  const selectPatient = (id: string) => {
    setCdsActivePatientId(id);
    setShowSearchResults(false);
    setSearchQuery("");
    const p = patients.find((x) => x.id === id);
    logAudit("CDS patient selected", `Patient ${id} — ${p?.name || ""}`, doctorName);
  };

  const clearPatient = () => {
    setCdsActivePatientId("");
    logAudit("CDS patient cleared", "", doctorName);
  };

  const ActiveComponent = moduleComponents[activeModule];

  return (
    <div className="space-y-4">
      {/* disclaimer */}
      <div className="glass border !border-red-400/50 p-4 flex items-center gap-3" style={{ boxShadow: "0 0 24px rgba(248,113,113,0.15)" }}>
        <AlertOctagon className="text-red-400 shrink-0 animate-pulse" size={22} />
        <div>
          <p className="text-sm font-bold text-red-300">AI-generated decision support — physician judgment required</p>
          <p className="text-xs text-slate-400">Nothing on this page is a diagnosis or prescription. No suggestion is saved, ordered or dispensed without explicit doctor confirmation. Every action is audit-logged.</p>
        </div>
      </div>

      {/* Search / Selected Patient bar */}
      <GlassCard className="!p-4">
        {!selectedPatient ? (
          <div className="relative">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  className="input-dark !pl-8"
                  placeholder="Search patient by UHID, name, mobile, or address…"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSearchResults(true);
                  }}
                  onFocus={() => setShowSearchResults(true)}
                  onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                  autoFocus
                />
              </div>
              <span className="text-[10px] text-slate-500 shrink-0">{patients.length} registered</span>
            </div>
            {showSearchResults && searchResults.length > 0 && (
              <div className="absolute z-50 left-0 right-0 mt-1 max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-slate-900/95 backdrop-blur-xl shadow-2xl">
                {searchResults.map((p) => (
                  <button
                    key={p.id}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.06] transition-colors border-b border-white/5 last:border-b-0"
                    onClick={() => selectPatient(p.id)}
                  >
                    <div className="h-8 w-8 rounded-full bg-violet-500/20 border border-violet-400/30 flex items-center justify-center text-xs font-bold text-violet-300 shrink-0">
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{p.name}</span>
                        <Badge tone="violet" className="!text-[8px]">{p.id}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-slate-500">
                        {p.age && <span>{p.age}y</span>}
                        {p.gender && <span>{p.gender}</span>}
                        {p.phone && <span>{p.phone}</span>}
                        {p.department && <span>{p.department}</span>}
                      </div>
                    </div>
                    {p.complaint && (
                      <Badge tone="cyan" className="!text-[8px] max-w-[140px] truncate">{p.complaint}</Badge>
                    )}
                  </button>
                ))}
              </div>
            )}
            {showSearchResults && searchQuery.trim() && searchResults.length === 0 && (
              <div className="absolute z-50 left-0 right-0 mt-1 rounded-xl border border-white/10 bg-slate-900/95 backdrop-blur-xl shadow-2xl p-4 text-center">
                <p className="text-xs text-slate-500">No patients found matching "{searchQuery}"</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-violet-500/20 border border-violet-400/40 flex items-center justify-center text-sm font-bold text-violet-300 shrink-0">
              {selectedPatient.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">{selectedPatient.name}</span>
                <Badge tone="violet" className="!text-[8px]">{selectedPatient.id}</Badge>
                {selectedPatient.age && <span className="text-xs text-slate-400">{selectedPatient.age}y</span>}
                {selectedPatient.gender && <span className="text-xs text-slate-400">{selectedPatient.gender}</span>}
              </div>
              <div className="flex items-center gap-3 text-[10px] text-slate-500">
                {selectedPatient.phone && <span>{selectedPatient.phone}</span>}
                {selectedPatient.department && <span>{selectedPatient.department}</span>}
                {selectedPatient.linkedDoctor && <span>Dr. {selectedPatient.linkedDoctor}</span>}
              </div>
            </div>
            <button className="btn-ghost !text-xs !py-1" onClick={clearPatient}>
              <X size={12} /> Change
            </button>
          </div>
        )}
      </GlassCard>

      {/* Patient info panel when selected */}
      {selectedPatient && <PatientInfoPanel patient={selectedPatient} />}

      {/* Vitals alerts */}
      {(() => {
        if (patientVitals.length === 0) return null;
        const latest = patientVitals[0];
        const alerts: string[] = [];
        if (latest.tempF > 100.4) alerts.push(`Temp ${latest.tempF}°F (fever)`);
        if (latest.pulse > 100) alerts.push(`Pulse ${latest.pulse} (tachy)`);
        if (latest.spo2 < 95) alerts.push(`SpO2 ${latest.spo2}% (low)`);
        if (alerts.length === 0) return null;
        return (
          <div className="flex items-center gap-2 flex-wrap">
            {alerts.map((a, i) => (
              <Badge key={i} tone="red" className="!text-[9px] animate-pulse">{a}</Badge>
            ))}
          </div>
        );
      })()}

      {/* Submodule tabs */}
      <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1 flex-wrap">
        {submodules.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => {
              setActiveModule(key);
              logAudit("CDS module opened", `Module: ${label}`, doctorName);
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium whitespace-nowrap transition-all border",
              activeModule === key
                ? "bg-gradient-to-r from-cyan-500/15 to-violet-500/15 text-white border-violet-400/40 shadow-[0_0_14px_rgba(212,175,55,0.25)]"
                : "text-slate-400 border-white/10 bg-white/[0.03] hover:text-white hover:bg-white/[0.06]"
            )}
          >
            <Icon size={14} className={activeModule === key ? "text-neon-cyan" : ""} />
            {label}
          </button>
        ))}
      </div>

      {/* Active module */}
      <ActiveComponent patientId={cdsActivePatientId} patientName={selectedPatient?.name ?? ""} />

      {/* Audit trail */}
      <GlassCard>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-lg font-bold text-gradient">Audit Trail</h3>
          <span className="text-[10px] text-slate-500">{audit.length} entries</span>
        </div>
        <div className="max-h-48 overflow-y-auto space-y-1">
          {audit.length === 0 && <p className="text-xs text-slate-500">No entries yet.</p>}
          {audit.map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-xs rounded-lg border border-white/5 bg-white/[0.02] px-3 py-1.5">
              <span className="font-mono text-slate-500 shrink-0 text-[10px]">{a.timestamp}</span>
              <Badge tone="violet" className="!text-[8px] shrink-0">{a.actor}</Badge>
              <span className="text-slate-300 font-medium shrink-0">{a.action}</span>
              <span className="text-slate-500 truncate">{a.detail}</span>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
