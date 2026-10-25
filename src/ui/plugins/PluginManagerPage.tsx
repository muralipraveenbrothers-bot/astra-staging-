// ASTRA AI — PLUGIN MANAGER PAGE
// Full plugin ecosystem console: catalog with install/configure/repair/uninstall,
// health dashboard, dependency graph, and ecosystem summary.

import React, { useEffect, useState, useCallback } from "react";
import {
  Blocks,
  RefreshCw,
  Power,
  Wrench,
  Settings2,
  Trash2,
  PackagePlus,
  Activity,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui";
import { toast } from "sonner";
import { PluginHealthDashboard } from "./PluginHealthDashboard";
import { PluginInstallWizard } from "./PluginInstallWizard";
import { DependencyGraphVisualizer } from "./DependencyGraphVisualizer";
import { pluginAuthHeaders } from "./pluginApi";

interface CatalogEntry {
  pluginId: string;
  name: string;
  version: string;
  tier: string;
  category: string;
  description: string;
  riskLevel: string;
  dependencies: { required: string[]; optional: string[] };
  healthChecks: Array<{ name: string; critical: boolean }>;
  configurationSchema?: { secrets?: string[]; properties?: Record<string, unknown> };
  state?: {
    status: string;
    health?: { status: string };
    missingSecrets?: string[];
    version?: string;
  };
}

type Tab = "catalog" | "health" | "graph";

const STATUS_TONES: Record<string, "green" | "amber" | "red" | "cyan" | "violet"> = {
  ACTIVE: "green",
  DEGRADED: "amber",
  CONFIG_REQUIRED: "violet",
  INSTALL_BLOCKED: "red",
  SAFE_MODE: "red",
  NOT_INSTALLED: "cyan",
};

export function PluginManagerPage() {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [graphEdges, setGraphEdges] = useState<Array<{ from: string; to: string; type: "required" | "optional" }>>([]);
  const [summary, setSummary] = useState<Record<string, any>>({});
  const [tab, setTab] = useState<Tab>("catalog");
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [configModal, setConfigModal] = useState<CatalogEntry | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ecoRes, graphRes] = await Promise.all([
        fetch("/api/plugins/ecosystem", { headers: pluginAuthHeaders() }),
        fetch("/api/plugins/graph", { headers: pluginAuthHeaders() }),
      ]);
      if (ecoRes.ok) {
        const eco = await ecoRes.json();
        setSummary(eco.summary ?? {});
        setCatalog(eco.catalog ?? []);
      }
      if (graphRes.ok) {
        const g = await graphRes.json();
        setGraphEdges(g.edges ?? []);
      }
    } catch {
      toast.error("Failed to load plugin ecosystem");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const statuses: Record<string, string> = {};
  catalog.forEach((p) => {
    statuses[p.pluginId] = p.state?.status ?? "NOT_INSTALLED";
  });

  const action = async (id: string, op: "install" | "uninstall" | "repair" | "configure", body?: unknown) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/plugins/${id}/${op}`, {
        method: "POST",
        headers: pluginAuthHeaders(true),
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(`${data.pluginId ?? id} → ${data.status ?? "ok"}`);
      } else {
        toast.error(`${data.message ?? data.reason ?? "Operation failed"}`);
      }
      await fetchAll();
    } catch {
      toast.error(`Failed to ${op} ${id}`);
    } finally {
      setBusyId(null);
    }
  };

  const submitConfig = () => {
    if (!configModal) return;
    action(configModal.pluginId, "configure", { config: configValues });
    setConfigModal(null);
    setConfigValues({});
  };

  const installedCount = catalog.filter((p) => p.state?.status === "ACTIVE").length;
  const degradedCount = catalog.filter((p) => p.state?.status === "DEGRADED").length;

  return (
    <div className="space-y-6 p-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-700/40 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-400">
              <Blocks className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                Plugin Manager
                <Badge tone="cyan">{catalog.length} catalog</Badge>
                <Badge tone="green">{installedCount} active</Badge>
                {degradedCount > 0 && <Badge tone="amber">{degradedCount} degraded</Badge>}
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Dependency resolution · real health checks · auto-wiring · auto-repair · zero fake statuses
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1.5 transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5">
        {(
          [
            ["catalog", "Catalog & Actions", PackagePlus],
            ["health", "Health Monitor", Activity],
            ["graph", "Dependency Graph", Blocks],
          ] as Array<[Tab, string, any]>
        ).map(([t, label, Icon]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all ${
              tab === t
                ? "bg-teal-600 text-white shadow-sm"
                : "bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === "health" && <PluginHealthDashboard key={summary.updatedAt ?? "h"} refreshIntervalMs={15000} />}

      {tab === "graph" && (
        <DependencyGraphVisualizer edges={graphEdges} statuses={statuses} catalog={catalog} />
      )}

      {tab === "catalog" && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left 2/3: catalog table */}
          <div className="xl:col-span-2 space-y-3">
            {catalog.map((p) => {
              const s = p.state?.status ?? "NOT_INSTALLED";
              const health = p.state?.health?.status;
              const canInstall = s === "NOT_INSTALLED";
              return (
                <div key={p.pluginId} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-slate-100">{p.name}</h3>
                        <span className="text-[10px] font-mono text-slate-500">{p.pluginId} v{p.version}</span>
                        <Badge tone="violet">{p.tier}</Badge>
                        {p.riskLevel === "CRITICAL" || p.riskLevel === "HIGH" ? (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-rose-500/10 text-rose-300 border border-rose-500/30">
                            <ShieldAlert className="w-2.5 h-2.5" /> {p.riskLevel}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">{p.description}</p>

                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        <Badge tone={STATUS_TONES[s] ?? "cyan"}>{s}</Badge>
                        {health && <Badge tone={health === "HEALTHY" ? "green" : health === "DEGRADED" ? "amber" : "red"}>{health}</Badge>}
                        {p.state?.missingSecrets?.map((sec) => (
                          <span key={sec} className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-violet-500/10 text-violet-300 border border-violet-500/30">
                            secret: {sec}
                          </span>
                        ))}
                        {p.dependencies.required.length > 0 && (
                          <span className="text-[9px] font-mono text-slate-500">
                            req: {p.dependencies.required.join(", ")}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {canInstall && (
                        <button
                          onClick={() => action(p.pluginId, "install")}
                          disabled={busyId === p.pluginId}
                          className="text-xs h-7 px-3 rounded-lg bg-teal-600 hover:bg-teal-500 text-white flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <Power className="w-3 h-3" /> Install
                        </button>
                      )}
                      {!canInstall && (
                        <>
                          <button
                            onClick={() => action(p.pluginId, "repair")}
                            disabled={busyId === p.pluginId}
                            className="text-xs h-7 px-2.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1.5 disabled:opacity-50"
                            title="Run repair engine"
                          >
                            <Wrench className="w-3 h-3" /> Repair
                          </button>
                          <button
                            onClick={() => {
                              setConfigModal(p);
                              setConfigValues({});
                            }}
                            disabled={busyId === p.pluginId}
                            className="text-xs h-7 px-2.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1.5 disabled:opacity-50"
                            title="Configure secrets & options"
                          >
                            <Settings2 className="w-3 h-3" /> Configure
                          </button>
                          <button
                            onClick={() => action(p.pluginId, "uninstall")}
                            disabled={busyId === p.pluginId}
                            className="text-xs h-7 px-2.5 rounded-lg border border-rose-700/50 bg-rose-900/40 hover:bg-rose-800 text-rose-200 flex items-center gap-1.5 disabled:opacity-50"
                            title="Uninstall (degrades dependents)"
                          >
                            <Trash2 className="w-3 h-3" /> Uninstall
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right 1/3: install wizard */}
          <div className="space-y-6">
            <PluginInstallWizard catalog={catalog} onInstalled={fetchAll} />
            {summary.totalDependencies !== undefined && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ecosystem Summary</h3>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  {[
                    ["Catalog", summary.totalPlugins],
                    ["Dependencies", summary.totalDependencies],
                    ["Optional Deps", summary.optionalDependencies],
                    ["Health Checks", summary.totalHealthChecks],
                    ["Installed", summary.installed],
                    ["Active", summary.active],
                    ["Degraded", summary.degraded],
                    ["Safe Mode", summary.safeMode],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="flex justify-between border-b border-slate-800/60 pb-1">
                      <span className="text-slate-400">{label}</span>
                      <span className="font-mono text-slate-200">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Configure modal */}
      {configModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-100">
              Configure {configModal.name} <span className="font-mono text-slate-500">({configModal.pluginId})</span>
            </h3>
            {!configModal.configurationSchema?.secrets?.length && !configModal.configurationSchema?.properties ? (
              <p className="text-[11px] text-slate-500 italic">This plugin declares no configurable options.</p>
            ) : (
              <div className="space-y-3">
                {configModal.configurationSchema?.properties &&
                  Object.entries(configModal.configurationSchema.properties as Record<string, any>).map(([k, v]) => (
                    <label key={k} className="block text-[11px] text-slate-300">
                      {k}
                      <input
                        type={typeof v.default === "boolean" ? "checkbox" : "text"}
                        checked={typeof v.default === "boolean" ? configValues[k] === "true" || Boolean(v.default) : undefined}
                        onChange={(e) =>
                          setConfigValues((prev) => ({
                            ...prev,
                            [k]: typeof v.default === "boolean" ? String(e.target.checked) : e.target.value,
                          }))
                        }
                        placeholder={String(v.default ?? "")}
                        className="mt-1 w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-md text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
                      />
                    </label>
                  ))}
                {configModal.configurationSchema?.secrets?.map((sec) => (
                  <label key={sec} className="block text-[11px] text-slate-300">
                    Secret: {sec}
                    <input
                      type="password"
                      value={configValues[sec] ?? ""}
                      onChange={(e) => setConfigValues((prev) => ({ ...prev, [sec]: e.target.value }))}
                      placeholder={`Enter ${sec}`}
                      className="mt-1 w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-md text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
                    />
                  </label>
                ))}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfigModal(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={submitConfig}
                className="px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-xs text-white"
              >
                Save & Re-check
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}