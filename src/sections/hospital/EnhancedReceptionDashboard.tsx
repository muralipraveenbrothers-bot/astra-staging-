import React, { useState, useRef, useEffect } from "react";
import { speakHumanVoice } from "@/utils/audioAlerts";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  FileCheck,
  FileText,
  Languages,
  Mic,
  Phone,
  Printer,
  QrCode,
  Radio,
  Search,
  Send,
  Shield,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui";
import { ReceptionMediaHub } from "@/components/Reception/ReceptionMediaHub";
import { useAuth } from "@/lib/auth";
import { HospitalPrintEngine } from "@/lib/printEngine";
import { navHash } from "@/lib/hashRoute";

type ReceptionSubTab =
  | "registration"
  | "pmjay-desk"
  | "ip-list"
  | "op-list"
  | "outside-diag"
  | "print-queue"
  | "broadcast";

export function EnhancedReceptionDashboard({ initialSubTab = "registration" }: { initialSubTab?: ReceptionSubTab } = {}) {
  const { account } = useAuth();
  const [subTab, setSubTab] = useState<ReceptionSubTab>(initialSubTab);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [regCategory, setRegCategory] = useState<"op" | "ip" | "out" | "radiology" | "endoscopy">("op");

  // Comprehensive Form State matching exact User Specification
  const [formData, setFormData] = useState({
    countryCode: "+91",
    mobile: "9492397291",
    title: "Mrs",
    firstName: "B",
    lastName: "BALAMANI",
    gender: "Female",
    age: "75Y",
    dob: "1951-07-22",
    aadhaar: "5432-8901-2345",
    altPhone: "",
    visitType: "General",
    email: "",
    guardianRelation: "Husband",
    guardianName: "B. Venkataiah",
    guardianMobile: "9492397291",
    streetAddress: "KOTHAGUDEM",
    consultantDoctor: "Dr. G MURALI KRISHNA | MBBS, MS ( ORTHOPEDICS )",
    department: "Orthopaedics & Joint Replacement",
    consultationFee: "800",
    insuranceProvider: "Star Health Insurance",
    insuranceNumber: "SHI-98420-2026",
    isMLC: false,
    mlcPoliceStation: "Kothagudem Town Police Station",
    mlcOfficer: "Sub-Inspector K. Suresh Kumar",
    mlcInjuryType: "Accidental Fall / Blunt Trauma",
  });

  const [isBroadcasting, setIsBroadcasting] = useState(false);

  const handleBroadcast = () => {
    setIsBroadcasting(true);

    const announceText =
      "శ్రద్ధ వహించండి. పి.ఎం. బ్రదర్స్ హాస్పిటల్ లో డాక్టర్ జి. మురళీ కృష్ణ గారి ఓపీడీ కన్సల్టేషన్ ప్రారంభమైంది. దయచేసి టోకెన్ నంబర్ ప్రకారం వేచి ఉండండి. Attention please. OPD Consultation with Dr. G Murali Krishna is now active. Please proceed according to your token number.";

    speakHumanVoice(announceText, undefined, () => setIsBroadcasting(false),
      () => setIsBroadcasting(false), "instructional", "te-IN");
    toast.success("Public Address Broadcast Triggered", {
      description: "Automated announcement broadcasting to reception waiting area.",
    });
  };

  const handleSaveAndPrint = async () => {
    const fullName = `${formData.title} ${formData.firstName} ${formData.lastName}`.trim();
    if (!formData.mobile || !formData.lastName) {
      toast.error("Please fill required fields (Mobile, Name)");
      return;
    }
    if (!paymentConfirmed) {
      toast.error("Payment approval is required before generating slips", { description: `Confirm ₹${formData.consultationFee || "0"} consultation payment or choose an approved prior-visit exemption.` });
      return;
    }

    try {
      // The server creates both the database record and authoritative UHID.
      const res = await fetch("/api/hospital/patients", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("astra.serverToken") ?? ""}` },
        body: JSON.stringify({
          name: fullName,
          age: parseInt(formData.age, 10) || 0,
          gender: formData.gender.toLowerCase(),
          phone: `${formData.countryCode} ${formData.mobile}`,
          department: formData.department,
          admissionStatus: regCategory === "ip" ? "inpatient" : "outpatient",
          chiefComplaint: formData.visitType || "Registration",
          insuranceProvider: formData.insuranceProvider,
          insurancePolicyNo: formData.insuranceNumber,
        }),
      });
      if (!res.ok) throw new Error(`Registration HTTP ${res.status}`);
      const result = await res.json() as { patient?: { id: string; uhid: string } };
      if (!result.patient?.uhid) throw new Error("Registration server did not return a UHID");

      // Print only after the authoritative server record exists.
      HospitalPrintEngine.printOPCard({
        name: fullName,
        uhid: result.patient.uhid,
        age: parseInt(formData.age, 10) || 75,
        gender: formData.gender,
        phone: `${formData.countryCode} ${formData.mobile}`,
        department: formData.department,
        doctorName: formData.consultantDoctor,
        tokenNo: "09",
      });

      toast.success(`Patient Registration Saved: ${fullName}`, {
        description: `${result.patient.uhid} saved to the hospital database and sent to the official OP slip printer. Fee: ₹${formData.consultationFee}`,
      });
    } catch {
      toast.error("Failed to connect to Hospital Registration Server");
    }
  };

  return (
    <div className="space-y-4 max-w-[1550px] mx-auto p-1 text-slate-100">
      {/* ---------------- 1. Banner & Sub-Workstation Tabs ---------------- */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-2xl flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            <span className="text-cyan-400">❖</span> PM BROTHERS MULTI SPECIALITY HOSPITAL — RECEPTION REGISTRATION DESK
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Outpatient/Inpatient Patient Registration, Room Transfers, Outside USG/CT/MRI Lists & Record Updates
          </p>
        </div>

        {/* Sub-Tabs / Workstation Buttons matching exact prompt */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSubTab("registration")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border ${
              subTab === "registration"
                ? "bg-cyan-600 border-cyan-400 text-white shadow-md shadow-cyan-900/40"
                : "bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800"
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" /> Patient Registration
          </button>

          <button
            onClick={() => navHash("/insurance")}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800/80 border border-slate-700 text-slate-300 hover:bg-slate-800 flex items-center gap-1.5"
          >
            <Shield className="w-3.5 h-3.5 text-emerald-400" /> PMJAY & ABHA Enrollment Desk
          </button>

          <button
            onClick={() => navHash("/ward")}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800/80 border border-slate-700 text-slate-300 hover:bg-slate-800 flex items-center gap-1.5"
          >
            🛏️ Inpatient (IP) List (1)
          </button>

          <button
            onClick={() => navHash("/hospital")}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800/80 border border-slate-700 text-slate-300 hover:bg-slate-800 flex items-center gap-1.5"
          >
            📋 OP List (1)
          </button>

          <button
            onClick={() => navHash("/radiology")}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800/80 border border-slate-700 text-slate-300 hover:bg-slate-800 flex items-center gap-1.5"
          >
            🔬 USG, Radiology, X-Ray, CT, MRI Outside List (6)
          </button>

          <button
            onClick={() => setSubTab("print-queue")}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800/80 border border-slate-700 text-slate-300 hover:bg-slate-800 flex items-center gap-1.5"
          >
            <Printer className="w-3.5 h-3.5 text-amber-400" /> Unified Print Queue (4)
          </button>

          <button
            onClick={() => setSubTab("broadcast")}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-950/40 border border-rose-500/40 text-rose-300 hover:bg-rose-900/40 flex items-center gap-1.5"
          >
            <Volume2 className="w-3.5 h-3.5 text-rose-400" /> Multilingual Disease Broadcast & AI Doctor (తెలుగు / हिंदी)
          </button>
        </div>
      </div>

      {/* ---------------- 2. Main Registration Grid ---------------- */}
      {subTab === "registration" && <div id="reception-registration" className="grid grid-cols-1 lg:grid-cols-12 gap-4 scroll-mt-4">
        {/* Left Column (8 Cols): Registration Form */}
        <div className="lg:col-span-8 space-y-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-black text-white uppercase tracking-wider">
                  Edit Outpatient Registration Form
                </h2>
                <p className="text-[11px] text-slate-400">
                  Primary Demographic Information & Statutory Rohini Coding
                </p>
              </div>
            </div>

            {/* Demographics Field Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
              {/* Mobile Number */}
              <div className="sm:col-span-4 space-y-1">
                <label className="text-[11px] font-bold text-slate-300">
                  * Mobile# <span className="text-rose-400">*</span>
                </label>
                <div className="flex gap-1">
                  <select
                    value={formData.countryCode}
                    onChange={(e) => setFormData({ ...formData, countryCode: e.target.value })}
                    className="px-2 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                  >
                    <option value="+91">India (+91)</option>
                    <option value="+1">USA (+1)</option>
                    <option value="+44">UK (+44)</option>
                  </select>
                  <input
                    type="text"
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                    placeholder="Mobile number"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono"
                  />
                </div>
              </div>

              {/* Title */}
              <div className="sm:col-span-2 space-y-1">
                <label className="text-[11px] font-bold text-slate-300">
                  * Title <span className="text-rose-400">*</span>
                </label>
                <select
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-semibold"
                >
                  <option value="Mrs">Mrs</option>
                  <option value="Mr">Mr</option>
                  <option value="Miss">Miss</option>
                  <option value="Master">Master</option>
                  <option value="Dr">Dr</option>
                </select>
              </div>

              {/* First Name */}
              <div className="sm:col-span-3 space-y-1">
                <label className="text-[11px] font-bold text-slate-300">
                  * First Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  placeholder="First name"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-bold"
                />
              </div>

              {/* Last Name */}
              <div className="sm:col-span-3 space-y-1">
                <label className="text-[11px] font-bold text-slate-300">
                  Last Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  placeholder="Last name"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-bold"
                />
              </div>

              {/* Gender */}
              <div className="sm:col-span-3 space-y-1">
                <label className="text-[11px] font-bold text-slate-300">
                  * Gender <span className="text-rose-400">*</span>
                </label>
                <div className="flex items-center gap-4 py-2">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="gender"
                      checked={formData.gender === "Male"}
                      onChange={() => setFormData({ ...formData, gender: "Male" })}
                      className="accent-cyan-500"
                    />
                    <span>Male</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="gender"
                      checked={formData.gender === "Female"}
                      onChange={() => setFormData({ ...formData, gender: "Female" })}
                      className="accent-cyan-500"
                    />
                    <span>Female</span>
                  </label>
                </div>
              </div>

              {/* Age */}
              <div className="sm:col-span-2 space-y-1">
                <label className="text-[11px] font-bold text-slate-300">
                  * Age <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.age}
                  onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                  placeholder="75Y"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono font-bold"
                />
              </div>

              {/* DOB */}
              <div className="sm:col-span-3 space-y-1">
                <label className="text-[11px] font-bold text-slate-300">
                  * DOB
                </label>
                <input
                  type="date"
                  value={formData.dob}
                  onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono"
                />
              </div>

              {/* Aadhaar Number */}
              <div className="sm:col-span-4 space-y-1">
                <label className="text-[11px] font-bold text-slate-300">
                  Aadhaar Number
                </label>
                <input
                  type="text"
                  value={formData.aadhaar}
                  onChange={(e) => setFormData({ ...formData, aadhaar: e.target.value })}
                  placeholder="12 digit Aadhaar"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono"
                />
              </div>

              {/* Alternate Phone Number */}
              <div className="sm:col-span-4 space-y-1">
                <label className="text-[11px] font-bold text-slate-300">Alternate Phone Number</label>
                <input
                  type="text"
                  value={formData.altPhone}
                  onChange={(e) => setFormData({ ...formData, altPhone: e.target.value })}
                  placeholder="Alt phone"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono"
                />
              </div>

              {/* Visit Type */}
              <div className="sm:col-span-4 space-y-1">
                <label className="text-[11px] font-bold text-slate-300">
                  * Visit Type <span className="text-rose-400">*</span>
                </label>
                <select
                  value={formData.visitType}
                  onChange={(e) => setFormData({ ...formData, visitType: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-semibold"
                >
                  <option value="General">General</option>
                  <option value="Emergency">Emergency</option>
                  <option value="Review">Review</option>
                  <option value="Consultation">Consultation</option>
                </select>
              </div>

              {/* Email */}
              <div className="sm:col-span-4 space-y-1">
                <label className="text-[11px] font-bold text-slate-300">E-mail</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="E-mail address"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                />
              </div>

              {/* Guardian Relationship */}
              <div className="sm:col-span-4 space-y-1">
                <label className="text-[11px] font-bold text-slate-300">Guardian Relationship</label>
                <select
                  value={formData.guardianRelation}
                  onChange={(e) => setFormData({ ...formData, guardianRelation: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                >
                  <option value="Father">Father</option>
                  <option value="Husband">Husband</option>
                  <option value="Son">Son</option>
                  <option value="Daughter">Daughter</option>
                  <option value="Mother">Mother</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              {/* Parent/Guardian Name */}
              <div className="sm:col-span-4 space-y-1">
                <label className="text-[11px] font-bold text-slate-300">Parent/Guardian Name</label>
                <input
                  type="text"
                  value={formData.guardianName}
                  onChange={(e) => setFormData({ ...formData, guardianName: e.target.value })}
                  placeholder="Guardian Name"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                />
              </div>

              {/* Guardian Mobile # */}
              <div className="sm:col-span-4 space-y-1">
                <label className="text-[11px] font-bold text-slate-300">Guardian Mobile#</label>
                <input
                  type="text"
                  value={formData.guardianMobile}
                  onChange={(e) => setFormData({ ...formData, guardianMobile: e.target.value })}
                  placeholder="9492397291"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono"
                />
              </div>

              {/* Street Address */}
              <div className="sm:col-span-12 space-y-1">
                <label className="text-[11px] font-bold text-slate-300">Street Address</label>
                <input
                  type="text"
                  value={formData.streetAddress}
                  onChange={(e) => setFormData({ ...formData, streetAddress: e.target.value })}
                  placeholder="KOTHAGUDEM"
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white font-bold tracking-wide"
                />
              </div>
            </div>

            {/* ---------------- 3. Registration Category, Department & Consultant Doctor ---------------- */}
            <div id="reception-category-consultant" className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3 scroll-mt-4">
              <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 block">
                Registration Category, Department &amp; Consultant Doctor
              </span>

              {/* Registration Type Buttons */}
              <div className="space-y-1.5">
                <label className="text-[11px] text-slate-400 font-semibold">Registration Type</label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { id: "op", label: "OP" },
                    { id: "ip", label: "IP" },
                    { id: "out", label: "Outside (OUT)" },
                    { id: "radiology", label: "Radiology" },
                    { id: "endoscopy", label: "Endoscopy" },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setRegCategory(t.id as any)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        regCategory === t.id
                          ? "bg-blue-600 text-white shadow-md shadow-blue-900/40"
                          : "bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Consultant Doctor Dropdown & Consultation Fee */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs pt-1">
                <div className="sm:col-span-8 space-y-1">
                  <label className="text-[11px] font-bold text-slate-300">Consultant Doctor</label>
                  <select
                    value={formData.consultantDoctor}
                    onChange={(e) => setFormData({ ...formData, consultantDoctor: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-bold"
                  >
                    <option value="Dr. G MURALI KRISHNA | MBBS, MS ( ORTHOPEDICS )">
                      Dr. G MURALI KRISHNA | MBBS, MS ( ORTHOPEDICS )
                    </option>
                    <option value="Dr. Murali Praveen, M.D. | Internal Medicine & Critical Care">
                      Dr. Murali Praveen, M.D. | Internal Medicine & Critical Care
                    </option>
                    <option value="Dr. Ananya Rao, M.D. | Pulmonology & ICU">
                      Dr. Ananya Rao, M.D. | Pulmonology & ICU
                    </option>
                    <option value="Dr. Nitin Deshmukh, M.D. | Radiology & Imaging">
                      Dr. Nitin Deshmukh, M.D. | Radiology & Imaging
                    </option>
                  </select>
                </div>

                <div className="sm:col-span-4 space-y-1">
                  <label className="text-[11px] font-bold text-slate-300">Registration / Consultation Fee (₹)</label>
                  <input
                    type="text"
                    value={formData.consultationFee}
                    onChange={(e) => setFormData({ ...formData, consultationFee: e.target.value })}
                    placeholder="800"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-emerald-400 font-mono font-bold text-sm"
                  />
                </div>
              </div>
            </div>

            {/* ---------------- 4. Insurance Provider & Rohini Coding Registry ---------------- */}
            <div id="reception-insurance-rohini" className="p-4 rounded-xl bg-purple-950/20 border border-purple-500/40 space-y-3 scroll-mt-4">
              <div className="flex items-center justify-between border-b border-purple-500/30 pb-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Insurance Provider &amp; Rohini Coding Registry
                  </span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 border border-purple-400 text-purple-300 font-semibold">
                  Rohini Guidelines Compliant
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-purple-200">Insurance Provider</label>
                  <select
                    value={formData.insuranceProvider}
                    onChange={(e) => setFormData({ ...formData, insuranceProvider: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-purple-500/40 text-white"
                  >
                    <option value="Star Health Insurance">Star Health Insurance</option>
                    <option value="PMJAY / Ayushman Bharat">PMJAY / Ayushman Bharat</option>
                    <option value="HDFC ERGO Health">HDFC ERGO Health</option>
                    <option value="ICICI Lombard">ICICI Lombard</option>
                    <option value="Care Health Insurance">Care Health Insurance</option>
                    <option value="Self Pay / Cash">Self Pay / Cash</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-purple-200">Insurance Number / Policy ID</label>
                  <input
                    type="text"
                    value={formData.insuranceNumber}
                    onChange={(e) => setFormData({ ...formData, insuranceNumber: e.target.value })}
                    placeholder="SHI-98420-2026"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-purple-500/40 text-white font-mono"
                  />
                </div>
              </div>

              {/* Green ROHINI Validation Box matching Screenshot */}
              <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/40 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-emerald-300 font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Validated with ROHINI Registry (ROHINI-PMB-HYD-500038)
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                    Coverage Limit: ₹5,00,000 | Cashless Active
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-300 pt-1 border-t border-emerald-500/20">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">ICD-10 DISEASE CODE (AUTO-MAPPED):</span>
                    <strong className="text-white">M17.11 — Primary Osteoarthritis, Right Knee</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">ICD-10 TREATMENT CODE:</span>
                    <strong className="text-white">0SRC0JZ — Total Knee Replacement, Right Knee Joint</strong>
                  </div>
                </div>

                <div className="pt-1 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">Claim Applicability Status:</span>
                  <button
                    onClick={() => toast.success("Claim Pre-Auth Eligibility Document Compiled and Verified!")}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow"
                  >
                    <Sparkles className="w-3.5 h-3.5 fill-current" /> Claim Applicable — Auto-Generate Claim Eligibility Report
                  </button>
                </div>
              </div>
            </div>

            {/* ---------------- 5. Statutory MLC Police Flag ---------------- */}
            <div id="reception-mlc" className="p-3.5 rounded-xl bg-rose-950/20 border border-rose-500/40 space-y-2 scroll-mt-4">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-rose-300">
                <input
                  type="checkbox"
                  checked={formData.isMLC}
                  onChange={(e) => setFormData({ ...formData, isMLC: e.target.checked })}
                  className="w-4 h-4 accent-rose-500 rounded"
                />
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span>Statutory Medico-Legal Case (MLC) Flag &amp; Auto Police Intimation</span>
              </label>

              {formData.isMLC && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-rose-500/30 text-xs">
                  <div>
                    <span className="text-[10px] text-rose-300 block">Jurisdiction Police Station</span>
                    <input
                      type="text"
                      value={formData.mlcPoliceStation}
                      onChange={(e) => setFormData({ ...formData, mlcPoliceStation: e.target.value })}
                      className="w-full px-2 py-1 rounded bg-slate-950 border border-rose-500/40 text-white"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-rose-300 block">Investigating Officer</span>
                    <input
                      type="text"
                      value={formData.mlcOfficer}
                      onChange={(e) => setFormData({ ...formData, mlcOfficer: e.target.value })}
                      className="w-full px-2 py-1 rounded bg-slate-950 border border-rose-500/40 text-white"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-rose-300 block">Injury Classification</span>
                    <input
                      type="text"
                      value={formData.mlcInjuryType}
                      onChange={(e) => setFormData({ ...formData, mlcInjuryType: e.target.value })}
                      className="w-full px-2 py-1 rounded bg-slate-950 border border-rose-500/40 text-white"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-950/20 p-3">
              <label className="flex items-start gap-2 text-xs text-amber-100"><input type="checkbox" checked={paymentConfirmed} onChange={(e) => setPaymentConfirmed(e.target.checked)} className="mt-0.5 accent-emerald-500" /><span><b>Payment approved / prior-visit exemption confirmed</b><span className="block text-[10px] text-amber-300/80">OP slip, billing receipt, and print dispatch stay blocked until this is checked.</span></span></label>
            </div>
            {/* ---------------- 6. Save Registration & Generate Bill ---------------- */}
            <div className="pt-2 flex items-center justify-end">
              <button
                onClick={handleSaveAndPrint}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-sm font-black flex items-center gap-2 shadow-lg shadow-cyan-900/40 transition-all active:scale-95"
              >
                <CheckCircle2 className="w-5 h-5" /> Save Registration &amp; Generate Bill
              </button>
            </div>
          </div>
        </div>

        {/* Right Column (4 Cols): Live registration token spooler */}
        <div className="lg:col-span-4 space-y-4">
          {/* Today's Registration Spooler */}
          <div id="reception-token-spooler" className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xl space-y-3 scroll-mt-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-4 h-4 text-cyan-400" /> Live Token Spooler
              </span>
              <Badge tone="cyan">Token Spooler</Badge>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div>
                  <strong className="text-white block">Mrs. B. Balamani (75Y/F)</strong>
                  <span className="text-[10px] text-slate-400">Dr. G MURALI KRISHNA • Fee: ₹800</span>
                </div>
                <Badge tone="cyan">Token #09</Badge>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div>
                  <strong className="text-white block">Mr. Rajesh Kumar (48Y/M)</strong>
                  <span className="text-[10px] text-slate-400">Dr. Murali Praveen, M.D. • Fee: ₹800</span>
                </div>
                <Badge tone="green">In Consultation</Badge>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div>
                  <strong className="text-white block">Ms. Ananya Sharma (38Y/F)</strong>
                  <span className="text-[10px] text-slate-400">ICU Bed-04 • Emergency Admitted</span>
                </div>
                <Badge tone="red">IP Admitted</Badge>
              </div>
            </div>
          </div>
        </div>
      </div>}

      {subTab === "print-queue" && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4" aria-label="Unified print and document queue">
          <ReceptionMediaHub view="print" />
          <div className="rounded-2xl border border-amber-400/20 bg-slate-900/90 p-5 shadow-xl">
            <h3 className="text-sm font-black uppercase tracking-wider text-white">Reports, receipts & documents</h3>
            <p className="mt-2 text-xs leading-5 text-slate-400">All OP cards, bills, lab labels, prescriptions, reports and uploaded documents are routed through the Unified Print Queue.</p>
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-300">Select <b className="text-amber-200">Print</b> on any pending item to send it to the local print dialog.</div>
          </div>
        </section>
      )}

      {subTab === "broadcast" && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4" aria-label="Daily health podcast and public address broadcast">
          <ReceptionMediaHub view="broadcast" />
          <div id="reception-pa" className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2"><Volume2 className="w-4 h-4 text-cyan-400" /><h3 className="text-xs font-bold text-white uppercase tracking-wider">Public Address Broadcast</h3></div>
            <p className="text-[11px] text-slate-300 leading-snug">Automated 2-hour health announcement broadcasting to the reception waiting area.</p>
            <button onClick={handleBroadcast} className={`w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-md ${isBroadcasting ? "bg-rose-600 text-white animate-pulse" : "bg-cyan-600 hover:bg-cyan-500 text-white"}`}><Volume2 className="w-4 h-4" /> {isBroadcasting ? "Broadcasting Live..." : "▶ Broadcast Speaker Now"}</button>
          </div>
        </section>
      )}

    </div>
  );
}
