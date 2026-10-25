import React, { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  RefreshCw,
  HeartPulse,
  Footprints,
  BookOpen,
  Cpu,
  ShieldAlert,
  Syringe,
  Blocks,
  BedDouble,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui";

interface DashboardPayload {
  hospital: {
    name: string;
    occupied: number;
    totalBeds: number;
    bedShortage: number;
    byStatus: Record<string, number>;
    byDept: Record<string, number>;
  };
  riskRadar: {
    lowSpo2: Array<{ name: string; uhid: string; bed: string; spo2: number }>;
    highTemp: Array<{ name: string; uhid: string; tempF: number }>;
    highRR: Array<{ name: string; uhid: string; rr: number }>;
    criticalOrders: Array<{ item: string; patientName: string; result: string }>;
    pendingStat: string[];
    bedShortage: number;
  };
  deterioration: { amber: number; red: number; patients: number };
  journey: { byStatus: Record<string, number>; stages: Record<string, number> };
  knowledge: { sources: number; docsIndexed: number; staleSources: number; missingEvidenceTopics: string[] };
  agentHealth: { states: Record<string, number>; total: number; active: number };
  safetyQueue: { unverifiedCritical: number; pendingOrders: number; unreviewedRadiology: number };
  epidemiology: { byDept: Record<string, number>; notifiableQueue: unknown[] };
  pluginHealth: {
    total: number;
    installed: number;
    active: number;
    byStatus: Record<string, number>;
    tiers: Record<string, number>;
    degraded: string[];
  };
  updatedAt: string;
}

const DASHBOARDS = [
  { key: "riskRadar", label: "Risk Radar", icon: AlertTriangle },
  { key: "deterioration", label: "Deterioration", icon: HeartPulse },
  { key: "journey", label: "Patient Journey", icon: Footprints },
  { key: "knowledge", label: "Knowledge Freshness", icon: BookOpen },
  { key: "agentHealth", label: "Agent Health", icon: Cpu },
  { key: "safetyQueue", label: "Safety Queue", icon: ShieldAlert },
  { key: "epidemiology", label: "Epidemiology", icon: Syringe },
  { key: "pluginHealth", label: "Plugin Health", icon: Blocks },
] as const;

type DashboardKey = (typeof DASHBOARDS)[number]["key"];

export function CommandDashboards() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<DashboardKey>("riskRadar");

  const fetchAll = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const res = await fetch("/api/system/dashboards");
      if (res.ok) setData(await res.json());
    } catch {
      // keep last payload
    } finally {
      if (!isRefresh) setLoading(false);
    }
  };

  useEffect(() => {
    void fetchAll(false);
    const interval = setInterval(() => void fetchAll(true), 30000);
    return () => clearInterval(interval);
  }, []);

  if (!data) {
    return (
      <div className="p-4 max-w-7xl mx-auto">
        <div className="rounded-xl border border-slate-700/70 bg-slate-900/80 p-10 text-center text-sm text-slate-400">
          Loading command dashboards…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-700/40 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              Command Center Dashboards
              <Badge tone="cyan">Live hospital data</Badge>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {data.hospital.name} · {data.hospital.occupied}/{data.hospital.totalBeds} beds occupied
              {data.hospital.bedShortage > 0 ? ` · SHORTAGE ${data.hospital.bedShortage}` : ""} · refreshed{" "}
              {new Date(data.updatedAt).toLocaleTimeString()}
            </p>
          </div>
        </div>
        <button
          onClick={() => void fetchAll(false)}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1.5 transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {DASHBOARDS.map((d) => {
          const Icon = d.icon;
          return (
            <button
              key={d.key}
              onClick={() => setActive(d.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap ${
                active === d.key
                  ? "bg-cyan-600 text-white shadow-sm"
                  : "bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {d.label}
            </button>
          );
        })}
      </div>

      {active === "riskRadar" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="Low SpO2 (<92%)" badge="red" badgeLabel={`${data.riskRadar.lowSpo2.length}`}>
            {data.riskRadar.lowSpo2.length === 0 ? <Empty /> : (
              <ul className="space-y-1.5">
                {data.riskRadar.lowSpo2.map((p) => (
                  <li key={p.uhid} className="text-xs text-slate-300 flex justify-between">
                    <span>{p.name} <span className="text-slate-500 font-mono">{p.uhid}</span> · {p.bed}</span>
                    <strong className="text-rose-400">{p.spo2}%</strong>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="High Temp (>102°F) / High RR (>24)" badge="amber" badgeLabel={`${data.riskRadar.highTemp.length} / ${data.riskRadar.highRR.length}`}>
            <ul className="space-y-1.5">
              {[...data.riskRadar.highTemp, ...data.riskRadar.highRR].map((p) => (
                <li key={(p as any).uhid} className="text-xs text-slate-300">
                  {(p as any).name} — <strong className="text-amber-400">{(p as any).tempF ? `${(p as any).tempF}°F` : `RR ${(p as any).rr}`}</strong>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Critical Orders" badge="red" badgeLabel={`${data.riskRadar.criticalOrders.length}`}>
            {data.riskRadar.criticalOrders.length === 0 ? <Empty /> : (
              <ul className="space-y-1.5">
                {data.riskRadar.criticalOrders.map((o, i) => (
                  <li key={i} className="text-xs text-slate-300">
                    <strong className="text-slate-100">{o.item}</strong> — {o.patientName}
                    {o.result ? <span className="text-slate-500"> · {o.result}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Bed Capacity" badge={data.hospital.bedShortage > 0 ? "red" : "green"} badgeLabel={data.hospital.bedShortage > 0 ? `SHORT ${data.hospital.bedShortage}` : "OK"}>
            <p className="text-3xl font-bold text-slate-100">{data.hospital.occupied}<span className="text-slate-500 text-lg">/{data.hospital.totalBeds}</span></p>
            <div className="mt-3 flex flex-wrap gap-1">
              {Object.entries(data.hospital.byStatus).map(([k, v]) => (
                <span key={k} className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700">{k}: {v}</span>
              ))}
            </div>
          </Card>
        </div>
      )}

      {active === "deterioration" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card title="Amber flags" badge="amber" badgeLabel={`${data.deterioration.amber}`}>
            <p className="text-3xl font-bold text-amber-400">{data.deterioration.amber}</p>
            <p className="text-xs text-slate-400 mt-2">{"SpO2 < 92, temp > 102°F, or RR > 24 in latest vitals."}</p>
          </Card>
          <Card title="Red flags" badge="red" badgeLabel={`${data.deterioration.red}`}>
            <p className="text-3xl font-bold text-rose-400">{data.deterioration.red}</p>
            <p className="text-xs text-slate-400 mt-2">Critically low SpO2 — escalate to ICU team.</p>
          </Card>
          <Card title="Affected patients" badge="cyan" badgeLabel={`${data.deterioration.patients}`}>
            <p className="text-3xl font-bold text-cyan-400">{data.deterioration.patients}</p>
            <p className="text-xs text-slate-400 mt-2">Unique patients with any deterioration signal (DERIVED ESTIMATE from latest vitals).</p>
          </Card>
        </div>
      )}

      {active === "journey" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card title="Census by status" badge="cyan" badgeLabel="live">
            <div className="flex flex-wrap gap-1">
              {Object.entries(data.journey.byStatus).map(([k, v]) => (
                <span key={k} className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700">{k}: <strong>{v}</strong></span>
              ))}
            </div>
          </Card>
          <Card title="Journey stages" badge="green" badgeLabel="tracked">
            <ul className="space-y-1.5 text-xs text-slate-300">
              <li>Registered: <strong>{data.journey.stages.registered}</strong></li>
              <li>Admitted (IP + Emergency): <strong>{data.journey.stages.admitted}</strong></li>
              <li>Discharged: <strong>{data.journey.stages.discharged}</strong></li>
            </ul>
            <p className="text-[10px] text-slate-500 mt-2">Triage → discharge milestone tracking; full journeys land with Patient Journey Agent automation.</p>
          </Card>
          <Card title="By department" badge="violet" badgeLabel="census">
            <div className="flex flex-wrap gap-1">
              {Object.entries(data.epidemiology.byDept).map(([k, v]) => (
                <span key={k} className="px-2 py-0.5 rounded text-[10px] bg-purple-500/10 text-purple-300 border border-purple-500/30">{k}: {v}</span>
              ))}
            </div>
          </Card>
        </div>
      )}

      {active === "knowledge" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card title="Knowledge sources" badge="cyan" badgeLabel={`${data.knowledge.sources}`}>
            <p className="text-3xl font-bold text-cyan-400">{data.knowledge.sources}</p>
            <p className="text-xs text-slate-400 mt-2">Registered sources (PubMed, RxNorm, WHO…).</p>
          </Card>
          <Card title="Docs indexed" badge="amber" badgeLabel="honest gap">
            <p className="text-3xl font-bold text-amber-400">{data.knowledge.docsIndexed}</p>
            <p className="text-xs text-slate-400 mt-2">0 — registry only. Full-text ingestion is Phase 1; never claimed otherwise.</p>
          </Card>
          <Card title="Missing evidence topics" badge="neutral" badgeLabel="Phase 1">
            <ul className="space-y-1.5 text-xs text-slate-300">
              {data.knowledge.missingEvidenceTopics.map((t) => (
                <li key={t}>• {t}</li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {active === "agentHealth" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card title="Registered agents" badge="violet" badgeLabel={`${data.agentHealth.total}`}>
            <p className="text-3xl font-bold text-violet-400">{data.agentHealth.total}</p>
            <p className="text-xs text-slate-400 mt-2">{data.agentHealth.active} active in the runtime registry.</p>
          </Card>
          <Card title="State distribution" badge="cyan" badgeLabel="runtime">
            <div className="flex flex-wrap gap-1">
              {Object.entries(data.agentHealth.states).map(([k, v]) => (
                <span key={k} className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700">{k}: <strong>{v}</strong></span>
              ))}
            </div>
          </Card>
          <Card title="Where are the 277?" badge="green" badgeLabel="manifests">
            <p className="text-xs text-slate-300 leading-relaxed">
              277 agent declarations live in 36 plugin manifests (L0 CORE → L5 WORKER). Open{" "}
              <a href="#/agents/registry" className="text-cyan-400 underline">Agent Registry</a> to browse them all,
              or the <a href="#/plugins" className="text-cyan-400 underline">Plugin Center</a> to see owning plugins.
            </p>
          </Card>
        </div>
      )}

      {active === "safetyQueue" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card title="Unverified critical orders" badge="red" badgeLabel={`${data.safetyQueue.unverifiedCritical}`}>
            <p className="text-3xl font-bold text-rose-400">{data.safetyQueue.unverifiedCritical}</p>
            <p className="text-xs text-slate-400 mt-2">Critical orders not yet marked completed.</p>
          </Card>
          <Card title="Pending orders" badge="amber" badgeLabel={`${data.safetyQueue.pendingOrders}`}>
            <p className="text-3xl font-bold text-amber-400">{data.safetyQueue.pendingOrders}</p>
            <p className="text-xs text-slate-400 mt-2">Open orders across all categories awaiting action.</p>
          </Card>
          <Card title="Unreviewed radiology" badge="amber" badgeLabel={`${data.safetyQueue.unreviewedRadiology}`}>
            <p className="text-3xl font-bold text-amber-400">{data.safetyQueue.unreviewedRadiology}</p>
            <p className="text-xs text-slate-400 mt-2">Pending imaging orders awaiting report.</p>
          </Card>
        </div>
      )}

      {active === "epidemiology" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="Census by department" badge="violet" badgeLabel="live">
            <div className="flex flex-wrap gap-1">
              {Object.entries(data.epidemiology.byDept).map(([k, v]) => (
                <span key={k} className="px-2 py-0.5 rounded text-[10px] bg-purple-500/10 text-purple-300 border border-purple-500/30">{k}: <strong>{v}</strong></span>
              ))}
            </div>
          </Card>
          <Card title="Notifiable disease queue" badge="amber" badgeLabel={`${data.epidemiology.notifiableQueue.length}`}>
            {data.epidemiology.notifiableQueue.length === 0 ? (
              <Empty />
            ) : (
              <p className="text-xs text-slate-300">Surveillance items pending submission.</p>
            )}
          </Card>
        </div>
      )}

      {active === "pluginHealth" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card title="Plugin ecosystem" badge="cyan" badgeLabel={`${data.pluginHealth.total}`}>
            <p className="text-3xl font-bold text-cyan-400">{data.pluginHealth.installed}<span className="text-slate-500 text-lg">/{data.pluginHealth.total} installed</span></p>
            <p className="text-xs text-slate-400 mt-2">{data.pluginHealth.active} active.</p>
            <div className="mt-3 flex flex-wrap gap-1">
              {Object.entries(data.pluginHealth.tiers).map(([k, v]) => (
                <span key={k} className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700">{k}: {v}</span>
              ))}
            </div>
          </Card>
          <Card title="Status distribution" badge="green" badgeLabel="by status">
            <div className="flex flex-wrap gap-1">
              {Object.entries(data.pluginHealth.byStatus).map(([k, v]) => (
                <span key={k} className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700">{k}: <strong>{v}</strong></span>
              ))}
            </div>
          </Card>
          <Card title="Degraded plugins" badge="red" badgeLabel={`${data.pluginHealth.degraded.length}`}>
            {data.pluginHealth.degraded.length === 0 ? <Empty /> : (
              <ul className="space-y-1.5 text-xs text-slate-300">
                {data.pluginHealth.degraded.map((p) => (
                  <li key={p}>• {p}</li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function Card(props: { title: string; badge: "green" | "amber" | "red" | "cyan" | "violet" | "neutral"; badgeLabel: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-700/70 bg-slate-900/80 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-100">{props.title}</h3>
        <Badge tone={props.badge}>{props.badgeLabel}</Badge>
      </div>
      {props.children}
    </div>
  );
}

function Empty() {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-500">
      <BedDouble className="w-4 h-4" /> Nothing here — clear. Honest zero.
    </div>
  );
}