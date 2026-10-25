import React, { useState } from "react";
import { Patient } from "../../types";
import { WardBed, DoctorOrder, VentilatorData } from "./types";
import { initialWardBeds } from "./mockWardData";
import { WardCommandCenterHeader } from "./WardCommandCenterHeader";
import { WhatNeedsAttentionModal } from "./WhatNeedsAttentionModal";
import { RoundsModeModal } from "./RoundsModeModal";
import { PatientWorkspaceModal } from "./PatientWorkspaceModal";
import { WardVitalsCapture } from "./WardVitalsCapture";
import { SmartIcuBedGrid } from "./SmartIcuBedGrid";
import { Bed, ShieldAlert, Activity, Heart, Thermometer, UserCheck, Stethoscope, ChevronRight, Plus, AlertTriangle, CheckCircle2, LayoutGrid, Wind, BellRing } from "lucide-react";

interface WardDashboardProps {
  patients: Patient[];
  onTriggerEmergencyAlarm: (uhid: string) => void;
}

export const WardDashboard: React.FC<WardDashboardProps> = ({ patients, onTriggerEmergencyAlarm }) => {
  const [beds, setBeds] = useState<WardBed[]>(initialWardBeds);
  const [activeFilter, setActiveFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [layoutViewMode, setLayoutViewMode] = useState<"SMART_ICU" | "STANDARD_GRID">("SMART_ICU");

  // Modal States
  const [isWhatNeedsAttentionOpen, setIsWhatNeedsAttentionOpen] = useState(false);
  const [isRoundsModeOpen, setIsRoundsModeOpen] = useState(false);
  const [selectedWorkspaceBed, setSelectedWorkspaceBed] = useState<WardBed | null>(null);

  // Handlers for Nurse Call & Ventilators
  const handleAcknowledgeNurseCall = (bedId: string) => {
    setBeds((prev) =>
      prev.map((b) => {
        if (b.bedId === bedId && b.nurseCallAlert) {
          return {
            ...b,
            nurseCallAlert: {
              ...b.nurseCallAlert,
              isActive: false,
              isAcknowledged: true,
              acknowledgedBy: "Nurse Station",
            },
          };
        }
        return b;
      })
    );
  };

  const handleUpdateVentilator = (bedId: string, vent: VentilatorData) => {
    setBeds((prev) =>
      prev.map((b) => {
        if (b.bedId === bedId) {
          return {
            ...b,
            ventilatorData: vent,
          };
        }
        return b;
      })
    );
  };

  // Stats calculation
  const totalBeds = 24; // Facility capacity
  const occupiedBeds = beds.filter((b) => b.status === "Occupied" && b.patientName);
  const occupiedCount = occupiedBeds.length;
  const criticalCount = occupiedBeds.filter((b) => b.clinicalStatus === "CRITICAL").length;
  const attentionCount = occupiedBeds.filter((b) => b.clinicalStatus === "ATTENTION").length;
  const stableCount = occupiedBeds.filter((b) => b.clinicalStatus === "STABLE" || b.clinicalStatus === "WATCH").length;

  const overdueTasksCount = occupiedBeds.reduce(
    (acc, b) => acc + b.nursingTasks.filter((t) => t.status === "OVERDUE").length,
    0
  );

  const criticalAlertsCount = occupiedBeds.reduce(
    (acc, b) => acc + b.alerts.filter((a) => !a.isAcknowledged).length,
    0
  );

  const surgeriesTodayCount = occupiedBeds.filter((b) => b.surgeryDetail?.status === "Scheduled").length;
  const dischargesTodayCount = occupiedBeds.filter((b) => b.dischargeChecklist.readinessPercentage >= 80).length;

  // Filter beds
  const filteredBeds = beds.filter((bed) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = bed.patientName?.toLowerCase().includes(q);
      const matchUhid = bed.patientUhid?.toLowerCase().includes(q);
      const matchDx = bed.diagnosis?.toLowerCase().includes(q);
      const matchBed = bed.bedId.toLowerCase().includes(q);
      const matchDoc = bed.attendingDoctor?.toLowerCase().includes(q);
      if (!matchName && !matchUhid && !matchDx && !matchBed && !matchDoc) return false;
    }

    if (activeFilter === "ALL") return true;
    if (activeFilter === "OCCUPIED") return bed.status === "Occupied";
    if (activeFilter === "CRITICAL") return bed.clinicalStatus === "CRITICAL";
    if (activeFilter === "ATTENTION") return bed.clinicalStatus === "ATTENTION";
    if (activeFilter === "STABLE") return bed.clinicalStatus === "STABLE" || bed.clinicalStatus === "WATCH";
    if (activeFilter === "OVERDUE") return bed.nursingTasks.some((t) => t.status === "OVERDUE");
    if (activeFilter === "ICU") return bed.wardName === "ICU" || bed.bedType === "ICU";
    if (activeFilter === "SURGERY") return bed.surgeryDetail?.status === "Scheduled";
    if (activeFilter === "DISCHARGE") return bed.dischargeChecklist.readinessPercentage >= 80;

    return true;
  });

  // Handler: Update specific bed state
  const handleUpdateBed = (updatedBed: WardBed) => {
    setBeds((prev) => prev.map((b) => (b.bedId === updatedBed.bedId ? updatedBed : b)));
    if (selectedWorkspaceBed?.bedId === updatedBed.bedId) {
      setSelectedWorkspaceBed(updatedBed);
    }
  };

  // Handler: Add Doctor Order during Rounds
  const handleAddDoctorOrderFromRounds = (bedId: string, title: string, category: any) => {
    setBeds((prev) =>
      prev.map((b) => {
        if (b.bedId === bedId) {
          const newOrder: DoctorOrder = {
            id: "ord-" + Date.now(),
            category: category || "Medication",
            title,
            details: title,
            orderedBy: "Dr. Murali Praveen",
            orderedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            status: "Active",
            priority: "Urgent",
          };
          return {
            ...b,
            orders: [newOrder, ...b.orders],
          };
        }
        return b;
      })
    );
  };

  // Handler: Add Progress Note during Rounds
  const handleAddProgressNoteFromRounds = (bedId: string, noteText: string) => {
    setBeds((prev) =>
      prev.map((b) => {
        if (b.bedId === bedId) {
          const newNote = {
            id: "pn-" + Date.now(),
            timeframe: "Morning" as const,
            date: new Date().toISOString().split("T")[0],
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            author: "Dr. Murali Praveen",
            role: "Attending Consultant",
            subjective: "Reviewed during ward rounds.",
            objective: "Vitals stable.",
            assessment: b.diagnosis || "Inpatient Care",
            plan: noteText,
            isSigned: true,
          };
          return {
            ...b,
            progressNotes: [newNote, ...b.progressNotes],
          };
        }
        return b;
      })
    );
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Header Bar */}
      <WardCommandCenterHeader
        totalBeds={totalBeds}
        occupiedCount={occupiedCount}
        criticalCount={criticalCount}
        attentionCount={attentionCount}
        stableCount={stableCount}
        overdueTasksCount={overdueTasksCount}
        criticalAlertsCount={criticalAlertsCount}
        surgeriesTodayCount={surgeriesTodayCount}
        dischargesTodayCount={dischargesTodayCount}
        activeFilter={activeFilter}
        onSelectFilter={setActiveFilter}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenWhatNeedsAttention={() => setIsWhatNeedsAttentionOpen(true)}
        onOpenRoundsMode={() => setIsRoundsModeOpen(true)}
      />
      <WardVitalsCapture
        beds={beds}
        onApprove={(bedId, vital) => setBeds((prev) => prev.map((bed) =>
          bed.bedId === bedId ? { ...bed, vitalsHistory: [...bed.vitalsHistory, vital] } : bed
        ))}
      />

      {/* Layout View Mode Switcher */}
      <div className="bg-slate-900 border border-slate-800 p-2 rounded-2xl flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLayoutViewMode("SMART_ICU")}
            className={`px-3.5 py-2 rounded-xl font-bold flex items-center gap-2 transition-all ${
              layoutViewMode === "SMART_ICU"
                ? "bg-cyan-600 text-white shadow-md"
                : "bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <Activity className="w-4 h-4 text-cyan-300" />
            <span>Smart ICU Bed Management Layout (Demo beds, not live)</span>
          </button>
          <button
            onClick={() => setLayoutViewMode("STANDARD_GRID")}
            className={`px-3.5 py-2 rounded-xl font-bold flex items-center gap-2 transition-all ${
              layoutViewMode === "STANDARD_GRID"
                ? "bg-cyan-600 text-white shadow-md"
                : "bg-slate-800 text-slate-400 hover:text-white"
            }`}
          >
            <LayoutGrid className="w-4 h-4 text-cyan-300" />
            <span>Compact Bed Grid</span>
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-3 font-mono text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5"><Wind className="w-3.5 h-3.5 text-indigo-400" /> Ventilator Sync</span>
          <span className="flex items-center gap-1.5"><BellRing className="w-3.5 h-3.5 text-amber-400" /> Nurse Call Engine</span>
        </div>
      </div>

      {/* Smart ICU Bed Management Graphical Layout vs Standard Grid */}
      {layoutViewMode === "SMART_ICU" ? (
        <SmartIcuBedGrid
          beds={filteredBeds}
          onSelectWorkspaceBed={(bed) => setSelectedWorkspaceBed(bed)}
          onAcknowledgeNurseCall={handleAcknowledgeNurseCall}
          onUpdateVentilator={handleUpdateVentilator}
          onTriggerEmergencyAlarm={onTriggerEmergencyAlarm}
        />
      ) : (
        /* Bed Layout Map Grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredBeds.map((bed) => {
          const isOccupied = bed.status === "Occupied" && bed.patientName;
          const latestVital = bed.vitalsHistory[bed.vitalsHistory.length - 1];

          // Determine bed card accent color
          let statusBorderColor = "border-slate-800 bg-slate-950/60";
          let statusBadgeColor = "bg-slate-800 text-slate-400";

          if (isOccupied) {
            if (bed.clinicalStatus === "CRITICAL") {
              statusBorderColor = "border-rose-500/70 bg-slate-900 shadow-rose-950/30 shadow-xl";
              statusBadgeColor = "bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse";
            } else if (bed.clinicalStatus === "ATTENTION") {
              statusBorderColor = "border-amber-500/70 bg-slate-900 shadow-amber-950/30 shadow-xl";
              statusBadgeColor = "bg-amber-500/20 text-amber-300 border border-amber-500/40";
            } else {
              statusBorderColor = "border-cyan-500/50 bg-slate-900 shadow-xl";
              statusBadgeColor = "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40";
            }
          }

          return (
            <div
              key={bed.bedId}
              className={`p-4 sm:p-5 rounded-2xl border transition-all space-y-3 relative group ${statusBorderColor}`}
            >
              {/* Card Top Row */}
              <div className="flex items-center justify-between">
                <span className="font-mono font-bold text-xs text-cyan-400 flex items-center gap-1.5">
                  <Bed className="w-4 h-4 text-cyan-500" />
                  {bed.bedId}
                </span>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${statusBadgeColor}`}>
                  {isOccupied ? bed.clinicalStatus : "Vacant & Sanitized"}
                </span>
              </div>

              {/* Occupied Patient Details */}
              {isOccupied ? (
                <div className="space-y-3 text-xs">
                  <div>
                    <h3 className="font-extrabold text-white text-sm hover:text-cyan-300 transition-colors cursor-pointer" onClick={() => setSelectedWorkspaceBed(bed)}>
                      {bed.patientName}
                    </h3>
                    <div className="text-slate-400 text-[11px] font-mono flex items-center justify-between mt-0.5">
                      <span>{bed.patientUhid}</span>
                      <span>Day {bed.admissionDay}</span>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-300 line-clamp-1 italic bg-slate-950 p-2 rounded-lg border border-slate-800/80">
                    Dx: {bed.diagnosis}
                  </div>

                  {/* Vitals Stream Grid */}
                  {latestVital ? (
                    <div className="grid grid-cols-2 gap-2 font-mono text-[11px] bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                      <div className={latestVital.hr > 100 ? "text-rose-400 font-bold" : "text-emerald-400"}>
                        HR: {latestVital.hr} bpm
                      </div>
                      <div className={latestVital.spo2 < 94 ? "text-rose-400 font-bold" : "text-cyan-400"}>
                        SpO2: {latestVital.spo2}%
                      </div>
                      <div className={latestVital.temp > 100.4 ? "text-amber-400 font-bold" : "text-slate-300"}>
                        Temp: {latestVital.temp}°F
                      </div>
                      <div className="text-slate-300">BP: {latestVital.bpSystolic}/{latestVital.bpDiastolic}</div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500 italic p-2 bg-slate-950 rounded-lg">Awaiting vitals entry</div>
                  )}

                  {/* Action Buttons */}
                  <div className="pt-1 flex flex-col gap-2">
                    <button
                      onClick={() => setSelectedWorkspaceBed(bed)}
                      className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md transition-colors"
                    >
                      <Stethoscope className="w-3.5 h-3.5" /> Open Patient Workspace
                    </button>

                    <button
                      onClick={() => onTriggerEmergencyAlarm(bed.patientUhid || "")}
                      className="w-full bg-rose-600/80 hover:bg-rose-500 text-white font-bold py-1.5 rounded-xl text-[11px] flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" /> Emergency Alarm
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 text-slate-600 flex items-center justify-center mx-auto">
                    <Bed className="w-5 h-5" />
                  </div>
                  <div className="text-xs font-bold text-slate-500">Bed Vacant & Sanitized</div>
                  <div className="text-[10px] text-slate-600">Ready for Immediate Admission</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}

      {/* Modals */}
      <WhatNeedsAttentionModal
        isOpen={isWhatNeedsAttentionOpen}
        onClose={() => setIsWhatNeedsAttentionOpen(false)}
        beds={beds}
        onOpenPatientWorkspace={(bed) => setSelectedWorkspaceBed(bed)}
      />

      <RoundsModeModal
        isOpen={isRoundsModeOpen}
        onClose={() => setIsRoundsModeOpen(false)}
        beds={beds}
        onOpenPatientWorkspace={(bed) => setSelectedWorkspaceBed(bed)}
        onAddDoctorOrder={handleAddDoctorOrderFromRounds}
        onAddProgressNote={handleAddProgressNoteFromRounds}
      />

      {selectedWorkspaceBed && (
        <PatientWorkspaceModal
          isOpen={!!selectedWorkspaceBed}
          onClose={() => setSelectedWorkspaceBed(null)}
          bed={selectedWorkspaceBed}
          onUpdateBed={handleUpdateBed}
          onTriggerEmergencyAlarm={onTriggerEmergencyAlarm}
        />
      )}
    </div>
  );
};
