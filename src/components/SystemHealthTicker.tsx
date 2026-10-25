import React, { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, XCircle, ChevronRight, Server } from "lucide-react";
import { navHash } from "@/lib/hashRoute";
import { apiFetch } from "@/services/apiFetch";

interface HealthData {
  status: "HEALTHY" | "DEGRADED";
  services?: Record<string, { level?: string; online?: boolean; detail?: string }>;
  checkedAt?: string;
}

export function SystemHealthTicker() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState<string>("");

  const pollHealth = async () => {
    try {
      setLoading(true);
      const res = await apiFetch("/api/runtime/status", {
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
        setLastChecked(new Date().toLocaleTimeString());
      } else {
        setHealth({
          status: "DEGRADED",
          services: { "astra-api": { level: "offline", online: false, detail: `HTTP ${res.status}` } },
        });
      }
    } catch (err: any) {
      // If we already had healthy data, don't flash offline on transient network jitter
      setHealth((prev) => {
        if (prev && prev.status === "HEALTHY") return prev;
        return {
          status: "DEGRADED",
          services: { "astra-api": { level: "offline", online: false, detail: err?.message || "Backend probe pending" } },
        };
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void pollHealth();
    const interval = setInterval(() => void pollHealth(), 15000);
    return () => clearInterval(interval);
  }, []);

  if (!health) return null;

  const isDegraded = health.status === "DEGRADED";
  const isHealthy = health.status === "HEALTHY";

  const notices: string[] = [];

  {
    const svcs = health.services || {};
    for (const [id, label] of [["astra-api", "Astra API"], ["freellmapi", "FreeLLMAPI"], ["laya", "Laya"], ["ollama", "Ollama"]] as const) {
      if (svcs[id] && !svcs[id].online) notices.push(`${label} is offline.`);
    }
    if (svcs.voicebox && !svcs.voicebox.online) notices.push("Voicebox is offline (warning only).");

    if (notices.length === 0) {
      notices.push(`Astra health ${health.status}.`);
    }
  }

  return (
    <div
      className={`border-b text-[11px] px-3 py-1 flex items-center justify-between transition-colors z-30 ${
        isDegraded
          ? "bg-amber-950/70 border-amber-500/40 text-amber-200"
          : "bg-slate-900/60 border-slate-800 text-slate-300"
      }`}
    >
      <div className="flex items-center gap-2 overflow-hidden flex-1 mr-2">
        <div className="flex items-center gap-1.5 shrink-0 font-bold uppercase tracking-wider text-[10px]">
          {isHealthy && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
          {isDegraded && <AlertTriangle className="w-3.5 h-3.5 text-amber-400 animate-pulse" />}
          <span>{isHealthy ? "SYSTEM NORMAL" : "DEGRADED"}</span>
        </div>

        <div className="relative overflow-hidden w-full h-4">
          <div className="whitespace-nowrap flex items-center gap-6">
            {notices.map((msg, idx) => (
              <span key={idx} className="inline-block font-mono text-[10.5px]">
                {msg}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => navHash("/health")}
          className="hover:underline flex items-center gap-1 text-[10px] text-cyan-300 font-medium"
        >
          <span>Diagnostics</span>
          <ChevronRight className="w-3 h-3" />
        </button>
        <button
          onClick={pollHealth}
          disabled={loading}
          className="p-1 hover:bg-white/10 rounded transition-colors"
          title={`Last checked: ${lastChecked}. Click to refresh`}
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>
    </div>
  );
}
