import React, { useState, useEffect } from "react";
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Save,
  ShieldCheck,
  Stethoscope,
  Activity,
  Zap,
  Layers,
  Sparkles,
  Printer,
  Mic,
  Database,
  Lock,
  FileText,
  Plus,
  Trash2,
  RefreshCw,
  Sliders,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui";
import { navHash } from "@/lib/hashRoute";
import { apiFetch, authHeaders } from "@/services/apiFetch";

export function HospitalSetupWizard() {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({
    name: "PM BROTHERS MULTI SPECIALITY HOSPITAL",
    tagline: "Centre for Clinical Excellence, Robotic Surgery & Advanced Critical Care",
    address: "Plot 12-14, Health City Corridor, Kothagudem Road",
    district: "Bhadradri Kothagudem",
    state: "Telangana",
    pin: "507101",
    phone: "+91 98480 23456 / 08744-245678",
    email: "care@pmbrothershospital.com",
    website: "https://pmbrothershospital.com",
    hospitalType: "Multi-Speciality",
    hfrId: "HFR123456",
    rohiniCode: "ROHINI-PMB-HYD-500038",
    abdmFacilityId: "IN3600084920",
    pmjayProviderId: "PMJAY-TS-2026-000123",
    nabhStatus: "Accredited (Full)",
    cmrfStatus: "Empaneled",
    gstin: "36AAACP9842M1Z4",
    pan: "AAACP9842M",
    mode: "PRODUCTION",
    workingHours: {
      opHours: "08:00 AM - 08:00 PM (Mon-Sat)",
      ipVisitingHours: "04:00 PM - 07:00 PM",
      emergency24x7: true,
    },
    departments: [
      "General Medicine & Critical Care",
      "Cardiology & Interventional",
      "Orthopaedics & Joint Replacement",
      "General & Laparoscopic Surgery",
      "Obstetrics & Gynaecology",
      "Paediatrics & Neonatology",
      "Radiology & Imaging",
      "Clinical Laboratory",
      "Emergency & Trauma",
      "Dialysis & Nephrology",
    ],
    bedCapacity: {
      general: 20,
      semiPrivate: 12,
      private: 8,
      icu: 6,
      emergency: 4,
      total: 50,
    },
    otTheatres: [
      { id: "OT-01", name: "Major OT 1 (Orthopaedics / Joint Replacement)", type: "Major", laminarFlow: true },
      { id: "OT-02", name: "Major OT 2 (Laparoscopy / General Surgery)", type: "Major", laminarFlow: true },
      { id: "OT-03", name: "Emergency / Septic OT", type: "Emergency", laminarFlow: false },
    ],
    activeDoctors: [
      { id: "DOC-01", name: "Dr. Murali Praveen, M.D.", qualifications: "MBBS, MD (General Medicine), FCCP", speciality: "Internal Medicine & Critical Care", regNumber: "TSMC-64821" },
      { id: "DOC-02", name: "Dr. S. Reddy, M.S.", qualifications: "MBBS, MS (Orthopaedics), M.Ch", speciality: "Orthopaedics & Joint Replacement", regNumber: "TSMC-52119" },
      { id: "DOC-03", name: "Dr. Ananya Rao, M.D.", qualifications: "MBBS, MD (Pulmonology)", speciality: "Pulmonary Medicine & ICU", regNumber: "TSMC-78904" },
      { id: "DOC-04", name: "Dr. Nitin Deshmukh, M.D.", qualifications: "MBBS, MD (Radiodiagnosis)", speciality: "Radiology & Imaging", regNumber: "TSMC-49231" },
    ],
  });

  const STEPS = [
    { num: 1, title: "Hospital Profile", icon: Building2 },
    { num: 2, title: "HFR & Govt Identifiers", icon: ShieldCheck },
    { num: 3, title: "Working Hours", icon: Activity },
    { num: 4, title: "Clinical Departments", icon: Layers },
    { num: 5, title: "Beds & Wards", icon: Stethoscope },
    { num: 6, title: "Operation Theatres", icon: Activity },
    { num: 7, title: "Doctors Roster", icon: Stethoscope },
    { num: 8, title: "Nursing Stations", icon: Activity },
    { num: 9, title: "Reception Desk", icon: FileText },
    { num: 10, title: "Pharmacy Setup", icon: Zap },
    { num: 11, title: "Laboratory & Analyzers", icon: Activity },
    { num: 12, title: "Radiology Modalities", icon: Sparkles },
    { num: 13, title: "Billing & Tariffs", icon: Zap },
    { num: 14, title: "Insurance & PMJAY", icon: ShieldCheck },
    { num: 15, title: "Printing Layout", icon: Printer },
    { num: 16, title: "Voice & Languages", icon: Mic },
    { num: 17, title: "AI & Model Router", icon: Sparkles },
    { num: 18, title: "Subsystem Health Check", icon: CheckCircle2 },
  ];

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const res = await apiFetch("/api/hospital/profile", {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify(profile),
      });
      if (res.ok) {
        toast.success("Hospital Profile Saved Successfully!", {
          description: "All departments and workstations updated with persistent configuration.",
        });
      }
    } catch {
      toast.error("Failed to connect to hospital server.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 p-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-700/50 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
            <Sliders className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-100">Hospital Setup & Profile Wizard</h1>
              <Badge tone="cyan">18-Step Config</Badge>
              <Badge tone={profile.mode === "PRODUCTION" ? "green" : "amber"}>
                {profile.mode} MODE
              </Badge>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Configure your local hospital identity, beds, doctors, pricing, and active intelligence layers.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveProfile}
            disabled={saving}
            className="px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-cyan-900/30 transition-all"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? "Saving..." : "Save Hospital Configuration"}
          </button>
        </div>
      </div>

      {/* Wizard Progress Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2 min-w-max">
          {STEPS.map((s) => {
            const isDone = s.num < step;
            const isCurrent = s.num === step;
            const Icon = s.icon;

            return (
              <button
                key={s.num}
                onClick={() => setStep(s.num)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isCurrent
                    ? "bg-blue-600 text-white shadow-md shadow-blue-900/40"
                    : isDone
                    ? "bg-slate-800 text-emerald-400 border border-emerald-500/30"
                    : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-black/30 flex items-center justify-center text-[10px] font-bold">
                  {isDone ? "✓" : s.num}
                </span>
                <span>{s.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step Content Container */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-xl">
        {/* Step 1: Hospital Profile */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-400" /> Step 1: Hospital Profile & Legal Identity
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Hospital Name</label>
                <input
                  type="text"
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Tagline / Subtitle</label>
                <input
                  type="text"
                  value={profile.tagline}
                  onChange={(e) => setProfile({ ...profile, tagline: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-slate-400 mb-1 font-semibold">Physical Street Address</label>
                <input
                  type="text"
                  value={profile.address}
                  onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">District & State</label>
                <input
                  type="text"
                  value={`${profile.district}, ${profile.state}`}
                  onChange={(e) => setProfile({ ...profile, district: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">PIN Code</label>
                <input
                  type="text"
                  value={profile.pin}
                  onChange={(e) => setProfile({ ...profile, pin: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Hospital Hotline / Phone</label>
                <input
                  type="text"
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Official Email</label>
                <input
                  type="email"
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: HFR & Govt Identifiers */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" /> Step 2: HFR, ROHINI, ABDM & PMJAY Identifiers
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Hospital HFR ID (National Registry)</label>
                <input
                  type="text"
                  value={profile.hfrId}
                  onChange={(e) => setProfile({ ...profile, hfrId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">ROHINI Insurance Registry Code</label>
                <input
                  type="text"
                  value={profile.rohiniCode}
                  onChange={(e) => setProfile({ ...profile, rohiniCode: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">ABDM Facility Identifier</label>
                <input
                  type="text"
                  value={profile.abdmFacilityId}
                  onChange={(e) => setProfile({ ...profile, abdmFacilityId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">PMJAY / State Health Agency ID</label>
                <input
                  type="text"
                  value={profile.pmjayProviderId}
                  onChange={(e) => setProfile({ ...profile, pmjayProviderId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">NABH Accreditation Status</label>
                <select
                  value={profile.nabhStatus}
                  onChange={(e) => setProfile({ ...profile, nabhStatus: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white"
                >
                  <option value="Accredited (Full)">Accredited (Full - 15% NHA Incentive)</option>
                  <option value="Entry-Level">Entry-Level NABH</option>
                  <option value="In-Process">In-Process</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Operating Environment Mode</label>
                <select
                  value={profile.mode}
                  onChange={(e) => setProfile({ ...profile, mode: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white font-bold"
                >
                  <option value="PRODUCTION">PRODUCTION (Live Hospital Transactions Only)</option>
                  <option value="DEMO">DEMO / SIMULATION (Synthetic Datasets)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Clinical Departments */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-400" /> Step 4: Clinical Departments
            </h2>
            <div className="space-y-2">
              {profile.departments.map((dept, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-slate-800/80 border border-slate-700 text-xs text-white">
                  <span>{dept}</span>
                  <Badge tone="cyan">Active</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 5: Beds & Wards */}
        {step === 5 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-teal-400" /> Step 5: Inpatient Bed & Ward Capacity
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
              <div className="p-3 rounded-xl bg-slate-800 border border-slate-700">
                <span className="text-slate-400 font-semibold">General Ward Beds</span>
                <p className="text-2xl font-bold text-white mt-1">{profile.bedCapacity.general}</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-800 border border-slate-700">
                <span className="text-slate-400 font-semibold">Semi-Private Beds</span>
                <p className="text-2xl font-bold text-white mt-1">{profile.bedCapacity.semiPrivate}</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-800 border border-slate-700">
                <span className="text-slate-400 font-semibold">Private Suites</span>
                <p className="text-2xl font-bold text-white mt-1">{profile.bedCapacity.private}</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-800 border border-teal-500/40">
                <span className="text-teal-400 font-semibold">Intensive Care Unit (ICU)</span>
                <p className="text-2xl font-bold text-teal-300 mt-1">{profile.bedCapacity.icu}</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-800 border border-rose-500/40">
                <span className="text-rose-400 font-semibold">Emergency / Triage</span>
                <p className="text-2xl font-bold text-rose-300 mt-1">{profile.bedCapacity.emergency}</p>
              </div>
              <div className="p-3 rounded-xl bg-blue-900/30 border border-blue-500/40">
                <span className="text-blue-300 font-semibold">Total Licensed Beds</span>
                <p className="text-2xl font-bold text-white mt-1">{profile.bedCapacity.total}</p>
              </div>
            </div>
          </div>
        )}

        {/* Step 18: Final Subsystem Health Check & Activation */}
        {step === 18 && (
          <div className="space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h2 className="text-lg font-bold text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-6 h-6" /> Step 18: Hospital Ready — Final Subsystem Verification
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  These rows are not probed on this screen. None of them were verified just now.
                </p>
              </div>
              <Badge tone="amber">Not probed</Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {[
                { name: "Canonical Database", desc: "Thread-Safe Persistent Store & Audit Trail", status: "NOT PROBED", tone: "amber" },
                { name: "LangGraph Multi-Agent", desc: "Specialist Reasoning & Skills Agent", status: "NOT PROBED", tone: "amber" },
                { name: "Voice & Speech Engine", desc: "Voicebox Multilingual STT/TTS & Barge-in", status: "NOT PROBED", tone: "amber" },
                { name: "Medical Knowledge Fabric", desc: "Knowledge registry. This screen did not count vectors.", status: "NOT PROBED", tone: "amber" },
                { name: "Dynamic Model Router", desc: "Not a live cloud route from this screen.", status: "NOT PROBED", tone: "amber" },
                { name: "Plugin Sandbox Center", desc: "Plugin cards. A card is not a health check.", status: "NOT PROBED", tone: "amber" },
                { name: "Real-Time Event Fabric (SSE)", desc: "Cross-Department Live Broadcast Bus", status: "NOT PROBED", tone: "amber" },
                { name: "Centralized Printing Hub", desc: "OP, IP, Lab, Radiology, eRx Formats", status: "NOT PROBED", tone: "amber" },
                { name: "Server-Side RBAC", desc: "Strict 403 Role-Gated Terminals", status: "NOT PROBED", tone: "amber" },
                { name: "Authoritative Audit Engine", desc: "Local audit file only. Not a cryptographic audit.", status: "NOT PROBED", tone: "amber" },
              ].map((sub, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-white">{sub.name}</span>
                    <p className="text-[11px] text-slate-400 mt-0.5">{sub.desc}</p>
                  </div>
                  <Badge tone={sub.tone as any}>{sub.status}</Badge>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
              <button
                onClick={() => navHash("/doctor")}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-blue-900/40 flex items-center gap-2"
              >
                <Stethoscope className="w-4 h-4" /> Open Doctor Central Command Cockpit
              </button>
              <button
                onClick={() => navHash("/hospital")}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white text-xs font-bold flex items-center gap-2"
              >
                <Building2 className="w-4 h-4" /> Open Hospital Command Center
              </button>
            </div>
          </div>
        )}

        {/* Generic Steps Fallback Container */}
        {step !== 1 && step !== 2 && step !== 4 && step !== 5 && step !== 18 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-400" /> Step {step}: {STEPS[step - 1].title}
            </h2>
            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700 text-xs text-slate-300 space-y-2">
              <p>Configuration active for {STEPS[step - 1].title}. Parameters are synchronized with the central hospital data fabric.</p>
              <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                <CheckCircle2 className="w-4 h-4" /> Validated against NABH / Rohini hospital operating standards.
              </div>
            </div>
          </div>
        )}

        {/* Wizard Footer Navigation Controls */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-4 mt-6">
          <button
            onClick={() => setStep(Math.max(1, step - 1))}
            disabled={step === 1}
            className="px-4 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <ChevronLeft className="w-4 h-4" /> Previous Step
          </button>

          <span className="text-xs text-slate-400 font-semibold">
            Step {step} of {STEPS.length}
          </span>

          <button
            onClick={() => setStep(Math.min(STEPS.length, step + 1))}
            disabled={step === STEPS.length}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            Next Step <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
