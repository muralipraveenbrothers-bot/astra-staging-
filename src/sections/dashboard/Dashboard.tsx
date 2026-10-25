import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BedDouble,
  Clock,
  Copy,
  IndianRupee,
  Link2,
  Stethoscope,
  Users,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
} from "recharts";
import { Badge, CountUp, GlassCard, ProgressRing, SectionTitle, StatusDot } from "@/components/ui";
import { useStore } from "@/lib/store";
import { kpiSpark } from "@/lib/mock";
import { sleep } from "@/lib/utils";
import { DEPT_ROUTES, deptUrl } from "@/lib/hashRoute";
import { CeoInsights } from "./CeoInsights";

function Spark({ data, color }: { data: number[]; color: string }) {
  const points = data.map((v, i) => ({ i, v }));
  return (
    <div className="h-10 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
          <defs>
            <linearGradient id={`g-${color}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.5} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#g-${color})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const feed = [
  { time: "10:42", text: "Billing Fraud Auditor completed ledger scan — 1 flag raised", tone: "amber" as const },
  { time: "10:31", text: "Dr. Arjun Rao accepted DDx #2 (Viral pharyngitis) for PT-2209", tone: "green" as const },
  { time: "10:18", text: "WhatsApp bill receipt delivered to PT-2214", tone: "cyan" as const },
  { time: "09:58", text: "Attendance anomaly: Vikram Shah clocked in off-geofence", tone: "amber" as const },
];

const alerts = [
  { title: "Cash drawer variance ₹420 (Register vs count)", level: "red" as const },
  { title: "Ward B nurse coverage below ratio tonight", level: "amber" as const },
  { title: "OpenRouter provider degraded — fallback active", level: "amber" as const },
];

export function Dashboard() {
  const { services, departments, checkService, discharged, orders, medDoses, appointments } = useStore();
  const [testing, setTesting] = useState<string | null>(null);
  const [liveOverview, setLiveOverview] = useState<any>(null);
  useEffect(() => { let cancelled = false; const load = async () => { try { const r = await fetch("/api/command-center/overview"); if (!r.ok) return; const body = await r.json(); if (!cancelled) setLiveOverview(body); } catch { /* retain local deck if API is unavailable */ } }; void load(); const timer = window.setInterval(load, 30_000); return () => { cancelled = true; window.clearInterval(timer); }; }, []);

  const testService = async (id: string, name: string) => {
    setTesting(id);
    if (id === "freellmapi" || id === "ollama") {
      const r = await checkService(id as "freellmapi" | "ollama");
      setTesting(null);
      if (r?.ok) toast.success(`Connected - ${name}`, { description: `Real handshake. ${r.latencyMs}ms. ${r.modelCount ?? 0} models.` });
      else toast.error(`✗ ${name} unreachable`, { description: r?.error ?? "unknown error" });
      return;
    }
    await sleep(800);
    setTesting(null);
    toast.info(`No handshake was made for ${name}. This button only waits and does not contact that service.`);
  };

  const kpis = [
    { label: "OP Visits Today", value: 134, icon: Stethoscope, color: "#39d5ff", spark: kpiSpark.opVisits, delta: "+12% vs yesterday", sample: true },
    { label: "IP Census", value: 38 - discharged.length, icon: BedDouble, color: "#d4af37", spark: kpiSpark.ipCensus, delta: discharged.length ? `${discharged.length} bed(s) freed today` : "86% occupancy", sample: true },
    { label: "Collections Today", value: 93600, prefix: "₹", icon: IndianRupee, color: "#f5d97e", spark: kpiSpark.collections, delta: "+18% vs avg", sample: true },
    { label: "Avg Wait Time", value: 14, suffix: " min", icon: Clock, color: "#34d399", spark: kpiSpark.waitTime, delta: "▼ 36% this week", sample: true },
    { label: "Staff On Duty", value: 36, icon: Users, color: "#fbbf24", spark: [30, 32, 34, 33, 35, 36, 36], delta: "of 42 scheduled", sample: true },
    { label: "Active Alerts", value: 3, icon: AlertTriangle, color: "#f87171", spark: [1, 2, 2, 3, 2, 4, 3], delta: "1 critical", sample: true },
  ];

  const copyDeptLink = async (path: string) => {
    const url = deptUrl(path);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Department link copied", { description: url });
    } catch {
      window.prompt("Copy this department link:", url);
    }
  };

  const todayISO = new Date().toISOString().slice(0, 10);
  const queueTiles = [
    { label: "Pharmacy queue", hint: "orders to dispense", count: orders.filter((o) => (o.targetDept ?? "Ward") === "Pharmacy" && !o.acknowledgedAt).length, href: "#/pharmacy", hot: false },
    { label: "Ward instructions", hint: "orders to execute", count: orders.filter((o) => (o.targetDept ?? "Ward") === "Ward" && !o.acknowledgedAt).length, href: "#/ward", hot: false },
    { label: "Overdue doses", hint: "medication board", count: medDoses.filter((d) => !d.givenAt && d.dueTs < Date.now()).length, href: "#/ward", hot: true },
    { label: "Lab queue", hint: "tests to process", count: orders.filter((o) => o.targetDept === "Lab" && !o.acknowledgedAt).length, href: "#/lab", hot: false },
    { label: "Check-ins due", hint: "today's appointments", count: appointments.filter((a) => a.date === todayISO && a.status === "booked").length, href: "#/appointments", hot: false },
  ];

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* hero */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-gradient">Command Deck</h1>
          <p className="text-sm text-slate-400 mt-1">
            Hospital-wide telemetry · {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
          </p>
        </div>
        <Badge tone="cyan"><Zap size={11} /> All systems nominal</Badge>
      </div>
      {liveOverview && <GlassCard className="!p-3 border-cyan-500/20"><div className="flex flex-wrap gap-4 text-xs text-slate-300"><span>Live orders: <b className="text-white">{liveOverview.orders?.summary?.total ?? liveOverview.orders?.orders?.length ?? 0}</b></span><span>Unread: <b className="text-amber-300">{liveOverview.notifications?.unread ?? 0}</b></span><span>Critical alerts: <b className="text-rose-300">{liveOverview.clinical?.openCriticalAlerts ?? 0}</b></span><span>Outstanding: <b className="text-cyan-300">₹{Number(liveOverview.billing?.outstanding ?? 0).toLocaleString("en-IN")}</b></span></div></GlassCard>}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map((k) => (
          <GlassCard key={k.label} hover className="!p-4">
            <div className="flex items-center justify-between">
              <k.icon size={17} style={{ color: k.color }} />
              <Spark data={k.spark} color={k.color} />
            </div>
            <div className="mt-3 text-2xl font-bold text-white font-display">
              <CountUp to={k.value} prefix={k.prefix ?? ""} suffix={k.suffix ?? ""} />
            </div>
            <div className="text-xs text-slate-400 mt-0.5">{k.label}</div>
            <div className="text-[10px] mt-1" style={{ color: k.color }}>{k.delta}</div>
            {k.sample ? <div className="text-[10px] font-semibold text-amber-300 mt-1">Sample numbers, not live</div> : null}
          </GlassCard>
        ))}
      </div>

      {/* department deep-links + live queues */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <GlassCard>
          <SectionTitle title="Department URLs" subtitle="Shareable Astra deep links per workspace" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {DEPT_ROUTES.map((r) => (
              <div key={r.path} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
                <Link2 size={12} className="text-neon-cyan shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-white truncate">{r.label}</p>
                  <a href={`#${r.path}`} className="text-[10px] font-mono text-cyan-300/80 hover:text-cyan-200 truncate block">#{r.path}</a>
                </div>
                <button
                  className="btn-ghost !p-1.5 shrink-0"
                  title={`Copy ${r.label} link`}
                  onClick={() => void copyDeptLink(r.path)}
                >
                  <Copy size={11} />
                </button>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard>
          <SectionTitle title="Department Queues" subtitle="Live pending counts — click to jump in" />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {queueTiles.map((q) => (
              <a
                key={q.label}
                href={q.href}
                className="rounded-lg border border-white/10 bg-white/[0.03] p-3 hover:border-violet-400/40 hover:bg-violet-500/[0.06] transition-colors block"
              >
                <p className={`text-2xl font-bold tabular-nums ${q.count > 0 ? q.hot ? "text-red-300 animate-pulse" : "text-yellow-300" : "text-emerald-300"}`}>
                  {q.count}
                </p>
                <p className="text-[11px] text-slate-300 mt-0.5">{q.label}</p>
                <p className="text-[9px] text-slate-600">{q.hint}</p>
              </a>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* AI CEO insights + impact benchmark */}
      <CeoInsights />

      {/* system status */}
      <div>
        <SectionTitle title="Subsystem Mesh" subtitle="Live connectors to the Astra backend stack" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {services.map((s) => (
            <GlassCard key={s.id} hover>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusDot status={s.status} />
                  <span className="font-semibold text-white text-sm">{s.name}</span>
                </div>
                <Badge tone={s.status === "healthy" ? "green" : s.status === "issues" ? "amber" : "red"}>{s.status}</Badge>
              </div>
              <div className="mt-3 text-xs font-mono text-neon-cyan/80 break-all">{s.baseUrl}</div>
              <div className="text-xs text-slate-500 mt-1">{s.detail}</div>
              <div className="flex items-center justify-between mt-4">
                <span className="text-xs text-slate-400">
                  latency <span className="text-white font-semibold">{s.latencyMs}ms</span>
                </span>
                <button
                  className="btn-ghost !py-1 !px-3 !text-xs"
                  disabled={testing === s.id}
                  onClick={() => void testService(s.id, s.name)}
                >
                  {testing === s.id ? (
                    <>
                      <span className="h-3 w-3 rounded-full border-2 border-neon-cyan border-t-transparent animate-spin" />
                      Pinging…
                    </>
                  ) : (
                    "Test"
                  )}
                </button>
              </div>
            </GlassCard>
          ))}
        </div>
      </div>

      {/* dept health + feed/alerts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <GlassCard className="xl:col-span-1">
          <SectionTitle title="Department Health" />
          <div className="space-y-4">
            {departments.map((d, i) => {
              const val = [88, 72, 93][i % 3];
              return (
                <div key={d.id} className="flex items-center gap-4">
                  <ProgressRing value={val} color={d.color} size={58} />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-white">{d.name}</div>
                    <div className="text-xs text-slate-500">Head: {d.head} · {d.staffCount} staff</div>
                  </div>
                  <Activity size={15} style={{ color: d.color }} />
                </div>
              );
            })}
          </div>
        </GlassCard>

        <GlassCard className="xl:col-span-1">
          <SectionTitle title="Recent Activity" />
          <div className="space-y-3">
            {feed.map((f, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <StatusDot status={f.tone === "green" ? "healthy" : "issues"} className="mt-1" />
                <div>
                  <p className="text-xs text-slate-300 leading-snug">{f.text}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{f.time}</p>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="xl:col-span-1 border !border-red-400/20">
          <SectionTitle title="Alerts" subtitle="Sample numbers, not live" />
          <div className="space-y-3">
            {alerts.map((a, i) => (
              <div
                key={i}
                className="flex items-start gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] p-3"
              >
                <AlertTriangle size={15} className={a.level === "red" ? "text-red-400 mt-0.5" : "text-amber-400 mt-0.5"} />
                <div className="flex-1">
                  <p className="text-xs text-slate-200 leading-snug">{a.title}</p>
                </div>
                <button
                  className="text-[10px] text-neon-cyan hover:underline shrink-0"
                  onClick={() => toast.info("Nothing was sent. This alert stays on the screen.")}
                >
                  Route
                </button>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
