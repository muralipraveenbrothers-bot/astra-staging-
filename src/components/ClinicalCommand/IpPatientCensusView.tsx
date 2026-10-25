import React, { useState } from "react";
import { Patient, LabOrder, Prescription, RadiologyReport } from "../../types";
import { WardBed } from "../Ward/types";
import { initialWardBeds } from "../Ward/mockWardData";
import { SmartIcuBedGrid } from "../Ward/SmartIcuBedGrid";
import { PatientWorkspaceModal } from "../Ward/PatientWorkspaceModal";
import {
  Bed,
  Users,
  Activity,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Stethoscope,
  FileText,
  Printer,
  ChevronRight,
  Zap,
  Building2,
  Eye,
  Plus,
} from "lucide-react";

interface IpPatientCensusViewProps {
  patients: Patient[];
  labOrders: LabOrder[];
  prescriptions: Prescription[];
  radiologyReports: RadiologyReport[];
  selectedPatient: Patient | null;
  onSelectPatient: (patient: Patient) => void;
  onOpenPrintModal?: (type: any, data: any) => void;
}

export const IpPatientCensusView: React.FC<IpPatientCensusViewProps> = ({
  patients,
  labOrders,
  prescriptions,
  radiologyReports,
  selectedPatient,
  onSelectPatient,
  onOpenPrintModal,
}) => {
  const [ipFilter, setIpFilter] = useState<"ALL" | "ICU" | "WARD" | "POST_OP" | "CRITICAL">("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"LIST" | "ICU_GRID">("LIST");

  // Ward & ICU Bed Management State
  const [wardBeds, setWardBeds] = useState<WardBed[]>(initialWardBeds);
  const [selectedWorkspaceBed, setSelectedWorkspaceBed] = useState<WardBed | null>(null);

  // Filter IP Patients
  const ipPatients = patients.filter((p) => p.admissionType === "IP" || p.bedNumber);

  const filteredIpPatients = ipPatients.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.uhid.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.bedNumber && p.bedNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (p.diagnosis || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.chiefComplaints || "").toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (ipFilter === "ICU") return p.bedNumber?.includes("ICU") || p.department === "ICU";
    if (ipFilter === "WARD") return p.bedNumber?.includes("Ward") || p.bedNumber?.includes("BED");
    if (ipFilter === "POST_OP") return (p.diagnosis || "").toLowerCase().includes("post") || (p.diagnosis || "").toLowerCase().includes("surgery");
    if (ipFilter === "CRITICAL") return p.vitals.spo2 < 92 || p.vitals.pulse > 115 || p.vitals.temp > 101;

    return true;
  });

  const handleUpdateWardBed = (updatedBed: WardBed) => {
    setWardBeds((prev) => prev.map((b) => (b.bedId === updatedBed.bedId ? updatedBed : b)));
    if (selectedWorkspaceBed?.bedId === updatedBed.bedId) {
      setSelectedWorkspaceBed(updatedBed);
    }
  };

  const handleAcknowledgeNurseCall = (bedId: string) => {
    setWardBeds((prev) =>
      prev.map((b) => {
        if (b.bedId === bedId && b.nurseCallAlert) {
          return {
            ...b,
            nurseCallAlert: {
              ...b.nurseCallAlert,
              isActive: false,
              isAcknowledged: true,
              acknowledgedBy: "Dr. Murali Praveen",
            },
          };
        }
        return b;
      })
    );
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner KPI Header */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-lg border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-indigo-500/20 text-indigo-300 text-[10px] font-mono px-2.5 py-0.5 rounded-full border border-indigo-500/30 font-bold uppercase">
              Inpatient (IPD) Command Census
            </span>
            <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-mono px-2 py-0.5 rounded-full border border-emerald-500/30 font-bold">
              100% Occupancy Tracked
            </span>
          </div>
          <h2 className="text-xl font-black text-white mt-1 flex items-center gap-2">
            <Bed className="w-6 h-6 text-indigo-400" />
            Admitted Patient Census & Smart ICU Ward Grid
          </h2>
          <p className="text-xs text-slate-300">
            Real-time Inpatient monitor, bed allocation, vitals telemetry, and discharge workflow
          </p>
        </div>

        {/* View Mode Toggle Switch */}
        <div className="flex items-center gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
          <button
            onClick={() => setViewMode("LIST")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              viewMode === "LIST"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Users className="w-3.5 h-3.5" /> IP Census List ({filteredIpPatients.length})
          </button>
          <button
            onClick={() => setViewMode("ICU_GRID")}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              viewMode === "ICU_GRID"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Activity className="w-3.5 h-3.5" /> Smart ICU & Ward Grid ({wardBeds.length})
          </button>
        </div>
      </div>

      {/* Main View Mode Logic */}
      {viewMode === "ICU_GRID" ? (
        <div className="space-y-4">
          <SmartIcuBedGrid
            beds={wardBeds}
            onSelectWorkspaceBed={(bed: WardBed) => setSelectedWorkspaceBed(bed)}
            onAcknowledgeNurseCall={handleAcknowledgeNurseCall}
          />

          {/* Ward Patient Workspace Modal */}
          {selectedWorkspaceBed && (
            <PatientWorkspaceModal
              isOpen={Boolean(selectedWorkspaceBed)}
              bed={selectedWorkspaceBed}
              onClose={() => setSelectedWorkspaceBed(null)}
              onUpdateBed={handleUpdateWardBed}
              onTriggerEmergencyAlarm={() => {}}
            />
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Controls Bar: Search & Sub-Filter Tabs */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search IP name, UHID, bed number, diagnosis..."
                className="w-full bg-slate-50 text-slate-900 text-xs pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans"
              />
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto text-xs font-mono font-bold">
              {[
                { id: "ALL", label: `All IP Patients (${ipPatients.length})` },
                { id: "ICU", label: "🔴 ICU Patients" },
                { id: "WARD", label: "🏥 General Ward" },
                { id: "POST_OP", label: "✂️ Post-Op Cases" },
                { id: "CRITICAL", label: "⚠️ Critical Vitals" },
              ].map((filter) => (
                <button
                  key={filter.id}
                  onClick={() => setIpFilter(filter.id as any)}
                  className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer text-xs ${
                    ipFilter === filter.id
                      ? "bg-slate-900 text-white shadow-sm"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {/* Patient Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredIpPatients.map((patient) => {
              const patientLabs = labOrders.filter((l) => l.uhid === patient.uhid);
              const patientRxs = prescriptions.filter((p) => p.uhid === patient.uhid);
              const isSelected = selectedPatient?.uhid === patient.uhid;

              return (
                <div
                  key={patient.uhid}
                  className={`bg-white rounded-2xl p-5 border transition-all shadow-sm space-y-3 cursor-pointer ${
                    isSelected
                      ? "border-indigo-600 ring-2 ring-indigo-500/20 shadow-md"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                  onClick={() => onSelectPatient(patient)}
                >
                  {/* Card Header: Name, UHID, Bed badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-900 text-sm">{patient.name}</h3>
                        <span className="bg-indigo-100 text-indigo-800 font-mono text-[10px] font-bold px-2 py-0.5 rounded">
                          {patient.uhid}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">
                        {patient.age} yrs • {patient.gender} • Doctor: {patient.doctorName || "Dr. Murali Praveen"}
                      </p>
                    </div>

                    <span className="bg-slate-900 text-white text-[11px] font-mono font-bold px-2.5 py-1 rounded-xl shadow-inner flex items-center gap-1">
                      <Bed className="w-3.5 h-3.5 text-indigo-400" />
                      {patient.bedNumber || "IPD Ward"}
                    </span>
                  </div>

                  {/* Diagnosis Badge */}
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
                    <span className="text-[10px] text-slate-400 block font-mono font-bold uppercase">DIAGNOSIS</span>
                    <span className="font-bold text-slate-800">{patient.diagnosis || "Acute Medical Evaluation"}</span>
                  </div>

                  {/* Vitals Telemetry Row */}
                  <div className="grid grid-cols-4 gap-1.5 text-center font-mono text-xs">
                    <div className="bg-indigo-50/60 p-2 rounded-lg border border-indigo-100">
                      <span className="text-[9px] text-indigo-600 block font-bold">BP</span>
                      <span className="font-bold text-slate-800">{patient.vitals.bp}</span>
                    </div>
                    <div className="bg-rose-50/60 p-2 rounded-lg border border-rose-100">
                      <span className="text-[9px] text-rose-600 block font-bold">HR</span>
                      <span className="font-bold text-slate-800">{patient.vitals.pulse} bpm</span>
                    </div>
                    <div className="bg-emerald-50/60 p-2 rounded-lg border border-emerald-100">
                      <span className="text-[9px] text-emerald-600 block font-bold">SpO2</span>
                      <span className="font-bold text-slate-800">{patient.vitals.spo2}%</span>
                    </div>
                    <div className="bg-amber-50/60 p-2 rounded-lg border border-amber-100">
                      <span className="text-[9px] text-amber-600 block font-bold">TEMP</span>
                      <span className="font-bold text-slate-800">{patient.vitals.temp}°F</span>
                    </div>
                  </div>

                  {/* Operational Status Footnotes */}
                  <div className="flex items-center justify-between text-[11px] font-mono pt-2 border-t border-slate-100 text-slate-500">
                    <span>Labs: {patientLabs.length} Orders</span>
                    <span>Rxs: {patientRxs.length} Meds</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectPatient(patient);
                      }}
                      className="text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1"
                    >
                      <span>Workspace</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
