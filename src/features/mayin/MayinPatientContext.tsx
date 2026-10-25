import { useState } from "react";
import { User, Calendar, FileText, HeartPulse, Pill, FlaskConical, X, AlertTriangle, Activity, Microscope, Stethoscope, FileSearch } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface MayinPatientContextProps {
  patient: any;
  onVisualizationRequest: (type: string) => void;
}

export function MayinPatientContext({
  patient,
  onVisualizationRequest,
}: MayinPatientContextProps) {
  const [expanded, setExpanded] = useState(false);

  if (!patient) {
    return (
      <div className="w-80 bg-slate-800/30 border-r border-white/5 p-4 flex flex-col">
        <div className="flex items-center gap-2 mb-4">
          <User className="w-5 h-5 text-slate-400" />
          <h3 className="text-sm font-medium text-slate-200">Patient Context</h3>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-slate-400">No patient selected</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`w-80 bg-slate-800/30 border-r border-white/5 p-4 flex flex-col transition-all duration-300 ${expanded ? "max-w-[400px]" : ""}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <User className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm font-medium text-slate-200">Patient Context</h3>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 rounded hover:bg-slate-700/50"
        >
          {expanded ? <X className="w-4 h-4" /> : <FileSearch className="w-4 h-4" />}
        </button>
      </div>

      {/* Patient Summary */}
      <div className="space-y-4">
        <div className="bg-slate-700/30 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <User className="w-4 h-4 text-slate-400" />
            <h4 className="text-xs font-medium text-slate-300">Basic Information</h4>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-200"><span className="font-medium">Name:</span> {patient.name || "-"}</p>
            <p className="text-xs text-slate-200"><span className="font-medium">UHID:</span> {patient.uhid || "-"}</p>
            <p className="text-xs text-slate-200"><span className="font-medium">Age/Gender:</span> {patient.age || "-"}/{patient.gender || "-"}</p>
            <p className="text-xs text-slate-200"><span className="font-medium">MRN:</span> {patient.mrn || "-"}</p>
          </div>
        </div>

        {/* Vitals */}
        <div className="bg-slate-700/30 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <HeartPulse className="w-4 h-4 text-slate-400" />
            <h4 className="text-xs font-medium text-slate-300">Vitals</h4>
            <button
              onClick={() => onVisualizationRequest("showing-lab")}
              className="ml-auto p-0.5 rounded hover:bg-slate-600/50"
              title="Show Vitals"
            >
              <Microscope className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-200"><span className="font-medium">BP:</span> {patient.vitals?.bp || "-"}</p>
            <p className="text-xs text-slate-200"><span className="font-medium">Pulse:</span> {patient.vitals?.pulse || "-"}</p>
            <p className="text-xs text-slate-200"><span className="font-medium">Temp:</span> {patient.vitals?.temp || "-"}</p>
            <p className="text-xs text-slate-200"><span className="font-medium">SpO2:</span> {patient.vitals?.spo2 || "-"}</p>
          </div>
        </div>

        {/* Allergies */}
        <div className="bg-slate-700/30 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-slate-400" />
            <h4 className="text-xs font-medium text-slate-300">Allergies</h4>
          </div>
          {patient.allergies && patient.allergies.length > 0 ? (
            <ul className="list-disc list-inside text-xs text-slate-200 space-y-1">
              {patient.allergies.map((allergy: string, i: number) => (
                <li key={i}>{allergy}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-400">No known allergies</p>
          )}
        </div>

        {/* Medications */}
        <div className="bg-slate-700/30 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Pill className="w-4 h-4 text-slate-400" />
            <h4 className="text-xs font-medium text-slate-300">Medications</h4>
            <button
              onClick={() => onVisualizationRequest("dispatching-order")}
              className="ml-auto p-0.5 rounded hover:bg-slate-600/50"
              title="Show Medications"
            >
              <Activity className="w-3 h-3" />
            </button>
          </div>
          {patient.medications && patient.medications.length > 0 ? (
            <ul className="list-disc list-inside text-xs text-slate-200 space-y-1">
              {patient.medications.map((med: any, i: number) => (
                <li key={i}>{med.name} {med.dosage}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-400">No active medications</p>
          )}
        </div>

        {/* Chief Complaint */}
        <div className="bg-slate-700/30 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Stethoscope className="w-4 h-4 text-slate-400" />
            <h4 className="text-xs font-medium text-slate-300">Chief Complaint</h4>
          </div>
          <p className="text-xs text-slate-200">{patient.chiefComplaint || "-"}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => onVisualizationRequest("showing-lab")}
            className="flex-1 bg-emerald-500/20 hover:bg-emerald-500/30 rounded px-2 py-1 text-xs flex items-center justify-center gap-1"
          >
            <Microscope className="w-3 h-3" />
            <span>Labs</span>
          </button>
          <button
            onClick={() => onVisualizationRequest("showing-report")}
            className="flex-1 bg-emerald-500/20 hover:bg-emerald-500/30 rounded px-2 py-1 text-xs flex items-center justify-center gap-1"
          >
            <FileText className="w-3 h-3" />
            <span>Reports</span>
          </button>
          <button
            onClick={() => onVisualizationRequest("showing-anatomy")}
            className="flex-1 bg-emerald-500/20 hover:bg-emerald-500/30 rounded px-2 py-1 text-xs flex items-center justify-center gap-1"
          >
            <FlaskConical className="w-3 h-3" />
            <span>Anatomy</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default MayinPatientContext;