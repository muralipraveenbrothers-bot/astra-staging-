import React from "react";
import { DataIntegrityIssue } from "../../services/dataIntegrityEngine";
import { ShieldAlert, AlertTriangle, CheckCircle2, UserCheck, RefreshCw, Layers } from "lucide-react";

interface DataIntegrityPanelProps {
  issues: DataIntegrityIssue[];
}

export const DataIntegrityPanel: React.FC<DataIntegrityPanelProps> = ({ issues }) => {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4 font-sans">
      <div className="flex items-center justify-between border-b pb-3 border-slate-100">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-amber-50 text-amber-600 font-bold">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <span>CLINICAL DATA INTEGRITY DETECTOR</span>
              <span className="bg-amber-100 text-amber-900 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full">
                {issues.length} System Flags
              </span>
            </h3>
            <p className="text-xs text-slate-500">
              Mandatory non-destructive validation engine detecting demographic mismatches, UHID conflicts & duplicate orders
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {issues.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-500 text-xs">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <span>All clinical database records verified. Zero data integrity conflicts detected.</span>
          </div>
        ) : (
          issues.map((issue) => (
            <div
              key={issue.id}
              className={`p-4 rounded-2xl border space-y-2.5 ${
                issue.severity === "CRITICAL"
                  ? "bg-rose-50/60 border-rose-200"
                  : issue.severity === "HIGH"
                  ? "bg-amber-50/60 border-amber-200"
                  : "bg-slate-50 border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full ${
                      issue.severity === "CRITICAL"
                        ? "bg-rose-600 text-white animate-pulse"
                        : issue.severity === "HIGH"
                        ? "bg-amber-600 text-white"
                        : "bg-slate-700 text-white"
                    }`}
                  >
                    {issue.type} • {issue.severity}
                  </span>
                  <span className="font-bold text-slate-900 text-sm">{issue.title}</span>
                </div>
                <span className="text-[10px] font-mono text-slate-500">UHID: {issue.patientUhid}</span>
              </div>

              <p className="text-xs text-slate-700 leading-relaxed font-sans">{issue.description}</p>

              <div className="p-3 bg-white/90 rounded-xl border border-slate-200/80 text-[11px] font-mono text-slate-800 space-y-1">
                <span className="text-[10px] text-amber-800 font-bold block uppercase">Recommended Resolution Guidance:</span>
                <p>{issue.suggestedAction}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
