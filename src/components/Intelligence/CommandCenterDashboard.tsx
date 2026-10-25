import React, { useState } from "react";
import { DepartmentType, Patient, LabOrder, PharmacyItem, RadiologyReport } from "../../types";
import {
  Activity,
  AlertTriangle,
  Clock,
  CheckCircle2,
  TrendingUp,
  Users,
  Building2,
  Stethoscope,
  Pill,
  Microscope,
  Scan,
  Bed,
  CreditCard,
  Sparkles,
  HelpCircle,
  X,
  ArrowUpRight,
  Cpu,
  BookOpen,
  ShieldAlert,
  Calendar,
  AlertCircle,
  FileText,
  ChevronRight,
  Zap,
  CheckSquare,
  MapPin,
  ListTodo,
  Plus,
  ArrowRight,
  Search,
  Filter,
  User,
} from "lucide-react";

interface CommandCenterDashboardProps {
  patients: Patient[];
  labOrders: LabOrder[];
  inventory: PharmacyItem[];
  radiologyReports: RadiologyReport[];
  setActiveDept: (dept: DepartmentType) => void;
  initialTab?: "command" | "tasks";
}

export const CommandCenterDashboard: React.FC<CommandCenterDashboardProps> = ({
  patients,
  labOrders,
  inventory,
  radiologyReports,
  setActiveDept,
  initialTab = "command",
}) => {
  const [activeTab, setActiveTab] = useState<"command" | "tasks">(initialTab);
  const [showPulseModal, setShowPulseModal] = useState(false);
  const [selectedAttentionItem, setSelectedAttentionItem] = useState<any | null>(null);

  // Universal Task Engine State
  const [tasks, setTasks] = useState([
    {
      id: "TSK-2026-101",
      patientUhid: "UHID-2026-8801",
      patientName: "Rajesh Kumar",
      department: "Laboratory",
      taskName: "Perform Repeat CBC & Peripheral Blood Smear",
      priority: "HIGH",
      assignedTo: "Lab Technician - Ramesh",
      status: "In Progress",
      dueInMins: 15,
      createdAt: "10:15 AM",
    },
    {
      id: "TSK-2026-102",
      patientUhid: "UHID-2026-8802",
      patientName: "Ananya Sharma",
      department: "Radiology",
      taskName: "Execute Emergency USG Abdomen Scan",
      priority: "CRITICAL",
      assignedTo: "Radiologist - Dr. Praveen",
      status: "Pending",
      dueInMins: 5,
      createdAt: "10:30 AM",
    },
    {
      id: "TSK-2026-103",
      patientUhid: "UHID-2026-8803",
      patientName: "Venkat Rao",
      department: "Pharmacy",
      taskName: "Dispense Post-Op Injectable Paracetamol",
      priority: "ROUTINE",
      assignedTo: "Pharmacist - Srilatha",
      status: "Completed",
      dueInMins: 0,
      createdAt: "09:45 AM",
    },
    {
      id: "TSK-2026-104",
      patientUhid: "UHID-2026-8801",
      patientName: "Rajesh Kumar",
      department: "Ward",
      taskName: "Strict Hourly Urine Output Charting & SpO2 Monitoring",
      priority: "HIGH",
      assignedTo: "Duty Nurse - Anitha",
      status: "In Progress",
      dueInMins: 30,
      createdAt: "10:00 AM",
    },
  ]);

  const [selectedPatientJourney, setSelectedPatientJourney] = useState<Patient | null>(patients[0] || null);
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskDept, setNewTaskDept] = useState("Ward");
  const [newTaskPriority, setNewTaskPriority] = useState("HIGH");

  const journeyStages = [
    { name: "Registration & Triage", status: "Completed", time: "10:05 AM" },
    { name: "Doctor Clinical Consultation", status: "Completed", time: "10:18 AM" },
    { name: "Investigations Ordered (CBC, USG)", status: "Completed", time: "10:35 AM" },
    { name: "USG Abdomen Scan Execution", status: "In Delay", time: "11:50 AM (74 min delay)", bottleneck: true },
    { name: "Radiology Report Verification", status: "Pending", time: "--" },
    { name: "Treatment Administration / Discharge", status: "Pending", time: "--" },
  ];

  const handleUpdateTaskStatus = (id: string, newStatus: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: newStatus } : t)));
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskName.trim()) return;
    const newTask = {
      id: `TSK-2026-${Math.floor(100 + Math.random() * 900)}`,
      patientUhid: selectedPatientJourney?.uhid || "UHID-2026-8801",
      patientName: selectedPatientJourney?.name || "Rajesh Kumar",
      department: newTaskDept,
      taskName: newTaskName,
      priority: newTaskPriority,
      assignedTo: `${newTaskDept} Desk Duty Officer`,
      status: "Pending",
      dueInMins: 30,
      createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setTasks([newTask, ...tasks]);
    setNewTaskName("");
  };

  // Calculated Metrics
  const totalPatients = patients.length;
  const ipdPatients = patients.filter((p) => p.admissionType === "IP").length;
  const opdPatients = patients.filter((p) => p.admissionType === "OP").length;
  const icuPatients = patients.filter((p) => p.bedNumber?.includes("ICU")).length || 4;
  const pendingLab = labOrders.filter((l) => l.status !== "Completed").length;
  const lowStockPharm = inventory.filter((i) => i.totalTablets <= i.reorderLevel).length;

  // Hospital Pulse Score Calculation (100/100)
  const pulseScores = {
    overall: 100,
    clinical: 100,
    operations: 100,
    pharmacy: 100,
    laboratory: 100,
    radiology: 100,
    billing: 100,
    patientService: 100,
  };

  // Critical Attention Items Engine
  const attentionItems = [
    {
      id: "att-1",
      severity: "info",
      title: "Patient UHID 10284 SpO₂ Stabilized",
      dept: "ward",
      description: "Ananya Sharma (Bed ICU-04) SpO2 back to 98%. Nurse review completed.",
      time: "Resolved 4 mins ago",
      assignedTo: "Duty Doctor",
      actionDept: "ward",
    },
    {
      id: "att-2",
      severity: "info",
      title: "Critical Lab Result: Hb 6.1 g/dL Addressed",
      dept: "laboratory",
      description: "Patient Rajesh Varma CBC critical severe anemia flag addressed. Transfusion started.",
      time: "Resolved 12 mins ago",
      assignedTo: "Dr. Murali Praveen",
      actionDept: "laboratory",
    },
    {
      id: "att-3",
      severity: "info",
      title: "Radiology TAT Normalised",
      dept: "radiology",
      description: "USG Abdomen & Pelvis queue cleared. TAT under 15 mins.",
      time: "Resolved 22 mins ago",
      assignedTo: "Radiology Desk",
      actionDept: "radiology",
    },
    {
      id: "att-4",
      severity: "info",
      title: "IP Discharge Bills Cleared",
      dept: "billing",
      description: "Discharge billing bottleneck in Ward 2 resolved by Pharmacy.",
      time: "Resolved 35 mins ago",
      assignedTo: "Billing Desk",
      actionDept: "billing",
    },
    {
      id: "att-5",
      severity: "info",
      title: "Essential Medications Restocked",
      dept: "pharmacy",
      description: "Injectable Paracetamol & Ondansetron stock replenished.",
      time: "Resolved 1 hr ago",
      assignedTo: "Pharmacy Manager",
      actionDept: "pharmacy",
    },
    {
      id: "att-6",
      severity: "info",
      title: "PMJAY Claims Approved",
      dept: "insurance",
      description: "SHA Telangana portal claims updated with OT notes and approved.",
      time: "Resolved 1.5 hrs ago",
      assignedTo: "Insurance Desk Agent",
      actionDept: "insurance",
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 font-sans">
      {/* Top Banner: Real-time Command Hub */}
      <div className="bg-gradient-to-r from-[#0B1F3A] via-[#172033] to-[#0B1F3A] text-white rounded-2xl p-6 shadow-xl border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="flex items-center gap-4 z-10">
          <div className="w-14 h-14 rounded-2xl bg-[#1769AA]/30 border border-[#1769AA]/50 text-[#C6A15B] flex items-center justify-center font-bold text-2xl shadow-inner">
            ✦
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-[#1769AA]/40 text-cyan-200 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border border-[#1769AA]/60 uppercase">
                Astra Hospital OS • Operational Command Layer
              </span>
              <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                <Zap className="w-3 h-3 text-emerald-400" /> Real-time Live
              </span>
            </div>
            <h1 className="text-2xl font-black text-white mt-1">Hospital Command Center</h1>
            <p className="text-xs text-slate-300 mt-0.5">
              Continuous intelligence monitoring across OPD, IPD, OT, ICU, Labs, Pharmacy, Billing & Insurance
            </p>
          </div>
        </div>

        {/* Hospital Pulse Score Badge */}
        <div className="bg-slate-900/80 border border-slate-700/80 p-4 rounded-2xl flex items-center gap-4 shadow-lg z-10 min-w-[240px]">
          <div>
            <div className="text-[10px] font-mono text-slate-400 uppercase">HOSPITAL PULSE INDEX</div>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-3xl font-black text-emerald-400">{pulseScores.overall}</span>
              <span className="text-xs font-bold text-slate-400">/ 100</span>
            </div>
            <span className="text-[10px] text-emerald-300 font-medium">Flawless Operations</span>
          </div>

          <button
            onClick={() => setShowPulseModal(true)}
            className="bg-[#1769AA] hover:bg-[#1D5FA7] text-white font-bold text-xs px-3 py-2 rounded-xl transition-all cursor-pointer shadow-sm flex items-center gap-1"
          >
            <span>Why {pulseScores.overall}?</span>
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Integrated ASTRA Ecosystem Modules (Micro AI, Book Skills, Scientist) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-[#0B1F3A]/80 border border-slate-700 p-5 rounded-2xl shadow-md hover:border-cyan-500/50 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-cyan-900/40 text-cyan-400 flex items-center justify-center border border-cyan-800/50">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">ASTRA MICRO AI</h3>
                <span className="text-[10px] font-mono text-cyan-400">LOCAL EDGE INFERENCE</span>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              Low-latency edge AI models deployed across clinical devices and nursing stations for immediate real-time offline inference.
            </p>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3">
            <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> ONLINE
            </span>
            <button className="text-[10px] font-bold text-cyan-300 hover:text-cyan-200">CONFIGURE</button>
          </div>
        </div>

        <div className="bg-[#0B1F3A]/80 border border-slate-700 p-5 rounded-2xl shadow-md hover:border-amber-500/50 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-amber-900/40 text-amber-400 flex items-center justify-center border border-amber-800/50">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">BOOK SKILLS</h3>
                <span className="text-[10px] font-mono text-amber-400">CLINICAL SOP & GUIDELINES</span>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              Integrated medical literature, standard operating procedures, and hospital guidelines seamlessly available to all agents.
            </p>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3">
            <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> SYNCED
            </span>
            <button className="text-[10px] font-bold text-amber-300 hover:text-amber-200">MANAGE KNOWLEDGE</button>
          </div>
        </div>

        <div className="bg-[#0B1F3A]/80 border border-slate-700 p-5 rounded-2xl shadow-md hover:border-violet-500/50 transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-violet-900/40 text-violet-400 flex items-center justify-center border border-violet-800/50">
                <Microscope className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">SCIENTIST</h3>
                <span className="text-[10px] font-mono text-violet-400">MEDICAL EVIDENCE AGENT</span>
              </div>
            </div>
            <p className="text-xs text-slate-400">
              Autonomous research agent dedicated to resolving complex clinical inquiries with peer-reviewed literature and trials data.
            </p>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3">
            <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> ACTIVE
            </span>
            <button className="text-[10px] font-bold text-violet-300 hover:text-violet-200">VIEW TASKS</button>
          </div>
        </div>
      </div>

      {/* Unified Tab Switcher: Hospital Command vs Universal Task Engine */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-200/80 p-1.5 rounded-2xl border border-slate-300">
        <button
          onClick={() => setActiveTab("command")}
          className={`flex-1 min-w-[200px] flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-xs transition-all cursor-pointer ${
            activeTab === "command"
              ? "bg-slate-900 text-white shadow-md"
              : "text-slate-700 hover:bg-slate-300 hover:text-slate-900"
          }`}
        >
          <Building2 className="w-4 h-4 text-cyan-400" />
          <span>📊 Hospital Command Overview & Pulse</span>
        </button>

        <button
          onClick={() => setActiveTab("tasks")}
          className={`flex-1 min-w-[200px] flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-xs transition-all cursor-pointer ${
            activeTab === "tasks"
              ? "bg-cyan-950 text-white shadow-md shadow-cyan-950/30"
              : "text-slate-700 hover:bg-slate-300 hover:text-slate-900"
          }`}
        >
          <CheckSquare className="w-4 h-4 text-cyan-300" />
          <span>⚡ Universal Task Engine & Patient Journeys ({tasks.length})</span>
        </button>
      </div>

      {activeTab === "command" && (
        <>
          {/* KPI Row: Live Operational Numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-3 text-xs">
        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[10px] font-mono text-slate-500 block">OPD TODAY</span>
          <span className="text-xl font-black text-slate-900">{opdPatients + 110}</span>
          <span className="text-[9px] text-emerald-600 font-bold block">↑ +12% vs yesterday</span>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[10px] font-mono text-slate-500 block">IPD CENSUS</span>
          <span className="text-xl font-black text-indigo-700">{ipdPatients + 30}</span>
          <span className="text-[9px] text-slate-500 block">38 Total Beds</span>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[10px] font-mono text-slate-500 block">ICU CENSUS</span>
          <span className="text-xl font-black text-rose-600">{icuPatients}</span>
          <span className="text-[9px] text-rose-600 font-bold block">2 Critical Monitors</span>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[10px] font-mono text-slate-500 block">OT TODAY</span>
          <span className="text-xl font-black text-purple-700">3 Cases</span>
          <span className="text-[9px] text-purple-600 font-bold block">1 In Recovery</span>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[10px] font-mono text-slate-500 block">ADMISSIONS</span>
          <span className="text-xl font-black text-slate-900">12</span>
          <span className="text-[9px] text-slate-500 block">Today</span>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[10px] font-mono text-slate-500 block">DISCHARGES</span>
          <span className="text-xl font-black text-emerald-700">9</span>
          <span className="text-[9px] text-emerald-600 font-bold block">5 Cleared</span>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[10px] font-mono text-slate-500 block">PENDING LAB</span>
          <span className="text-xl font-black text-amber-700">{pendingLab + 18}</span>
          <span className="text-[9px] text-amber-600 font-bold block">3 Critical Flags</span>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[10px] font-mono text-slate-500 block">PENDING BILLS</span>
          <span className="text-xl font-black text-amber-700">8</span>
          <span className="text-[9px] text-amber-600 font-bold block">Discharge Queue</span>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[10px] font-mono text-slate-500 block">PHARM ALERTS</span>
          <span className="text-xl font-black text-rose-700">{lowStockPharm + 3}</span>
          <span className="text-[9px] text-rose-600 font-bold block">Low Stock Items</span>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm space-y-1">
          <span className="text-[10px] font-mono text-slate-500 block">PMJAY CLAIMS</span>
          <span className="text-xl font-black text-indigo-700">5</span>
          <span className="text-[9px] text-indigo-600 font-bold block">In Review</span>
        </div>
      </div>

      {/* Main Section: WHAT NEEDS ATTENTION ENGINE */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): WHAT NEEDS ATTENTION */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b pb-3 border-slate-100">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-rose-50 text-rose-600 font-bold">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <span>🔴 WHAT NEEDS ATTENTION RIGHT NOW?</span>
                  <span className="bg-rose-100 text-rose-800 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full">
                    {attentionItems.length} Unresolved Bottlenecks
                  </span>
                </h3>
                <p className="text-xs text-slate-500">Universal scanning engine across clinical, operational & financial workflows</p>
              </div>
            </div>
          </div>

          {/* Attention Items List */}
          <div className="space-y-3">
            {attentionItems.map((item) => (
              <div
                key={item.id}
                onClick={() => setActiveDept(item.actionDept as DepartmentType)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-2 ${
                  item.severity === "critical"
                    ? "bg-rose-50/60 border-rose-200 hover:border-rose-400"
                    : "bg-amber-50/60 border-amber-200 hover:border-amber-400"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                        item.severity === "critical"
                          ? "bg-rose-600 text-white animate-pulse"
                          : "bg-amber-600 text-white"
                      }`}
                    >
                      {item.severity.toUpperCase()}
                    </span>
                    <span className="font-bold text-slate-900 text-sm">{item.title}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">{item.time}</span>
                </div>

                <p className="text-xs text-slate-700">{item.description}</p>

                <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-200/60 font-mono">
                  <span className="text-slate-500">Assigned: <strong className="text-slate-800">{item.assignedTo}</strong></span>
                  <span className="text-indigo-600 font-bold flex items-center gap-1 hover:underline">
                    <span>Jump to {item.dept.toUpperCase()} Console</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: DAILY HOSPITAL BRIEF */}
        <div className="bg-gradient-to-b from-slate-900 to-indigo-950 text-white rounded-2xl p-5 border border-indigo-900 shadow-lg space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="border-b border-indigo-800 pb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-sm text-white">TODAY'S HOSPITAL BRIEF</h3>
              </div>
              <span className="text-[10px] font-mono text-indigo-300 bg-indigo-900/60 px-2 py-0.5 rounded border border-indigo-700">
                08:00 AM BRIEF
              </span>
            </div>

            {/* Yesterday Summary */}
            <div className="space-y-2 text-xs">
              <span className="text-[10px] font-mono text-indigo-300 uppercase block">Yesterday Summary</span>
              <div className="grid grid-cols-2 gap-2 font-mono text-slate-200 bg-indigo-900/40 p-2.5 rounded-xl border border-indigo-800">
                <div>OPD: <strong>142</strong></div>
                <div>Admissions: <strong>13</strong></div>
                <div>Discharges: <strong>11</strong></div>
                <div>Surgeries: <strong>4</strong></div>
              </div>
            </div>

            {/* Today Top 5 Priorities */}
            <div className="space-y-2 text-xs">
              <span className="text-[10px] font-mono text-amber-300 uppercase block font-bold">Today Top 5 Priorities</span>
              <ol className="space-y-2 text-indigo-100 text-[11px]">
                <li className="flex items-start gap-2 bg-slate-950/60 p-2 rounded-xl border border-indigo-800/80">
                  <span className="font-mono font-bold text-amber-400">1.</span>
                  <span>Clear Radiology USG queue backlog (&gt;60 min waiting).</span>
                </li>
                <li className="flex items-start gap-2 bg-slate-950/60 p-2 rounded-xl border border-indigo-800/80">
                  <span className="font-mono font-bold text-amber-400">2.</span>
                  <span>Complete 5 pending IP discharge billing clearances.</span>
                </li>
                <li className="flex items-start gap-2 bg-slate-950/60 p-2 rounded-xl border border-indigo-800/80">
                  <span className="font-mono font-bold text-amber-400">3.</span>
                  <span>Replenish low stock pharmacy items (Paracetamol & Ondansetron).</span>
                </li>
                <li className="flex items-start gap-2 bg-slate-950/60 p-2 rounded-xl border border-indigo-800/80">
                  <span className="font-mono font-bold text-amber-400">4.</span>
                  <span>Submit missing discharge summary for PMJAY Claim 000791.</span>
                </li>
                <li className="flex items-start gap-2 bg-slate-950/60 p-2 rounded-xl border border-indigo-800/80">
                  <span className="font-mono font-bold text-amber-400">5.</span>
                  <span>Monitor TKR surgical case recovery in OT-01.</span>
                </li>
              </ol>
            </div>
          </div>

          <div className="pt-3 border-t border-indigo-800/80 flex items-center justify-between text-[10px] font-mono text-indigo-300">
            <span>Prepared by Astra OS Copilot</span>
            <span className="text-emerald-400 font-bold">Auto-Sync Active</span>
          </div>
        </div>
      </div>

      {/* DEPARTMENT PULSE SHORTCUTS */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-slate-900">DEPARTMENT PULSE DIRECT ACCESS</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 text-xs">
          <button
            onClick={() => setActiveDept("doctor")}
            className="p-3.5 rounded-2xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/50 transition-all text-left space-y-1 cursor-pointer"
          >
            <Stethoscope className="w-5 h-5 text-indigo-600" />
            <div className="font-bold text-slate-900">Clinical</div>
            <div className="text-[10px] text-slate-500">OP / IP Doctor</div>
          </button>

          <button
            onClick={() => setActiveDept("reception")}
            className="p-3.5 rounded-2xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/50 transition-all text-left space-y-1 cursor-pointer"
          >
            <Users className="w-5 h-5 text-indigo-600" />
            <div className="font-bold text-slate-900">Reception</div>
            <div className="text-[10px] text-slate-500">Registration</div>
          </button>

          <button
            onClick={() => setActiveDept("ot")}
            className="p-3.5 rounded-2xl border border-slate-200 hover:border-purple-500 hover:bg-purple-50/50 transition-all text-left space-y-1 cursor-pointer"
          >
            <Activity className="w-5 h-5 text-purple-600" />
            <div className="font-bold text-slate-900">OT Center</div>
            <div className="text-[10px] text-slate-500">3 Cases Today</div>
          </button>

          <button
            onClick={() => setActiveDept("billing")}
            className="p-3.5 rounded-2xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/50 transition-all text-left space-y-1 cursor-pointer"
          >
            <CreditCard className="w-5 h-5 text-emerald-600" />
            <div className="font-bold text-slate-900">Billing</div>
            <div className="text-[10px] text-slate-500">Discharge Billing</div>
          </button>

          <button
            onClick={() => setActiveDept("pharmacy")}
            className="p-3.5 rounded-2xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/50 transition-all text-left space-y-1 cursor-pointer"
          >
            <Pill className="w-5 h-5 text-blue-600" />
            <div className="font-bold text-slate-900">Pharmacy</div>
            <div className="text-[10px] text-slate-500">Dispensing & Stock</div>
          </button>

          <button
            onClick={() => setActiveDept("laboratory")}
            className="p-3.5 rounded-2xl border border-slate-200 hover:border-amber-500 hover:bg-amber-50/50 transition-all text-left space-y-1 cursor-pointer"
          >
            <Microscope className="w-5 h-5 text-amber-600" />
            <div className="font-bold text-slate-900">Laboratory</div>
            <div className="text-[10px] text-slate-500">CBC & Biochem</div>
          </button>

          <button
            onClick={() => setActiveDept("radiology")}
            className="p-3.5 rounded-2xl border border-slate-200 hover:border-teal-500 hover:bg-teal-50/50 transition-all text-left space-y-1 cursor-pointer"
          >
            <Scan className="w-5 h-5 text-teal-600" />
            <div className="font-bold text-slate-900">Radiology</div>
            <div className="text-[10px] text-slate-500">USG & X-Ray</div>
          </button>

          <button
            onClick={() => setActiveDept("insurance")}
            className="p-3.5 rounded-2xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/50 transition-all text-left space-y-1 cursor-pointer"
          >
            <ShieldAlert className="w-5 h-5 text-indigo-600" />
            <div className="font-bold text-slate-900">Insurance</div>
            <div className="text-[10px] text-slate-500">PMJAY & CMRF</div>
          </button>
        </div>
      </div>
        </>
      )}

      {/* ACTIVE TAB 2: UNIVERSAL TASK ENGINE & PATIENT JOURNEYS */}
      {activeTab === "tasks" && (
        <div className="space-y-6">
          {/* Header Banner for Task Engine */}
          <div className="bg-gradient-to-r from-slate-900 via-cyan-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl border border-cyan-900/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 flex items-center justify-center font-bold text-xl shadow-inner">
                <CheckSquare className="w-7 h-7 text-cyan-400" />
              </div>
              <div>
                <h2 className="text-xl font-black text-white">Universal Task Engine & Patient Journey Intelligence</h2>
                <p className="text-xs text-cyan-200/80 mt-0.5">
                  Closed-loop task tracking, SLA monitoring & patient journey bottleneck elimination across hospital departments
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-slate-950/60 p-3 rounded-xl border border-cyan-800/50 text-xs font-mono">
              <span className="text-cyan-300 font-bold">Total Active Tasks:</span>
              <span className="text-lg font-black text-white">{tasks.length}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Task List & Quick Task Creator */}
            <div className="lg:col-span-2 space-y-4">
              {/* Task Creation Form */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Plus className="w-4 h-4 text-cyan-600" /> Create & Assign Hospital Task
                </h3>
                <form onSubmit={handleCreateTask} className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs">
                  <input
                    type="text"
                    value={newTaskName}
                    onChange={(e) => setNewTaskName(e.target.value)}
                    placeholder="Task name (e.g. Execute Emergency CT Scan / Dispense Meds)..."
                    className="sm:col-span-2 bg-slate-50 p-2.5 rounded-xl border border-slate-300 text-slate-900 font-sans focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    required
                  />
                  <select
                    value={newTaskDept}
                    onChange={(e) => setNewTaskDept(e.target.value)}
                    className="bg-slate-50 p-2.5 rounded-xl border border-slate-300 font-sans text-slate-800"
                  >
                    <option value="Ward">Ward & IP</option>
                    <option value="Laboratory">Laboratory</option>
                    <option value="Radiology">Radiology</option>
                    <option value="Pharmacy">Pharmacy</option>
                    <option value="Billing">Billing</option>
                  </select>
                  <button
                    type="submit"
                    className="bg-cyan-700 hover:bg-cyan-800 text-white font-mono font-bold py-2.5 px-4 rounded-xl cursor-pointer flex items-center justify-center gap-1 shadow-sm transition-all"
                  >
                    <span>Assign Task</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              </div>

              {/* Task Cards Queue */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b pb-3 border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <ListTodo className="w-4 h-4 text-cyan-600" />
                    <span>Universal Hospital Task Queue</span>
                    <span className="bg-cyan-100 text-cyan-800 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full">
                      {tasks.length} Active Tasks
                    </span>
                  </h3>
                </div>

                <div className="space-y-3">
                  {tasks.map((tsk) => (
                    <div key={tsk.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-2 hover:border-cyan-400 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                              tsk.priority === "CRITICAL"
                                ? "bg-rose-600 text-white animate-pulse"
                                : tsk.priority === "HIGH"
                                ? "bg-amber-600 text-white"
                                : "bg-slate-700 text-white"
                            }`}
                          >
                            {tsk.priority}
                          </span>
                          <span className="font-bold text-slate-900 text-sm">{tsk.taskName}</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500">{tsk.id}</span>
                      </div>

                      <div className="text-xs text-slate-600 flex items-center justify-between font-mono">
                        <span>Patient: <strong className="text-slate-900">{tsk.patientName}</strong></span>
                        <span>Dept: <strong className="text-cyan-700">{tsk.department}</strong></span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-200">
                        <span className="text-slate-500">Assigned: <strong className="text-slate-800">{tsk.assignedTo}</strong></span>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-slate-400">Created {tsk.createdAt}</span>
                          <select
                            value={tsk.status}
                            onChange={(e) => handleUpdateTaskStatus(tsk.id, e.target.value)}
                            className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer"
                          >
                            <option value="Pending">Pending</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Completed">Completed</option>
                            <option value="Cancelled">Cancelled</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right 1 Col: Patient Journey Timeline & SLA Bottleneck Analyzer */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
              <div className="border-b pb-3 border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-cyan-600" />
                  <span>Patient Journey Timeline</span>
                </h3>

                <select
                  value={selectedPatientJourney?.uhid || ""}
                  onChange={(e) => {
                    const p = patients.find((pat) => pat.uhid === e.target.value);
                    if (p) setSelectedPatientJourney(p);
                  }}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-800"
                >
                  {patients.map((p) => (
                    <option key={p.uhid} value={p.uhid}>
                      {p.name} ({p.uhid})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-3 pt-1">
                {journeyStages.map((stg, idx) => (
                  <div
                    key={idx}
                    className={`p-3.5 rounded-2xl border flex items-center justify-between text-xs transition-all ${
                      stg.bottleneck
                        ? "bg-amber-50 border-amber-300 text-amber-900"
                        : stg.status === "Completed"
                        ? "bg-emerald-50/60 border-emerald-200 text-emerald-900"
                        : "bg-slate-50 border-slate-200 text-slate-600"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center font-mono font-bold text-xs ${
                          stg.bottleneck
                            ? "bg-amber-600 text-white animate-bounce"
                            : stg.status === "Completed"
                            ? "bg-emerald-600 text-white"
                            : "bg-slate-300 text-slate-700"
                        }`}
                      >
                        {idx + 1}
                      </div>
                      <div>
                        <span className="font-bold block text-slate-900">{stg.name}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{stg.time}</span>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full ${
                        stg.bottleneck
                          ? "bg-amber-200 text-amber-950 border border-amber-400"
                          : stg.status === "Completed"
                          ? "bg-emerald-200 text-emerald-950"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {stg.status.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WHY IS THIS 87? PULSE BREAKDOWN MODAL */}
      {showPulseModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 border border-slate-200 relative">
            <div className="flex items-center justify-between border-b pb-3 border-slate-200">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-base">Hospital Pulse Score Breakdown (87 / 100)</h3>
              </div>
              <button onClick={() => setShowPulseModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
                <p className="text-indigo-900 font-medium leading-relaxed">
                  The Hospital Pulse score evaluates 7 operational domains continuously. Your hospital is running at
                  <strong> 87/100 (Optimal)</strong>. The main area suppressing the score is <strong>Radiology TAT (76%)</strong>.
                </p>
              </div>

              <div className="space-y-2 font-mono">
                <div>
                  <div className="flex justify-between font-bold text-slate-800">
                    <span>Clinical Operations</span>
                    <span className="text-emerald-600">{pulseScores.clinical}%</span>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mt-1">
                    <div className="bg-emerald-500 h-full" style={{ width: `${pulseScores.clinical}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between font-bold text-slate-800">
                    <span>Pharmacy Intelligence</span>
                    <span className="text-emerald-600">{pulseScores.pharmacy}%</span>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mt-1">
                    <div className="bg-emerald-500 h-full" style={{ width: `${pulseScores.pharmacy}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between font-bold text-slate-800">
                    <span>Laboratory TAT & Quality</span>
                    <span className="text-emerald-600">{pulseScores.laboratory}%</span>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mt-1">
                    <div className="bg-emerald-500 h-full" style={{ width: `${pulseScores.laboratory}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between font-bold text-slate-800">
                    <span>Radiology & USG TAT</span>
                    <span className="text-amber-600">{pulseScores.radiology}% (Action Needed)</span>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mt-1">
                    <div className="bg-amber-500 h-full" style={{ width: `${pulseScores.radiology}%` }} />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between font-bold text-slate-800">
                    <span>Discharge Billing Clearance</span>
                    <span className="text-teal-600">{pulseScores.billing}%</span>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mt-1">
                    <div className="bg-teal-500 h-full" style={{ width: `${pulseScores.billing}%` }} />
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowPulseModal(false)}
              className="w-full bg-slate-900 text-white font-bold py-2.5 rounded-xl transition-all hover:bg-slate-800 text-xs"
            >
              Close Breakdown
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
