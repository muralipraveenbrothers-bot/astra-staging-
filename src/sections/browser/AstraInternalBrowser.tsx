import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Copy, ExternalLink, Globe, Home, Lock, Plus, RefreshCw,
  RotateCcw, ShieldAlert, TriangleAlert, X, Terminal,
} from "lucide-react";
import { navHash } from "@/lib/hashRoute";
import { ASTRA_SERVICES, astraServiceHash, fetchRuntimeStatus, getService, isHiddenFromDoctor, serviceEmbedSrc, serviceExternalUrl, serviceHealth, type RuntimeLevel, type ServiceDefinition } from "@/services/astraServices";
import { GATEWAYS, gatewayHealth, type GatewayId } from "@/services/gatewayManager";
import { classifyUrl } from "@/lib/browserSecurity";
import { BrowserNervousSystem } from "@/components/browser/BrowserNervousSystem";
import { HOSPITAL_PLACES, parseBrowserCommand } from "@/astra/brain/part4/browser";
import { getRecentServices, type RecentEntry } from "@/lib/navigation";
import { langGraph, type GraphExecution } from "@/lib/agents/core/LangGraphOrchestrator";
import HoloGesturePanel from "./HoloGesturePanel";
import { authHeaders } from "@/services/apiFetch";
import { askDoctorEngine } from "@/services/doctorEngine";
import { readableHealth, servicePurpose } from "@/services/healthWords";

/** Astra Brain work order. Hospital is every remaining registered service. External chats stay last. */
const BRAIN_SERVICE_GROUPS: Array<{ id: string; label: string; ids?: string[] }> = [
  { id: "gateways", label: "AI GATEWAYS", ids: ["freellmapi", "omniroute", "ollama"] },
  { id: "voice", label: "VOICE", ids: ["voicebox"] },
  { id: "clinical", label: "CLINICAL BRAINS", ids: ["laya", "astra-micro", "hermes", "scientist", "clinical-books", "astra-7d"] },
  { id: "hospital", label: "HOSPITAL SERVICES" },
  { id: "external", label: "EXTERNAL CHATS", ids: ["chatgpt", "grok", "kimi"] },
];

function brainServiceGroups(): Array<{ id: string; label: string; services: ServiceDefinition[] }> {
  const visible = ASTRA_SERVICES.filter((svc) => !svc.retired && !isHiddenFromDoctor(svc.id, svc.name));
  const byId = new Map(visible.map((svc) => [svc.id, svc]));
  const claimed = new Set<string>();
  const externalIds = new Set(BRAIN_SERVICE_GROUPS.find((group) => group.id === "external")?.ids ?? []);
  const take = (ids: string[]) => {
    const rows: ServiceDefinition[] = [];
    for (const id of ids) {
      const svc = byId.get(id);
      if (!svc || claimed.has(id)) continue;
      claimed.add(id);
      rows.push(svc);
    }
    return rows;
  };
  return BRAIN_SERVICE_GROUPS.map((group) => {
    if (group.id === "hospital") {
      const services = visible.filter((svc) => !claimed.has(svc.id) && !externalIds.has(svc.id));
      services.forEach((svc) => claimed.add(svc.id));
      return { id: group.id, label: group.label, services };
    }
    return { id: group.id, label: group.label, services: take(group.ids ?? []) };
  }).filter((group) => group.services.length > 0);
}

/**
 * ASTRA AI — INTERNAL BROWSER
 * ============================================================================
 * Tabbed internal browser for ALL Astra-integrated service dashboards.
 * Astra-native chrome (dark enterprise theme) — NOT a Chrome clone.
 *
 *  - Tabs: open / close / switch, per-tab history (back / forward).
 *  - Loading progress + real health probing; never a blank page — a clear
 *    error screen with Retry / Open Settings / Open External.
 *  - Security: every URL passes classifyUrl() — javascript:, vbscript:,
 *    file:, unsafe data: and SSRF-risk targets are blocked. Astra secrets
 *    are never present in the iframe (iframes carry no Astra credentials).
 *  - Performance: lazy-loaded module (React.lazy in App.tsx), per-tab
 *    AbortController probes, listeners cleaned up on unmount.
 */

interface BrowserTab {
  id: string;
  title: string;
  serviceId?: string;
  url: string;
  history: string[];
  historyIndex: number;
  loading: boolean;
  frameKey: number; // bump to force iframe remount (refresh / navigate)
  error: string | null;
  trusted: boolean;
  external: boolean;
  /** Set for Astra-native console tabs (CLI / in-process services — no iframe). */
  consoleFor?: string;
  /** Health probe failed — shown as a banner; iframe still loads. */
  healthWarning?: string | null;
  /** Upstream sent X-Frame-Options / CSP frame-ancestors that block iframes. Not the same as OFFLINE. */
  embedBlocked?: boolean;
  embedBlockReason?: string | null;
  pageState?: "loading" | "ready" | "offline" | "http-error" | "setup-required" | "auth-required" | "embed-blocked" | "cli-only" | "in-process";
}

let tabSeq = 0;
function newTabId() {
  return `tab-${Date.now()}-${++tabSeq}`;
}

type OkVerdict = Extract<ReturnType<typeof classifyUrl>, { kind: "ok" }>;

function makeConsoleTab(svc: ServiceDefinition): BrowserTab {
  return {
    id: newTabId(),
    title: `${svc.name} · Console`,
    serviceId: svc.id,
    url: "",
    history: [],
    historyIndex: 0,
    loading: false,
    frameKey: 0,
    error: null,
    trusted: false,
    external: false,
    consoleFor: svc.id,
    pageState: svc.statusKind === "cli" ? "cli-only" : svc.statusKind === "in-process" ? "in-process" : svc.statusKind === "external" ? "ready" : "setup-required",
  };
}

function hostLabel(url: string, fallback?: string): string {
  if (url.startsWith("/proxy/")) {
    const id = url.slice("/proxy/".length).split("/")[0];
    return fallback ?? id ?? "Astra service";
  }
  if (url.startsWith("/")) return fallback ?? "Astra";
  try {
    return new URL(url).hostname;
  } catch {
    return fallback ?? "Tab";
  }
}

function makeTab(url: string, serviceId?: string, title?: string): BrowserTab {
  const verdict = classifyUrl(url);
  const ok = verdict.kind === "ok";
  const okUrl = ok ? (verdict as OkVerdict).url : url;
  return {
    id: newTabId(),
    title: title ?? (ok ? hostLabel(okUrl, title) : "Blocked"),
    serviceId,
    url: okUrl,
    history: [okUrl],
    historyIndex: 0,
    loading: ok,
    frameKey: 0,
    error: ok ? null : (verdict.kind === "blocked" ? verdict.reason : "Blocked"),
    trusted: ok ? (verdict as OkVerdict).trusted : false,
    external: ok ? (verdict as OkVerdict).external : false,
    healthWarning: null,
    embedBlocked: false,
    embedBlockReason: null,
    pageState: "loading",
  };
}

