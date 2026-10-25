import React, { useState } from "react";
import {
  WardBed,
  VitalRecord,
  DoctorOrder,
  NursingTask,
  MARRecord,
  InvestigationTask,
  ProgressNote,
  ConsultRequest,
  ClinicalAlert,
  TimelineEvent,
} from "./types";
import {
  X,
  Activity,
  Heart,
  Thermometer,
  ShieldAlert,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Mic,
  Video,
  Camera,
  Search,
  Stethoscope,
  ClipboardList,
  Syringe,
  Pill,
  Bookmark,
  Calendar,
  Lock,
  UserCheck,
  TrendingDown,
  TrendingUp,
  RefreshCw,
  Upload,
  Bot,
  Sparkles,
  PhoneCall,
  Volume2,
} from "lucide-react";

interface PatientWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  bed: WardBed;
  onUpdateBed: (updatedBed: WardBed) => void;
  onTriggerEmergencyAlarm: (uhid: string) => void;
}

export const PatientWorkspaceModal: React.FC<PatientWorkspaceModalProps> = ({
  isOpen,
  onClose,
  bed,
  onUpdateBed,
  onTriggerEmergencyAlarm,
}) => {
  const [activeTab, setActiveTab] = useState<
    | "OVERVIEW"
    | "VITALS"
    | "ORDERS"
    | "MEDICATIONS"
    | "NURSING"
    | "INVESTIGATIONS"
    | "NOTES"
    | "PROCEDURES"
    | "SURGERY"
    | "CONSULTATIONS"
    | "ALERTS"
    | "DOCUMENTS"
    | "VOICE"
    | "VIDEO"
    | "TIMELINE"
    | "DISCHARGE"
  >("OVERVIEW");

  // State for Vital Entry Form
  const [newVital, setNewVital] = useState({
    hr: 110,
    bpSystolic: 135,
    bpDiastolic: 85,
    temp: 101.2,
    rr: 22,
    spo2: 94,
    gcs: 15,
    painScore: 3,
    bloodGlucose: 120,
    recordedBy: "Nurse Lakshmi",
  });

  // State for Doctor Order Creation Form
  const [newOrder, setNewOrder] = useState({
    category: "Medication" as DoctorOrder["category"],
    title: "",
    details: "",
    frequency: "BD",
    priority: "Routine" as DoctorOrder["priority"],
  });

  // State for Progress Note Form
  const [newProgressNote, setNewProgressNote] = useState({
    timeframe: "Morning" as ProgressNote["timeframe"],
    subjective: "",
    objective: "",
    assessment: "",
    plan: "",
  });

  // State for Consult Request Form
  const [newConsult, setNewConsult] = useState({
    specialty: "Cardiology",
    consultantName: "Dr. R. K. Sharma",
    reason: "",
  });

  // Voice recording state simulation
  const [isDictating, setIsDictating] = useState(false);
  const [dictationText, setDictationText] = useState("");

  // Video consult state
  const [isVideoConnected, setIsVideoConnected] = useState(false);
  const [videoChatMessage, setVideoChatMessage] = useState("");

  // Monitor OCR simulation state
  const [isScanningMonitor, setIsScanningMonitor] = useState(false);
  const [ocrDetectedVitals, setOcrDetectedVitals] = useState<any>(null);

  if (!isOpen || !bed.patientName) return null;

  const latestVital = bed.vitalsHistory[bed.vitalsHistory.length - 1];

  // Helper to append a timeline event
  const logTimeline = (
    currentBed: WardBed,
    category: TimelineEvent["category"],
    title: string,
    details: string,
    user: string = "Dr. Murali Praveen",
    role: string = "Doctor"
  ): TimelineEvent[] => {
    const newEvent: TimelineEvent = {
      id: "tl-" + Date.now(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      date: new Date().toISOString().split("T")[0],
      category,
      title,
      details,
      user,
      role,
    };
    return [newEvent, ...currentBed.timeline];
  };

  // Handler: Add Vital Record
  const handleAddVital = () => {
    const vitalRecord: VitalRecord = {
      id: "v-" + Date.now(),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      date: new Date().toISOString().split("T")[0],
      hr: Number(newVital.hr),
      bpSystolic: Number(newVital.bpSystolic),
      bpDiastolic: Number(newVital.bpDiastolic),
      temp: Number(newVital.temp),
      rr: Number(newVital.rr),
      spo2: Number(newVital.spo2),
      gcs: Number(newVital.gcs),
      painScore: Number(newVital.painScore),
      bloodGlucose: Number(newVital.bloodGlucose),
      recordedBy: newVital.recordedBy,
      role: "Nurse",
      isAbnormal: Number(newVital.spo2) < 94 || Number(newVital.temp) > 100.4 || Number(newVital.hr) > 100,
    };

    const updatedVitals = [...bed.vitalsHistory, vitalRecord];
    const updatedTimeline = logTimeline(
      bed,
      "Vitals",
      "New Vital Signs Recorded",
      `HR: ${vitalRecord.hr} bpm, BP: ${vitalRecord.bpSystolic}/${vitalRecord.bpDiastolic}, Temp: ${vitalRecord.temp}°F, SpO2: ${vitalRecord.spo2}%`,
      vitalRecord.recordedBy,
      "Nurse"
    );

    onUpdateBed({
      ...bed,
      vitalsHistory: updatedVitals,
      timeline: updatedTimeline,
    });

    alert("Vital signs logged successfully and timeline updated!");
  };

  // Handler: Add Doctor Order (Automatically converts into Nursing Task & MAR if applicable!)
  const handleAddOrder = () => {
    if (!newOrder.title.trim()) {
      alert("Please enter order title.");
      return;
    }

    const orderId = "ord-" + Date.now();
    const taskId = "nt-" + Date.now();

    const createdOrder: DoctorOrder = {
      id: orderId,
      category: newOrder.category,
      title: newOrder.title,
      details: newOrder.details || newOrder.title,
      orderedBy: "Dr. Murali Praveen",
      orderedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      frequency: newOrder.frequency,
      status: "Active",
      priority: newOrder.priority,
      linkedTaskId: taskId,
    };

    // Auto-create nursing task
    const createdTask: NursingTask = {
      id: taskId,
      title: `${newOrder.category}: ${newOrder.title}`,
      category: newOrder.category === "Medication" ? "Medication" : "Nursing Care",
      dueTime: "Next Schedule",
      dueDate: new Date().toISOString().split("T")[0],
      assignedStaff: "Duty Nurse",
      status: "DUE NOW",
    };

    // Auto-create MAR if medication
    let updatedMAR = [...bed.marRecords];
    if (newOrder.category === "Medication") {
      const marItem: MARRecord = {
        id: "mar-" + Date.now(),
        drugName: newOrder.title,
        dose: newOrder.details || "As Directed",
        route: "Intravenous / Oral",
        frequency: newOrder.frequency,
        scheduledTime: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        scheduledDate: new Date().toISOString().split("T")[0],
        status: "Due",
      };
      updatedMAR = [marItem, ...updatedMAR];
    }

    const updatedOrders = [createdOrder, ...bed.orders];
    const updatedTasks = [createdTask, ...bed.nursingTasks];
    const updatedTimeline = logTimeline(
      bed,
      "Orders",
      `New Doctor Order: ${createdOrder.title}`,
      `Category: ${createdOrder.category} | Details: ${createdOrder.details} | Priority: ${createdOrder.priority}`
    );

    onUpdateBed({
      ...bed,
      orders: updatedOrders,
      nursingTasks: updatedTasks,
      marRecords: updatedMAR,
      timeline: updatedTimeline,
    });

    setNewOrder({
      category: "Medication",
      title: "",
      details: "",
      frequency: "BD",
      priority: "Routine",
    });

    alert("Doctor Order active! Corresponding Nursing Task and MAR record automatically generated.");
  };

  // Handler: Administer MAR Medication
  const handleAdministerMAR = (marId: string) => {
    const updatedMAR = bed.marRecords.map((m) => {
      if (m.id === marId) {
        return {
          ...m,
          status: "Administered" as const,
          administeredAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          administeredBy: "Nurse Lakshmi",
        };
      }
      return m;
    });

    const mar = bed.marRecords.find((m) => m.id === marId);
    const updatedTimeline = logTimeline(
      bed,
      "Medications",
      `Medication Administered: ${mar?.drugName || "Drug"}`,
      `Dose: ${mar?.dose} administered by Nurse Lakshmi`,
      "Nurse Lakshmi",
      "Nurse"
    );

    onUpdateBed({
      ...bed,
      marRecords: updatedMAR,
      timeline: updatedTimeline,
    });
  };

  // Handler: Mark Nursing Task Complete
  const handleCompleteTask = (taskId: string) => {
    const updatedTasks = bed.nursingTasks.map((t) => {
      if (t.id === taskId) {
        return {
          ...t,
          status: "COMPLETED" as const,
          completedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          completedBy: "Duty Nurse",
        };
      }
      return t;
    });

    const task = bed.nursingTasks.find((t) => t.id === taskId);
    const updatedTimeline = logTimeline(
      bed,
      "Nursing",
      `Nursing Task Completed: ${task?.title}`,
      `Completed at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} by Duty Nurse`,
      "Duty Nurse",
      "Nurse"
    );

    onUpdateBed({
      ...bed,
      nursingTasks: updatedTasks,
      timeline: updatedTimeline,
    });
  };

  // Handler: Add Progress Note
  const handleAddProgressNote = () => {
    if (!newProgressNote.subjective && !newProgressNote.assessment) {
      alert("Please fill in clinical observations or plan.");
      return;
    }

    const note: ProgressNote = {
      id: "pn-" + Date.now(),
      timeframe: newProgressNote.timeframe,
      date: new Date().toISOString().split("T")[0],
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      author: "Dr. Murali Praveen",
      role: "Attending Consultant",
      subjective: newProgressNote.subjective || "Patient reviewed during ward rounds.",
      objective: newProgressNote.objective || `Vitals: HR ${latestVital?.hr || 80}, BP ${latestVital?.bpSystolic || 120}/${latestVital?.bpDiastolic || 80}, Temp ${latestVital?.temp || 98.4}°F, SpO2 ${latestVital?.spo2 || 98}%`,
      assessment: newProgressNote.assessment || bed.diagnosis || "Inpatient Care",
      plan: newProgressNote.plan || "Continue active treatment protocol.",
      isSigned: true,
    };

    const updatedNotes = [note, ...bed.progressNotes];
    const updatedTimeline = logTimeline(
      bed,
      "Notes",
      `Progress Note Signed (${note.timeframe})`,
      `Assessment: ${note.assessment} | Plan: ${note.plan}`
    );

    onUpdateBed({
      ...bed,
      progressNotes: updatedNotes,
      timeline: updatedTimeline,
    });

    setNewProgressNote({
      timeframe: "Morning",
      subjective: "",
      objective: "",
      assessment: "",
      plan: "",
    });

    alert("Daily Progress Note signed and added to permanent patient chart!");
  };

  // Handler: Acknowledge Clinical Alert
  const handleAcknowledgeAlert = (alertId: string) => {
    const updatedAlerts = bed.alerts.map((a) => {
      if (a.id === alertId) {
        return {
          ...a,
          isAcknowledged: true,
          acknowledgedBy: "Dr. Murali Praveen",
          acknowledgedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
      }
      return a;
    });

    const alertItem = bed.alerts.find((a) => a.id === alertId);
    const updatedTimeline = logTimeline(
      bed,
      "Alerts",
      `Clinical Alert Acknowledged: ${alertItem?.title}`,
      `Acknowledged by Dr. Murali Praveen`
    );

    onUpdateBed({
      ...bed,
      alerts: updatedAlerts,
      timeline: updatedTimeline,
    });
  };

  // Handler: Request Consultation
  const handleRequestConsult = () => {
    if (!newConsult.reason.trim()) {
      alert("Please provide clinical reason for consultation.");
      return;
    }

    const consult: ConsultRequest = {
      id: "con-" + Date.now(),
      specialty: newConsult.specialty,
      consultantName: newConsult.consultantName,
      requestedBy: "Dr. Murali Praveen",
      requestedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      reason: newConsult.reason,
      status: "Pending",
    };

    const updatedConsults = [consult, ...bed.consultations];
    const updatedTimeline = logTimeline(
      bed,
      "Consultations",
      `Specialist Consult Requested (${consult.specialty})`,
      `Consultant: ${consult.consultantName} | Reason: ${consult.reason}`
    );

    onUpdateBed({
      ...bed,
      consultations: updatedConsults,
      timeline: updatedTimeline,
    });

    setNewConsult({ specialty: "Cardiology", consultantName: "Dr. R. K. Sharma", reason: "" });
    alert("Specialist Consultation request transmitted!");
  };

  // Handler: Simulated Monitor OCR Capture
  const handleSimulateMonitorScan = () => {
    setIsScanningMonitor(true);
    setTimeout(() => {
      setIsScanningMonitor(false);
      setOcrDetectedVitals({
        hr: 116,
        bpSystolic: 140,
        bpDiastolic: 88,
        temp: 102.8,
        rr: 24,
        spo2: 92,
      });
    }, 1500);
  };

  const handleConfirmOcrVitals = () => {
    if (ocrDetectedVitals) {
      setNewVital({
        ...newVital,
        hr: ocrDetectedVitals.hr,
        bpSystolic: ocrDetectedVitals.bpSystolic,
        bpDiastolic: ocrDetectedVitals.bpDiastolic,
        temp: ocrDetectedVitals.temp,
        rr: ocrDetectedVitals.rr,
        spo2: ocrDetectedVitals.spo2,
      });
      setOcrDetectedVitals(null);
      alert("Extracted monitor vitals loaded into form. Review and click 'Confirm & Save Vital Record'.");
    }
  };

  // Toggle Pre-op checklist items
  const handleTogglePreOpItem = (key: string) => {
    if (!bed.surgeryDetail || !bed.surgeryDetail.preOpChecklist) return;
    const currentPreOp = { ...bed.surgeryDetail.preOpChecklist };
    if (key === "allChecked") return;

    (currentPreOp as any)[key] = !(currentPreOp as any)[key];

    // Recalculate allChecked
    const allCheckedNow =
      currentPreOp.patientIdentityVerified &&
      currentPreOp.consentSigned &&
      currentPreOp.procedureConfirmed &&
      currentPreOp.siteMarked &&
      currentPreOp.allergyChecked &&
      currentPreOp.npoStatus &&
      currentPreOp.cbcDone &&
      currentPreOp.renalDone &&
      currentPreOp.coagulationProfileDone &&
      currentPreOp.bloodCrossmatched &&
      currentPreOp.anesthesiaFitnessDone;

    currentPreOp.allChecked = allCheckedNow;

    const updatedBed: WardBed = {
      ...bed,
      surgeryDetail: {
        ...bed.surgeryDetail,
        preOpChecklist: currentPreOp,
      },
    };

    onUpdateBed(updatedBed);
  };

  const tabsList = [
    { id: "OVERVIEW", label: "Overview" },
    { id: "VITALS", label: "Vitals & Chart" },
    { id: "ORDERS", label: "Doctor Orders" },
    { id: "MEDICATIONS", label: "MAR (Meds)" },
    { id: "NURSING", label: "Nursing Tasks" },
    { id: "INVESTIGATIONS", label: "Labs & Imaging" },
    { id: "NOTES", label: "Progress Notes" },
    { id: "SURGERY", label: "Pre/Post-Op" },
    { id: "CONSULTATIONS", label: "Consults" },
    { id: "ALERTS", label: "Alerts" },
    { id: "VOICE", label: "Voice Scribe" },
    { id: "VIDEO", label: "Video Consult" },
    { id: "TIMELINE", label: "Timeline" },
    { id: "DISCHARGE", label: "Discharge" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/90 backdrop-blur-md overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-7xl w-full h-[95vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Permanent Patient Header Banner */}
        <div className="bg-slate-950 p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-cyan-600/20 text-cyan-400 border border-cyan-500/40 flex items-center justify-center font-bold text-lg">
              {bed.bedId.slice(-2)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono font-bold text-xs text-cyan-400 bg-cyan-500/20 px-2 py-0.5 rounded border border-cyan-500/30">
                  {bed.bedId} • {bed.wardName} ({bed.roomNumber})
                </span>
                <h2 className="text-lg font-bold text-white">{bed.patientName}</h2>
                <span className="text-xs text-slate-400">
                  {bed.age}Y / {bed.gender} • UHID: <span className="font-mono text-cyan-300">{bed.patientUhid}</span>
                </span>
              </div>
              <div className="text-xs text-slate-300 font-medium mt-1">
                Dx: <span className="text-cyan-300 font-semibold">{bed.diagnosis}</span> • Attending:{" "}
                <span className="text-slate-200">{bed.attendingDoctor}</span> • Admitted: {bed.admissionDate} (Day {bed.admissionDay})
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Safety Score Meter */}
            <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-center">
              <div className="text-[10px] text-slate-400 font-semibold">SAFETY SCORE</div>
              <div
                className={`text-sm font-extrabold font-mono ${
                  (bed.safetyScore || 90) >= 90
                    ? "text-emerald-400"
                    : (bed.safetyScore || 90) >= 80
                    ? "text-amber-400"
                    : "text-rose-400"
                }`}
              >
                {bed.safetyScore || 90}%
              </div>
            </div>

            {/* Emergency Alarm Trigger Button */}
            <button
              onClick={() => onTriggerEmergencyAlarm(bed.patientUhid || "")}
              className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-lg animate-pulse"
            >
              <ShieldAlert className="w-4 h-4" /> Trigger Emergency
            </button>

            <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Workspace Tab Bar */}
        <div className="px-4 py-2 bg-slate-950 border-b border-slate-800/80 flex items-center gap-1 overflow-x-auto scrollbar-none shrink-0">
          {tabsList.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  isActive
                    ? "bg-cyan-600 text-white border border-cyan-400 shadow-md"
                    : "bg-slate-900/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* TAB 1: OVERVIEW */}
          {activeTab === "OVERVIEW" && (
            <div className="space-y-6">
              {/* Patient Safety Status & AI Summary Box */}
              <div className="p-4 sm:p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-cyan-400" />
                    <h3 className="text-sm font-bold text-white">AI Clinical Copilot Overview</h3>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-mono font-bold border ${
                      bed.clinicalStatus === "CRITICAL"
                        ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                        : bed.clinicalStatus === "ATTENTION"
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                        : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                    }`}
                  >
                    Clinical Status: {bed.clinicalStatus}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-200 leading-relaxed italic bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
                  "{bed.aiSummary || "Patient resting comfortably. No acute deterioration noted."}"
                </p>
              </div>

              {/* Latest Vitals Grid */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" /> Current Vital Signs Stream ({latestVital?.timestamp || "N/A"})
                </h3>
                {latestVital ? (
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 font-mono text-xs">
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-500">HEART RATE</div>
                      <div className={`text-base font-extrabold ${latestVital.hr > 100 ? "text-rose-400" : "text-emerald-400"}`}>
                        {latestVital.hr} bpm
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-500">BLOOD PRESSURE</div>
                      <div className="text-base font-extrabold text-cyan-400">
                        {latestVital.bpSystolic}/{latestVital.bpDiastolic}
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-500">TEMPERATURE</div>
                      <div className={`text-base font-extrabold ${latestVital.temp > 100.4 ? "text-amber-400" : "text-slate-200"}`}>
                        {latestVital.temp}°F
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-500">SPO2 SATURATION</div>
                      <div className={`text-base font-extrabold ${latestVital.spo2 < 94 ? "text-rose-400" : "text-cyan-400"}`}>
                        {latestVital.spo2}%
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-500">RESPIRATORY RATE</div>
                      <div className="text-base font-extrabold text-slate-200">{latestVital.rr} /min</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                      <div className="text-[10px] text-slate-500">PAIN SCORE</div>
                      <div className="text-base font-extrabold text-purple-400">{latestVital.painScore || 0}/10</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 italic p-3 bg-slate-950 rounded-xl">No vitals logged yet.</div>
                )}
              </div>

              {/* Quick Actions & Recent Timeline */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Active Doctor Orders */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Active Doctor Orders ({bed.orders.length})</span>
                    <button onClick={() => setActiveTab("ORDERS")} className="text-[11px] text-slate-400 hover:text-white">
                      View All →
                    </button>
                  </h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {bed.orders.map((o) => (
                      <div key={o.id} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 text-xs space-y-1">
                        <div className="font-bold text-cyan-300 flex items-center justify-between">
                          <span>{o.title}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{o.orderedAt}</span>
                        </div>
                        <div className="text-slate-300 text-[11px]">{o.details}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Nursing Tasks Due */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Pending Nursing Tasks ({bed.nursingTasks.filter((t) => t.status !== "COMPLETED").length})</span>
                    <button onClick={() => setActiveTab("NURSING")} className="text-[11px] text-slate-400 hover:text-white">
                      View All →
                    </button>
                  </h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {bed.nursingTasks
                      .filter((t) => t.status !== "COMPLETED")
                      .map((t) => (
                        <div key={t.id} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 text-xs flex items-center justify-between">
                          <div>
                            <div className="font-bold text-slate-200">{t.title}</div>
                            <div className="text-[10px] text-slate-400">Due: {t.dueTime}</div>
                          </div>
                          <button
                            onClick={() => handleCompleteTask(t.id)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-2.5 py-1 rounded text-[10px]"
                          >
                            Mark Done
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: VITALS & GRAPHICAL CHART */}
          {activeTab === "VITALS" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Activity className="w-5 h-5 text-emerald-400" /> Digital Vital Signs & Trend Graphs
                </h3>

                <button
                  onClick={handleSimulateMonitorScan}
                  className="bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold px-3 py-1.5 rounded-xl text-xs border border-cyan-500/30 flex items-center gap-2"
                >
                  <Camera className="w-4 h-4 text-cyan-400" />
                  <span>Scan Bedside Monitor (OCR)</span>
                </button>
              </div>

              {/* Device Monitor OCR Scan Results */}
              {isScanningMonitor && (
                <div className="p-4 bg-slate-950 border border-cyan-500/50 rounded-xl text-center text-cyan-400 text-xs animate-pulse">
                  Scanning Bedside Patient Monitor Screen using Vision AI...
                </div>
              )}

              {ocrDetectedVitals && (
                <div className="p-4 bg-slate-950 border border-emerald-500/50 rounded-xl space-y-3 animate-fadeIn">
                  <div className="text-xs font-bold text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Detected Monitor Vitals via OCR:
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-xs">
                    <div>HR: {ocrDetectedVitals.hr} bpm</div>
                    <div>BP: {ocrDetectedVitals.bpSystolic}/{ocrDetectedVitals.bpDiastolic}</div>
                    <div>Temp: {ocrDetectedVitals.temp}°F</div>
                    <div>SpO2: {ocrDetectedVitals.spo2}%</div>
                    <div>RR: {ocrDetectedVitals.rr} /min</div>
                  </div>
                  <button
                    onClick={handleConfirmOcrVitals}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-1.5 rounded-lg text-xs"
                  >
                    Load into Form Below
                  </button>
                </div>
              )}

              {/* Vitals Graph Trend Chart (Simulated High-Visibility Visual Bar Chart) */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
                <div className="text-xs font-bold text-slate-300">Vital Trends (Temperature °F & Heart Rate bpm)</div>
                <div className="h-32 flex items-end justify-between gap-2 pt-6 pb-2 px-2 border-b border-slate-800">
                  {bed.vitalsHistory.map((v) => (
                    <div key={v.id} className="flex-1 flex flex-col items-center gap-1 group">
                      <div className="text-[9px] font-mono text-cyan-300 opacity-0 group-hover:opacity-100 transition-opacity">
                        HR {v.hr} | {v.temp}°F
                      </div>
                      <div className="w-full max-w-[24px] flex flex-col gap-1 items-center">
                        <div
                          style={{ height: `${Math.min(100, (v.hr / 150) * 80)}px` }}
                          className={`w-full rounded-t ${v.hr > 100 ? "bg-rose-500" : "bg-emerald-500"}`}
                        />
                      </div>
                      <div className="text-[10px] font-mono text-slate-400">{v.timestamp}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Manual Vital Entry Form */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-4">
                <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Log New Vital Measurement</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 font-mono text-xs">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">HR (bpm)</label>
                    <input
                      type="number"
                      value={newVital.hr}
                      onChange={(e) => setNewVital({ ...newVital, hr: Number(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">BP Systolic</label>
                    <input
                      type="number"
                      value={newVital.bpSystolic}
                      onChange={(e) => setNewVital({ ...newVital, bpSystolic: Number(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">BP Diastolic</label>
                    <input
                      type="number"
                      value={newVital.bpDiastolic}
                      onChange={(e) => setNewVital({ ...newVital, bpDiastolic: Number(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Temp (°F)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={newVital.temp}
                      onChange={(e) => setNewVital({ ...newVital, temp: Number(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">SpO2 (%)</label>
                    <input
                      type="number"
                      value={newVital.spo2}
                      onChange={(e) => setNewVital({ ...newVital, spo2: Number(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">RR (/min)</label>
                    <input
                      type="number"
                      value={newVital.rr}
                      onChange={(e) => setNewVital({ ...newVital, rr: Number(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">GCS (3-15)</label>
                    <input
                      type="number"
                      value={newVital.gcs}
                      onChange={(e) => setNewVital({ ...newVital, gcs: Number(e.target.value) })}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-white"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1 flex items-end">
                    <button
                      onClick={handleAddVital}
                      className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold p-1.5 rounded text-xs"
                    >
                      Save Vitals
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: DOCTOR ORDERS */}
          {activeTab === "ORDERS" && (
            <div className="space-y-6">
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-4">
                <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider">Create New Structured Doctor Order</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Order Category</label>
                    <select
                      value={newOrder.category}
                      onChange={(e) => setNewOrder({ ...newOrder, category: e.target.value as any })}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                    >
                      <option value="Medication">Medication</option>
                      <option value="Vital Monitoring">Vital Monitoring</option>
                      <option value="Nursing Instruction">Nursing Instruction</option>
                      <option value="Investigation">Investigation</option>
                      <option value="Oxygen">Oxygen Therapy</option>
                      <option value="Pre-Op Instruction">Pre-Op Instruction</option>
                      <option value="Post-Op Instruction">Post-Op Instruction</option>
                      <option value="Fluid Management">Fluid Management</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Order Title / Drug Name</label>
                    <input
                      type="text"
                      value={newOrder.title}
                      onChange={(e) => setNewOrder({ ...newOrder, title: e.target.value })}
                      placeholder="e.g. Inj. Ceftriaxone 1g IV or Monitor Vitals q2h"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Frequency & Priority</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newOrder.frequency}
                        onChange={(e) => setNewOrder({ ...newOrder, frequency: e.target.value })}
                        placeholder="e.g. BD, TDS, q2h"
                        className="flex-1 bg-slate-900 border border-slate-700 rounded p-2 text-white"
                      />
                      <select
                        value={newOrder.priority}
                        onChange={(e) => setNewOrder({ ...newOrder, priority: e.target.value as any })}
                        className="bg-slate-900 border border-slate-700 rounded p-2 text-white"
                      >
                        <option value="Routine">Routine</option>
                        <option value="Urgent">Urgent</option>
                        <option value="STAT Emergency">STAT Emergency</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Special Clinical Instructions / Dosage Details</label>
                  <input
                    type="text"
                    value={newOrder.details}
                    onChange={(e) => setNewOrder({ ...newOrder, details: e.target.value })}
                    placeholder="Exact instructions for nurses, lab technicians, or pharmacists..."
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-white"
                  />
                </div>

                <button
                  onClick={handleAddOrder}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-5 py-2 rounded-xl text-xs flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Issue Doctor Order & Generate Nursing Task
                </button>
              </div>

              {/* Orders List */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Doctor Orders Log</h3>
                <div className="space-y-2">
                  {bed.orders.map((o) => (
                    <div key={o.id} className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-cyan-300 flex items-center gap-2">
                          <span>{o.title}</span>
                          <span className="text-[10px] font-mono bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded">
                            {o.category}
                          </span>
                        </div>
                        <div className="text-slate-300 text-[11px] mt-0.5">{o.details}</div>
                        <div className="text-[10px] text-slate-500 mt-1">Ordered by {o.orderedBy} at {o.orderedAt}</div>
                      </div>

                      <span
                        className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold ${
                          o.priority === "STAT Emergency" ? "bg-rose-500/20 text-rose-300" : "bg-slate-800 text-slate-300"
                        }`}
                      >
                        {o.priority}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: MEDICATIONS (MAR) */}
          {activeTab === "MEDICATIONS" && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Pill className="w-5 h-5 text-purple-400" /> Digital Medication Administration Record (MAR)
              </h3>

              <div className="space-y-3">
                {bed.marRecords.map((m) => (
                  <div key={m.id} className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                    <div className="space-y-1">
                      <div className="font-bold text-white text-sm flex items-center gap-2">
                        <span>{m.drugName}</span>
                        <span className="text-xs text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded font-mono">
                          {m.dose} ({m.route})
                        </span>
                      </div>
                      <div className="text-slate-400 text-[11px]">Frequency: {m.frequency} • Scheduled: {m.scheduledTime}</div>
                      {m.administeredAt && (
                        <div className="text-emerald-400 text-[11px]">
                          ✓ Administered at {m.administeredAt} by {m.administeredBy}
                        </div>
                      )}
                    </div>

                    {m.status === "Administered" ? (
                      <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-3 py-1 rounded-full font-mono font-bold text-xs">
                        Administered
                      </span>
                    ) : (
                      <button
                        onClick={() => handleAdministerMAR(m.id)}
                        className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-1.5 rounded-lg text-xs"
                      >
                        Administer Dose
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: NURSING TASKS */}
          {activeTab === "NURSING" && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-amber-400" /> Nursing Task Panel & Overdue Escalation
              </h3>

              <div className="space-y-3">
                {bed.nursingTasks.map((t) => (
                  <div key={t.id} className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-slate-200 text-sm flex items-center gap-2">
                        <span>{t.title}</span>
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                            t.status === "OVERDUE" ? "bg-red-500/20 text-red-400 border border-red-500/40" : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {t.status}
                        </span>
                      </div>
                      <div className="text-slate-400 text-[11px]">Due: {t.dueTime} • Assigned: {t.assignedStaff}</div>
                      {t.remarks && <div className="text-amber-300 text-[10px] italic">Note: {t.remarks}</div>}
                    </div>

                    {t.status !== "COMPLETED" && (
                      <button
                        onClick={() => handleCompleteTask(t.id)}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs"
                      >
                        Mark Completed
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 6: INVESTIGATIONS */}
          {activeTab === "INVESTIGATIONS" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-cyan-400" /> Laboratory & Radiology Investigation Tracker
                </h3>
              </div>

              <div className="space-y-3">
                {bed.investigations && bed.investigations.length > 0 ? (
                  bed.investigations.map((inv) => (
                    <div key={inv.id} className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-cyan-300 text-sm flex items-center gap-2">
                          <span>{inv.testName}</span>
                          <span className="text-[10px] font-mono bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded">
                            {inv.category}
                          </span>
                          {inv.isCritical && (
                            <span className="bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2 py-0.5 rounded text-[10px] font-bold animate-pulse">
                              CRITICAL RESULT
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-slate-400">{inv.orderedAt}</span>
                      </div>

                      <div className="text-slate-300 text-xs">
                        <span className="text-slate-500">Result: </span>
                        <span className="font-mono text-white font-semibold">{inv.resultValue || "Awaiting Result Processing..."}</span>
                      </div>

                      <div className="flex items-center justify-between pt-1 text-[10px] text-slate-500">
                        <span>Ordered by {inv.orderedBy}</span>
                        {inv.reviewedBy ? (
                          <span className="text-emerald-400">✓ Reviewed by {inv.reviewedBy} at {inv.reviewedAt}</span>
                        ) : (
                          <span className="text-amber-400 font-bold">Unreviewed Critical Result</span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-6 bg-slate-950 border border-slate-800 rounded-xl text-center text-xs text-slate-500 italic">
                    No active laboratory or radiology investigations ordered for this bed.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 7: PROGRESS NOTES */}
          {activeTab === "NOTES" && (
            <div className="space-y-6">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Bookmark className="w-5 h-5 text-emerald-400" /> Daily Clinical Progress Sheet (SOAP Format)
              </h3>

              {/* Add Progress Note Form */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-cyan-400 uppercase tracking-wider">Draft New Clinical Round Note</span>
                  <select
                    value={newProgressNote.timeframe}
                    onChange={(e) => setNewProgressNote({ ...newProgressNote, timeframe: e.target.value as any })}
                    className="bg-slate-900 border border-slate-700 text-white p-1 rounded font-mono text-xs"
                  >
                    <option value="Morning">Morning Round</option>
                    <option value="Afternoon">Afternoon Round</option>
                    <option value="Evening">Evening Review</option>
                    <option value="Night">Night Call</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Subjective (Symptoms / Patient Complaints)</label>
                    <textarea
                      rows={2}
                      value={newProgressNote.subjective}
                      onChange={(e) => setNewProgressNote({ ...newProgressNote, subjective: e.target.value })}
                      placeholder="e.g. Patient complains of persistent fever and mild shortness of breath..."
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Objective (Examination & Vitals Summary)</label>
                    <textarea
                      rows={2}
                      value={newProgressNote.objective}
                      onChange={(e) => setNewProgressNote({ ...newProgressNote, objective: e.target.value })}
                      placeholder="e.g. Chest: bilateral fine crepitations. Temp 103.1F, HR 118, SpO2 91%..."
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Assessment (Clinical Impression / Impression)</label>
                    <textarea
                      rows={2}
                      value={newProgressNote.assessment}
                      onChange={(e) => setNewProgressNote({ ...newProgressNote, assessment: e.target.value })}
                      placeholder="e.g. Febrile illness with respiratory deterioration; probable secondary lung infection..."
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Plan (Treatment & Orders)</label>
                    <textarea
                      rows={2}
                      value={newProgressNote.plan}
                      onChange={(e) => setNewProgressNote({ ...newProgressNote, plan: e.target.value })}
                      placeholder="e.g. Escalate IV Antibiotics, order stat HRCT Chest, monitor vitals q1h..."
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-xs"
                    />
                  </div>
                </div>

                <button
                  onClick={handleAddProgressNote}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2"
                >
                  <UserCheck className="w-4 h-4" /> Sign & Commit Progress Note to Permanent Chart
                </button>
              </div>

              {/* Logged Progress Notes */}
              <div className="space-y-3">
                {bed.progressNotes && bed.progressNotes.map((pn) => (
                  <div key={pn.id} className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2 text-xs">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-cyan-300 text-sm">{pn.timeframe} Note</span>
                        <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">{pn.date} at {pn.timestamp}</span>
                      </div>
                      <span className="text-emerald-400 font-mono text-[10px]">✓ Digitally Signed by {pn.author} ({pn.role})</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-300 pt-1">
                      <div><strong className="text-slate-400">S (Subjective):</strong> {pn.subjective}</div>
                      <div><strong className="text-slate-400">O (Objective):</strong> {pn.objective}</div>
                      <div><strong className="text-slate-400">A (Assessment):</strong> {pn.assessment}</div>
                      <div><strong className="text-slate-400">P (Plan):</strong> {pn.plan}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 8: SURGERY & PRE-OP */}
          {activeTab === "SURGERY" && (
            <div className="space-y-6">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-purple-400" /> Pre-Operative & Surgical Workflow
              </h3>

              {bed.surgeryDetail ? (
                <div className="space-y-5">
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2">
                    <div className="text-xs font-bold text-purple-300">Procedure: {bed.surgeryDetail.procedureName}</div>
                    <div className="text-xs text-slate-300">
                      Surgeon: {bed.surgeryDetail.surgeonName} • Anesthetist: {bed.surgeryDetail.anesthetistName} • OT: {bed.surgeryDetail.otNumber}
                    </div>
                    <div className="text-xs text-slate-400">Scheduled: {bed.surgeryDetail.scheduledTime}, {bed.surgeryDetail.scheduledDate}</div>
                  </div>

                  {/* Pre-Op Safety Checklist */}
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">WHO Pre-Operative Safety Checklist</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {[
                        { key: "patientIdentityVerified", label: "Patient Identity & Band Verified" },
                        { key: "consentSigned", label: "Surgical Consent Form Signed" },
                        { key: "procedureConfirmed", label: "Surgical Site & Procedure Confirmed" },
                        { key: "siteMarked", label: "Surgical Site Marked by Surgeon" },
                        { key: "allergyChecked", label: "Allergy History Verified" },
                        { key: "npoStatus", label: "NPO Status Verified (NPO >= 6 Hours)" },
                        { key: "cbcDone", label: "Pre-Op CBC & Hemoglobin Verified" },
                        { key: "bloodCrossmatched", label: "Blood Units Reserved/Crossmatched" },
                        { key: "anesthesiaFitnessDone", label: "Anesthesia Pre-Op Fitness Completed" },
                        { key: "antibioticProphylaxisGiven", label: "Pre-Op Antibiotic Prophylaxis Administered" },
                      ].map((item) => {
                        const isChecked = (bed.surgeryDetail?.preOpChecklist as any)?.[item.key];
                        return (
                          <button
                            key={item.key}
                            onClick={() => handleTogglePreOpItem(item.key as any)}
                            className={`p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                              isChecked
                                ? "bg-emerald-950/30 border-emerald-500/40 text-emerald-300"
                                : "bg-slate-900 border-slate-800 text-slate-400"
                            }`}
                          >
                            <span>{item.label}</span>
                            {isChecked ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <div className="w-4 h-4 border rounded border-slate-600" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 bg-slate-950 border border-slate-800 rounded-xl text-center text-xs text-slate-500 italic">
                  Patient is not currently scheduled for surgical procedure.
                </div>
              )}
            </div>
          )}

          {/* TAB 9: CONSULTATIONS */}
          {activeTab === "CONSULTATIONS" && (
            <div className="space-y-6">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <PhoneCall className="w-5 h-5 text-cyan-400" /> Specialist Consultation Requests & Recommendations
              </h3>

              {/* Request New Consult Form */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3 text-xs">
                <h4 className="font-bold text-cyan-400 uppercase tracking-wider">Request New Specialist Consultation</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Target Specialty</label>
                    <select
                      value={newConsult.specialty}
                      onChange={(e) => setNewConsult({ ...newConsult, specialty: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                    >
                      <option value="Cardiology">Cardiology</option>
                      <option value="Pulmonology">Pulmonology</option>
                      <option value="Nephrology">Nephrology</option>
                      <option value="Infectious Disease">Infectious Disease</option>
                      <option value="General Surgery">General Surgery</option>
                      <option value="Anesthesiology">Anesthesiology</option>
                      <option value="Neurology">Neurology</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Consultant Name</label>
                    <input
                      type="text"
                      value={newConsult.consultantName}
                      onChange={(e) => setNewConsult({ ...newConsult, consultantName: e.target.value })}
                      placeholder="e.g. Dr. R. K. Sharma"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Reason for Consult & Specific Clinical Question</label>
                  <textarea
                    rows={2}
                    value={newConsult.reason}
                    onChange={(e) => setNewConsult({ ...newConsult, reason: e.target.value })}
                    placeholder="e.g. Uncontrolled tachycardia and persistent fever; evaluate for secondary infection..."
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white text-xs"
                  />
                </div>

                <button
                  onClick={handleRequestConsult}
                  className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2"
                >
                  <PhoneCall className="w-4 h-4" /> Transmit Specialist Consult Request
                </button>
              </div>

              {/* Logged Consultations */}
              <div className="space-y-3">
                {bed.consultations && bed.consultations.map((c) => (
                  <div key={c.id} className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-2 text-xs">
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                      <span className="font-bold text-cyan-300 text-sm">{c.specialty} Consult ({c.consultantName})</span>
                      <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded font-mono font-bold">{c.status}</span>
                    </div>
                    <div className="text-slate-300"><strong>Reason:</strong> {c.reason}</div>
                    <div className="text-[10px] text-slate-500">Requested by {c.requestedBy} at {c.requestedAt}</div>

                    {c.consultantNotes && (
                      <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-emerald-300 mt-2">
                        <strong>Consultant Recommendations:</strong> {c.consultantNotes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 11: ALERTS */}
          {activeTab === "ALERTS" && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-400" /> Patient Safety & Trend Deterioration Alerts
              </h3>

              <div className="space-y-3">
                {bed.alerts.map((a) => (
                  <div key={a.id} className="p-4 bg-slate-950 border border-rose-500/40 rounded-xl space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-rose-300 text-sm">{a.title}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{a.detectedAt}</span>
                    </div>
                    <div className="text-slate-300">{a.description}</div>
                    {a.trendData && <div className="text-[11px] font-mono text-amber-300 bg-slate-900 p-2 rounded">{a.trendData}</div>}

                    {a.isAcknowledged ? (
                      <div className="text-emerald-400 text-[10px]">
                        ✓ Acknowledged by {a.acknowledgedBy} at {a.acknowledgedAt}
                      </div>
                    ) : (
                      <button
                        onClick={() => handleAcknowledgeAlert(a.id)}
                        className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-3 py-1 rounded text-xs"
                      >
                        Acknowledge Alert
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 13: VOICE SCRIBE */}
          {activeTab === "VOICE" && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Mic className="w-5 h-5 text-cyan-400" /> Voice-to-Order & Clinical Audio Dictation
              </h3>

              <div className="p-5 bg-slate-950 border border-slate-800 rounded-2xl space-y-4">
                <div className="text-xs text-slate-300">
                  Speak naturally to dictate doctor orders, progress notes, or clinical instructions. AI converts speech to structured draft orders requiring doctor review & approval.
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setIsDictating(!isDictating);
                      if (!isDictating) {
                        setDictationText("Monitor vitals every 2 hours, give Paracetamol 650mg orally if temp above 100.4F, and order CBC report stat.");
                      }
                    }}
                    className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                      isDictating
                        ? "bg-rose-600 text-white animate-bounce"
                        : "bg-cyan-600 hover:bg-cyan-500 text-white"
                    }`}
                  >
                    <Mic className="w-4 h-4" />
                    <span>{isDictating ? "Stop Recording Voice" : "Start Voice Dictation"}</span>
                  </button>
                </div>

                {dictationText && (
                  <div className="p-4 bg-slate-900 border border-cyan-500/40 rounded-xl space-y-3">
                    <div className="text-xs font-bold text-cyan-300">AI Transcribed Clinical Voice Dictation:</div>
                    <div className="text-xs text-slate-200 italic font-mono bg-slate-950 p-3 rounded">"{dictationText}"</div>
                    <button
                      onClick={() => {
                        setNewOrder({
                          category: "Medication",
                          title: "Paracetamol 650mg PO",
                          details: "PRN Fever > 100.4°F",
                          frequency: "q6h PRN",
                          priority: "Urgent",
                        });
                        setActiveTab("ORDERS");
                        alert("Voice dictation converted into draft order! Confirm under Orders tab.");
                      }}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-1.5 rounded-lg text-xs"
                    >
                      Convert Speech into Active Orders
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 14: VIDEO CONSULT */}
          {activeTab === "VIDEO" && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Video className="w-5 h-5 text-cyan-400" /> Bedside Secure Video Consultation
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Simulated Live Video Screen */}
                <div className="md:col-span-2 bg-slate-950 border border-slate-800 rounded-2xl h-80 relative flex items-center justify-center overflow-hidden shadow-2xl">
                  {isVideoConnected ? (
                    <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 flex flex-col items-center justify-center p-4 relative">
                      <div className="w-20 h-20 rounded-full bg-cyan-600/30 text-cyan-400 flex items-center justify-center font-bold text-xl border border-cyan-500/50">
                        {bed.patientName.slice(0, 2)}
                      </div>
                      <div className="font-bold text-white text-sm mt-2">{bed.patientName} (Demo picture, not a camera)</div>
                      <div className="text-xs text-emerald-400 font-mono mt-1">● Not a live camera</div>

                      {/* Vitals overlay */}
                      <div className="absolute bottom-3 left-3 bg-slate-950/80 backdrop-blur p-2 rounded-lg border border-slate-800 font-mono text-[10px] text-cyan-300">
                        HR: {latestVital?.hr} bpm | BP: {latestVital?.bpSystolic}/{latestVital?.bpDiastolic} | SpO2: {latestVital?.spo2}%
                      </div>
                    </div>
                  ) : (
                    <div className="text-center space-y-3">
                      <Video className="w-12 h-12 text-slate-600 mx-auto" />
                      <div className="text-xs text-slate-400">Initiate encrypted telemedicine call with patient bedside tablet</div>
                      <button
                        onClick={() => setIsVideoConnected(true)}
                        className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-4 py-2 rounded-xl text-xs"
                      >
                        Show a demo picture. No camera.
                      </button>
                    </div>
                  )}
                </div>

                {/* Consultation Chat & Order Entry */}
                <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="text-xs font-bold text-white">Demo notes, not a live call</div>
                    <div className="p-3 bg-slate-900 rounded-xl text-xs text-slate-300 h-48 overflow-y-auto italic">
                      [System]: Demo notes only. No call was placed.
                      {isVideoConnected && "\n[Doctor]: Patient appears oriented, mild tachypnea noted."}
                    </div>
                  </div>

                  {isVideoConnected && (
                    <button
                      onClick={() => setIsVideoConnected(false)}
                      className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold py-2 rounded-xl text-xs"
                    >
                      End Call & Save Summary
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 15: TIMELINE */}
          {activeTab === "TIMELINE" && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-cyan-400" /> Complete Chronological Audit Timeline
              </h3>

              <div className="space-y-3 border-l-2 border-slate-800 pl-4">
                {bed.timeline.map((event) => (
                  <div key={event.id} className="relative group">
                    <div className="w-3 h-3 rounded-full bg-cyan-500 absolute -left-[23px] top-1 border-2 border-slate-900" />
                    <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-cyan-300">{event.title}</span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {event.date} {event.timestamp}
                        </span>
                      </div>
                      <div className="text-slate-300">{event.details}</div>
                      <div className="text-[10px] text-slate-500">
                        Logged by {event.user} ({event.role})
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 16: DISCHARGE */}
          {activeTab === "DISCHARGE" && (
            <div className="space-y-5">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-emerald-400" /> Discharge Readiness Tracker
              </h3>

              <div className="p-4 bg-slate-950 border border-slate-800 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">Discharge Readiness Percentage</span>
                  <span className="text-sm font-extrabold font-mono text-emerald-400">
                    {bed.dischargeChecklist.readinessPercentage}%
                  </span>
                </div>
                <div className="w-full bg-slate-900 h-3 rounded-full overflow-hidden border border-slate-800">
                  <div
                    style={{ width: `${bed.dischargeChecklist.readinessPercentage}%` }}
                    className="h-full bg-emerald-500 rounded-full transition-all"
                  />
                </div>

                {bed.dischargeChecklist.blockers.length > 0 && (
                  <div className="p-3 bg-rose-950/20 border border-rose-500/30 rounded-xl space-y-1">
                    <div className="text-xs font-bold text-rose-300">Active Discharge Blockers:</div>
                    <ul className="list-disc list-inside text-xs text-slate-300 space-y-1">
                      {bed.dischargeChecklist.blockers.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
