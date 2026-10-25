import React, { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BedDouble,
  CheckCircle2,
  Command,
  Database,
  HeartPulse,
  Moon,
  Radio,
  Search,
  Server,
  Stethoscope,
  Sun,
  Workflow,
} from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { astraEventBus, type FlightRecorderEvent } from "@/astra/events/astraEventBus";
import { useStore } from "@/lib/store";
import { navHash } from "@/lib/hashRoute";
import { CriticalAlertBanner } from "./CriticalAlertBanner";
import { eventToFlow, metricToGauge, type HudFlowEvent, type HudGauge, type HudTone } from "./hudLogic";
import { hudTokensCss, HUD_PALETTE } from "./hudTokens";

type ThemeMode = "dark" | "light" | "system";
type HealthState = "LIVE" | "DEGRADED" | "OFFLINE";
type AnatomyLayer = "Body" | "Skeletal" | "Muscular" | "Circulatory" | "Nervous" | "Organs";

type CommandCenterProps = {
  patientId?: string;
};

const layers: AnatomyLayer[] = ["Body", "Skeletal", "Muscular", "Circulatory", "Nervous", "Organs"];

const toneClass: Record<HudTone, string> = {
  cyan: "text-cyan-200 border-cyan-400/40 bg-cyan-400/10 shadow-cyan-500/20",
  emerald: "text-emerald-200 border-emerald-400/40 bg-emerald-400/10 shadow-emerald-500/20",
  amber: "text-amber-200 border-amber-400/40 bg-amber-400/10 shadow-amber-500/20",
  red: "text-red-200 border-red-400/40 bg-red-400/10 shadow-red-500/20",
  neutral: "text-slate-300 border-slate-500/30 bg-slate-500/10 shadow-slate-500/10",
};

const statusFrom = (value: unknown): HealthState => {
  const text = String(value ?? "").toUpperCase();
  if (["CONNECTED", "HEALTHY", "READY", "LIVE", "OK", "TRUE"].some((x) => text.includes(x))) return "LIVE";
  if (["DEGRADED", "CONFIG", "REMOVED"].some((x) => text.includes(x))) return "DEGRADED";
  return "OFFLINE";
};

