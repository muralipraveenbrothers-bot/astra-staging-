import { useState, useCallback, useEffect } from "react";
import { CircleDot, RotateCcw, ZoomIn, ZoomOut, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { SYSTEM_FILTERS, type SystemFilter } from "./types";
import { AnatomyViewer } from "./AnatomyViewer";
import { PatientLeftPanel } from "./PatientLeftPanel";
import { HotspotPanel } from "./HotspotPanel";
import { AstraCommandPanel } from "./AstraCommandPanel";
import { AstraLiveDoctor } from "@/components/astro/AstraLiveDoctor";
import { HOTSPOTS, HOTSPOT_LIST } from "./hotspots";
import { AnatomyVisualModeSelector } from "./AnatomyVisualModeSelector";
import { AstraAtlasViewer } from "@/components/AstraAtlasViewer";
import { AnatomyErrorBoundary } from "@/components/AnatomyErrorBoundary";
import type { AnatomyVisualMode } from "@/types/orthoPlanner";
import { anatomyCommandBus } from "@/services/anatomyCommandBus";
import { auditLogger } from "@/services/auditLogger";
import HoloGesturePanel from "@/sections/browser/HoloGesturePanel";

export function DoctorEMR() {
  const [activeId, setActiveId] = useState<string | null>("dengue");
  const [systemFilter, setSystemFilter] = useState<SystemFilter>("all");
  const [liveDoctorOpen, setLiveDoctorOpen] = useState(false);
  const [visualMode, setVisualMode] = useState<AnatomyVisualMode>("lightweight");
  const [atlasAvailable, setAtlasAvailable] = useState(false);
  const [engineLabel, setEngineLabel] = useState("idle");
  const [selectedStructure, setSelectedStructure] = useState<{ id: string; name: string; system: string } | null>(null);

  const active = activeId ? HOTSPOTS[activeId] : null;
  const affected = HOTSPOT_LIST.filter((h) => h.patientAffected).length;

  useEffect(() => {
    fetch("/integrations/human-atlas/index.html", { method: "HEAD" })
      .then((r) => setAtlasAvailable(r.ok))
      .catch(() => setAtlasAvailable(false));
  }, []);

  useEffect(() => {
    if (atlasAvailable && visualMode === "lightweight") {
      setVisualMode("astra_atlas");
    }
  }, [atlasAvailable, visualMode]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      handleAnatomyCommand(detail.action, detail.args);
    };
    window.addEventListener("astra:anatomy-command", handler);
    return () => window.removeEventListener("astra:anatomy-command", handler);
  }, []);

  const handleAnatomyCommand = useCallback((action: string, args: string) => {
    switch (action) {
      case "show_system":
        anatomyCommandBus.showSystem(args);
        setVisualMode("astra_atlas");
        break;
      case "hide_system":
        anatomyCommandBus.hideSystem(args);
        break;
      case "isolate":
        anatomyCommandBus.isolate(args);
        setVisualMode("astra_atlas");
        break;
      case "search":
        anatomyCommandBus.search(args);
        setVisualMode("astra_atlas");
        break;
      case "explode":
        anatomyCommandBus.explode();
        break;
      case "reset":
        anatomyCommandBus.reset();
        break;
      case "camera_reset":
        anatomyCommandBus.cameraReset();
        break;
    }
  }, []);

  const handleStructureSelected = useCallback((id: string, name: string, system: string) => {
    setSelectedStructure({ id, name, system });
    auditLogger.log({
      action: "CLINICAL_DATA_ACCESSED",
      performedBy: "Doctor EMR Anatomy",
      userRole: "Doctor",
      details: `Selected anatomy structure: ${name} (${system})`,
      sourceModule: "anatomy_viewer",
    });
  }, []);

  const handleAskAstra = useCallback(() => {
    if (!selectedStructure) return;
    const query = `Tell me about ${selectedStructure.name} in the context of this patient.`;
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("Astra:command", { detail: { text: query, source: "anatomy" } }));
    }
  }, [selectedStructure]);

  const handleModeChange = useCallback((mode: AnatomyVisualMode) => {
    setVisualMode(mode);
    auditLogger.log({
      action: "CLINICAL_DATA_ACCESSED",
      performedBy: "Doctor EMR",
      userRole: "Doctor",
      details: `Switched anatomy visual mode to ${mode}`,
      sourceModule: "anatomy_viewer",
    });
  }, []);

  return (
    <div className="flex h-full flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-slate-700/40 bg-slate-900/60 px-4 py-2 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-500/20 text-cyan-300">
            <CircleDot size={16} />
          </div>
          <div>
            <div className="text-sm font-bold text-white">ASTRA Doctor EMR</div>
            <div className="text-[10px] text-slate-400">Local 3D anatomy atlas · not a hospital record</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <AnatomyVisualModeSelector
            mode={visualMode}
            onModeChange={handleModeChange}
            atlasAvailable={atlasAvailable}
          />
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            <span className="text-cyan-200">Engine: {engineLabel}</span>
          </div>
          <div className="text-[10px] text-slate-400">Affected: <span className="font-bold text-amber-300">{affected}</span></div>
          <div className="h-7 w-7 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500" title="Doctor profile" />
        </div>
      </header>

      {/* Main 3-panel content */}
      <div className="grid min-h-0 flex-1 grid-cols-12 gap-0">
        {/* Left: Patient EMR */}
        <aside className="col-span-3 min-h-0 border-r border-slate-700/40">
          <PatientLeftPanel />
        </aside>

        {/* Center: 3D Holo-Engine */}
        <main className="col-span-6 relative flex flex-col">
          {/* 3D viewer */}
          <div className="relative min-h-0 flex-1">
            {visualMode === "astra_atlas" && (
              <AnatomyErrorBoundary>
                <AstraAtlasViewer onStructureSelected={handleStructureSelected} />
              </AnatomyErrorBoundary>
            )}
            {(visualMode === "clinical_holo" || visualMode === "lightweight") && (
              <AnatomyViewer activeId={activeId} onSelect={setActiveId} systemFilter={systemFilter} />
            )}

            {/* Overlay controls */}
            <div className="pointer-events-none absolute inset-x-0 top-3 flex items-start justify-between px-3">
              <div className="pointer-events-auto rounded-lg border border-cyan-500/30 bg-slate-900/80 px-3 py-1.5 text-[10px] font-semibold text-cyan-200 backdrop-blur-md">
                {visualMode === "astra_atlas" ? "ASTRA ATLAS · HUMAN ANATOMY ENGINE" : "3D ORBIT · AUTO-SCAN ON"}
              </div>
              <div className="pointer-events-auto flex gap-1">
                <button className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-600/50 bg-slate-900/80 text-slate-300 hover:text-cyan-300"><ZoomIn size={13} /></button>
                <button className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-600/50 bg-slate-900/80 text-slate-300 hover:text-cyan-300"><ZoomOut size={13} /></button>
                <button className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-600/50 bg-slate-900/80 text-slate-300 hover:text-cyan-300"><RotateCcw size={13} /></button>
              </div>
            </div>

            {/* System filter chips */}
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
              <div className="pointer-events-auto flex flex-wrap justify-center gap-1">
                {SYSTEM_FILTERS.map((f: SystemFilter) => (
                  <button
                    key={f}
                    onClick={() => setSystemFilter(f)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[10px] font-semibold transition-colors",
                      systemFilter === f
                        ? "border-cyan-400/50 bg-cyan-500/20 text-cyan-200"
                        : "border-slate-600/40 bg-slate-900/80 text-slate-400 hover:border-cyan-500/30 hover:text-cyan-300"
                    )}
                  >
                    {f === "all" ? "All Systems" : f}
                  </button>
                ))}
              </div>
            </div>

            {/* Status legend */}
            <div className="pointer-events-none absolute bottom-3 left-3">
              <div className="pointer-events-auto flex flex-col gap-1 rounded-lg border border-slate-700/40 bg-slate-900/80 px-2.5 py-1.5 text-[9px] text-slate-400">
                <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" /> Critical</div>
                <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" /> Attention</div>
                <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" /> Normal</div>
              </div>
            </div>

            {/* Selected structure indicator */}
            {selectedStructure && visualMode === "astra_atlas" && (
              <div className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2">
                <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-slate-900/90 px-3 py-2 backdrop-blur-md">
                  <div className="text-[10px] text-cyan-200">
                    Selected: <span className="font-bold text-white">{selectedStructure.name}</span>
                    <span className="text-slate-400"> ({selectedStructure.system})</span>
                  </div>
                  <button
                    onClick={handleAskAstra}
                    className="flex items-center gap-1 rounded-md bg-cyan-500/20 px-2 py-1 text-[10px] font-semibold text-cyan-200 hover:bg-cyan-500/30"
                  >
                    <MessageSquare size={10} /> Ask Astra
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Bottom: ASTRA command/voice panel */}
          <AstraCommandPanel onCommand={setActiveId} activeId={activeId} onEngine={setEngineLabel} />
        </main>

        {/* Right: Hotspot detail / Astra Live Doctor (toggle) */}
        <aside className="col-span-3 min-h-0 flex flex-col border-l border-slate-700/40">
          <div className="max-h-56 overflow-y-auto border-b border-slate-700/40 p-2">
            <HoloGesturePanel />
          </div>
          <div className="flex items-center justify-between border-b border-slate-700/40 px-3 py-1.5">
            <span className="text-[11px] uppercase tracking-wide text-slate-400">Panel</span>
            <button
              onClick={() => setLiveDoctorOpen((v) => !v)}
              className={cn("rounded-md px-2 py-0.5 text-[11px] font-medium transition", liveDoctorOpen ? "bg-cyan-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700")}
            >
              {liveDoctorOpen ? "Hotspot" : "Live Doctor"}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {liveDoctorOpen ? <AstraLiveDoctor patientName={active?.label ?? "Astra AI Doctor"} /> : <HotspotPanel hotspot={active} />}
          </div>
        </aside>
      </div>
    </div>
  );
}