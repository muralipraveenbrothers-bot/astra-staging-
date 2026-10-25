import React, { useState } from "react";
import { Patient } from "../../types";
import {
  PmjayClaimRecord,
  CmrfClaimRecord,
  initialPmjayClaims,
  initialCmrfClaims,
  HOSPITAL_HFR_ID,
  HOSPITAL_ROHINI_ID,
  apiCreateAbhaId,
  apiCheckPmjayEligibility,
  apiGeneratePmjayCard,
  apiSubmitPmjayClaim,
  apiSubmitCmrfClaim,
} from "../../utils/pmjayApi";
import {
  ShieldCheck,
  CreditCard,
  Building,
  FileText,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Send,
  Download,
  Printer,
  UserCheck,
  QrCode,
  Sparkles,
  ArrowRight,
  Filter,
  RefreshCw,
  Plus,
  HelpCircle,
  FileCheck,
  Check,
  X,
  Mail,
  Shield,
  BadgeAlert,
  Award,
  BookOpen,
  Trash2,
  Activity,
  AlertCircle,
  TrendingUp,
  CheckSquare,
  Layers,
} from "lucide-react";

interface InsuranceDashboardProps {
  patients: Patient[];
  onOpenPrintModal?: (type: any, data: any) => void;
  initialTab?: "abha" | "pmjay" | "cmrf" | "private" | "settlement" | "nabh";
}

