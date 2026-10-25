import { useEffect, useRef } from "react";

/** Animated starfield / particle canvas backdrop with neon glow washes. */
export function Starfield() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = (canvas.width = window.innerWidth);
    let h = (canvas.height = window.innerHeight);
    const stars = Array.from({ length: 140 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.4 + 0.3,
      vx: (Math.random() - 0.5) * 0.12,
      vy: (Math.random() - 0.5) * 0.12,
      tw: Math.random() * Math.PI * 2,
      hue: [190, 262, 305][Math.floor(Math.random() * 3)],
    }));

    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      // grid
      ctx.strokeStyle = "rgba(139,92,246,0.05)";
      ctx.lineWidth = 1;
      const gs = 64;
      for (let x = 0; x < w; x += gs) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += gs) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      // stars
      for (const s of stars) {
        s.x += s.vx;
        s.y += s.vy;
        s.tw += 0.02;
        if (s.x < 0) s.x = w;
        if (s.x > w) s.x = 0;
        if (s.y < 0) s.y = h;
        if (s.y > h) s.y = 0;
        const a = 0.35 + Math.sin(s.tw) * 0.3;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${s.hue}, 90%, 70%, ${a})`;
        ctx.shadowBlur = 6;
        ctx.shadowColor = `hsla(${s.hue}, 90%, 65%, 0.8)`;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      raf = requestAnimationFrame(draw);
    };
    draw();

    const onResize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <>
      <canvas ref={ref} className="fixed inset-0 -z-20 pointer-events-none" />
      {/* neon glow washes */}
      <div className="fixed -z-10 pointer-events-none inset-0 overflow-hidden">
        <div
          className="absolute -top-40 -left-40 w-[560px] h-[560px] rounded-full opacity-25 animate-float"
          style={{ background: "radial-gradient(circle, rgba(34,211,238,0.35), transparent 65%)" }}
        />
        <div
          className="absolute top-1/3 -right-52 w-[640px] h-[640px] rounded-full opacity-25"
          style={{ background: "radial-gradient(circle, rgba(139,92,246,0.4), transparent 65%)" }}
        />
        <div
          className="absolute -bottom-52 left-1/4 w-[520px] h-[520px] rounded-full opacity-20 animate-float"
          style={{ background: "radial-gradient(circle, rgba(232,121,249,0.35), transparent 65%)", animationDelay: "2s" }}
        />
      </div>
    </>
  );
}