async function getJson(path: string) {
  const res = await fetch(path, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
  return res.json();
}

function useCommandHealth() {
  const [data, setData] = useState<{ health: any; ai: any; at: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [health, ai] = await Promise.all([getJson("/api/health"), getJson("/api/health/ai")]);
        if (alive) {
          setData({ health, ai, at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) });
          setError("");
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    };
    void load();
    const timer = window.setInterval(load, 30000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  return { data, error };
}

function useAstraFlowEvents() {
  const [events, setEvents] = useState<HudFlowEvent[]>([]);

  useEffect(() => {
    const bus = astraEventBus as typeof astraEventBus & { flightRecorderSnapshot?: () => FlightRecorderEvent[] };
    const seed = bus.flightRecorderSnapshot?.().slice(-8).map(eventToFlow) ?? [];
    setEvents(seed.reverse());
    const unsubscribe = astraEventBus.subscribe("*", (event) => {
      setEvents((prev) => [eventToFlow(event), ...prev].slice(0, 8));
    });
    return unsubscribe;
  }, []);

  return events;
}

function applyTheme(mode: ThemeMode) {
  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", mode === "dark" || (mode === "system" && systemDark));
  document.documentElement.style.colorScheme = mode === "light" ? "light" : "dark";
}

function isOccupied(bed: any) {
  return String(bed?.status ?? "").toLowerCase() === "occupied";
}

export function CentralCommand({ patientId }: CommandCenterProps) {
  const store = useStore();
  const { data, error } = useCommandHealth();
  const flowEvents = useAstraFlowEvents();
  const [theme, setTheme] = useState<ThemeMode>(() => (localStorage.getItem("astra.command.theme") as ThemeMode) || "dark");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [layer, setLayer] = useState<AnatomyLayer>("Body");

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem("astra.command.theme", theme);
  }, [theme]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
      if (event.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const patient = useMemo(
    () => store.patients.find((p) => p.id === patientId) ?? store.patients[0] ?? null,
    [store.patients, patientId],
  );
  const vitals = useMemo(() => store.vitals.slice(0, 10).reverse(), [store.vitals]);
  const pendingApprovals = store.approvals.filter((a) => a.status === "pending");
  const activeTasks = store.tasks.filter((t) => !["COMPLETED", "VERIFIED", "CLOSED"].includes(t.status)).slice(0, 8);
  const recentEvents = [...store.audit.slice(0, 4), ...store.notifications.slice(0, 4).map((n) => ({ id: n.id, action: n.title, detail: n.detail, timestamp: n.createdAt }))].slice(0, 6);

  const cards = useMemo(() => {
    const subsystems = data?.health?.subsystems ?? {};
    const services = data?.health?.services ?? {};
    const aiServices = data?.ai?.services ?? {};
    return [
      { name: "Astra API", duty: "Clinical command backbone", state: statusFrom(data?.health?.ok ?? subsystems.commandEngine), detail: "/api/health" },
      { name: "FreeLLMAPI", duty: "Primary local model gateway", state: statusFrom(aiServices.freellmapi?.reachable ?? services.freeLLMAPI?.reachable), detail: "No browser keys" },
      { name: "OmniRoute", duty: "Fallback routing layer", state: statusFrom(aiServices.omniroute?.reachable ?? services.omniRoute?.reachable), detail: "Adapter chain" },
      { name: "Ollama", duty: "PHI-safe local inference", state: statusFrom(aiServices.ollama?.reachable ?? subsystems.ollamaLocal), detail: "Loopback only" },
      { name: "Voicebox", duty: "Clinical speech runtime", state: statusFrom(subsystems.voicebox ?? services.voicebox?.reachable), detail: "Port 17493" },
      { name: "Memory", duty: "Evolution and case recall", state: statusFrom(subsystems.knowledgeFabric), detail: "Knowledge fabric" },
      { name: "7D", duty: "Astra 7D review lane", state: statusFrom(subsystems.agentRegistry), detail: "D1-D7 progress" },
      { name: "Internal Browser", duty: "Service console launcher", state: statusFrom(subsystems.pluginManager), detail: "Verified service grid" },
    ] as Array<{ name: string; duty: string; state: HealthState; detail: string }>;
  }, [data]);

  const live = cards.filter((c) => c.state === "LIVE").length;
  const degraded = cards.filter((c) => c.state === "DEGRADED").length;
  const offline = cards.filter((c) => c.state === "OFFLINE").length;
  const occupiedBeds = store.beds.filter(isOccupied).length;
  const departmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of store.patients) {
      const dept = String(p.department || "Clinical");
      counts.set(dept, (counts.get(dept) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [store.patients]);

  const gauges = useMemo<HudGauge[]>(() => [
    metricToGauge({
      id: "beds",
      label: "Bed occupancy",
      liveCount: occupiedBeds,
      total: store.beds.length,
      display: store.beds.length ? `${occupiedBeds}/${store.beds.length}` : "No data",
      detail: "Ward bed board",
    }),
    metricToGauge({
      id: "ai",
      label: "AI gateway health",
      liveCount: cards.filter((c) => ["FreeLLMAPI", "OmniRoute", "Ollama"].includes(c.name) && c.state === "LIVE").length,
      total: 3,
      detail: "FreeLLMAPI -> OmniRoute -> Ollama",
      invert: true,
    }),
    metricToGauge({
      id: "workflow",
      label: "Queue pressure",
      value: store.tasks.length ? (activeTasks.length / store.tasks.length) * 100 : null,
      display: store.tasks.length ? `${activeTasks.length}/${store.tasks.length}` : "No data",
      detail: "Open task engine items",
    }),
  ], [activeTasks.length, cards, occupiedBeds, store.beds.length, store.tasks.length]);

  const organSignals = [
    { organ: "Brain", source: "AI/Memory", value: `${live}/${cards.length} modules live`, tone: degraded || offline ? "amber" : "emerald" as HudTone },
    { organ: "Heart", source: "Approvals", value: pendingApprovals.length ? `${pendingApprovals.length} pending` : "clear", tone: pendingApprovals.length ? "amber" : "emerald" as HudTone },
    { organ: "Lungs", source: "Ward/ICU", value: store.beds.length ? `${occupiedBeds}/${store.beds.length} occupied` : "no data", tone: gauges[0]?.tone ?? "neutral" as HudTone },
    { organ: "Liver", source: "Lab/Pharmacy/Billing queues", value: departmentCounts[0] ? `${departmentCounts[0][0]} ${departmentCounts[0][1]}` : "no data", tone: departmentCounts.length ? "cyan" : "neutral" as HudTone },
  ];

  const commands = [
    { label: "Open patient command centre", action: () => navHash(patient ? `/command-center/patient/${patient.id}` : "/emr") },
    { label: "Open service browser", action: () => navHash("/browser") },
    { label: "Open system health", action: () => navHash("/health") },
    { label: "Open workflow queue", action: () => navHash("/tasks") },
    { label: "Open evolution room", action: () => navHash("/command-center/evolution") },
  ].filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <main className="hud-root min-h-full overflow-hidden bg-[#020812] text-cyan-50" style={{ ["--hud-accent" as any]: HUD_PALETTE.sky }}>
      <style>{hudTokensCss}</style>
      <style>{hudCss}</style>
      <div className="pointer-events-none fixed inset-0 opacity-70 [background-image:linear-gradient(rgba(56,189,248,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,.08)_1px,transparent_1px)] [background-size:42px_42px]" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_12%,rgba(14,165,233,.22),transparent_35%),radial-gradient(circle_at_80%_70%,rgba(16,185,129,.12),transparent_28%)]" />
      <div className="relative mx-auto max-w-[1600px] space-y-4 p-3 sm:p-4 lg:p-6">
        <header className="hud-panel hud-enter flex flex-col gap-4 p-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.42em] text-cyan-300/80">Astra Hospital OS</p>
            <h1 className="mt-1 text-3xl font-black tracking-wide text-white sm:text-4xl">Command Centre</h1>
            <p className="mt-2 max-w-3xl text-sm text-cyan-100/78">
              Live hospital command, patient context, service health, approvals, events, and clinical workflow queues.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["dark", "light", "system"] as ThemeMode[]).map((mode) => (
              <button key={mode} type="button" onClick={() => setTheme(mode)} className={`hud-button ${theme === mode ? "is-active" : ""}`} aria-pressed={theme === mode}>
                {mode === "light" ? <Sun size={14} /> : <Moon size={14} />} {mode}
              </button>
            ))}
            <button type="button" onClick={() => setPaletteOpen(true)} className="hud-button" aria-label="Open command palette">
              <Command size={14} /> Ctrl K
            </button>
          </div>
        </header>

        {/* R5-06 Level-3 critical value alerts escalate here until acknowledged. */}
        <CriticalAlertBanner />

        {error && <p className="hud-panel border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100">Health refresh failed: {error}</p>}

        <section className="grid gap-4 xl:grid-cols-[1.05fr_1.55fr_1fr]">
          <aside className="hud-panel hud-enter p-4 [animation-delay:80ms]">
            <PanelTitle icon={<Radio size={17} />} title="System Layer" />
            <div role="tablist" aria-label="Anatomy layers" className="mt-4 space-y-2">
              {layers.map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={layer === item}
                  onClick={() => setLayer(item)}
                  className={`w-full border px-3 py-3 text-left text-xs font-black uppercase tracking-[0.28em] transition duration-300 ${layer === item ? "border-lime-300/60 bg-lime-300/10 text-lime-100 shadow-[0_0_22px_rgba(190,242,100,.18)]" : "border-cyan-400/15 bg-cyan-400/[0.03] text-cyan-200/70 hover:border-cyan-300/45 hover:text-cyan-100"}`}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <SummaryCard icon={<CheckCircle2 size={16} />} label="Live modules" value={live} />
              <SummaryCard icon={<AlertTriangle size={16} />} label="Degraded" value={degraded} />
              <SummaryCard icon={<Server size={16} />} label="Offline" value={offline} />
              <SummaryCard icon={<Workflow size={16} />} label="Open tasks" value={activeTasks.length} />
            </div>
          </aside>

          <section className="hud-panel hud-enter min-h-[650px] p-4 [animation-delay:160ms]" aria-label="Central holographic anatomy HUD">
            <div className="flex items-start justify-between gap-3">
              <PanelTitle icon={<Stethoscope size={17} />} title="Human Anatomy Command HUD" />
              <span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100">
                {layer} selected
              </span>
            </div>
            <div className="relative mt-4 grid min-h-[560px] place-items-center overflow-hidden">
              <div className="hud-orbit hud-orbit-a" />
              <div className="hud-orbit hud-orbit-b" />
              <AnatomySvg layer={layer} />
              <div className="absolute bottom-3 left-3 right-3 grid gap-2 md:grid-cols-4">
                {organSignals.map((signal) => (
                  <div key={signal.organ} className={`rounded border p-3 shadow-lg backdrop-blur ${toneClass[signal.tone]}`}>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] opacity-80">{signal.organ}</p>
                    <p className="mt-1 text-sm font-black text-white">{signal.value}</p>
                    <p className="mt-1 text-[10px] text-cyan-50/70">{signal.source}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <section className="hud-panel hud-enter p-4 [animation-delay:240ms]">
              <PanelTitle icon={<BedDouble size={17} />} title="Ring Gauges" />
              <div className="mt-4 grid gap-3">
                {gauges.map((gauge) => <RingGauge key={gauge.id} gauge={gauge} />)}
              </div>
            </section>
            <section className="hud-panel hud-enter p-4 [animation-delay:320ms]">
              <PanelTitle icon={<Database size={17} />} title="Live Data Flow" />
              <DataFlow events={flowEvents} />
            </section>
          </aside>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <HudPanel title={patient ? `Patient Command: ${patient.name}` : "Patient Command"} icon={<HeartPulse size={17} />}>
            {patient ? (
              <div className="grid gap-3 md:grid-cols-3">
                <Metric label="UHID" value={patient.id} />
                <Metric label="Case lane" value={patient.department || "Clinical"} />
                <Metric label="Approvals" value={pendingApprovals.length} />
              </div>
            ) : (
              <p className="text-sm text-cyan-100/65">No registered patient selected.</p>
            )}
            <div className="mt-4 h-56 border border-cyan-300/15 bg-black/20 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={vitals.length ? vitals : [{ time: "No vitals", pulse: 0, spo2: 0 }]}>
                  <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#a5f3fc" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#a5f3fc" }} />
                  <Tooltip contentStyle={{ background: "#020812", border: "1px solid rgba(103,232,249,.35)", color: "#ecfeff" }} />
                  <Line type="monotone" dataKey="pulse" stroke="#22d3ee" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="spo2" stroke="#bef264" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </HudPanel>

          <HudPanel title="7D Progress" icon={<Activity size={17} />}>
            {["D1 intake", "D2 evidence", "D3 safety", "D4 operations", "D5 journey", "D6 approvals", "D7 learning"].map((label, index) => (
              <div key={label} className="mb-3">
                <div className="flex justify-between text-xs font-bold text-cyan-100"><span>{label}</span><span>{index < 5 ? "READY" : "PENDING"}</span></div>
                <div className="mt-1 h-2 bg-cyan-950"><div className="h-2 bg-gradient-to-r from-cyan-300 to-lime-300" style={{ width: `${index < 5 ? 100 : 35}%` }} /></div>
              </div>
            ))}
            <p className="text-xs text-cyan-100/60">Last health refresh {data?.at ?? "pending"}.</p>
          </HudPanel>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <HudPanel title="Pending Approvals" icon={<AlertTriangle size={17} />}>
            <List rows={pendingApprovals.slice(0, 6).map((a) => `${a.title} - ${a.requestedBy}`)} empty="No pending approvals." />
          </HudPanel>
          <HudPanel title="Workflow Queue" icon={<Workflow size={17} />}>
            <List rows={activeTasks.map((t) => `${t.priority} - ${t.title}`)} empty="Workflow queue clear." />
          </HudPanel>
          <HudPanel title="Recent Events" icon={<Database size={17} />}>
            <List rows={recentEvents.map((e) => `${e.action}: ${e.detail}`)} empty="No recent events." />
          </HudPanel>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <HudPanel title="Service Browser" icon={<Server size={17} />}>
            <p className="text-sm text-cyan-100/72">Open the verified internal browser for dashboards without duplicating service state.</p>
            <button type="button" onClick={() => navHash("/browser")} className="hud-button mt-3">Open Service Browser</button>
          </HudPanel>
          <HudPanel title="Memory And Evolution" icon={<Database size={17} />}>
            <p className="text-sm text-cyan-100/72">Knowledge fabric: {cards.find((c) => c.name === "Memory")?.state}. Evolution room remains clinician-audited.</p>
            <button type="button" onClick={() => navHash("/command-center/evolution")} className="hud-button mt-3">Open Evolution Room</button>
          </HudPanel>
        </section>

        <section className="hud-panel p-4" aria-label="Module health grid">
          <PanelTitle icon={<Server size={17} />} title="Module Health Matrix" />
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => (
              <article key={card.name} className={`rounded border p-4 shadow-lg ${toneClass[card.state === "LIVE" ? "emerald" : card.state === "DEGRADED" ? "amber" : "red"]}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-black text-white">{card.name}</h2>
                    <p data-testid="module-duty" className="mt-1 text-xs font-black uppercase tracking-wide opacity-80">{card.duty}</p>
                  </div>
                  <span className="rounded-full border px-2 py-1 text-[10px] font-black">{card.state}</span>
                </div>
                <p className="mt-3 text-xs opacity-80">{card.detail}</p>
              </article>
            ))}
          </div>
        </section>
      </div>

      {paletteOpen && (
        <div role="dialog" aria-modal="true" aria-label="Command palette" className="fixed inset-0 z-50 bg-black/70 p-4 backdrop-blur" onMouseDown={() => setPaletteOpen(false)}>
          <div className="hud-panel mx-auto mt-16 max-w-xl p-3 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <label className="flex items-center gap-2 border border-cyan-300/30 bg-black/30 px-3 py-2">
              <Search size={16} />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} className="w-full bg-transparent text-sm text-white outline-none placeholder:text-cyan-100/45" placeholder="Search commands" aria-label="Search commands" />
            </label>
            <div className="mt-3 space-y-1">
              {commands.map((item) => (
                <button key={item.label} type="button" onClick={() => { item.action(); setPaletteOpen(false); toast.success(item.label); }} className="block w-full px-3 py-2 text-left text-sm font-semibold text-cyan-50 hover:bg-cyan-300/10 focus:bg-cyan-300/10">
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function AnatomySvg({ layer }: { layer: AnatomyLayer }) {
  const showNerves = layer === "Nervous";
  const showOrgans = layer === "Organs" || layer === "Circulatory";
  const showSkeleton = layer === "Skeletal";
  const showMuscle = layer === "Muscular";
  return (
    <svg className="relative z-10 h-[520px] w-full max-w-[620px] drop-shadow-[0_0_26px_rgba(34,211,238,.28)]" viewBox="0 0 420 620" role="img" aria-label={`${layer} anatomy visualization`}>
      <defs>
        <filter id="hudGlow"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <path d="M210 68c27 0 43 17 43 43 0 22-10 36-24 43l7 24 53 19 57 80 55 49-22 26-71-46-46-61 7 107 32 183h-42l-43-162-13 162h-42l13-162-43 162h-42l32-183 7-107-46 61-71 46-22-26 55-49 57-80 53-19 7-24c-14-7-24-21-24-43 0-26 16-43 43-43Z" fill="rgba(14,165,233,.12)" stroke="#9beafe" strokeWidth="2.5" />
      <path d="M210 92v430M160 202h100M144 256h132M130 354h160M178 170l-18 198M242 170l18 198" stroke="rgba(125,211,252,.28)" strokeWidth="1" />
      {showSkeleton && <g filter="url(#hudGlow)" stroke="#d9f99d" strokeWidth="2" fill="none"><path d="M210 132v248M172 212h76M178 252h64M185 292h50M150 222l-48 90M270 222l48 90M184 382l-36 132M236 382l36 132" /><circle cx="210" cy="109" r="24" /></g>}
      {showMuscle && <g filter="url(#hudGlow)" stroke="#f59e0b" strokeWidth="2" fill="none" opacity=".9"><path d="M151 214c26 40 27 96 11 159M269 214c-26 40-27 96-11 159M177 387c-18 42-28 83-28 128M243 387c18 42 28 83 28 128" /></g>}
      {showNerves && <g filter="url(#hudGlow)" stroke="#bef264" strokeWidth="2" fill="none"><path d="M210 105v328M210 165c-28 28-62 46-99 75M210 165c28 28 62 46 99 75M210 264c-42 34-69 70-83 110M210 264c42 34 69 70 83 110M210 360c-26 44-44 94-54 154M210 360c26 44 44 94 54 154" /><circle cx="210" cy="105" r="18" fill="rgba(190,242,100,.25)" /></g>}
      {showOrgans && <g filter="url(#hudGlow)"><ellipse cx="184" cy="220" rx="31" ry="45" fill="rgba(125,211,252,.28)" stroke="#e0f2fe" /><ellipse cx="236" cy="220" rx="31" ry="45" fill="rgba(125,211,252,.28)" stroke="#e0f2fe" /><path d="M210 210c23 10 25 47 0 64-25-17-23-54 0-64Z" fill="rgba(248,113,113,.75)" stroke="#fecaca" /><path d="M171 300c34 2 57 13 70 31-31 19-63 15-95 0 5-13 13-23 25-31Z" fill="rgba(132,204,22,.45)" stroke="#bef264" /><ellipse cx="210" cy="102" rx="26" ry="18" fill="rgba(232,121,249,.6)" stroke="#f5d0fe" /></g>}
      <g fill="#67e8f9">{Array.from({ length: 34 }).map((_, i) => <circle key={i} cx={48 + (i * 37) % 322} cy={80 + (i * 71) % 430} r="1.2" opacity=".45" />)}</g>
    </svg>
  );
}

function RingGauge({ gauge }: { gauge: HudGauge }) {
  const angle = gauge.value === null ? 0 : (gauge.value / 100) * 360;
  return (
    <article className={`grid grid-cols-[108px_1fr] items-center gap-3 rounded border p-3 shadow-lg ${toneClass[gauge.tone]}`}>
      <div className="hud-gauge" style={{ "--angle": `${angle}deg` } as React.CSSProperties}>
        <div className="hud-gauge-inner">
          <span>{gauge.display}</span>
        </div>
      </div>
      <div>
        <h3 className="text-sm font-black text-white">{gauge.label}</h3>
        <p className="mt-1 text-xs opacity-80">{gauge.detail}</p>
        <p className="mt-2 text-[10px] font-black uppercase tracking-[0.18em]">{gauge.state}</p>
      </div>
    </article>
  );
}

function DataFlow({ events }: { events: HudFlowEvent[] }) {
  return (
    <div className="mt-4">
      <div className="relative h-32 overflow-hidden border border-cyan-300/15 bg-black/30">
        <div className="absolute left-4 top-4 text-xs font-black uppercase tracking-[0.35em] text-cyan-100/80">Integrations</div>
        <div className="flow-line" />
        <div className="flow-ring" />
        <div className="absolute right-4 top-4 text-xs font-black uppercase tracking-[0.28em] text-cyan-100/80">Messages sent</div>
        {events.length ? Array.from({ length: 18 }).map((_, i) => <span key={i} className="flow-dot" style={{ animationDelay: `${i * 120}ms`, top: `${32 + (i % 5) * 11}px` }} />) : <p className="absolute bottom-4 left-4 text-xs text-cyan-100/55">Idle: no event bus messages yet.</p>}
      </div>
      <ul className="mt-3 space-y-2">
        {events.length ? events.map((event) => (
          <li key={event.id} className={`rounded border px-3 py-2 text-xs ${toneClass[event.tone]}`}>
            <div className="flex items-center justify-between gap-3"><span className="font-black text-white">{event.label}</span><span>{new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>
            <p className="mt-1 opacity-75">{event.source} {"→"} {event.target}</p>
          </li>
        )) : <li className="rounded border border-cyan-300/15 px-3 py-2 text-xs text-cyan-100/60">No redacted flight-recorder events available.</li>}
      </ul>
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <article className="border border-cyan-300/15 bg-cyan-300/[0.04] p-3">
      <div className="flex items-center justify-between"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100/65">{label}</p>{icon}</div>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
    </article>
  );
}

function PanelTitle({ icon, title }: { title: string; icon: React.ReactNode }) {
  return <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.22em] text-cyan-100">{icon}{title}</h2>;
}

function HudPanel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="hud-panel p-4">
      <PanelTitle title={title} icon={icon} />
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="border border-cyan-300/15 bg-black/20 p-3"><p className="text-xs text-cyan-100/60">{label}</p><p className="mt-1 font-black text-white">{value}</p></div>;
}

function List({ rows, empty }: { rows: string[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-cyan-100/60">{empty}</p>;
  return (
    <ul className="space-y-2">
      {rows.map((row) => <li key={row} className="border border-cyan-300/15 bg-black/20 p-2 text-sm text-cyan-50">{row}</li>)}
    </ul>
  );
}

const hudCss = `
.hud-root * { letter-spacing: 0; }
.hud-panel { position: relative; border: 1px solid rgba(103,232,249,.22); background: linear-gradient(135deg, rgba(8,22,38,.86), rgba(2,8,18,.74)); box-shadow: 0 0 0 1px rgba(14,165,233,.08), 0 24px 70px rgba(0,0,0,.35), inset 0 1px 0 rgba(186,230,253,.08), 0 0 22px -8px var(--hud-accent); backdrop-filter: blur(16px); }
.hud-panel::before { content: ""; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(transparent 50%, rgba(125,211,252,.035) 50%); background-size: 100% 4px; opacity: .55; }
.hud-button { display: inline-flex; align-items: center; gap: .5rem; border: 1px solid rgba(103,232,249,.28); background: rgba(8,47,73,.34); color: #cffafe; padding: .55rem .8rem; font-size: .75rem; font-weight: 800; text-transform: capitalize; transition: transform .25s ease, border-color .25s ease, background .25s ease; }
.hud-button:hover, .hud-button:focus-visible, .hud-button.is-active { border-color: rgba(190,242,100,.7); background: rgba(190,242,100,.12); color: white; transform: translateY(-1px); outline: none; }
.hud-enter { animation: hudIn .48s cubic-bezier(.2,.8,.2,1) both; }
.hud-orbit { position: absolute; border-radius: 9999px; border: 1px solid rgba(103,232,249,.24); box-shadow: inset 0 0 35px rgba(14,165,233,.08), 0 0 42px rgba(14,165,233,.08); }
.hud-orbit::before { content: ""; position: absolute; inset: -2px; border-radius: inherit; background: conic-gradient(from 20deg, transparent 0 12deg, rgba(103,232,249,.65) 12deg 18deg, transparent 18deg 72deg, rgba(190,242,100,.48) 72deg 80deg, transparent 80deg); mask: radial-gradient(farthest-side, transparent calc(100% - 8px), #000 calc(100% - 7px)); }
.hud-orbit-a { width: min(92%, 620px); aspect-ratio: 1; animation: spin 18s linear infinite; }
.hud-orbit-b { width: min(76%, 510px); aspect-ratio: 1; animation: spin 28s linear reverse infinite; }
.hud-gauge { width: 96px; aspect-ratio: 1; display: grid; place-items: center; border-radius: 50%; background: conic-gradient(#22d3ee var(--angle), rgba(148,163,184,.18) 0), radial-gradient(circle, rgba(2,8,18,.95) 58%, transparent 59%); box-shadow: 0 0 28px rgba(34,211,238,.18); }
.hud-gauge-inner { width: 64px; aspect-ratio: 1; display: grid; place-items: center; border: 1px solid rgba(103,232,249,.35); clip-path: polygon(25% 4%, 75% 4%, 100% 50%, 75% 96%, 25% 96%, 0 50%); background: rgba(2,8,18,.86); color: white; font-size: .72rem; font-weight: 900; text-align: center; }
.flow-line { position: absolute; left: 24%; right: 22%; top: 63px; height: 1px; background: linear-gradient(90deg, transparent, rgba(226,232,240,.72), transparent); }
.flow-ring { position: absolute; left: 48%; top: 34px; width: 62px; aspect-ratio: 1; border-radius: 50%; border: 1px solid rgba(226,232,240,.62); transform: translateX(-50%); box-shadow: 0 0 22px rgba(226,232,240,.16); }
.flow-dot { position: absolute; left: 18%; width: 5px; height: 5px; border-radius: 9999px; background: #e2e8f0; opacity: .8; animation: flow 2.8s linear infinite; }
@keyframes hudIn { from { opacity: 0; transform: translateY(12px) scale(.985); filter: blur(8px); } to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes flow { from { transform: translateX(0); opacity: 0; } 15% { opacity: .85; } to { transform: translateX(410px); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .hud-enter, .hud-orbit-a, .hud-orbit-b, .flow-dot { animation: none !important; } .hud-button { transition: none; } }
`;