export const InsuranceDashboard: React.FC<InsuranceDashboardProps> = ({
  patients,
  onOpenPrintModal,
  initialTab = "pmjay",
}) => {
  const [activeTab, setActiveTab] = useState<"abha" | "pmjay" | "cmrf" | "private" | "settlement" | "nabh">(initialTab);

  // State for Claims & PMJAY Data
  const [pmjayClaims, setPmjayClaims] = useState<PmjayClaimRecord[]>(initialPmjayClaims);
  const [cmrfClaims, setCmrfClaims] = useState<CmrfClaimRecord[]>(initialCmrfClaims);
  const [selectedPatientForClaim, setSelectedPatientForClaim] = useState<Patient | null>(patients[0] || null);

  // ABHA Form state
  const [aadhaarInput, setAadhaarInput] = useState("9876-5432-1098");
  const [mobileInput, setMobileInput] = useState("9876543210");
  const [otpInput, setOtpInput] = useState("123456");
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [generatedAbha, setGeneratedAbha] = useState<{ abha_id: string; qrPayload?: string } | null>(null);
  const [isAbhaLoading, setIsAbhaLoading] = useState(false);

  // PMJAY Eligibility state
  const [eligibilityAbha, setEligibilityAbha] = useState("ABHA-9876543210");
  const [eligibilityResult, setEligibilityResult] = useState<any | null>(null);
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(false);

  // Card Gen state
  const [cardFamilyId, setCardFamilyId] = useState("PMJAY-FAM12345");
  const [generatedCardNum, setGeneratedCardNum] = useState<string | null>(null);
  const [isGeneratingCard, setIsGeneratingCard] = useState(false);

  // Claim Submit Form
  const [claimProcCode, setClaimProcCode] = useState("ICD10-CABG-001");
  const [claimProcName, setClaimProcName] = useState("Coronary Artery Bypass Grafting (CABG)");
  const [claimAmount, setClaimAmount] = useState<number>(150000);
  const [isSubmittingClaim, setIsSubmittingClaim] = useState(false);
  const [claimSuccessMsg, setClaimSuccessMsg] = useState<string | null>(null);

  // CMRF Form
  const [cmrfProcName, setCmrfProcName] = useState("Liver Transplant Support");
  const [cmrfReqAmount, setCmrfReqAmount] = useState<number>(300000);
  const [isCmrfSubmitting, setIsCmrfSubmitting] = useState(false);
  const [cmrfSuccessMsg, setCmrfSuccessMsg] = useState<string | null>(null);

  // Filter state for claims
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState("");

  // NABH Incident State
  const [nabhIncidents, setNabhIncidents] = useState<
    { id: string; date: string; category: string; description: string; severity: "Low" | "Medium" | "High" | "Sentinel"; status: "Under RCA" | "Resolved" | "CAPA Applied"; reporter: string }[]
  >([
    {
      id: "INC-2026-041",
      date: "2026-08-11",
      category: "Medication Near-Miss",
      description: "LASA drug sound-alike confusion (Cefotaxime vs Ceftriaxone) flagged during automated barcode verification at nursing desk before administration.",
      severity: "Medium",
      status: "CAPA Applied",
      reporter: "Nurse Anitha R.",
    },
    {
      id: "INC-2026-039",
      date: "2026-08-09",
      category: "Patient Safety / Fall Risk",
      description: "Elderly post-op patient attempted unassisted ambulation; bed rails were elevated and floor sensor alarm sounded instantly preventing fall.",
      severity: "Low",
      status: "Resolved",
      reporter: "Ward Duty Staff",
    },
    {
      id: "INC-2026-035",
      date: "2026-08-05",
      category: "Biomedical Waste Segregation",
      description: "Needle syringe cap improperly disposed in yellow bin instead of translucent sharps container in OPD treatment room 2.",
      severity: "Low",
      status: "Resolved",
      reporter: "Quality Inspector",
    },
  ]);

  const [newIncidentCategory, setNewIncidentCategory] = useState("Medication Safety");
  const [newIncidentDesc, setNewIncidentDesc] = useState("");
  const [newIncidentSeverity, setNewIncidentSeverity] = useState<"Low" | "Medium" | "High" | "Sentinel">("Low");

  const handleCreateNabhIncident = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIncidentDesc.trim()) return;
    const newInc = {
      id: `INC-2026-${Math.floor(100 + Math.random() * 900)}`,
      date: new Date().toISOString().split("T")[0],
      category: newIncidentCategory,
      description: newIncidentDesc,
      severity: newIncidentSeverity,
      status: "Under RCA" as const,
      reporter: "Quality Officer / Duty Doctor",
    };
    setNabhIncidents([newInc, ...nabhIncidents]);
    setNewIncidentDesc("");
    alert("NABH Incident / Near-Miss logged successfully with automated SLA Root Cause Analysis (RCA) tracking!");
  };

  // Handlers
  const handleSendOtp = () => {
    setIsOtpSent(true);
  };

  const handleCreateAbha = async () => {
    setIsAbhaLoading(true);
    try {
      const res = await apiCreateAbhaId({
        aadhaar: aadhaarInput,
        mobile: mobileInput,
        hospital_hfr_id: HOSPITAL_HFR_ID,
        consent: true,
      });
      setGeneratedAbha(res);
    } catch (e) {
      console.error(e);
    } finally {
      setIsAbhaLoading(false);
    }
  };

  const handleCheckEligibility = async () => {
    setIsCheckingEligibility(true);
    try {
      const res = await apiCheckPmjayEligibility({
        abha_id: eligibilityAbha,
      });
      setEligibilityResult(res);
      if (res.family_id) {
        setCardFamilyId(res.family_id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsCheckingEligibility(false);
    }
  };

  const handleGenerateCard = async () => {
    setIsGeneratingCard(true);
    try {
      const res = await apiGeneratePmjayCard({
        family_id: cardFamilyId,
        hospital_hfr_id: HOSPITAL_HFR_ID,
        abha_id: eligibilityAbha,
      });
      setGeneratedCardNum(res.pmjay_card_number);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingCard(false);
    }
  };

  const handleSubmitPmjayClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientForClaim) return;
    setIsSubmittingClaim(true);
    try {
      const res = await apiSubmitPmjayClaim({
        pmjay_card_number: selectedPatientForClaim.insuranceNumber || "PMJAY-TS-2026-000123",
        hospital_hfr_id: HOSPITAL_HFR_ID,
        patient_name: selectedPatientForClaim.name,
        abha_id: selectedPatientForClaim.abhaId || "ABHA-9876543210",
        procedure_code: claimProcCode,
        procedure_name: claimProcName,
        amount: claimAmount,
        documents: {
          discharge_summary: `${selectedPatientForClaim.uhid}_discharge_summary.pdf`,
          lab_reports: ["cbc.pdf", "ecg.pdf"],
          surgery_notes: "surgery_notes.pdf",
        },
      });

      const newRecord: PmjayClaimRecord = {
        claim_id: res.claim_id,
        patient_name: selectedPatientForClaim.name,
        abha_id: selectedPatientForClaim.abhaId || "ABHA-9876543210",
        pmjay_card_number: selectedPatientForClaim.insuranceNumber || "PMJAY-TS-2026-000123",
        procedure: claimProcName,
        procedure_code: claimProcCode,
        package_rate: claimAmount,
        claim_status: "Submitted",
        amount_credited: 0,
        submitted_on: new Date().toISOString().split("T")[0],
        missing_docs: [],
        alert_level: "green",
      };

      setPmjayClaims((prev) => [newRecord, ...prev]);
      setClaimSuccessMsg(`Claim ${res.claim_id} submitted successfully to SHA Telangana Portal! Expected settlement: 7 days.`);
      setTimeout(() => setClaimSuccessMsg(null), 6000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmittingClaim(false);
    }
  };

  const handleSubmitCmrfClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPatientForClaim) return;
    setIsCmrfSubmitting(true);
    try {
      const res = await apiSubmitCmrfClaim({
        patient_name: selectedPatientForClaim.name,
        abha_id: selectedPatientForClaim.abhaId || "ABHA-9876543210",
        hospital_hfr_id: HOSPITAL_HFR_ID,
        procedure: cmrfProcName,
        amount_requested: cmrfReqAmount,
        documents: {
          income_certificate: "income.pdf",
          discharge_summary: "discharge.pdf",
          doctor_certificate: "doctor_cert.pdf",
        },
      });

      const newRecord: CmrfClaimRecord = {
        cmrf_claim_id: res.cmrf_claim_id,
        patient_name: selectedPatientForClaim.name,
        abha_id: selectedPatientForClaim.abhaId || "ABHA-9876543210",
        procedure: cmrfProcName,
        amount_requested: cmrfReqAmount,
        amount_credited: 0,
        status: "Under Review",
        submitted_on: new Date().toISOString().split("T")[0],
        income_cert_verified: true,
        doctor_cert_verified: true,
      };

      setCmrfClaims((prev) => [newRecord, ...prev]);
      setCmrfSuccessMsg(`CMRF Claim ${res.cmrf_claim_id} submitted to Telangana State CM Relief Fund portal.`);
      setTimeout(() => setCmrfSuccessMsg(null), 6000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsCmrfSubmitting(false);
    }
  };

  // Filtered Claims
  const filteredClaims = pmjayClaims.filter((c) => {
    const matchesSearch =
      c.patient_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.claim_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.abha_id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || c.claim_status.toUpperCase() === statusFilter.toUpperCase();
    return matchesSearch && matchesStatus;
  });

  const totalSubmittedVal = pmjayClaims.reduce((acc, curr) => acc + curr.package_rate, 0);
  const totalCreditedVal = pmjayClaims.reduce((acc, curr) => acc + curr.amount_credited, 0);
  const pendingCount = pmjayClaims.filter((c) => c.claim_status === "Pending Submission" || c.claim_status === "Under Review" || c.claim_status === "Submitted").length;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6 font-sans">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-6 shadow-xl border border-indigo-900/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 flex items-center justify-center font-bold text-xl shadow-inner">
            <ShieldCheck className="w-7 h-7 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-indigo-500/30 text-indigo-200 text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-indigo-400/30 uppercase">
                SHA Telangana Empaneled
              </span>
              <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-emerald-400/30 uppercase flex items-center gap-1">
                <Award className="w-3 h-3 text-emerald-400" />
                NABH Priority (15% Rate Incentive)
              </span>
            </div>
            <h1 className="text-xl font-black text-white mt-1 flex items-center gap-2">
              Insurance, PMJAY & CM Relief Fund Command Desk
            </h1>
            <p className="text-xs text-indigo-200/80 mt-0.5">
              ABDM ABHA ID Creation • Ayushman Bharat PMJAY Card Issuance • Telangana CM Relief Fund • Cashless Claims Auto-Submission
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-slate-950/60 p-3 rounded-xl border border-indigo-900/60 text-xs">
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-mono block">Hospital HFR ID</span>
            <span className="font-bold text-cyan-300 font-mono">{HOSPITAL_HFR_ID}</span>
          </div>
          <div className="h-7 w-px bg-slate-800" />
          <div>
            <span className="text-[10px] text-slate-400 uppercase font-mono block">ROHINI Code</span>
            <span className="font-bold text-amber-300 font-mono">{HOSPITAL_ROHINI_ID}</span>
          </div>
        </div>
      </div>

      {/* Main Top Navigation Tabs */}
      <div className="bg-white rounded-2xl p-2 border border-slate-200 shadow-sm flex flex-wrap items-center gap-2">
        <button
          onClick={() => setActiveTab("pmjay")}
          className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-xs transition-all cursor-pointer ${
            activeTab === "pmjay"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>💳 PMJAY Scheme</span>
        </button>

        <button
          onClick={() => setActiveTab("abha")}
          className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-xs transition-all cursor-pointer ${
            activeTab === "abha"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>🏥 ABHA / HFR Link</span>
        </button>

        <button
          onClick={() => setActiveTab("cmrf")}
          className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-xs transition-all cursor-pointer ${
            activeTab === "cmrf"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <Building className="w-4 h-4" />
          <span>🏛️ CM Relief Fund</span>
        </button>

        <button
          onClick={() => setActiveTab("private")}
          className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-xs transition-all cursor-pointer ${
            activeTab === "private"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>🛡️ Private TPA / Star Health</span>
        </button>

        <button
          onClick={() => setActiveTab("settlement")}
          className={`flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-xs transition-all cursor-pointer ${
            activeTab === "settlement"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>📑 Settlement & Reports</span>
        </button>

        <button
          onClick={() => setActiveTab("nabh")}
          className={`flex-1 min-w-[150px] flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold text-xs transition-all cursor-pointer ${
            activeTab === "nabh"
              ? "bg-teal-700 text-white shadow-md shadow-teal-700/20"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          }`}
        >
          <Award className="w-4 h-4 text-amber-300" />
          <span>🏅 NABH Quality & NHA 15% Bonus</span>
        </button>
      </div>

      {/* SUCCESS ALERTS */}
      {claimSuccessMsg && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 p-4 rounded-2xl flex items-center justify-between text-xs font-semibold animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>{claimSuccessMsg}</span>
          </div>
          <button onClick={() => setClaimSuccessMsg(null)} className="text-emerald-700 hover:text-emerald-900">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TAB 1: PMJAY TAB */}
      {activeTab === "pmjay" && (
        <div className="space-y-6">
          {/* Action Row: Eligibility Check & Card Generation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Box 1: Check PMJAY Eligibility */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 font-bold">
                    <Search className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Step 1: PMJAY Eligibility Check</h3>
                    <p className="text-[11px] text-slate-500">Query mera.pmjay.gov.in / SHA Telangana Portal</p>
                  </div>
                </div>
                <span className="text-[10px] bg-indigo-100 text-indigo-800 font-mono font-bold px-2 py-0.5 rounded-full">
                  API Active
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Enter Patient ABHA ID / Ration Card / Aadhaar
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={eligibilityAbha}
                      onChange={(e) => setEligibilityAbha(e.target.value)}
                      placeholder="e.g. ABHA-9876543210 or TS-123456789"
                      className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold focus:bg-white focus:outline-none focus:border-indigo-600"
                    />
                    <button
                      onClick={handleCheckEligibility}
                      disabled={isCheckingEligibility}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
                    >
                      {isCheckingEligibility ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                      <span>Check Portal</span>
                    </button>
                  </div>
                </div>

                {eligibilityResult && (
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-2 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <span className="font-bold flex items-center gap-1.5 text-emerald-800">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        ELIGIBLE FOR CASHLESS TREATMENT
                      </span>
                      <span className="font-mono font-bold text-[11px] bg-emerald-200 text-emerald-950 px-2 py-0.5 rounded">
                        Family ID: {eligibilityResult.family_id}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-700 pt-1 border-t border-emerald-200">
                      <div>
                        <span className="text-slate-500 block">Scheme:</span>
                        <strong className="text-slate-900">{eligibilityResult.schemeName}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Head of Family:</span>
                        <strong className="text-slate-900">{eligibilityResult.headOfFamily}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Coverage Limit:</span>
                        <strong className="text-slate-900">₹{eligibilityResult.benefitAmountTotal.toLocaleString("en-IN")} / yr</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Remaining Limit:</span>
                        <strong className="text-emerald-700">₹{eligibilityResult.benefitAmountRemaining.toLocaleString("en-IN")}</strong>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Box 2: Generate PMJAY Card */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 font-bold">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Step 2: Generate PMJAY Ayushman Card</h3>
                    <p className="text-[11px] text-slate-500">Issue official PMJAY card linked to Hospital HFR</p>
                  </div>
                </div>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-mono font-bold px-2 py-0.5 rounded-full">
                  SHA Approved
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                    Verified PMJAY Family ID
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={cardFamilyId}
                      onChange={(e) => setCardFamilyId(e.target.value)}
                      placeholder="PMJAY-FAM12345"
                      className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold focus:bg-white focus:outline-none focus:border-indigo-600"
                    />
                    <button
                      onClick={handleGenerateCard}
                      disabled={isGeneratingCard}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
                    >
                      {isGeneratingCard ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      <span>Issue Ayushman Card</span>
                    </button>
                  </div>
                </div>

                {generatedCardNum && (
                  <div className="p-3.5 rounded-xl bg-indigo-950 text-white border border-indigo-800 space-y-2 shadow-lg animate-in fade-in">
                    <div className="flex items-center justify-between border-b border-indigo-800 pb-2">
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-5 h-5 text-amber-400" />
                        <span className="font-bold text-xs tracking-wider">AYUSHMAN BHARAT PMJAY CARD</span>
                      </div>
                      <span className="text-[10px] font-mono bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/40">
                        ACTIVE CARD
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-indigo-300 block font-mono">PMJAY CARD NUMBER</span>
                        <span className="font-mono font-black text-sm text-amber-300">{generatedCardNum}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-indigo-300 block font-mono">VALID TILL</span>
                        <span className="font-mono font-bold text-xs text-white">2030-12-31</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Claim Submission & Live Claims Queue */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Column 1: Submit New PMJAY Claim Form */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b pb-3 border-slate-100">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600 font-bold">
                  <Send className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Step 3: Submit PMJAY Package Claim</h3>
                  <p className="text-[11px] text-slate-500">Auto-fills ICD-10 code & package rate</p>
                </div>
              </div>

              <form onSubmit={handleSubmitPmjayClaim} className="space-y-3 text-xs">
                <div>
                  <label className="font-semibold text-slate-600 block mb-1">Select Patient from Queue</label>
                  <select
                    value={selectedPatientForClaim?.uhid || ""}
                    onChange={(e) => {
                      const p = patients.find((pat) => pat.uhid === e.target.value);
                      if (p) setSelectedPatientForClaim(p);
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600"
                  >
                    {patients.map((p) => (
                      <option key={p.uhid} value={p.uhid}>
                        {p.name} ({p.uhid}) — {p.department}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-600 block mb-1">ICD-10 Procedure Code</label>
                  <input
                    type="text"
                    value={claimProcCode}
                    onChange={(e) => setClaimProcCode(e.target.value)}
                    placeholder="e.g. ICD10-CABG-001"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold focus:bg-white focus:outline-none focus:border-indigo-600"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-600 block mb-1">Procedure / Package Description</label>
                  <input
                    type="text"
                    value={claimProcName}
                    onChange={(e) => setClaimProcName(e.target.value)}
                    placeholder="e.g. Coronary Artery Bypass Grafting"
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-medium focus:bg-white focus:outline-none focus:border-indigo-600"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-600 block mb-1">Package Rate Amount (₹)</label>
                  <input
                    type="number"
                    value={claimAmount}
                    onChange={(e) => setClaimAmount(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold text-indigo-700 focus:bg-white focus:outline-none focus:border-indigo-600"
                  />
                </div>

                {/* Document Completeness Checklist */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-[11px]">
                  <span className="font-bold text-slate-700 block text-[10px] uppercase font-mono">
                    Auto-Attached Documents
                  </span>
                  <div className="flex items-center gap-2 text-emerald-700 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Discharge Summary PDF (Auto-compiled)</span>
                  </div>
                  <div className="flex items-center gap-2 text-emerald-700 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Lab Reports & ECG Attachments</span>
                  </div>
                  <div className="flex items-center gap-2 text-emerald-700 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Surgeon OT Notes & Implant Sticker</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingClaim}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-indigo-600/20 disabled:opacity-50"
                >
                  {isSubmittingClaim ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>Submit Claim to SHA Portal</span>
                </button>
              </form>
            </div>

            {/* Column 2 & 3: Live Claims Tracker Queue */}
            <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b pb-3 border-slate-100">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    PMJAY Claims Tracking Desk
                    <span className="bg-indigo-100 text-indigo-800 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full">
                      {pmjayClaims.length} Total Claims
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500">Live submission status, review workflow & settlement logs</p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search patient, claim ID..."
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium focus:bg-white focus:outline-none focus:border-indigo-600"
                  />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 focus:bg-white"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="PENDING SUBMISSION">Pending</option>
                    <option value="SUBMITTED">Submitted</option>
                    <option value="UNDER REVIEW">Under Review</option>
                    <option value="APPROVED">Approved</option>
                    <option value="CREDITED">Credited</option>
                  </select>
                </div>
              </div>

              {/* Claims List */}
              <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
                {filteredClaims.map((claim) => (
                  <div
                    key={claim.claim_id}
                    className="p-4 rounded-2xl border border-slate-200 hover:border-indigo-300 transition-all bg-slate-50/50 hover:bg-white space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">{claim.patient_name}</span>
                          <span className="text-[10px] font-mono font-bold bg-slate-200 text-slate-800 px-2 py-0.5 rounded">
                            {claim.claim_id}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-3 mt-0.5 font-mono">
                          <span>Card: {claim.pmjay_card_number}</span>
                          <span>ABHA: {claim.abha_id}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-sm font-black text-indigo-700 font-mono">
                          ₹{claim.package_rate.toLocaleString("en-IN")}
                        </span>
                        <div className="text-[10px] text-slate-500">Submitted: {claim.submitted_on}</div>
                      </div>
                    </div>

                    <div className="text-xs font-semibold text-slate-800 bg-white p-2.5 rounded-xl border border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-indigo-600 font-bold">{claim.procedure_code}:</span>
                        <span>{claim.procedure}</span>
                      </div>

                      {/* Status Badge */}
                      <span
                        className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                          claim.claim_status === "Credited"
                            ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                            : claim.claim_status === "Approved"
                            ? "bg-teal-100 text-teal-800 border border-teal-300"
                            : claim.claim_status === "Under Review"
                            ? "bg-amber-100 text-amber-800 border border-amber-300 animate-pulse"
                            : claim.claim_status === "Submitted"
                            ? "bg-blue-100 text-blue-800 border border-blue-300"
                            : "bg-rose-100 text-rose-800 border border-rose-300"
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        <span>{claim.claim_status.toUpperCase()}</span>
                      </span>
                    </div>

                    {/* Missing Document Alerts Flagging */}
                    {claim.missing_docs && claim.missing_docs.length > 0 && (
                      <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-[11px] font-medium flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                          <strong className="font-bold">Missing Documents Flagged:</strong>
                          <ul className="list-disc list-inside mt-0.5 space-y-0.5">
                            {claim.missing_docs.map((m, idx) => (
                              <li key={idx}>{m}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}

                    {/* Progress Bar Timeline */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                        <span>Submitted</span>
                        <span>Under Review</span>
                        <span>Approved</span>
                        <span>Credited</span>
                      </div>
                      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden flex">
                        <div
                          className={`h-full ${
                            claim.claim_status === "Credited"
                              ? "w-full bg-emerald-500"
                              : claim.claim_status === "Approved"
                              ? "w-3/4 bg-teal-500"
                              : claim.claim_status === "Under Review"
                              ? "w-1/2 bg-amber-500 animate-pulse"
                              : "w-1/4 bg-blue-500"
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ABHA / HFR LINKING */}
      {activeTab === "abha" && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
          <div className="border-b pb-4 border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>ABDM ABHA ID Creation & Hospital HFR Linking Portal</span>
                <span className="bg-indigo-100 text-indigo-800 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full">
                  ABDM 2.0 Gateway Compliant
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Generates 14-digit ABHA ID via Aadhaar / Mobile OTP, links with Hospital HFR ID ({HOSPITAL_HFR_ID})
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Aadhaar Number (12 Digits)</label>
                <input
                  type="text"
                  value={aadhaarInput}
                  onChange={(e) => setAadhaarInput(e.target.value)}
                  placeholder="xxxx-xxxx-xxxx"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-xs font-mono font-bold focus:bg-white focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Mobile Number (Aadhaar Linked)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={mobileInput}
                    onChange={(e) => setMobileInput(e.target.value)}
                    placeholder="9876543210"
                    className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-xs font-mono font-bold focus:bg-white focus:outline-none focus:border-indigo-600"
                  />
                  <button
                    type="button"
                    onClick={handleSendOtp}
                    className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all cursor-pointer"
                  >
                    {isOtpSent ? "Resend OTP" : "Send OTP"}
                  </button>
                </div>
              </div>

              {isOtpSent && (
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl space-y-2 animate-in fade-in">
                  <label className="text-xs font-bold text-indigo-900 block">Enter 6-Digit OTP</label>
                  <input
                    type="text"
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value)}
                    placeholder="123456"
                    className="w-full bg-white border border-indigo-300 rounded-xl px-4 py-2 text-xs font-mono font-bold text-center tracking-widest text-indigo-900 focus:outline-none"
                  />
                </div>
              )}

              <button
                onClick={handleCreateAbha}
                disabled={isAbhaLoading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-indigo-600/20 disabled:opacity-50"
              >
                {isAbhaLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <UserCheck className="w-4 h-4" />
                )}
                <span>Generate & Auto-Link ABHA ID</span>
              </button>
            </div>

            {/* ABHA Digital Card Preview */}
            <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-2xl text-white border border-indigo-800 flex flex-col justify-between space-y-4 shadow-xl relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-indigo-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center font-bold text-indigo-300">
                    🪪
                  </div>
                  <div>
                    <span className="font-bold text-xs text-white block">NATIONAL HEALTH AUTHORITY</span>
                    <span className="text-[10px] text-indigo-300 font-mono">ABDM Digital Health Card</span>
                  </div>
                </div>
                <QrCode className="w-8 h-8 text-indigo-300" />
              </div>

              {generatedAbha ? (
                <div className="space-y-3 my-2 animate-in fade-in">
                  <div>
                    <span className="text-[10px] text-indigo-300 uppercase font-mono block">Patient ABHA Number</span>
                    <span className="font-mono font-black text-lg text-amber-300">{generatedAbha.abha_id}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono text-indigo-200">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Linked Hospital HFR</span>
                      <strong className="text-white">{HOSPITAL_HFR_ID}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Consent Token</span>
                      <strong className="text-emerald-400">GRANTED ✓</strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-indigo-300/60 font-mono text-xs">
                  Enter Aadhaar & Mobile details on the left to issue and preview the official ABHA Card.
                </div>
              )}

              <div className="pt-3 border-t border-indigo-800/80 flex items-center justify-between text-[10px] font-mono text-indigo-300">
                <span>PM Brothers Hospital, Telangana</span>
                <span>Verified ABDM Node</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: CM RELIEF FUND */}
      {activeTab === "cmrf" && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
          <div className="border-b pb-4 border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Telangana State Chief Minister Relief Fund (CMRF) Module</span>
                <span className="bg-amber-100 text-amber-800 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full">
                  TS Government Scheme
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Automated CMRF claim request compilation with discharge summary, income cert & doctor letter
              </p>
            </div>
          </div>

          {cmrfSuccessMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{cmrfSuccessMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <form onSubmit={handleSubmitCmrfClaim} className="space-y-4 text-xs bg-slate-50 p-5 rounded-2xl border border-slate-200">
              <h4 className="font-bold text-slate-900 text-sm border-b pb-2">Submit CMRF Financial Relief Claim</h4>

              <div>
                <label className="font-semibold text-slate-600 block mb-1">Select Patient</label>
                <select
                  value={selectedPatientForClaim?.uhid || ""}
                  onChange={(e) => {
                    const p = patients.find((pat) => pat.uhid === e.target.value);
                    if (p) setSelectedPatientForClaim(p);
                  }}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-bold text-slate-900 focus:outline-none focus:border-indigo-600"
                >
                  {patients.map((p) => (
                    <option key={p.uhid} value={p.uhid}>
                      {p.name} ({p.uhid}) — {p.department}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-600 block mb-1">Procedure / High-Cost Medical Treatment</label>
                <input
                  type="text"
                  value={cmrfProcName}
                  onChange={(e) => setCmrfProcName(e.target.value)}
                  placeholder="e.g. Liver Transplant / Major Surgical Intervention"
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-medium focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-600 block mb-1">Requested Financial Support Amount (₹)</label>
                <input
                  type="number"
                  value={cmrfReqAmount}
                  onChange={(e) => setCmrfReqAmount(Number(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 font-mono font-bold text-amber-700 focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1.5 text-[11px]">
                <span className="font-bold text-slate-700 block text-[10px] uppercase font-mono">
                  Mandated Document Attachments
                </span>
                <div className="flex items-center gap-2 text-emerald-700 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>MRO Income Certificate (Verified)</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-700 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Astra Auto-Generated Discharge Summary</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-700 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Doctor Recommendation Certificate (HPR Reg)</span>
                </div>
              </div>

              <button
                type="submit"
                disabled={isCmrfSubmitting}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-amber-600/20 disabled:opacity-50"
              >
                {isCmrfSubmitting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Building className="w-4 h-4" />
                )}
                <span>Submit to Telangana CMRF Portal</span>
              </button>
            </form>

            <div className="lg:col-span-2 space-y-3">
              <h4 className="font-bold text-slate-900 text-sm">Active CM Relief Fund Claims Queue</h4>

              <div className="space-y-3">
                {cmrfClaims.map((claim) => (
                  <div key={claim.cmrf_claim_id} className="p-4 rounded-2xl border border-slate-200 bg-white space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-900 text-sm">{claim.patient_name}</span>
                        <span className="text-[10px] font-mono font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded ml-2">
                          {claim.cmrf_claim_id}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-amber-700 text-sm">
                        ₹{claim.amount_requested.toLocaleString("en-IN")}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600">{claim.procedure}</p>

                    <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-100 font-mono">
                      <span className="text-slate-500">Submitted: {claim.submitted_on}</span>
                      <span className="font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        STATUS: {claim.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: PRIVATE TPA & STAR HEALTH */}
      {activeTab === "private" && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
          <div className="border-b pb-4 border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Private Insurance & TPA Cashless Pre-Auth Module</span>
                <span className="bg-purple-100 text-purple-800 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full">
                  ROHINI Registry Integrated
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Star Health, ICICI Lombard, Niva Bupa, Care Health e-claims with automatic ICD-10 mapping
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {patients.map((pat) => (
              <div key={pat.uhid} className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-sm">{pat.name}</span>
                  <span className="text-[10px] font-mono font-bold bg-purple-100 text-purple-900 px-2 py-0.5 rounded">
                    {pat.uhid}
                  </span>
                </div>

                <div className="text-[11px] text-slate-600 space-y-1">
                  <div>Provider: <strong className="text-slate-900">{pat.insuranceProvider || "Star Health Insurance"}</strong></div>
                  <div>Policy No: <strong className="font-mono">{pat.insuranceNumber || `SHI-2026-${pat.uhid.split("-").pop()}`}</strong></div>
                  <div>Coverage: <strong className="text-indigo-700 font-mono">₹{(pat.insuranceCoverageLimit || 500000).toLocaleString("en-IN")}</strong></div>
                </div>

                <button
                  onClick={() => {
                    if (onOpenPrintModal) {
                      onOpenPrintModal("insurance_claim_report", pat);
                    }
                  }}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Generate Pre-Auth & E-Claim</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: SETTLEMENT & DAILY REPORTS */}
      {activeTab === "settlement" && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
          <div className="border-b pb-4 border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>Insurance Daily Settlement & Reconciliation Report</span>
                <span className="bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full">
                  Real-time Accounts Feed
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Hospital HFR ID: {HOSPITAL_HFR_ID} • Date: {new Date().toISOString().split("T")[0]}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print PDF</span>
              </button>
              <button
                onClick={() => alert("Report exported to Excel CSV for Hospital Accounts Reconciliation.")}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Excel CSV</span>
              </button>
            </div>
          </div>

          {/* Totals Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs font-mono">
            <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200">
              <span className="text-indigo-600 font-bold block text-[10px] uppercase">Total Claims Submitted</span>
              <span className="text-xl font-black text-indigo-950 mt-1">₹{totalSubmittedVal.toLocaleString("en-IN")}</span>
              <span className="text-[10px] text-indigo-700 block mt-0.5">{pmjayClaims.length} Claims Total</span>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
              <span className="text-emerald-600 font-bold block text-[10px] uppercase">Amount Credited</span>
              <span className="text-xl font-black text-emerald-950 mt-1">₹{totalCreditedVal.toLocaleString("en-IN")}</span>
              <span className="text-[10px] text-emerald-700 block mt-0.5">Settled in Bank Account</span>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
              <span className="text-amber-600 font-bold block text-[10px] uppercase">Pending Settlement</span>
              <span className="text-xl font-black text-amber-950 mt-1">₹{(totalSubmittedVal - totalCreditedVal).toLocaleString("en-IN")}</span>
              <span className="text-[10px] text-amber-700 block mt-0.5">{pendingCount} Claims In Review</span>
            </div>

            <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200">
              <span className="text-purple-600 font-bold block text-[10px] uppercase">NABH Incentive Bonus</span>
              <span className="text-xl font-black text-purple-950 mt-1">+15% Rate</span>
              <span className="text-[10px] text-purple-700 block mt-0.5">Priority 7-Day Settlement</span>
            </div>
          </div>

          {/* Settlement Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold text-[11px] uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="p-3">Claim ID</th>
                  <th className="p-3">Patient Name</th>
                  <th className="p-3">ABHA ID</th>
                  <th className="p-3">PMJAY Card</th>
                  <th className="p-3">Procedure</th>
                  <th className="p-3 text-right">Package Rate</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Amount Credited</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {pmjayClaims.map((c) => (
                  <tr key={c.claim_id} className="hover:bg-slate-50">
                    <td className="p-3 font-bold text-indigo-700">{c.claim_id}</td>
                    <td className="p-3 font-sans font-bold text-slate-900">{c.patient_name}</td>
                    <td className="p-3 text-slate-600">{c.abha_id}</td>
                    <td className="p-3 text-slate-600">{c.pmjay_card_number}</td>
                    <td className="p-3 font-sans font-medium text-slate-800">{c.procedure}</td>
                    <td className="p-3 text-right font-bold text-slate-900">₹{c.package_rate.toLocaleString("en-IN")}</td>
                    <td className="p-3">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-800">
                        {c.claim_status}
                      </span>
                    </td>
                    <td className="p-3 text-right font-bold text-emerald-600">
                      ₹{c.amount_credited.toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: NABH QUALITY & ACCREDITATION COMMAND */}
      {activeTab === "nabh" && (
        <div className="space-y-6">
          {/* Executive Quality Banner */}
          <div className="bg-gradient-to-r from-teal-950 via-slate-900 to-teal-950 text-white p-6 rounded-2xl shadow-lg border border-teal-800/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-teal-500/20 border border-teal-400/40 text-teal-300 flex items-center justify-center font-bold text-2xl shadow-inner">
                <Award className="w-8 h-8 text-teal-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="bg-teal-500/30 text-teal-200 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded border border-teal-400/30 uppercase">
                    NABH 5th Edition Full Accreditation
                  </span>
                  <span className="bg-amber-500/30 text-amber-200 text-[10px] font-mono font-bold px-2.5 py-0.5 rounded border border-amber-400/30 uppercase flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-300" />
                    NHA 15% Tariff Bonus Auto-Applied
                  </span>
                </div>
                <h2 className="text-xl font-black text-white mt-1 flex items-center gap-2">
                  NABH Quality Standards, Clinical Audits & NHA Rate Incentive Desk
                </h2>
                <p className="text-xs text-teal-200/80 mt-0.5">
                  Real-time hospital-wide compliance tracking across all 10 NABH chapters, patient safety indicators & NHA 15% package tariff bonus
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-slate-950/70 p-4 rounded-xl border border-teal-800/60 font-mono">
              <div className="text-center">
                <span className="text-[10px] text-teal-300 uppercase block font-bold">Overall Score</span>
                <span className="text-2xl font-black text-emerald-400">94.2%</span>
              </div>
              <div className="h-8 w-px bg-slate-800" />
              <div className="text-center">
                <span className="text-[10px] text-amber-300 uppercase block font-bold">NHA Tariff Bonus</span>
                <span className="text-2xl font-black text-amber-400">+15%</span>
              </div>
            </div>
          </div>

          {/* NHA NABH 15% RATE INCENTIVE HIGHLIGHT BOX */}
          <div className="bg-gradient-to-r from-amber-500/10 via-emerald-500/10 to-teal-500/10 border border-amber-300/40 rounded-2xl p-5 text-slate-900 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-500/20 text-amber-800 rounded-xl font-black text-lg">
                +15%
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" /> NHA Ayushman Bharat NABH Tariff Incentive Active
                </h3>
                <p className="text-xs text-slate-600">
                  Full NABH Accreditation unlocks an automatic 15% increase on base PMJAY surgical and medical package rates credited directly by SHA Telangana.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
              <div>
                <span className="text-[10px] text-slate-500 block uppercase font-bold">Active Claim Batch Base</span>
                <span className="font-bold text-slate-900">₹{totalSubmittedVal.toLocaleString("en-IN")}</span>
              </div>
              <span className="text-lg font-black text-emerald-600">+</span>
              <div>
                <span className="text-[10px] text-emerald-700 block uppercase font-bold">15% NABH Incentive Bonus</span>
                <span className="font-bold text-emerald-700">₹{(totalSubmittedVal * 0.15).toLocaleString("en-IN")}</span>
              </div>
            </div>
          </div>

          {/* NABH 10 CHAPTERS COMPLIANCE GRID */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-teal-600" /> NABH 10 Core Chapters Compliance & Audit Performance
              </h3>
              <span className="text-xs font-mono font-bold bg-teal-50 text-teal-800 px-3 py-1 rounded-full border border-teal-200">
                10 / 10 Chapters Audit Ready
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
              {[
                { code: "AAC", name: "Access, Assessment & Care", score: 96, status: "Compliant" },
                { code: "COP", name: "Care of Patients (ICU/OT)", score: 94, status: "Compliant" },
                { code: "MOM", name: "Management of Medication", score: 92, status: "Compliant" },
                { code: "PRE", name: "Patient Rights & Education", score: 98, status: "Exemplary" },
                { code: "HIC", name: "Hospital Infection Control", score: 93, status: "Compliant" },
                { code: "FMS", name: "Facility & Fire Safety", score: 95, status: "Compliant" },
                { code: "HRM", name: "Human Resource & BLS", score: 90, status: "Compliant" },
                { code: "IMS", name: "Information & Medical Records", score: 97, status: "Exemplary" },
                { code: "CQI", name: "Continuous Quality & Audit", score: 89, status: "Minor Action" },
                { code: "ROM", name: "Management Responsibility", score: 95, status: "Compliant" },
              ].map((ch) => (
                <div key={ch.code} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-black text-xs text-teal-700 bg-teal-100 px-2 py-0.5 rounded">
                      {ch.code}
                    </span>
                    <span className="font-mono font-black text-xs text-slate-900">{ch.score}%</span>
                  </div>
                  <div className="text-[11px] font-bold text-slate-800 leading-tight h-8 flex items-center">
                    {ch.name}
                  </div>
                  <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${ch.score >= 95 ? "bg-emerald-500" : ch.score >= 90 ? "bg-teal-500" : "bg-amber-500"}`}
                      style={{ width: `${ch.score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CLINICAL SAFETY INDICATORS & INFECTION CONTROL */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Quality KPIs */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b pb-3">
                <Activity className="w-4 h-4 text-indigo-600" /> Patient Safety & Infection Control KPIs
              </h3>

              <div className="space-y-3 font-sans text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 block">Hospital-Acquired Infection (HAI) Rate</span>
                    <span className="text-[10px] text-slate-500">Target &lt; 1.0 per 1000 bed-days</span>
                  </div>
                  <span className="font-mono font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg">
                    0.3 / 1000
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 block">Hand Hygiene Staff Compliance Rate</span>
                    <span className="text-[10px] text-slate-500">WHO 5 Moments Audit Verified</span>
                  </div>
                  <span className="font-mono font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg">
                    94.5%
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 block">Patient Wristband Barcode Scanning</span>
                    <span className="text-[10px] text-slate-500">Pre-medication & Lab sample collection</span>
                  </div>
                  <span className="font-mono font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg">
                    100.0%
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 block">LASA High-Risk Drug Double Verification</span>
                    <span className="text-[10px] text-slate-500">Look-Alike Sound-Alike storage check</span>
                  </div>
                  <span className="font-mono font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg">
                    100.0%
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <span className="font-bold text-slate-900 block">Biomedical Waste (BMW) Color Segregation</span>
                    <span className="text-[10px] text-slate-500">Yellow, Red, Blue & Sharps compliance</span>
                  </div>
                  <span className="font-mono font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-lg">
                    98.0%
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Incident Logger Form */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b pb-3">
                <AlertTriangle className="w-4 h-4 text-amber-600" /> Log Incident / Near-Miss (NABH CAPA)
              </h3>

              <form onSubmit={handleCreateNabhIncident} className="space-y-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Category</label>
                  <select
                    value={newIncidentCategory}
                    onChange={(e) => setNewIncidentCategory(e.target.value)}
                    className="w-full bg-slate-50 text-slate-900 px-3 py-2 rounded-xl border border-slate-300 font-sans"
                  >
                    <option value="Medication Safety">Medication Safety / Near-Miss</option>
                    <option value="Patient Safety / Fall Risk">Patient Safety / Fall Risk</option>
                    <option value="Biomedical Waste Segregation">Biomedical Waste Segregation</option>
                    <option value="Infection Control Violation">Infection Control Violation</option>
                    <option value="Equipment Calibration Defect">Equipment Calibration Defect</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Incident / Near-Miss Description</label>
                  <textarea
                    rows={2}
                    value={newIncidentDesc}
                    onChange={(e) => setNewIncidentDesc(e.target.value)}
                    placeholder="Describe event, location, immediate action taken..."
                    className="w-full bg-slate-50 text-slate-900 p-3 rounded-xl border border-slate-300 font-sans focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Severity Level</label>
                  <select
                    value={newIncidentSeverity}
                    onChange={(e) => setNewIncidentSeverity(e.target.value as any)}
                    className="w-full bg-slate-50 text-slate-900 px-3 py-2 rounded-xl border border-slate-300 font-sans"
                  >
                    <option value="Low">Low (Near-Miss / No Harm)</option>
                    <option value="Medium">Medium (Minor Delay / Process Flaw)</option>
                    <option value="High">High (Adverse Event / Intervention Required)</option>
                    <option value="Sentinel">Sentinel Event (Critical Review)</option>
                  </select>
                </div>

                <button
                  type="submit"
                  className="w-full bg-teal-700 hover:bg-teal-800 text-white font-mono text-xs font-bold py-2.5 rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" /> Log Incident for Quality Audit
                </button>
              </form>
            </div>
          </div>

          {/* INCIDENT LOGS & CAPA TABLE */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
            <h3 className="font-bold text-slate-900 text-sm flex items-center justify-between border-b pb-3">
              <span className="flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-teal-600" /> NABH Incident & CAPA Tracker Log ({nabhIncidents.length})
              </span>
              <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                SLA Root Cause Analysis (RCA) Active
              </span>
            </h3>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs font-sans">
                <thead className="bg-slate-100 text-slate-700 font-bold text-[11px] uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="p-3">Incident ID</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Category</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">Severity</th>
                    <th className="p-3">CAPA Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {nabhIncidents.map((inc) => (
                    <tr key={inc.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold text-teal-700">{inc.id}</td>
                      <td className="p-3 font-mono text-slate-600">{inc.date}</td>
                      <td className="p-3 font-bold text-slate-900">{inc.category}</td>
                      <td className="p-3 text-slate-700 text-[11px] max-w-md">{inc.description}</td>
                      <td className="p-3">
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                            inc.severity === "Sentinel"
                              ? "bg-rose-100 text-rose-800 border border-rose-300 animate-pulse"
                              : inc.severity === "High"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-800"
                          }`}
                        >
                          {inc.severity}
                        </span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                            inc.status === "CAPA Applied" || inc.status === "Resolved"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {inc.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
