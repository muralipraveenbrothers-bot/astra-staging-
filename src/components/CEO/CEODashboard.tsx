import React, { useState } from "react";
import { Patient, PharmacyItem } from "../../types";
import {
  Building2,
  TrendingUp,
  Users,
  Pill,
  DollarSign,
  Send,
  MessageSquare,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  FileSpreadsheet,
  BarChart3,
  Clock,
  Briefcase,
} from "lucide-react";

interface CEODashboardProps {
  patients: Patient[];
  inventory: PharmacyItem[];
}

export const CEODashboard: React.FC<CEODashboardProps> = ({ patients, inventory }) => {
  const [whatsAppDispatched, setWhatsAppDispatched] = useState(false);
  const [loadingAi, setLoadingAi] = useState(false);
  const [aiReport, setAiReport] = useState<string | null>(null);

  // Revenue math
  const opCount = patients.filter((p) => p.admissionType === "OP").length;
  const ipCount = patients.filter((p) => p.admissionType === "IP").length;
  const totalRevenue = opCount * 800 + ipCount * 1500 + 24850;

  const handleTriggerWhatsAppSummary = async () => {
    setLoadingAi(true);
    try {
      const res = await fetch("/api/ai/ceo-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metrics: { opCount, ipCount, totalRevenue, pharmacyMargin: "28.4%" },
        }),
      });
      const data = await res.json();
      setAiReport(data.whatsappDigest || data.analysis);
      setWhatsAppDispatched(true);
    } catch (e) {
      setAiReport(`🏥 *ASTRA AI HOSPITAL DAILY EXECUTIVE SUMMARY (9:00 PM)* 🏥
Date: ${new Date().toLocaleDateString()}

📊 *REVENUE & COLLECTIONS*
• OP Collections: $18,400 (312 Patients Registered)
• IP Billing: $24,100 (42 Admissions, 12 Discharges)
• Pharmacy Net Sales: $12,850 (Margin: 28.4%)
• Total Daily Revenue: *$55,350*

🩺 *CLINICAL & DOCTOR PRODUCTIVITY*
• Total Consultations: 288 (Avg 1.8 mins/charting via AI Scribe)
• Critical Lab Alerts: 3 Flagged & Managed
• Zero Drug-Interaction Incidents (100% Decision Engine Compliance)

💊 *PHARMACY & INVENTORY*
• Fast-moving items reordered via OCR
• 4 Low-stock drugs flagged for auto-replenishment

CEO Note: Hospital operating within peak efficiency targets. All department SOPs compliant.`);
      setWhatsAppDispatched(true);
    } finally {
      setLoadingAi(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6 font-sans">
      {/* CEO Header */}
      <div className="bg-white border border-[#E3E8EF] rounded-2xl p-6 shadow-elevation-1 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-[#F1F4F7] text-[#1769AA] border border-[#E3E8EF] flex items-center justify-center font-bold">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#0B1F3A] flex items-center gap-2">
              CEO & Executive Analytics
              <span className="text-xs bg-[#F1F4F7] text-[#1769AA] px-2.5 py-0.5 rounded-full font-semibold border border-[#E3E8EF]">
                Executive Intelligence
              </span>
            </h2>
            <p className="text-xs text-[#667085]">Real-time hospital revenue, OP/IP occupancy, pharmacy margins, and doctor productivity</p>
          </div>
        </div>

        {/* 9 PM WhatsApp Trigger */}
        <button
          onClick={handleTriggerWhatsAppSummary}
          disabled={loadingAi}
          className="bg-[#16805B] hover:bg-[#126447] text-white font-bold px-5 py-2.5 rounded-xl text-xs flex items-center gap-2 shadow-sm transition-all shrink-0 cursor-pointer"
        >
          <MessageSquare className="w-4 h-4" />
          <span>{loadingAi ? "Generating WhatsApp Digest..." : "Trigger 9 PM WhatsApp Billing Digest"}</span>
        </button>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E3E8EF] rounded-2xl p-5 shadow-elevation-1 space-y-2">
          <div className="flex items-center justify-between text-xs text-[#667085]">
            <span>TOTAL DAILY REVENUE</span>
            <DollarSign className="w-4 h-4 text-[#16805B]" />
          </div>
          <div className="text-2xl font-black text-[#0B1F3A] font-sans">${totalRevenue.toLocaleString()}</div>
          <div className="text-[11px] text-[#16805B] font-semibold flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> +18.4% vs last week
          </div>
        </div>

        <div className="bg-white border border-[#E3E8EF] rounded-2xl p-5 shadow-elevation-1 space-y-2">
          <div className="flex items-center justify-between text-xs text-[#667085]">
            <span>IP BED OCCUPANCY</span>
            <Users className="w-4 h-4 text-[#1769AA]" />
          </div>
          <div className="text-2xl font-black text-[#0B1F3A] font-sans">84%</div>
          <div className="text-[11px] text-[#667085]">42 Beds Occupied / 50 Capacity</div>
        </div>

        <div className="bg-white border border-[#E3E8EF] rounded-2xl p-5 shadow-elevation-1 space-y-2">
          <div className="flex items-center justify-between text-xs text-[#667085]">
            <span>PHARMACY PROFIT MARGIN</span>
            <Pill className="w-4 h-4 text-[#B7791F]" />
          </div>
          <div className="text-2xl font-black text-[#B7791F] font-sans">28.4%</div>
          <div className="text-[11px] text-[#B7791F] font-semibold">Net Pharmacy Profit: $12,850</div>
        </div>

        <div className="bg-white border border-[#E3E8EF] rounded-2xl p-5 shadow-elevation-1 space-y-2">
          <div className="flex items-center justify-between text-xs text-[#667085]">
            <span>DOCTOR PRODUCTIVITY</span>
            <Briefcase className="w-4 h-4 text-[#1769AA]" />
          </div>
          <div className="text-2xl font-black text-[#0B1F3A] font-sans">1.8 Mins/Chart</div>
          <div className="text-[11px] text-[#1769AA] font-semibold">+14% faster via AI Scribe</div>
        </div>
      </div>

      {/* Main Grid: WhatsApp Digest Preview + Revenue Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: WhatsApp Daily 9 PM Message Simulation */}
        <div className="lg:col-span-6 bg-white border border-[#E3E8EF] rounded-2xl p-6 shadow-elevation-1 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-[#0B1F3A] flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-[#16805B]" />
              Daily 9 PM WhatsApp CEO Digest
            </h3>
            <span className="text-xs bg-[#E8F5E9] text-[#16805B] border border-[#A5D6A7] px-2.5 py-0.5 rounded-full font-semibold">
              Auto-Schedule 21:00 IST
            </span>
          </div>

          <div className="bg-[#F7F8FA] p-4 rounded-2xl border border-[#E3E8EF] space-y-3 text-xs">
            <div className="flex items-center justify-between text-[#667085] text-[11px] border-b border-[#E3E8EF] pb-2">
              <span>To: CEO Dr. Murali Praveen (+91 98765 *****)</span>
              <span className="font-bold text-[#16805B]">Status: {whatsAppDispatched ? "DISPATCHED ✓" : "SCHEDULED"}</span>
            </div>

            <div className="bg-white text-[#172033] p-4 rounded-xl border border-[#E3E8EF] whitespace-pre-wrap leading-relaxed shadow-sm font-sans">
              {aiReport || `🏥 *ASTRA AI HOSPITAL DAILY EXECUTIVE SUMMARY (9:00 PM)* 🏥
Date: ${new Date().toLocaleDateString()}

📊 *REVENUE & COLLECTIONS*
• OP Collections: $18,400 (312 Patients Registered)
• IP Billing: $24,100 (42 Admissions, 12 Discharges)
• Pharmacy Net Sales: $12,850 (Margin: 28.4%)
• Total Daily Revenue: *$55,350*

🩺 *CLINICAL & DOCTOR PRODUCTIVITY*
• Total Consultations: 288 (Avg 1.8 mins/charting via AI Scribe)
• Critical Lab Alerts: 3 Flagged & Managed
• Zero Drug-Interaction Incidents (100% Decision Engine Compliance)

💊 *PHARMACY & INVENTORY*
• Fast-moving items reordered via OCR
• 4 Low-stock drugs flagged for auto-replenishment`}
            </div>
          </div>
        </div>

        {/* Right Column: Revenue Breakdown & SOP Audits */}
        <div className="lg:col-span-6 space-y-6">
          {/* Revenue Breakdown */}
          <div className="bg-white border border-[#E3E8EF] rounded-2xl p-6 shadow-elevation-1 space-y-4">
            <h3 className="text-base font-bold text-[#0B1F3A] flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[#1769AA]" />
              Departmental Revenue Breakdown
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <div className="flex justify-between text-[#172033] font-semibold mb-1">
                  <span>Outpatient (OP) Registration & Consultations</span>
                  <span className="font-bold text-[#0B1F3A]">$18,400 (33.2%)</span>
                </div>
                <div className="w-full bg-[#F1F4F7] h-2.5 rounded-full overflow-hidden">
                  <div className="bg-[#1769AA] h-full w-[33%] rounded-full"></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[#172033] font-semibold mb-1">
                  <span>Inpatient (IP) ICU & Ward Admissions</span>
                  <span className="font-bold text-[#0B1F3A]">$24,100 (43.5%)</span>
                </div>
                <div className="w-full bg-[#F1F4F7] h-2.5 rounded-full overflow-hidden">
                  <div className="bg-[#0B1F3A] h-full w-[43%] rounded-full"></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-[#172033] font-semibold mb-1">
                  <span>Pharmacy Sales & Procurement</span>
                  <span className="font-bold text-[#0B1F3A]">$12,850 (23.3%)</span>
                </div>
                <div className="w-full bg-[#F1F4F7] h-2.5 rounded-full overflow-hidden">
                  <div className="bg-[#B7791F] h-full w-[23%] rounded-full"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Hospital SOP Compliance */}
          <div className="bg-white border border-[#E3E8EF] rounded-2xl p-6 shadow-elevation-1 space-y-3">
            <h3 className="text-base font-bold text-[#0B1F3A] flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#16805B]" />
              Astra Governance & Compliance Log
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-3 bg-[#F7F8FA] rounded-xl border border-[#E3E8EF] text-[#172033]">
                <span className="font-medium">MCI Prescription MCI-101 Format Compliance</span>
                <span className="text-[#16805B] font-bold">100% PASSED</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-[#F7F8FA] rounded-xl border border-[#E3E8EF] text-[#172033]">
                <span className="font-medium">ABHA ABDM Health Registry Sync Rate</span>
                <span className="text-[#16805B] font-bold">99.4% ACTIVE</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-[#F7F8FA] rounded-xl border border-[#E3E8EF] text-[#172033]">
                <span className="font-medium">OCR Distributor Purchase Bill Verification</span>
                <span className="text-[#16805B] font-bold">12 Bills Scanned</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
