import React, { useCallback, useEffect, useState } from "react";
import {
  Blocks,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  BookOpen,
  ShieldAlert,
  Mic,
  Scan,
  Building2,
  RefreshCw,
  Search,
  Lock,
  Power,
  Users,
  AlertCircle,
  Activity,
  Zap,
  ExternalLink,
  Globe,
  Route,
} from "lucide-react";
import { Badge } from "@/components/ui";
import { toast } from "sonner";
import { pluginRuntime, AstraPluginDefinition } from "../../astra/runtime/pluginRuntime";
import { healthService, EcosystemHealthSnapshot } from "../../astra/runtime/healthService";
import { gatewayHealth, GATEWAYS } from "../../services/gatewayManager";
import { openInAstra } from "@/lib/navigation";
import { getService, getServiceIdForPlugin, isHiddenFromDoctor, serviceExternalUrl, serviceHealth } from "@/services/astraServices";
import { CATALOG_NOTE, readableHealth, servicePurpose } from "@/services/healthWords";

const ICONS: Record<string, any> = {
  BookOpen,
  ShieldAlert,
  Mic,
  Scan,
  Building2,
  Cpu,
  Blocks,
  Users,
  RefreshCw,
  Activity,
  Zap,
};

const CATEGORIES = ["All", "Medical", "Hospital", "Models", "Agents", "Voice", "Automation", "Integrations", "Security"];

// ─────────────────────────────────────────────────────────────────────────
// Dual API Gateway entries (Astra AI Plugin Center)
// EXACTLY TWO gateways exist. Ports/URLs come from GATEWAYS (single source
// of truth in gatewayManager.ts) — never re-hardcoded here.
//   #1 FreeLLMAPI = PRIMARY (API + dashboard on its single registry port)
//   #2 OmniRoute  = SECONDARY/SMART FALLBACK (API :20128 /v1 · dashboard :20128/home)
// The "Open Dashboard" buttons open the VERIFIED working dashboard URLs in a
// NEW TAB; they are never part of the API request path. The vite /proxy/*
// routes are API-ONLY. Status dots reflect REAL /v1 API probes, not page loads.
// ─────────────────────────────────────────────────────────────────────────
const GATEWAY_ENTRIES = [
  {
    id: "freellmapi" as const,
    name: GATEWAYS.freellmapi.name,
    roleLabel: "PRIMARY GATEWAY",
    url: GATEWAYS.freellmapi.dashboardUrl,
    dashboardPort: GATEWAYS.freellmapi.dashboardPort,
    apiPort: GATEWAYS.freellmapi.port,
    description: "Local LLM Gateway",
    subLabel: "Local LLM Gateway",
    accent: "cyan" as const,
  },
  {
    id: "omniroute" as const,
    name: GATEWAYS.omniroute.name,
    roleLabel: "SECONDARY / SMART FALLBACK",
    url: GATEWAYS.omniroute.dashboardUrl,
    dashboardPort: GATEWAYS.omniroute.dashboardPort,
    apiPort: GATEWAYS.omniroute.port,
    description: "Intelligent Provider Router",
    accent: "teal" as const,
  },
] as const;

type GatewayHealthState =
  | { kind: "checking" }
  | {
      kind: "online" | "offline";
      latencyMs: number;
      detail: string;
      dashboardOnline: boolean;
      dashboardDetail: string;
    };

