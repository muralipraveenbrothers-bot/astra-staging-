import React from "react";
import { WardBed } from "./types";
import { ShieldAlert, X, AlertTriangle, Clock, Activity, FileText, CheckCircle2, ChevronRight, Stethoscope } from "lucide-react";

interface WhatNeedsAttentionModalProps {
  isOpen: boolean;
  onClose: () => void;
  beds: WardBed[];
  onOpenPatientWorkspace: (bed: WardBed) => void;
}

export const WhatNeedsAttentionModal: React.FC<WhatNeedsAttentionModalProps> = ({
  isOpen,
  onClose,
  beds,
  onOpenPatientWorkspace,
}) => {
  if (!isOpen) return null;

  // Gather critical items
  const occupiedBeds = beds.filter((b) => b.status === "Occupied" && b.patientName);

  const criticalBeds = occupiedBeds.filter(
    (b) => b.clinicalStatus === "CRITICAL" || b.clinicalStatus === "ATTENTION"
  );

  const activeAlerts = occupiedBeds.flatMap((b) =>
    b.alerts.map((a) => ({ ...a, bed: b }))
  );

  const overdueTasks = occupiedBeds.flatMap((b) =>
    b.nursingTasks
      .filter((t) => t.status === "OVERDUE")
      .map((t) => ({ ...t, bed: b }))
  );

  const pendingPreOps = occupiedBeds.flatMap((b) => {
    if (
      b.surgeryDetail &&
      b.surgeryDetail.status === "Scheduled" &&
      !b.surgeryDetail.preOpChecklist.allChecked
    ) {
      return [{ bed: b, detail: b.surgeryDetail }];
    }
    return [];
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl space-y-6 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold">
              <ShieldAlert className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Ward Attention Command Center
              </h2>
              <p className="text-xs text-slate-400">
                Actionable priority items across all ward & ICU beds needing immediate clinician attention
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-1">
          {/* Section 1: Critical Patient Safety Alerts */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Active Clinical & Trend Alerts ({activeAlerts.length})
            </h3>

            {activeAlerts.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 italic">
                No active clinical alerts at this moment.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {activeAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-rose-300 bg-rose-500/20 px-2 py-0.5 rounded">
                          {alert.bed.bedId}
                        </span>
                        <span className="font-bold text-white text-sm">{alert.bed.patientName}</span>
                        <span className="text-xs text-slate-400">({alert.bed.diagnosis})</span>
                      </div>
                      <div className="text-xs font-bold text-rose-200">{alert.title}</div>
                      <div className="text-xs text-slate-300">{alert.description}</div>
                      {alert.trendData && (
                        <div className="text-[11px] font-mono text-amber-300 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                          {alert.trendData}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        onClose();
                        onOpenPatientWorkspace(alert.bed);
                      }}
                      className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 shrink-0 self-end sm:self-center"
                    >
                      <span>Open Bed</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: Overdue Nursing & Medical Tasks */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-2">
              <Clock className="w-4 h-4" /> Overdue Clinical Tasks ({overdueTasks.length})
            </h3>

            {overdueTasks.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 italic">
                All nursing and medical tasks are up to date!
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {overdueTasks.map((task) => (
                  <div
                    key={task.id}
                    className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/40 flex items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-xs text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded">
                          {task.bed.bedId}
                        </span>
                        <span className="font-bold text-white text-xs">{task.bed.patientName}</span>
                        <span className="text-[10px] bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-0.5 rounded font-mono font-bold">
                          OVERDUE (Due {task.dueTime})
                        </span>
                      </div>
                      <div className="text-xs font-bold text-slate-200">{task.title}</div>
                      <div className="text-[11px] text-slate-400">Assigned: {task.assignedStaff}</div>
                    </div>

                    <button
                      onClick={() => {
                        onClose();
                        onOpenPatientWorkspace(task.bed);
                      }}
                      className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 shrink-0"
                    >
                      <span>Action</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 3: Patients Requiring Urgent Doctor Review */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
              <Stethoscope className="w-4 h-4" /> High Risk / Unstable Patients ({criticalBeds.length})
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {criticalBeds.map((bed) => (
                <div
                  key={bed.bedId}
                  className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 hover:border-cyan-500/50 transition-all cursor-pointer"
                  onClick={() => {
                    onClose();
                    onOpenPatientWorkspace(bed);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs text-cyan-400">{bed.bedId}</span>
                    <span
                      className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded ${
                        bed.clinicalStatus === "CRITICAL"
                          ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                          : "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                      }`}
                    >
                      {bed.clinicalStatus}
                    </span>
                  </div>
                  <div className="font-bold text-white text-sm">{bed.patientName}</div>
                  <div className="text-xs text-slate-400 line-clamp-1">{bed.diagnosis}</div>
                  <div className="text-[11px] text-slate-300 line-clamp-2 italic bg-slate-900 p-2 rounded border border-slate-800/80">
                    "{bed.aiSummary}"
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-5 py-2 rounded-xl text-xs"
          >
            Close Summary
          </button>
        </div>
      </div>
    </div>
  );
};
