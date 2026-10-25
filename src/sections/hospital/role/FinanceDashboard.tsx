import { useState } from "react";
import { DollarSign, TrendingUp, TrendingDown, FileText, CreditCard, Users, Building2, Receipt } from "lucide-react";
import { GlassCard, SectionTitle, Badge } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export function FinanceDashboard() {
  const { account } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

  const tabs = [
    { key: "overview", label: "Overview", icon: TrendingUp },
    { key: "revenue", label: "Revenue", icon: DollarSign },
    { key: "expenses", label: "Expenses", icon: TrendingDown },
    { key: "payments", label: "Payments", icon: CreditCard },
    { key: "reports", label: "Reports", icon: FileText },
  ];

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      <div>
        <h1 className="font-display text-3xl font-bold text-gradient">Finance Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">
          {account?.name ?? "Finance User"} · {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      <div className="flex gap-1.5 mb-2 overflow-x-auto pb-1">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-all border",
              activeTab === key
                ? "bg-gradient-to-r from-cyan-500/15 to-violet-500/15 text-white border-violet-400/40 shadow-[0_0_14px_rgba(212,175,55,0.25)]"
                : "text-slate-400 border-white/10 bg-white/[0.03] hover:text-white hover:bg-white/[0.06]"
            )}
          >
            <Icon size={16} className={activeTab === key ? "text-neon-cyan" : ""} />
            {label}
          </button>
        ))}
      </div>

      {activeTab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <GlassCard>
            <div className="text-xs text-slate-400 mb-1">Today's Revenue</div>
            <div className="text-2xl font-bold text-white">₹1,25,000</div>
            <div className="text-xs text-emerald-400 mt-1">↑ 12% from yesterday</div>
          </GlassCard>
          <GlassCard>
            <div className="text-xs text-slate-400 mb-1">Pending Payments</div>
            <div className="text-2xl font-bold text-white">₹45,000</div>
            <div className="text-xs text-amber-400 mt-1">23 invoices pending</div>
          </GlassCard>
          <GlassCard>
            <div className="text-xs text-slate-400 mb-1">Insurance Claims</div>
            <div className="text-2xl font-bold text-white">₹2,80,000</div>
            <div className="text-xs text-cyan-400 mt-1">8 claims processing</div>
          </GlassCard>
          <GlassCard>
            <div className="text-xs text-slate-400 mb-1">Monthly Target</div>
            <div className="text-2xl font-bold text-white">78%</div>
            <div className="text-xs text-slate-400 mt-1">₹18.5L of ₹23.7L</div>
          </GlassCard>
        </div>
      )}

      {activeTab === "revenue" && (
        <GlassCard>
          <SectionTitle title="Revenue Breakdown" subtitle="Today's collections by department" />
          <div className="space-y-2 mt-4">
            {["OPD", "IPD", "Pharmacy", "Lab", "Radiology", "Surgery"].map((dept) => (
              <div key={dept} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center">
                    <Building2 size={18} className="text-cyan-400" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{dept}</div>
                    <div className="text-xs text-slate-400">Department</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-white">₹{Math.floor(Math.random() * 50000 + 10000).toLocaleString()}</div>
                  <div className="text-xs text-emerald-400">↑ {Math.floor(Math.random() * 20 + 5)}%</div>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {activeTab === "expenses" && (
        <GlassCard>
          <SectionTitle title="Expenses" subtitle="Today's operational costs" />
          <div className="space-y-2 mt-4">
            {["Staff Salaries", "Medicine Purchase", "Equipment Maintenance", "Utilities", "Supplies"].map((item) => (
              <div key={item} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-400/20 flex items-center justify-center">
                    <Receipt size={18} className="text-red-400" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{item}</div>
                    <div className="text-xs text-slate-400">Expense</div>
                  </div>
                </div>
                <div className="text-sm font-bold text-red-300">-₹{Math.floor(Math.random() * 20000 + 5000).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {activeTab === "payments" && (
        <GlassCard>
          <SectionTitle title="Payment Management" subtitle="Doctor payments, vendor payments, and cash flow" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users size={18} className="text-cyan-400" />
                <h3 className="text-sm font-semibold text-white">Doctor Payments</h3>
              </div>
              <div className="text-xs text-slate-400 space-y-1">
                <div>Pending: 5 doctors</div>
                <div>Amount: ₹85,000</div>
                <div>Next payout: Tomorrow</div>
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-2 mb-3">
                <Building2 size={18} className="text-violet-400" />
                <h3 className="text-sm font-semibold text-white">Vendor Payments</h3>
              </div>
              <div className="text-xs text-slate-400 space-y-1">
                <div>Pending: 12 vendors</div>
                <div>Amount: ₹2,50,000</div>
                <div>Due: This week</div>
              </div>
            </div>
          </div>
        </GlassCard>
      )}

      {activeTab === "reports" && (
        <GlassCard>
          <SectionTitle title="Financial Reports" subtitle="Profit analysis and financial summaries" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-center">
              <div className="text-xs text-slate-400 mb-1">Monthly Profit</div>
              <div className="text-xl font-bold text-emerald-400">+₹12.5L</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-center">
              <div className="text-xs text-slate-400 mb-1">Yearly Revenue</div>
              <div className="text-xl font-bold text-white">₹2.8Cr</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-center">
              <div className="text-xs text-slate-400 mb-1">Growth Rate</div>
              <div className="text-xl font-bold text-cyan-400">+18%</div>
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
