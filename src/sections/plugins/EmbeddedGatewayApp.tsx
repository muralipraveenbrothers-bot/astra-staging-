import React, { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, RefreshCw, Zap, Route } from "lucide-react";
import { navHash } from "@/lib/hashRoute";
import { GATEWAYS, gatewayHealth } from "@/services/gatewayManager";

/**
 * EmbeddedGatewayApp — mounts a COMPLETE cloned gateway application
 * (FreeLLMAPI / OmniRoute) inside the Astra AI shell.
 *
 * This is NOT a simplified page: it loads the REAL running application
 * (the one and only clone on this machine) at its verified working URL.
 * The clone keeps serving its own origin, so its full navigation,
 * routing, assets, CSS/JS, API calls, auth flow, WebSockets and SSE all
 * work exactly as in standalone mode. Nothing in the clone is modified.
 *
 *   Astra AI route                → real application
 *   /plugins/freellmapi/...       → FreeLLMAPI registry origin (full app)
 *   /plugins/omniroute/...        → http://127.0.0.1:5171/...   (full app)
 *
 * Closing this view never stops the underlying services — they are
 * independent background processes (see server/services/serviceManager).
 */
export function EmbeddedGatewayApp({
  gateway,
  subPath,
}: {
  gateway: "freellmapi" | "omniroute";
  subPath?: string;
}) {
  const def = GATEWAYS[gateway];
  const accent = gateway === "freellmapi"
    ? { text: "text-cyan-300", bg: "bg-cyan-600", ring: "border-cyan-500/30" }
    : { text: "text-teal-300", bg: "bg-teal-600", ring: "border-teal-500/30" };

  // Map the Astra internal sub-path onto the real app path.
  //   /plugins/freellmapi/playground → FreeLLMAPI registry origin/playground
  //   /plugins/omniroute/providers   → http://127.0.0.1:5171/providers
  const prefix = `/plugins/${gateway}`;
  const rest = subPath && subPath.startsWith(prefix) ? subPath.slice(prefix.length) : "";
  const external = new URL(def.dashboardUrl);
  const target = `${external.origin}${rest && rest !== "/" ? rest : external.pathname}`;

  const [online, setOnline] = useState<boolean | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  // OmniRoute now opts in via DASHBOARD_ALLOW_EMBED=astra (frame-ancestors
  // include http://localhost:5173 and :5174). Both gateways iframe inside Astra.
  const embedBlocked = false;

  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      const h = await gatewayHealth(def, 5000);
      if (!cancelled) setOnline(h.online || h.dashboardOnline);
    };
    probe();
    const t = setInterval(probe, 20_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [gateway]);

  const copyUrl = () => {
    navigator.clipboard?.writeText(target).catch(() => {});
  };

  if (embedBlocked) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
        <div className={`flex items-center justify-between h-10 px-3 border-b ${accent.ring} bg-slate-900/90`}>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navHash("/plugins")}
              className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white h-7 px-2.5 rounded-lg border border-slate-700 hover:bg-slate-800 transition-all"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Astra AI
            </button>
            <span className="text-xs font-semibold text-slate-100 inline-flex items-center gap-1.5">
              <Route className="w-3.5 h-3.5" />
              {def.name}
              <span className={`text-[10px] font-bold tracking-wider ${accent.text}`}>{def.role}</span>
            </span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="glass p-6 text-center max-w-lg w-full">
            <Route className={`w-8 h-8 mx-auto mb-3 ${accent.text}`} />
            <p className="text-sm font-semibold text-white">{def.name} Dashboard</p>
            <p className="text-xs text-slate-400 mt-2">
              {def.name} refuses in-app embedding (X-Frame-Options: DENY), so it cannot be
              displayed inside the Astra frame. The service itself is {online === false ? "currently OFFLINE" : "running"} —
              open it directly in your browser at the address below.
            </p>
            <p className="text-xs text-slate-300 font-mono mt-3 break-all select-all">{target}</p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setFrameKey((k) => k + 1)}
                className="inline-flex items-center gap-1.5 text-xs text-slate-300 h-8 px-3 rounded-lg border border-slate-700 hover:bg-slate-800 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </button>
              <button
                onClick={copyUrl}
                className="inline-flex items-center gap-1.5 text-xs text-slate-300 h-8 px-3 rounded-lg border border-slate-700 hover:bg-slate-800 transition-all"
              >
                Copy URL
              </button>
              <a
                href={target}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1.5 text-xs text-white h-8 px-3 rounded-lg ${accent.bg} hover:opacity-90 transition-all`}
              >
                <ExternalLink className="w-3.5 h-3.5" /> Open External
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
      {/* Slim Astra top bar — the app below is the FULL cloned application */}
      <div className={`flex items-center justify-between h-10 px-3 border-b ${accent.ring} bg-slate-900/90`}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navHash("/plugins")}
            className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white h-7 px-2.5 rounded-lg border border-slate-700 hover:bg-slate-800 transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Astra AI
          </button>
          <span className="text-xs font-semibold text-slate-100 inline-flex items-center gap-1.5">
            {gateway === "freellmapi" ? <Zap className="w-3.5 h-3.5" /> : <Route className="w-3.5 h-3.5" />}
            {def.name}
            <span className={`text-[10px] font-bold tracking-wider ${accent.text}`}>
              {def.role} · COMPLETE APPLICATION
            </span>
          </span>
          {online !== null && (
            <span className={`inline-flex items-center gap-1 text-[10px] ${online ? "text-emerald-400" : "text-rose-400"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${online ? "bg-emerald-400" : "bg-rose-500"}`} />
              {online ? "API Online" : "API Offline"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFrameKey((k) => k + 1)}
            title="Reload application view"
            className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white h-7 px-2.5 rounded-lg border border-slate-700 hover:bg-slate-800 transition-all"
          >
            <RefreshCw className="w-3 h-3" /> Reload
          </button>
          <a
            href={target}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-1.5 text-xs text-white h-7 px-2.5 rounded-lg ${accent.bg} hover:opacity-90 transition-all`}
          >
            <ExternalLink className="w-3 h-3" /> Open External
          </a>
        </div>
      </div>

      {/* The REAL application — full clone, full navigation, real assets/auth */}
      <iframe
        key={frameKey}
        src={target}
        title={`${def.name} — complete application`}
        className="flex-1 w-full border-0 bg-white"
        allow="clipboard-read; clipboard-write; microphone; camera"
      />
    </div>
  );
}
