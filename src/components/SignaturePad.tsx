// Canvas signature pad for consent capture (OT / procedures).
// Pointer-events based, devicePixelRatio-scaled, fixed 480×160 logical size.

import { useEffect, useRef, useState } from "react";
import { Eraser, PenLine } from "lucide-react";

export function SignaturePad({ onChange, label = "Sign inside the box" }: { onChange: (dataUrl: string | null) => void; label?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = 480 * dpr;
    c.height = 160 * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";
  }, []);

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 480, y: ((e.clientY - r.top) / r.height) * 160 };
  };

  const down = (e: React.PointerEvent) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    drawing.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    if (!hasInk) setHasInk(true);
  };

  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    const c = canvasRef.current;
    if (c) onChange(c.toDataURL("image/png"));
  };

  const clear = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, 480, 160);
    setHasInk(false);
    onChange(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
          <PenLine size={12} className="text-amber-300" /> {label}
        </span>
        <button type="button" className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1" onClick={clear}>
          <Eraser size={11} /> Clear
        </button>
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: 160, touchAction: "none" }}
        className="rounded-lg bg-white cursor-crosshair border border-white/20"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerLeave={up}
      />
      <p className="text-[10px] text-slate-500 mt-1">{hasInk ? "Signature captured." : "Draw with mouse / finger / stylus."}</p>
    </div>
  );
}
