import React, { useEffect, useMemo, useState } from "react";
import {
  Users,
  Search,
  RefreshCw,
  Cpu,
  Layers,
  Blocks,
  Filter,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui";

interface DeclaredAgent {
  agentId: string;
  name: string;
  level: string;
  parentAgent?: string;
  plugin: string;
  autoRegister: boolean;
}

interface RegisteredAgent {
  agentId: string;
  name: string;
  level: string;
  parentAgent: string | null;
  domain: string;
  role: string;
  status: string;
  health: number;
  modelPolicy: string;
}

interface RegistryPayload {
  summary: {
    declared: number;
    registered: number;
    unique: number;
    byLevel: Record<string, number>;
    byStatus: Record<string, number>;
    byPlugin: Record<string, number>;
  };
  registered: RegisteredAgent[];
  declared: DeclaredAgent[];
}

const LEVEL_ORDER = ["CORE", "EXECUTIVE", "HOD", "MANAGER", "SPECIALIST", "WORKER"];

const LEVEL_TONE: Record<string, "cyan" | "violet" | "green" | "amber" | "neutral"> = {
  CORE: "cyan",
  EXECUTIVE: "violet",
  HOD: "green",
  MANAGER: "amber",
  SPECIALIST: "neutral",
  WORKER: "neutral",
};

export function AgentRegistryView() {
  const [payload, setPayload] = useState<RegistryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("All");
  const [pluginFilter, setPluginFilter] = useState("All");

  const fetchRegistry = async () => {
    setLoading(true);
    setError(null);
    // Hard timeout so the page can never hang on "Loading…" forever
    // (e.g. backend down or /api/agents/registry stuck).
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch("/api/agents/registry", { signal: controller.signal });
      if (!res.ok) {
        throw new Error(
          res.status === 401
            ? "Not authenticated — log in again to load the agent registry."
            : `Registry endpoint returned HTTP ${res.status} — is the backend server running?`
        );
      }
      setPayload(await res.json());
    } catch (e) {
      setError(
        (e as Error).name === "AbortError"
          ? "Agent registry request timed out after 8s — is the backend server running?"
          : (e as Error).message || "Failed to load agent registry."
      );
      // keep last payload so an auto-refresh failure doesn't blank the view
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRegistry();
  }, []);

  const plugins = useMemo(
    () => (payload ? Object.keys(payload.summary.byPlugin).sort() : []),
    [payload]
  );

  const filtered = useMemo(() => {
    if (!payload) return [];
    const q = search.toLowerCase();
    return payload.declared
      .filter((d) => levelFilter === "All" || d.level === levelFilter)
      .filter((d) => pluginFilter === "All" || d.plugin === pluginFilter)
      .filter(
        (d) =>
          !q ||
          d.agentId.toLowerCase().includes(q) ||
          d.name.toLowerCase().includes(q) ||
          (d.parentAgent || "").toLowerCase().includes(q)
      );
  }, [payload, search, levelFilter, pluginFilter]);

  if (!payload) {
    return (
      <div className="p-4 max-w-7xl mx-auto">
        <div className="rounded-xl border border-slate-700/70 bg-slate-900/80 p-10 text-center text-sm text-slate-400">
          {error ? (
            <div className="space-y-4">
              <p className="text-red-300">⚠ {error}</p>
              <button
                onClick={fetchRegistry}
                disabled={loading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-teal-500/40 bg-teal-500/10 text-teal-300 hover:bg-teal-500/20 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                {loading ? "Retrying…" : "Retry"}
              </button>
            </div>
          ) : (
            <span className="inline-flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              Loading agent registry…
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-700/40 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              Astra Agent Registry
              <Badge tone="violet">Live from manifests</Badge>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              All {payload.summary.declared} declared agents across {plugins.length} plugins ·{" "}
              {payload.summary.unique} unique IDs · {payload.summary.registered} runtime-registered
            </p>
          </div>
        </div>
        <button
          onClick={fetchRegistry}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1.5 transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {LEVEL_ORDER.map((lv) => (
          <div key={lv} className="rounded-xl border border-slate-700/70 bg-slate-900/80 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase text-slate-400 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-teal-400" /> {lv}
              </span>
            </div>
            <p className="text-2xl font-bold text-slate-100">{payload.summary.byLevel[lv] || 0}</p>
            <p className="text-[11px] text-slate-400 mt-1">agents at this level</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          {["All", ...LEVEL_ORDER].map((lv) => (
            <button
              key={lv}
              onClick={() => setLevelFilter(lv)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                levelFilter === lv
                  ? "bg-teal-600 text-white shadow-sm"
                  : "bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              }`}
            >
              {lv}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={pluginFilter}
            onChange={(e) => setPluginFilter(e.target.value)}
            className="px-2 py-1.5 bg-slate-900/90 border border-slate-700/60 rounded-md text-xs text-slate-200 focus:outline-none focus:border-teal-500"
          >
            <option value="All">All plugins</option>
            {plugins.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search agents, IDs, parents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-900/90 border border-slate-700/60 rounded-md text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
            />
          </div>
        </div>
      </div>

      {/* Agent table */}
      <div className="rounded-xl border border-slate-700/70 bg-slate-900/80 overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-purple-400" /> Declared Agents
            <span className="text-xs text-slate-500 font-normal">({filtered.length} shown)</span>
          </h2>
          <span className="text-xs text-slate-400">Hierarchy L0–L5</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                <th className="px-4 py-2.5 font-semibold">Agent</th>
                <th className="px-4 py-2.5 font-semibold">Level</th>
                <th className="px-4 py-2.5 font-semibold">Parent</th>
                <th className="px-4 py-2.5 font-semibold">Owning Plugin</th>
                <th className="px-4 py-2.5 font-semibold">Runtime State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filtered.map((d) => {
                const registered = payload.registered.find((r) => r.agentId === d.agentId);
                return (
                  <tr key={`${d.plugin}:${d.agentId}`} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-2.5">
                      <p className="text-xs font-semibold text-slate-200">{d.name}</p>
                      <p className="text-[10px] font-mono text-slate-500">{d.agentId}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={LEVEL_TONE[d.level] || "neutral"}>{d.level}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">
                      {d.parentAgent || "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-[11px] text-slate-300 flex items-center gap-1">
                        <Blocks className="w-3 h-3 text-teal-500" /> {d.plugin}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {registered ? (
                        <div className="flex items-center gap-2">
                          <Badge tone={registered.status === "ACTIVE" ? "green" : "amber"}>
                            {registered.status}
                          </Badge>
                          <span className="text-[10px] font-mono text-slate-500">
                            {registered.domain} · {registered.role}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-500 flex items-center gap-1">
                          <ChevronRight className="w-3 h-3" /> declared{d.autoRegister ? "" : " (manual)"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}