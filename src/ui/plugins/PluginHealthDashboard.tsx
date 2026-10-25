// ASTRA AI — PLUGIN HEALTH DASHBOARD
// Real-time health of the plugin ecosystem from /api/plugins/ecosystem + per-plugin health checks.

import React, { useEffect, useState, useCallback } from "react";
import { Activity, HeartPulse, RefreshCw, CircleCheck, TriangleAlert, CircleOff } from "lucide-react";
import { Badge, StatusDot } from "@/components/ui";
import { pluginAuthHeaders } from "./pluginApi";

interface HealthCheckView {
  name: string;
  status: "healthy" | "degraded" | "offline" | "skipped";
  latencyMs?: number;
  message?: string;
  critical: boolean;
}

interface PluginHealthView {
  pluginId: string;
  name: string;
  status: string;
  health: string;
  checks: HealthCheckView[];
}

interface HealthDashboardProps {
  initial?: PluginHealthView[];
  refreshIntervalMs?: number;
}

export function PluginHealthDashboard({ initial = [], refreshIntervalMs = 15000 }: HealthDashboardProps) {
  const [plugins, setPlugins] = useState<PluginHealthView[]>(initial);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchHealth = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const res = await fetch("/api/plugins/ecosystem", { headers: pluginAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const states: Record<string, any> = {};
      for (const s of data.states ?? []) states[s.pluginId] = s;

      const views: PluginHealthView[] = (data.catalog ?? [])
        .filter((m: any) => m.pluginId && states[m.pluginId])
        .map((m: any) => {
          const s = states[m.pluginId];
          return {
            pluginId: m.pluginId,
            name: m.name,
            status: s.status,
            health: s.health?.status ?? "UNKNOWN",
            checks: (s.health?.results ?? []).map((r: any) => ({
              name: r.name,
              status: r.status,
              latencyMs: r.latencyMs,
              message: r.message,
              critical: r.critical ?? false,
            })),
          };
        });
      setPlugins(views);
      setLastRefresh(new Date());
    } catch {
      // keep last snapshot
    } finally {
      if (!isRefresh) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchHealth(false);
    const timer = setInterval(() => void fetchHealth(true), refreshIntervalMs);
    return () => clearInterval(timer);
  }, [fetchHealth, refreshIntervalMs]);

  const healthyCount = plugins.filter((p) => p.health === "HEALTHY").length;
  const degradedCount = plugins.filter((p) => p.health === "DEGRADED").length;
  const offlineCount = plugins.filter((p) => p.health === "OFFLINE" || p.health === "UNKNOWN").length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HeartPulse className="w-4 h-4 text-teal-400" />
          <h2 className="text-sm font-semibold text-slate-100">Plugin Health Monitor</h2>
          <Badge tone="cyan">{plugins.length} plugins</Badge>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span>
            {healthyCount} healthy · {degradedCount} degraded · {offlineCount} offline
          </span>
          {lastRefresh && <span className="font-mono">{lastRefresh.toLocaleTimeString()}</span>}
          <button
            onClick={() => void fetchHealth(false)}
            disabled={loading}
            className="p-1.5 rounded-md border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
            title="Refresh health"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {plugins.map((p) => {
          const healthTone =
            p.health === "HEALTHY" ? "green" : p.health === "DEGRADED" ? "amber" : "red";
          return (
            <div key={p.pluginId} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <StatusDot status={p.health === "HEALTHY" ? "healthy" : p.health === "DEGRADED" ? "issues" : "disabled"} />
                  <span className="text-sm font-semibold text-slate-100">{p.name}</span>
                  <span className="text-[10px] font-mono text-slate-500">{p.pluginId}</span>
                </div>
                <Badge tone={healthTone as any}>{p.health}</Badge>
              </div>

              <div className="space-y-1.5">
                {p.checks.length === 0 && (
                  <p className="text-[11px] text-slate-500 italic">No health checks reported (plugin not installed).</p>
                )}
                {p.checks.map((c) => (
                  <div key={c.name} className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5 text-slate-300">
                      {c.status === "healthy" ? (
                        <CircleCheck className="w-3.5 h-3.5 text-teal-400" />
                      ) : c.status === "degraded" ? (
                        <TriangleAlert className="w-3.5 h-3.5 text-amber-400" />
                      ) : c.status === "skipped" ? (
                        <Activity className="w-3.5 h-3.5 text-slate-500" />
                      ) : (
                        <CircleOff className="w-3.5 h-3.5 text-rose-400" />
                      )}
                      {c.name}
                      {c.critical && <span className="text-[9px] uppercase text-rose-400 font-bold">critical</span>}
                    </span>
                    <span className="font-mono text-slate-500">
                      {c.status.toUpperCase()}
                      {c.latencyMs !== undefined && ` · ${c.latencyMs}ms`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}