import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";

/**
 * Astra AI — living background (canvas).
 * Clinical command deck: volumetric light shafts, drifting golden/cyan
 * particles, a rotating sacred-geometry mandala, and a crystalline AI brain
 * that pulses like a heartbeat with expanding wave rings.
 * Reacts to the global brainState (idle / thinking / speaking), animation
 * intensity, and cursor movement (golden ripple rings + particle repulsion).
 *
 * There is deliberately NO decorative animal artwork here. The Doctor Command
 * Centre is a hospital intelligence system, not an aquarium.
 */

interface Particle {
  x: number; y: number; r: number; vy: number; sway: number; ph: number; gold: boolean; bubble: boolean;
}
interface Ring { r: number; a: number; }
interface Ripple { x: number; y: number; r: number; a: number; }

const STATE_CFG = {
  idle: { pulse: 1700, glow: 0.5 },
  thinking: { pulse: 520, glow: 0.95 },
  speaking: { pulse: 900, glow: 0.7 },
} as const;

const INTENSITY_CFG = {
  calm: { mul: 0.65, particles: 55, alpha: 0.7 },
  normal: { mul: 1, particles: 110, alpha: 1 },
  epic: { mul: 1.55, particles: 185, alpha: 1.25 },
} as const;

/** lub-dub heartbeat waveform, 0..1 per period */
function heartbeat(t: number, period: number): number {
  const p = (t % period) / period;
  const lub = Math.exp(-Math.pow((p - 0.08) * 14, 2));
  const dub = 0.55 * Math.exp(-Math.pow((p - 0.3) * 14, 2));
  return lub + dub;
}