function GatewayCard({ g, health, onCheck }: { g: (typeof GATEWAY_ENTRIES)[number]; health: GatewayHealthState; onCheck: () => void }) {
  const [open, setOpen] = useState(false);
  const Icon = g.accent === "cyan" ? Zap : Route;
  const face = health.kind === "checking" ? "Checking" : readableHealth(health.detail, health.kind === "online");
  const purpose = servicePurpose(g.id === "freellmapi" ? "freellmapi" : "omniroute");
  const live = g.id === "freellmapi" && health.kind === "online";
  return (
    <div className="rounded-xl p-2 flex flex-col gap-1 min-w-0 border border-[#1a3a66]" style={{ background: "linear-gradient(180deg, #e7f1fb 0%, #f7fbff 100%)", color: "#102033", fontWeight: 600 }}>
      <button type="button" className="w-full text-left" onClick={() => setOpen((v) => !v)}>
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" />
          <span className="text-sm font-semibold">{g.name}{live ? " \u00b7 Live" : ""}</span>
        </div>
        <div className="text-[11px]">{purpose[0]}</div>
        <div className="text-[11px]">{purpose[1]}</div>
        <div className="text-[11px] truncate">{face}</div>
      </button>
      {open ? (
        <div className="text-[11px]">
          <p>{purpose[0]}</p>
          <p>{purpose[1]}</p>
          <p>{face}</p>
          {health.kind !== "checking" ? <p>Dashboard: {readableHealth(health.dashboardDetail, health.dashboardOnline)}</p> : null}
          <p>Dashboard 127.0.0.1:{g.dashboardPort}</p>
          <p>API Gateway 127.0.0.1:{g.apiPort}{g.apiPort === g.dashboardPort ? " (same process)" : ""}</p>
          {g.id === "freellmapi" && health.kind === "offline" ? <p>Fallback: OmniRoute</p> : null}
        </div>
      ) : null}
      <div className="grid grid-cols-3 gap-1">
        <button type="button" onClick={() => openInAstra(g.id)} className="ab-btn h-8 px-1 rounded-md text-[10px] font-semibold">Open in internal browser</button>
        <a href={g.url} target="_blank" rel="noopener noreferrer" className="ab-btn h-8 px-1 rounded-md text-[10px] font-semibold inline-flex items-center justify-center">Open in external browser</a>
        <button type="button" onClick={onCheck} className="ab-btn h-8 px-1 rounded-md text-[10px] font-semibold">Health</button>
      </div>
    </div>
  );
}

function DualGatewayPanel() {
  const [health, setHealth] = useState<Record<string, GatewayHealthState>>({
    freellmapi: { kind: "checking" },
    omniroute: { kind: "checking" },
  });

  // REAL health: probe the actual /v1 API of each gateway (never the /ui
  // page). FreeLLMAPI is primary; if it is offline the fallback is OmniRoute.
  const probe = useCallback(async () => {
    const settled = await Promise.all(
      GATEWAY_ENTRIES.map(async (g) => {
        const def = GATEWAYS[g.id];
        const h = await gatewayHealth(def, 8000);
        const state: GatewayHealthState = h.online
          ? { kind: "online", latencyMs: h.latencyMs, detail: h.detail, dashboardOnline: h.dashboardOnline, dashboardDetail: h.dashboardDetail }
          : { kind: "offline", latencyMs: h.latencyMs, detail: h.detail, dashboardOnline: h.dashboardOnline, dashboardDetail: h.dashboardDetail };
        return [g.id, state] as const;
      }),
    );
    const results: Record<string, GatewayHealthState> = {};
    for (const [id, state] of settled) results[id] = state;
    setHealth(results);
  }, []);

  useEffect(() => {
    probe();
    const t = setInterval(probe, 15_000);
    return () => clearInterval(t);
  }, [probe]);

  return (
    <div className="ab-card rounded-xl p-2">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Route className="w-4 h-4 text-teal-400" />
          <h3 className="text-sm font-semibold text-slate-100 tracking-wide">Dual API Gateways</h3>
        </div>
        <span className="text-[11px] text-slate-500 font-mono">FreeLLMAPI primary → OmniRoute smart fallback</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {GATEWAY_ENTRIES.map((g) => (
          <GatewayCard key={g.id} g={g} health={health[g.id] ?? { kind: "checking" }} onCheck={() => void probe()} />
        ))}
      </div>
    </div>
  );
}

