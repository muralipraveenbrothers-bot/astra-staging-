import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------- Glass card (premium gold/cyan edge) ---------- */
export function GlassCard({
  children,
  className,
  hover = false,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={cn(
        "glass p-5 relative",
        hover && "glass-hover",
        "border-amber-400/15 shadow-[0_10px_44px_-14px_rgba(212,175,55,0.28)]",
        className
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/60 to-transparent"
      />
      {children}
    </div>
  );
}

/* ---------- Status dot ---------- */
export function StatusDot({ status, className }: { status: "healthy" | "issues" | "disabled"; className?: string }) {
  const color =
    status === "healthy" ? "bg-emerald-400" : status === "issues" ? "bg-amber-400" : "bg-red-400";
  return (
    <span className={cn("relative inline-flex h-2.5 w-2.5", className)}>
      <span className={cn("absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping", color)} />
      <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", color)} />
    </span>
  );
}

/* ---------- Badge ---------- */
export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "cyan" | "violet" | "green" | "amber" | "red";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-white/5 text-slate-300 border-white/10",
    cyan: "bg-cyan-400/10 text-cyan-300 border-cyan-400/30",
    violet: "bg-violet-400/10 text-violet-300 border-violet-400/30",
    green: "bg-emerald-400/10 text-emerald-300 border-emerald-400/30",
    amber: "bg-amber-400/10 text-amber-300 border-amber-400/30",
    red: "bg-red-400/10 text-red-300 border-red-400/30",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}

/* ---------- Modal ---------- */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("glass relative z-10 w-full p-6 max-h-[85vh] overflow-y-auto border-amber-400/20 shadow-[0_20px_60px_-20px_rgba(212,175,55,0.35)]", wide ? "max-w-2xl" : "max-w-md")}>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/70 to-transparent"
        />
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-semibold text-gold-shimmer">{title}</h3>
          <button className="btn-ghost !px-2 !py-1" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- Progress ring ---------- */
export function ProgressRing({
  value,
  size = 64,
  stroke = 6,
  color = "#d4af37",
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (Math.min(100, Math.max(0, value)) / 100) * c;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.22,1,0.36,1)", filter: `drop-shadow(0 0 6px ${color}66)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-bold text-white">{value}%</span>
        {label && <span className="text-[9px] text-slate-400">{label}</span>}
      </div>
    </div>
  );
}

/* ---------- Count-up number ---------- */
export function CountUp({ to, duration = 1200, prefix = "", suffix = "" }: { to: number; duration?: number; prefix?: string; suffix?: string }) {
  const [val, setVal] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(to * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [to, duration]);
  return (
    <span>
      {prefix}
      {val.toLocaleString("en-IN")}
      {suffix}
    </span>
  );
}

/* ---------- Section heading (premium gold) ---------- */
export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h2 className="font-display text-xl font-bold text-gold-shimmer">{title}</h2>
      {subtitle && <p className="text-sm text-slate-400 mt-1">{subtitle}</p>}
    </div>
  );
}
