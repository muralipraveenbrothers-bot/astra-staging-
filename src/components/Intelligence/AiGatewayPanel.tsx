import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw, Zap, ShieldAlert, GitBranch } from "lucide-react";
import { Badge } from "@/components/ui";
import { FREELLMAPI_API_URL } from "@/config/freeLlmEndpoint";

interface ServiceHealth {
  id: string;
  name: string;
  role: string;
  endpoint: string;
  dashboardUrl: string;
  reachable: boolean;
  authenticated: boolean | null;
  models: boolean | null;
  chat: boolean | null;
  latencyMs: number;
  keyConfigured: boolean;
  error?: string;
  checkedAt: string;
}

interface HealthPayload {
  checkedAt: string;
  primary: string;
  fallback: string;
  local?: string;
  adapter?: string;
  services: Record<string, ServiceHealth>;
}

interface ArchitecturePayload {
  adapter?: { endpoint?: string; chain?: Array<{ role: string; id: string; endpoint: string }> };
  agents?: Array<{
    id: string;
    role: string;
    throughAdapter: boolean;
    freeLlmApi: string;
    status: string;
    detail: string;
    target: string;
  }>;
  hermes?: {
    current?: { model?: string | null; provider?: string | null; contextLength?: number | null; requiredContext?: number; compatible?: boolean | null };
    recommended?: { id: string; source: string; contextLength: number | null } | null;
    note?: string;
  };
}

const ORDER = ["freellmapi", "omniroute", "ollama", "hermes", "langgraph", "openclaw", "paperclip", "n8n", "astra"];

function tone(s?: ServiceHealth) {
  if (!s) return "slate";
  if (s.reachable && s.models !== false && s.authenticated !== false) return "green";
  if (s.reachable) return "amber";
  return "red";
}

