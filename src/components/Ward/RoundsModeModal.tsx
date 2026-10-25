import React, { useState } from "react";
import { WardBed } from "./types";
import { Stethoscope, X, ChevronLeft, ChevronRight, Activity, Heart, Thermometer, ShieldAlert, FileText, Plus, CheckCircle2, Mic } from "lucide-react";

interface RoundsModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  beds: WardBed[];
  onOpenPatientWorkspace: (bed: WardBed) => void;
  onAddDoctorOrder: (bedId: string, orderText: string, category: any) => void;
  onAddProgressNote: (bedId: string, noteText: string) => void;
}

export const RoundsModeModal: React.FC<RoundsModeModalProps> = ({
  isOpen,
  onClose,
  beds,
  onOpenPatientWorkspace,
  onAddDoctorOrder,
  onAddProgressNote,
}) => {
  const occupiedBeds = beds.filter((b) => b.status === "Occupied" && b.patientName);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [newOrderInput, setNewOrderInput] = useState("");
  const [newNoteInput, setNewNoteInput] = useState("");
  const [showOrderInput, setShowOrderInput] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);

  if (!isOpen || occupiedBeds.length === 0) return null;

  const currentBed = occupiedBeds[currentIndex];
  const latestVital = currentBed.vitalsHistory[currentBed.vitalsHistory.length - 1];

  const handleNext = () => {
    if (currentIndex < occupiedBeds.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setShowOrderInput(false);
      setShowNoteInput(false);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setShowOrderInput(false);
      setShowNoteInput(false);
    }
  };

  const handleSaveOrder = () => {
    if (newOrderInput.trim()) {
      onAddDoctorOrder(currentBed.bedId, newOrderInput.trim(), "Medication");
      setNewOrderInput("");
      setShowOrderInput(false);
    }
  };

  const handleSaveNote = () => {
    if (newNoteInput.trim()) {
      onAddProgressNote(currentBed.bedId, newNoteInput.trim());
      setNewNoteInput("");
      setShowNoteInput(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-5xl w-full p-5 sm:p-6 shadow-2xl space-y-5 max-h-[92vh] flex flex-col">
        {/* Header Bar */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center font-bold">
              <Stethoscope className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Doctor Ward Rounds Mode
                <span className="text-xs font-mono font-normal text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/30">
                  Bed {currentIndex + 1} of {occupiedBeds.length}
                </span>
              </h2>
              <p className="text-xs text-slate-400">Sequential 30-second patient review, quick order entry, and clinical sign-off</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={handleNext}
              disabled={currentIndex === occupiedBeds.length - 1}
              className="p-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-30 text-white font-bold flex items-center gap-1 text-xs px-3"
            >
              <span>Next Bed</span>
              <ChevronRight className="w-5 h-5" />
            </button>
            <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Patient Header Summary */}
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-cyan-400 text-sm bg-cyan-500/20 px-2 py-0.5 rounded border border-cyan-500/40">
                {currentBed.bedId} ({currentBed.wardName})
              </span>
              <h3 className="text-base font-bold text-white">{currentBed.patientName}</h3>
              <span className="text-xs text-slate-400">
                {currentBed.age}Y/{currentBed.gender} • UHID: {currentBed.patientUhid}
              </span>
            </div>
            <div className="text-xs text-slate-300 font-medium mt-1">
              Diagnosis: <span className="text-cyan-300">{currentBed.diagnosis}</span> • Admission Day {currentBed.admissionDay}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-mono font-bold border ${
                currentBed.clinicalStatus === "CRITICAL"
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                  : currentBed.clinicalStatus === "ATTENTION"
                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                  : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
              }`}
            >
              {currentBed.clinicalStatus}
            </span>
            <button
              onClick={() => {
                onClose();
                onOpenPatientWorkspace(currentBed);
              }}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-3 py-1.5 rounded-lg border border-slate-700"
            >
              Full Workspace →
            </button>
          </div>
        </div>

        {/* Rounds Body Grid */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* AI 30-Second Clinical Summary */}
          <div className="p-4 rounded-xl bg-cyan-950/20 border border-cyan-500/30 space-y-2">
            <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-cyan-400" /> 30-Second AI Clinical Rounds Summary
            </h4>
            <p className="text-xs text-slate-200 leading-relaxed italic">
              "{currentBed.aiSummary || "Patient stable and resting comfortably. No major overnight deterioration recorded."}"
            </p>
          </div>

          {/* Vitals Grid */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" /> Latest Vital Signs ({latestVital ? latestVital.timestamp : "N/A"})
            </h4>
            {latestVital ? (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 font-mono text-xs">
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-500">HEART RATE</div>
                  <div className={`text-sm font-bold ${latestVital.hr > 100 ? "text-rose-400" : "text-emerald-400"}`}>
                    {latestVital.hr} bpm
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-500">BLOOD PRESSURE</div>
                  <div className="text-sm font-bold text-cyan-400">
                    {latestVital.bpSystolic}/{latestVital.bpDiastolic}
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-500">TEMPERATURE</div>
                  <div className={`text-sm font-bold ${latestVital.temp > 100.4 ? "text-amber-400" : "text-slate-200"}`}>
                    {latestVital.temp}°F
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-500">SPO2 SATURATION</div>
                  <div className={`text-sm font-bold ${latestVital.spo2 < 94 ? "text-rose-400" : "text-cyan-400"}`}>
                    {latestVital.spo2}%
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 col-span-2 sm:col-span-1">
                  <div className="text-[10px] text-slate-500">RESPIRATORY RATE</div>
                  <div className="text-sm font-bold text-slate-200">{latestVital.rr} /min</div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500 italic">No vitals logged yet.</div>
            )}
          </div>

          {/* Active Orders & MAR Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <h4 className="text-xs font-bold text-slate-300">Active Doctor Orders ({currentBed.orders.length})</h4>
              <div className="space-y-1.5 text-xs max-h-36 overflow-y-auto">
                {currentBed.orders.map((o) => (
                  <div key={o.id} className="p-2 rounded bg-slate-900 border border-slate-800/80">
                    <div className="font-bold text-cyan-300">{o.title}</div>
                    <div className="text-[11px] text-slate-400">{o.details}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <h4 className="text-xs font-bold text-slate-300">Overdue / Pending Nursing Tasks</h4>
              <div className="space-y-1.5 text-xs max-h-36 overflow-y-auto">
                {currentBed.nursingTasks.map((nt) => (
                  <div key={nt.id} className="p-2 rounded bg-slate-900 border border-slate-800/80 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-200">{nt.title}</div>
                      <div className="text-[10px] text-slate-400">Due: {nt.dueTime}</div>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                        nt.status === "OVERDUE" ? "bg-red-500/20 text-red-400" : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {nt.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Round Action Entry Inputs */}
          {showOrderInput && (
            <div className="p-3 bg-slate-950 border border-cyan-500/50 rounded-xl space-y-2 animate-fadeIn">
              <div className="text-xs font-bold text-cyan-400">Add New Doctor Order for {currentBed.patientName}:</div>
              <input
                type="text"
                value={newOrderInput}
                onChange={(e) => setNewOrderInput(e.target.value)}
                placeholder="e.g., Inj. Paracetamol 1g IV stat, Repeat CBC at 4 PM, Keep NPO after midnight..."
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowOrderInput(false)} className="px-3 py-1 rounded bg-slate-800 text-xs text-slate-400">
                  Cancel
                </button>
                <button onClick={handleSaveOrder} className="px-3 py-1 rounded bg-cyan-600 hover:bg-cyan-500 text-xs font-bold text-white">
                  Confirm & Create Order
                </button>
              </div>
            </div>
          )}

          {showNoteInput && (
            <div className="p-3 bg-slate-950 border border-emerald-500/50 rounded-xl space-y-2 animate-fadeIn">
              <div className="text-xs font-bold text-emerald-400">Add Doctor Rounds Progress Note:</div>
              <textarea
                value={newNoteInput}
                onChange={(e) => setNewNoteInput(e.target.value)}
                placeholder="Subjective complaints, clinical findings, assessment and plan..."
                rows={3}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowNoteInput(false)} className="px-3 py-1 rounded bg-slate-800 text-xs text-slate-400">
                  Cancel
                </button>
                <button onClick={handleSaveNote} className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white">
                  Save Progress Note
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Rounds Action Bar */}
        <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setShowOrderInput(!showOrderInput);
                setShowNoteInput(false);
              }}
              className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-md"
            >
              <Plus className="w-4 h-4" /> Add Doctor Order
            </button>
            <button
              onClick={() => {
                setShowNoteInput(!showNoteInput);
                setShowOrderInput(false);
              }}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-md"
            >
              <FileText className="w-4 h-4" /> Add Progress Note
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleNext}
              disabled={currentIndex === occupiedBeds.length - 1}
              className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2"
            >
              <span>Next Patient ({currentIndex + 2}/{occupiedBeds.length})</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
