// Astra AI — Unified Notification Center.
// One intelligent, role-aware notification system:
//   Critical / High / Normal / Informational
//   VIEW → ACKNOWLEDGE → ACT → RESOLVE
// Only notifications relevant to the signed-in role are shown.

import { useState } from "react";
import { ArrowRight, BellRing, CheckCheck, Eye, ShieldAlert } from "lucide-react";
import { Badge, GlassCard, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import {
  notificationAppliesTo,
  SEVERITY_LABEL,
  type HospitalNotification,
  type NotificationSeverity,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";
import { navHash } from "@/lib/hashRoute";

const SEVERITY_TABS: (NotificationSeverity | "all")[] = ["all", "critical", "high", "normal", "info"];

const SEVERITY_CARD: Record<NotificationSeverity, string> = {
  critical: "border-red-400/40 bg-red-400/[0.06]",
  high: "border-amber-400/35 bg-amber-400/[0.05]",
  normal: "border-cyan-400/25 bg-cyan-400/[0.04]",
  info: "border-white/10 bg-white/[0.02]",
};

const SEVERITY_BADGE: Record<NotificationSeverity, "red" | "amber" | "cyan" | "neutral"> = {
  critical: "red",
  high: "amber",
  normal: "cyan",
  info: "neutral",
};

export function NotificationCenter() {
  const { notifications, acknowledgeNotification, actNotification, resolveNotification } = useStore();
  const { account } = useAuth();
  const [severity, setSeverity] = useState<NotificationSeverity | "all">("all");
  const [status, setStatus] = useState<"open" | "resolved" | "all">("open");

  const role = account?.role ?? "ceo";
  const mine = notifications
    .filter((n) => notificationAppliesTo(n, role))
    .sort((a, b) => b.createdTs - a.createdTs);

  const filtered = mine.filter((n) => {
    if (severity !== "all" && n.severity !== severity) return false;
    if (status === "open" && n.status === "RESOLVED") return false;
    if (status === "resolved" && n.status !== "RESOLVED") return false;
    return true;
  });

  const counts = {
    critical: mine.filter((n) => n.severity === "critical" && n.status !== "RESOLVED").length,
    high: mine.filter((n) => n.severity === "high" && n.status !== "RESOLVED").length,
    normal: mine.filter((n) => n.severity === "normal" && n.status !== "RESOLVED").length,
    open: mine.filter((n) => n.status !== "RESOLVED").length,
  };

  const step = (n: HospitalNotification) => {
    if (n.status === "NEW") acknowledgeNotification(n.id);
    if (n.status === "ACKNOWLEDGED") actNotification(n.id);
    if (n.status === "ACTED") resolveNotification(n.id);
  };

  const stepLabel = (n: HospitalNotification) =>
    n.status === "NEW" ? "Acknowledge" : n.status === "ACKNOWLEDGED" ? "Mark acted" : n.status === "ACTED" ? "Resolve" : "Resolved";

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl font-bold text-gradient">Notification Center</h1>
            <Badge tone="cyan">{counts.open} open</Badge>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Role-aware intelligence feed · {role.toUpperCase()} · VIEW → ACKNOWLEDGE → ACT → RESOLVE
          </p>
        </div>
      </div>

      {/* severity summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(["critical", "high", "normal", "info"] as NotificationSeverity[]).map((sev) => (
          <GlassCard key={sev} className="!p-4 border-white/5">
            <div className="flex items-center justify-between">
              <span className={cn("text-[10px] uppercase tracking-wider font-semibold", sev === "critical" ? "text-red-300" : sev === "high" ? "text-amber-300" : sev === "normal" ? "text-cyan-300" : "text-slate-400")}>
                {SEVERITY_LABEL[sev]}
              </span>
              {sev === "critical" && <ShieldAlert size={13} className="text-red-400" />}
            </div>
            <div className="text-2xl font-bold font-mono mt-1 text-white">{mine.filter((n) => n.severity === sev && n.status !== "RESOLVED").length}</div>
            <div className="text-[10px] text-slate-500">open</div>
          </GlassCard>
        ))}
      </div>

      {/* filters */}
      <div className="glass p-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400">Severity:</span>
        {SEVERITY_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setSeverity(s)}
            className={cn(
              "rounded-full px-3 py-1 text-[11px] font-semibold border transition-all",
              severity === s
                ? s === "critical"
                  ? "border-red-400/60 bg-red-400/15 text-red-200"
                  : s === "high"
                    ? "border-amber-400/60 bg-amber-400/15 text-amber-200"
                    : "border-white/30 bg-white/10 text-white"
                : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white"
            )}
          >
            {s === "all" ? "All" : SEVERITY_LABEL[s]}
          </button>
        ))}
        <span className="text-xs text-slate-400 ml-4">Status:</span>
        {(["open", "resolved", "all"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={cn(
              "rounded-full px-3 py-1 text-[11px] font-semibold border transition-all capitalize",
              status === s ? "border-white/30 bg-white/10 text-white" : "border-white/10 bg-white/[0.03] text-slate-400 hover:text-white"
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {/* feed */}
      <GlassCard>
        <SectionTitle title="Intelligence Feed" subtitle="Escalation-aware, filtered to your role" />
        {filtered.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">No notifications match the current filters — you're all caught up.</p>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((n) => (
              <div key={n.id} className={cn("rounded-xl border p-4", SEVERITY_CARD[n.severity])}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge tone={SEVERITY_BADGE[n.severity]} className="!text-[9px]">{SEVERITY_LABEL[n.severity]}</Badge>
                    <Badge tone="neutral" className="!text-[9px] font-mono">{n.status}</Badge>
                    {n.sourceDept && <Badge tone="violet" className="!text-[9px]">{n.sourceDept}</Badge>}
                    <span className="text-[10px] text-slate-500 font-mono">{n.createdAt}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {n.status !== "RESOLVED" && (
                      <button className="btn-ghost !py-1 !px-2.5 !text-[10px]" onClick={() => step(n)}>
                        <Eye size={11} /> {stepLabel(n)}
                      </button>
                    )}
                    {n.actionRoute && n.status !== "RESOLVED" && (
                      <button
                        className="btn-neon !py-1 !px-2.5 !text-[10px]"
                        onClick={() => navHash(n.actionRoute!)}
                      >
                        {n.actionLabel ?? "Act now"} <ArrowRight size={11} />
                      </button>
                    )}
                    {n.status !== "RESOLVED" && (
                      <button className="btn-ghost !py-1 !px-2 !text-[10px] !border-red-400/30 !text-red-300" title="Resolve" onClick={() => resolveNotification(n.id)}>
                        <CheckCheck size={11} />
                      </button>
                    )}
                  </div>
                </div>
                <h3 className="text-sm font-semibold text-white mt-2">{n.title}</h3>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">{n.detail}</p>
                {(n.linkedPatient || n.linkedUhid) && (
                  <p className="text-[10px] text-cyan-300 mt-2">
                    Patient: {n.linkedPatient}{n.linkedUhid ? ` (${n.linkedUhid})` : ""}
                  </p>
                )}
                {n.status !== "NEW" && (n.acknowledgedAt || n.actedAt || n.resolvedAt) && (
                  <p className="text-[9px] text-slate-500 mt-2 font-mono">
                    {(["acknowledgedAt", "actedAt", "resolvedAt"] as const).filter((k) => n[k]).map((k) => `${k.replace("At", "").toUpperCase()} ${n[k]}`).join(" · ")}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <div className="flex items-center gap-2 text-[10px] text-slate-500">
        <BellRing size={12} className="text-amber-300" />
        Notifications are role-aware: critical values escalate to doctors, stock alerts to pharmacy, revenue flags to finance — one feed, every department.
      </div>
    </div>
  );
}
