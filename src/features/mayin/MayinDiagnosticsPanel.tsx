import { useCallback, useEffect, useRef, useState } from "react";
import { Cpu, RefreshCw, X } from "lucide-react";
import {
  createMayinRuntime,
  type MayinRuntime,
  type MayinRuntimeDiagnostics,
} from "./runtime/MayinRuntime";
import { summarizeDiagnostics, type DiagnosticRow } from "./diagnosticsSummary";

const TONE_CLASS: Record<DiagnosticRow["tone"], string> = {
  ok: "text-emerald-400",
  warn: "text-amber-400",
  error: "text-rose-400",
  neutral: "text-slate-200",
};

/** One shared runtime — constructed lazily, per MayinRuntime's contract. */
let sharedRuntime: MayinRuntime | null = null;
function getSharedRuntime(): MayinRuntime {
  if (!sharedRuntime) {
    sharedRuntime = createMayinRuntime({
      // Loopback Cognee bridge (§47 local-first). If it is down, adapter
      // health() reports unreachable — the panel shows that honestly.
      cogneeBaseUrl: "http://127.0.0.1:8792",
    });
  }
  return sharedRuntime;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`diagnostics timeout after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/**
 * Observation-only diagnostics overlay. NEVER starts voice, camera or
 * gesture — it only reads getDiagnostics(); subsystems show their real
 * state (usually "not started") until the main screen starts them.
 */
export function MayinDiagnosticsPanel({ onClose }: { onClose: () => void }) {
  const [diag, setDiag] = useState<MayinRuntimeDiagnostics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      // Memory probe is a real loopback fetch — cap it so a hung bridge
      // can never freeze this panel.
      const result = await withTimeout(getSharedRuntime().getDiagnostics(), 8_000);
      setDiag(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const rows = diag ? summarizeDiagnostics(diag) : [];

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-white/10 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
          <div className="flex items-center gap-2 text-slate-100">
            <Cpu className="w-4 h-4 text-emerald-400" />
            <h3 className="font-semibold text-sm tracking-wide">MAYIN RUNTIME DIAGNOSTICS</h3>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => void refresh()}
              disabled={busy}
              className="text-slate-400 hover:text-slate-200 disabled:opacity-50"
              title="Refresh now (also auto-refreshes every 15s)"
            >
              <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} />
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-200" title="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {error && <p className="text-rose-400 text-sm mb-3">{error}</p>}
          {!diag && !error && <p className="text-slate-400 text-sm">Probing subsystems…</p>}
          {diag && (
            <table className="w-full text-sm">
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-b border-white/5 last:border-0">
                    <td className="py-1.5 pr-4 text-slate-400 align-top w-[42%]">{r.label}</td>
                    <td className={`py-1.5 align-top break-words ${TONE_CLASS[r.tone]}`}>{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-[11px] text-slate-500 mt-4">
            Observation only — this panel never starts voice, camera or gesture subsystems. Laya
            scores are routing confidence, never clinical probability.
          </p>
        </div>
      </div>
    </div>
  );
}
