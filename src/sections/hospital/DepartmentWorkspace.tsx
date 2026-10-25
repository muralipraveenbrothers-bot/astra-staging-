import React, { useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
  Send,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Badge, GlassCard, SectionTitle } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { useStore } from "@/lib/store";
import { notificationAppliesTo } from "@/lib/notifications";
import { queuePrompt } from "@/lib/conversation";
import { navHash } from "@/lib/hashRoute";
import { cn } from "@/lib/utils";

interface DepartmentWorkspaceProps {
  departmentName: string;
  roleTitle: string;
  metrics: { label: string; value: string; tone?: "cyan" | "green" | "amber" | "red" | "violet" }[];
  children: React.ReactNode;
}

const DEPT_SEVERITY: Record<string, string> = {
  critical: "border-red-400/40 bg-red-400/[0.06]",
  high: "border-amber-400/35 bg-amber-400/[0.05]",
  normal: "border-cyan-400/25 bg-cyan-400/[0.04]",
  info: "border-white/10 bg-white/[0.02]",
};

/** Contextual AI suggestions per department — sent to the AI Command chat. */
const DEPT_SUGGESTIONS: Record<string, string[]> = {
  Pharmacy: [
    "Show pending pharmacy orders",
    "What are my pending tasks?",
    "Send prescription to pharmacy",
    "Check inventory gaps",
  ],
  Laboratory: ["Send CBC and LFT for UHID 1024", "Pending critical lab results", "What are my pending tasks?"],
  Radiology: ["Today's radiology queue", "What are my pending tasks?"],
  Reception: ["How many patients are waiting in reception?", "Register patient name is Rakesh age 45", "Where is patient UHID 1024?"],
  "Operation Theatre": ["Today's OT schedule", "Prep tomorrow's OT list", "Schedule OT booking"],
  Billing: ["Unpaid bills above threshold", "Today's collections", "Void bill RCPT-1044"],
  "Nursing / Ward": ["IP census and bed occupancy", "Pending discharge summaries"],
  HR: ["Show staffing gaps today", "Attendance anomalies today"],
};

const DEFAULT_SUGGESTIONS = [
  "Show today's OP census",
  "What are my pending tasks?",
  "Show reception queue",
  "Where is patient UHID 1024?",
];

