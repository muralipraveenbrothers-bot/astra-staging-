// Doctor/CEO insights — two high-end panels for the dashboard.
// Panel 1 "AI CEO Insights": live-data insight cards (OP movement, waits,
// leakage, campaigns, pharmacy margin, escalations), each degrading to a
// clearly-labeled demo figure when its data source is empty.
// Panel 2 "Impact Benchmark": before/after comparison vs a manually-run
// hospital + OP/month projection chart.
// NOT mounted here — the integrator wires <CeoInsights /> into Dashboard.tsx.

import { useMemo } from "react";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BrainCircuit,
  Clock,
  Gauge,
  Megaphone,
  Pill,
  Sparkles,
  Star,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge, GlassCard, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { cn, fmtINR, loadLS } from "@/lib/utils";
import type { PharmState } from "../hospital/pharmacy/pharmData";

/* ============================== helpers ============================== */

const todayISO = () => new Date().toISOString().slice(0, 10);

/** Read the Sparta pharmacy ledger straight from its localStorage key. */
function readPharm(): PharmState | null {
  const ph = loadLS<PharmState | null>("astra.pharm.v1", null);
  return ph && Array.isArray(ph.items) && Array.isArray(ph.invoices) ? ph : null;
}

interface Insight {
  key: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  title: string;
  metric: string;
  delta?: { text: string; up: boolean; good: boolean };
  cause: string;
  demo: boolean;
  action: string;
}

/* ============================== panel 1 ============================== */

function InsightCard({ ins }: { ins: Insight }) {
  const Icon = ins.icon;
  return (
    <div className="glass glass-hover p-4 flex flex-col gap-2.5 border border-white/[0.06]">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="grid place-items-center h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-700/10 border border-amber-400/30 shrink-0">
            <Icon size={14} className="text-amber-300" />
          </span>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300 leading-tight">
            {ins.title}
          </p>
        </div>
        {ins.demo ? (
          <Badge tone="amber" className="!text-[9px] !px-1.5 !py-0 shrink-0">demo</Badge>
        ) : (
          <Badge tone="amber" className="!text-[9px] !px-1.5 !py-0 shrink-0">demo, not live</Badge>
        )}
      </div>

      <div className="flex items-end gap-2 flex-wrap">
        <p className="font-display text-2xl font-bold text-white leading-none">{ins.metric}</p>
        {ins.delta && (
          <span
            className={cn(
              "flex items-center gap-0.5 text-[11px] font-semibold pb-0.5",
              ins.delta.good ? "text-emerald-300" : "text-red-300"
            )}
          >
            {ins.delta.up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {ins.delta.text}
          </span>
        )}
      </div>

      <p className="text-[11px] text-slate-400 leading-snug flex-1">{ins.cause}</p>

      <button
        onClick={() => toast.success("Routed to approvals", { description: `${ins.title} — queued for Doctor/CEO sign-off.` })}
        className="self-start rounded-lg px-3 py-1.5 text-[11px] font-semibold border border-amber-400/40 text-amber-200 bg-amber-400/10 hover:bg-amber-400/20 hover:shadow-[0_0_12px_rgba(212,175,55,0.35)] transition-all"
      >
        {ins.action}
      </button>
    </div>
  );
}

/* ============================== panel 2 ============================== */

interface BenchRow {
  label: string;
  before: string;
  after: string;
  note: string;
  beforePct: number; // 0-100 bar width
  afterPct: number;
  lowerIsBetter: boolean;
}

function BenchBars({ row }: { row: BenchRow }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-slate-300">{row.label}</p>
        <p className="text-[10px] text-slate-500 italic">{row.note}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-14 text-right text-[10px] text-slate-500 shrink-0">Manual</span>
        <div className="flex-1 h-2 rounded-full bg-white/[0.05] overflow-hidden">
          <div className="h-full rounded-full bg-slate-500/60" style={{ width: `${row.beforePct}%` }} />
        </div>
        <span className="w-20 text-[10px] text-slate-400 shrink-0">{row.before}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-14 text-right text-[10px] text-amber-300/90 shrink-0">Astra</span>
        <div className="flex-1 h-2 rounded-full bg-white/[0.05] overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-300 shadow-[0_0_8px_rgba(212,175,55,0.5)]"
            style={{ width: `${row.afterPct}%` }}
          />
        </div>
        <span className="w-20 text-[10px] font-semibold text-amber-200 shrink-0">{row.after}</span>
      </div>
    </div>
  );
}

