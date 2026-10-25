import React from "react";
import { Bed, ShieldAlert, Activity, Stethoscope, Search, AlertTriangle, CheckCircle2, Clock, Calendar, Sparkles, Filter } from "lucide-react";

interface WardCommandCenterHeaderProps {
  totalBeds: number;
  occupiedCount: number;
  criticalCount: number;
  attentionCount: number;
  stableCount: number;
  overdueTasksCount: number;
  criticalAlertsCount: number;
  surgeriesTodayCount: number;
  dischargesTodayCount: number;
  activeFilter: string;
  onSelectFilter: (filter: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenWhatNeedsAttention: () => void;
  onOpenRoundsMode: () => void;
}

export const WardCommandCenterHeader: React.FC<WardCommandCenterHeaderProps> = ({
  totalBeds,
  occupiedCount,
  criticalCount,
  attentionCount,
  stableCount,
  overdueTasksCount,
  criticalAlertsCount,
  surgeriesTodayCount,
  dischargesTodayCount,
  activeFilter,
  onSelectFilter,
  searchQuery,
  onSearchChange,
  onOpenWhatNeedsAttention,
  onOpenRoundsMode,
}) => {
  const filterPills = [
    { id: "ALL", label: `All Beds (${totalBeds})` },
    { id: "OCCUPIED", label: `Occupied (${occupiedCount})` },
    { id: "CRITICAL", label: `Critical (${criticalCount})`, badgeColor: "bg-rose-500/20 text-rose-300 border-rose-500/40" },
    { id: "ATTENTION", label: `Needs Attention (${attentionCount})`, badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
    { id: "STABLE", label: `Stable (${stableCount})` },
    { id: "OVERDUE", label: `Overdue Tasks (${overdueTasksCount})`, badgeColor: "bg-red-500/20 text-red-300 border-red-500/40" },
    { id: "ICU", label: "ICU Beds" },
    { id: "SURGERY", label: `Surgeries (${surgeriesTodayCount})` },
    { id: "DISCHARGE", label: `Ready Discharge (${dischargesTodayCount})` },
  ];

  return (
    <div className="space-y-4">
      {/* Top Main Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 relative overflow-hidden">
        {/* Glow effect */}
        <div className="absolute -top-12 -right-12 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 flex items-center justify-center font-bold shadow-lg shrink-0">
            <Bed className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                Digital Ward Command Center
              </h1>
              <span className="text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 px-2.5 py-0.5 rounded-full font-mono font-semibold">
                Astra AI Inpatient OS
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Zero-Miss Patient Safety Engine • Real-Time Vitals • MAR • Doctor Orders • Smart Handover • AI Clinical Copilot
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full lg:w-auto">
          {/* WHAT NEEDS MY ATTENTION? Button */}
          <button
            onClick={onOpenWhatNeedsAttention}
            className="flex-1 lg:flex-none bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs sm:text-sm shadow-xl flex items-center justify-center gap-2 border border-amber-400/30 transition-all transform hover:scale-[1.02] active:scale-95"
          >
            <ShieldAlert className="w-4 h-4 text-amber-200 animate-pulse" />
            <span>WHAT NEEDS MY ATTENTION?</span>
            {criticalAlertsCount + overdueTasksCount > 0 && (
              <span className="bg-white text-rose-700 font-extrabold text-[10px] px-2 py-0.5 rounded-full">
                {criticalAlertsCount + overdueTasksCount}
              </span>
            )}
          </button>

          {/* DOCTOR ROUNDS MODE Button */}
          <button
            onClick={onOpenRoundsMode}
            className="flex-1 lg:flex-none bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold px-4 py-2.5 rounded-xl text-xs sm:text-sm border border-cyan-500/40 shadow-lg flex items-center justify-center gap-2 transition-all"
          >
            <Stethoscope className="w-4 h-4 text-cyan-400" />
            <span>DOCTOR ROUNDS MODE</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
        <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl">
          <div className="text-[10px] text-slate-400 font-medium">TOTAL BEDS</div>
          <div className="text-lg font-bold text-white font-mono">{totalBeds}</div>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl">
          <div className="text-[10px] text-slate-400 font-medium">OCCUPIED</div>
          <div className="text-lg font-bold text-cyan-400 font-mono">{occupiedCount}</div>
        </div>
        <div className="bg-slate-900/80 border border-rose-900/50 p-3 rounded-xl bg-rose-950/20">
          <div className="text-[10px] text-rose-400 font-medium flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> CRITICAL
          </div>
          <div className="text-lg font-bold text-rose-400 font-mono">{criticalCount}</div>
        </div>
        <div className="bg-slate-900/80 border border-amber-900/50 p-3 rounded-xl bg-amber-950/20">
          <div className="text-[10px] text-amber-400 font-medium">ATTENTION</div>
          <div className="text-lg font-bold text-amber-400 font-mono">{attentionCount}</div>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl">
          <div className="text-[10px] text-emerald-400 font-medium">STABLE</div>
          <div className="text-lg font-bold text-emerald-400 font-mono">{stableCount}</div>
        </div>
        <div className="bg-slate-900/80 border border-red-900/60 p-3 rounded-xl bg-red-950/20">
          <div className="text-[10px] text-red-300 font-medium">OVERDUE TASKS</div>
          <div className="text-lg font-bold text-red-400 font-mono">{overdueTasksCount}</div>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl">
          <div className="text-[10px] text-purple-400 font-medium">SURGERIES</div>
          <div className="text-lg font-bold text-purple-300 font-mono">{surgeriesTodayCount}</div>
        </div>
        <div className="bg-slate-900/80 border border-slate-800 p-3 rounded-xl">
          <div className="text-[10px] text-blue-400 font-medium">DISCHARGES</div>
          <div className="text-lg font-bold text-blue-300 font-mono">{dischargesTodayCount}</div>
        </div>
      </div>

      {/* Filter Bar & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 p-2.5 rounded-2xl border border-slate-800">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by Patient Name, UHID, Diagnosis, Bed or Doctor..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 sm:pb-0">
          {filterPills.map((pill) => {
            const isSelected = activeFilter === pill.id;
            return (
              <button
                key={pill.id}
                onClick={() => onSelectFilter(pill.id)}
                className={`px-3 py-1 rounded-xl text-xs font-medium whitespace-nowrap transition-all border ${
                  isSelected
                    ? "bg-cyan-600 text-white border-cyan-400 shadow-md"
                    : "bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
