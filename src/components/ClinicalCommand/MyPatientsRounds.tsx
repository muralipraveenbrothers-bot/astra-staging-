import React, { useState } from "react";
import { Patient, LabOrder, Prescription, RadiologyReport } from "../../types";
import {
  Users,
  Bed,
  ChevronRight,
  ChevronLeft,
  Stethoscope,
  Activity,
  Microscope,
  Pill,
  Clock,
  CheckCircle2,
  FileText,
  AlertTriangle,
  Send,
  Sparkles,
} from "lucide-react";

interface MyPatientsRoundsProps {
  patients: Patient[];
  labOrders: LabOrder[];
  prescriptions: Prescription[];
  radiologyReports: RadiologyReport[];
  selectedPatient: Patient | null;
  onSelectPatient: (patient: Patient) => void;
}

export const MyPatientsRounds: React.FC<MyPatientsRoundsProps> = ({
  patients,
  labOrders,
  prescriptions,
  radiologyReports,
  selectedPatient,
  onSelectPatient,
}) => {
  const [filterCategory, setFilterCategory] = useState<
    "ALL" | "ICU" | "WARD" | "POST_OP" | "OPD" | "DISCHARGE_TODAY"
  >("ALL");

  const [isRoundMode, setIsRoundMode] = useState<boolean>(false);
  const [currentRoundIndex, setCurrentRoundIndex] = useState<number>(0);
  const [todayPlanText, setTodayPlanText] = useState<string>("");

  // Filtering patients
  const filteredPatients = patients.filter((p) => {
    if (filterCategory === "ALL") return true;
    if (filterCategory === "ICU") return p.bedNumber?.includes("ICU");
    if (filterCategory === "WARD") return p.admissionType === "IP" && !p.bedNumber?.includes("ICU");
    if (filterCategory === "POST_OP") return p.bedNumber?.includes("Ward 2") || p.chiefComplaints?.includes("Post-Op");
    if (filterCategory === "OPD") return p.admissionType === "OP";
    if (filterCategory === "DISCHARGE_TODAY") return p.billStatus === "Paid" || p.bedNumber?.includes("Ward 1");
    return true;
  });

  const activeRoundPatient = filteredPatients[currentRoundIndex] || filteredPatients[0] || patients[0];

  const handleNextRoundPatient = () => {
    if (currentRoundIndex < filteredPatients.length - 1) {
      setCurrentRoundIndex(currentRoundIndex + 1);
      onSelectPatient(filteredPatients[currentRoundIndex + 1]);
    }
  };

  const handlePrevRoundPatient = () => {
    if (currentRoundIndex > 0) {
      setCurrentRoundIndex(currentRoundIndex - 1);
      onSelectPatient(filteredPatients[currentRoundIndex - 1]);
    }
  };

  const patientLabs = activeRoundPatient
    ? labOrders.filter((l) => l.patientUhid === activeRoundPatient.uhid)
    : [];
  const patientRx = activeRoundPatient
    ? prescriptions.filter((p) => p.patientUhid === activeRoundPatient.uhid)
    : [];

  return (
    <div className="space-y-6 font-sans">
      {/* Category Filter & Round Mode Toggle Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <span>MY PATIENTS & DOCTOR ROUNDS</span>
          </h3>
          <p className="text-xs text-slate-500">
            Sequential round navigation with overnight events, vital trends, lab reports & plan documentation
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsRoundMode(!isRoundMode)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
              isRoundMode
                ? "bg-indigo-600 text-white border-indigo-700 shadow-md animate-pulse"
                : "bg-slate-900 text-white border-slate-800 hover:bg-slate-800"
            }`}
          >
            <Stethoscope className="w-4 h-4" />
            <span>{isRoundMode ? "Exit Round Mode" : "Start Doctor Round Mode 🩺"}</span>
          </button>
        </div>
      </div>

      {/* Doctor Round Mode Sequential Navigator */}
      {isRoundMode ? (
        <div className="bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-950 text-white rounded-2xl p-6 shadow-2xl border border-indigo-900/60 space-y-6">
          <div className="flex items-center justify-between border-b border-indigo-800/80 pb-4">
            <div className="flex items-center gap-3">
              <span className="bg-indigo-500 text-white font-mono font-bold text-xs px-3 py-1 rounded-full">
                Round Patient {currentRoundIndex + 1} of {filteredPatients.length}
              </span>
              <h2 className="text-xl font-black text-white">{activeRoundPatient?.name}</h2>
              <span className="text-xs font-mono text-indigo-300">({activeRoundPatient?.uhid})</span>
              <span className="bg-emerald-500/20 text-emerald-300 font-mono text-xs px-2.5 py-0.5 rounded border border-emerald-500/40">
                {activeRoundPatient?.bedNumber || "OPD Desk"}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevRoundPatient}
                disabled={currentRoundIndex === 0}
                className="bg-indigo-900/80 hover:bg-indigo-800 disabled:opacity-40 text-white px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer border border-indigo-700"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Prev Patient</span>
              </button>

              <button
                onClick={handleNextRoundPatient}
                disabled={currentRoundIndex === filteredPatients.length - 1}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-4 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer shadow-md"
              >
                <span>Next Patient</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Sequential Patient Details Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
            {/* Left Column: Identity, Vitals & Trends */}
            <div className="bg-slate-900/80 p-4 rounded-xl border border-indigo-800 space-y-4">
              <h4 className="font-bold text-indigo-300 text-xs uppercase font-mono border-b border-indigo-800/60 pb-2">
                1. Patient Profile & Vitals
              </h4>

              <div className="space-y-2 font-mono text-slate-300">
                <div>Age/Gender: <strong className="text-white">{activeRoundPatient?.age} yrs / {activeRoundPatient?.gender}</strong></div>
                <div>Attending Doctor: <strong className="text-white">{activeRoundPatient?.attendingDoctor}</strong></div>
                <div>Primary Diagnosis: <strong className="text-amber-300">{activeRoundPatient?.chiefComplaints}</strong></div>
              </div>

              <div className="p-3 bg-indigo-950/60 rounded-xl border border-indigo-800 space-y-2">
                <span className="text-[10px] text-indigo-300 uppercase font-mono font-bold block">Current Bedside Vitals</span>
                <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                  <div>SpO₂: <strong className={activeRoundPatient?.vitals?.spo2 < 92 ? "text-rose-400 font-black" : "text-emerald-400"}>{activeRoundPatient?.vitals?.spo2}%</strong></div>
                  <div>BP: <strong className="text-white">{activeRoundPatient?.vitals?.bp}</strong></div>
                  <div>Pulse: <strong className="text-white">{activeRoundPatient?.vitals?.pulse} bpm</strong></div>
                  <div>Temp: <strong className="text-white">{activeRoundPatient?.vitals?.temp}°F</strong></div>
                </div>
              </div>
            </div>

            {/* Middle Column: Overnight Events & Lab Reports */}
            <div className="bg-slate-900/80 p-4 rounded-xl border border-indigo-800 space-y-4">
              <h4 className="font-bold text-indigo-300 text-xs uppercase font-mono border-b border-indigo-800/60 pb-2">
                2. Overnight Events & Lab Reports
              </h4>

              <div className="space-y-2 text-slate-300">
                <div className="p-2.5 bg-slate-950/80 rounded-lg border border-indigo-900/80 text-[11px]">
                  <span className="text-[10px] text-indigo-400 font-mono block font-bold">Sr. Kavitha (Night Shift)</span>
                  <span>Mild dyspnea reported at 02:30 AM. Placed on 2L O2. Patient comfortable after position change.</span>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-slate-400 font-mono uppercase block font-bold">Latest Lab Investigations</span>
                  {patientLabs.length === 0 ? (
                    <span className="text-slate-500 italic block">No recent lab orders</span>
                  ) : (
                    patientLabs.map((l) => (
                      <div key={l.id} className="flex items-center justify-between p-2 bg-indigo-900/30 rounded border border-indigo-800/60">
                        <span className="font-bold text-white">{l.testName}</span>
                        <span className={`font-mono text-[10px] ${l.criticalFlag ? "text-rose-400 font-bold" : "text-emerald-400"}`}>
                          {l.status}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Right Column: Today's Plan & Clinical Documentation */}
            <div className="bg-slate-900/80 p-4 rounded-xl border border-indigo-800 space-y-4 flex flex-col justify-between">
              <div>
                <h4 className="font-bold text-indigo-300 text-xs uppercase font-mono border-b border-indigo-800/60 pb-2">
                  3. Today's Plan & Documentation Area
                </h4>

                <textarea
                  value={todayPlanText}
                  onChange={(e) => setTodayPlanText(e.target.value)}
                  placeholder="Record today's round clinical notes, medication changes, or discharge orders..."
                  rows={6}
                  className="w-full mt-2 bg-slate-950 border border-indigo-800 rounded-xl p-3 text-white text-xs font-mono focus:outline-none focus:border-indigo-400"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => alert("Round note saved successfully!")}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all cursor-pointer shadow-sm"
                >
                  Save Round Note
                </button>

                <button
                  onClick={handleNextRoundPatient}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                >
                  <span>Next Patient</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Patient Cards Grid Mode */
        <div className="space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-mono">
            {["ALL", "ICU", "WARD", "POST_OP", "OPD", "DISCHARGE_TODAY"].map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat as any)}
                className={`px-3 py-1.5 rounded-xl font-bold cursor-pointer transition-all border ${
                  filterCategory === cat
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {cat.replace("_", " ")}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            {filteredPatients.map((patient) => (
              <div
                key={patient.uhid}
                onClick={() => onSelectPatient(patient)}
                className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-500 hover:shadow-md transition-all cursor-pointer space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-black text-slate-900 text-sm">{patient.name}</h4>
                    <span className="text-[10px] font-mono text-slate-500">{patient.uhid}</span>
                  </div>
                  <span className="bg-slate-100 text-slate-800 font-mono font-bold px-2.5 py-1 rounded-lg border border-slate-200">
                    {patient.bedNumber || (patient.admissionType === "OP" ? "OPD Clinic" : "Ward Bed")}
                  </span>
                </div>

                <div className="text-slate-600 font-mono text-[11px] space-y-1 bg-slate-50 p-2.5 rounded-xl">
                  <div>Diagnosis: <strong className="text-slate-900">{patient.chiefComplaints}</strong></div>
                  <div>Attending Doctor: <strong className="text-slate-800">{patient.attendingDoctor}</strong></div>
                  <div>SpO₂: <strong className={patient.vitals?.spo2 < 92 ? "text-rose-600 font-bold" : "text-emerald-700"}>{patient.vitals?.spo2}%</strong> • BP: <strong>{patient.vitals?.bp}</strong></div>
                </div>

                <div className="flex items-center justify-between text-[11px] pt-1 text-indigo-600 font-bold font-mono">
                  <span>Open Workspace</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
