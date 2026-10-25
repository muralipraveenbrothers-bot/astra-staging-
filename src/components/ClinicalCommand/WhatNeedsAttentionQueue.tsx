import React, { useState } from "react";
import { AttentionFlag } from "../../services/clinicalAttentionEngine";
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  ChevronRight,
  ShieldAlert,
  User,
  Activity,
  Microscope,
  FileText,
  Filter,
  Check,
  Zap,
} from "lucide-react";
import { auditLogger } from "../../services/auditLogger";

interface WhatNeedsAttentionQueueProps {
  flags: AttentionFlag[];
  onSelectPatientByUhid: (uhid: string) => void;
  onAcknowledgeFlag: (flagId: string) => void;
}

export const WhatNeedsAttentionQueue: React.FC<WhatNeedsAttentionQueueProps> = ({
  flags,
  onSelectPatientByUhid,
  onAcknowledgeFlag,
}) => {
  const [filterPriority, setFilterPriority] = useState<string>("ALL");

  const filteredFlags = flags.filter((f) => {
    if (filterPriority === "ALL") return true;
    return f.priority === filterPriority;
  });

  const handleAcknowledge = (e: React.MouseEvent, flag: AttentionFlag) => {
    e.stopPropagation();
    onAcknowledgeFlag(flag.id);
    auditLogger.log({
      action: "ALERT_ACKNOWLEDGED",
      performedBy: "Dr. Murali Praveen",
      userRole: "Attending Consultant",
      patientUhid: flag.patientUhid,
      details: `Acknowledged alert: ${flag.title}`,
      sourceModule: flag.sourceModule,
    });
  };

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4 font-sans">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b pb-3 border-slate-100">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-rose-50 text-rose-600 font-bold">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <span>🔴 WHAT NEEDS MY ATTENTION RIGHT NOW?</span>
              <span className="bg-rose-100 text-rose-800 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full">
                {flags.length} Prioritized Alerts
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              Continuously prioritized clinical queue based on validated severity thresholds & vital trends
            </p>
          </div>
        </div>

        {/* Priority Filter Buttons */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-mono">
          {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map((p) => (
            <button
              key={p}
              onClick={() => setFilterPriority(p)}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                filterPriority === p
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Flagged Items List */}
      <div className="space-y-3">
        {filteredFlags.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-500 text-xs">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <span>No clinical attention alerts matching the selected priority filter.</span>
          </div>
        ) : (
          filteredFlags.map((flag) => (
            <div
              key={flag.id}
              onClick={() => onSelectPatientByUhid(flag.patientUhid)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer space-y-3 ${
                flag.priority === "CRITICAL"
                  ? "bg-rose-50/60 border-rose-200 hover:border-rose-400"
                  : flag.priority === "HIGH"
                  ? "bg-amber-50/60 border-amber-200 hover:border-amber-400"
                  : "bg-slate-50 border-slate-200 hover:border-slate-400"
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full ${
                      flag.priority === "CRITICAL"
                        ? "bg-rose-600 text-white animate-pulse"
                        : flag.priority === "HIGH"
                        ? "bg-amber-600 text-white"
                        : "bg-slate-700 text-white"
                    }`}
                  >
                    {flag.priority} (Score: {flag.score})
                  </span>
                  <span className="font-bold text-slate-900 text-sm">{flag.title}</span>
                </div>

                <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {flag.timeDetected}
                  </span>
                  <span className="bg-white/80 px-2 py-0.5 rounded border border-slate-200 text-slate-700 font-bold">
                    {flag.bedOrLocation}
                  </span>
                </div>
              </div>

              {/* WHY THIS PATIENT IS FLAGGED Breakdown */}
              <div className="bg-white/80 p-3 rounded-xl border border-slate-200/80 space-y-1.5 text-xs">
                <span className="text-[10px] font-mono text-slate-500 font-bold uppercase block">
                  WHY THIS PATIENT IS FLAGGED:
                </span>
                <ul className="space-y-1">
                  {flag.reasons.map((reason, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-slate-800 text-[11px]">
                      <span className="text-rose-500 font-bold">•</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200/60 font-mono">
                <span className="text-slate-500">
                  Assigned: <strong className="text-slate-800">{flag.assignedRole}</strong>
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => handleAcknowledge(e, flag)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg font-bold text-[10px] transition-all flex items-center gap-1"
                  >
                    <Check className="w-3 h-3" />
                    <span>Acknowledge</span>
                  </button>

                  <span className="text-indigo-600 font-bold flex items-center gap-1 hover:underline">
                    <span>Open Patient Workspace</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
