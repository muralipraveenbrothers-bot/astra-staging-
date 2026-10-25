import { useEffect, useState } from "react";
import { KeyRound, X } from "lucide-react";
import { FREELLMAPI_API_URL } from "../config/freeLlmEndpoint";

interface HealthPayload {
  services?: Record<string, { reachable?: boolean; keyConfigured?: boolean; error?: string; endpoint?: string }>;
}

export function AIRouterSettings({ onClose }: { onClose: () => void }) {
  const [health, setHealth] = useState<HealthPayload | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    void fetch("/api/health/ai")
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth(null));
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const free = health?.services?.freellmapi;
  const omni = health?.services?.omniroute;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="glass w-full max-w-md p-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Astra AI Gateway"
      >
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-900/80 border-b border-white/10">
          <span className="flex items-center gap-2 text-sm font-bold text-slate-100">
            <KeyRound className="w-4 h-4 text-teal-400" /> Astra AI Gateway
          </span>
          <button onClick={onClose} className="btn-ghost !p-1.5 rounded-md" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3 text-sm text-slate-300">
          <p>
            Chat goes to <code className="font-mono text-cyan-300">POST /api/ai/chat</code>. Keys stay on the Astra
            backend — they are not stored in the browser.
          </p>
          <div className="rounded-lg border border-white/10 p-3">
            <div className="text-xs font-semibold text-white">FreeLLMAPI (PRIMARY)</div>
            <div className="text-[11px] font-mono text-slate-400 mt-1">{free?.endpoint ?? FREELLMAPI_API_URL}</div>
            <div className="text-[11px] mt-1">
              {free?.reachable ? "reachable" : "offline"} · key {free?.keyConfigured ? "configured" : "missing"}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 p-3">
            <div className="text-xs font-semibold text-white">OmniRoute (FALLBACK)</div>
            <div className="text-[11px] font-mono text-slate-400 mt-1">{omni?.endpoint ?? "http://127.0.0.1:5171/v1"}</div>
            <div className="text-[11px] mt-1">
              {omni?.reachable ? "reachable" : "offline"} · key {omni?.keyConfigured ? "configured" : "missing"}
            </div>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Set <code className="font-mono">FREELLMAPI_API_KEY</code> and <code className="font-mono">OMNIROUTE_API_KEY</code> in{" "}
            <code className="font-mono">.env.local</code> or <code className="font-mono">config/ai-gateway.env</code>, then
            restart the Astra API on port 3000. See <code className="font-mono">config/ai-gateway.env.example</code>.
          </p>
        </div>
      </div>
    </div>
  );
}

export default AIRouterSettings;
