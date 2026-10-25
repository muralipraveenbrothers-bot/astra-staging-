// ASTRA AI — Structured Clinical & Operational UI Cards
import React from "react";
import {
  User, Activity, FileText, Printer, Phone, AlertTriangle, CheckCircle2,
  Clock, ShieldAlert, ShieldCheck, ArrowRight, Stethoscope, ChevronRight, Sparkles, HeartPulse, Pill, Layers
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// 1. PATIENT SNAPSHOT CARD
// ─────────────────────────────────────────────────────────────────────────────
export interface PatientSnapshotData {
  id: string;
  name: string;
  age: number;
  gender: string;
  uhid: string;
  ipNumber?: string;
  ward: string;
  bed: string;
  consultant: string;
  admissionDate: string;
  diagnosis: string;
  vitals: { hr: number; bp: string; temp: string; spo2: number; rr?: number };
  allergies: string[];
  latestLabs: { test: string; value: string; status: "NORMAL" | "ELEVATED" | "CRITICAL" }[];
  activeMeds: string[];
  pendingOrders?: string[];
}

export function PatientSnapshotCard({
  data,
  onAction,
}: {
  data: PatientSnapshotData;
  onAction?: (action: string, payload?: any) => void;
}) {
  return (
    <div className="my-2 rounded-xl border border-cyan-500/30 bg-slate-900/90 p-4 shadow-xl backdrop-blur-md transition-all hover:border-cyan-500/50">
      {/* Header Badge */}
      <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
            <User size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-100 text-sm">{data.name}</h3>
              <span className="rounded bg-cyan-950 px-1.5 py-0.5 text-[10px] font-mono text-cyan-300 border border-cyan-500/30">
                {data.uhid}
              </span>
              {data.ipNumber && (
                <span className="rounded bg-violet-950 px-1.5 py-0.5 text-[10px] font-mono text-violet-300 border border-violet-500/30">
                  {data.ipNumber}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              {data.age}y / {data.gender} · <span className="text-slate-200 font-semibold">{data.ward} — {data.bed}</span>
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/40">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
            ADMITTED
          </span>
          <p className="text-[9px] text-slate-500 font-mono mt-0.5">Consultant: {data.consultant}</p>
        </div>
      </div>

      {/* Primary Diagnosis & Allergies */}
      <div className="mb-3 space-y-1.5">
        <div className="rounded-lg bg-slate-950/70 p-2 border border-slate-800">
          <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider block">Primary Diagnosis</span>
          <span className="text-xs text-slate-200 font-medium">{data.diagnosis}</span>
        </div>

        {data.allergies.length > 0 && (
          <div className="flex items-center gap-1.5 text-[11px] text-rose-300 bg-rose-950/40 px-2.5 py-1 rounded border border-rose-500/30">
            <ShieldAlert size={13} className="text-rose-400 shrink-0" />
            <span className="font-bold">Allergies:</span> {data.allergies.join(", ")}
          </div>
        )}
      </div>

      {/* Live Vitals Grid */}
      <div className="mb-3 grid grid-cols-4 gap-2">
        <div className="rounded-lg bg-slate-950/80 p-2 border border-slate-800 text-center">
          <span className="text-[9px] text-slate-400 font-bold uppercase block">Heart Rate</span>
          <span className="text-sm font-bold font-mono text-emerald-400">{data.vitals.hr} <span className="text-[9px] text-slate-500">bpm</span></span>
        </div>
        <div className="rounded-lg bg-slate-950/80 p-2 border border-slate-800 text-center">
          <span className="text-[9px] text-slate-400 font-bold uppercase block">Blood Pressure</span>
          <span className="text-sm font-bold font-mono text-cyan-300">{data.vitals.bp} <span className="text-[9px] text-slate-500">mmHg</span></span>
        </div>
        <div className="rounded-lg bg-slate-950/80 p-2 border border-slate-800 text-center">
          <span className="text-[9px] text-slate-400 font-bold uppercase block">SpO2 (Room Air)</span>
          <span className="text-sm font-bold font-mono text-cyan-300">{data.vitals.spo2}%</span>
        </div>
        <div className="rounded-lg bg-slate-950/80 p-2 border border-slate-800 text-center">
          <span className="text-[9px] text-slate-400 font-bold uppercase block">Temperature</span>
          <span className="text-sm font-bold font-mono text-amber-300">{data.vitals.temp}</span>
        </div>
      </div>

      {/* Latest Lab Summary & Active Meds */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-lg bg-slate-950/60 p-2.5 border border-slate-800">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Latest Lab Results</span>
          <div className="space-y-1 text-[11px]">
            {data.latestLabs.map((l, i) => (
              <div key={i} className="flex justify-between items-center">
                <span className="text-slate-300">{l.test}</span>
                <span className={cn("font-mono font-bold text-[10px] px-1 rounded",
                  l.status === "ELEVATED" ? "bg-amber-500/20 text-amber-300" :
                  l.status === "CRITICAL" ? "bg-rose-500/20 text-rose-300 animate-pulse" : "text-slate-300")}>
                  {l.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg bg-slate-950/60 p-2.5 border border-slate-800">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Active Medications</span>
          <ul className="space-y-0.5 text-[11px] text-slate-300 list-disc list-inside">
            {data.activeMeds.slice(0, 3).map((m, i) => (
              <li key={i} className="truncate">{m}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="flex gap-1.5 flex-wrap pt-2 border-t border-slate-800/80">
        <button onClick={() => onAction?.("order_lab", data)}
          className="flex-1 py-1 px-2 rounded bg-cyan-500/20 text-cyan-200 border border-cyan-500/40 text-[10px] font-bold hover:bg-cyan-500/30 transition-all flex items-center justify-center gap-1">
          <Stethoscope size={11} /> Order Labs
        </button>
        <button onClick={() => onAction?.("open_timeline", data)}
          className="flex-1 py-1 px-2 rounded bg-purple-500/20 text-purple-200 border border-purple-500/40 text-[10px] font-bold hover:bg-purple-500/30 transition-all flex items-center justify-center gap-1">
          <FileText size={11} /> Open Timeline
        </button>
        <button onClick={() => onAction?.("call_ward", data)}
          className="flex-1 py-1 px-2 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 text-[10px] font-bold hover:bg-emerald-500/30 transition-all flex items-center justify-center gap-1">
          <Phone size={11} /> Call Ward
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. DOCTOR ORDER ACKNOWLEDGEMENT CARD
// ─────────────────────────────────────────────────────────────────────────────
export function DoctorOrderCard({
  orderId,
  tests,
  priority,
  patientName,
  status,
  message,
}: {
  orderId: string;
  tests: string[];
  priority: string;
  patientName: string;
  status: string;
  message: string;
}) {
  return (
    <div className="my-2 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 shadow-lg backdrop-blur-md">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            <CheckCircle2 size={14} />
          </div>
          <span className="text-xs font-bold text-emerald-300">LAB ORDER CREATED · #{orderId}</span>
        </div>
        <span className="text-[9px] font-mono uppercase bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-500/40">
          {priority}
        </span>
      </div>
      <p className="text-[11px] text-slate-300 font-medium mb-1">{message}</p>
      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 bg-slate-950/60 px-2 py-1 rounded border border-slate-800">
        <span>Target Patient: <strong className="text-slate-200">{patientName}</strong></span>
        <span>Dept: <strong className="text-cyan-300">Laboratory Dashboard</strong></span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. PRINT JOB DISPATCH CARD
// ─────────────────────────────────────────────────────────────────────────────
export function PrintJobCard({
  jobId,
  printer,
  status,
  timestamp,
  message,
}: {
  jobId: string;
  printer: string;
  status: string;
  timestamp: string;
  message: string;
}) {
  return (
    <div className="my-2 rounded-xl border border-sky-500/30 bg-sky-950/20 p-3 shadow-lg backdrop-blur-md">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-sky-500/20 text-sky-300 border border-sky-500/40">
            <Printer size={14} />
          </div>
          <span className="text-xs font-bold text-sky-300">RECEPTION PRINT DISPATCH · #{jobId}</span>
        </div>
        <span className="text-[9px] font-mono uppercase bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded border border-sky-500/40">
          {status}
        </span>
      </div>
      <p className="text-[11px] text-slate-300 mb-1">{message}</p>
      <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 bg-slate-950/60 px-2 py-1 rounded border border-slate-800">
        <span>Target Printer: <strong className="text-sky-300">{printer}</strong></span>
        <span>Acknowledged: <strong className="text-emerald-400">{timestamp}</strong></span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. INTERDEPARTMENTAL CALL PANEL CARD
// ─────────────────────────────────────────────────────────────────────────────
export function CallCard({
  channelId,
  target,
  callType,
  status,
  onHangup,
}: {
  channelId: string;
  target: string;
  callType: string;
  status: string;
  onHangup?: () => void;
}) {
  return (
    <div className="my-2 rounded-xl border border-purple-500/40 bg-purple-950/30 p-3.5 shadow-2xl backdrop-blur-md animate-pulse">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/50">
            <Phone size={18} className="animate-bounce" />
          </div>
          <div>
            <div className="text-xs font-bold text-purple-200">INTERDEPARTMENTAL CALL — {target.toUpperCase()}</div>
            <p className="text-[10px] text-purple-300 font-mono">WebRTC Channel: {channelId} · {callType.toUpperCase()}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded bg-purple-500/20 px-2 py-0.5 text-[10px] font-bold text-purple-200 border border-purple-500/40">
            {status.toUpperCase()}
          </span>
          {onHangup && (
            <button
              onClick={onHangup}
              className="rounded-lg border border-rose-700 bg-rose-950/60 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-900"
            >
              Hang up
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. STAGED ACTION DOCTOR APPROVAL CARD (HUMAN CHECKPOINT GATE)
// ─────────────────────────────────────────────────────────────────────────────
export function DoctorApprovalCard({
  actionId,
  actionHash,
  actionType,
  patientName,
  uhid,
  wardBed,
  payloadSummary,
  riskTier = "L3_CLINICAL_SIGN",
  onSignApprove,
  onReject,
  onEdit,
}: {
  actionId: string;
  actionHash: string;
  actionType: string;
  patientName: string;
  uhid: string;
  wardBed: string;
  payloadSummary: string;
  riskTier?: string;
  onSignApprove?: (actionId: string, actionHash: string) => void;
  onReject?: (actionId: string) => void;
  onEdit?: (actionId: string) => void;
}) {
  return (
    <div className="my-2 rounded-xl border border-amber-500/40 bg-amber-950/30 p-4 shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-amber-500/20 pb-2.5 mb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40">
            <ShieldAlert size={18} />
          </div>
          <div>
            <h4 className="font-bold text-amber-200 text-sm">DOCTOR ORDER — REVIEW & SIGNATURE REQUIRED</h4>
            <p className="text-[10px] text-amber-300/80 font-mono">Action ID: {actionId} · Risk: {riskTier}</p>
          </div>
        </div>
        <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-amber-300 border border-amber-500/40">
          STAGED
        </span>
      </div>

      <div className="space-y-2 text-xs mb-3">
        <div className="flex items-center justify-between text-slate-300 bg-slate-950/60 p-2 rounded border border-slate-800">
          <span>Patient: <strong className="text-slate-100">{patientName}</strong> ({uhid})</span>
          <span className="text-cyan-300 font-semibold">{wardBed}</span>
        </div>
        <div className="bg-slate-950/80 p-2.5 rounded border border-slate-800 text-slate-200 font-medium">
          <span className="text-[10px] uppercase font-bold text-amber-400 block mb-1">Staged Command Payload</span>
          {payloadSummary}
        </div>
        <div className="flex items-center justify-between text-[9px] font-mono text-slate-500 px-1">
          <span>Action Hash: {actionHash.slice(0, 16)}...</span>
          <span>Verification: Authenticated Doctor Key</span>
        </div>
      </div>

      <div className="flex gap-2 pt-2 border-t border-amber-500/20">
        <button onClick={() => onEdit?.(actionId)}
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-all">
          Edit
        </button>
        <button onClick={() => onReject?.(actionId)}
          className="px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900 text-rose-300 text-xs font-semibold border border-rose-800 transition-all">
          Reject
        </button>
        <button onClick={() => onSignApprove?.(actionId, actionHash)}
          className="flex-1 py-1.5 px-3 rounded-lg bg-gradient-to-r from-amber-500 to-emerald-600 hover:from-amber-400 hover:to-emerald-500 text-slate-950 font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-1.5">
          <ShieldCheck size={14} /> Sign & Approve
        </button>
      </div>
    </div>
  );
}