export function AstraBackground() {
  const ref = useRef<HTMLCanvasElement>(null);
  const { brainState, appearance } = useStore();
  const stateRef = useRef(brainState);
  stateRef.current = brainState;
  const appRef = useRef(appearance);
  appRef.current = appearance;
  const mouse = useRef({ x: -9999, y: -9999, lastRipple: 0 });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);

    let particles: Particle[] = [];
    const seedParticles = (n: number) => {
      particles = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.8 + 0.4,
        vy: -(0.15 + Math.random() * 0.35),
        sway: 0.2 + Math.random() * 0.5,
        ph: Math.random() * Math.PI * 2,
        gold: Math.random() > 0.25,
        bubble: Math.random() > 0.8,
      }));
    };
    seedParticles(INTENSITY_CFG[appRef.current.intensity].particles);

    const rings: Ring[] = [];
    const ripples: Ripple[] = [];

    // deterministic crystalline brain outline
    const brainPts = Array.from({ length: 11 }, (_, i) => {
      const a = (i / 11) * Math.PI * 2;
      const r = 34 + ((i * 37) % 13);
      return { a, r };
    });

    let lastBeat = 0;
    let raf = 0;

    const draw = (t: number) => {
      const st = STATE_CFG[stateRef.current];
      const ic = INTENSITY_CFG[appRef.current.intensity];
      const cx = w * 0.56;
      const cy = h * 0.52;
      const beat = heartbeat(t, st.pulse / ic.mul);

      ctx.clearRect(0, 0, w, h);

      /* ---- command-deck vignette ---- */
      const deck = ctx.createLinearGradient(0, 0, 0, h);
      deck.addColorStop(0, "rgba(5,10,18,0.0)");
      deck.addColorStop(1, "rgba(6,18,30,0.35)");
      ctx.fillStyle = deck;
      ctx.fillRect(0, 0, w, h);

      /* ---- volumetric light shafts ---- */
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 6; i++) {
        const sway = Math.sin(t / 5200 + i * 1.7) * 0.06;
        const baseA = -Math.PI / 2 + (i - 2.5) * 0.22 + sway;
        const gx = cx + Math.cos(baseA) * -h;
        const spread = 90 + i * 24;
        const grad = ctx.createLinearGradient(gx, -40, cx, cy);
        grad.addColorStop(0, `rgba(245,217,126,${0.05 * ic.alpha})`);
        grad.addColorStop(1, "rgba(245,217,126,0)");
        ctx.beginPath();
        ctx.moveTo(gx - spread * 0.3, -40);
        ctx.lineTo(gx + spread * 0.3, -40);
        ctx.lineTo(cx + spread, cy + h * 0.3);
        ctx.lineTo(cx - spread, cy + h * 0.3);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
      }
      ctx.restore();

      /* ---- mandala / sacred geometry ---- */
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t / 42000);
      ctx.strokeStyle = `rgba(212,175,55,${0.14 * ic.alpha})`;
      ctx.lineWidth = 1;
      [110, 165, 260].forEach((r, ri) => {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
        const spokes = 12 + ri * 6;
        for (let i = 0; i < spokes; i++) {
          const a = (i / spokes) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * (r - 8), Math.sin(a) * (r - 8));
          ctx.lineTo(Math.cos(a) * (r + 8), Math.sin(a) * (r + 8));
          ctx.stroke();
        }
      });
      // petal arcs
      ctx.strokeStyle = `rgba(57,213,255,${0.08 * ic.alpha})`;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 130, Math.sin(a) * 130, 42, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      /* ---- brain glow ---- */
      const pulseScale = 1 + beat * 0.14;
      const glowR = 120 * pulseScale;
      const glow = ctx.createRadialGradient(cx, cy, 8, cx, cy, glowR);
      glow.addColorStop(0, `rgba(57,213,255,${0.28 * st.glow})`);
      glow.addColorStop(0.45, `rgba(212,175,55,${0.16 * st.glow})`);
      glow.addColorStop(1, "rgba(212,175,55,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
      ctx.fill();

      /* ---- crystalline brain ---- */
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(pulseScale, pulseScale);
      ctx.beginPath();
      brainPts.forEach((p, i) => {
        const px = Math.cos(p.a) * p.r;
        const py = Math.sin(p.a) * p.r * 0.86;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      const brainGrad = ctx.createRadialGradient(-8, -10, 4, 0, 0, 46);
      brainGrad.addColorStop(0, "rgba(57,213,255,0.34)");
      brainGrad.addColorStop(0.6, "rgba(18,52,60,0.85)");
      brainGrad.addColorStop(1, "rgba(11,29,32,0.9)");
      ctx.fillStyle = brainGrad;
      ctx.fill();
      ctx.strokeStyle = "rgba(245,217,126,0.85)";
      ctx.lineWidth = 1.4;
      ctx.shadowBlur = 18;
      ctx.shadowColor = "rgba(212,175,55,0.7)";
      ctx.stroke();
      ctx.shadowBlur = 0;
      // cyan neural pathways
      ctx.strokeStyle = `rgba(57,213,255,${0.5 + beat * 0.5})`;
      ctx.lineWidth = 1;
      brainPts.forEach((p, i) => {
        if (i % 2) return;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(p.a) * p.r * 0.8, Math.sin(p.a) * p.r * 0.69);
        ctx.stroke();
      });
      ctx.restore();

      /* ---- heartbeat wave rings ---- */
      if (beat > 0.85 && t - lastBeat > st.pulse / ic.mul * 0.7) {
        lastBeat = t;
        rings.push({ r: 46, a: 0.5 * st.glow });
        if (stateRef.current === "thinking") rings.push({ r: 30, a: 0.4 });
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const rg = rings[i];
        rg.r += 2.4 * ic.mul;
        rg.a *= 0.965;
        if (rg.a < 0.01) { rings.splice(i, 1); continue; }
        ctx.beginPath();
        ctx.arc(cx, cy, rg.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(212,175,55,${rg.a})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      /* ---- particles + bubbles + cursor repulsion ---- */
      if (appRef.current.particles) {
        const target = ic.particles;
        if (particles.length !== target) seedParticles(target);
        for (const p of particles) {
          p.ph += 0.02;
          p.y += p.vy * ic.mul * (p.bubble ? 2.2 : 1);
          p.x += Math.sin(p.ph) * p.sway * 0.3;
          // cursor repulsion
          const dx = p.x - mouse.current.x;
          const dy = p.y - mouse.current.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 120 * 120 && d2 > 1) {
            const d = Math.sqrt(d2);
            p.x += (dx / d) * 1.6;
            p.y += (dy / d) * 1.6;
          }
          if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * (p.bubble ? 1.6 : 1), 0, Math.PI * 2);
          if (p.bubble) {
            ctx.strokeStyle = `rgba(57,213,255,${0.25 * ic.alpha})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          } else {
            ctx.fillStyle = p.gold
              ? `rgba(245,217,126,${0.5 * ic.alpha})`
              : `rgba(57,213,255,${0.35 * ic.alpha})`;
            ctx.shadowBlur = 6;
            ctx.shadowColor = p.gold ? "rgba(212,175,55,0.8)" : "rgba(57,213,255,0.8)";
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }
      }

      /* ---- cursor ripples ---- */
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        rp.r += 3.2;
        rp.a *= 0.94;
        if (rp.a < 0.015) { ripples.splice(i, 1); continue; }
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(245,217,126,${rp.a})`;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    const onMove = (e: MouseEvent) => {
      mouse.current.x = e.clientX;
      mouse.current.y = e.clientY;
      if (appRef.current.ripples && e.timeStamp - mouse.current.lastRipple > 110) {
        mouse.current.lastRipple = e.timeStamp;
        ripples.push({ x: e.clientX, y: e.clientY, r: 4, a: 0.5 });
      }
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onMove);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMove);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className="fixed inset-0 -z-20 pointer-events-none"
      style={{ background: "radial-gradient(ellipse at 55% 40%, #0a1420 0%, #060c16 45%, #02040a 100%)" }}
    />
  );
}
