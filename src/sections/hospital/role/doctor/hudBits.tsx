import React, { useEffect, useRef, useState } from "react";

const prefersReduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Animated number count-up for KPI tiles. Jumps straight to value on reduced-motion. */
export function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(prefersReduced() ? target : 0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (prefersReduced()) {
      setValue(target);
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (target - from) * eased);
      setValue(next);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}

/**
 * FPS watchdog + manual Performance-mode toggle. Auto-enables performance mode
 * when FPS stays under 30 for ~3s. Persisted so the doctor's choice survives
 * navigation. Reduced-motion users start in performance mode.
 */
export function usePerformanceMode(): {
  perf: boolean;
  setPerf: (v: boolean) => void;
  auto: boolean;
} {
  const [perf, setPerfState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem("astra.doctorHud.perf");
    if (saved !== null) return saved === "1";
    return prefersReduced();
  });
  const [auto, setAuto] = useState(false);
  const setPerf = (v: boolean) => {
    setPerfState(v);
    setAuto(false);
    try {
      localStorage.setItem("astra.doctorHud.perf", v ? "1" : "0");
    } catch {
      /* storage may be unavailable */
    }
  };

  useEffect(() => {
    if (perf) return; // already light; don't churn
    let frames = 0;
    let last = performance.now();
    let lowSince: number | null = null;
    let raf = 0;
    const loop = (now: number) => {
      frames += 1;
      const elapsed = now - last;
      if (elapsed >= 1000) {
        const fps = (frames * 1000) / elapsed;
        frames = 0;
        last = now;
        if (fps < 30) {
          if (lowSince === null) lowSince = now;
          else if (now - lowSince >= 3000) {
            setAuto(true);
            setPerfState(true);
            return; // stop the watchdog once tripped
          }
        } else {
          lowSince = null;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [perf]);

  return { perf, setPerf, auto };
}

type PanelProps = {
  accent?: string;
  delay?: number;
  active?: boolean;
  lift?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  as?: "section" | "aside" | "div" | "article";
  ariaLabel?: string;
};

/** Glass panel shell shared by every doctor-HUD card. */
export function HudGlassPanel({
  accent = "var(--hud-sky)",
  delay = 0,
  active = false,
  lift = true,
  className = "",
  style,
  children,
  as: Tag = "section",
  ariaLabel,
}: PanelProps) {
  return (
    <Tag
      aria-label={ariaLabel}
      className={`hud-glass dh-enter ${lift ? "dh-lift" : ""} ${active ? "dh-active" : ""} ${className}`}
      style={{ ["--hud-accent" as any]: accent, animationDelay: `${delay}ms`, ...style }}
    >
      {children}
    </Tag>
  );
}

/** Lightweight animated sparkline (SVG, no chart lib). */
export function Sparkline({
  data,
  color = "var(--hud-mint)",
  width = 120,
  height = 34,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (!data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = width / Math.max(1, data.length - 1);
  const pts = data.map((d, i) => [i * step, height - ((d - min) / span) * (height - 4) - 2] as const);
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const gid = `sg-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg className="dh-spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} stroke="none" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