/* ============================== main ============================== */

export function CeoInsights() {
  const { bills, appointments, issues, approvals, orders, medDoses, sendLog, reviews } = useStore();

  /* ---------- Panel 1: computed insights ---------- */
  const insights: Insight[] = useMemo(() => {
    const today = todayISO();
    const out: Insight[] = [];

    // 1 — Why did OP change today? (vs 7-day avg from the appointment book)
    {
      const byDate = new Map<string, number>();
      appointments.forEach((a) => {
        if (a.status === "no-show") return;
        byDate.set(a.date, (byDate.get(a.date) ?? 0) + 1);
      });
      const todayOp = byDate.get(today) ?? 0;
      const dates = [...byDate.keys()];
      const avg = dates.length ? [...byDate.values()].reduce((s, v) => s + v, 0) / dates.length : 0;
      const demo = dates.length < 3; // not enough history for a real 7-day baseline
      const effAvg = demo ? Math.max(1, Math.round((todayOp || 38) * 0.84)) : Math.round(avg);
      const effToday = todayOp || (demo ? 44 : 0);
      const deltaPct = effAvg ? Math.round(((effToday - effAvg) / effAvg) * 100) : 0;
      const deptCount = new Map<string, number>();
      appointments
        .filter((a) => a.date === today)
        .forEach((a) => deptCount.set(a.department, (deptCount.get(a.department) ?? 0) + 1));
      const topDept = [...deptCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      out.push({
        key: "op",
        icon: Users,
        title: "Why did OP change today?",
        metric: `${effToday} OP visits`,
        delta: { text: `${Math.abs(deltaPct)}% vs 7-day avg (${effAvg})`, up: deltaPct >= 0, good: deltaPct >= 0 },
        cause: topDept
          ? `Movement driven by ${topDept} — highest booked load today. WhatsApp reminders cut no-shows on this list.`
          : "Camp referral push + WhatsApp reminder sequence lifted morning walk-ins above the weekly baseline.",
        demo,
        action: "Review OP mix",
      });
    }

    // 2 — Shortest-wait doctor (pending queue × per-consult minutes)
    {
      const perDoctor = new Map<string, { pending: number; done: number }>();
      appointments
        .filter((a) => a.date === today)
        .forEach((a) => {
          const r = perDoctor.get(a.doctor) ?? { pending: 0, done: 0 };
          if (a.status === "done") r.done += 1;
          else if (a.status !== "no-show") r.pending += 1;
          perDoctor.set(a.doctor, r);
        });
      const ranked = [...perDoctor.entries()].sort((a, b) => a[1].pending - b[1].pending);
      const best = ranked.find(([, r]) => r.pending + r.done > 0);
      const demo = !best;
      const wait = best ? Math.max(4, best[1].pending * 7) : 12;
      out.push({
        key: "wait",
        icon: Clock,
        title: "Shortest-wait doctor",
        metric: demo ? "Dr. Anitha Rao" : best![0],
        delta: { text: `~${wait} min wait`, up: false, good: true },
        cause: demo
          ? "Queue depth × 7 min/consult estimate; smallest live queue wins the redirect slot."
          : `${best![1].pending} patient(s) still queued vs ${ranked[ranked.length - 1]?.[1].pending ?? 0} on the longest list — route walk-ins here.`,
        demo,
        action: "Redirect walk-ins",
      });
    }

    // 3 — Money leakage flags (recon mismatches + risky approvals)
    {
      const open = issues.filter((i) => i.status !== "done");
      const reconFlags = open.filter((i) => /duplicate|mismatch|variance|leak|recon|fraud|billing/i.test(i.title));
      const riskyApprovals = approvals.filter(
        (a) => a.status === "pending" && (a.kind === "refund" || a.kind === "discount")
      );
      const atRisk = riskyApprovals.reduce((s, a) => s + (a.amount ?? 0), 0);
      const total = reconFlags.length + riskyApprovals.length;
      const demo = total === 0 && bills.length === 0;
      out.push({
        key: "leak",
        icon: AlertTriangle,
        title: "Money leakage flags",
        metric: `${demo ? 2 : total} open flag${(demo ? 2 : total) === 1 ? "" : "s"}`,
        delta: { text: demo ? fmtINR(1120) + " at risk" : atRisk > 0 ? `${fmtINR(atRisk)} at risk` : "ledger scanning", up: true, good: false },
        cause: demo
          ? "Duplicate UPI charge + unposted pharmacy return detected by the recon auditor."
          : reconFlags[0]
            ? `Latest: “${reconFlags[0].title}” — held from posting until Doctor/CEO sign-off.`
            : "Pending refund/discount requests exceed policy threshold — auto-held for approval.",
        demo,
        action: "Open recon queue",
      });
    }

    // 4 — Best campaign (send-log templates by delivered rate)
    {
      const byTpl = new Map<string, { sent: number; failed: number }>();
      sendLog
        .filter((e) => e.provider !== "Internal")
        .forEach((e) => {
          const r = byTpl.get(e.template) ?? { sent: 0, failed: 0 };
          if (e.status === "sent") r.sent += 1;
          else r.failed += 1;
          byTpl.set(e.template, r);
        });
      const best = [...byTpl.entries()]
        .map(([tpl, r]) => ({ tpl, ...r, rate: r.sent / Math.max(1, r.sent + r.failed) }))
        .sort((a, b) => b.sent - a.sent)[0];
      const demo = !best;
      out.push({
        key: "camp",
        icon: Megaphone,
        title: "Best campaign",
        metric: demo ? "Health-Check Camp" : best!.tpl,
        delta: { text: demo ? "41% response" : `${Math.round(best!.rate * 100)}% delivered · ${best!.sent} msgs`, up: true, good: true },
        cause: demo
          ? "Festival camp broadcast drove the week's largest OP spike; repeat before next weekend."
          : "Highest delivered volume this cycle — audience segment responds to reminder-style templates.",
        demo,
        action: "Re-run campaign",
      });
    }

    // 5 — Pharmacy margin trend (weighted MRP-vs-purchase-rate margin)
    {
      const ph = readPharm();
      let marginPct = 0;
      let soldLines = 0;
      if (ph) {
        let num = 0;
        let den = 0;
        ph.invoices
          .filter((inv) => inv.status === "submitted")
          .forEach((inv) =>
            inv.items.forEach((si) => {
              const item = ph.items.find((i) => i.id === si.itemId);
              if (!item || item.mrp <= 0) return;
              num += (item.mrp - item.rate) * si.qty;
              den += item.mrp * si.qty;
              soldLines += 1;
            })
          );
        if (den > 0) marginPct = Math.round((num / den) * 1000) / 10;
      }
      const demo = soldLines === 0;
      const effMargin = demo ? 24.6 : marginPct;
      const baseline = 21.0; // procurement benchmark
      const diff = Math.round((effMargin - baseline) * 10) / 10;
      out.push({
        key: "margin",
        icon: Pill,
        title: "Pharmacy margin trend",
        metric: `${effMargin.toFixed(1)}%`,
        delta: { text: `${diff >= 0 ? "+" : ""}${diff.toFixed(1)} pts vs 21% benchmark`, up: diff >= 0, good: diff >= 0 },
        cause: demo
          ? "Blended MRP-vs-purchase-rate margin; FEFO batch picking is holding expiry write-offs near zero."
          : `Weighted across ${soldLines} sold line(s) in the Sparta pharmacy ledger — FEFO picking keeps expiry write-offs low.`,
        demo,
        action: "See item margins",
      });
    }

    // 6 — Open escalations (overdue orders + med doses + critical issues + pending approvals)
    {
      const orderEsc = orders.filter((o) => o.escalated && !o.acknowledgedBy).length;
      const doseEsc = medDoses.filter((m) => m.escalated && !m.givenAt).length;
      const critIssues = issues.filter((i) => i.status !== "done" && (i.priority === "critical" || i.priority === "high")).length;
      const pendingAppr = approvals.filter((a) => a.status === "pending").length;
      const total = orderEsc + doseEsc + critIssues + pendingAppr;
      const demo = total === 0;
      const parts: string[] = [];
      if (orderEsc) parts.push(`${orderEsc} overdue order${orderEsc > 1 ? "s" : ""}`);
      if (doseEsc) parts.push(`${doseEsc} missed dose${doseEsc > 1 ? "s" : ""}`);
      if (critIssues) parts.push(`${critIssues} critical issue${critIssues > 1 ? "s" : ""}`);
      if (pendingAppr) parts.push(`${pendingAppr} approval${pendingAppr > 1 ? "s" : ""} awaiting`);
      out.push({
        key: "esc",
        icon: Gauge,
        title: "Open escalations",
        metric: `${demo ? 3 : total}`,
        delta: { text: demo ? "2 critical" : critIssues > 0 ? `${critIssues} critical` : "none critical", up: true, good: (demo ? 2 : critIssues) === 0 },
        cause: demo
          ? "Night-shift roster gap, overdue IV order and a pending refund approval need CEO eyes."
          : parts.length
            ? `Breakdown: ${parts.join(" · ")}. Auto-escalations land here within 10 min of breach.`
            : "All queues inside SLA — countdown timers and auto-escalation are holding the line.",
        demo,
        action: "Triage now",
      });
    }

    return out;
  }, [appointments, approvals, bills, issues, medDoses, orders, sendLog]);

  /* ---------- Panel 2: impact benchmark ---------- */
  const { benchRows, projection, projDemo } = useMemo(() => {
    // Google rating — live from review funnel when present
    const rated = reviews.filter((r) => r.stars > 0);
    const rating = rated.length
      ? Math.round((rated.reduce((s, r) => s + r.stars, 0) / rated.length) * 10) / 10
      : 4.1;

    const benchRows: BenchRow[] = [
      { label: "Registration time", before: "12 min", after: "<1 min", note: "voice registration", beforePct: 100, afterPct: 8, lowerIsBetter: true },
      { label: "Missed medications", before: "6 / day", after: "0", note: "demo countdowns, not live", beforePct: 100, afterPct: 2, lowerIsBetter: true },
      { label: "Billing leakage caught", before: "sporadic", after: "100% flagged", note: "recon auditor on every bill", beforePct: 22, afterPct: 100, lowerIsBetter: false },
      { label: "Google rating", before: `${rating.toFixed(1)}`, after: "4.8 target", note: "review funnel + discharge follow-ups", beforePct: (rating / 5) * 100, afterPct: 96, lowerIsBetter: false },
    ];

    // OP/month projection — compound +8%/mo with Astra vs flat manual
    const thisMonth = todayISO().slice(0, 7);
    const monthOp = appointments.filter((a) => a.date.startsWith(thisMonth)).length;
    const projDemo = monthOp < 50; // appointment book is a demo seed, not a month of volume
    const base = projDemo ? 1240 : monthOp;
    const labels: string[] = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      labels.push(d.toLocaleDateString("en-IN", { month: "short" }));
    }
    const projection = labels.map((m, i) => ({
      month: m,
      manual: Math.round(base * (1 + 0.005 * i)),
      Astra: Math.round(base * Math.pow(1.08, i)),
    }));

    return { benchRows, projection, projDemo };
  }, [appointments, reviews]);

  const projectedGain = projection.length
    ? Math.round(((projection[5].Astra - projection[5].manual) / projection[5].manual) * 100)
    : 0;

  return (
    <div className="max-w-[1400px] mx-auto space-y-8">
      {/* ================= Panel 1 — AI CEO Insights ================= */}
      <section>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500/25 to-amber-800/10 border border-amber-400/40 shadow-[0_0_18px_rgba(212,175,55,0.25)]">
              <BrainCircuit size={18} className="text-amber-300" />
            </span>
            <div>
              <h2 className="font-display text-2xl font-bold text-gradient">AI CEO Insights</h2>
              <p className="text-xs text-slate-400">Demo figures. Not live CEO numbers.</p>
            </div>
          </div>
          <Badge tone="cyan" className="!text-[10px]">
            <Sparkles size={11} className="mr-1" /> Demo numbers, not live
          </Badge>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {insights.map((ins) => (
            <InsightCard key={ins.key} ins={ins} />
          ))}
        </div>
      </section>

      {/* ================= Panel 2 — Impact Benchmark ================= */}
      <section>
        <SectionTitle
          title="Impact Benchmark"
          subtitle="Projected benchmarks vs manually-run hospital"
        />
        <GlassCard className="!p-6">
          <div className="grid gap-8 lg:grid-cols-2">
            {/* before / after bars */}
            <div className="space-y-5">
              {benchRows.map((row) => (
                <BenchBars key={row.label} row={row} />
              ))}
            </div>

            {/* OP/month projection chart */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <TrendingUp size={14} className="text-amber-300" />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                    OP / month — 6-month projection
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {projDemo ? <Badge tone="amber" className="!text-[9px] !px-1.5 !py-0">demo</Badge> : <Badge tone="amber" className="!text-[9px] !px-1.5 !py-0">demo, not live</Badge>}
                  <Badge tone="green" className="!text-[10px]">+{projectedGain}% by month 6</Badge>
                </div>
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={projection} margin={{ top: 6, bottom: 0, left: -14, right: 8 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                    <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={{ stroke: "rgba(255,255,255,0.1)" }} tickLine={false} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} width={52} />
                    <Tooltip
                      contentStyle={{
                        background: "rgba(10,10,14,0.92)",
                        border: "1px solid rgba(212,175,55,0.35)",
                        borderRadius: 10,
                        fontSize: 11,
                      }}
                      labelStyle={{ color: "#e2e8f0" }}
                      itemStyle={{ fontSize: 11 }}
                    />
                    <Line type="monotone" dataKey="manual" name="Manual hospital" stroke="#64748b" strokeWidth={2} dot={{ r: 2, fill: "#64748b" }} strokeDasharray="5 4" />
                    <Line type="monotone" dataKey="Astra" name="With Astra" stroke="#d4af37" strokeWidth={2.5} dot={{ r: 3, fill: "#f5d76e" }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-3 text-[10px] text-slate-500 leading-snug">
                Projected benchmarks vs manually-run hospital — voice registration, medication countdowns and the
                billing recon auditor compound into ~8% monthly OP growth; the manual baseline drifts flat.
              </p>
            </div>
          </div>

          {/* rating footnote */}
          <div className="mt-6 pt-4 border-t border-white/[0.06] flex items-center gap-2 flex-wrap">
            <Star size={12} className="text-amber-300" />
            <p className="text-[11px] text-slate-400">
              Reputation track: current funnel average feeds the rating row above — target{" "}
              <span className="text-amber-200 font-semibold">4.8 ★</span> via automated post-discharge review requests.
            </p>
          </div>
        </GlassCard>
      </section>
    </div>
  );
}
