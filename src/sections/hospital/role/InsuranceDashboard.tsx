import React, { useState, useMemo } from "react";
import { ComingSoonTag, COMING_SOON_TITLE } from "@/components/ComingSoon";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Award,
  BadgePercent,
  Barcode,
  Building,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  Download,
  FileCheck,
  FileSpreadsheet,
  FileText,
  Filter,
  HelpCircle,
  Landmark,
  Layers,
  Link as LinkIcon,
  Percent,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { HospitalPrintEngine } from "@/lib/printEngine";

type SchemeTab = "pmjay" | "abha" | "cmrf" | "tpa" | "settlement" | "nabh";
type ClaimStatus = "PENDING SUBMISSION" | "SUBMITTED" | "UNDER REVIEW" | "APPROVED" | "CREDITED";

interface ClaimItem {
  id: string;
  patientName: string;
  uhid: string;
  cardNo: string;
  abhaId: string;
  amount: number;
  submittedDate: string;
  icdCode: string;
  packageName: string;
  status: ClaimStatus;
  missingDocs?: string[];
}

const INITIAL_CLAIMS: ClaimItem[] = [
  {
    id: "CLAIM-TS-2026-000789",
    patientName: "Ravi Kumar",
    uhid: "UHID-2026-8800",
    cardNo: "PMJAY-TS-2026-000123",
    abhaId: "ABHA-9876543210",
    amount: 150000,
    submittedDate: "2026-08-02",
    icdCode: "ICD10-CABG-001",
    packageName: "Coronary Artery Bypass Grafting (CABG)",
    status: "CREDITED",
  },
  {
    id: "CLAIM-TS-2026-000790",
    patientName: "Sita Devi",
    uhid: "UHID-2026-8809",
    cardNo: "PMJAY-TS-2026-000124",
    abhaId: "ABHA-9876543211",
    amount: 120000,
    submittedDate: "2026-08-08",
    icdCode: "ICD10-TKR-004",
    packageName: "Total Knee Replacement (TKR)",
    status: "UNDER REVIEW",
    missingDocs: ["Lab reports incomplete (CBC post-op)"],
  },
  {
    id: "CLAIM-TS-2026-000791",
    patientName: "Ananya Sharma",
    uhid: "UHID-2026-8802",
    cardNo: "PMJAY-TS-2026-000125",
    abhaId: "ABHA-9876543212",
    amount: 45000,
    submittedDate: "2026-08-11",
    icdCode: "ICD10-APP-002",
    packageName: "Emergency Laparoscopic Appendectomy",
    status: "PENDING SUBMISSION",
    missingDocs: ["Missing signed discharge summary", "Surgeon OT notes pending"],
  },
  {
    id: "CLAIM-TS-2026-000792",
    patientName: "Rajesh Kumar",
    uhid: "UHID-2026-8801",
    cardNo: "PMJAY-TS-2026-000126",
    abhaId: "ABHA-9876543210",
    amount: 35000,
    submittedDate: "2026-08-13",
    icdCode: "ICD10-LSCS-003",
    packageName: "Lower Segment Cesarean Section (LSCS)",
    status: "APPROVED",
  },
];

const PACKAGES_CATALOG = [
  { code: "ICD10-CABG-001", name: "Coronary Artery Bypass Grafting (CABG)", rate: 150000 },
  { code: "ICD10-TKR-004", name: "Total Knee Replacement (TKR)", rate: 120000 },
  { code: "ICD10-APP-002", name: "Emergency Laparoscopic Appendectomy", rate: 45000 },
  { code: "ICD10-LSCS-003", name: "Lower Segment Cesarean Section (LSCS)", rate: 35000 },
  { code: "ICD10-NEPH-005", name: "Renal Dialysis Package (10 Sessions)", rate: 25000 },
  { code: "ICD10-ANGIO-006", name: "Coronary Angiography + PTCA Stenting", rate: 85000 },
];

