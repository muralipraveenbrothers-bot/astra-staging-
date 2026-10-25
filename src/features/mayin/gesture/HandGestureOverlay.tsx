/**
 * ASTRA — HAND GESTURE OVERLAY (prompt 07)
 * ============================================================================
 * Rendered once, globally, next to SaarathiPresence. The camera stays OFF
 * until the doctor switches "Hand control" ON (astra.gesture.enabled):
 *
 *   ON  → asks for the camera, shows a small draggable glass PiP preview with
 *         the hand skeleton drawn in neon mint and the current gesture name.
 *   OFF → every camera track is stopped (the camera light turns off).
 *
 * Frames never leave the browser: landmarks are computed locally by the
 * vendored MediaPipe bundle and fed straight into the ViewerGestureProcessor
 * → MayinGestureBridge → active 3D viewer. Nothing is recorded or uploaded.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Hand, X } from "lucide-react";
import {
  mayinGestureController,
  type GestureCameraFrame,
} from "./MayinGestureController";
import type { Landmark } from "./mayinGestureMath";
import { ViewerGestureProcessor } from "./ViewerGestureProcessor";
import { createMayinGestureBridge } from "./MayinGestureBridge";
import {
  getActiveGestureViewer,
  subscribeGestureViewerRegistry,
} from "./gestureViewerRegistry";
import { useGesturePrefs } from "./useGesturePrefs";
import { activateDashboardControl, gestureSelect, readDashboardControls } from "@/astra/controls/dashboardControlSelect";

const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const MINT = "#5ef2c2";

const GESTURE_HELP: { gesture: string; action: string }[] = [
  { gesture: "Open palm moving", action: "Move the 3D cursor (hover highlights)" },
  { gesture: "Pinch tap (< 0.3 s)", action: "Select structure under cursor" },
  { gesture: "Pinch hold + move", action: "Rotate the model" },
  { gesture: "Two-hand pinch spread / close", action: "Zoom" },
  { gesture: "Open palm push / pull", action: "Zoom in / out" },
  { gesture: "Two fingers (peace) move", action: "Pan" },
  { gesture: "Index + pinky up (Spider-Man)", action: "Free rotate by wrist" },
  { gesture: "Fist held 0.7 s", action: "Reset view" },
  { gesture: "Open-palm swipe left / right", action: "Previous / next tour label" },
  { gesture: "Both palms open, held 1 s", action: "Present mode" },
];

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  hands: Landmark[][],
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = MINT;
  ctx.fillStyle = MINT;
  ctx.shadowColor = MINT;
  ctx.shadowBlur = 6;
  for (const hand of hands) {
    if (!hand?.length) continue;
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      const pa = hand[a];
      const pb = hand[b];
      if (!pa || !pb) continue;
      ctx.moveTo(pa.x * width, pa.y * height);
      ctx.lineTo(pb.x * width, pb.y * height);
    }
    ctx.stroke();
    for (const p of hand) {
      ctx.beginPath();
      ctx.arc(p.x * width, p.y * height, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.shadowBlur = 0;
}

export function HandGestureOverlay() {
  const { gestureEnabled, setGestureEnabled, sensitivity, setSensitivity } = useGesturePrefs();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const processorRef = useRef<ViewerGestureProcessor | null>(null);
  const bridgeRef = useRef(createMayinGestureBridge());
  const tipRef = useRef<{ x: number; y: number } | null>(null);
  const pointedRef = useRef(false);

  const [engineState, setEngineState] = useState<string>("idle");
  const [error, setError] = useState<string | null>(null);
  const [gestureName, setGestureName] = useState("—");
  const [showHelp, setShowHelp] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  const viewerConnected = useSyncExternalStore(
    subscribeGestureViewerRegistry,
    () => getActiveGestureViewer() !== null,
  );

  const secureContext =
    typeof window !== "undefined" ? window.isSecureContext : true;

  // Keep the processor in sync with the editable sensitivity sliders.
  useEffect(() => {
    processorRef.current?.setSensitivity(sensitivity);
  }, [sensitivity]);

  // Camera lifecycle: ON starts the engine, OFF stops every track.
  useEffect(() => {
    if (!gestureEnabled || !secureContext) return;
    let cancelled = false;
    let unsubscribeFrames: (() => void) | null = null;

    const selectDashboard = (gesture: "pinch" | "point") => {
      if (typeof document === "undefined" || !tipRef.current) return;
      const x = (1 - tipRef.current.x) * window.innerWidth;
      const y = tipRef.current.y * window.innerHeight;
      const decision = gestureSelect({
        gesture,
        x,
        y,
        controls: readDashboardControls(document),
        viewerActive: getActiveGestureViewer() !== null,
      });
      if (decision.ok && decision.controlId) activateDashboardControl(document, decision.controlId);
    };
    const processor = new ViewerGestureProcessor({
      sensitivity,
      onEvent: (event) => {
        if (event.type === "gesture") {
          setGestureName(event.name);
          if (event.name === "Point") {
            if (!pointedRef.current) {
              pointedRef.current = true;
              selectDashboard("point");
            }
          } else {
            pointedRef.current = false;
          }
        }
        if (event.type === "select") selectDashboard("pinch");
        bridgeRef.current.handleViewerEvent(event);
      },
    });
    processorRef.current = processor;

    const controller = mayinGestureController;
    setEngineState("starting");
    setError(null);

    unsubscribeFrames = controller.onFrame((frame: GestureCameraFrame) => {
      const tip = frame.landmarks[0]?.[8];
      if (tip) tipRef.current = { x: tip.x, y: tip.y };
      processor.processFrame(frame.landmarks);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) drawSkeleton(ctx, frame.landmarks, canvas.width, canvas.height);
    });

    controller.setVideoElement(videoRef.current);
    void controller.start().then((state) => {
      if (cancelled) {
        void controller.stop();
        return;
      }
      setEngineState(state);
      if (state === "unavailable") {
        setError(controller.getDiagnostics().lastError ?? "Gesture engine unavailable.");
      }
    });

    return () => {
      cancelled = true;
      unsubscribeFrames?.();
      processorRef.current = null;
      void mayinGestureController.stop();
      const canvas = canvasRef.current;
      canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      setEngineState("idle");
      setGestureName("—");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gestureEnabled, secureContext]);

  // Draggable PiP (pointer events; works for mouse + touch).
  const onDragStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const panel = (e.currentTarget.closest("[data-gesture-pip]") as HTMLElement) ?? null;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onDragMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setPosition({
      x: Math.max(8, Math.min(window.innerWidth - 320, e.clientX - drag.dx)),
      y: Math.max(8, Math.min(window.innerHeight - 120, e.clientY - drag.dy)),
    });
  }, []);

  const onDragEnd = useCallback(() => {
    dragRef.current = null;
  }, []);

  const sliders = useMemo(
    () =>
      ([
        ["rotate", "Rotate", 0.2, 2.5],
        ["zoom", "Zoom", 0.2, 2.5],
        ["pan", "Pan", 0.2, 2.5],
        ["cursor", "Cursor gain", 0.5, 2.0],
        ["smoothing", "Smoothing", 0.1, 0.9],
      ] as const),
    [],
  );

  if (!gestureEnabled) return null;

  if (!secureContext) {
    return (
      <div
        className="fixed bottom-24 right-6 z-[1100] w-72 rounded-2xl border border-amber-400/40 bg-black/85 p-4 text-xs text-amber-200 backdrop-blur-xl shadow-2xl"
        role="alert"
      >
        <div className="flex items-start justify-between gap-2">
          <strong>Camera needs a secure context</strong>
          <button
            type="button"
            onClick={() => setGestureEnabled(false)}
            aria-label="Turn hand control off"
            className="text-amber-200/70 hover:text-amber-100"
          >
            <X size={14} />
          </button>
        </div>
        <p className="mt-2 leading-relaxed text-amber-100/80">
          Browser cameras only work on <code>http://localhost</code> or HTTPS. Open Astra
          on localhost, or use HTTPS on LAN laptops.
        </p>
      </div>
    );
  }

  const style: React.CSSProperties = position
    ? { left: position.x, top: position.y }
    : { right: 24, bottom: 96 };

  return (
    <div
      data-gesture-pip
      className="fixed z-[1100] w-[300px] select-none rounded-2xl border border-emerald-300/25 bg-[rgba(10,12,28,0.78)] shadow-[0_18px_50px_rgba(0,0,0,0.5),0_0_24px_-8px_rgba(94,242,194,0.5)] backdrop-blur-xl"
      style={style}
    >
      {/* Header (drag handle) */}
      <div
        className="flex cursor-grab items-center gap-2 rounded-t-2xl border-b border-white/10 px-3 py-2 active:cursor-grabbing"
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      >
        <Hand size={13} className="text-emerald-300" />
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200">
          Hand control
        </span>
        <span className="ml-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">
          {gestureName}
        </span>
        <button
          type="button"
          onClick={() => setShowHelp((v) => !v)}
          className="ml-auto rounded border border-white/15 px-1.5 py-0.5 text-[9px] font-bold text-white/60 hover:text-white"
          aria-label="Gesture help"
        >
          ?
        </button>
        <button
          type="button"
          onClick={() => setGestureEnabled(false)}
          aria-label="Turn hand control off (stops the camera)"
          className="text-white/60 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>

      {/* Camera preview + skeleton (mirrored like a selfie view) */}
      <div className="relative overflow-hidden rounded-b-2xl">
        <div style={{ transform: "scaleX(-1)" }}>
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            className="block h-[169px] w-[300px] bg-black object-cover"
          />
          <canvas
            ref={canvasRef}
            width={640}
            height={360}
            className="pointer-events-none absolute inset-0 h-[169px] w-[300px]"
          />
        </div>

        {engineState === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-[10px] font-bold uppercase tracking-widest text-emerald-200">
            Starting camera…
          </div>
        )}

        {engineState === "unavailable" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 p-3 text-center">
            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-300">
              {error?.includes("Hand model not installed")
                ? "Hand model not installed"
                : "Camera unavailable"}
            </span>
            <span className="text-[10px] leading-relaxed text-white/60">
              {error ?? "Gesture engine unavailable."}
            </span>
          </div>
        )}

        <div className="pointer-events-none absolute bottom-1 left-2 text-[8px] font-bold uppercase tracking-wider text-white/40">
          {viewerConnected ? "Viewer linked" : "Open a 3D viewer to control it"} • local only
        </div>
      </div>

      {/* Help card + sensitivity sliders */}
      {showHelp && (
        <div className="max-h-72 overflow-y-auto rounded-b-2xl border-t border-white/10 p-3">
          <table className="w-full text-left text-[10px] text-white/75">
            <tbody>
              {GESTURE_HELP.map((row) => (
                <tr key={row.gesture} className="align-top">
                  <td className="pr-2 pb-1.5 font-bold text-emerald-200">{row.gesture}</td>
                  <td className="pb-1.5">{row.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 border-t border-white/10 pt-2">
            <div className="mb-1 text-[9px] font-bold uppercase tracking-widest text-white/50">
              Sensitivity
            </div>
            {sliders.map(([key, label, min, max]) => (
              <label
                key={key}
                className="mb-1 flex items-center gap-2 text-[10px] text-white/70"
              >
                <span className="w-20">{label}</span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={0.05}
                  value={sensitivity[key]}
                  onChange={(e) =>
                    setSensitivity({ [key]: Number(e.target.value) } as Parameters<
                      typeof setSensitivity
                    >[0])
                  }
                  className="h-1 flex-1 accent-emerald-300"
                />
                <span className="w-8 text-right tabular-nums">
                  {sensitivity[key].toFixed(2)}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
