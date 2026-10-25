// ASTRA AI — PLUGIN INSTALL WIZARD
// Guided multi-step install: pick plugin -> review dependencies & health checks -> install -> verify.

import React, { useEffect, useState } from "react";
import { Blocks, ChevronRight, Check, Loader2, ShieldAlert, ListChecks, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui";
import { toast } from "sonner";
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
  state?: { status: string; health?: { status: string } };
}

interface InstallWizardProps {
  catalog: CatalogEntry[];
  onInstalled?: () => void;
}

const STEPS = ["Select", "Review", "Install", "Verify"];

export function PluginInstallWizard({ catalog, onInstalled }: InstallWizardProps) {
  const [step, setStep] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [autoInstallOptional, setAutoInstallOptional] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [verify, setVerify] = useState<any>(null);

  const available = catalog.filter((p) => !p.state || p.state.status === "NOT_INSTALLED" || p.state.status === "DEGRADED" || p.state.status === "CONFIG_REQUIRED");
  const selected = catalog.find((p) => p.pluginId === selectedId) ?? null;

  useEffect(() => {
    if (step === 3 && selectedId) {
      fetch(`/api/plugins/${selectedId}/health`, { headers: pluginAuthHeaders() })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => setVerify(data))
        .catch(() => setVerify(null));
    }
  }, [step, selectedId]);

  const startInstall = async () => {
    if (!selectedId) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/plugins/${selectedId}/install`, {
        method: "POST",
        headers: pluginAuthHeaders(true),
        body: JSON.stringify({ autoInstallOptional }),
      });
      const data = await res.json();
      setResult(data);
      if (data.success) {
        toast.success(`${data.pluginId} installed: ${data.status}`);
        setStep(3);
      } else {
        toast.error(`${data.pluginId} ${data.status}: ${data.message ?? data.reason ?? ""}`);
        setStep(2);
      }
    } catch {
      toast.error("Install request failed");
    } finally {
      setBusy(false);
    }
  };

  const renderSelect = () => (
    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
      {available.length === 0 && <p className="text-xs text-slate-500 italic">All catalog plugins are installed.</p>}
      {available.map((p) => (
        <button
          key={p.pluginId}
          onClick={() => setSelectedId(p.pluginId)}
          className={`w-full text-left rounded-lg border p-3 flex items-center justify-between gap-3 transition-all ${
            selectedId === p.pluginId
              ? "border-teal-500 bg-teal-500/10"
              : "border-slate-700 bg-slate-800/60 hover:bg-slate-800"
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Blocks className="w-4 h-4 shrink-0 text-slate-400" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-100 truncate">{p.name}</p>
              <p className="text-[10px] text-slate-400 truncate">{p.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge tone="violet">{p.tier}</Badge>
            <span
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                p.riskLevel === "CRITICAL" || p.riskLevel === "HIGH"
                  ? "bg-rose-500/10 text-rose-300 border border-rose-500/30"
                  : "bg-slate-800 text-slate-400 border border-slate-700"
              }`}
            >
              {p.riskLevel}
            </span>
          </div>
        </button>
      ))}
    </div>
  );

  const renderReview = () => {
    if (!selected) return null;
    const missingSecrets = (selected as any).configurationSchema?.secrets?.length ?? 0;
    return (
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">{selected.name}</h3>
          <p className="text-[11px] text-slate-400">{selected.description}</p>
        </div>

        <div>
          <span className="text-[10px] font-semibold uppercase text-slate-500 tracking-wider flex items-center gap-1">
            <ListChecks className="w-3 h-3" /> Required Dependencies
          </span>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {selected.dependencies.required.length === 0 && <span className="text-[11px] text-slate-500">None — core or standalone</span>}
            {selected.dependencies.required.map((d) => (
              <span key={d} className="px-2 py-0.5 rounded text-[10px] font-mono bg-teal-500/10 text-teal-300 border border-teal-500/25">
                {d}
              </span>
            ))}
          </div>
        </div>

        <div>
          <span className="text-[10px] font-semibold uppercase text-slate-500 tracking-wider">Optional Dependencies</span>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {selected.dependencies.optional.length === 0 && <span className="text-[11px] text-slate-500">None</span>}
            {selected.dependencies.optional.map((d) => (
              <span key={d} className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
                {d}
              </span>
            ))}
          </div>
        </div>

        <div>
          <span className="text-[10px] font-semibold uppercase text-slate-500 tracking-wider flex items-center gap-1">
            <ShieldAlert className="w-3 h-3" /> Health Checks ({selected.healthChecks.length})
          </span>
          <div className="mt-1.5 space-y-1">
            {selected.healthChecks.map((h) => (
              <div key={h.name} className="flex items-center gap-2 text-[11px] text-slate-300">
                <span className={`w-1.5 h-1.5 rounded-full ${h.critical ? "bg-rose-400" : "bg-slate-500"}`} />
                {h.name}
                {h.critical && <span className="text-[9px] uppercase text-rose-400 font-bold">critical</span>}
              </div>
            ))}
          </div>
        </div>

        {missingSecrets > 0 && (
          <p className="flex items-center gap-1.5 text-[11px] text-amber-300">
            <AlertCircle className="w-3.5 h-3.5" />
            This plugin declares {missingSecrets} secret(s). Install will report CONFIG_REQUIRED until secrets are set via configure.
          </p>
        )}

        <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={autoInstallOptional}
            onChange={(e) => setAutoInstallOptional(e.target.checked)}
            className="accent-teal-500"
          />
          Auto-install optional dependencies (best-effort, non-blocking)
        </label>
      </div>
    );
  };

  const renderResult = () => {
    if (!result) return <p className="text-xs text-slate-500 italic">Waiting…</p>;
    const ok = result.success;
    return (
      <div className={`rounded-lg border p-4 ${ok ? "border-teal-500/40 bg-teal-500/5" : "border-rose-500/40 bg-rose-500/5"}`}>
        <p className={`text-sm font-semibold flex items-center gap-2 ${ok ? "text-teal-300" : "text-rose-300"}`}>
          {ok ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {result.pluginId} → {result.status}
        </p>
        <p className="text-[11px] text-slate-400 mt-1">{result.message ?? result.reason ?? "No details"}</p>
        {(result.wired?.agents?.length > 0 || result.wired?.tools?.length > 0) && (
          <p className="text-[11px] text-slate-400 mt-2">
            Wired: {result.wired.agents.length} agents · {result.wired.tools.length} tools
          </p>
        )}
      </div>
    );
  };

  const renderVerify = () => {
    if (!verify) return <p className="text-xs text-slate-500 italic">No health data.</p>;
    const h = verify.health;
    const status = h?.status ?? "UNKNOWN";
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge tone={status === "HEALTHY" ? "green" : status === "DEGRADED" ? "amber" : "red"}>{status}</Badge>
          <span className="text-[11px] text-slate-400 font-mono">
            {(verify.results ?? []).length} checks · {verify.elapsedMs ?? 0}ms
          </span>
        </div>
        <div className="space-y-1.5">
          {(verify.results ?? []).map((r: any) => (
            <div key={r.name} className="flex justify-between text-[11px]">
              <span className="text-slate-300">{r.name}</span>
              <span className={`font-mono ${r.status === "healthy" ? "text-teal-400" : r.status === "degraded" ? "text-amber-400" : "text-rose-400"}`}>
                {String(r.status).toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex items-center gap-2 mb-1">
        {STEPS.map((s, i) => (
          <React.Fragment key={s}>
            <span
              className={`text-[11px] font-semibold ${i === step ? "text-teal-300" : i < step ? "text-slate-400" : "text-slate-600"}`}
            >
              {i < step ? <Check className="w-3 h-3 inline" /> : null} {s}
            </span>
            {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-slate-600" />}
          </React.Fragment>
        ))}
      </div>

      <div className="mt-4">
        {step === 0 && renderSelect()}
        {step === 1 && renderReview()}
        {step === 2 && renderResult()}
        {step === 3 && renderVerify()}
      </div>

      <div className="mt-5 pt-4 border-t border-slate-800 flex justify-between">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || busy}
          className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 disabled:opacity-40"
        >
          Back
        </button>
        {step === 0 && (
          <button
            onClick={() => selectedId && setStep(1)}
            disabled={!selectedId}
            className="px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-xs text-white disabled:opacity-40"
          >
            Review Plugin
          </button>
        )}
        {step === 1 && (
          <button
            onClick={startInstall}
            disabled={busy}
            className="px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-xs text-white flex items-center gap-1.5 disabled:opacity-40"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Blocks className="w-3.5 h-3.5" />}
            {busy ? "Installing…" : "Install"}
          </button>
        )}
        {(step === 2 || step === 3) && (
          <div className="flex gap-2">
            {step === 2 && result && !result.success && (
              <button
                onClick={() => setStep(0)}
                className="px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300"
              >
                Choose Another
              </button>
            )}
            {step === 2 && result && result.success && (
              <button
                onClick={() => setStep(3)}
                className="px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-xs text-white"
              >
                Verify Health
              </button>
            )}
            {step === 3 && (
              <button
                onClick={() => {
                  setStep(0);
                  setResult(null);
                  setVerify(null);
                  setSelectedId(null);
                  onInstalled?.();
                }}
                className="px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-xs text-white"
              >
                Done
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}