export function InsuranceDashboard() {
  const { account } = useAuth();
  const [activeTab, setActiveTab] = useState<SchemeTab>("pmjay");

  // Stepper State
  const [enrollmentStep, setEnrollmentStep] = useState<number>(1);
  const [patientSelection, setPatientSelection] = useState<string>("Rajesh Kumar (UHID-2026-8801) - Phone: +91 98765 12345 - Age/Gender: 48Y/Male");
  const [idType, setIdType] = useState<"aadhaar" | "ration">("aadhaar");
  const [aadhaarNumber, setAadhaarNumber] = useState<string>("9876-5432-1098");
  const [mobileNumber, setMobileNumber] = useState<string>("9876543210");
  const [otpValue, setOtpValue] = useState<string>("123456");

  // Live Console State
  const [consoleMsg, setConsoleMsg] = useState<string>("Ready for Aadhaar/Ration Card entry...");
  const [eligibilityStatus, setEligibilityStatus] = useState<string>("Pending");
  const [familyId, setFamilyId] = useState<string>("Pending");
  const [cardStatus, setCardStatus] = useState<string>("Not Issued");
  const [linkedAbha, setLinkedAbha] = useState<string>("ABHA-9876543210");

  // Package Claim Form State
  const [claimPatient, setClaimPatient] = useState<string>("Rajesh Kumar (UHID-2026-8801) — Internal Medicine / Cardiology");
  const [selectedIcd, setSelectedIcd] = useState<string>("ICD10-CABG-001");
  const [packageDesc, setPackageDesc] = useState<string>("Coronary Artery Bypass Grafting (CABG)");
  const [packageRate, setPackageRate] = useState<number>(150000);
  const [attachDischarge, setAttachDischarge] = useState<boolean>(true);
  const [attachLab, setAttachLab] = useState<boolean>(true);
  const [attachOt, setAttachOt] = useState<boolean>(true);

  // Claims Tracking List State
  const [claims, setClaims] = useState<ClaimItem[]>(INITIAL_CLAIMS);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("All Statuses");

  // Stepper Actions
  const handleStep1CheckEligibility = () => {
    setConsoleMsg("Demo check on this screen. NHA was not contacted.");
    toast.info("Demo eligibility check only. NHA was not contacted.");

    setTimeout(() => {
      if (aadhaarNumber.endsWith("0000")) {
        // Ineligible Demo Path -> CMRF Auto-Redirect
        setEligibilityStatus("🔴 Demo: not eligible. NHA was not contacted");
        setConsoleMsg("Demo path on this screen. Not an NHA result. No fund office was contacted.");
        toast.info("Demo path: not eligible on this screen. Opening the CMRF tab. No fund office was contacted.");
        setTimeout(() => {
          setActiveTab("cmrf");
        }, 1500);
        return;
      }

      if (aadhaarNumber.endsWith("9999")) {
        // Existing Card Demo Path
        setEligibilityStatus("🟢 Demo card. Not an NHA lookup");
        setFamilyId("PMJAY-FAM99999");
        setCardStatus("PMJAY-TS-2026-000999");
        setConsoleMsg("Demo card on this screen. Not looked up at NHA.");
        toast.info("Demo card shown on this screen (PMJAY-TS-2026-000999). Not looked up at NHA.");
        setEnrollmentStep(5);
        return;
      }

      // Normal Eligible Path
      setEligibilityStatus("🟢 Demo label. Not an NHA result");
      setFamilyId("PMJAY-FAM12345");
      setConsoleMsg("Demo step on this screen. Not an NHA result. No OTP was sent.");
      toast.info("Demo step only. No OTP was sent to " + mobileNumber);
      setEnrollmentStep(2);
    }, 1000);
  };

  const handleStep2VerifyOtp = () => {
    setConsoleMsg("Demo step. UIDAI was not contacted.");
    toast.info("Demo step. UIDAI was not contacted.");

    setTimeout(() => {
      setConsoleMsg("Demo step. Aadhaar was not verified. NHA was not contacted.");
      toast.info("Demo step. Aadhaar was not verified.");
      setEnrollmentStep(3);
    }, 900);
  };

  const handleStep3GenerateCard = () => {
    setConsoleMsg("Demo card on this screen. SHA was not contacted.");
    toast.info("Demo card on this screen. SHA portal was not contacted.");

    setTimeout(() => {
      setCardStatus("PMJAY-TS-2026-000123");
      setConsoleMsg("Demo card number on this screen. Not issued by SHA.");
      toast.info("Demo card number on this screen. Not issued by SHA.");
      setEnrollmentStep(5);
    }, 1000);
  };

  const handleIcdChange = (code: string) => {
    setSelectedIcd(code);
    const found = PACKAGES_CATALOG.find((p) => p.code === code);
    if (found) {
      setPackageDesc(found.name);
      setPackageRate(found.rate);
    }
  };

  const handleSubmitClaim = () => {
    const newClaimId = `CLAIM-TS-2026-${Math.floor(100000 + Math.random() * 900000)}`;
    const newClaim: ClaimItem = {
      id: newClaimId,
      patientName: "Rajesh Kumar",
      uhid: "UHID-2026-8801",
      cardNo: cardStatus.startsWith("PMJAY") ? cardStatus : "PMJAY-TS-2026-000126",
      abhaId: linkedAbha,
      amount: packageRate,
      submittedDate: new Date().toISOString().split("T")[0],
      icdCode: selectedIcd,
      packageName: packageDesc,
      status: "SUBMITTED",
    };

    setClaims([newClaim, ...claims]);
    toast.success(`Claim ${newClaimId} kept on this screen only. Not submitted to SHA.`, {
      description: `Package: ${packageDesc} (₹${packageRate.toLocaleString()})`,
    });
  };

  const handleUpdateClaimStatus = (claimId: string, newStatus: ClaimStatus) => {
    setClaims((prev) =>
      prev.map((c) => (c.id === claimId ? { ...c, status: newStatus, missingDocs: newStatus === "APPROVED" || newStatus === "CREDITED" ? undefined : c.missingDocs } : c))
    );
    toast.info(`Claim ${claimId} status changed on this screen only to ${newStatus}. SHA was not updated.`);
  };

  const filteredClaims = useMemo(() => {
    return claims.filter((c) => {
      const matchSearch =
        c.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.abhaId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.packageName.toLowerCase().includes(searchQuery.toLowerCase());

      const matchFilter = statusFilter === "All Statuses" || c.status.toLowerCase() === statusFilter.toLowerCase();
      return matchSearch && matchFilter;
    });
  }, [claims, searchQuery, statusFilter]);

  return (
    <div className="space-y-4 max-w-[1550px] mx-auto p-1 text-slate-100">
      {/* ---------------- 1. Command Desk Header & Credentials Bar ---------------- */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-teal-500/10 text-teal-400 border border-teal-500/30">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white tracking-tight">
                Insurance, PMJAY &amp; CM Relief Fund Command Desk
              </h1>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 font-bold">
                Demo desk · not live SHA
              </span>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold">
                🏅 NABH PRIORITY (15% RATE INCENTIVE)
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              ABDM ABHA ID Creation • Ayushman Bharat PMJAY Card Issuance • Telangana CM Relief Fund • Cashless Claims Auto-Submission
            </p>
          </div>
        </div>

        {/* Hospital Credentials Box matching Screenshot */}
        <div className="flex items-center gap-4 bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs">
          <div>
            <span className="text-[10px] text-slate-400 block uppercase font-bold">HOSPITAL HFR ID</span>
            <strong className="font-mono text-cyan-300 font-bold">HFR123456</strong>
          </div>
          <div className="border-l border-slate-800 pl-4">
            <span className="text-[10px] text-slate-400 block uppercase font-bold">ROHINI CODE</span>
            <strong className="font-mono text-amber-300 font-bold">ROHINI-PMB-HYD-500038</strong>
          </div>
        </div>
      </div>

      {/* ---------------- 2. Scheme Navigation Tabs matching Screenshot ---------------- */}
      <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2 overflow-x-auto no-scrollbar">
        {[
          { id: "pmjay", label: "💳 PMJAY Scheme", icon: CreditCard },
          { id: "abha", label: "🏥 ABHA / HFR Link", icon: QrCode },
          { id: "cmrf", label: "🏛️ CM Relief Fund", icon: Landmark },
          { id: "tpa", label: "🛡️ Private TPA / Star Health", icon: Shield },
          { id: "settlement", label: "📑 Settlement & Reports", icon: FileSpreadsheet },
          { id: "nabh", label: "🏅 NABH Quality & NHA 15% Bonus", icon: Award },
        ].map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border whitespace-nowrap ${
                active
                  ? "bg-blue-600 border-blue-400 text-white shadow-md shadow-blue-900/40"
                  : "bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ---------------- TAB 1: PMJAY SCHEME (Screenshots 1-3) ---------------- */}
      {activeTab === "pmjay" && (
        <div className="space-y-4">
          {/* PMJAY 7-Step New Card Enrollment Module Banner */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-black text-white uppercase tracking-wider">
                      PMJAY New Card Enrollment Module
                    </h2>
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-bold font-mono">
                      mera.pmjay.gov.in LIVE API
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Verify eligibility with Aadhaar or Ration Card → OTP Verification → Issue Ayushman Card → Link ABHA ID → Auto-Print &amp; Redirect to CMRF if ineligible.
                  </p>
                </div>
              </div>

              <div className="bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 text-xs flex items-center gap-2">
                <span className="text-[10px] text-slate-400 uppercase font-bold">HOSPITAL HFR ID</span>
                <span className="font-mono font-bold text-cyan-300">HFR123456</span>
              </div>
            </div>

            {/* Stepper Progress Bar matching Screenshot */}
            <div className="grid grid-cols-5 gap-2 text-center text-xs">
              {[
                { step: 1, label: "STEP 1", sub: "1. Enter IDs & Search" },
                { step: 2, label: "STEP 2", sub: "2. Verify Mobile OTP" },
                { step: 3, label: "STEP 3 & 4", sub: "3. Check Family Record" },
                { step: 4, label: "STEP 5 & 6", sub: "4. Issue Card & ABHA" },
                { step: 5, label: "STEP 7", sub: "5. Save & Print Card" },
              ].map((s) => {
                const isPassed = enrollmentStep >= s.step;
                const isCurrent = enrollmentStep === s.step;
                return (
                  <div
                    key={s.step}
                    onClick={() => setEnrollmentStep(s.step)}
                    className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                      isCurrent
                        ? "bg-slate-850 border-cyan-500 shadow-md shadow-cyan-950/40 text-cyan-300 font-bold"
                        : isPassed
                        ? "bg-slate-900 border-slate-700 text-white font-semibold"
                        : "bg-slate-950 border-slate-800 text-slate-500"
                    }`}
                  >
                    <div className="text-[10px] uppercase tracking-wider">{s.label}</div>
                    <div className="text-[11px] truncate mt-0.5">{s.sub}</div>
                  </div>
                );
              })}
            </div>

            {/* Step 1 & Live Status Console Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-1">
              {/* Step 1 Left Column (Col 7) */}
              <div className="lg:col-span-7 p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5 text-cyan-400" /> Step 1: Reception Desk Inputs ('mera.pmjay.gov.in/api/eligibility')
                  </span>
                  <span className="text-[9px] px-2 py-0.5 rounded bg-blue-500/20 text-cyan-300 font-bold">
                    NHA SECC Database
                  </span>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Select Patient from Hospital Register:</label>
                  <select
                    value={patientSelection}
                    onChange={(e) => setPatientSelection(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white font-semibold"
                  >
                    <option>Rajesh Kumar (UHID-2026-8801) - Phone: +91 98765 12345 - Age/Gender: 48Y/Male</option>
                    <option>Ananya Sharma (UHID-2026-8802) - Phone: +91 98765 43210 - Age/Gender: 29Y/Female</option>
                    <option>Vikram Reddy (UHID-2026-8803) - Phone: +91 98480 12345 - Age/Gender: 58Y/Male</option>
                    <option>Sita Devi (UHID-2026-8809) - Phone: +91 98480 99887 - Age/Gender: 52Y/Female</option>
                  </select>
                </div>

                {/* ID Type Toggles */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setIdType("aadhaar")}
                    className={`py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      idType === "aadhaar"
                        ? "bg-cyan-600 border-cyan-400 text-white shadow"
                        : "bg-slate-950 border-slate-800 text-slate-400"
                    }`}
                  >
                    Aadhaar Number (Mandatory)
                  </button>
                  <button
                    onClick={() => setIdType("ration")}
                    className={`py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      idType === "ration"
                        ? "bg-cyan-600 border-cyan-400 text-white shadow"
                        : "bg-slate-950 border-slate-800 text-slate-400"
                    }`}
                  >
                    Ration Card (Optional Fallback)
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Aadhaar Number (Mandatory 12-Digits):</label>
                    <input
                      type="text"
                      value={aadhaarNumber}
                      onChange={(e) => setAadhaarNumber(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white font-mono font-bold"
                    />
                    <span className="text-[9px] text-slate-500 mt-1 block">
                      Demo Tips: Type <span className="text-cyan-300 font-mono">9999</span> at end for Existing Card | <span className="text-rose-400 font-mono">0000</span> for Ineligible (CMRF Redirect)
                    </span>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1">Mobile No for OTP:</label>
                    <input
                      type="text"
                      value={mobileNumber}
                      onChange={(e) => setMobileNumber(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white font-mono font-bold"
                    />
                  </div>
                </div>

                {enrollmentStep === 1 && (
                  <button
                    onClick={handleStep1CheckEligibility}
                    className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-black shadow-lg shadow-cyan-950/40 flex items-center justify-center gap-1.5 transition-all"
                  >
                    <Search className="w-4 h-4" /> Step 1: Demo eligibility check. NHA is not called. No OTP is sent
                  </button>
                )}

                {enrollmentStep === 2 && (
                  <div className="p-3 rounded-lg bg-slate-950 border border-slate-700 space-y-2">
                    <label className="text-[10px] text-slate-300 block font-bold">Enter 6-Digit Mobile OTP:</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={otpValue}
                        onChange={(e) => setOtpValue(e.target.value)}
                        className="w-40 px-3 py-1.5 rounded bg-slate-900 border border-slate-600 text-white font-mono text-center font-bold tracking-widest text-sm"
                      />
                      <button
                        onClick={handleStep2VerifyOtp}
                        className="flex-1 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                      >
                        ✓ Demo step. UIDAI is not contacted
                      </button>
                    </div>
                  </div>
                )}

                {enrollmentStep === 3 && (
                  <button
                    onClick={handleStep3GenerateCard}
                    className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-black shadow-lg shadow-purple-950/40 flex items-center justify-center gap-1.5 transition-all"
                  >
                    <Sparkles className="w-4 h-4" /> Step 5 &amp; 6: Generate Official Ayushman Golden Card &amp; Link ABHA ID
                  </button>
                )}

                {enrollmentStep >= 4 && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/40 space-y-2">
                    <div className="flex items-center justify-between text-xs text-amber-300 font-bold">
                      <span>🏅 Demo card on this screen: {cardStatus}</span>
                      <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px]">Demo, not issued</span>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true"
                        className="opacity-50 cursor-not-allowed flex-1 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow flex items-center justify-center gap-1.5"
                      >
                        <Printer className="w-3.5 h-3.5" /> 🖨️ Print Golden Card PDF
                      <ComingSoonTag /></button>
                      <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true"
                        className="opacity-50 cursor-not-allowed flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> 🗹 Save Card to Patient EMR
                      <ComingSoonTag /></button>
                    </div>
                  </div>
                )}
              </div>

              {/* Status Console Right Column (Col 5) */}
              <div className="lg:col-span-5 p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 flex flex-col justify-between">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-cyan-400" /> Demo console · no NHA call
                    </span>
                    <span className="text-[9px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                      Not live
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono">
                    <span className="text-slate-500 block text-[9px] uppercase">CURRENT CONSOLE MESSAGE</span>
                    <p className="text-cyan-300 mt-0.5 leading-relaxed">{consoleMsg}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded bg-slate-950 border border-slate-800">
                      <span className="text-[9px] text-slate-500 block uppercase font-bold">Eligibility Result</span>
                      <strong className="text-white text-[11px]">{eligibilityStatus}</strong>
                    </div>
                    <div className="p-2 rounded bg-slate-950 border border-slate-800">
                      <span className="text-[9px] text-slate-500 block uppercase font-bold">Family ID</span>
                      <strong className="font-mono text-cyan-300 text-[11px]">{familyId}</strong>
                    </div>
                    <div className="p-2 rounded bg-slate-950 border border-slate-800">
                      <span className="text-[9px] text-slate-500 block uppercase font-bold">Coverage Limit</span>
                      <strong className="text-emerald-400 text-[11px]">₹5,00,000 / Family / Year</strong>
                    </div>
                    <div className="p-2 rounded bg-slate-950 border border-slate-800">
                      <span className="text-[9px] text-slate-500 block uppercase font-bold">Ayushman Card</span>
                      <strong className="font-mono text-amber-300 text-[11px]">{cardStatus}</strong>
                    </div>
                    <div className="col-span-2 p-2 rounded bg-slate-950 border border-slate-800 flex justify-between items-center">
                      <span className="text-[9px] text-slate-500 uppercase font-bold">Linked ABHA ID</span>
                      <strong className="font-mono text-cyan-300 text-[11px]">{linkedAbha}</strong>
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-blue-950/20 border border-blue-500/20 text-[10px] text-slate-400 space-y-1">
                  <strong className="text-cyan-300 block">Enrollment Workflow Summary</strong>
                  <p>• Aadhaar/Ration Entry: Receptionist inputs Aadhaar or fallback Ration Card.</p>
                  <p>• OTP eKYC: Demo step. UIDAI is not contacted.</p>
                  <p>• Duplicate Suppression: Detects existing active cards automatically.</p>
                  <p>• CMRF Fallback: Ineligible patients routed to Chief Minister Relief Fund desk.</p>
                </div>
              </div>
            </div>
          </div>

          {/* ---------------- 3-Step Package Claim Submission Engine ---------------- */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Step 1 & 2 Check Portal (Col 12/6) */}
            <div className="lg:col-span-6 p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-cyan-400" /> Step 1: PMJAY Eligibility Check
                </span>
                <span className="text-[9px] px-2 py-0.5 rounded bg-blue-500/20 text-cyan-300 font-bold">
                  Demo, not live
                </span>
              </div>
              <p className="text-xs text-slate-400">Demo query on this screen. NHA and SHA are not contacted.</p>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Enter Patient ABHA ID / Ration Card / Aadhaar</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    defaultValue="ABHA-9876543210"
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white font-mono font-bold"
                  />
                  <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true"
                    className="opacity-50 cursor-not-allowed px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow"
                  >
                    Check Portal
                  <ComingSoonTag /></button>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Step 2: Generate PMJAY Ayushman Card</span>
                  <span className="text-[9px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                    Demo label, not SHA
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Demo family ID, not an NHA verification: <strong className="font-mono text-cyan-300">PMJAY-FAM12345</strong></span>
                  <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true"
                    className="opacity-50 cursor-not-allowed px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow"
                  >
                    Issue Ayushman Card
                  <ComingSoonTag /></button>
                </div>
              </div>
            </div>

            {/* Step 3 Submit PMJAY Package Claim (Col 6) */}
            <div className="lg:col-span-6 p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-purple-400" /> Step 3: Submit PMJAY Package Claim
                </span>
                <span className="text-[9px] text-slate-400">Auto-fills ICD-10 code &amp; package rate</span>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Select Patient from Queue</label>
                <select
                  value={claimPatient}
                  onChange={(e) => setClaimPatient(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white font-semibold"
                >
                  <option>Rajesh Kumar (UHID-2026-8801) — Internal Medicine / Cardiology</option>
                  <option>Sita Devi (UHID-2026-8809) — Orthopaedics</option>
                  <option>Ananya Sharma (UHID-2026-8802) — General Surgery</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">ICD-10 Procedure Code</label>
                  <select
                    value={selectedIcd}
                    onChange={(e) => handleIcdChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white font-mono font-bold"
                  >
                    {PACKAGES_CATALOG.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.code}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Package Rate Amount (₹)</label>
                  <input
                    type="number"
                    value={packageRate}
                    onChange={(e) => setPackageRate(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-emerald-400 font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Procedure / Package Description</label>
                <input
                  type="text"
                  value={packageDesc}
                  onChange={(e) => setPackageDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white font-semibold"
                />
              </div>

              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5 text-xs">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">AUTO-ATTACHED DOCUMENTS</span>
                <label className="flex items-center gap-2 cursor-pointer text-slate-300 text-[11px]">
                  <input type="checkbox" checked={attachDischarge} onChange={(e) => setAttachDischarge(e.target.checked)} className="rounded" />
                  <span>☑ Discharge Summary PDF (Auto-compiled)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-slate-300 text-[11px]">
                  <input type="checkbox" checked={attachLab} onChange={(e) => setAttachLab(e.target.checked)} className="rounded" />
                  <span>☑ Lab Reports &amp; ECG Attachments</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-slate-300 text-[11px]">
                  <input type="checkbox" checked={attachOt} onChange={(e) => setAttachOt(e.target.checked)} className="rounded" />
                  <span>☑ Surgeon OT Notes &amp; Implant Sticker</span>
                </label>
              </div>

              <button
                onClick={handleSubmitClaim}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-black shadow flex items-center justify-center gap-1.5 transition-all"
              >
                <Send className="w-4 h-4" /> Submit Claim to SHA Portal
              </button>
            </div>
          </div>

          {/* ---------------- PMJAY Claims Tracking Desk matching Screenshot 3 ---------------- */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl space-y-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-cyan-400" /> PMJAY Claims Tracking Desk
                </h3>
                <p className="text-xs text-slate-400">Live submission status, review workflow &amp; settlement logs</p>
              </div>

              <div className="flex items-center gap-3 w-full md:w-auto">
                <span className="text-[10px] px-2.5 py-1 rounded-full bg-blue-500/20 text-cyan-300 font-bold font-mono">
                  {claims.length} Total Claims
                </span>
                <div className="relative flex-1 md:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search patient, claim ID..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white font-semibold"
                >
                  <option>All Statuses</option>
                  <option>SUBMITTED</option>
                  <option>UNDER REVIEW</option>
                  <option>APPROVED</option>
                  <option>CREDITED</option>
                </select>
              </div>
            </div>

            {/* Claims Cards matching Screenshot 3 */}
            <div className="space-y-3">
              {filteredClaims.map((claim) => {
                const isCredited = claim.status === "CREDITED";
                const isUnderReview = claim.status === "UNDER REVIEW";
                const isApproved = claim.status === "APPROVED";
                const isSubmitted = claim.status === "SUBMITTED";

                return (
                  <div key={claim.id} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3 shadow-lg">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="text-sm font-bold text-white">{claim.patientName}</strong>
                          <span className="text-xs font-mono text-slate-400">{claim.id}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Card: <span className="font-mono text-cyan-300 font-semibold">{claim.cardNo}</span> • ABHA:{" "}
                          <span className="font-mono text-slate-300">{claim.abhaId}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-base font-black text-white font-mono">₹{claim.amount.toLocaleString()}</div>
                        <span className="text-[10px] text-slate-400">Submitted: {claim.submittedDate}</span>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                      <div className="text-xs text-cyan-300 font-semibold">
                        {claim.icdCode}: <span className="text-slate-200">{claim.packageName}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[10px] px-2.5 py-0.5 rounded-full font-black uppercase ${
                            isCredited
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                              : isUnderReview
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                              : isApproved
                              ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                              : "bg-slate-800 text-slate-300"
                          }`}
                        >
                          {claim.status}
                        </span>
                      </div>
                    </div>

                    {/* Missing Documents Warning Box */}
                    {claim.missingDocs && claim.missingDocs.length > 0 && (
                      <div className="p-2.5 rounded-lg bg-rose-950/20 border border-rose-500/30 text-xs text-rose-300 flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <div>
                          <strong className="block font-bold">⚠️ Missing Documents Flagged:</strong>
                          <span className="text-[11px] text-rose-200">{claim.missingDocs.join(" • ")}</span>
                        </div>
                      </div>
                    )}

                    {/* Stepper Progress Bar */}
                    <div className="pt-2 border-t border-slate-800/80">
                      <div className="grid grid-cols-4 gap-1 text-center text-[10px] font-bold">
                        {[
                          { label: "Submitted", active: true },
                          { label: "Under Review", active: isUnderReview || isApproved || isCredited },
                          { label: "Approved", active: isApproved || isCredited },
                          { label: "Credited", active: isCredited },
                        ].map((st, sidx) => (
                          <div
                            key={sidx}
                            onClick={() => handleUpdateClaimStatus(claim.id, st.label.toUpperCase() as any)}
                            className={`py-1 rounded cursor-pointer transition-all ${
                              st.active
                                ? isCredited
                                  ? "bg-emerald-600 text-white"
                                  : isUnderReview
                                  ? "bg-amber-600 text-white"
                                  : "bg-blue-600 text-white"
                                : "bg-slate-950 text-slate-600"
                            }`}
                          >
                            {st.label}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- TAB 2: ABHA / HFR LINK ---------------- */}
      {activeTab === "abha" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <QrCode className="w-4 h-4 text-cyan-400" /> ABDM ABHA ID Gateway &amp; HFR Facility Link
              </h2>
              <p className="text-xs text-slate-400">Generate 14-digit ABHA IDs, scan QR health cards, and link with HFR123456</p>
            </div>
            <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true"
              className="opacity-50 cursor-not-allowed px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow"
            >
              + Create New 14-Digit ABHA Number
            <ComingSoonTag /></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">ACTIVE ABHA LINKED PATIENTS</span>
              <div className="text-2xl font-black text-cyan-300 font-mono">1,420 Patients</div>
              <span className="text-[10px] text-emerald-400">100% ABDM M2/M3 Compliant</span>
            </div>
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">HEALTH FACILITY REGISTRY (HFR)</span>
              <div className="text-2xl font-black text-white font-mono">HFR123456</div>
              <span className="text-[10px] text-amber-300">Demo card. NHA was not contacted.</span>
            </div>
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <span className="text-[10px] text-slate-400 uppercase font-bold block">HIP / HIU ENDPOINTS</span>
              <div className="text-2xl font-black text-emerald-400 font-mono">ONLINE (M3)</div>
              <span className="text-[10px] text-slate-400">Consent artifacts auto-processed</span>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- TAB 3: CM RELIEF FUND ---------------- */}
      {activeTab === "cmrf" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Landmark className="w-4 h-4 text-amber-400" /> Telangana Chief Minister Relief Fund (CMRF) Desk
              </h2>
              <p className="text-xs text-slate-400">Financial assistance grant portal for poor patients ineligible under PMJAY</p>
            </div>
            <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true"
              className="opacity-50 cursor-not-allowed px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow"
            >
              🏛️ Generate CMRF Grant Application Letter
            <ComingSoonTag /></button>
          </div>

          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
            <h3 className="text-xs font-bold text-white uppercase">Automated CMRF Routing Protocol</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              When a patient is non-eligible under PMJAY SECC 2011 (e.g. White Ration Card holder undergoing major surgery or chemotherapy not covered under PMJAY packages), the Astra Health OS auto-compiles:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs font-mono">
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                1. Doctor Estimated Cost Quotation (₹80,000 - ₹2,50,000)
              </div>
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                2. MLA / MP Endorsement Requisition Letter
              </div>
              <div className="p-2.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                3. Direct CMO Telangana Online Dispatch
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- TAB 4: PRIVATE TPA ---------------- */}
      {activeTab === "tpa" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-400" /> Private TPA &amp; Star Health Cashless Pre-Auth Gateway
              </h2>
              <p className="text-xs text-slate-400">ROHINI Code: ROHINI-PMB-HYD-500038 • Direct cashless pre-auth submission</p>
            </div>
            <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true"
              className="opacity-50 cursor-not-allowed px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow"
            >
              + New Cashless Pre-Auth Request
            <ComingSoonTag /></button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { tpa: "Star Health & Allied Insurance", count: 8, amount: "₹4,80,000", status: "Active Network" },
              { tpa: "ICICI Lombard Health", count: 5, amount: "₹3,20,000", status: "Active Network" },
              { tpa: "HDFC ERGO General Insurance", count: 4, amount: "₹2,60,000", status: "Active Network" },
            ].map((t, i) => (
              <div key={i} className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <strong className="text-xs font-bold text-white block">{t.tpa}</strong>
                <div className="text-xl font-black text-cyan-300 font-mono">{t.amount}</div>
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>{t.count} Active Claims</span>
                  <span className="text-emerald-400 font-bold">{t.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---------------- TAB 5: SETTLEMENT & REPORTS ---------------- */}
      {activeTab === "settlement" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> SHA Government Settlement &amp; Bank Credit Reconciliation
              </h2>
              <p className="text-xs text-slate-400">Track NEFT bank deposits, pending receivables, and TDS reconciliations</p>
            </div>
            <button type="button" disabled aria-disabled="true" title={COMING_SOON_TITLE} data-coming-soon="true"
              className="opacity-50 cursor-not-allowed px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Export Settlement Ledger (CSV)
            <ComingSoonTag /></button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-bold">TOTAL PMJAY CREDITED THIS MONTH</span>
              <div className="text-2xl font-black text-emerald-400 font-mono">₹14,50,000.00</div>
              <span className="text-[10px] text-slate-400">12 Claims settled via NEFT</span>
            </div>
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-bold">PENDING UNDER REVIEW</span>
              <div className="text-2xl font-black text-amber-400 font-mono">₹3,45,000.00</div>
              <span className="text-[10px] text-slate-400">4 Claims in SHA audit</span>
            </div>
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-bold">AVERAGE SETTLEMENT CYCLE</span>
              <div className="text-2xl font-black text-cyan-300 font-mono">8.4 Days</div>
              <span className="text-[10px] text-emerald-400">SLA: 15 Days (Ahead of Target)</span>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- TAB 6: NABH QUALITY & NHA 15% BONUS ---------------- */}
      {activeTab === "nabh" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-2xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" /> NABH Accreditation &amp; NHA 15% Rate Incentive Calculator
              </h2>
              <p className="text-xs text-slate-400">National Health Authority adds 15% extra reimbursement on all packages for NABH Accredited Hospitals</p>
            </div>
            <Badge tone="green">Demo label · not a live NABH status</Badge>
          </div>

          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
            <h3 className="text-xs font-bold text-amber-300 uppercase">Financial Benefit Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
              <div className="p-3 rounded bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-slate-400 block uppercase">Standard CABG Package</span>
                <strong className="text-white text-base">₹1,50,000</strong>
              </div>
              <div className="p-3 rounded bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-amber-400 block uppercase">NABH 15% Incentive</span>
                <strong className="text-amber-300 text-base">+ ₹22,500</strong>
              </div>
              <div className="p-3 rounded bg-slate-950 border border-slate-800">
                <span className="text-[10px] text-emerald-400 block uppercase">Hospital Net Payout</span>
                <strong className="text-emerald-400 text-base">₹1,72,500</strong>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
