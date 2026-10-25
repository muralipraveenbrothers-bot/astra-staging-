import React, { useState } from "react";
import { WardBed, VentilatorData } from "./types";
import {
  Bed,
  Activity,
  Wind,
  BellRing,
  ShieldAlert,
  Stethoscope,
  CheckCircle2,
  AlertTriangle,
  Video,
  Sliders,
  X,
  Heart,
  Thermometer,
  Zap,
} from "lucide-react";

interface SmartIcuBedGridProps {
  beds: WardBed[];
  onSelectWorkspaceBed: (bed: WardBed) => void;
  onAcknowledgeNurseCall?: (bedId: string) => void;
  onUpdateVentilator?: (bedId: string, vent: VentilatorData) => void;
  onTriggerEmergencyAlarm?: (uhid: string) => void;
  isDoctorConsole?: boolean;
}

export const SmartIcuBedGrid: React.FC<SmartIcuBedGridProps> = ({
  beds,
  onSelectWorkspaceBed,
  onAcknowledgeNurseCall,
  onUpdateVentilator,
  onTriggerEmergencyAlarm,
  isDoctorConsole = false,
}) => {
  const [editingVentBed, setEditingVentBed] = useState<WardBed | null>(null);
  const [tempVentData, setTempVentData] = useState<VentilatorData | null>(null);

  // Active Nurse Call Counts
  const activeNurseCalls = beds.filter((b) => b.nurseCallAlert?.isActive);
  const activeVentilators = beds.filter((b) => b.ventilatorData && b.ventilatorData.mode !== "Off (Room Air)");

  const handleStartEditVent = (bed: WardBed) => {
    if (bed.ventilatorData) {
      setEditingVentBed(bed);
      setTempVentData({ ...bed.ventilatorData });
    } else {
      setEditingVentBed(bed);
      setTempVentData({
        mode: "SIMV",
        fiO2: 50,
        peep: 8,
        tidalVolume: 450,
        respRate: 20,
        peakPressure: 24,
        status: "NORMAL",
        isIntubated: true,
      });
    }
  };

  const handleSaveVentilator = () => {
    if (editingVentBed && tempVentData && onUpdateVentilator) {
      onUpdateVentilator(editingVentBed.bedId, tempVentData);
      setEditingVentBed(null);
      setTempVentData(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Telemetry Stat Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center shrink-0">
            <Bed className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 font-sans">TOTAL MONITORED BEDS</div>
            <div className="text-white font-bold text-base">{beds.length} Active Beds</div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center shrink-0">
            <Wind className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 font-sans">ACTIVE VENTILATORS</div>
            <div className="text-indigo-300 font-bold text-base">{activeVentilators.length} Patients Supported</div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
            <BellRing className="w-5 h-5 animate-bounce" />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 font-sans">NURSE CALL ALERTS</div>
            <div className={`font-bold text-base ${activeNurseCalls.length > 0 ? "text-amber-300" : "text-emerald-400"}`}>
              {activeNurseCalls.length} Active Calls
            </div>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-3.5 rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 font-sans">CRITICAL ICU PATIENTS</div>
            <div className="text-rose-400 font-bold text-base">
              {beds.filter((b) => b.clinicalStatus === "CRITICAL").length} High Priority
            </div>
          </div>
        </div>
      </div>

      {/* Graphical Pod Layout Header */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-cyan-400 animate-pulse" />
          <h3 className="font-bold text-white text-sm">Graphical Smart ICU & Ward Layout Map</h3>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Critical</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Attention</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Stable</span>
        </div>
      </div>

      {/* Bed Cards Layout Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {beds.map((bed) => {
          const isOccupied = bed.status === "Occupied" && bed.patientName;
          const latestVital = bed.vitalsHistory[bed.vitalsHistory.length - 1];
          const vent = bed.ventilatorData;
          const nurseCall = bed.nurseCallAlert;

          let cardBorderClass = "border-slate-800 bg-slate-950";
          let statusBadge = "bg-slate-800 text-slate-400";

          if (isOccupied) {
            if (bed.clinicalStatus === "CRITICAL") {
              cardBorderClass = "border-rose-500/80 bg-slate-900/90 shadow-2xl shadow-rose-950/40";
              statusBadge = "bg-rose-500/20 text-rose-300 border border-rose-500/50 animate-pulse font-extrabold";
            } else if (bed.clinicalStatus === "ATTENTION") {
              cardBorderClass = "border-amber-500/80 bg-slate-900/90 shadow-2xl shadow-amber-950/40";
              statusBadge = "bg-amber-500/20 text-amber-300 border border-amber-500/50 font-bold";
            } else {
              cardBorderClass = "border-cyan-500/40 bg-slate-900/80";
              statusBadge = "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40";
            }
          }

          return (
            <div
              key={bed.bedId}
              className={`p-5 rounded-2xl border transition-all space-y-4 relative ${cardBorderClass}`}
            >
              {/* Card Header Row */}
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-cyan-950 text-cyan-400 border border-cyan-800 flex items-center justify-center font-mono font-bold text-xs">
                    <Bed className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-mono font-bold text-white text-sm flex items-center gap-1.5">
                      {bed.bedId}
                      <span className="text-[10px] font-sans font-normal text-slate-400">({bed.roomNumber})</span>
                    </div>
                    <div className="text-[10px] text-cyan-400 font-mono uppercase">{bed.wardName} • {bed.bedType}</div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono ${statusBadge}`}>
                    {isOccupied ? bed.clinicalStatus : "VACANT"}
                  </span>
                </div>
              </div>

              {isOccupied ? (
                <div className="space-y-3.5 text-xs">
                  {/* Patient Name & Header */}
                  <div>
                    <div className="flex items-center justify-between">
                      <h4
                        onClick={() => onSelectWorkspaceBed(bed)}
                        className="font-extrabold text-white text-sm hover:text-cyan-300 transition-colors cursor-pointer flex items-center gap-1.5"
                      >
                        {bed.patientName}
                      </h4>
                      <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950 px-2 py-0.5 rounded border border-cyan-800">
                        Day {bed.admissionDay}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 flex items-center justify-between mt-0.5">
                      <span>{bed.patientUhid} • {bed.age}Y/{bed.gender}</span>
                      <span className="text-slate-300 font-sans">{bed.attendingDoctor}</span>
                    </div>
                    <div className="text-[11px] text-slate-300 line-clamp-1 italic mt-1 bg-slate-950 p-2 rounded-lg border border-slate-800/80">
                      Dx: {bed.diagnosis}
                    </div>
                  </div>

                  {/* Active Nurse Call Alert Banner */}
                  {nurseCall && nurseCall.isActive && (
                    <div className="p-3 rounded-xl bg-amber-950/80 border border-amber-500/70 text-amber-200 space-y-2 animate-pulse shadow-lg">
                      <div className="flex items-center justify-between font-bold text-xs">
                        <span className="flex items-center gap-1.5 text-amber-300">
                          <BellRing className="w-4 h-4 text-amber-400 animate-bounce" />
                          {nurseCall.type}
                        </span>
                        <span className="font-mono text-[10px] bg-amber-900/80 px-2 py-0.5 rounded text-amber-300">
                          {nurseCall.triggeredAt}
                        </span>
                      </div>
                      {nurseCall.reason && (
                        <div className="text-[11px] text-amber-100 italic">{nurseCall.reason}</div>
                      )}
                      {onAcknowledgeNurseCall && (
                        <button
                          onClick={() => onAcknowledgeNurseCall(bed.bedId)}
                          className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-1 rounded-lg text-[11px] flex items-center justify-center gap-1 shadow transition-colors"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Acknowledge Nurse Call
                        </button>
                      )}
                    </div>
                  )}

                  {/* Real-time Vitals Stream Box */}
                  {latestVital ? (
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2 font-mono text-[11px]">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 text-[10px]">
                        <span className="text-cyan-400 font-sans font-bold flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                          DEMO VITALS, NOT LIVE
                        </span>
                        <span className="text-slate-500">{latestVital.timestamp}</span>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className={`p-1.5 rounded bg-slate-900 ${latestVital.hr > 100 ? "text-rose-400 font-bold border border-rose-500/40" : "text-emerald-400"}`}>
                          <div className="text-[9px] text-slate-500 font-sans">HEART RATE</div>
                          <div className="text-xs font-bold">{latestVital.hr} bpm</div>
                        </div>

                        <div className={`p-1.5 rounded bg-slate-900 ${latestVital.spo2 < 92 ? "text-rose-400 font-bold border border-rose-500/40" : "text-cyan-400"}`}>
                          <div className="text-[9px] text-slate-500 font-sans">SpO2</div>
                          <div className="text-xs font-bold">{latestVital.spo2}%</div>
                        </div>

                        <div className="p-1.5 rounded bg-slate-900 text-slate-200">
                          <div className="text-[9px] text-slate-500 font-sans">BLOOD PRESSURE</div>
                          <div className="text-xs font-bold">{latestVital.bpSystolic}/{latestVital.bpDiastolic}</div>
                        </div>

                        <div className={`p-1.5 rounded bg-slate-900 ${latestVital.temp > 100.4 ? "text-amber-400 font-bold" : "text-slate-300"}`}>
                          <div className="text-[9px] text-slate-500 font-sans">TEMP</div>
                          <div className="text-xs font-bold">{latestVital.temp}°F</div>
                        </div>

                        <div className="p-1.5 rounded bg-slate-900 text-slate-300">
                          <div className="text-[9px] text-slate-500 font-sans">RESP RATE</div>
                          <div className="text-xs font-bold">{latestVital.rr} /min</div>
                        </div>

                        <div className="p-1.5 rounded bg-slate-900 text-cyan-300">
                          <div className="text-[9px] text-slate-500 font-sans">GCS SCORE</div>
                          <div className="text-xs font-bold">{latestVital.gcs || 15}/15</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-500 italic p-3 bg-slate-950 rounded-xl border border-slate-800 text-center">
                      Awaiting vital stream connection
                    </div>
                  )}

                  {/* Ventilator Settings Block */}
                  {vent ? (
                    <div className="p-3 bg-slate-950 border border-indigo-900/70 rounded-xl space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-indigo-300 flex items-center gap-1.5">
                          <Wind className="w-4 h-4 text-indigo-400" /> Ventilator ({vent.mode})
                        </span>
                        <div className="flex items-center gap-1">
                          <span
                            className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold ${
                              vent.status === "HIGH PRESSURE ALARM"
                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse"
                                : "bg-emerald-500/20 text-emerald-300"
                            }`}
                          >
                            {vent.status}
                          </span>
                          <button
                            onClick={() => handleStartEditVent(bed)}
                            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
                            title="Adjust Ventilator Settings"
                          >
                            <Sliders className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-1.5 font-mono text-[10px] text-slate-300">
                        <div className="bg-slate-900 p-1.5 rounded">
                          <span className="text-slate-500 block">FiO2</span>
                          <span className="font-bold text-white">{vent.fiO2}%</span>
                        </div>
                        <div className="bg-slate-900 p-1.5 rounded">
                          <span className="text-slate-500 block">PEEP</span>
                          <span className="font-bold text-white">{vent.peep} cmH2O</span>
                        </div>
                        <div className="bg-slate-900 p-1.5 rounded">
                          <span className="text-slate-500 block">V<sub>T</sub></span>
                          <span className="font-bold text-white">{vent.tidalVolume} ml</span>
                        </div>
                        <div className="bg-slate-900 p-1.5 rounded">
                          <span className="text-slate-500 block">Peak P</span>
                          <span className={`font-bold ${vent.peakPressure > 30 ? "text-rose-400" : "text-white"}`}>
                            {vent.peakPressure} cmH2O
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between text-xs text-slate-500">
                      <span className="flex items-center gap-1.5"><Wind className="w-4 h-4 text-slate-600" /> Non-Ventilated (Spontaneous)</span>
                      <button
                        onClick={() => handleStartEditVent(bed)}
                        className="text-[10px] text-cyan-400 font-mono hover:underline"
                      >
                        + Attach Vent
                      </button>
                    </div>
                  )}

                  {/* Card Action Buttons */}
                  <div className="pt-1 flex flex-col gap-2">
                    <button
                      onClick={() => onSelectWorkspaceBed(bed)}
                      className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-2 shadow transition-colors"
                    >
                      <Stethoscope className="w-4 h-4" /> Open Full Patient Workspace
                    </button>

                    {onTriggerEmergencyAlarm && (
                      <button
                        onClick={() => onTriggerEmergencyAlarm(bed.patientUhid || "")}
                        className="w-full bg-rose-600/80 hover:bg-rose-500 text-white font-bold py-1.5 rounded-xl text-[11px] flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <ShieldAlert className="w-3.5 h-3.5" /> Emergency Code Blue / Alarm
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-10 text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 text-slate-600 flex items-center justify-center mx-auto">
                    <Bed className="w-6 h-6" />
                  </div>
                  <div className="text-xs font-bold text-slate-500">Bed Vacant & Sanitized</div>
                  <div className="text-[10px] text-slate-600">Ready for Immediate Admission</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Ventilator Settings Editor Modal */}
      {editingVentBed && tempVentData && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-sm flex items-center gap-2">
                <Wind className="w-5 h-5 text-indigo-400" /> Ventilator Settings — {editingVentBed.bedId}
              </h3>
              <button
                onClick={() => setEditingVentBed(null)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1 font-bold">Ventilation Mode</label>
                <select
                  value={tempVentData.mode}
                  onChange={(e) => setTempVentData({ ...tempVentData, mode: e.target.value as any })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white"
                >
                  <option value="SIMV">SIMV (Synchronized Intermittent Mandatory Ventilation)</option>
                  <option value="AC/VC">AC/VC (Assist Control / Volume Control)</option>
                  <option value="CPAP/PSV">CPAP/PSV (Continuous Positive Airway Pressure)</option>
                  <option value="PRVC">PRVC (Pressure Regulated Volume Control)</option>
                  <option value="High Flow Nasal Cannula">High Flow Nasal Cannula</option>
                  <option value="BiPAP">BiPAP</option>
                  <option value="Off (Room Air)">Off (Room Air)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">FiO2 (%)</label>
                  <input
                    type="number"
                    value={tempVentData.fiO2}
                    onChange={(e) => setTempVentData({ ...tempVentData, fiO2: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">PEEP (cmH2O)</label>
                  <input
                    type="number"
                    value={tempVentData.peep}
                    onChange={(e) => setTempVentData({ ...tempVentData, peep: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Tidal Volume (ml)</label>
                  <input
                    type="number"
                    value={tempVentData.tidalVolume}
                    onChange={(e) => setTempVentData({ ...tempVentData, tidalVolume: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Peak Pressure (cmH2O)</label>
                  <input
                    type="number"
                    value={tempVentData.peakPressure}
                    onChange={(e) => setTempVentData({ ...tempVentData, peakPressure: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2 text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-bold">Alarm / Operational Status</label>
                <select
                  value={tempVentData.status}
                  onChange={(e) => setTempVentData({ ...tempVentData, status: e.target.value as any })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white"
                >
                  <option value="NORMAL">NORMAL</option>
                  <option value="HIGH PRESSURE ALARM">HIGH PRESSURE ALARM</option>
                  <option value="APNEA ALERT">APNEA ALERT</option>
                  <option value="LOW VOLUME">LOW VOLUME</option>
                  <option value="OFF">OFF</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                onClick={() => setEditingVentBed(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveVentilator}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg"
              >
                Save Ventilator Parameters
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
