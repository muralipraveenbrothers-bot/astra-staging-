import React, { useState } from "react";
import { Patient, LabOrder, Prescription, RadiologyReport } from "../../types";
import {
  Clock,
  TrendingUp,
  Activity,
  Microscope,
  Pill,
  Scan,
  FileText,
  AlertCircle,
  Filter,
} from "lucide-react";

interface WhatChangedPanelProps {
  patient: Patient;
  labOrders: LabOrder[];
  prescriptions: Prescription[];
  radiologyReports: RadiologyReport[];
}

export const WhatChangedPanel: React.FC<WhatChangedPanelProps> = ({
  patient,
  labOrders,
  prescriptions,
  radiologyReports,
}) => {
  const [timeFilter, setTimeFilter] = useState<"6H" | "12H" | "24H" | "SINCE_ROUND">("24H");

  const patientLabs = labOrders.filter((l) => l.patientUhid === patient.uhid);
  const patientRad = radiologyReports.filter((r) => r.patientUhid === patient.uhid);
  const patientRx = prescriptions.filter((p) => p.patientUhid === patient.uhid);

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4 font-sans">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b pb-3 border-slate-100">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-600" />
            <span>WHAT CHANGED FOR {patient.name.toUpperCase()}?</span>
          </h3>
          <p className="text-[11px] text-slate-500">
            Timeline delta monitoring: vital trends, new laboratory results, medication changes & nursing notes
          </p>
        </div>

        {/* Time Filters */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-[11px] font-mono">
          {[
            { id: "6H", label: "Last 6 hrs" },
            { id: "12H", label: "Last 12 hrs" },
            { id: "24H", label: "Last 24 hrs" },
            { id: "SINCE_ROUND", label: "Since Last Round" },
          ].map((tf) => (
            <button
              key={tf.id}
              onClick={() => setTimeFilter(tf.id as any)}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                timeFilter === tf.id
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      {/* Delta Changes Timeline */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
        {/* Vital Delta */}
        <div className="p-3.5 bg-indigo-50/60 rounded-xl border border-indigo-200 space-y-1.5">
          <span className="text-[10px] text-indigo-900 font-bold uppercase block">Vital Trends Delta</span>
          <div className="text-slate-800 space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span>SpO₂:</span>
              <span className="font-bold text-rose-600">95% → 89% ↓ (Decline)</span>
            </div>
            <div className="flex justify-between">
              <span>Heart Rate:</span>
              <span className="font-bold text-amber-600">88 → 124 bpm ↑</span>
            </div>
            <div className="flex justify-between">
              <span>Blood Pressure:</span>
              <span>120/80 → 102/64 mmHg</span>
            </div>
          </div>
        </div>

        {/* Lab Delta */}
        <div className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-200 space-y-1.5">
          <span className="text-[10px] text-amber-900 font-bold uppercase block">New Lab Reports ({patientLabs.length})</span>
          <div className="text-slate-800 space-y-1 text-[11px]">
            {patientLabs.length === 0 ? (
              <span className="text-slate-500 italic">No new lab results</span>
            ) : (
              patientLabs.map((l) => (
                <div key={l.id} className="flex justify-between">
                  <span>{l.testName}:</span>
                  <span className={`font-bold ${l.criticalFlag ? "text-rose-600" : "text-emerald-700"}`}>
                    {l.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Medication Delta */}
        <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-200 space-y-1.5">
          <span className="text-[10px] text-blue-900 font-bold uppercase block">Medication Changes ({patientRx.length})</span>
          <div className="text-slate-800 space-y-1 text-[11px]">
            {patientRx.length === 0 ? (
              <span className="text-slate-500 italic">No recent prescription changes</span>
            ) : (
              patientRx.map((p) => (
                <div key={p.id}>
                  <span>Prescribed by {p.doctorName}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Nursing & Task Events */}
        <div className="p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-200 space-y-1.5">
          <span className="text-[10px] text-emerald-900 font-bold uppercase block">Nursing Notes & Events</span>
          <div className="text-slate-800 text-[11px]">
            <span>Overnight position changed. Oxygen supplementation initiated at 2L/min nasal cannula.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