export function AiGatewayPanel() {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [arch, setArch] = useState<ArchitecturePayload | null>(null);
  const [test, setTest] = useState<unknown>(null);
  const [busy, setBusy] = useState<"health" | "test" | "all" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<unknown>(null);
  const [dispatch, setDispatch] = useState<unknown>(null);
  const [worker, setWorker] = useState("langgraph");

  const loadHealth = useCallback(async () => {
    setBusy("health");
    setError(null);
    try {
      const [h, a] = await Promise.all([fetch("/api/health/ai"), fetch("/api/ai/architecture")]);
      if (!h.ok) throw new Error(`HTTP ${h.status}`);
      setHealth(await h.json());
      if (a.ok) setArch(await a.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
    const t = setInterval(() => void loadHealth(), 15000);
    return () => clearInterval(t);
  }, [loadHealth]);

  const runTest = async (all: boolean) => {
    setBusy(all ? "all" : "test");
    setError(null);
    try {
      const res = await fetch(all ? "/api/ai/test-all" : "/api/ai/test", { method: "POST" });
      const data = await res.json();
      setTest(data);
      if (all && data.health) setHealth(data.health);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const runDistribute = async () => {
    setBusy("apply");
    setError(null);
    try {
      const res = await fetch("/api/ai/distribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input:
            "Doctor help: synthetic adult, fever, rust sputum, RR 32, SpO2 90% on air. Analyse for hospital/patient/doctor. Do not admit or prescribe.",
        }),
      });
      setDispatch(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const runDispatch = async () => {
    setBusy("apply");
    setError(null);
    try {
      const res = await fetch("/api/ai/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          worker,
          input:
            worker === "langgraph"
              ? "Clinical workflow: community-acquired pneumonia with SpO2 90%."
              : worker === "inference"
                ? "Reply with exactly: ASTRA_AI_OK"
                : `${worker} worker status from Astra command center`,
        }),
      });
      setDispatch(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const applyBindings = async () => {
    setBusy("apply");
    setError(null);
    try {
      const res = await fetch("/api/ai/adapters/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, targets: ["sidecars", "hermes", "openclaw"] }),
      });
      const data = await res.json();
      setApplyResult(data);
      if (!res.ok) setError(typeof data.error === "string" ? data.error : "Apply refused");
      await loadHealth();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const hermes = arch?.hermes;
  const hermesOk = hermes?.current?.compatible === true;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 shadow-xl space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-white">ASTRA AI CORE · Central Adapter</h2>
            <p className="text-[10px] text-slate-400">
              Astra is the command center. Workers: Hermes / LangGraph / Paperclip / OpenClaw. Inference: FreeLLMAPI → OmniRoute → Ollama.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => void loadHealth()}
            className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-[11px] text-slate-200 flex items-center gap-1"
          >
            <RefreshCw className={`w-3 h-3 ${busy === "health" ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button
            onClick={() => void runTest(false)}
            disabled={busy !== null}
            className="px-2 py-1 rounded bg-cyan-700/40 border border-cyan-500/40 text-[11px] text-cyan-100 flex items-center gap-1"
          >
            <Zap className="w-3 h-3" /> Test AI Connection
          </button>
          <button
            onClick={() => void runTest(true)}
            disabled={busy !== null}
            className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-[11px] text-slate-200"
          >
            Test All Services
          </button>
          <button
            onClick={() => void applyBindings()}
            disabled={busy !== null}
            className="px-2 py-1 rounded bg-amber-700/30 border border-amber-500/40 text-[11px] text-amber-100 flex items-center gap-1"
            title="Writes Hermes/OpenClaw provider configs only if a discovered model has context ≥ 64K"
          >
            <GitBranch className="w-3 h-3" /> Bind agents
          </button>
          <select
            value={worker}
            onChange={(e) => setWorker(e.target.value)}
            className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-[11px] text-slate-200"
          >
            {["langgraph", "inference", "hermes", "paperclip", "openclaw", "n8n"].map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
          <button
            onClick={() => void runDispatch()}
            disabled={busy !== null}
            className="px-2 py-1 rounded bg-indigo-700/40 border border-indigo-500/40 text-[11px] text-indigo-100"
          >
            Dispatch worker
          </button>
          <button
            onClick={() => void runDistribute()}
            disabled={busy !== null}
            className="px-2 py-1 rounded bg-emerald-700/40 border border-emerald-500/40 text-[11px] text-emerald-100"
          >
            Distribute hospital work
          </button>
        </div>
      </div>

      {error && (
        <div className="text-[11px] text-rose-300 flex items-center gap-1">
          <ShieldAlert className="w-3 h-3" /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-[10px]">
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-2.5">
          <div className="text-cyan-300 font-bold uppercase">Core</div>
          <div className="text-slate-300 mt-1">Command / Policy · Clinical Safety · Memory / Context</div>
        </div>
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-2.5">
          <div className="text-emerald-300 font-bold uppercase">Primary</div>
          <div className="text-slate-300 mt-1 font-mono">{health?.services?.freellmapi?.endpoint ?? FREELLMAPI_API_URL}</div>
        </div>
        <div className="rounded-xl border border-teal-500/30 bg-teal-500/5 p-2.5">
          <div className="text-teal-300 font-bold uppercase">Fallback</div>
          <div className="text-slate-300 mt-1 font-mono">{health?.services?.omniroute?.endpoint ?? "OmniRoute :20128/v1"}</div>
        </div>
        <div className="rounded-xl border border-slate-600 bg-slate-950/60 p-2.5">
          <div className="text-slate-300 font-bold uppercase">Local fallback</div>
          <div className="text-slate-400 mt-1 font-mono">{health?.services?.ollama?.endpoint ?? "Ollama :11434/v1"}</div>
        </div>
      </div>

      {hermes && (
        <div className={`rounded-xl border p-2.5 text-[11px] ${hermesOk ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"}`}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="font-bold text-white">Hermes context gate</span>
            <Badge tone={hermesOk ? "green" : "amber"}>{hermesOk ? "COMPATIBLE" : "CONFIGURATION REQUIRED"}</Badge>
          </div>
          <div className="text-slate-300 mt-1 font-mono">
            current {hermes.current?.model ?? "—"} @ {hermes.current?.provider ?? "—"} · window{" "}
            {hermes.current?.contextLength?.toLocaleString("en-US") ?? "unknown"} / required{" "}
            {hermes.current?.requiredContext?.toLocaleString("en-US") ?? "64,000"}
          </div>
          <div className="text-slate-400 mt-1">
            {hermes.recommended
              ? `Discovered ≥64K model: ${hermes.recommended.id} on ${hermes.recommended.source} (${hermes.recommended.contextLength?.toLocaleString("en-US")} tokens).`
              : "No discovered model meets Hermes' 64K minimum — will not reconnect to qwen3:14b."}
          </div>
          {hermes.note && <div className="text-amber-200/90 mt-1">{hermes.note}</div>}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 xl:grid-cols-10 gap-2">
        {ORDER.map((id) => {
          const s = health?.services?.[id];
          const t = tone(s);
          return (
            <div key={id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-2.5">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-bold text-white truncate">{s?.name ?? id}</span>
                <Badge tone={t === "green" ? "green" : t === "amber" ? "amber" : "red"}>
                  {s?.reachable ? (s.authenticated === false ? "AUTH" : "ON") : "OFF"}
                </Badge>
              </div>
              <div className="text-[9px] text-slate-500 truncate mt-0.5">{s?.role}</div>
              <div className="text-[10px] text-slate-400 mt-1 font-mono truncate">{s?.endpoint}</div>
              <div className="text-[10px] text-slate-500 mt-1">
                {s ? `${s.latencyMs}ms` : "—"} · key {s?.keyConfigured ? "set" : "missing"}
              </div>
              {s?.error && <div className="text-[9px] text-amber-400/90 mt-1 truncate">{s.error}</div>}
            </div>
          );
        })}
      </div>

      {arch?.agents && (
        <div className="overflow-auto rounded-xl border border-slate-800">
          <table className="w-full text-[10px] text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase">
              <tr>
                <th className="text-left p-2">Component</th>
                <th className="text-left p-2">Role in Astra</th>
                <th className="text-left p-2">FreeLLMAPI?</th>
                <th className="text-left p-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {arch.agents.map((a) => (
                <tr key={a.id} className="border-t border-slate-800">
                  <td className="p-2 font-bold text-white">{a.id}</td>
                  <td className="p-2">{a.role}</td>
                  <td className="p-2">{a.throughAdapter ? a.freeLlmApi : "No — cloud API"}</td>
                  <td className="p-2">
                    <Badge tone={a.status === "READY" || a.status === "IN_PROCESS" ? "green" : a.status === "CLOUD" ? "cyan" : "amber"}>
                      {a.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dispatch != null && (
        <pre className="text-[10px] text-slate-300 bg-slate-950/80 border border-indigo-900/60 rounded-lg p-2 max-h-48 overflow-auto">
          {JSON.stringify(dispatch, null, 2)}
        </pre>
      )}

      {applyResult != null && (
        <pre className="text-[10px] text-slate-300 bg-slate-950/80 border border-slate-800 rounded-lg p-2 max-h-36 overflow-auto">
          {JSON.stringify(applyResult, null, 2)}
        </pre>
      )}

      {test != null && (
        <pre className="text-[10px] text-slate-300 bg-slate-950/80 border border-slate-800 rounded-lg p-2 max-h-48 overflow-auto">
          {JSON.stringify(test, null, 2)}
        </pre>
      )}
    </div>
  );
}