export default function AstraInternalBrowser({
  initialService,
  initialUrl,
  initialPath,
}: {
  initialService?: string | null;
  initialUrl?: string | null;
  initialPath?: string | null;
}) {
  const buildInitial = useCallback((): BrowserTab[] => {
    if (initialService) {
      const svc = getService(initialService);
      if (svc) {
        // CLI / in-process services have NO web dashboard — open their Astra-native
        // console tab instead (restores HermesConsole / LangGraphConsole on direct URL).
        if (svc.statusKind === "cli" || svc.statusKind === "in-process" || svc.statusKind === "not-installed" || svc.statusKind === "external" || !svc.supportsEmbed) {
          return [makeConsoleTab(svc)];
        }
        const base = serviceEmbedSrc(svc);
        let target = base;
        if (initialPath) {
          const path = initialPath.startsWith("/") ? initialPath : `/${initialPath}`;
          if (svc.embedViaProxy && svc.proxyPrefix) {
            target = `${svc.proxyPrefix}${path}`;
          } else if (base.startsWith("/")) {
            target = base;
          } else {
            try {
              target = `${new URL(svc.dashboardUrl || svc.baseUrl).origin}${path}`;
            } catch {
              target = base;
            }
          }
        }
        return [makeTab(target, svc.id, svc.name)];
      }
    }
    if (initialUrl) return [makeTab(initialUrl)];
    return [];
  }, [initialService, initialUrl, initialPath]);

  const [tabs, setTabs] = useState<BrowserTab[]>(buildInitial);
  const [activeId, setActiveId] = useState<string | null>(() => tabs[0]?.id ?? null);
  const [urlInput, setUrlInput] = useState("");
  const [progress, setProgress] = useState(0);
  const [homeHealth, setHomeHealth] = useState<Record<string, RuntimeLevel>>({});
  const [homeDetails, setHomeDetails] = useState<Record<string, string>>({});
  const [healthVerdict, setHealthVerdict] = useState<Record<string, "up" | "down" | "checking">>({});
  const [openHome, setOpenHome] = useState<string | null>(null);
  const [recents, setRecents] = useState<RecentEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const active = useMemo(() => tabs.find((t) => t.id === activeId) ?? null, [tabs, activeId]);

  const chromeUrl = (tab: BrowserTab | null) => {
    if (!tab) return "";
    if (tab.consoleFor) {
      return `${typeof window !== "undefined" ? window.location.origin : ""}/#${astraServiceHash(tab.consoleFor)}`;
    }
    if (tab.serviceId) {
      return `${typeof window !== "undefined" ? window.location.origin : ""}/#${astraServiceHash(tab.serviceId)}`;
    }
    return tab.url;
  };

  // Keep the URL bar on the Astra main URL (never a raw localhost:PORT jump).
  // Skip while the user is editing the field — rewriting it every probe/render
  // is what made the address bar blink.
  useEffect(() => {
    if (document.activeElement === inputRef.current) return;
    const next = chromeUrl(active);
    setUrlInput((prev) => (prev === next ? prev : next));
  }, [active?.url, active?.id, active?.serviceId, active?.consoleFor]);

  // Loading progress — settles to a defined state, never blank.
  useEffect(() => {
    if (!active?.loading) return;
    setProgress(10);
    const t = setInterval(() => setProgress((p) => Math.min(p + 8, 90)), 250);
    const done = setTimeout(() => {
      clearInterval(t);
      setProgress(0);
      setTabs((prev) => prev.map((tb) => (tb.id === active.id ? { ...tb, loading: false } : tb)));
    }, 2500);
    return () => {
      clearInterval(t);
      clearTimeout(done);
    };
  }, [active?.id, active?.loading, active?.frameKey]);

  // Real health probe for the active tab's service (cleanup-safe).
  useEffect(() => {
    if (!active || !active.serviceId || !active.loading) return;
    const svc = getService(active.serviceId);
    if (!svc) return;
    const controller = new AbortController();
    const probe = async () => {
      const isGw = svc.id === "freellmapi" || svc.id === "omniroute";
      if (isGw) {
        const g = await gatewayHealth(GATEWAYS[svc.id as GatewayId], 4000);
        return { online: g.online || g.dashboardOnline, detail: g.detail || g.dashboardDetail, latencyMs: g.latencyMs };
      }
      return serviceHealth(svc, 1500);
    };
    probe().then(async (h) => {
      if (controller.signal.aborted) return;
      let embedBlocked = false;
      let embedBlockReason: string | null = null;
      let pageState: BrowserTab["pageState"] = h.online ? "ready" : "offline";
      if (/401|403|unauthor/i.test(h.detail)) pageState = "auth-required";
      else if (/HTTP 5/.test(h.detail)) pageState = "http-error";
      // Detect iframe-blocking headers without stripping them. Same-origin
      // proxy fetch can read X-Frame-Options; a CORS failure is NOT treated
      // as offline (the iframe may still load).
      if (h.online && svc.supportsEmbed) {
        const probeUrl = svc.embedViaProxy && svc.proxyPrefix
          ? `${svc.proxyPrefix}/`
          : (svc.healthPath && svc.healthPath.startsWith("/") ? svc.healthPath : null);
        if (probeUrl) {
          try {
            const r = await fetch(probeUrl, { method: "GET", signal: AbortSignal.timeout(1500) });
            const xfo = r.headers.get("x-frame-options") || "";
            const csp = r.headers.get("content-security-policy") || "";
            const xfoL = xfo.toLowerCase();
            const ancestors = /frame-ancestors\s+([^;]+)/i.exec(csp)?.[1] ?? "";
            const blocksFrame =
              xfoL.includes("deny")
              || (xfoL.includes("sameorigin") && !svc.embedViaProxy)
              || /frame-ancestors\s+'none'/i.test(csp)
              || (ancestors.length > 0 && !/self|localhost:5173|127\.0\.0\.1:5173|\*/i.test(ancestors));
            if (blocksFrame) {
              embedBlocked = true;
              embedBlockReason = `Security headers block embedding (${xfo || csp || "frame-ancestors"}). Service is still running.`;
              pageState = "embed-blocked";
            }
          } catch {
            /* CORS / network on the header probe is not an offline signal */
          }
        }
      }
      if (controller.signal.aborted) return;
      setTabs((prev) =>
        prev.map((tb) =>
          tb.id === active.id
            ? {
                ...tb,
                healthWarning: h.online ? null : `${svc.name} health probe: ${h.detail}. Loading the dashboard anyway.`,
                embedBlocked,
                embedBlockReason,
                pageState,
              }
            : tb,
        ),
      );
    });
    return () => controller.abort();
  }, [active?.id, active?.loading, active?.serviceId]);

  // Home screen: ONE server-side probe of real loopback ports (not Vite 404s).
  // CLI / in-process / external kinds are never painted LIVE from a network miss.
  useEffect(() => {
    if (tabs.length > 0) return;
    setRecents(getRecentServices());
    const controller = new AbortController();
    let checking = false;
    const run = async () => {
      if (checking || controller.signal.aborted) return;
      checking = true;
      // The server probes every loopback port before answering. A COLD
      // /api/runtime/status takes ~12s (subsequent calls are served from the
      // server's cache in <10ms). This budget used to be 8000ms, so on a cold
      // load the fetch aborted before the API replied, fetchRuntimeStatus fell
      // into its catch and reported only `astra-api: offline`, and the grid
      // dropped to the slower per-service client probes. Keep this above the
      // server's worst-case cold probe.
      const fromServer = await fetchRuntimeStatus(20000);
      if (controller.signal.aborted) return;
      const results: Record<string, RuntimeLevel> = {};
      const details: Record<string, string> = {};
      const web = ASTRA_SERVICES.filter((svc) => (!svc.statusKind || svc.statusKind === "web") && !svc.retired && !isHiddenFromDoctor(svc.id, svc.name));
      const apiUp = fromServer["astra-api"]?.online === true;
      if (apiUp) {
        for (const svc of web) {
          const s = fromServer[svc.id];
          if (svc.id === "astra-micro" || svc.id === "astra-7d" || svc.statusKind === "external") {
            results[svc.id] = "offline";
            details[svc.id] = svc.id === "astra-micro"
              ? "Not connected. Offline training model. Not a live service."
              : svc.id === "astra-7d"
                ? "Not connected as its own service. Symptom-to-plan text is written inside a clinical answer."
                : "Not an Astra connection. This is an outside website.";
          } else {
            results[svc.id] = s?.level ?? "offline";
            details[svc.id] = readableHealth(s?.detail, s?.online);
          }
        }
      } else {
        results["astra-api"] = "offline";
        details["astra-api"] = fromServer["astra-api"]?.detail ?? "Astra API unreachable";
        const settled = await Promise.all(
          web.filter((s) => s.id !== "astra-api").map(async (svc) => {
            const h = await serviceHealth(svc, 2500);
            details[svc.id] = readableHealth(h.detail, h.online);
            return [svc.id, h.level] as const;
          }),
        );
        for (const [id, level] of settled) results[id] = level;
      }
      if (controller.signal.aborted) return;
      setHomeHealth(results);
      setHomeDetails(details);
      checking = false;
    };
    void run();
    const iv = setInterval(() => void run(), 15000);
    return () => {
      controller.abort();
      clearInterval(iv);
    };
  }, [tabs.length]);

  const patchTab = useCallback((id: string, patch: Partial<BrowserTab>) => {
    setTabs((prev) => prev.map((tb) => (tb.id === id ? { ...tb, ...patch } : tb)));
  }, []);

  const navigateTo = useCallback(
    (rawUrl: string, tabId?: string) => {
      const verdict = classifyUrl(rawUrl);
      if (verdict.kind === "blocked") {
        if (tabId) patchTab(tabId, { loading: false, error: verdict.reason });
        return false;
      }
      const id = tabId ?? activeId;
      if (!id) {
        const tab = makeTab(verdict.url);
        setTabs((prev) => [...prev, tab]);
        setActiveId(tab.id);
        return true;
      }
      setTabs((prev) =>
        prev.map((tb) => {
          if (tb.id !== id) return tb;
          const history = [...tb.history.slice(0, tb.historyIndex + 1), verdict.url];
          const svcMatch = verdict.trusted
            ? ASTRA_SERVICES.find((s) => {
                if (verdict.url.startsWith("/proxy/") && s.proxyPrefix && verdict.url.startsWith(s.proxyPrefix)) return true;
                try {
                  return (s.dashboardUrl || s.baseUrl).startsWith(new URL(verdict.url).origin);
                } catch {
                  return false;
                }
              })
            : undefined;
          return {
            ...tb,
            url: verdict.url,
            history,
            historyIndex: history.length - 1,
            loading: true,
            error: null,
            frameKey: tb.frameKey + 1,
            trusted: verdict.trusted,
            external: verdict.external,
            title: svcMatch?.name ?? hostLabel(verdict.url),
          };
        }),
      );
      return true;
    },
    [activeId, patchTab],
  );

  const goBack = useCallback(() => {
    if (!active || active.historyIndex <= 0) return;
    const idx = active.historyIndex - 1;
    patchTab(active.id, { historyIndex: idx, url: active.history[idx], loading: true, error: null, frameKey: active.frameKey + 1 });
  }, [active, patchTab]);

  const goForward = useCallback(() => {
    if (!active || active.historyIndex >= active.history.length - 1) return;
    const idx = active.historyIndex + 1;
    patchTab(active.id, { historyIndex: idx, url: active.history[idx], loading: true, error: null, frameKey: active.frameKey + 1 });
  }, [active, patchTab]);

  const refresh = useCallback(() => {
    if (!active) return;
    patchTab(active.id, { loading: true, error: null, frameKey: active.frameKey + 1 });
  }, [active, patchTab]);

  const stop = useCallback(() => {
    if (!active) return;
    patchTab(active.id, { loading: false });
    setProgress(0);
  }, [active, patchTab]);

  const closeTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const next = prev.filter((tb) => tb.id !== id);
        if (id === activeId) setActiveId(next[next.length - 1]?.id ?? null);
        return next;
      });
    },
    [activeId],
  );

  const openServiceTab = useCallback((svc: ServiceDefinition) => {
    if (!svc.supportsEmbed || svc.statusKind === "cli" || svc.statusKind === "in-process" || svc.statusKind === "not-installed" || svc.statusKind === "external") {
      const tab = makeConsoleTab(svc);
      setTabs((prev) => [...prev, tab]);
      setActiveId(tab.id);
      return;
    }
    const tab = makeTab(serviceEmbedSrc(svc), svc.id, svc.name);
    setTabs((prev) => [...prev, tab]);
    setActiveId(tab.id);
  }, []);

  const openConsoleTab = useCallback((svc: ServiceDefinition) => {
    const tab = makeConsoleTab(svc);
    setTabs((prev) => [...prev, tab]);
    setActiveId(tab.id);
  }, []);

  const handleCardClick = useCallback(
    (svc: ServiceDefinition) => {
      if ((!svc.statusKind || svc.statusKind === "web") && svc.supportsEmbed) {
        openServiceTab(svc);
      } else {
        openConsoleTab(svc);
      }
    },
    [openServiceTab, openConsoleTab],
  );

  // Keyboard shortcuts — never shadow existing Astra shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === "l" && mod) {
        e.preventDefault();
        inputRef.current?.select();
      } else if (e.key === "r" && mod) {
        e.preventDefault();
        refresh();
      } else if (e.key === "t" && mod) {
        e.preventDefault();
        setActiveId(null);
      } else if (e.key === "w" && mod && activeId) {
        e.preventDefault();
        closeTab(activeId);
      } else if (e.altKey && e.key === "ArrowLeft") {
        goBack();
      } else if (e.altKey && e.key === "ArrowRight") {
        goForward();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [refresh, goBack, goForward, closeTab, activeId]);

  // Home screen — service grid with LIVE health, recents, preserved ports.
  if (!active) {
    return (
      <div className="ab-scroll h-full min-h-0 overflow-y-auto scroll-smooth p-4">
        <div className="w-full min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Globe className="w-5 h-5 text-cyan-300" />
            <h1 className="text-lg font-semibold text-slate-100">Astra Internal Workspace</h1>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => navHash("/plugins")}
                className="ab-btn h-9 px-3 rounded-lg text-xs"
              >
                Plugin Center
              </button>
              <button
                type="button"
                onClick={() => navHash("/plugin-manager")}
                className="ab-btn h-9 px-3 rounded-lg text-xs"
              >
                Plugin Manager
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-400 mb-5">
            Every Astra-integrated service opens here — inside Astra, at its existing verified URL. Ports are preserved, never reconfigured.
          </p>
          <BrowserNervousSystem
            onOpenService={(serviceId) => {
              const svc = getService(serviceId);
              if (svc) handleCardClick(svc);
            }}
            onOpenHash={(hash) => navHash(hash)}
          />
          {recents.length > 0 && (
            <div className="mb-6">
              <h2 className="text-[11px] font-bold tracking-wider text-slate-500 mb-2">RECENTLY OPENED</h2>
              <div className="flex flex-wrap gap-2">
                {recents.filter((r) => !isHiddenFromDoctor(r.serviceId, r.name)).map((r) => (
                  <button
                    key={r.url}
                    onClick={() => {
                      const svc = r.serviceId ? getService(r.serviceId) : undefined;
                      if (svc) handleCardClick(svc);
                      else if (r.url.startsWith("/browser")) navHash(r.url);
                      else navigateTo(r.url);
                    }}
                    className="ab-btn text-xs px-3 h-9 rounded-lg"
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {brainServiceGroups().map((cat) => {
            const catServices = cat.services;
            if (catServices.length === 0) return null;
            return (
              <div key={cat.id} className="mb-2 min-w-0">
                <h2 className="text-[11px] font-bold tracking-wider mb-1">{cat.label}</h2>
                <div className="grid grid-cols-2 gap-2">
                  {catServices.map((svc) => {
                    const purpose = servicePurpose(svc.id);
                    const detail = homeDetails[svc.id] ? readableHealth(homeDetails[svc.id], homeHealth[svc.id] === "live") : "Health not checked yet.";
                    const showLive = svc.id === "freellmapi" && homeHealth[svc.id] === "live";
                    return (
                      <div key={svc.id} className="rounded-xl p-2 min-w-0 border border-[#1a3a66]" style={{ background: "linear-gradient(180deg, #e7f1fb 0%, #f7fbff 100%)", color: "#102033", fontWeight: 600, boxShadow: "0 8px 16px rgba(20, 50, 90, .12), 0 2px 0 #1a3a66" }}>
                        <button type="button" className="w-full text-left" onClick={() => setOpenHome((id) => (id === svc.id ? null : svc.id))}>
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-semibold truncate">{svc.name}</span>
                            {showLive ? <span className="text-[10px] font-bold uppercase">Live</span> : null}
                          </div>
                          <p className="text-[11px]">{purpose[0]}</p>
                          <p className="text-[11px]">{purpose[1]}</p>
                          <p className="text-[11px]">{detail}</p>
                        </button>
                        <div className="mt-1 grid grid-cols-3 gap-1">
                          <button type="button" onClick={() => handleCardClick(svc)} className="ab-btn h-8 px-1 rounded-md text-[10px] font-semibold">Open in internal browser</button>
                          <button type="button" disabled={!serviceExternalUrl(svc)} onClick={() => { const url = serviceExternalUrl(svc); if (url) window.open(url, "_blank", "noopener,noreferrer"); }} className="ab-btn h-8 px-1 rounded-md text-[10px] font-semibold">Open in external browser</button>
                          <button type="button" onClick={() => { void (async () => { setHealthVerdict((prev) => ({ ...prev, [svc.id]: "checking" })); const h = await serviceHealth(svc, 2500); setHomeHealth((prev) => ({ ...prev, [svc.id]: h.level })); setHomeDetails((prev) => ({ ...prev, [svc.id]: readableHealth(h.detail, h.online) })); setHealthVerdict((prev) => ({ ...prev, [svc.id]: h.level === "live" ? "up" : "down" })); })(); }} className="ab-btn h-8 px-1 rounded-md text-[10px] font-semibold">{healthVerdict[svc.id] === "checking" ? "Checking" : "Health"}</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Saarathi holo gesture bridge. Kept below the service grid because
              the grid is the primary surface; this panel REPORTS the gesture
              gate rather than overriding it. */}
          <HoloGesturePanel />
        </div>
      </div>
    );
  }

  // Browser chrome + frame
  const canBack = active.historyIndex > 0;
  const canForward = active.historyIndex < active.history.length - 1;

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-1 px-2 pt-1.5 border-b border-slate-800 bg-slate-950/60 overflow-x-auto">
        {tabs.map((tb) => (
          <div
            key={tb.id}
            className={`flex items-center gap-2 h-8 px-3 rounded-t-lg text-xs cursor-pointer max-w-[200px] ${
              tb.id === activeId ? "bg-slate-900 text-white border-t border-x border-slate-700" : "text-slate-400 hover:text-slate-200"
            }`}
            onClick={() => setActiveId(tb.id)}
          >
            <span className="truncate">{tb.title}</span>
            <button
              className="text-slate-500 hover:text-rose-400"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tb.id);
              }}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button className="h-8 w-8 flex items-center justify-center text-slate-400 hover:text-white" title="New tab (Ctrl+T)" onClick={() => setActiveId(null)}>
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="relative flex items-center gap-1.5 h-11 px-3 border-b border-slate-800 bg-slate-900/80">
        {progress > 0 && (
          <div className="absolute bottom-0 left-0 h-0.5 bg-cyan-400 transition-all duration-200" style={{ width: `${progress}%` }} />
        )}
        <button disabled={!canBack} onClick={goBack} title="Back (Alt+Left)" className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-300 disabled:opacity-30 hover:bg-slate-800">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <button disabled={!canForward} onClick={goForward} title="Forward (Alt+Right)" className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-300 disabled:opacity-30 hover:bg-slate-800">
          <ArrowRight className="w-4 h-4" />
        </button>
        {active.loading ? (
          <button onClick={stop} title="Stop" className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        ) : (
          <button onClick={refresh} title="Refresh (Ctrl+R)" className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800">
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
        <button onClick={() => setActiveId(null)} title="Home" className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800">
          <Home className="w-4 h-4" />
        </button>
        <span className="text-[10px] font-bold text-slate-300">{active.external ? "EXTERNAL WEB · UNTRUSTED UNTIL VERIFIED · READ" : "READ"}</span>
        <form
          className="flex-1 flex items-center h-8 px-3 rounded-lg border border-slate-700 bg-slate-950/70 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const typed = urlInput.trim();
            const browserCmd = parseBrowserCommand(typed);
            if (browserCmd) {
              if (browserCmd.action === "open-service" && browserCmd.serviceId && !browserCmd.needsApproval) {
                const svc = getService(browserCmd.serviceId);
                if (svc) handleCardClick(svc);
              } else if (browserCmd.action === "open-place" && browserCmd.place && HOSPITAL_PLACES[browserCmd.place]) {
                navHash(HOSPITAL_PLACES[browserCmd.place]);
              } else if (browserCmd.action === "home") setActiveId(null);
              else if (browserCmd.action === "back") goBack();
              else if (browserCmd.action === "forward") goForward();
              else if (browserCmd.action === "refresh") refresh();
              else if (browserCmd.action === "close" && active) closeTab(active.id);
              setUrlInput("");
              return;
            }
            const hashIdx = typed.indexOf("#/");
            const hashPart = hashIdx >= 0 ? typed.slice(hashIdx + 1) : typed.startsWith("/browser") ? typed : "";
            if (hashPart.startsWith("/browser")) {
              const params = new URLSearchParams(hashPart.split("?")[1] ?? "");
              const sid = params.get("service");
              const svc = sid ? getService(sid) : undefined;
              if (svc) {
                handleCardClick(svc);
                return;
              }
              navHash(hashPart.startsWith("/") ? hashPart : `/${hashPart}`);
              return;
            }
            navigateTo(typed, active.id);
          }}
        >
          {active.error ? (
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          ) : active.trusted ? (
            <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          ) : active.external ? (
            <Globe className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          ) : (
            <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          )}
          <input
            ref={inputRef}
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onFocus={() => inputRef.current?.select()}
            spellCheck={false}
            className="flex-1 bg-transparent text-xs text-slate-200 outline-none font-mono"
            placeholder="Enter service URL or address"
          />
          <button type="button" title="Copy Astra URL" onClick={() => navigator.clipboard?.writeText(chromeUrl(active))} className="text-slate-500 hover:text-slate-200">
            <Copy className="w-3.5 h-3.5" />
          </button>
        </form>
        <button
          title="Open externally (real service URL — never an Astra hash fake)"
          onClick={() => {
            const svc = (active.consoleFor || active.serviceId) ? getService(active.consoleFor || active.serviceId || "") : undefined;
            const ext = svc ? serviceExternalUrl(svc) : null;
            const target = ext
              || (!active.url ? null : active.url.startsWith("/") ? `${window.location.origin}${active.url}` : active.url);
            if (target) window.open(target, "_blank", "noopener,noreferrer");
          }}
          className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800"
        >
          <ExternalLink className="w-4 h-4" />
        </button>
        <button onClick={() => navHash("/settings")} title="Settings" className="h-8 w-8 flex items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800">
          <Terminal className="w-4 h-4" />
        </button>
      </div>

      {active.consoleFor && !active.error ? (
        active.consoleFor === "hermes" ? (
          <HermesConsole />
        ) : active.consoleFor === "langgraph-orchestrator" ? (
          <LangGraphConsole />
        ) : active.consoleFor === "openhands" ? (
          <OpenHandsConsole />
        ) : active.consoleFor === "agentzero" ? (
          <AgentZeroConsole />
        ) : (
          <ServiceConsolePanel service={getService(active.consoleFor)} />
        )
      ) : active.embedBlocked ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md glass p-6 rounded-xl text-center">
            <ShieldAlert className="w-8 h-8 text-amber-400 mx-auto mb-3" />
            <p className="text-sm font-semibold text-white mb-1">EMBEDDING BLOCKED</p>
            <p className="text-xs text-slate-400 font-mono break-all mb-2">URL: {active.url}</p>
            <p className="text-xs text-slate-400 mb-4">{active.embedBlockReason || "This service sent security headers that prevent iframe embedding. The service is not offline."}</p>
            <p className="text-[11px] text-slate-500 mb-4">Astra does not strip CSP / X-Frame-Options to force embedding.</p>
            <div className="flex flex-wrap gap-2 justify-center">
              <button
                onClick={() => {
                  const svc = active.serviceId ? getService(active.serviceId) : undefined;
                  const ext = svc ? serviceExternalUrl(svc) : (active.url.startsWith("http") ? active.url : null);
                  if (ext) window.open(ext, "_blank", "noopener,noreferrer");
                }}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium text-white bg-cyan-600 hover:bg-cyan-500"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Open External
              </button>
              <button onClick={refresh} className="h-8 px-3 rounded-lg text-xs text-slate-300 border border-slate-700 hover:bg-slate-800">Retry</button>
            </div>
          </div>
        </div>
      ) : active.error ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md glass p-6 rounded-xl text-center">
            <TriangleAlert className="w-8 h-8 text-rose-400 mx-auto mb-3" />
            <p className="text-sm font-semibold text-white mb-1">Unable to connect to {active.title}</p>
            <p className="text-xs text-slate-400 font-mono break-all mb-2">URL: {active.url}</p>
            <p className="text-xs text-slate-400 mb-4">{active.error}</p>
            <p className="text-[11px] text-slate-500 mb-4">Possible causes: service stopped · incorrect configuration · port unavailable · authentication failure</p>
            <div className="flex flex-wrap gap-2 justify-center">
              <button onClick={refresh} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium text-white bg-cyan-600 hover:bg-cyan-500">
                <RotateCcw className="w-3.5 h-3.5" /> Retry
              </button>
              <button onClick={() => navHash("/settings")} className="h-8 px-3 rounded-lg text-xs text-slate-300 border border-slate-700 hover:bg-slate-800">Open Settings</button>
              <button onClick={() => navHash("/plugins")} className="h-8 px-3 rounded-lg text-xs text-slate-300 border border-slate-700 hover:bg-slate-800">Plugin Center</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative flex-1 min-h-0 flex flex-col">
          {active.healthWarning && (
            <div className="shrink-0 px-3 py-1.5 text-[11px] bg-amber-950/80 text-amber-100 border-b border-amber-800/50 flex items-center justify-between gap-2">
              <span>{active.healthWarning}</span>
              <button type="button" onClick={refresh} className="underline hover:text-white">
                Retry
              </button>
            </div>
          )}
          <iframe
            key={`${active.id}:${active.frameKey}`}
            src={active.url}
            title={active.title}
            className="flex-1 w-full border-0 bg-white min-h-0"
            allow="clipboard-read; clipboard-write; microphone; camera"
            sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-downloads"
            referrerPolicy="no-referrer-when-downgrade"
            onLoad={() => patchTab(active.id, { loading: false, error: null })}
          />
        </div>
      )}
    </div>
  );
}

/**
 * ASTRA-NATIVE SERVICE CONSOLE — for services that have NO real web dashboard
 * (CLI runtimes, in-process cores) or are NOT INSTALLED. Shows only verified
 * runtime facts from the service registry. NEVER fakes a dashboard.
 */
const INTELLIGENCE_IDS = new Set(["laya", "astra-micro", "scientist", "clinical-books", "astra-7d"]);

function IntelligenceDesk({ service }: { service: ServiceDefinition }) {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [skills, setSkills] = useState<Array<{ name: string; description: string; category: string; enabled: boolean }>>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [statusRes, skillRes] = await Promise.all([
          fetch("/api/intelligence/status"),
          fetch("/api/intelligence/skills"),
        ]);
        const statusBody = await statusRes.json();
        const skillBody = await skillRes.json();
        if (cancelled) return;
        setStatus(statusBody);
        setSkills(Array.isArray(skillBody.scientificSkills) ? skillBody.scientificSkills : []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Status unavailable");
      }
    })();
    return () => { cancelled = true; };
  }, [service.id]);

  const bookNames = new Set(["clinical-reports", "treatment-plans", "scientific-writing"]);
  const shown = service.id === "clinical-books"
    ? skills.filter((s) => bookNames.has(s.name))
    : service.id === "scientist"
      ? skills.filter((s) => !bookNames.has(s.name))
      : [];
  const laya = status?.laya as { state?: string; detail?: string } | undefined;
  const micro = status?.micro as { status?: string; model?: string; modelInstalled?: boolean } | undefined;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        <ConsoleHeader title={service.name} subtitle="CLINICAL INTELLIGENCE — LIVE" />
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4 mb-4">
          <p className="text-xs text-slate-300">{service.description}</p>
          {service.runtimeNote && <p className="mt-2 text-[11px] text-slate-400 font-mono leading-relaxed">{service.runtimeNote}</p>}
          {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 overflow-hidden mb-4">
          {service.id === "laya" && <FactRow k="Laya" v={laya ? `${laya.state ?? "unknown"} — ${laya.detail ?? ""}` : "checking"} />}
          {service.id === "astra-micro" && <FactRow k="Micro" v={micro ? `${micro.status} · ${micro.model} · installed=${micro.modelInstalled}` : "checking"} />}
          {service.id === "astra-7d" && <FactRow k="7D" v={String((status?.sevenD as { status?: string } | undefined)?.status ?? "checking")} />}
          {(service.id === "scientist" || service.id === "clinical-books") && (
            <FactRow k="Skills" v={`${shown.filter((s) => s.enabled).length} ready of ${shown.length}`} />
          )}
        </div>
        {shown.length > 0 && (
          <div className="space-y-2">
            {shown.map((skill) => (
              <div key={skill.name} className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
                <div className="text-xs text-slate-100">{skill.name} <span className="text-slate-500">{skill.enabled ? "on" : "off"}</span></div>
                <div className="text-[11px] text-slate-400">{skill.description}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ServiceConsolePanel({ service }: { service: ServiceDefinition | undefined }) {
  if (!service) {
    return (
      <div className="flex-1 flex items-center justify-center text-xs text-slate-500">Service not found in registry.</div>
    );
  }
  if (INTELLIGENCE_IDS.has(service.id)) return <IntelligenceDesk service={service} />;
  const kind = service.statusKind ?? "web";
  const kindLabel =
    kind === "cli" ? "CLI RUNTIME — ASTRA CONSOLE"
    : kind === "in-process" ? "IN-PROCESS CORE — ASTRA CONSOLE"
    : kind === "external" ? "EXTERNAL SERVICE — ASTRA CONSOLE"
    : "NOT INSTALLED";
  const rows: Array<[string, string]> = [
    ["Category", service.category],
    ["Version", service.version ?? "—"],
    ["Install path", service.installPath ?? "—"],
    ["Dashboard port", service.port > 0 ? String(service.port) : "— (no network listener)"],
    ...(service.apiPort && service.apiPort !== service.port
      ? ([["API port", String(service.apiPort)]] as Array<[string, string]>)
      : []),
    ["Web dashboard", service.dashboardUrl || "none — use this Astra console"],
  ];
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-1">
          <Terminal className="w-5 h-5 text-cyan-300" />
          <h1 className="text-lg font-semibold text-slate-100">{service.name}</h1>
        </div>
        <p className="text-[11px] tracking-wider text-slate-500 mb-4">{kindLabel}</p>
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4 mb-4">
          <p className="text-xs text-slate-300 mb-3">{service.description}</p>
          {service.runtimeNote && <p className="text-[11px] text-slate-400 font-mono leading-relaxed">{service.runtimeNote}</p>}
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 overflow-hidden">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800 last:border-b-0">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 w-28 shrink-0">{k}</span>
              <span className="text-xs text-slate-200 font-mono break-all">{v}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-600 mt-4">
          Astra shows only verified runtime facts for this service. No dashboard is simulated.
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────── shared console bits ─────────────────────────── */

function ConsoleHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <Terminal className="w-5 h-5 text-cyan-300" />
        <h1 className="text-lg font-semibold text-slate-100">{title}</h1>
      </div>
      <p className="text-[11px] tracking-wider text-slate-500 mt-0.5">{subtitle}</p>
    </div>
  );
}

function ConsoleButton({
  children, onClick, disabled, tone = "default",
}: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; tone?: "default" | "primary" | "danger" }) {
  const tones = {
    default: "border-slate-700 text-slate-200 hover:bg-slate-800",
    primary: "bg-cyan-600 hover:bg-cyan-500 text-white border-transparent",
    danger: "bg-rose-600/80 hover:bg-rose-500 text-white border-transparent",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`h-8 px-3 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

function FactRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800 last:border-b-0">
      <span className="text-[10px] uppercase tracking-wider text-slate-500 w-32 shrink-0">{k}</span>
      <span className="text-xs text-slate-200 font-mono break-all">{v}</span>
    </div>
  );
}

function ProvenancePanel({ prov }: { prov?: ServiceDefinition["provenance"] }) {
  if (!prov) return null;
  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 overflow-hidden mb-4">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800">
        <span className="text-[10px] uppercase tracking-wider text-slate-500">Runtime Provenance</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full border border-slate-600 text-slate-300 font-mono">{prov.classification} · {prov.integrity}</span>
      </div>
      <FactRow k="Official project" v={<a className="text-cyan-300 hover:underline" href={prov.sourceUrl} target="_blank" rel="noopener noreferrer">{prov.officialProject}</a>} />
      <FactRow k="Installed version" v={prov.installedVersion ?? "—"} />
      <FactRow k="Repository" v={prov.repository ?? "—"} />
      <FactRow k="Commit" v={prov.commit ?? "—"} />
      <FactRow k="Installation" v={prov.installation ?? "—"} />
      {prov.executable && <FactRow k="Executable" v={prov.executable} />}
      <FactRow k="Implementation" v={prov.implementation ?? "—"} />
      <FactRow k="Package manager" v={prov.packageManager ?? "—"} />
      <FactRow k="Integrity" v={prov.integrity} />
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "LIVE" ? "bg-emerald-400"
    : status === "CONFIGURATION_REQUIRED" ? "bg-amber-400"
    : status === "ERROR" || status === "FAILED" || status === "TIMEOUT" ? "bg-rose-400"
    : status === "RUNNING" || status === "PAUSED_FOR_APPROVAL" ? "bg-sky-400"
    : "bg-slate-500";
  return <span className={`inline-block w-2 h-2 rounded-full ${color} mr-1.5`} />;
}

async function hermesApi<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/agents/hermes${path}`, {
    ...init,
    headers: { ...authHeaders(true), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

interface HermesHealth {
  status: string;
  version: string | null;
  installPath: string | null;
  configPresent: boolean;
  config?: HermesModelConfigView;
  detail: string;
}
interface HermesModelConfigView {
  model?: string | null;
  provider?: string | null;
  baseUrl?: string | null;
  contextLength?: number | null;
  requiredContext?: number;
  compatible?: boolean | null;
}
interface HermesTaskDto {
  taskId: string;
  prompt: string;
  status: string;
  exitCode?: number;
  stdout: string;
  stderr: string;
}

const HERMES_TEST_PROMPT =
  "Return a short three-step plan for organizing a non-clinical administrative workflow.";

/* ────────────────────────── HERMES ASTRA CONSOLE ──────────────────────────── */

function HermesConsole() {
  const [health, setHealth] = useState<HermesHealth | null>(null);
  const [caps, setCaps] = useState<Record<string, any> | null>(null);
  const [tasks, setTasks] = useState<HermesTaskDto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(HERMES_TEST_PROMPT);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const h = await hermesApi<{ health: HermesHealth }>("/health");
      setHealth(h.health);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  const refreshTasks = useCallback(async () => {
    try {
      const t = await hermesApi<{ tasks: HermesTaskDto[] }>("/logs");
      setTasks(t.tasks);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    void refresh();
    void refreshTasks();
    hermesApi<Record<string, any>>("/status").then(setCaps).catch(() => {});
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [refresh, refreshTasks]);

  const runTask = useCallback(async (p: string, source: "test" | "task") => {
    setBusy(true);
    setError(null);
    try {
      const r = await hermesApi<{ task: HermesTaskDto }>(source === "test" ? "/test" : "/execute", {
        method: "POST",
        body: source === "task" ? JSON.stringify({ prompt: p }) : undefined,
      });
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        const cur = await hermesApi<{ task: HermesTaskDto }>(`/task/${r.task.taskId}`).catch(() => null);
        if (cur && cur.task.status !== "RUNNING") {
          if (pollRef.current) clearInterval(pollRef.current);
          setBusy(false);
          await Promise.all([refresh(), refreshTasks()]);
        }
      }, 1500);
      await refreshTasks();
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }, [refresh, refreshTasks]);

  const status = health?.status ?? "…";

  const modelCfg = health?.config ?? caps?.modelConfig ?? {};
  const modelCtx = typeof modelCfg.contextLength === "number" ? modelCfg.contextLength : null;
  const configIssue =
    status === "CONFIGURATION_REQUIRED" || (health?.configPresent && modelCfg.compatible === false);

  const openExternal = useCallback(() => {
    const svc = getService("hermes");
    const url = svc ? serviceExternalUrl(svc) : null;
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  }, []);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <ConsoleHeader title="Hermes Agent" subtitle="CLI RUNTIME — ASTRA CONSOLE (real CLI, no fake dashboard)" />

        {error && (
          <div className="rounded-lg border border-rose-800/60 bg-rose-950/40 text-rose-200 text-xs px-4 py-2 mb-3">{error}</div>
        )}

        {configIssue && (
          <div className="rounded-lg border border-amber-700/60 bg-amber-950/30 text-amber-100 text-xs px-4 py-3 mb-3">
            <p className="font-semibold mb-1">CONFIGURATION REQUIRED</p>
            <p className="text-amber-200/90">{health?.detail ?? "Hermes runtime is available but its model configuration is not compatible."}</p>
            {modelCfg.model != null && (
              <p className="mt-1 opacity-80">
                Current model: {modelCfg.model} · context {modelCtx?.toLocaleString("en-US") ?? "?"} tokens · required {modelCfg.requiredContext?.toLocaleString("en-US") ?? "64,000"}.
                No model was changed automatically — choose a model with ≥ required context, or raise context_length.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2 mb-4">
          <ConsoleButton tone="primary" onClick={() => void refresh()} disabled={busy}>Health Check</ConsoleButton>
          <ConsoleButton onClick={() => void runTask(HERMES_TEST_PROMPT, "test")} disabled={busy}>Run Test</ConsoleButton>
          <ConsoleButton onClick={() => void runTask(prompt, "task")} disabled={busy}>Run Task</ConsoleButton>
          <ConsoleButton onClick={() => void refreshTasks()} disabled={busy}>Logs</ConsoleButton>
          <ConsoleButton onClick={() => void refresh()} disabled={busy}>Refresh</ConsoleButton>
          <ConsoleButton onClick={openExternal} disabled={busy}>Open External</ConsoleButton>
        </div>

        <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 overflow-hidden mb-4">
          <FactRow k="Status" v={<span><StatusDot status={status} />{status}</span>} />
          <FactRow k="Version" v={health?.version ?? "—"} />
          <FactRow k="Install path" v={health?.installPath ?? caps?.installPath ?? "—"} />
          <FactRow k="Runtime" v={caps?.runtime ?? "Native Windows CLI"} />
          <FactRow k="Network" v="No listener — CLI-only (no fake HTTP server)" />
          <FactRow k="Invocation" v={caps?.invocation ?? 'hermes chat -q "<prompt>" -Q --safe-mode --max-turns 1'} />
          <FactRow k="Config (HERMES_HOME)" v={health?.configPresent ? "present" : "MISSING — run hermes setup once"} />
          <FactRow k="Current model" v={modelCfg.model ?? "—"} />
          <FactRow k="Provider / base URL" v={modelCfg.baseUrl ?? "—"} />
          <FactRow k="Model context" v={modelCtx != null ? `${modelCtx.toLocaleString("en-US")} tokens (Hermes minimum ${modelCfg.requiredContext?.toLocaleString("en-US") ?? "64,000"})` : "—"} />
          <FactRow k="Detail" v={health?.detail ?? "—"} />
        </div>

        <ProvenancePanel prov={getService("hermes")?.provenance} />

        <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 p-4 mb-4">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">Task prompt (non-clinical only)</p>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 font-mono outline-none focus:border-cyan-600"
          />
          <p className="text-[10px] text-slate-600 mt-2">
            Execution is safe-mode, single-turn, no toolsets — clinical/hospital actions are never reachable here.
          </p>
        </div>

        <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 overflow-hidden">
          <p className="text-[10px] uppercase tracking-wider text-slate-500 px-4 py-2 border-b border-slate-800">
            Execution log ({tasks.length})
          </p>
          {tasks.length === 0 && <p className="text-xs text-slate-500 px-4 py-3">No executions yet — run Health Check or Run Test.</p>}
          {tasks.map((t) => (
            <div key={t.taskId} className="px-4 py-3 border-b border-slate-800 last:border-b-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-300 font-mono">{t.taskId}</span>
                <span className="text-xs"><StatusDot status={t.status} />{t.status}{t.exitCode !== undefined ? ` · exit ${t.exitCode}` : ""}</span>
              </div>
              <p className="text-[10px] text-slate-500 font-mono break-all mb-1">{t.prompt}</p>
              {t.stdout && <pre className="text-[10px] text-emerald-200 bg-slate-950 rounded p-2 max-h-40 overflow-auto whitespace-pre-wrap">{t.stdout}</pre>}
              {t.stderr && <pre className="text-[10px] text-rose-200 bg-slate-950 rounded p-2 max-h-24 overflow-auto whitespace-pre-wrap mt-1">{t.stderr}</pre>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────── OPENHANDS ASTRA CONSOLE ────────────────────────── */

function OpenHandsConsole() {
  const [agentInfo, setAgentInfo] = useState<{ version?: string; uptime?: number } | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<Array<{ role: string; content: string }>>([]);
  useEffect(() => {
    fetch("http://127.0.0.1:18000/server_info", { signal: AbortSignal.timeout(4000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setAgentInfo(j))
      .catch(() => setAgentInfo(null));
  }, []);
  async function send() {
    const text = msg.trim();
    if (!text) return;
    setBusy(true);
    setLog((p) => [...p, { role: "user", content: text }]);
    setMsg("");
    try {
      const answer = await askDoctorEngine({ text });
      const reply = `Engine: ${answer.engine}. ${answer.ok ? answer.text : (answer.error || "No engine answered.")}`;
      setLog((p) => [...p, { role: "assistant", content: reply }]);
    } catch (e) {
      setLog((p) => [...p, { role: "assistant", content: `Error: ${e instanceof Error ? e.message : String(e)}` }]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <ConsoleHeader title="OpenHands" subtitle={`APPROVAL-GATED EXECUTOR — Agent Server v${agentInfo?.version ?? "…"} · :18000 · Uptime ${agentInfo?.uptime != null ? Math.round(agentInfo.uptime) + "s" : "…"}`} />
        <div className="rounded-lg border border-cyan-700/60 bg-cyan-950/30 text-cyan-100 text-xs px-4 py-3 mb-4">
          OpenHands Agent Canvas UI runs on <code className="bg-cyan-900/60 px-1 rounded">http://127.0.0.1:8080</code>.
          This console routes inference through Astra /v1 (FreeLLMAPI primary → OmniRoute fallback).
          Every mutating step requires explicit human approval — no RBAC bypass.
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          <ConsoleButton tone="primary" onClick={() => window.open("http://127.0.0.1:8080", "_blank", "noopener,noreferrer")}>
            Open Agent Canvas :8080
          </ConsoleButton>
          <ConsoleButton onClick={() => window.open("http://127.0.0.1:18000/server_info", "_blank", "noopener,noreferrer")}>
            Agent Server Info
          </ConsoleButton>
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 overflow-hidden mb-4">
          <FactRow k="Agent Server" v="http://127.0.0.1:18000" />
          <FactRow k="Frontend" v="http://127.0.0.1:8080" />
          <FactRow k="Version" v={agentInfo?.version ?? "—"} />
          <FactRow k="Inference" v="Astra /v1 (FreeLLMAPI → OmniRoute)" />
          <FactRow k="Approval gate" v="ENABLED (no bypass)" />
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-950/60 flex flex-col h-64 mb-3">
          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs font-mono">
            {log.length === 0 && <p className="text-slate-500">Send a message — routed through Astra /v1 (FreeLLMAPI).</p>}
            {log.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-cyan-300" : "text-slate-200"}>
                <span className="text-slate-500">{m.role === "user" ? "You" : "OpenHands"}: </span>{m.content}
              </div>
            ))}
            {busy && <p className="text-slate-500 animate-pulse">… thinking via FreeLLMAPI …</p>}
          </div>
          <div className="flex border-t border-slate-700/50">
            <input value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
              disabled={busy} placeholder="Type a message — sent via Astra /v1 (FreeLLMAPI)" className="flex-1 bg-transparent text-xs text-slate-200 px-3 py-2 outline-none" />
            <button onClick={send} disabled={busy || !msg.trim()} className="px-3 text-xs text-cyan-300 hover:bg-slate-800 disabled:opacity-30">Send</button>
          </div>
        </div>
        <p className="text-[10px] text-slate-600">Inference is delegated to Astra /v1 — FreeLLMAPI primary, OmniRoute fallback. No separate model keys.</p>
      </div>
    </div>
  );
}

/* ────────────────────────── AGENT ZERO ASTRA CONSOLE ──────────────────────── */

function AgentZeroConsole() {
  const [health, setHealth] = useState<{ gitinfo?: { version?: string }; error?: string | null } | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<Array<{ role: string; content: string }>>([]);
  useEffect(() => {
    fetch("http://127.0.0.1:5000/api/health", { signal: AbortSignal.timeout(4000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setHealth(j))
      .catch(() => setHealth(null));
  }, []);
  async function send() {
    const text = msg.trim();
    if (!text) return;
    setBusy(true);
    setLog((p) => [...p, { role: "user", content: text }]);
    setMsg("");
    try {
      const answer = await askDoctorEngine({ text });
      const reply = `Engine: ${answer.engine}. ${answer.ok ? answer.text : (answer.error || "No engine answered.")}`;
      setLog((p) => [...p, { role: "assistant", content: reply }]);
    } catch (e) {
      setLog((p) => [...p, { role: "assistant", content: `Error: ${e instanceof Error ? e.message : String(e)}` }]);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <ConsoleHeader title="Agent Zero" subtitle={`MULTI-AGENT ORCHESTRATION — v${health?.gitinfo?.version ?? "…"} · Flask/uvicorn :5000`} />
        <div className="rounded-lg border border-violet-700/60 bg-violet-950/30 text-violet-100 text-xs px-4 py-3 mb-4">
          Agent Zero Web UI runs on <code className="bg-violet-900/60 px-1 rounded">http://127.0.0.1:5000</code>.
          This console routes inference through Astra /v1 (FreeLLMAPI primary → OmniRoute fallback).
          Multi-agent orchestration — no separate model keys.
        </div>
        <div className="flex flex-wrap gap-2 mb-4">
          <ConsoleButton tone="primary" onClick={() => window.open("http://127.0.0.1:5000", "_blank", "noopener,noreferrer")}>
            Open Agent Zero UI :5000
          </ConsoleButton>
          <ConsoleButton onClick={() => window.open("http://127.0.0.1:5000/api/health", "_blank", "noopener,noreferrer")}>
            Health Check
          </ConsoleButton>
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 overflow-hidden mb-4">
          <FactRow k="Web UI / API" v="http://127.0.0.1:5000" />
          <FactRow k="Version" v={health?.gitinfo?.version ?? "—"} />
          <FactRow k="Health" v={health ? health.error ? `ERROR: ${health.error}` : "HEALTHY" : "—"} />
          <FactRow k="Inference" v="Astra /v1 (FreeLLMAPI → OmniRoute)" />
          <FactRow k="Runtime" v="Python 3.12 · Flask/uvicorn" />
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-950/60 flex flex-col h-64 mb-3">
          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs font-mono">
            {log.length === 0 && <p className="text-slate-500">Send a message — routed through Astra /v1 (FreeLLMAPI).</p>}
            {log.map((m, i) => (
              <div key={i} className={m.role === "user" ? "text-violet-300" : "text-slate-200"}>
                <span className="text-slate-500">{m.role === "user" ? "You" : "Agent Zero"}: </span>{m.content}
              </div>
            ))}
            {busy && <p className="text-slate-500 animate-pulse">… thinking via FreeLLMAPI …</p>}
          </div>
          <div className="flex border-t border-slate-700/50">
            <input value={msg} onChange={(e) => setMsg(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
              disabled={busy} placeholder="Type a message — sent via Astra /v1 (FreeLLMAPI)" className="flex-1 bg-transparent text-xs text-slate-200 px-3 py-2 outline-none" />
            <button onClick={send} disabled={busy || !msg.trim()} className="px-3 text-xs text-violet-300 hover:bg-slate-800 disabled:opacity-30">Send</button>
          </div>
        </div>
        <p className="text-[10px] text-slate-600">Inference is delegated to Astra /v1 — FreeLLMAPI primary, OmniRoute fallback. RFC-password warnings in service log are non-fatal.</p>
      </div>
    </div>
  );
}
/* ────────────────────────── LANGGRAPH ASTRA CONSOLE ───────────────────────── */

function LangGraphConsole() {
  const graphs = langGraph.listGraphs();
  const [graphId, setGraphId] = useState(graphs[0]?.id ?? "");
  const [execution, setExecution] = useState<GraphExecution | null>(null);
  const [history, setHistory] = useState<GraphExecution[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  useEffect(() => () => stopPoll(), []);

  const track = (exec: GraphExecution) => {
    setExecution({ ...exec });
    stopPoll();
    pollRef.current = setInterval(() => {
      const cur = langGraph.getExecution(exec.executionId);
      setExecution(cur ? { ...cur } : null);
      setHistory(langGraph.getHistory());
      if (cur && !["RUNNING", "PAUSED_FOR_APPROVAL"].includes(cur.status)) stopPoll();
    }, 300);
  };

  const graph = langGraph.getGraph(graphId);
  const status = execution?.status ?? "IDLE";

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <ConsoleHeader title="LangGraph Orchestrator" subtitle="OFFICIAL @langchain/langgraph — ASTRA CONSOLE (StateGraph · MemorySaver · interrupt)" />

        <ProvenancePanel prov={getService("langgraph-orchestrator")?.provenance} />

        <div className="flex flex-wrap gap-2 mb-4">
          <select
            value={graphId}
            onChange={(e) => { stopPoll(); setGraphId(e.target.value); setExecution(null); }}
            className="h-8 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 px-2"
          >
            {graphs.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <ConsoleButton tone="primary" onClick={() => void langGraph.runGraph(graphId, { startedFrom: "astra-console" }).then(track)}>
            Run
          </ConsoleButton>
          <ConsoleButton
            disabled={!execution || execution.status !== "PAUSED_FOR_APPROVAL"}
            onClick={() => execution && void langGraph.approveWorkflowResume(execution.executionId, "astra-console-operator")}
          >
            Approve / Resume
          </ConsoleButton>
          <ConsoleButton
            disabled={!execution || !["RUNNING", "PAUSED_FOR_APPROVAL"].includes(execution.status)}
            onClick={() => execution && langGraph.cancelExecution(execution.executionId)}
            tone="danger"
          >
            Cancel
          </ConsoleButton>
          <ConsoleButton
            disabled={!execution || execution.status !== "FAILED"}
            onClick={() => execution && void langGraph.retryExecution(execution.executionId).then((e) => e && track(e))}
          >
            Retry
          </ConsoleButton>
          <ConsoleButton onClick={() => setHistory(langGraph.getHistory())}>View Logs</ConsoleButton>
        </div>

        <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 overflow-hidden mb-4">
          <FactRow k="Graph" v={graph?.name ?? "—"} />
          <FactRow k="Description" v={graph?.description ?? "—"} />
          <FactRow k="Nodes" v={graph?.nodes.map((n) => n.name).join(" → ") ?? "—"} />
          <FactRow k="Edges" v={graph?.edges.map((e) => `${e.from}→${e.to}`).join(", ") ?? "—"} />
          <FactRow k="Model" v={execution?.state?.modelTier ?? "router-selected at runtime (FreeLLMAPI → OmniRoute → Ollama)"} />
          <FactRow k="Execution ID" v={execution?.executionId ?? "—"} />
          <FactRow k="Status" v={<span><StatusDot status={status} />{status}</span>} />
          <FactRow k="Current node" v={execution?.currentNode ?? "—"} />
          <FactRow k="Error" v={execution?.error ?? "—"} />
          <FactRow k="Checkpoint" v={execution?.checkpoint ? <span className="text-emerald-300">saved</span> : "—"} />
        </div>

        {execution && (
          <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 overflow-hidden mb-4">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 px-4 py-2 border-b border-slate-800">Node state</p>
            {execution.steps.map((s) => (
              <div key={s.nodeId} className="flex items-center justify-between px-4 py-2 border-b border-slate-800 last:border-b-0">
                <span className="text-xs text-slate-300 font-mono">{s.nodeId}</span>
                <span className="text-xs"><StatusDot status={s.status} />{s.status}{s.error ? ` — ${s.error}` : ""}</span>
              </div>
            ))}
            <div className="px-4 py-2">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Execution state</p>
              <pre className="text-[10px] text-slate-300 bg-slate-950 rounded p-2 max-h-40 overflow-auto">{JSON.stringify(execution.state, null, 2)}</pre>
            </div>
          </div>
        )}

        {history.length > 0 && (
          <div className="rounded-xl border border-slate-700/50 bg-slate-900/60 overflow-hidden">
            <p className="text-[10px] uppercase tracking-wider text-slate-500 px-4 py-2 border-b border-slate-800">Execution history</p>
            {history.map((h) => (
              <div key={h.executionId} className="flex items-center justify-between px-4 py-2 border-b border-slate-800 last:border-b-0">
                <span className="text-xs text-slate-300 font-mono">{h.executionId} · {h.graphName}</span>
                <span className="text-xs"><StatusDot status={h.status} />{h.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
