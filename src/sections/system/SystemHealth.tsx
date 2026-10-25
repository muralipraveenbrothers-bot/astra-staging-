import React, { useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Cpu,
  Database,
  Network,
  ShieldCheck,
  Zap,
  RefreshCw,
  Clock,
  Layers,
  Blocks,
  Users,
  Wrench,
  BookOpen,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui";

interface PillarReport {
  id: string;
  name: string;
  status: string;
  detail: string;
  components: Record<string, string>;
}

interface BrainHealth {
  status: "HEALTHY" | "DEGRADED" | "OFFLINE";
  subsystems: Record<string, string>;
  pillars?: Record<string, PillarReport>;
  pillarOverall?: string;
  uptimeSeconds: number;
  activeConnections: number;
  counts: {
    plugins: number;
    agents: number;
    agentsActive: number;
    tools: number;
    toolsHealthy: number;
    models: number;
    knowledgeSources: number;
    knowledgeDocsIndexed: number;
    mcpServers?: number;
    mcpConnected?: number;
  };
  mcpFabric?: {
    mcp: {
      registered: number; configured: number; connected: number; ready: number;
      degraded: number; offline: number; configRequired: number; error: number; disabled: number;
    };
    mcpRegistryBadge: string;
    pubmed: {
      source: string; provider: string; transport: string;
      configuration: string; connectivity: string; authentication: string;
      capability: string; riskClass: string;
      lastProbe: string | null; latencyMs: number | null;
      totalHits: number | null; firstPmid: string | null;
      status: string; lastError: string | null;
    };
    updatedAt: string;
  };
  notes?: Record<string, string>;
  timestamp: string;
}

const STATUS_TONE: Record<string, "green" | "amber" | "red"> = {
  CONNECTED: "green",
  DEGRADED: "amber",
  OFFLINE: "red",
  CONFIGURED: "amber",
  HEALTHY: "green",
};

const STATUS_ICON: Record<string, any> = {
  CONNECTED: CheckCircle2,
  DEGRADED: AlertTriangle,
  OFFLINE: XCircle,
  CONFIGURED: AlertTriangle,
  HEALTHY: CheckCircle2,
};

import { healthService, EcosystemHealthSnapshot } from "../../astra/runtime/healthService";
import { internalServices, type ServiceSnapshot as ManagedServiceSnapshot } from "../../astra/runtime/internalServices";

export function SystemHealth() {
  const [health, setHealth] = useState<BrainHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [pluginSnapshot, setPluginSnapshot] = useState<EcosystemHealthSnapshot | null>(null);
  const [managedServices, setManagedServices] = useState<ManagedServiceSnapshot[]>([]);

  const fetchHealth = async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const res = await fetch("/api/health");
      if (res.ok) setHealth(await res.json());
    } catch {
      // probe failed — stay on last payload
    } finally {
      if (!isRefresh) setLoading(false);
    }
  };

  const fetchManagedServices = async () => {
    try {
      const res = await fetch("/api/services");
      if (res.ok) {
        const body = await res.json();
        if (Array.isArray(body.services)) setManagedServices(body.services);
      }
    } catch {
      // service manager unreachable — keep last payload, never fabricate
    }
  };

  useEffect(() => {
    fetchHealth(false);
    fetchManagedServices();
    const interval = setInterval(() => {
      fetchHealth(true);
      fetchManagedServices();
    }, 15000);
    const unsub = healthService.subscribe((snap) => {
      setPluginSnapshot(snap);
    });
    return () => {
      clearInterval(interval);
      unsub();
    };
  }, []);

  const subsystemsList = health
    ? [
        { key: "commandEngine", name: "Hospital Command Engine", desc: "Deterministic CPOE & Execution Pipeline" },
        { key: "langGraph", name: "LangGraph Agent Orchestrator", desc: "Stateful Graph & Human-in-the-Loop Gate" },
        { key: "modelRouter", name: "Model list", desc: "The registry has model rows. This is not a live cloud route." },
        { key: "ollamaLocal", name: "Ollama Local AI Runtime", desc: "Live probe of 127.0.0.1:11434" },
        { key: "knowledgeFabric", name: "Knowledge registry", desc: "Registry only. Indexed docs stay 0 unless the stats probe succeeds." },
        { key: "realtimeHub", name: "Real-Time Event Fabric (SSE)", desc: "Cross-Department Live Broadcast Bus" },
        { key: "rbacSecurity", name: "Server-Side RBAC & Session Auth", desc: "Strict 403 Role-Gated Terminals" },
        { key: "auditEngine", name: "Local audit file", desc: "Checks that data/audit.jsonl exists and is not empty. Not a cryptographic audit." },
        { key: "pluginManager", name: "Plugin catalog", desc: "Catalog has entries. A catalog row is not a health check." },
        { key: "agentRegistry", name: "Agent seed registry", desc: "Count of seed records in AgentRegistry. Not a count of running workers." },
        { key: "toolRegistry", name: "Tool Registry", desc: "Executable clinical tool schemas" },
        { key: "voicebox", name: "Multilingual Voicebox", desc: "Qwen3-TTS + Whisper on :17493 (honest probe)" },
        { key: "mcpRegistry", name: "MCP Tool Fabric", desc: "Aggregate of medical MCP servers — CONNECTED only after a real handshake; configured is never connected" },
      ]
    : [];

  const overallBadge = !health ? "neutral" : health.status === "HEALTHY" ? "green" : health.status === "DEGRADED" ? "amber" : "red";

  return (
    <div className="space-y-6 p-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-700/40 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-400">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              Astra Brain Diagnostics & System Health
              <Badge tone={overallBadge}>
                {health?.status || "PROBING"} — honest live probes
              </Badge>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Labels follow the probe. A file, a seed list, or a catalog row is not called CONNECTED.
            </p>
          </div>
        </div>

        <button
          onClick={() => void fetchHealth(false)}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1.5 transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Run Health Probe
        </button>
      </div>

      {/* Ecosystem Count Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-700/70 bg-slate-900/80 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase text-slate-400 flex items-center gap-1.5">
              <Blocks className="w-4 h-4 text-teal-400" /> Plugins
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-100">{health?.counts.plugins ?? 0}</p>
          <p className="text-[11px] text-slate-400 mt-1">catalog rows, not a per-plugin health check</p>
        </div>

        <div className="rounded-xl border border-slate-700/70 bg-slate-900/80 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase text-slate-400 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-purple-400" /> Agents
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-100">
            {health?.counts.agents ?? 0}
            <span className="text-xs text-slate-400 font-normal ml-1">active {health?.counts.agentsActive ?? 0}</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-1">seed registry only. Not 310 catalog ids and not running workers.</p>
        </div>

        <div className="rounded-xl border border-slate-700/70 bg-slate-900/80 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase text-slate-400 flex items-center gap-1.5">
              <Wrench className="w-4 h-4 text-amber-400" /> Tools
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-100">
            {health?.counts.tools ?? 0}
            <span className="text-xs text-slate-400 font-normal ml-1">healthy {health?.counts.toolsHealthy ?? 0}</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-1">executable tool schemas</p>
        </div>

        <div className="rounded-xl border border-slate-700/70 bg-slate-900/80 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase text-slate-400 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-blue-400" /> Knowledge
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-100">{health?.counts.knowledgeSources ?? 0} sources</p>
          <p className="text-[11px] text-slate-400 mt-1">{health?.counts.knowledgeDocsIndexed ?? 0} docs indexed (registry only — honest gap)</p>
        </div>
      </div>

      {/* Five product pillars */}
      {health?.pillars && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {Object.values(health.pillars).map((p) => (
            <div key={p.id} className="rounded-xl border border-slate-700/70 bg-slate-900/80 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold uppercase text-slate-400">{p.name}</span>
                <Badge tone={STATUS_TONE[p.status] || (p.status === "CONFIGURED" ? "amber" : "red")}>
                  {p.status}
                </Badge>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">{p.detail}</p>
            </div>
          ))}
        </div>
      )}

      {/* Runtime strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-700/70 bg-slate-900/80 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase text-slate-400 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-teal-400" /> Host Memory (RAM)
            </span>
          </div>
          <p className="text-sm font-bold text-slate-100">Local Windows Host</p>
          <p className="text-[11px] text-slate-400 mt-1">hardware values reported by OS</p>
        </div>

        <div className="rounded-xl border border-slate-700/70 bg-slate-900/80 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase text-slate-400 flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-400" /> GPU & Accelerator
            </span>
          </div>
          <p className="text-sm font-bold text-slate-100 truncate">Local Accelerator</p>
          <p className="text-[11px] text-slate-400 mt-1">VRAM offloaded to host RAM</p>
        </div>

        <div className="rounded-xl border border-slate-700/70 bg-slate-900/80 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-purple-400" /> Ollama
            </span>
            <Badge tone={health?.subsystems.ollamaLocal === "CONNECTED" ? "violet" : "red"}>
              {health?.subsystems.ollamaLocal || "OFFLINE"}
            </Badge>
          </div>
          <p className="text-lg font-bold text-purple-300">{health?.subsystems.ollamaLocal === "CONNECTED" ? "reachable" : "not reachable"}</p>
          <p className="text-[11px] text-slate-400 mt-1">live probe of 127.0.0.1:11434</p>
        </div>

        <div className="rounded-xl border border-slate-700/70 bg-slate-900/80 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase text-slate-400 flex items-center gap-1.5">
              <Network className="w-4 h-4 text-blue-400" /> Live SSE Connections
            </span>
            <Badge tone="cyan">client count</Badge>
          </div>
          <p className="text-2xl font-bold text-slate-100">{health?.activeConnections ?? 0} Workstations</p>
          <p className="text-[11px] text-slate-400 mt-1">Uptime: {Math.floor((health?.uptimeSeconds || 0) / 60)} mins</p>
        </div>
      </div>

      {/* Subsystems Health Table */}
      <div className="rounded-xl border border-slate-700/70 bg-slate-900/80 overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Layers className="w-4 h-4 text-teal-400" /> Core Subsystems Status
          </h2>
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Probe: {health ? new Date(health.timestamp).toLocaleTimeString() : "—"}
          </span>
        </div>

        <div className="divide-y divide-slate-800/80">
          {subsystemsList.map((sub) => {
            const status = health?.subsystems[sub.key] ?? "OFFLINE";
            const Icon = STATUS_ICON[status] || XCircle;
            return (
              <div key={sub.key} className="p-4 flex items-center justify-between hover:bg-slate-800/30 transition-colors">
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">{sub.name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{sub.desc}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={STATUS_TONE[status] || "red"}>
                    <Icon className="w-3 h-3" /> {status}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MCP Tool Fabric aggregate + PubMed/NCBI capability card (truthful, probe-backed) */}
      {health?.mcpFabric && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-700/70 bg-slate-900/80 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Blocks className="w-4 h-4 text-teal-400" /> MCP Tool Fabric
              </h2>
              <Badge tone={health.mcpFabric.mcp.connected > 0 && health.mcpFabric.mcp.connected < health.mcpFabric.mcp.registered ? "amber" : health.mcpFabric.mcpRegistryBadge === "CONNECTED" ? "green" : health.mcpFabric.mcpRegistryBadge === "CONFIGURED" || health.mcpFabric.mcpRegistryBadge === "DEGRADED" ? "amber" : "red"}>
                {health.mcpFabric.mcp.connected > 0 && health.mcpFabric.mcp.connected < health.mcpFabric.mcp.registered ? "PARTIAL " + health.mcpFabric.mcp.connected + "/" + health.mcpFabric.mcp.registered : health.mcpFabric.mcpRegistryBadge}
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ["Registered", health.mcpFabric.mcp.registered],
                ["Configured", health.mcpFabric.mcp.configured],
                ["Connected", health.mcpFabric.mcp.connected],
                ["Ready", health.mcpFabric.mcp.ready],
                ["Degraded", health.mcpFabric.mcp.degraded],
                ["Error/Off", health.mcpFabric.mcp.error + health.mcpFabric.mcp.offline],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-lg border border-slate-800 bg-slate-950/60 py-2">
                  <p className="text-lg font-bold text-slate-100">{String(value)}</p>
                  <p className="text-[10px] uppercase text-slate-500">{label}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-2">CONNECTED counts only servers whose real MCP handshake (initialize + tools/list) succeeded.</p>
          </div>

          <div className="rounded-xl border border-slate-700/70 bg-slate-900/80 p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-blue-400" /> PubMed / NCBI ({health.mcpFabric.pubmed.provider})
              </h2>
              <Badge tone={health.mcpFabric.pubmed.status === "READY" ? "green" : health.mcpFabric.pubmed.status === "CONFIG_REQUIRED" || health.mcpFabric.pubmed.status === "DEGRADED" ? "amber" : "red"}>
                {health.mcpFabric.pubmed.status}
              </Badge>
            </div>
            <div className="text-[11px] text-slate-400 space-y-1">
              <p>Source: <span className="text-slate-200 font-mono">{health.mcpFabric.pubmed.source}</span> · Transport: <span className="text-slate-200 font-mono">{health.mcpFabric.pubmed.transport}</span></p>
              <p>Configuration: <span className={health.mcpFabric.pubmed.configuration === "PASS" ? "text-emerald-300" : "text-rose-300"}>{health.mcpFabric.pubmed.configuration}</span> · Connectivity: <span className={health.mcpFabric.pubmed.connectivity === "PASS" ? "text-emerald-300" : health.mcpFabric.pubmed.connectivity === "FAIL" ? "text-rose-300" : "text-amber-300"}>{health.mcpFabric.pubmed.connectivity}</span> · Auth: <span className={health.mcpFabric.pubmed.authentication === "PASS" ? "text-emerald-300" : health.mcpFabric.pubmed.authentication === "FAIL" ? "text-rose-300" : "text-amber-300"}>{health.mcpFabric.pubmed.authentication}</span></p>
              <p>Capability: <span className="text-slate-200 font-mono">{health.mcpFabric.pubmed.capability}</span> ({health.mcpFabric.pubmed.riskClass})</p>
              <p>
                Last probe: {health.mcpFabric.pubmed.lastProbe ? new Date(health.mcpFabric.pubmed.lastProbe).toLocaleTimeString() : "never"}
                {health.mcpFabric.pubmed.latencyMs != null && <> · {health.mcpFabric.pubmed.latencyMs} ms</>}
                {health.mcpFabric.pubmed.totalHits != null && <> · {health.mcpFabric.pubmed.totalHits} hits</>}
                {health.mcpFabric.pubmed.firstPmid && <> · first PMID {health.mcpFabric.pubmed.firstPmid}</>}
              </p>
              {health.mcpFabric.pubmed.lastError && <p className="text-rose-300">Last error: {health.mcpFabric.pubmed.lastError}</p>}
            </div>
            <p className="text-[11px] text-slate-500 mt-2">READY requires a real successful NCBI probe — key presence alone is never enough.</p>
          </div>
        </div>
      )}

      {/* Active Plugin Ecosystem Live Runtime Status */}
      {pluginSnapshot && (
        <div className="rounded-xl border border-slate-700/70 bg-slate-900/80 overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Blocks className="w-4 h-4 text-teal-400" /> Active Plugin Runtime & AgentBus Health ({pluginSnapshot.activeCount} Active / {pluginSnapshot.totalPlugins} Installed)
            </h2>
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Auto-check: 30s
            </span>
          </div>

          <div className="divide-y divide-slate-800/80">
            {pluginSnapshot.plugins.map((p) => (
              <div key={p.id} className="p-3.5 flex items-center justify-between hover:bg-slate-800/30 transition-colors">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold text-slate-200">{p.name}</h3>
                    <span className="text-[10px] text-slate-500 font-mono">({p.id})</span>
                  </div>
                  {p.missingConfig && (
                    <p className="text-[11px] text-amber-400 mt-0.5 font-mono">⚠️ {p.missingConfig}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={p.status === "ACTIVE" ? "cyan" : p.status === "CONFIG_REQUIRED" ? "amber" : "neutral"}>
                    {p.status}
                  </Badge>
                  <Badge tone={p.health === "HEALTHY" ? "green" : p.health === "DEGRADED" ? "amber" : "red"}>
                    {p.health}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ASTRA Internal Managed Services (§29) */}
      {managedServices.length > 0 && (
        <div className="rounded-xl border border-slate-700/70 bg-slate-900/80 overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Blocks className="w-4 h-4 text-teal-400" /> ASTRA Internal Managed Services
            </h2>
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3" /> real runtime state · auto: 15s
            </span>
          </div>

          <div className="divide-y divide-slate-800/80">
            {managedServices.slice().sort((a, b) => a.id.localeCompare(b.id)).map((s) => (
              <div key={s.id} className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-2 hover:bg-slate-800/30 transition-colors">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xs font-semibold text-slate-200">{s.displayName}</h3>
                    <Badge tone={s.state === "HEALTHY" ? "green" : s.state === "DEGRADED" || s.state === "STARTING" ? "amber" : s.state === "STOPPED" || s.state === "NOT_INSTALLED" ? "neutral" : "red"}>
                      {s.state}
                    </Badge>
                    <span className="text-[10px] text-slate-500 font-mono">v{s.installedVersion ?? s.requestedVersion}</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 font-mono flex items-center gap-2 flex-wrap">
                    {s.endpoint ?? "no endpoint"}
                    {s.process?.pid ? ` · PID ${s.process.pid}` : ""}
                    {s.process?.uptimeMs ? ` · up ${Math.floor(s.process.uptimeMs / 60000)}m` : ""}
                    {s.health?.latencyMs != null ? ` · ${s.health.latencyMs} ms` : ""}
                    {s.metrics ? ` · ${s.metrics.requests} req / ${s.metrics.errors} err` : ""}
                  </p>
                  {s.process?.restartPending && (
                    <p className="text-[11px] text-cyan-300 mt-0.5 font-mono">
                      ↻ automatic restart scheduled · attempt {s.process.restartCount}
                    </p>
                  )}
                  {s.lastError && <p className="text-[11px] text-amber-400 mt-0.5 font-mono">⚠️ {s.lastError}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {health?.notes && (
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4">
          <h3 className="text-xs font-semibold uppercase text-slate-500 tracking-wider mb-2">Probe Notes (honest)</h3>
          <ul className="space-y-1">
            {Object.entries(health.notes).map(([k, v]) => (
              <li key={k} className="text-xs text-slate-400 flex gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-500 shrink-0 mt-0.5" />
                <span><strong className="text-slate-300">{k}:</strong> {v}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}