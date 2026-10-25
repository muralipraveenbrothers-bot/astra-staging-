/**
 * ASTRA SAARATHI — Truthful provider status panel (§14 / §19).
 * ===========================================================
 * Every value comes from `useProviderStatus()`, which reads real probes and the
 * providers actually used by the last turn. There is no hard-coded ACTIVE,
 * CONNECTED, ONLINE or READY anywhere in this file — a row is green only when the
 * probe that produced it succeeded.
 */

import { Cpu, Ear, Volume2, Activity, RefreshCw, ShieldAlert } from "lucide-react";
import { useProviderStatus, type BrainProviderStatus } from "./useProviderStatus";
import { stateLabel } from "@/astra/voice/providers/voiceContracts";

const STATE_STYLE: Record<string, { dot: string; text: string }> = {
  READY: { dot: "bg-emerald-400", text: "text-emerald-300" },
  ACTIVE: { dot: "bg-cyan-300 animate-pulse", text: "text-cyan-200" },
  DEGRADED: { dot: "bg-amber-400", text: "text-amber-300" },
  OFF: { dot: "bg-slate-500", text: "text-slate-400" },
  OFFLINE: { dot: "bg-slate-500", text: "text-slate-400" },
  ERROR: { dot: "bg-rose-500", text: "text-rose-300" },
  DISABLED: { dot: "bg-slate-600", text: "text-slate-500" },
  NOT_CONFIGURED: { dot: "bg-violet-400/70", text: "text-violet-300" },
  CHECKING: { dot: "bg-cyan-400/60 animate-pulse", text: "text-cyan-300" },
};

function stateStyle(state: string) {
  return STATE_STYLE[state.toUpperCase()] ?? STATE_STYLE.CHECKING;
}

function Row({ label, value, detail }: { label: string; value: string; detail?: string }) {
  const style = stateStyle(value);
  return (
    <div className="flex items-start gap-2 py-0.5" title={detail}>
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
      <span className="w-[104px] shrink-0 text-[10px] text-slate-500">{label}</span>
      <span className={`text-[10px] font-semibold ${style.text}`}>{value}</span>
      {detail ? <span className="ml-auto max-w-[190px] truncate text-[9px] text-slate-600">{detail}</span> : null}
    </div>
  );
}

function BrainRow({ provider }: { provider: BrainProviderStatus }) {
  const style = stateStyle(provider.state);
  return (
    <div className="flex items-start gap-2 py-0.5" title={provider.detail}>
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
      <span className="w-[104px] shrink-0 truncate text-[10px] text-slate-500">{provider.id}</span>
      <span className={`text-[10px] font-semibold ${style.text}`}>{stateLabel(provider.state)}</span>
      {provider.latencyMs ? (
        <span className="ml-auto text-[9px] text-slate-600">{provider.latencyMs} ms</span>
      ) : provider.detail ? (
        <span className="ml-auto max-w-[190px] truncate text-[9px] text-slate-600">{provider.detail}</span>
      ) : null}
    </div>
  );
}

export function SaarathiProviderStatus({ compact = false }: { compact?: boolean }) {
  const status = useProviderStatus();

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-cyan-400" />
          <span className="text-sm font-semibold text-slate-100">Saarathi Provider Status</span>
        </div>
        <div className="flex items-center gap-2">
          {status.error ? (
            <span title={status.error} className="inline-flex">
              <ShieldAlert size={12} className="text-amber-400" aria-label={status.error} />
            </span>
          ) : null}
          <span className="text-[9px] text-slate-600">
            {status.checking ? "checking…" : `updated ${new Date(status.checkedAt).toLocaleTimeString()}`}
          </span>
          <RefreshCw size={11} className="text-slate-600" />
        </div>
      </div>

      {!compact && (
        <p className="mb-3 text-[10px] text-slate-500">
          Real probes only — a service shows READY when it actually answered a health check, and ACTIVE
          only when it produced output for the current turn. Refreshes every 10 seconds.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <div className="mb-1 flex items-center gap-1.5">
            <Cpu size={11} className="text-cyan-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Brain</span>
          </div>
          {status.brain.length === 0 ? (
            <p className="text-[10px] text-slate-600">{status.checking ? "probing…" : "no providers reported"}</p>
          ) : (
            status.brain.map((p) => <BrainRow key={p.id} provider={p} />)
          )}
        </div>

        <div>
          <div className="mb-1 flex items-center gap-1.5">
            <Volume2 size={11} className="text-yellow-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Voice output</span>
          </div>
          {status.tts.map((p) => (
            <Row key={p.id} label={p.label} value={stateLabel(p.state)} detail={p.detail} />
          ))}
          {status.lastTtsProvider ? (
            <div className="mt-1 border-t border-slate-800 pt-1 text-[9px] text-slate-600">
              current speaker: <span className="font-mono text-slate-400">{status.lastTtsProvider}</span>
            </div>
          ) : null}
        </div>

        <div>
          <div className="mb-1 flex items-center gap-1.5">
            <Ear size={11} className="text-emerald-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Voice input</span>
          </div>
          {status.stt.map((p) => (
            <Row key={p.id} label={p.label} value={stateLabel(p.state)} detail={p.detail} />
          ))}
          <div className="mt-1 text-[9px] text-slate-600">
            primary: <span className="font-mono text-slate-400">Voicebox Whisper (local)</span>
          </div>
          {status.lastSttProvider ? (
            <div className="text-[9px] text-slate-600">
              last ear: <span className="font-mono text-slate-400">{status.lastSttProvider}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default SaarathiProviderStatus;