export function DepartmentWorkspace({
  departmentName,
  roleTitle,
  metrics,
  children,
}: DepartmentWorkspaceProps) {
  const { account } = useAuth();
  const { tasks, notifications, acknowledgeNotification } = useStore();
  const [aiCmd, setAiCmd] = useState("");

  const userName = account?.name ?? "Staff";
  const role = account?.role ?? "ceo";

  // Filter tasks relevant to this department
  const deptTasks = tasks.filter(
    (t) => t.department.toLowerCase() === departmentName.toLowerCase() || t.category === departmentName.toLowerCase()
  );

  // Department-relevant notifications: sourced here OR targeting this role
  const deptNotifications = notifications
    .filter((n) => n.status !== "RESOLVED")
    .filter((n) => {
      const src = (n.sourceDept ?? "").toLowerCase();
      const inDept = src.includes(departmentName.toLowerCase()) || departmentName.toLowerCase().includes(src);
      return inDept || notificationAppliesTo(n, role);
    })
    .sort((a, b) => b.createdTs - a.createdTs)
    .slice(0, 6);

  const handleAiAction = () => {
    if (!aiCmd.trim()) return;
    // Dispatch through Astra command bus so it enters the unified pipeline
    // (Chat component's Astra:command listener will route through CommandConsole → CommandEngine)
    if (typeof window !== "undefined") {
      const event = new CustomEvent("Astra:command", {
        detail: { text: aiCmd.trim(), source: "department-screen" }
      });
      window.dispatchEvent(event);
    }
    setAiCmd("");
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* 1. Header: Department name + user role + status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass p-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-bold text-gradient">{departmentName} Workspace</h1>
            <Badge tone="cyan">{roleTitle}</Badge>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Execution & Operational Center · Logged in as <span className="text-white font-medium">{userName}</span>
          </p>
        </div>

        {/* 6. Metrics */}
        <div className="flex items-center gap-3 flex-wrap">
          {metrics.map((m, idx) => (
            <div key={idx} className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-center">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{m.label}</div>
              <div className={cn("text-base font-bold font-mono mt-0.5", m.tone === "green" ? "text-emerald-400" : m.tone === "red" ? "text-red-400" : m.tone === "amber" ? "text-amber-400" : "text-cyan-300")}>
                {m.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Contextual AI Action Box */}
      <div className="glass p-4 border !border-violet-500/30 flex flex-col md:flex-row items-center gap-3">
        <div className="flex items-center gap-2 text-xs text-violet-300 shrink-0 font-semibold">
          <Sparkles size={15} /> Contextual {departmentName} AI:
        </div>
        <input
          className="input-dark flex-1 text-xs"
          placeholder={`Issue natural language command for ${departmentName} (e.g. "Order stat refill for batch B-102")...`}
          value={aiCmd}
          onChange={(e) => setAiCmd(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAiAction();
          }}
        />
        <button className="btn-neon !py-2 !px-4 text-xs shrink-0 flex items-center gap-1.5" onClick={handleAiAction}>
          <Send size={13} /> Execute AI Order
        </button>
      </div>

      {/* role-aware suggestions → route into the one AI conversation */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[9px] text-slate-500 uppercase tracking-wider">Ask Astra:</span>
        {(DEPT_SUGGESTIONS[departmentName] ?? DEFAULT_SUGGESTIONS).map((s) => (
          <button
            key={s}
            className="rounded-full border border-cyan-400/25 bg-cyan-400/[0.05] px-2.5 py-1 text-[9px] text-cyan-200 hover:border-cyan-400/60 hover:bg-cyan-400/10 transition-all"
            onClick={() => {
              queuePrompt(s);
              navHash("/chat");
            }}
          >
            {s.length > 42 ? `${s.slice(0, 42)}…` : s}
          </button>
        ))}
      </div>

      {/* 2. Main Area Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-6">
          {children}
        </div>

        {/* Sidebar: 4. Tasks & 5. Notifications */}
        <div className="space-y-6">
          {/* Pending Department Tasks */}
          <GlassCard>
            <SectionTitle title="Department Tasks" subtitle={`Pending work for ${departmentName}`} />
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {deptTasks.length === 0 ? (
                <p className="text-xs text-slate-500 py-3 text-center">No pending tasks for this department.</p>
              ) : (
                deptTasks.map((t) => (
                  <div key={t.id} className="p-2.5 rounded-lg border border-white/5 bg-white/[0.02] text-xs space-y-1">
                    <div className="flex items-center justify-between font-mono text-[10px]">
                      <span className="text-cyan-300 font-bold">{t.id}</span>
                      <span className="text-amber-300">{t.status}</span>
                    </div>
                    <div className="font-semibold text-white leading-snug">{t.title}</div>
                    <div className="text-[10px] text-slate-400">Created by {t.createdBy}</div>
                  </div>
                ))
              )}
            </div>
          </GlassCard>

          {/* Department Notifications */}
          <GlassCard>
            <SectionTitle title="Department Alerts" subtitle={`Relevant to ${departmentName}`} />
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {deptNotifications.length === 0 ? (
                <p className="text-xs text-slate-500 py-3 text-center">No open alerts for this workspace.</p>
              ) : (
                deptNotifications.map((n) => (
                  <div key={n.id} className={cn("rounded-lg border p-2 text-xs space-y-1", DEPT_SEVERITY[n.severity] ?? DEPT_SEVERITY.info)}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn("text-[9px] font-bold uppercase tracking-wider", n.severity === "critical" ? "text-red-300" : n.severity === "high" ? "text-amber-300" : n.severity === "normal" ? "text-cyan-300" : "text-slate-500")}>
                        {n.severity}
                      </span>
                      <button className="text-[9px] text-slate-400 hover:text-white font-semibold" onClick={() => acknowledgeNotification(n.id)}>
                        Ack
                      </button>
                    </div>
                    <div className="font-semibold text-white leading-snug">{n.title}</div>
                    <div className="text-[10px] text-slate-400 leading-snug">{n.detail}</div>
                  </div>
                ))
              )}
            </div>
          </GlassCard>

          {/* Quick Actions */}
          <GlassCard>
            <SectionTitle title="Department Quick Actions" subtitle="Standard workflows" />
            <div className="space-y-2">
              <button className="btn-ghost w-full justify-start text-xs" onClick={() => toast.info(`${departmentName} Queue Refreshed`)}>
                <Clock size={14} className="text-cyan-400" /> Refresh Live Queue
              </button>
              <button className="btn-ghost w-full justify-start text-xs" onClick={() => toast.success(`${departmentName} Audit Log Exported`)}>
                <CheckCircle2 size={14} className="text-emerald-400" /> Export Shift Audit
              </button>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
