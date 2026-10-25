import React, { useState } from "react";
import { Patient, LabOrder, RadiologyReport, Prescription } from "../../types";
import { AstraUniversalOrder } from "../CommandCenter/universalOrderTypes";
import { WhatNeedsAttentionQueue } from "./WhatNeedsAttentionQueue";
import { MyPatientsRounds } from "./MyPatientsRounds";
import { PatientClinicalWorkspace } from "./PatientClinicalWorkspace";
import { DataIntegrityPanel } from "./DataIntegrityPanel";
import { ClinicalTaskEnginePanel } from "./ClinicalTaskEnginePanel";
import { IpPatientCensusView } from "./IpPatientCensusView";
import { OpdPatientHub } from "./OpdPatientHub";
import { DoctorOrdersHub } from "./DoctorOrdersHub";
import { EvidenceAiCopilot } from "./EvidenceAiCopilot";
import { ClinicalBrainPanel } from "./ClinicalBrainPanel";

import { ClinicalAttentionEngine, AttentionFlag } from "../../services/clinicalAttentionEngine";
import { DataIntegrityEngine, DataIntegrityIssue } from "../../services/dataIntegrityEngine";
import { clinicalTaskEngine, ClinicalTask } from "../../services/clinicalTaskEngine";

import {
  Stethoscope,
  Activity,
  AlertTriangle,
  Users,
  CheckSquare,
  ShieldAlert,
  Sparkles,
  Calendar,
  Clock,
  Zap,
  Bed,
  CreditCard,
  FileText,
  Bot,
  Plus,
} from "lucide-react";

interface ClinicalCommandCenterProps {
  patients: Patient[];
  selectedPatient?: Patient | null;
  onSelectPatient?: (patient: Patient) => void;
  labOrders: LabOrder[];
  radiologyReports: RadiologyReport[];
  prescriptions: Prescription[];
  universalOrders?: AstraUniversalOrder[];
  onAddLabOrder?: (order: LabOrder) => void;
  onAddPrescription?: (rx: Prescription) => void;
  onUpdatePatientDx?: (uhid: string, dx: string) => void;
  onConfirmUniversalOrder?: (draft: any) => any;
  onOpenOrderCenter?: () => void;
  onOpenPrintModal?: (type: any, data: any) => void;
  onAddToPrintQueue?: (item: any) => void;
  setActiveDept?: (dept: any) => void;
}

