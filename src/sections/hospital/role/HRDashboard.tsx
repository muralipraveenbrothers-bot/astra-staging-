import { useState } from "react";
import { Users, Calendar, FileText, Award, Briefcase, TrendingUp } from "lucide-react";
import { GlassCard, SectionTitle, Badge } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export function HRDashboard() {
  const { account } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

  const tabs = [
    { key: "overview", label: "Overview", icon: Users },
    { key: "attendance", label: "Attendance", icon: Calendar },
    { key: "leave", label: "Leave Mgmt", icon: FileText },
    { key: "payroll", label: "Payroll", icon: TrendingUp },
    { key: "training", label: "Training", icon: Award },
  ];

  return (
    <div className="max-w-[1400px] mx-auto space-y-4">
      <div>
        <h1 className="font-display text-3xl font-bold text-gradient">HR Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">
          {account?.name ?? "HR Manager"} · {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
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
            <div className="text-xs text-slate-400 mb-1">Total Staff</div>
            <div className="text-2xl font-bold text-white">156</div>
            <div className="text-xs text-cyan-400 mt-1">Active employees</div>
          </GlassCard>
          <GlassCard>
            <div className="text-xs text-slate-400 mb-1">Present Today</div>
            <div className="text-2xl font-bold text-white">142</div>
            <div className="text-xs text-emerald-400 mt-1">91% attendance</div>
          </GlassCard>
          <GlassCard>
            <div className="text-xs text-slate-400 mb-1">On Leave</div>
            <div className="text-2xl font-bold text-white">8</div>
            <div className="text-xs text-amber-400 mt-1">Approved leaves</div>
          </GlassCard>
          <GlassCard>
            <div className="text-xs text-slate-400 mb-1">New Hires</div>
            <div className="text-2xl font-bold text-white">3</div>
            <div className="text-xs text-violet-400 mt-1">This month</div>
          </GlassCard>
        </div>
      )}

      {activeTab === "attendance" && (
        <GlassCard>
          <SectionTitle title="Attendance Management" subtitle="Daily attendance tracking" />
          <div className="space-y-2 mt-4">
            {["Dr. Anitha", "Dr. Karthik", "Meera Nair", "Sana Iqbal", "Anjali Verma", "Prakash T"].map((name) => (
              <div key={name} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center text-cyan-300 font-semibold text-sm">
                    {name.split(" ").map(n => n[0]).join("")}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{name}</div>
                    <div className="text-xs text-slate-400">Staff Member</div>
                  </div>
                </div>
                <Badge tone="green">Present</Badge>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {activeTab === "leave" && (
        <GlassCard>
          <SectionTitle title="Leave Management" subtitle="Leave requests and approvals" />
          <div className="space-y-2 mt-4">
            {[
              { name: "Kavya R", type: "Sick Leave", dates: "25-26 Jul", status: "Pending" },
              { name: "Binu S", type: "Casual Leave", dates: "28 Jul", status: "Approved" },
              { name: "Anjali V", type: "Earned Leave", dates: "30 Jul - 1 Aug", status: "Pending" },
            ].map((leave) => (
              <div key={leave.name} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div>
                  <div className="text-sm font-semibold text-white">{leave.name}</div>
                  <div className="text-xs text-slate-400">{leave.type} · {leave.dates}</div>
                </div>
                <Badge tone={leave.status === "Approved" ? "green" : "amber"}>{leave.status}</Badge>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {activeTab === "payroll" && (
        <GlassCard>
          <SectionTitle title="Payroll Management" subtitle="Salary processing and payments" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-center">
              <div className="text-xs text-slate-400 mb-1">Total Payroll</div>
              <div className="text-xl font-bold text-white">₹45.5L</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-center">
              <div className="text-xs text-slate-400 mb-1">Processed</div>
              <div className="text-xl font-bold text-emerald-400">₹42.3L</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-center">
              <div className="text-xs text-slate-400 mb-1">Pending</div>
              <div className="text-xl font-bold text-amber-400">₹3.2L</div>
            </div>
          </div>
        </GlassCard>
      )}

      {activeTab === "training" && (
        <GlassCard>
          <SectionTitle title="Training & Development" subtitle="Staff training programs" />
          <div className="space-y-2 mt-4">
            {[
              { program: "Basic Life Support (BLS)", participants: 12, date: "15 Aug 2025" },
              { program: "Infection Control", participants: 25, date: "20 Aug 2025" },
              { program: "Digital Documentation", participants: 18, date: "25 Aug 2025" },
            ].map((t) => (
              <div key={t.program} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div>
                  <div className="text-sm font-semibold text-white">{t.program}</div>
                  <div className="text-xs text-slate-400">{t.participants} participants · {t.date}</div>
                </div>
                <Badge tone="cyan">Scheduled</Badge>
              </div>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
