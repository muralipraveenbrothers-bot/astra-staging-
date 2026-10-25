import React, { useState } from "react";
import { Patient, LabOrder, Prescription } from "../../types";
import {
  Users,
  Search,
  Calendar,
  Clock,
  CheckCircle2,
  Stethoscope,
  Printer,
  ChevronRight,
  Plus,
  FileText,
  Building2,
} from "lucide-react";

interface OpdPatientHubProps {
  patients: Patient[];
  selectedPatient: Patient | null;
  onSelectPatient: (patient: Patient) => void;
  onOpenPrintModal?: (type: any, data: any) => void;
}

export const OpdPatientHub: React.FC<OpdPatientHubProps> = ({
  patients,
  selectedPatient,
  onSelectPatient,
  onOpenPrintModal,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [opdFilter, setOpdFilter] = useState<"ALL" | "WAITING" | "COMPLETED">("ALL");

  const opdPatients = patients.filter((p) => p.admissionType === "OP" || !p.bedNumber);

  const filteredOpd = opdPatients.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.uhid.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.diagnosis || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.chiefComplaints || "").toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (opdFilter === "WAITING") return p.status === "Waiting" || p.status === "Admitted";
    if (opdFilter === "COMPLETED") return p.status === "Discharged" || p.status === "Completed";

    return true;
  });

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner Header */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-lg border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-mono px-2.5 py-0.5 rounded-full border border-emerald-500/30 font-bold uppercase">
              Outpatient (OPD) Clinic Hub
            </span>
            <span className="bg-indigo-500/20 text-indigo-300 text-[10px] font-mono px-2 py-0.5 rounded-full border border-indigo-500/30 font-bold">
              Today Scheduled: {opdPatients.length}
            </span>
          </div>
          <h2 className="text-xl font-black text-white mt-1 flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-400" />
            OPD Consultation Schedule & OP Slips
          </h2>
          <p className="text-xs text-slate-300">
            View waiting OPD queue, patient symptoms, register new consultations, and print official OP Slips
          </p>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search OPD patient name, UHID, symptom..."
            className="w-full bg-slate-50 text-slate-900 text-xs pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-sans"
          />
        </div>

        <div className="flex items-center gap-2 text-xs font-mono font-bold">
          <button
            onClick={() => setOpdFilter("ALL")}
            className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
              opdFilter === "ALL"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            All OPD ({opdPatients.length})
          </button>
          <button
            onClick={() => setOpdFilter("WAITING")}
            className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
              opdFilter === "WAITING"
                ? "bg-amber-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            ⏳ Waiting Queue
          </button>
          <button
            onClick={() => setOpdFilter("COMPLETED")}
            className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
              opdFilter === "COMPLETED"
                ? "bg-emerald-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            ✅ Completed
          </button>
        </div>
      </div>

      {/* OPD Patients Table / Card List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead className="bg-slate-100 text-slate-700 font-mono text-[11px] uppercase border-b border-slate-200">
              <tr>
                <th className="p-3">Patient & UHID</th>
                <th className="p-3">Age / Gender</th>
                <th className="p-3">Consultation Doctor</th>
                <th className="p-3">Diagnosis / Complaints</th>
                <th className="p-3">Vitals (BP / HR / SpO2)</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {filteredOpd.map((patient) => {
                const isSelected = selectedPatient?.uhid === patient.uhid;
                return (
                  <tr
                    key={patient.uhid}
                    className={`hover:bg-slate-50 transition-colors cursor-pointer ${
                      isSelected ? "bg-indigo-50/60 font-medium" : ""
                    }`}
                    onClick={() => onSelectPatient(patient)}
                  >
                    <td className="p-3">
                      <div className="font-bold text-slate-900">{patient.name}</div>
                      <div className="text-[10px] text-indigo-700 font-mono">{patient.uhid}</div>
                    </td>

                    <td className="p-3 font-mono">
                      {patient.age} yrs • {patient.gender}
                    </td>

                    <td className="p-3 font-mono">
                      {patient.doctorName || "Dr. Murali Praveen"}
                    </td>

                    <td className="p-3">
                      <span className="bg-slate-100 text-slate-800 text-[11px] font-medium px-2 py-0.5 rounded border border-slate-200">
                        {patient.diagnosis || "OPD Initial Consultation"}
                      </span>
                    </td>

                    <td className="p-3 font-mono text-[11px]">
                      BP: {patient.vitals.bp} | HR: {patient.vitals.pulse} | SpO2: {patient.vitals.spo2}%
                    </td>

                    <td className="p-3 text-right space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onOpenPrintModal) onOpenPrintModal("op_slip", patient);
                        }}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-800 px-2.5 py-1 rounded-lg border border-slate-300 font-mono text-[11px] font-bold cursor-pointer inline-flex items-center gap-1"
                      >
                        <Printer className="w-3 h-3 text-slate-600" />
                        <span>OP Slip</span>
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectPatient(patient);
                        }}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-lg font-mono text-[11px] font-bold cursor-pointer inline-flex items-center gap-1"
                      >
                        <span>Consult</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