export const ClinicalCommandCenter: React.FC<ClinicalCommandCenterProps> = ({
  patients,
  selectedPatient: externalSelectedPatient,
  onSelectPatient: externalOnSelectPatient,
  labOrders,
  radiologyReports,
  prescriptions,
  universalOrders = [],
  onAddLabOrder,
  onAddPrescription,
  onUpdatePatientDx,
  onConfirmUniversalOrder,
  onOpenOrderCenter,
  onOpenPrintModal,
  onAddToPrintQueue,
  setActiveDept,
}) => {
  const [activeTab, setActiveTab] = useState<
    | "ATTENTION"
    | "IP_CENSUS"
    | "OPD_CLINIC"
    | "DOCTOR_ORDERS"
    | "EVIDENCE_AI"
    | "ROUNDS"
    | "WORKSPACE"
    | "TASKS"
    | "INTEGRITY"
    | "BRAIN"
  >("ATTENTION");

  const [internalSelectedPatientUhid, setInternalSelectedPatientUhid] = useState<string>(
    externalSelectedPatient?.uhid || patients[0]?.uhid || "UHID-2026-8801"
  );

  const selectedPatient =
    patients.find(
      (p) => p.uhid === (externalSelectedPatient?.uhid || internalSelectedPatientUhid)
    ) || patients[0];

  const handleSelectPatient = (patient: Patient) => {
    setInternalSelectedPatientUhid(patient.uhid);
    if (externalOnSelectPatient) externalOnSelectPatient(patient);
  };

  // Compute live attention flags & data integrity issues
  const [attentionFlags, setAttentionFlags] = useState<AttentionFlag[]>(() =>
    ClinicalAttentionEngine.calculateAttentionFlags(
      patients,
      labOrders,
      radiologyReports,
      prescriptions
    )
  );

  const [integrityIssues] = useState<DataIntegrityIssue[]>(() =>
    DataIntegrityEngine.scanSystemIntegrity(
      patients,
      labOrders,
      radiologyReports,
      prescriptions
    )
  );

  const [tasks, setTasks] = useState<ClinicalTask[]>(() => clinicalTaskEngine.getTasks());

  // Metrics
  const ipdPatients = patients.filter((p) => p.admissionType === "IP" || p.bedNumber);
  const opdPatients = patients.filter((p) => p.admissionType === "OP" || !p.bedNumber);
  const icuCount = patients.filter((p) => p.bedNumber?.includes("ICU")).length || 4;
  const pendingResultsCount = labOrders.filter((l) => l.status !== "Completed").length;
  const pendingTasksCount = tasks.filter((t) => t.status !== "COMPLETED").length;

  const criticalCount = attentionFlags.filter((f) => f.priority === "CRITICAL").length;
  const attentionCount = attentionFlags.filter((f) => f.priority === "HIGH").length;
  const dueCount = attentionFlags.filter((f) => f.priority === "MEDIUM").length;
  const stableCount = Math.max(0, patients.length - (criticalCount + attentionCount));

  const handleSelectPatientByUhid = (uhid: string) => {
    const p = patients.find((pt) => pt.uhid === uhid);
    if (p) handleSelectPatient(p);
    setActiveTab("WORKSPACE");
  };

  const handleAcknowledgeFlag = (flagId: string) => {
    setAttentionFlags((prev) => prev.filter((f) => f.id !== flagId));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 font-sans">
      {/* Top Header Banner: Astra Clinical Command */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl border border-indigo-900/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 flex items-center justify-center font-bold text-2xl shadow-inner">
            <Stethoscope className="w-8 h-8 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-indigo-500/30 text-indigo-200 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border border-indigo-500/50 uppercase">
                Astra Hospital OS • Clinical Command & AI Intelligence Hub
              </span>
              <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
                <Zap className="w-3 h-3 text-emerald-400" /> Active Doctor Shift
              </span>
            </div>
            <h1 className="text-2xl font-black text-white mt-1">Dr. Murali Praveen, M.D.</h1>
            <p className="text-xs text-slate-300 mt-0.5">
              Attending Consultant Physician • Morning Shift (08:00 AM - 04:00 PM) • {new Date().toLocaleDateString("en-IN", { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Clinical Attention Summary Badges */}
        <div className="flex items-center gap-2 bg-slate-950/80 p-3 rounded-2xl border border-indigo-900/80 font-mono text-xs">
          <div className="text-center px-2">
            <span className="text-[10px] text-slate-400 block font-bold">CRITICAL</span>
            <span className="text-xl font-black text-rose-500">{criticalCount}</span>
          </div>
          <div className="h-8 w-px bg-slate-800" />
          <div className="text-center px-2">
            <span className="text-[10px] text-slate-400 block font-bold">ATTENTION</span>
            <span className="text-xl font-black text-amber-400">{attentionCount}</span>
          </div>
          <div className="h-8 w-px bg-slate-800" />
          <div className="text-center px-2">
            <span className="text-[10px] text-slate-400 block font-bold">DUE</span>
            <span className="text-xl font-black text-indigo-400">{dueCount}</span>
          </div>
          <div className="h-8 w-px bg-slate-800" />
          <div className="text-center px-2">
            <span className="text-[10px] text-slate-400 block font-bold">STABLE</span>
            <span className="text-xl font-black text-emerald-400">{stableCount}</span>
          </div>
        </div>
      </div>

      {/* Clinical Load KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs font-mono">
        <div
          onClick={() => setActiveTab("IP_CENSUS")}
          className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-1 cursor-pointer hover:border-indigo-400 transition-all"
        >
          <span className="text-[10px] text-slate-500 block font-bold uppercase">IPD CENSUS</span>
          <span className="text-xl font-black text-indigo-700">{ipdPatients.length}</span>
          <span className="text-[9px] text-slate-500 block">Admitted Inpatients</span>
        </div>

        <div
          onClick={() => setActiveTab("IP_CENSUS")}
          className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-1 cursor-pointer hover:border-rose-400 transition-all"
        >
          <span className="text-[10px] text-slate-500 block font-bold uppercase">ICU CENSUS</span>
          <span className="text-xl font-black text-rose-600">{icuCount}</span>
          <span className="text-[9px] text-rose-600 font-bold block">Telemetry Active</span>
        </div>

        <div
          onClick={() => setActiveTab("OPD_CLINIC")}
          className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-1 cursor-pointer hover:border-slate-400 transition-all"
        >
          <span className="text-[10px] text-slate-500 block font-bold uppercase">OPD CLINIC</span>
          <span className="text-xl font-black text-slate-900">{opdPatients.length}</span>
          <span className="text-[9px] text-emerald-600 font-bold block">Today Scheduled</span>
        </div>

        <div
          onClick={() => setActiveTab("DOCTOR_ORDERS")}
          className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-1 cursor-pointer hover:border-amber-400 transition-all"
        >
          <span className="text-[10px] text-slate-500 block font-bold uppercase">DOCTOR ORDERS</span>
          <span className="text-xl font-black text-amber-600">{labOrders.length + prescriptions.length}</span>
          <span className="text-[9px] text-amber-600 font-bold block">Active Orders</span>
        </div>

        <div
          onClick={() => setActiveTab("EVIDENCE_AI")}
          className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-1 cursor-pointer hover:border-purple-400 transition-all"
        >
          <span className="text-[10px] text-slate-500 block font-bold uppercase">EVIDENCE AI</span>
          <span className="text-xl font-black text-purple-700">PubMed</span>
          <span className="text-[9px] text-purple-600 font-bold block">WHO / Nature / NCBI</span>
        </div>

        <div
          onClick={() => setActiveTab("DOCTOR_ORDERS")}
          className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-1 cursor-pointer hover:border-indigo-400 transition-all"
        >
          <span className="text-[10px] text-slate-500 block font-bold uppercase">PENDING LABS</span>
          <span className="text-xl font-black text-indigo-600">{pendingResultsCount}</span>
          <span className="text-[9px] text-indigo-600 font-bold block">Awaiting Review</span>
        </div>

        <div
          onClick={() => setActiveTab("TASKS")}
          className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-1 cursor-pointer hover:border-slate-400 transition-all"
        >
          <span className="text-[10px] text-slate-500 block font-bold uppercase">PENDING TASKS</span>
          <span className="text-xl font-black text-slate-900">{pendingTasksCount}</span>
          <span className="text-[9px] text-indigo-600 font-bold block">Active Tasks</span>
        </div>
      </div>

      {/* Main Command Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-1 text-xs font-mono font-bold">
        <button
          onClick={() => setActiveTab("ATTENTION")}
          className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === "ATTENTION"
              ? "bg-rose-600 text-white shadow-md"
              : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>🔴 What Needs Attention ({attentionFlags.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("IP_CENSUS")}
          className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === "IP_CENSUS"
              ? "bg-indigo-600 text-white shadow-md"
              : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <Bed className="w-4 h-4" />
          <span>🏥 IP Patients & Bed Census ({ipdPatients.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("OPD_CLINIC")}
          className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === "OPD_CLINIC"
              ? "bg-indigo-600 text-white shadow-md"
              : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>🩺 OPD Patients ({opdPatients.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("DOCTOR_ORDERS")}
          className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === "DOCTOR_ORDERS"
              ? "bg-indigo-600 text-white shadow-md"
              : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>📋 Doctor Orders & Lab Hub</span>
        </button>

        <button
          onClick={() => setActiveTab("EVIDENCE_AI")}
          className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === "EVIDENCE_AI"
              ? "bg-purple-700 text-white shadow-md"
              : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-300" />
          <span>🤖 Evidence AI Copilot (PubMed / WHO)</span>
        </button>

        <button
          onClick={() => setActiveTab("ROUNDS")}
          className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === "ROUNDS"
              ? "bg-indigo-600 text-white shadow-md"
              : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <Stethoscope className="w-4 h-4" />
          <span>🩺 Doctor Round Mode</span>
        </button>

        <button
          onClick={() => setActiveTab("WORKSPACE")}
          className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === "WORKSPACE"
              ? "bg-indigo-600 text-white shadow-md"
              : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>👤 Patient Workspace & Blind-Spots</span>
        </button>

        <button
          onClick={() => setActiveTab("TASKS")}
          className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === "TASKS"
              ? "bg-indigo-600 text-white shadow-md"
              : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <CheckSquare className="w-4 h-4" />
          <span>📋 Tasks ({tasks.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("INTEGRITY")}
          className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === "INTEGRITY"
              ? "bg-amber-600 text-white shadow-md"
              : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>🛡️ Integrity ({integrityIssues.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("BRAIN")}
          className={`px-4 py-2.5 rounded-xl transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
            activeTab === "BRAIN"
              ? "bg-indigo-600 text-white shadow-md"
              : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200"
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>PATHOPHYSIOLOGY</span>
        </button>
      </div>

      {/* Dynamic Tab Body */}
      <div>
        {activeTab === "ATTENTION" && (
          <WhatNeedsAttentionQueue
            flags={attentionFlags}
            onSelectPatientByUhid={handleSelectPatientByUhid}
            onAcknowledgeFlag={handleAcknowledgeFlag}
          />
        )}

        {activeTab === "IP_CENSUS" && (
          <IpPatientCensusView
            patients={patients}
            labOrders={labOrders}
            prescriptions={prescriptions}
            radiologyReports={radiologyReports}
            selectedPatient={selectedPatient}
            onSelectPatient={handleSelectPatient}
            onOpenPrintModal={onOpenPrintModal}
          />
        )}

        {activeTab === "OPD_CLINIC" && (
          <OpdPatientHub
            patients={patients}
            selectedPatient={selectedPatient}
            onSelectPatient={handleSelectPatient}
            onOpenPrintModal={onOpenPrintModal}
          />
        )}

        {activeTab === "DOCTOR_ORDERS" && (
          <DoctorOrdersHub
            patients={patients}
            selectedPatient={selectedPatient}
            onSelectPatient={handleSelectPatient}
            labOrders={labOrders}
            prescriptions={prescriptions}
            universalOrders={universalOrders}
            onAddLabOrder={onAddLabOrder}
            onAddPrescription={onAddPrescription}
            onConfirmUniversalOrder={onConfirmUniversalOrder}
            onOpenOrderCenter={onOpenOrderCenter}
            onOpenPrintModal={onOpenPrintModal}
          />
        )}

        {activeTab === "EVIDENCE_AI" && (
          <EvidenceAiCopilot
            patients={patients}
            selectedPatient={selectedPatient}
            onSelectPatient={handleSelectPatient}
            onAddLabOrder={onAddLabOrder}
            onAddPrescription={onAddPrescription}
            onConfirmUniversalOrder={onConfirmUniversalOrder}
            onOpenOrderCenter={onOpenOrderCenter}
          />
        )}

        {activeTab === "ROUNDS" && (
          <MyPatientsRounds
            patients={patients}
            labOrders={labOrders}
            prescriptions={prescriptions}
            radiologyReports={radiologyReports}
            selectedPatient={selectedPatient}
            onSelectPatient={handleSelectPatient}
          />
        )}

        {activeTab === "WORKSPACE" && selectedPatient && (
          <PatientClinicalWorkspace
            patient={selectedPatient}
            labOrders={labOrders}
            radiologyReports={radiologyReports}
            prescriptions={prescriptions}
            onOpenPrintModal={onOpenPrintModal}
          />
        )}

        {activeTab === "TASKS" && (
          <ClinicalTaskEnginePanel
            tasks={tasks}
            onTaskUpdated={() => setTasks([...clinicalTaskEngine.getTasks()])}
          />
        )}

        {activeTab === "INTEGRITY" && (
          <DataIntegrityPanel issues={integrityIssues} />
        )}

        {activeTab === "BRAIN" && (
          <ClinicalBrainPanel
            patient={selectedPatient}
            labOrders={labOrders}
            prescriptions={prescriptions}
          />
        )}
      </div>
    </div>
  );
};
