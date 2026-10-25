import React, { useState, lazy, Suspense } from "react";
import { Boxes } from "lucide-react";
import { HumanAnatomyDashboard } from "@/components/Doctor/HumanAnatomyDashboard";
import { HudGlassPanel } from "./hudBits";
import type { Patient } from "./types";

// Lazy-load the heavy 3D viewer

const ANATOMY_GLBS = [
  "/models/anatomy/skeleton.glb",
  "/models/anatomy/muscles.glb",
  "/models/anatomy/vascular.glb",
  "/models/anatomy/joints.glb",
];

function preloadAnatomyGlbs(): void {
  if (typeof document === "undefined") return;
  for (const href of ANATOMY_GLBS) {
    if (document.head.querySelector('link[data-anatomy="' + href + '"]')) continue;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "fetch";
    link.href = href;
    link.crossOrigin = "anonymous";
    link.setAttribute("data-anatomy", href);
    document.head.appendChild(link);
  }
}

preloadAnatomyGlbs();

const Anatomy3DViewer = lazy(() => import("@/features/anatomy3d/Anatomy3DViewer"));

/** Quick WebGL availability check (no canvas allocation). */
function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    return !!gl;
  } catch {
    return false;
  }
}

interface Props {
  patient: Patient;
  isDarkTheme: boolean;
  onQuickOrder: (item: string, category: string) => void;
  onNavigate: (route: string) => void;
}

/**
 * Centre stage. Wraps the existing HumanAnatomyDashboard (which owns the
 * Cardiovascular / Respiratory / Skeletal / Muscular / Nervous / Digestive
 * system tabs in its own header). Prompt 05 swaps the inner viewer for the
 * live 3D model without touching this shell.
 *
 * Falls back to HumanAnatomyDashboard if WebGL is unavailable or the 3D
 * viewer fails to load.
 */
export function AnatomyStage({ patient, isDarkTheme, onQuickOrder, onNavigate }: Props) {
  const [use3D] = useState(() => (typeof document !== "undefined" ? hasWebGL() : false));
  const [loadFailed, setLoadFailed] = useState(false);

  const show3D = use3D && !loadFailed;

  return (
    <HudGlassPanel
      accent={"#1d4ed8"}
      delay={120}
      active
      className="p-3 flex flex-col gap-3"
      ariaLabel="Anatomy stage"
    >
      <div className="flex items-center gap-2">
        <Boxes className="w-4 h-4" style={{ color: "#1d4ed8" }} />
        <span className="text-xs font-black uppercase tracking-[0.2em] text-white">Anatomy Stage</span>
        <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-white/45">
          {patient.name} • {patient.bed}
        </span>
      </div>
      <div className="dh-anatomy-fit">
        {show3D ? (
          <ErrorBoundary onError={() => setLoadFailed(true)}>
            <Suspense
              fallback={
                <div className="dh-anatomy-canvas" style={{ color: "#000000", fontWeight: 600 }}>
                  <span style={{ position: "absolute", left: 8, bottom: 8, fontSize: 11, pointerEvents: "none" }}>
                    Opening anatomy
                  </span>
                </div>
              }
            >
              <Anatomy3DViewer
                patient={patient}
                isDarkTheme={isDarkTheme}
              />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <HumanAnatomyDashboard
            patient={patient}
            isDarkTheme={isDarkTheme}
            onQuickOrder={onQuickOrder}
            onNavigate={onNavigate}
          />
        )}
      </div>
    </HudGlassPanel>
  );
}

// ---------------------------------------------------------------------------
// Minimal error boundary (class component required by React)
// ---------------------------------------------------------------------------

interface EBProps {
  children: React.ReactNode;
  onError: () => void;
}
interface EBState {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<EBProps, EBState> {
  state: EBState = { hasError: false };

  static getDerivedStateFromError(): EBState {
    return { hasError: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