export function PluginCenter() {
  const [plugins, setPlugins] = useState<AstraPluginDefinition[]>([]);
  const [probes, setProbes] = useState<Record<string, string>>({});
  const [openPlugin, setOpenPlugin] = useState<string | null>(null);
  async function checkPlugin(id: string, svc: NonNullable<ReturnType<typeof getService>>) {
    const h = await serviceHealth(svc, 2500);
    setProbes((prev) => ({ ...prev, [id]: readableHealth(h.detail, h.online) }));
  }
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [healthSnapshot, setHealthSnapshot] = useState<EcosystemHealthSnapshot | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      await pluginRuntime.init();
      const snapshot = await healthService.runCheckCycle();
      setPlugins(pluginRuntime.list());
      setHealthSnapshot(snapshot);
    } catch {
      toast.error("Failed to refresh plugin ecosystem");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    const unsub = healthService.subscribe((snap) => {
      setHealthSnapshot(snap);
      setPlugins(pluginRuntime.list());
    });
    return unsub;
  }, []);

  const handleToggle = async (id: string) => {
    try {
      const updated = await pluginRuntime.toggle(id);
      if (updated) {
        setPlugins([...pluginRuntime.list()]);
        if (updated.status === "ACTIVE") {
          toast.success(`Plugin "${updated.name}" is now ACTIVE. Health was not rechecked by this toggle.`);
        } else if (updated.status === "CONFIG_REQUIRED") {
          toast.warning(`Plugin "${updated.name}" requires configuration: ${updated.missingConfig || "Check settings"}`);
        } else {
          toast.info(`Plugin "${updated.name}" has been DEACTIVATED.`);
        }
      }
    } catch (err: any) {
      toast.error(`Toggle failed: ${err?.message || "Unknown error"}`);
    }
  };

  const filtered = plugins.filter((p) => {
    if (isHiddenFromDoctor(p.id, p.name)) return false;
    const matchCat = selectedCategory === "All" || p.category === selectedCategory;
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase()) ||
      p.capabilities.some((c) => c.toLowerCase().includes(search.toLowerCase()));
    return matchCat && matchSearch;
  });

  return (
    <div className="ab-scroll h-full min-h-0 overflow-y-auto scroll-smooth space-y-5 p-4 w-full min-w-0 font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-700/40 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-teal-500/10 border border-teal-500/30 text-teal-400">
              <Blocks className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Astra Plugin & Extension Center</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Fine-grained permission gates, real-time health checks, and zero-code runtime activation.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={reload}
            disabled={loading}
            className="ab-btn px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh Health
          </button>
        </div>
      </div>

      {/* Dual API Gateways — side-by-side, dashboards open in a NEW TAB */}

      {/* Dual API Gateways — side-by-side, dashboards open in a NEW TAB */}
      <DualGatewayPanel />

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              data-on={selectedCategory === cat ? "1" : "0"} className="ab-btn px-3 py-1.5 rounded-lg text-xs cursor-pointer whitespace-nowrap"
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search plugins & tools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-[#1a3a66] rounded-md text-xs text-[#102033] placeholder-slate-500 focus:outline-none focus:border-[#1a3a66]"
          />
        </div>
      </div>

      {/* Plugin Grid */}
      <div className="grid grid-cols-2 gap-2">
        {filtered.map((p) => {
          const IconComponent = ICONS[p.iconName] || Blocks;
          const isActive = p.status === "ACTIVE";
          const isConfigRequired = p.status === "CONFIG_REQUIRED";

          return (
            <div key={p.id} className="ab-card rounded-xl p-2 min-w-0">
              <button type="button" className="ab-card-hit w-full text-left" onClick={() => setOpenPlugin((id) => (id === p.id ? null : p.id))}>
                <div className="text-sm font-semibold truncate">{p.name}</div>
                {(() => {
                  const sid = getServiceIdForPlugin(p.id);
                  const note = sid && getService(sid) ? servicePurpose(sid) : CATALOG_NOTE;
                  return (
                    <>
                      <p className="text-[11px]">{note[0]}</p>
                      <p className="text-[11px]">{note[1]}</p>
                    </>
                  );
                })()}
                <p className="text-[11px]">{probes[p.id] || (isConfigRequired ? "Not connected. Configuration is missing." : (getServiceIdForPlugin(p.id) && getService(getServiceIdForPlugin(p.id)!) ? "Health not checked yet." : "Catalog card. Not healthy."))}</p>
              </button>
              {openPlugin === p.id ? (
                <div className="mt-1 text-[11px]">
                  <p>Status: {p.status}. Catalog status is not a health result.</p>
                  {p.missingConfig ? <p>{p.missingConfig}</p> : null}
                  {p.capabilities.length ? <p>{p.capabilities.join(", ")}</p> : null}
                </div>
              ) : null}
              {(() => {
                const sid = getServiceIdForPlugin(p.id);
                const svc = sid ? getService(sid) : undefined;
                const external = svc ? serviceExternalUrl(svc) : null;
                if (!svc) return <p className="mt-1 text-[10px]">Catalog card. No open or health action is wired.</p>;
                return (
                  <div className="mt-1 grid grid-cols-3 gap-1">
                    <button type="button" onClick={() => openInAstra(sid!)} className="ab-btn h-8 px-1 rounded-md text-[10px] font-semibold">Open in internal browser</button>
                    <button type="button" disabled={!external} onClick={() => external && window.open(external, "_blank", "noopener,noreferrer")} className="ab-btn h-8 px-1 rounded-md text-[10px] font-semibold">Open in external browser</button>
                    <button type="button" onClick={() => void checkPlugin(p.id, svc)} className="ab-btn h-8 px-1 rounded-md text-[10px] font-semibold">Health</button>
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}
