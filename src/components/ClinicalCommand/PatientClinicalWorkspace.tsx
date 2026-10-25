import React, { useMemo, useState } from "react";
import { Patient, LabOrder, RadiologyReport, Prescription } from "../../types";
import { BlindSpotScanner, BlindSpotScanResult } from "../../services/blindSpotScanner";
import { WhatChangedPanel } from "./WhatChangedPanel";
import {
  Stethoscope,
  Activity,
  Microscope,
  Pill,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Search,
  BookOpen,
  FileText,
  Clock,
  Shield,
  Zap,
} from "lucide-react";
import { auditLogger } from "../../services/auditLogger";
import { buildClinicalIngressSummary, normalizeVitals } from "../../astra/clinical/clinicalIngress";
import { CLINICAL_INGRESS_THRESHOLDS } from "../../astra/clinical/clinicalIngressConfig";

interface PatientClinicalWorkspaceProps {
  patient: Patient;
  labOrders: LabOrder[];
  radiologyReports: RadiologyReport[];
  prescriptions: Prescription[];
  onOpenPrintModal?: (type: any, data: any) => void;
}

export const PatientClinicalWorkspace: React.FC<PatientClinicalWorkspaceProps> = ({
  patient,
  labOrders,
  radiologyReports,
  prescriptions,
  onOpenPrintModal,
}) => {
  const [scanResult, setScanResult] = useState<BlindSpotScanResult | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [problemLine, setProblemLine] = useState<string>("");
  const ingress = useMemo(() => buildClinicalIngressSummary(patient), [patient]);
  const normalizedVitals = useMemo(() => normalizeVitals(patient), [patient]);
  const editableProblemLine = problemLine || ingress.problemRepresentation;
  const riskClass =
    ingress.statusBadge === "Emergency Mode"
      ? "bg-rose-700 text-white border-rose-400"
      : ingress.risk === "High"
        ? "bg-rose-100 text-rose-800 border-rose-300"
        : ingress.risk === "Borderline"
          ? "bg-amber-100 text-amber-800 border-amber-300"
          : "bg-emerald-100 text-emerald-800 border-emerald-300";

  const formatVital = (value: number | undefined, suffix = "") => (typeof value === "number" ? `${value}${suffix}` : "not recorded");

  const handleRunBlindSpotScan = () => {
    setIsScanning(true);
    setTimeout(() => {
      const res = BlindSpotScanner.checkPatientBlindSpots(
        patient,
        labOrders,
        radiologyReports,
        prescriptions
      );
      setScanResult(res);
      setIsScanning(false);

      auditLogger.log({
        action: "BLIND_SPOT_SCAN_EXECUTED",
        performedBy: "Dr. Murali Praveen",
        userRole: "Attending Consultant",
        patientUhid: patient.uhid,
        details: `Ran clinical blind-spot scanner on ${patient.name}. Detected ${res.totalGaps} potential gaps.`,
        sourceModule: "clinical_command",
      });
    }, 400);
  };

  const patientLabs = labOrders.filter((l) => l.patientUhid === patient.uhid);
  const patientRad = radiologyReports.filter((r) => r.patientUhid === patient.uhid);
  const patientRx = prescriptions.filter((p) => p.patientUhid === patient.uhid);

  return (
    <div className="max-w-7xl mx-auto space-y-6 font-sans">
      {/* Patient Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl border border-indigo-900/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-indigo-500/20 text-indigo-300 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border border-indigo-500/30 uppercase">
              Patient Clinical Command Workspace
            </span>
            <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border border-emerald-500/30 flex items-center gap-1">
              <Zap className="w-3 h-3 text-emerald-400" /> Active Bedside Profile
            </span>
          </div>
          <h1 className="text-2xl font-black text-white mt-1 flex items-center gap-2">
            <span>{patient.name}</span>
            <span className="text-xs font-mono font-normal text-slate-300">
              ({patient.age}Y / {patient.gender}) • UHID: {patient.uhid}
            </span>
          </h1>
          <p className="text-xs text-slate-300 mt-0.5">
            Bed: <strong>{patient.bedNumber || "OPD Desk"}</strong> • Doctor: <strong>{patient.attendingDoctor}</strong> • Dx: <strong>{patient.chiefComplaints}</strong>
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleRunBlindSpotScan}
            disabled={isScanning}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 shadow-lg cursor-pointer border border-emerald-500/40"
          >
            <Sparkles className="w-4 h-4 text-emerald-200 animate-spin" />
            <span>{isScanning ? "Scanning Gaps..." : "🔍 CHECK PATIENT (Blind-Spot Scanner)"}</span>
          </button>
        </div>
      </div>

      {/* R5-02 Clinical Ingress: decision support only, doctor confirms */}
      <div className={`rounded-xl border p-4 shadow-sm ${ingress.statusBadge === "Emergency Mode" ? "bg-rose-950 text-white border-rose-500" : "bg-white border-slate-200 text-slate-900"}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                Patient Snapshot
              </span>
              <span className={`rounded border px-2 py-0.5 text-[10px] font-black uppercase ${riskClass}`}>
                {ingress.statusBadge === "Emergency Mode" ? "Emergency Mode" : `Risk ${ingress.risk}`}
              </span>
              <span className="rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                {CLINICAL_INGRESS_THRESHOLDS.label} - decision support only
              </span>
            </div>
            <div className="text-sm font-black">
              {patient.name} | {patient.age || "Age not recorded"} | {patient.gender || "Sex not recorded"} | {patient.uhid || "UHID not recorded"}
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] font-mono">
              {(ingress.abnormalVitals.length ? ingress.abnormalVitals : [{ label: "Vitals", value: "no abnormal vitals recorded", trend: "flat" as const, severity: "Low" as const }]).map((vital) => (
                <span key={`${vital.label}-${vital.value}`} className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-slate-700">
                  {vital.label}: {vital.value} {vital.trend === "up" ? "↑" : vital.trend === "down" ? "↓" : "→"}
                </span>
              ))}
            </div>
          </div>
          <div className="text-[11px] text-slate-500 lg:max-w-sm">
            {CLINICAL_INGRESS_THRESHOLDS.doctorReviewNote}
          </div>
        </div>

        {ingress.statusBadge === "Emergency Mode" && (
          <div className="mt-4 rounded-lg border border-rose-300 bg-rose-800 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-black uppercase">
              <AlertTriangle className="h-4 w-4" /> Emergency Pathway
            </div>
            <div className="mt-1 text-xs">Reason: {ingress.emergencyReasons.join(", ")}. Display only; no orders are created automatically.</div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-slate-500">Problem Representation</label>
            <textarea
              value={editableProblemLine}
              onChange={(e) => setProblemLine(e.target.value)}
              className="min-h-[74px] w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-900 outline-none focus:border-indigo-400"
            />
            <div className="text-[10px] text-slate-500">AI-generated draft; saving to record must go through the Doctor Approval Gate.</div>
          </div>

          <div className="space-y-2">
            <div className="text-[10px] font-black uppercase text-slate-500">Risk Radar Rules Fired</div>
            <div className="space-y-1">
              {ingress.firedRules.map((rule) => (
                <div key={rule} className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700">{rule}</div>
              ))}
              {ingress.missingVitals.length > 0 && (
                <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-500">
                  Missing: {ingress.missingVitals.join(", ")} not recorded
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[10px] font-black uppercase text-slate-500">Input Normalization</div>
            {ingress.normalizedSymptoms.length ? ingress.normalizedSymptoms.map((item) => (
              <div key={`${item.original}-${item.normalized}`} className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
                "{item.original}" {"->"} {item.normalized}
              </div>
            )) : (
              <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-500">No symptom normalization needed</div>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-2">
            <div className="text-[10px] font-black uppercase text-slate-500">Red-Flag / Rule-Out First</div>
            {ingress.redFlags.length ? ingress.redFlags.map((flag) => (
              <div key={flag.name} className="flex items-center justify-between gap-2 rounded border border-rose-100 bg-rose-50 px-2 py-1 text-[11px]">
                <span className="font-bold text-rose-900">{flag.name}</span>
                <select className="rounded border border-rose-200 bg-white px-1 py-0.5 text-[10px] text-rose-900" defaultValue={flag.status}>
                  <option>not yet assessed</option>
                  <option>ruled out</option>
                  <option>cannot rule out</option>
                </select>
              </div>
            )) : (
              <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-500">No rule-out-first match from current complaint</div>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-[10px] font-black uppercase text-slate-500">Top Clinical Directions</div>
            {ingress.directions.map((direction) => (
              <div key={direction.label} className="rounded border border-slate-200 bg-slate-50 p-2 text-xs">
                <div className="flex items-center justify-between font-bold text-slate-800">
                  <span>{direction.label}</span>
                  <span>{direction.percent}%</span>
                </div>
                <div className="mt-1 h-1.5 rounded bg-slate-200">
                  <div className="h-1.5 rounded bg-indigo-500" style={{ width: `${direction.percent}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="text-[10px] font-black uppercase text-slate-500">Organ Safety Grid</div>
            {ingress.organSafety.map((organ) => (
              <div key={organ.organ} className="flex items-center justify-between rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px]">
                <span className="font-bold text-slate-800">{organ.organ}</span>
                <span className={organ.level === "High" ? "text-rose-700 font-black" : organ.level === "Borderline" ? "text-amber-700 font-black" : "text-emerald-700 font-black"}>
                  {organ.level} ({organ.detail})
                </span>
              </div>
            ))}
            <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-500">
              RR {formatVital(normalizedVitals.rr, "/min")} | SpO2 {formatVital(normalizedVitals.spo2, "%")} | SBP {formatVital(normalizedVitals.sbp, " mmHg")}
            </div>
          </div>
        </div>
      </div>

      {/* WHAT CHANGED PANEL */}
      <WhatChangedPanel
        patient={patient}
        labOrders={labOrders}
        prescriptions={prescriptions}
        radiologyReports={radiologyReports}
      />

      {/* BLIND-SPOT SCANNER RESULTS MODAL / PANEL */}
      {scanResult && (
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-5 rounded-2xl border border-indigo-800 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-indigo-800/80 pb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-indigo-400" />
              <h3 className="font-bold text-sm text-white">
                Clinical Blind-Spot Scanner Results ({scanResult.totalGaps} Potential Gaps Detected)
              </h3>
            </div>
            <span className="text-[10px] font-mono text-indigo-300">
              Scanned at: {new Date(scanResult.scannedAt).toLocaleTimeString()}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {scanResult.gaps.map((gap, idx) => (
              <div
                key={idx}
                className={`p-3.5 rounded-xl border space-y-1.5 ${
                  gap.severity === "CRITICAL"
                    ? "bg-rose-950/80 border-rose-800 text-rose-100"
                    : gap.severity === "HIGH"
                    ? "bg-amber-950/80 border-amber-800 text-amber-100"
                    : "bg-slate-900/80 border-indigo-900 text-indigo-100"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono font-bold px-2 py-0.5 rounded uppercase bg-black/40">
                    {gap.category} • {gap.severity}
                  </span>
                </div>
                <h4 className="font-bold text-white text-xs">{gap.title}</h4>
                <p className="text-[11px] text-slate-300">{gap.description}</p>
                <div className="text-[10px] font-mono font-bold text-amber-300 pt-1 border-t border-white/10">
                  Required Action: {gap.actionRequired}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PATIENT CLINICAL SNAPSHOT: Current Vitals & Real Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Vitals Snapshot */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
          <h3 className="text-xs font-mono font-bold text-slate-500 uppercase flex items-center justify-between border-b pb-2">
            <span>Bedside Vitals Snapshot</span>
            <Activity className="w-4 h-4 text-emerald-600" />
          </h3>
          <div className="grid grid-cols-2 gap-3 font-mono text-xs">
            <div className="p-3 bg-slate-50 rounded-xl space-y-0.5">
              <span className="text-[10px] text-slate-500 block">SpO₂ Level</span>
              <span className={`text-xl font-black ${patient.vitals?.spo2 < 92 ? "text-rose-600" : "text-emerald-600"}`}>
                {patient.vitals?.spo2}%
              </span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl space-y-0.5">
              <span className="text-[10px] text-slate-500 block">Blood Pressure</span>
              <span className="text-xl font-black text-slate-900">{patient.vitals?.bp}</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl space-y-0.5">
              <span className="text-[10px] text-slate-500 block">Pulse Rate</span>
              <span className="text-xl font-black text-slate-900">{patient.vitals?.pulse} bpm</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl space-y-0.5">
              <span className="text-[10px] text-slate-500 block">Body Temp</span>
              <span className="text-xl font-black text-slate-900">{patient.vitals?.temp}°F</span>
            </div>
          </div>
        </div>

        {/* Laboratory Snapshot */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
          <h3 className="text-xs font-mono font-bold text-slate-500 uppercase flex items-center justify-between border-b pb-2">
            <span>Laboratory Results & Trends</span>
            <Microscope className="w-4 h-4 text-amber-600" />
          </h3>
          <div className="space-y-2 text-xs font-mono">
            {patientLabs.length === 0 ? (
              <span className="text-slate-400 italic block py-4 text-center">No lab orders linked to this patient</span>
            ) : (
              patientLabs.map((lab) => (
                <div key={lab.id} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900">{lab.testName}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${lab.criticalFlag ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"}`}>
                      {lab.status}
                    </span>
                  </div>
                  {lab.results && <p className="text-[11px] text-slate-700">{lab.results}</p>}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Prescriptions & Medications Snapshot */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
          <h3 className="text-xs font-mono font-bold text-slate-500 uppercase flex items-center justify-between border-b pb-2">
            <span>Active Prescription Chart</span>
            <Pill className="w-4 h-4 text-blue-600" />
          </h3>
          <div className="space-y-2 text-xs font-mono">
            {patientRx.length === 0 ? (
              <span className="text-slate-400 italic block py-4 text-center">No active prescriptions</span>
            ) : (
              patientRx.map((rx) => (
                <div key={rx.id} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-900">Rx by {rx.doctorName}</div>
                  <div className="text-[10px] text-slate-500">{rx.medicines.length} Medications prescribed</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
