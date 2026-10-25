import { hudTokensCss, HUD_PALETTE } from "@/components/CommandCenter/hudTokens";

/**
 * Scoped CSS for the Doctor Command OS HUD. Everything lives under the
 * `.doctor-hud` wrapper so the heavy glass/neon look never leaks into the rest
 * of the app. Re-exports the shared token CSS so the doctor HUD and the
 * Command Centre both pull palette + glass from ONE place.
 */
export const doctorHudCss = hudTokensCss + `
.doctor-hud {
  --dh-grid: rgba(124,200,255,0.07);
  position: relative;
  min-height: 100%;
  color: #e8eefc;
  background:
    radial-gradient(circle at 18% 8%, rgba(108,99,255,0.20), transparent 42%),
    radial-gradient(circle at 82% 12%, rgba(94,242,194,0.14), transparent 40%),
    radial-gradient(circle at 50% 100%, rgba(255,122,107,0.12), transparent 45%),
    var(--hud-midnight);
}

/* Slow parallax star/grid backdrop (pure CSS, near-zero CPU). */
.dh-bg { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 0; }
.dh-bg-grid {
  position: absolute; inset: -20%;
  background-image:
    linear-gradient(var(--dh-grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--dh-grid) 1px, transparent 1px);
  background-size: 46px 46px;
  animation: dh-drift 44s linear infinite;
  mask-image: radial-gradient(circle at 50% 40%, #000 40%, transparent 82%);
}
.dh-bg-stars { position: absolute; inset: 0; animation: dh-twinkle 9s ease-in-out infinite; }
.dh-bg-stars span {
  position: absolute; width: 2px; height: 2px; border-radius: 9999px;
  background: ${HUD_PALETTE.sky}; opacity: 0.5;
  box-shadow: 0 0 6px 1px rgba(124,200,255,0.5);
}
@keyframes dh-drift { from { transform: translate3d(0,0,0); } to { transform: translate3d(46px,46px,0); } }
@keyframes dh-twinkle { 0%,100% { opacity: 0.55; } 50% { opacity: 0.9; } }

/* Staggered fade + rise on load (~60ms apart via inline animation-delay). */
.dh-enter { animation: dh-in 0.5s cubic-bezier(0.2,0.8,0.2,1) both; }
@keyframes dh-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }

/* Hover lift. */
.dh-lift { transition: transform 0.28s ease, box-shadow 0.28s ease; }
.dh-lift:hover { transform: translateY(-3px); }

/* Animated gradient border on the active panel. */
.dh-active { position: relative; }
.dh-active::after {
  content: ""; position: absolute; inset: -1px; border-radius: inherit; padding: 1px;
  background: var(--hud-grad-iris-sky); background-size: 300% 300%;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude;
  animation: dh-border 6s ease infinite; pointer-events: none;
}
@keyframes dh-border { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }

/* Neon chips + buttons. */
.dh-chip {
  border: 1px solid var(--hud-glass-border); background: rgba(255,255,255,0.05);
  border-radius: 999px; transition: all 0.22s ease; color: #dbe6ff;
}
.dh-chip:hover { border-color: color-mix(in srgb, var(--hud-accent) 60%, transparent); box-shadow: 0 0 18px -4px var(--hud-accent); color: #fff; }
.dh-chip[aria-pressed="true"], .dh-chip.is-active {
  background: color-mix(in srgb, var(--hud-accent) 22%, transparent);
  border-color: var(--hud-accent); color: #fff; box-shadow: 0 0 20px -4px var(--hud-accent);
}
.dh-btn {
  display: inline-flex; align-items: center; gap: 0.45rem; border-radius: 12px;
  border: 1px solid var(--hud-glass-border); background: rgba(255,255,255,0.06);
  color: #eaf1ff; font-weight: 700; transition: all 0.22s ease;
}
.dh-btn:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--hud-accent) 60%, transparent); box-shadow: 0 0 20px -6px var(--hud-accent); }

/* Visible, high-contrast focus rings for keyboard nav. */
.doctor-hud :where(button, a, input, textarea, [tabindex]):focus-visible {
  outline: 2px solid ${HUD_PALETTE.neon}; outline-offset: 2px; border-radius: 8px;
}

/* Neon orb (Dr. Mayin launcher) glow. */
.dh-orb { box-shadow: 0 0 26px 2px rgba(57,255,136,0.45), 0 0 60px 8px rgba(57,255,136,0.18); transition: box-shadow 0.3s ease, transform 0.3s ease; }
.dh-orb:hover { transform: translateY(-2px) scale(1.03); box-shadow: 0 0 34px 4px rgba(57,255,136,0.6), 0 0 80px 14px rgba(57,255,136,0.26); }

/* Sparkline draw-in. */
.dh-spark path { stroke-dasharray: 240; stroke-dashoffset: 240; animation: dh-draw 1.1s ease forwards; }
@keyframes dh-draw { to { stroke-dashoffset: 0; } }

/* Performance mode: drop blur, particles and heavy animation. */
.doctor-hud.perf .dh-bg { display: none; }
.doctor-hud.perf .dh-enter,
.doctor-hud.perf .dh-active::after,
.doctor-hud.perf .dh-spark path { animation: none !important; }
.doctor-hud.perf .dh-spark path { stroke-dashoffset: 0; }
.doctor-hud.perf .dh-lift:hover { transform: none; }

/* Respect reduced-motion: no animation, no parallax, no draw-in. */
@media (prefers-reduced-motion: reduce) {
  .doctor-hud .dh-enter,
  .doctor-hud .dh-bg-grid,
  .doctor-hud .dh-bg-stars,
  .doctor-hud .dh-active::after,
  .doctor-hud .dh-spark path { animation: none !important; }
  .doctor-hud .dh-spark path { stroke-dashoffset: 0; }
  .doctor-hud .dh-lift:hover { transform: none; }
}

.doctor-hud .no-scrollbar::-webkit-scrollbar { display: none; }
.doctor-hud .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

/* Clinical white theme — Doctor Command OS only. Does not touch other dashboards. */
.doctor-hud {
  min-height: 100%;
  overflow: visible;
  color: #000000;
  font-weight: 600;
  text-shadow: 0 1px 0 rgba(255,255,255,0.92), 0 1px 1px rgba(0,0,0,0.32);
  background: #ffffff;
  --dh-grid: transparent;
  --hud-glass-fill: #ffffff;
  --hud-glass-border: #111111;
  --hud-glass-highlight: transparent;
  --hud-blur: none;
  --hud-midnight: #ffffff;
  --hud-accent: #111111;
}
.doctor-hud .dh-bg { display: none; }
.doctor-hud .hud-glass {
  background: #ffffff;
  color: #000000;
  border: 1px solid #111111;
  border-radius: 12px;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: 0 8px 18px rgba(0,0,0,0.12);
}
.doctor-hud .hud-glass:hover,
.doctor-hud .hud-glass:focus-within {
  border-color: #000000;
  box-shadow: 0 10px 22px rgba(0,0,0,0.16);
}
.doctor-hud .dh-active::after { display: none; }
.doctor-hud .dh-chip,
.doctor-hud .dh-btn {
  background: #ffffff;
  color: #000000;
  border: 1px solid #111111;
  box-shadow: 0 4px 10px rgba(0,0,0,0.08);
}
.doctor-hud .dh-chip:hover,
.doctor-hud .dh-btn:hover,
.doctor-hud .dh-chip.is-active,
.doctor-hud .dh-chip[aria-pressed="true"] {
  background: #ffffff;
  color: #000000;
  border-color: #000000;
  box-shadow: 0 8px 18px rgba(0,0,0,0.16);
}
.doctor-hud .dh-anatomy-fit {
  width: 100%;
  min-height: 420px;
  height: min(68vh, 720px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.doctor-hud .dh-anatomy-fit > * {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  height: 100%;
}
.doctor-hud .dh-anatomy-canvas {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid #111111;
  background: #ffffff;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.6), 0 8px 18px rgba(0,0,0,0.12);
}
.doctor-hud .dh-anatomy-canvas canvas {
  width: 100% !important;
  height: 100% !important;
  display: block;
}
.doctor-hud [class~="text-white"],
.doctor-hud [class*="text-white/"] { color: #000000 !important; font-weight: 600; }
.doctor-hud [class*="text-amber-"] { color: #92400e !important; }
.doctor-hud [class*="text-sky-"] { color: #1e3a8a !important; }
.doctor-hud [class*="text-rose-"] { color: #9f1239 !important; }
.doctor-hud [class*="border-white"] {
  border-color: #000000 !important;
  background-color: #ffffff;
  box-shadow: 0 8px 18px rgba(0,0,0,0.12);
}
.doctor-hud [class*="bg-black/"] { background-color: #ffffff !important; }
.doctor-hud [data-testid="critical-alert-banner"] [class~="text-white"] { color: #ffffff !important; }
.doctor-hud [data-testid="critical-alert-banner"] [class*="text-rose-"] { color: #ffe4e6 !important; }
.doctor-hud [data-testid="critical-alert-banner"] [class*="bg-rose-"] { background-color: #9f1239 !important; }
.doctor-hud .dh-chip,
.doctor-hud .dh-btn,
.doctor-hud .hud-glass { font-weight: 600; }
.doctor-hud .dh-anatomy-canvas,
.doctor-hud canvas,
.doctor-hud [data-testid="critical-alert-banner"] { text-shadow: none; }

.dh-shell { display: flex; flex-direction: column; gap: 8px; color: #111; }
.dh-top { display: flex; align-items: center; gap: 10px; background: #fff; border: 1px solid #111; border-radius: 12px; padding: 6px 10px; }
.dh-brand { font-size: 1.35rem; font-weight: 800; letter-spacing: -0.03em; color: #111; }
.dh-top-meta { margin-left: auto; display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; color: #111; }
.dh-menu { position: relative; }
.dh-menu-pop { position: absolute; right: 0; top: calc(100% + 4px); z-index: 40; min-width: 220px; max-width: min(520px, 80vw); background: #fff; border: 1px solid #111; border-radius: 10px; padding: 8px; box-shadow: 0 8px 18px rgba(0,0,0,0.12); }
.dh-menu-pop button { display: block; width: 100%; text-align: left; }
.dh-body { display: flex; align-items: flex-start; gap: 8px; }
.dh-rail { width: 6.5rem; flex: 0 0 6.5rem; display: flex; flex-direction: column; gap: 6px; }
.dh-left { width: 7rem; flex: 0 0 7rem; display: flex; flex-direction: column; gap: 6px; }
.dh-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.dh-search-col { width: 17.5rem; flex: 0 0 17.5rem; display: flex; flex-direction: column; gap: 8px; }
.dh-nav-btn, .dh-rail .dh-btn { width: 100%; justify-content: center; text-align: center; font-size: 11px; line-height: 1.2; padding: 8px 4px; white-space: normal; }
.dh-note { font-size: 11px; line-height: 1.35; color: #111; background: #fff; border: 1px solid #111; border-radius: 8px; padding: 6px 8px; }
.dh-attend-row { display: flex; gap: 8px; align-items: flex-start; }
.dh-attend-row > * { flex: 1 1 0; min-width: 0; }
.dh-chip-row { display: flex; flex-wrap: wrap; gap: 6px; }
.dh-anatomy-overlay { position: fixed; inset: 10px; z-index: 70; background: #fff; border: 1px solid #111; border-radius: 12px; padding: 8px; overflow: auto; }
.dh-anatomy-overlay .dh-anatomy-fit { min-height: calc(100vh - 92px); height: calc(100vh - 92px); }
.dh-copilot-wrap.is-hidden { display: none; }
.dh-think-light .dh-think-mark { opacity: 0.4; }
.dh-think-medium .dh-think-mark { opacity: 0.75; }
.dh-think-high .dh-think-mark { opacity: 1; box-shadow: inset 0 0 0 1px #111; }
.dh-search-block { background: #fff; border: 1px solid #111; border-radius: 12px; padding: 8px; }
@media (max-width: 1100px) {
  .dh-body { flex-wrap: wrap; }
  .dh-search-col, .dh-main { width: 100%; flex-basis: 100%; }
}

.dh-icon-rail { width: 2.75rem; flex: 0 0 2.75rem; display: flex; flex-direction: column; gap: 6px; align-items: center; }
.dh-icon-rail .dh-btn { width: 36px; height: 36px; padding: 0; justify-content: center; }
.dh-sidebar { width: 16rem; flex: 0 0 16rem; max-height: calc(100vh - 88px); overflow: auto; display: flex; flex-direction: column; gap: 6px; background: #fff; border: 1px solid #111; border-radius: 12px; padding: 8px; }
.dh-side-row { width: 100%; justify-content: flex-start; text-align: left; font-size: 12px; padding: 6px 8px; }
.dh-composer-slot { width: min(760px, 100%); margin: 12px auto 0; }
.dh-composer { display: flex; align-items: flex-end; gap: 8px; }
.dh-composer-box { flex: 1 1 auto; min-width: 0; }
.dh-composer-side { display: flex; flex-direction: column; gap: 4px; align-items: stretch; }
.dh-plus { position: relative; }
.dh-plus-menu { position: absolute; bottom: 44px; left: 0; z-index: 30; width: 240px; background: #fff; border: 1px solid #111; border-radius: 12px; padding: 6px; box-shadow: 0 8px 18px rgba(0,0,0,0.12); }
.dh-plus-menu button { width: 100%; text-align: left; margin-bottom: 4px; }

.doctor-hud .dh-sidebar { background: #171717; color: #f4f4f5; border: 1px solid #111; width: 17.5rem; flex-basis: 17.5rem; }
.doctor-hud .dh-sidebar .dh-btn,
.doctor-hud .dh-sidebar .dh-note,
.doctor-hud .dh-sidebar summary { color: #f4f4f5 !important; background: transparent; border-color: #3f3f46; }
.doctor-hud .dh-sidebar .dh-btn.is-active { border-color: #f4f4f5; }
.dh-side-filter { width: 100%; border: 1px solid #3f3f46; background: #111; color: #f4f4f5; border-radius: 8px; padding: 6px 8px; font-size: 12px; }
.dh-side-scroll { display: flex; flex-direction: column; gap: 8px; }
.dh-group { border-top: 1px solid #3f3f46; padding-top: 6px; }
.dh-group summary { cursor: pointer; font-size: 12px; font-weight: 700; }
.dh-greet { font-size: 14px; font-weight: 600; color: #111; margin: 4px 0 8px; }
.dh-account { border: 1px solid #111; border-radius: 999px; padding: 2px 8px; font-size: 12px; font-weight: 700; }

.doctor-hud {
  background: #0e0e0e !important;
  color: #f5f5f5 !important;
  text-shadow: none !important;
}
.doctor-hud .hud-glass,
.doctor-hud .dh-note,
.doctor-hud .dh-fold,
.doctor-hud .dh-search-block {
  background: #1c1c1c !important;
  color: #f5f5f5 !important;
  border-color: #8a8a8a !important;
}
.doctor-hud .dh-chip,
.doctor-hud .dh-btn,
.doctor-hud .dh-top,
.doctor-hud .dh-account {
  background: #242424 !important;
  color: #f5f5f5 !important;
  border: 1px solid #8a8a8a !important;
}
.doctor-hud .dh-chip.is-active,
.doctor-hud .dh-chip[aria-pressed="true"],
.doctor-hud .dh-btn.is-active {
  background: #f5f5f5 !important;
  color: #111111 !important;
}
.doctor-hud [class~="text-white"],
.doctor-hud [class*="text-white/"] { color: #f5f5f5 !important; }
.doctor-hud [class*="text-amber-"] { color: #fcd34d !important; }
.doctor-hud [class*="text-sky-"] { color: #bfdbfe !important; }
.doctor-hud [class*="text-rose-"] { color: #fecdd3 !important; }
.doctor-hud .dh-sidebar { background: #141414 !important; }
.doctor-hud .dh-sidebar .dh-btn,
.doctor-hud .dh-sidebar .dh-note,
.doctor-hud .dh-sidebar summary { color: #f5f5f5 !important; }
.dh-fold { border: 1px solid #8a8a8a; border-radius: 10px; padding: 6px 8px; }
.dh-fold summary { cursor: pointer; font-weight: 700; color: #f5f5f5; }
.dh-beside { display: flex; flex-wrap: wrap; gap: 8px; align-items: flex-start; width: 100%; }
.dh-beside > * { flex: 1 1 220px; min-width: 0; }
@media (max-width: 800px) {
  .dh-body { flex-direction: column; }
  .dh-sidebar { width: 100% !important; flex-basis: auto !important; max-height: none; }
  .dh-beside > * { flex-basis: 100%; }
}

.doctor-hud { font-weight: 700; }
.doctor-hud .hud-glass,
.doctor-hud .dh-sidebar,
.doctor-hud .dh-chatbox,
.doctor-hud .dh-fold {
  border-width: 2px;
  box-shadow: 0 14px 28px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08);
}
.dh-thread { flex: 1 1 auto; min-height: 52vh; overflow: auto; }
.dh-chatbox {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  width: 100%;
  background: #1c1c1c;
  border: 2px solid #8a8a8a;
  border-radius: 18px;
  padding: 8px;
}
.doctor-hud .dh-corner { background: #242424; color: #f5f5f5; border: 2px solid #8a8a8a; 
  flex: 0 0 auto;
  min-width: 44px;
  min-height: 44px;
  border-radius: 12px;
  font-weight: 700;
}
@media (max-width: 800px) {
  .dh-chatbox { flex-wrap: wrap; }
  .dh-composer-box { flex: 1 1 100%; }
  .dh-thread { min-height: 40vh; }
}

.doctor-hud .dh-white-stack { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
.doctor-hud .dh-sidebar .dh-white-box {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  background: #f7f7f7 !important;
  color: #111111 !important;
  border: 2px solid #111111 !important;
  border-radius: 14px;
  padding: 10px 12px;
  font-weight: 700;
  letter-spacing: 0.01em;
  text-align: left;
  box-shadow: 0 10px 18px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.9);
}
.doctor-hud .dh-sidebar .dh-white-box .dh-white-sub { color: #111111 !important; font-weight: 700; font-size: 12px; }
.doctor-hud .dh-sidebar .dh-white-box.tint-voice { background: #f3f7ff !important; }
.doctor-hud .dh-sidebar .dh-white-box.tint-staff { background: #f4fff8 !important; }
.doctor-hud .dh-sidebar .dh-white-box.tint-wake { background: #fff8f1 !important; }
.doctor-hud .dh-sidebar .dh-white-box.tint-hand { background: #f7f4ff !important; }
.doctor-hud .dh-sidebar .dh-white-box[aria-pressed="true"] { outline: 3px solid #111111; }

.doctor-hud { background: #06111E !important; color: #F3F7FB !important; font-weight: 500 !important; overflow-x: hidden; }
.doctor-hud .dh-shell, .doctor-hud .dh-body, .doctor-hud .dh-main { max-width: 100%; min-width: 0; }
.doctor-hud .dh-brand { color: #F3F7FB !important; font-size: 1.65rem; font-weight: 700 !important; letter-spacing: -0.03em; }
.doctor-hud .dh-top { background: #081828 !important; color: #F3F7FB !important; border: 1px solid rgba(125,211,252,0.22) !important; border-radius: 16px; flex-wrap: wrap; gap: 8px; padding: 8px 12px; }
.doctor-hud .dh-account { background: transparent !important; color: #F3F7FB !important; border: none !important; display: inline-flex; align-items: center; gap: 6px; font-weight: 650; }
.dh-dot { width: 8px; height: 8px; border-radius: 99px; background: #3DDC97; box-shadow: 0 0 0 3px rgba(61,220,151,0.18); }
.dh-gold { width: fit-content; max-width: 34rem; background: #C6A15B; color: #1A1408; border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 700; line-height: 1.35; }
.dh-gate { font-size: 11px; font-weight: 650; color: #F3F7FB; opacity: 0.85; }
.dh-think-picks { display: inline-flex; gap: 4px; }
.dh-think-pick { background: transparent; color: #F3F7FB; border: 1px solid rgba(125,211,252,0.35); border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 650; transition: background 180ms ease, color 180ms ease; }
.dh-think-pick.is-active { background: #F3F7FB; color: #06111E; }
.doctor-hud .dh-sidebar { width: 290px !important; max-width: 310px; flex-basis: 290px !important; background: #081828 !important; color: #F3F7FB !important; border: 1px solid rgba(125,211,252,0.18) !important; border-radius: 16px; max-height: calc(100vh - 120px); transition: transform 200ms ease; }
.doctor-hud .dh-acc { width: 100%; text-align: left; background: transparent; color: #F3F7FB; border: none; font-weight: 700; font-size: 13px; padding: 8px 4px; cursor: pointer; }
.dh-acc-body { display: flex; flex-direction: column; gap: 4px; padding-bottom: 6px; }
.doctor-hud .dh-sidebar .dh-white-stack { margin-top: auto; }
.doctor-hud .dh-sidebar .dh-white-box,
.doctor-hud .dh-sidebar .dh-white-box.tint-voice,
.doctor-hud .dh-sidebar .dh-white-box.tint-staff,
.doctor-hud .dh-sidebar .dh-white-box.tint-wake,
.doctor-hud .dh-sidebar .dh-white-box.tint-hand {
  background: #0E2238 !important;
  color: #F3F7FB !important;
  border: 1px solid rgba(125,211,252,0.28) !important;
  font-weight: 700;
  transition: border-color 180ms ease, background 180ms ease;
}
.doctor-hud .dh-sidebar .dh-white-box .dh-white-sub { color: #D5E6F5 !important; font-weight: 650; }
.doctor-hud .dh-copilot-wrap .hud-glass { background: transparent !important; border: none !important; box-shadow: none !important; min-height: 0 !important; padding: 8px 4px !important; }
.dh-hello { max-width: 640px; background: #0C1E33; color: #F3F7FB; border: 1px solid rgba(125,211,252,0.28); border-radius: 18px; padding: 16px 18px; font-weight: 600; line-height: 1.45; box-shadow: 0 10px 24px rgba(0,0,0,0.28); }
.dh-thread { min-height: 42vh; }
.doctor-hud .dh-chatbox { background: #081828 !important; border: 1px solid rgba(125,211,252,0.32) !important; border-radius: 28px; box-shadow: 0 12px 28px rgba(0,0,0,0.28); }
.doctor-hud .dh-chatbox textarea { background: transparent !important; color: #F3F7FB !important; border: none !important; }
.doctor-hud .dh-plus-wrap { position: relative; flex: 0 0 auto; }
.doctor-hud .dh-plus-menu { background: #0E2238; color: #F3F7FB; border: 1px solid rgba(125,211,252,0.28); border-radius: 14px; }
.doctor-hud .dh-plus-menu button { color: #F3F7FB; background: transparent; font-weight: 650; }
.dh-drawer-btn { display: none; background: #0E2238; color: #F3F7FB; border: 1px solid rgba(125,211,252,0.35); border-radius: 10px; padding: 4px 8px; font-weight: 700; }
@media (max-width: 767px) {
  .dh-drawer-btn { display: inline-flex; }
  .doctor-hud .dh-sidebar { position: fixed; z-index: 40; left: 8px; top: 8px; bottom: 8px; transform: translateX(-120%); width: min(290px, 86vw) !important; }
  .doctor-hud .dh-sidebar.is-drawer-open { transform: translateX(0); }
  .dh-thread { min-height: 36vh; }
}
@media (max-width: 1366px) {
  .doctor-hud, .dh-shell { overflow-x: hidden; }
}

.doctor-hud .dh-body { align-items: stretch; min-height: calc(100vh - 148px); }
.doctor-hud .dh-main { min-height: calc(100vh - 168px); }
.doctor-hud .dh-copilot-wrap { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.doctor-hud .dh-composer-slot {
  width: 100%;
  max-width: none;
  margin: 0;
  margin-top: auto;
  position: sticky;
  bottom: 0;
  z-index: 25;
  background: #06111E;
  padding: 8px 0 4px;
}
.doctor-hud .dh-chatbox { width: 100%; }

.doctor-hud {
  background: linear-gradient(180deg, #040B14 0%, #07111E 100%) !important;
  color: #F3F7FB !important;
  text-shadow: none !important;
  font-weight: 600 !important;
}
.doctor-hud .dh-bg-stars span { background: #A8B6C7; opacity: 0.28; box-shadow: none; }
.doctor-hud .dh-bg-grid { opacity: 0.2; }
.doctor-hud .dh-btn:hover,
.doctor-hud .dh-chip:hover,
.doctor-hud .dh-lift:hover { box-shadow: 0 8px 18px rgba(0,0,0,0.28) !important; }
.doctor-hud .hud-glass,
.doctor-hud .dh-note,
.doctor-hud .dh-fold,
.doctor-hud .dh-hello,
.doctor-hud .dh-top,
.doctor-hud .dh-menu-pop,
.doctor-hud .dh-corner,
.doctor-hud .dh-plus-menu,
.doctor-hud .dh-search-block,
.doctor-hud .dh-sidebar .dh-white-box,
.doctor-hud .dh-sidebar .dh-white-box.tint-voice,
.doctor-hud .dh-sidebar .dh-white-box.tint-staff,
.doctor-hud .dh-sidebar .dh-white-box.tint-wake,
.doctor-hud .dh-sidebar .dh-white-box.tint-hand {
  background: #0D1D2D !important;
  color: #F3F7FB !important;
  border-color: rgba(243, 247, 251, 0.16) !important;
  box-shadow: 0 10px 22px rgba(0,0,0,0.32), inset 0 1px 0 rgba(243,247,251,0.08) !important;
}
.doctor-hud .dh-sidebar {
  background: #0B1826 !important;
  color: #F3F7FB !important;
  border-color: rgba(243, 247, 251, 0.12) !important;
  box-shadow: 0 12px 28px rgba(0,0,0,0.35), inset 0 1px 0 rgba(243,247,251,0.06) !important;
}
.doctor-hud .dh-sidebar .dh-btn,
.doctor-hud .dh-sidebar .dh-note,
.doctor-hud .dh-sidebar summary,
.doctor-hud .dh-acc,
.doctor-hud .dh-brand,
.doctor-hud .dh-gate { color: #F3F7FB !important; }
.doctor-hud .dh-brand,
.doctor-hud .dh-acc,
.doctor-hud .dh-gold,
.doctor-hud .dh-btn,
.doctor-hud .dh-think-pick { font-weight: 700 !important; }
.doctor-hud .dh-note,
.doctor-hud .dh-sidebar .dh-white-box .dh-white-sub,
.doctor-hud .dh-chatbox textarea::placeholder { color: #A8B6C7 !important; }
.doctor-hud .dh-side-filter {
  background: #0D1D2D;
  color: #F3F7FB;
  border-color: rgba(243, 247, 251, 0.16);
}
.doctor-hud .dh-btn,
.doctor-hud .dh-chip,
.doctor-hud .dh-think-pick,
.doctor-hud .dh-account {
  background: #0D1D2D !important;
  color: #F3F7FB !important;
  border-color: rgba(243, 247, 251, 0.16) !important;
  box-shadow: none !important;
}
.doctor-hud .dh-btn.is-active,
.doctor-hud .dh-chip.is-active,
.doctor-hud .dh-chip[aria-pressed="true"],
.doctor-hud .dh-think-pick.is-active,
.doctor-hud .dh-sidebar .dh-btn.is-active,
.doctor-hud .dh-sidebar .dh-white-box[aria-pressed="true"] {
  background: #0D1D2D !important;
  color: #F3F7FB !important;
  border-color: #2F8F86 !important;
  outline-color: #2F8F86;
  box-shadow: none !important;
}
.doctor-hud .dh-gold {
  background: #C6A15B !important;
  color: #1A1408 !important;
  border-color: transparent !important;
  box-shadow: none !important;
}
.doctor-hud .dh-chatbox {
  background: #0D1D2D !important;
  border-color: rgba(40, 160, 255, 0.55) !important;
  box-shadow: 0 10px 22px rgba(0,0,0,0.32), inset 0 1px 0 rgba(243,247,251,0.08) !important;
}
.doctor-hud .dh-chatbox textarea { color: #F3F7FB !important; background: transparent !important; font-weight: 600; }
.doctor-hud .dh-composer-slot { background: #040B14; }
.doctor-hud .dh-dot { background: #2F8F86; box-shadow: none; }

/* Doctor Command OS gray look. Presentation only. */
.doctor-hud {
  background: #1E1E1E !important;
  color: #FFFFFF !important;
  font-family: "Noto Sans Telugu", "Segoe UI", sans-serif !important;
  text-shadow: none !important;
  font-weight: 500 !important;
}
.doctor-hud .dh-bg { display: none !important; }
.doctor-hud .dh-shell,
.doctor-hud .dh-main,
.doctor-hud .dh-top,
.doctor-hud .dh-composer-slot {
  background: #1E1E1E !important;
  color: #FFFFFF !important;
  box-shadow: none !important;
}
.doctor-hud .dh-top {
  border: 1px solid #2A2A2A !important;
}
.doctor-hud .dh-brand,
.doctor-hud .dh-acc,
.doctor-hud .dh-btn,
.doctor-hud .dh-bi-en {
  color: #FFFFFF !important;
}
.doctor-hud .dh-top-meta,
.doctor-hud .dh-gate,
.doctor-hud .dh-white-sub,
.doctor-hud .dh-bi-te {
  color: #CCCCCC !important;
}
.doctor-hud .dh-note {
  color: #B0B0B0 !important;
  background: #2A2A2A !important;
  border-color: #3A3A3A !important;
  box-shadow: none !important;
  font-weight: 500 !important;
}
.doctor-hud .dh-sidebar {
  width: 240px !important;
  flex: 0 0 240px !important;
  max-width: 240px !important;
  background: #1E1E1E !important;
  color: #FFFFFF !important;
  border: 1px solid #2A2A2A !important;
  box-shadow: none !important;
  overflow: hidden !important;
  transition: width 200ms ease, flex-basis 200ms ease, max-width 200ms ease, opacity 200ms ease, padding 200ms ease !important;
}
.doctor-hud .dh-sidebar.is-collapsed {
  width: 0 !important;
  flex-basis: 0 !important;
  max-width: 0 !important;
  min-width: 0 !important;
  padding: 0 !important;
  border-width: 0 !important;
  opacity: 0;
  overflow: hidden !important;
}
.doctor-hud .dh-sidebar .dh-btn,
.doctor-hud .dh-sidebar .dh-acc,
.doctor-hud .dh-sidebar .dh-white-box,
.doctor-hud .dh-sidebar summary,
.doctor-hud .dh-sidebar .dh-note {
  font-size: 13px !important;
  font-family: "Noto Sans Telugu", "Segoe UI", sans-serif !important;
}
.doctor-hud .dh-sidebar .dh-btn,
.doctor-hud .dh-sidebar .dh-acc,
.doctor-hud .dh-sidebar summary {
  color: #FFFFFF !important;
  background: #1E1E1E !important;
  border-color: transparent !important;
  box-shadow: none !important;
}
.doctor-hud .dh-bi { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; line-height: 1.25; text-align: left; }
.doctor-hud .dh-bi-en { font-size: 13px; font-weight: 650; }
.doctor-hud .dh-bi-te { font-size: 12px; font-weight: 500; }
.doctor-hud .dh-acc-body,
.doctor-hud .dh-fold,
.doctor-hud .dh-sidebar .dh-white-box,
.doctor-hud .dh-sidebar .dh-white-box.tint-voice,
.doctor-hud .dh-sidebar .dh-white-box.tint-staff,
.doctor-hud .dh-sidebar .dh-white-box.tint-wake,
.doctor-hud .dh-sidebar .dh-white-box.tint-hand,
.doctor-hud .dh-hello,
.doctor-hud .dh-chatbox,
.doctor-hud .dh-plus-menu,
.doctor-hud .dh-menu-pop,
.doctor-hud .hud-glass,
.doctor-hud .dh-search-block {
  background: #2A2A2A !important;
  color: #FFFFFF !important;
  border-color: #3A3A3A !important;
  box-shadow: none !important;
}
.doctor-hud .dh-sidebar .dh-btn:hover,
.doctor-hud .dh-sidebar .dh-acc:hover,
.doctor-hud .dh-sidebar .dh-white-box:hover,
.doctor-hud .dh-btn:hover,
.doctor-hud .dh-chip:hover,
.doctor-hud .dh-think-pick:hover,
.doctor-hud .dh-side-toggle:hover,
.doctor-hud .dh-corner:hover {
  background: #2A2A2A !important;
  box-shadow: none !important;
  transform: none !important;
}
.doctor-hud .dh-btn.is-active,
.doctor-hud .dh-chip.is-active,
.doctor-hud .dh-chip[aria-pressed="true"],
.doctor-hud .dh-think-pick.is-active,
.doctor-hud .dh-sidebar .dh-btn.is-active,
.doctor-hud .dh-sidebar .dh-white-box[aria-pressed="true"] {
  background: #1E1E1E !important;
  color: #FFFFFF !important;
  border: 1px solid #00A67E !important;
  outline-color: #00A67E !important;
  box-shadow: none !important;
}
.doctor-hud .dh-think-pick.is-active { color: #00A67E !important; }
.doctor-hud .dh-gold {
  background: #C6A15B !important;
  color: #1A1408 !important;
  border-color: transparent !important;
  box-shadow: none !important;
}
.doctor-hud .dh-account {
  background: #2A2A2A !important;
  color: #FFFFFF !important;
  border: 1px solid #3A3A3A !important;
  border-radius: 999px;
  padding: 4px 10px;
  box-shadow: none !important;
}
.doctor-hud .dh-dot { background: #00A67E !important; box-shadow: none !important; }
.doctor-hud .dh-side-toggle {
  display: inline-flex;
  align-items: center;
  background: #1E1E1E;
  color: #FFFFFF;
  border: 1px solid #3A3A3A;
  border-radius: 10px;
  padding: 4px 8px;
  font-weight: 700;
}
.doctor-hud .dh-side-filter {
  width: 100%;
  background: #2A2A2A !important;
  color: #FFFFFF !important;
  border: 1px solid #3A3A3A !important;
  border-radius: 10px;
  padding: 6px 8px;
  font-size: 13px;
}
.doctor-hud .dh-side-filter::placeholder { color: #CCCCCC !important; opacity: 1; }
.doctor-hud .dh-thread:has(> .dh-hello) {
  display: flex !important;
  align-items: center;
  justify-content: center;
}
.doctor-hud .dh-hello {
  width: min(860px, 94%);
  margin: 0 auto;
  text-align: center;
  border-radius: 18px;
  padding: 22px 20px;
}
.doctor-hud .dh-hello {
  background: #2A2A2A !important;
  color: #FFFFFF !important;
  border: 1px solid #3A3A3A !important;
  box-shadow: none !important;
}
.doctor-hud .dh-hello p {
  margin: 0;
  color: #FFFFFF !important;
  font-size: 28px !important;
  font-weight: 700 !important;
  line-height: 1.3;
  text-align: center;
}
.doctor-hud .dh-hello p + p { margin-top: 10px; font-size: 22px !important; }
.doctor-hud .dh-chatbox textarea {
  color: #FFFFFF !important;
  background: transparent !important;
  font-size: 16px !important;
  font-family: "Noto Sans Telugu", "Segoe UI", sans-serif !important;
}
.doctor-hud .dh-chatbox textarea::placeholder {
  color: #CCCCCC !important;
  font-size: 16px !important;
  opacity: 1 !important;
}
.doctor-hud .dh-corner {
  background: #2A2A2A !important;
  color: #FFFFFF !important;
  border: 1px solid #3A3A3A !important;
  box-shadow: none !important;
}
.doctor-hud .dh-composer-box > .w-full,
.doctor-hud .dh-composer-box > .w-full > .flex {
  background: #2A2A2A !important;
  border-color: #3A3A3A !important;
}
body:has(.doctor-hud) [aria-label="Voice safety"],
body:has(.doctor-hud) [aria-label^="Hand control camera"],
body:has(.doctor-hud) #root > .flex.flex-col > .fixed.bottom-4.left-4.z-50 {
  display: none !important;
}
.doctor-hud .dh-think-pick {
  background: #1E1E1E !important;
  color: #FFFFFF !important;
  border: 1px solid #3A3A3A !important;
  box-shadow: none !important;
}
.doctor-hud :where(button, a, input, textarea, summary, [tabindex]):focus-visible {
  outline: 2px solid #00A67E !important;
  outline-offset: 2px;
  box-shadow: none !important;
}
.doctor-hud textarea:focus {
  outline: 2px solid #00A67E !important;
  box-shadow: none !important;
  border-color: #00A67E !important;
}
.doctor-hud .dh-composer-slot {
  background: #1E1E1E !important;
  box-shadow: none !important;
}
.doctor-hud .dh-chatbox {
  background: #2A2A2A !important;
  border: 1px solid #3A3A3A !important;
  box-shadow: none !important;
}
.doctor-hud .dh-chatbox textarea {
  background: #2A2A2A !important;
  color: #FFFFFF !important;
  border: 1px solid #3A3A3A !important;
  box-shadow: none !important;
  --tw-ring-shadow: 0 0 #0000 !important;
  --tw-ring-offset-shadow: 0 0 #0000 !important;
}
.doctor-hud .dh-chatbox textarea::placeholder {
  color: #CCCCCC !important;
  opacity: 1 !important;
}
.doctor-hud .dh-chatbox textarea:focus,
.doctor-hud .dh-chatbox textarea:focus-visible {
  outline: 2px solid #00A67E !important;
  outline-offset: 1px;
  border-color: #00A67E !important;
  box-shadow: none !important;
  --tw-ring-color: transparent !important;
}
.doctor-hud .dh-addon-strip {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  width: min(820px, 100%);
  margin: 10px auto 0;
}
.doctor-hud .dh-addon-card {
  appearance: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 96px;
  min-height: 54px;
  padding: 8px 10px;
  border-radius: 14px;
  background: linear-gradient(180deg, #3A3A3A 0%, #2A2A2A 58%, #242424 100%) !important;
  color: #FFFFFF !important;
  border: 1px solid #3A3A3A !important;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 16px rgba(0,0,0,0.28) !important;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
}
.doctor-hud button.dh-addon-card { cursor: pointer; }
.doctor-hud span.dh-addon-card { cursor: default; }
.doctor-hud .dh-addon-sub {
  color: #CCCCCC !important;
  font-size: 9px;
  font-weight: 600;
  line-height: 1.2;
  max-width: 120px;
}
.doctor-hud .dh-addon-card[aria-pressed="true"] {
  color: #FFFFFF !important;
  border-color: #00A67E !important;
  box-shadow: inset 0 0 0 1px #00A67E, inset 0 1px 0 rgba(255,255,255,0.16) !important;
}

/* Premium command row and single-surface composer. Presentation only. */
.doctor-hud .dh-addon-strip {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
  width: min(860px, calc(100% - 24px));
  margin: 16px auto 18px;
  padding: 0;
}
.doctor-hud .dh-addon-card {
  width: 100%;
  min-width: 0;
  min-height: 62px;
  padding: 10px 8px;
  border-radius: 16px;
  background: linear-gradient(180deg, #3A3A3A 0%, #303030 48%, #292929 100%) !important;
  border: 1px solid #4A4A4A !important;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.16), 0 8px 18px rgba(0,0,0,0.24) !important;
  letter-spacing: 0.01em;
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
}
.doctor-hud button.dh-addon-card:hover {
  background: linear-gradient(180deg, #444444 0%, #373737 48%, #2F2F2F 100%) !important;
  border-color: #666666 !important;
  transform: translateY(-1px);
}
.doctor-hud .dh-addon-sub {
  display: block;
  max-width: 112px;
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.doctor-hud .dh-composer-slot {
  padding: 0 14px 10px;
}
.doctor-hud .dh-chatbox {
  align-items: center;
  gap: 10px;
  min-height: 84px;
  padding: 10px 12px !important;
  border-radius: 30px !important;
  background: #2A2A2A !important;
  border: 1px solid #4A4A4A !important;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 12px 24px rgba(0,0,0,0.24) !important;
}
.doctor-hud .dh-plus-wrap {
  align-self: center;
}
.doctor-hud .dh-plus-wrap > .dh-corner {
  width: 52px;
  min-width: 52px;
  height: 52px;
  min-height: 52px;
  padding: 0;
  border-radius: 50%;
  font-size: 27px;
  font-weight: 400;
  line-height: 1;
}
.doctor-hud .dh-composer-box {
  flex: 1 1 auto;
  min-width: 0;
}
.doctor-hud .dh-composer-box > .w-full {
  overflow: hidden;
  border: 0 !important;
  border-radius: 22px;
  background: #2A2A2A !important;
}
.doctor-hud .dh-composer-box > .w-full > .flex {
  gap: 8px !important;
  padding: 6px 6px 4px 10px !important;
  background: #2A2A2A !important;
  border: 0 !important;
}
.doctor-hud .dh-chatbox textarea {
  min-height: 46px !important;
  padding: 11px 12px !important;
  border: 1px solid transparent !important;
  border-radius: 14px !important;
}
.doctor-hud .dh-chatbox textarea:focus,
.doctor-hud .dh-chatbox textarea:focus-visible {
  outline: none !important;
  border-color: #00A67E !important;
}
.doctor-hud .dh-composer-box .dh-corner {
  min-width: 48px;
  min-height: 46px;
  padding: 0 12px;
  border-radius: 14px;
  white-space: nowrap;
  background: #303030 !important;
  border-color: #4A4A4A !important;
}
.doctor-hud .dh-composer-box button[aria-label="Voice input, speech to text"] {
  width: 48px;
  padding: 0;
}
.doctor-hud .dh-composer-box > .w-full > :last-child {
  padding: 1px 12px 8px !important;
  color: #AFAFAF !important;
  text-align: left;
}
@media (max-width: 900px) {
  .doctor-hud .dh-chatbox { flex-wrap: nowrap; }
  .doctor-hud .dh-composer-box .dh-corner { padding: 0 9px; }
}
@media (max-width: 767px) {
  .doctor-hud .dh-chatbox { align-items: center; padding: 8px !important; }
  .doctor-hud .dh-plus-wrap > .dh-corner { width: 46px; min-width: 46px; height: 46px; min-height: 46px; }
  .dh-drawer-btn { display: inline-flex; }
  .doctor-hud .dh-sidebar {
    position: fixed !important;
    z-index: 40;
    left: 8px;
    top: 8px;
    bottom: 8px;
    transform: translateX(-120%);
    width: min(240px, 86vw) !important;
    max-width: 86vw !important;
    flex-basis: auto !important;
    opacity: 1;
  }
  .doctor-hud .dh-sidebar.is-drawer-open {
    transform: translateX(0);
    width: min(240px, 86vw) !important;
    max-width: 86vw !important;
    opacity: 1;
    overflow: auto !important;
    padding: 8px !important;
    border-width: 1px !important;
  }
  .doctor-hud .dh-sidebar.is-collapsed:not(.is-drawer-open) {
    width: 0 !important;
    max-width: 0 !important;
    opacity: 0;
    padding: 0 !important;
    border-width: 0 !important;
  }
}
@media (max-width: 600px) {
  .doctor-hud .dh-addon-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}


/* Premium iOS glass pass: sidebar stays scrollable, cards and composer share one surface. */
.doctor-hud { background: radial-gradient(circle at 75% 80%, rgba(90,123,175,.18), transparent 38%), #06111e !important; }
.doctor-hud .dh-sidebar { width: 315px !important; flex: 0 0 315px !important; height: calc(100vh - 176px) !important; overflow-y: auto !important; overscroll-behavior: contain; padding: 12px !important; background: linear-gradient(145deg, rgba(28,58,95,.72), rgba(46,74,120,.36)) !important; border: 1px solid rgba(217,199,168,.30) !important; border-radius: 22px !important; box-shadow: inset 0 1px rgba(245,245,245,.18), 0 16px 38px rgba(2,10,22,.34) !important; scrollbar-color: #B5A76C transparent; scrollbar-width: thin; }
.doctor-hud .dh-sidebar::-webkit-scrollbar { width: 7px; } .doctor-hud .dh-sidebar::-webkit-scrollbar-thumb { background: #B5A76C; border-radius: 99px; }
.doctor-hud .dh-sidebar .dh-btn, .doctor-hud .dh-sidebar .dh-acc, .doctor-hud .dh-sidebar .dh-white-box, .doctor-hud .dh-sidebar summary { min-height: 54px; display: flex; align-items: center; justify-content: center; text-align: center; background: linear-gradient(145deg, rgba(46,74,120,.62), rgba(28,58,95,.40)) !important; border: 1px solid rgba(217,199,168,.28) !important; border-radius: 16px !important; color: #F5F5F5 !important; font-family: Inter, "SF Pro Display", "Segoe UI", sans-serif !important; font-size: 13px !important; font-weight: 600 !important; letter-spacing: .01em; text-shadow: 0 1px 1px rgba(0,0,0,.35); box-shadow: inset 0 1px rgba(245,245,245,.12), 0 8px 20px rgba(3,16,34,.16) !important; }
.doctor-hud .dh-sidebar .dh-btn:hover, .doctor-hud .dh-sidebar .dh-acc:hover, .doctor-hud .dh-sidebar .dh-white-box:hover { background: linear-gradient(145deg, rgba(90,123,175,.70), rgba(58,95,138,.54)) !important; border-color: #E3CFA9 !important; }
.doctor-hud .dh-sidebar-scroll { position: sticky; z-index: 5; left: calc(50% - 17px); display: grid; place-items: center; width: 34px; height: 28px; margin: 2px auto; border: 1px solid rgba(227,207,169,.48); border-radius: 99px; background: rgba(28,58,95,.88); color: #E3CFA9; font-weight: 800; line-height: 1; } .doctor-hud .dh-sidebar-scroll-up { top: 0; } .doctor-hud .dh-sidebar-scroll-down { bottom: 0; }
.doctor-hud .dh-brand { font-family: Inter, "SF Pro Display", "Segoe UI", sans-serif !important; font-size: 36px !important; font-weight: 800 !important; letter-spacing: -.055em; background: linear-gradient(180deg, #F5F5F5 0%, #5A7BAF 55%, #1C3A5F 100%); -webkit-background-clip: text; background-clip: text; color: transparent !important; filter: drop-shadow(0 2px 0 #0A1D31) drop-shadow(0 5px 12px rgba(90,123,175,.38)); }
.doctor-hud .dh-chatbox { min-height: 96px !important; gap: 12px !important; padding: 10px 14px !important; background: linear-gradient(135deg, rgba(28,58,95,.88), rgba(46,74,120,.72)) !important; border: 1px solid rgba(217,199,168,.58) !important; border-radius: 30px !important; box-shadow: inset 0 1px rgba(245,245,245,.14), 0 14px 30px rgba(2,10,22,.34) !important; }
.doctor-hud .dh-composer-box > .w-full, .doctor-hud .dh-composer-box > .w-full > .flex { background: transparent !important; border: 0 !important; box-shadow: none !important; }
.doctor-hud .dh-chatbox textarea { min-height: 56px !important; background: transparent !important; border: 0 !important; color: #F5F5F5 !important; font-family: Inter, "SF Pro Display", "Segoe UI", sans-serif !important; }
.doctor-hud .dh-chatbox textarea:focus, .doctor-hud .dh-chatbox textarea:focus-visible { outline: none !important; box-shadow: inset 0 -2px #3C6E47 !important; }
.doctor-hud .dh-plus-wrap > .dh-corner, .doctor-hud .dh-composer-box .dh-corner { background: linear-gradient(145deg, #3A5F8A, #2E4A78) !important; color: #F5F5F5 !important; border: 1px solid rgba(227,207,169,.42) !important; box-shadow: inset 0 1px rgba(245,245,245,.22), 0 7px 16px rgba(4,17,35,.3) !important; }
.doctor-hud .dh-plus-wrap > .dh-corner { width: 56px; min-width: 56px; height: 56px; min-height: 56px; }
.doctor-hud .dh-composer-box .dh-send-arrow { width: 52px; min-width: 52px; padding: 0; border-radius: 50%; font-size: 25px; background: linear-gradient(145deg, #A67C52, #5A7BAF) !important; }
@media (max-width: 767px) { .doctor-hud .dh-sidebar { width: min(315px, 90vw) !important; max-width: 90vw !important; height: calc(100vh - 148px) !important; } .doctor-hud .dh-chatbox { min-height: 84px !important; } }

/* Final cascade: priority fixes for the visible Doctor canvas. */
.doctor-hud .dh-sidebar { width:315px !important; flex:0 0 315px !important; max-width:315px !important; height:calc(100vh - 176px) !important; overflow-y:auto !important; }
.doctor-hud .dh-sidebar.is-collapsed { width:0 !important; flex-basis:0 !important; max-width:0 !important; }
.doctor-hud .dh-chatbox { background:linear-gradient(135deg, rgba(28,58,95,.88), rgba(46,74,120,.72)) !important; border:1px solid rgba(217,199,168,.58) !important; }
.doctor-hud .dh-composer-box > .w-full, .doctor-hud .dh-composer-box > .w-full > .flex { background:transparent !important; border:0 !important; }
.doctor-hud .dh-plus-wrap > .dh-corner, .doctor-hud .dh-composer-box .dh-corner { background:linear-gradient(145deg, #3A5F8A, #2E4A78) !important; }
.doctor-hud .dh-composer-box .dh-send-arrow { background:linear-gradient(145deg, #A67C52, #5A7BAF) !important; }
@media (max-width:767px) { .doctor-hud .dh-sidebar, .doctor-hud .dh-sidebar.is-drawer-open { width:min(315px,90vw) !important; flex-basis:min(315px,90vw) !important; max-width:90vw !important; } }

/* The older six-action row is superseded by the sidebar and unified composer. */
.doctor-hud .dh-addon-strip { display:none !important; }

/* Final unified iOS glass layer. */
.doctor-hud .dh-shell,.doctor-hud .dh-body,.doctor-hud .dh-main{background:transparent!important}
.doctor-hud .dh-top{background:linear-gradient(135deg,rgba(28,58,95,.56),rgba(46,74,120,.26))!important;border-color:rgba(217,199,168,.25)!important;backdrop-filter:blur(22px) saturate(145%);-webkit-backdrop-filter:blur(22px) saturate(145%);box-shadow:inset 0 1px rgba(245,245,245,.14),0 14px 36px rgba(0,9,23,.26)!important}
.doctor-hud .dh-sidebar{background:linear-gradient(155deg,rgba(46,74,120,.55),rgba(28,58,95,.30))!important;backdrop-filter:blur(26px) saturate(150%);-webkit-backdrop-filter:blur(26px) saturate(150%)}
.doctor-hud .dh-sidebar .dh-btn,.doctor-hud .dh-sidebar .dh-acc,.doctor-hud .dh-sidebar .dh-white-box{background:linear-gradient(145deg,rgba(90,123,175,.36),rgba(28,58,95,.27))!important;border-color:rgba(227,207,169,.24)!important;box-shadow:inset 0 1px rgba(245,245,245,.17),inset 0 -1px rgba(10,29,49,.22),0 10px 24px rgba(4,17,35,.18)!important}
.doctor-hud .dh-side-filter{height:44px!important;padding:0 14px!important;color:#F5F5F5!important;background:rgba(28,58,95,.36)!important;border:1px solid rgba(227,207,169,.30)!important;border-radius:14px!important;font-family:Inter,"SF Pro Text","Segoe UI",sans-serif!important;font-size:13px!important;box-shadow:inset 0 1px rgba(245,245,245,.12),0 7px 18px rgba(4,17,35,.16)!important}.doctor-hud .dh-side-filter::placeholder{color:rgba(245,245,245,.72)!important}.doctor-hud .dh-side-filter:focus{outline:none!important;border-color:#E3CFA9!important;box-shadow:0 0 0 3px rgba(227,207,169,.12),inset 0 1px rgba(245,245,245,.12)!important}
.doctor-hud .dh-hello{background:linear-gradient(145deg,rgba(46,74,120,.28),rgba(28,58,95,.18))!important;border:1px solid rgba(227,207,169,.26)!important;box-shadow:inset 0 1px rgba(245,245,245,.12),0 16px 35px rgba(3,16,34,.17)!important}
.doctor-hud .dh-chatbox{position:relative;overflow:hidden;background:linear-gradient(135deg,rgba(46,74,120,.60),rgba(28,58,95,.47))!important;border:1px solid rgba(227,207,169,.42)!important;backdrop-filter:blur(26px) saturate(150%);-webkit-backdrop-filter:blur(26px) saturate(150%)}.doctor-hud .dh-chatbox::before{content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;box-shadow:inset 0 1px rgba(245,245,245,.16),inset 0 -1px rgba(10,29,49,.25)}
.doctor-hud .dh-composer-box,.doctor-hud .dh-composer-box>.w-full,.doctor-hud .dh-composer-box>.w-full>.flex,.doctor-hud .dh-composer-box>.w-full>:last-child{background:transparent!important;border:0!important;box-shadow:none!important}.doctor-hud .dh-chatbox textarea{position:relative;z-index:1;min-height:62px!important;padding:18px 10px!important;resize:none;color:#F5F5F5!important;background:transparent!important;border:0!important;border-radius:0!important;font-family:Inter,"SF Pro Text","Segoe UI",sans-serif!important;font-size:16px!important;font-weight:500!important;line-height:1.35!important}.doctor-hud .dh-chatbox textarea:focus,.doctor-hud .dh-chatbox textarea:focus-visible{box-shadow:none!important;outline:none!important}.doctor-hud .dh-composer-box .dh-corner,.doctor-hud .dh-plus-wrap>.dh-corner{position:relative;z-index:2;background:linear-gradient(145deg,rgba(90,123,175,.84),rgba(46,74,120,.90))!important;border-color:rgba(227,207,169,.36)!important}.doctor-hud .dh-composer-box .dh-send-arrow{background:linear-gradient(145deg,#A67C52,#5A7BAF)!important}

/* Compact command composer and matching actions menu. */
.doctor-hud .dh-chatbox { min-height:82px !important; padding:8px 12px !important; border-radius:26px !important; }
.doctor-hud .dh-chatbox textarea { min-height:48px !important; padding:12px 10px !important; }
.doctor-hud .dh-plus-wrap > .dh-corner { width:48px !important; min-width:48px !important; height:48px !important; min-height:48px !important; }
.doctor-hud .dh-composer-box .dh-corner { min-height:42px !important; height:42px !important; border-radius:13px !important; }
.doctor-hud .dh-composer-box .dh-send-arrow { width:46px !important; min-width:46px !important; height:46px !important; min-height:46px !important; }
.doctor-hud .dh-plus-menu { z-index:100 !important; width:260px !important; padding:8px !important; border:1px solid rgba(227,207,169,.34) !important; border-radius:18px !important; background:linear-gradient(145deg,rgba(46,74,120,.94),rgba(28,58,95,.96)) !important; backdrop-filter:blur(24px) saturate(150%); -webkit-backdrop-filter:blur(24px) saturate(150%); box-shadow:inset 0 1px rgba(245,245,245,.17),0 18px 42px rgba(2,10,22,.44) !important; }
.doctor-hud .dh-plus-menu button { display:flex !important; align-items:center !important; width:100% !important; min-height:38px !important; padding:8px 10px !important; border:1px solid transparent !important; border-radius:11px !important; background:transparent !important; color:#F5F5F5 !important; font-family:Inter,"SF Pro Text","Segoe UI",sans-serif !important; font-size:13px !important; font-weight:600 !important; text-align:left !important; box-shadow:none !important; }
.doctor-hud .dh-plus-menu button:hover { background:rgba(90,123,175,.34) !important; border-color:rgba(227,207,169,.28) !important; }
body:has(.doctor-hud) #root > .flex.flex-col > .fixed.bottom-6 { z-index:110 !important; right:18px !important; bottom:126px !important; pointer-events:auto !important; }
body:has(.doctor-hud) #root > .flex.flex-col > .fixed.bottom-6 button, body:has(.doctor-hud) #root > .flex.flex-col > .fixed.bottom-6 input { pointer-events:auto !important; }

/* Keep the compact action list clear of the composer. */
.doctor-hud .dh-plus-wrap { position:relative !important; }
.doctor-hud .dh-plus-menu { position:absolute !important; left:0 !important; bottom:calc(100% + 10px) !important; top:auto !important; }

/* Composer rests directly on the dashboard canvas. */
.doctor-hud .dh-composer-slot { background:transparent !important; box-shadow:none !important; }

/* Remove remaining opaque option and utility-card backgrounds. */
.doctor-hud .dh-plus-menu { background:rgba(28,58,95,.16) !important; border-color:rgba(227,207,169,.22) !important; box-shadow:none !important; }
.doctor-hud .dh-plus-menu button { background:rgba(46,74,120,.18) !important; }
.doctor-hud .dh-plus-menu button:hover { background:rgba(90,123,175,.30) !important; }
.doctor-hud .dh-sidebar .dh-white-box, .doctor-hud .dh-sidebar .dh-white-box.tint-voice, .doctor-hud .dh-sidebar .dh-white-box.tint-staff, .doctor-hud .dh-sidebar .dh-white-box.tint-wake, .doctor-hud .dh-sidebar .dh-white-box.tint-hand { background:linear-gradient(145deg,rgba(90,123,175,.28),rgba(28,58,95,.20)) !important; color:#F5F5F5 !important; border-color:rgba(227,207,169,.24) !important; box-shadow:inset 0 1px rgba(245,245,245,.15),0 8px 18px rgba(4,17,35,.13) !important; }

/* The plus menu must render outside the compact composer. */
.doctor-hud .dh-chatbox { overflow:visible !important; }
.doctor-hud .dh-plus-menu { z-index:200 !important; }

/* One command collapses the hospital header, status row, and module navigation. */
.doctor-hud .dh-chrome-toggle { border:1px solid rgba(227,207,169,.34); border-radius:999px; padding:7px 11px; background:rgba(46,74,120,.38); color:#F5F5F5; font:600 12px/1 Inter,"SF Pro Text","Segoe UI",sans-serif; white-space:nowrap; }
.doctor-hud .dh-chrome-toggle:hover { background:rgba(90,123,175,.50); }
body:has(.doctor-hud.doctor-chrome-collapsed) #root > .flex.flex-col > header.shrink-0.border-b,
body:has(.doctor-hud.doctor-chrome-collapsed) #root > .flex.flex-col > div.border-b.px-3,
body:has(.doctor-hud.doctor-chrome-collapsed) #root > .flex.flex-col > div.shrink-0.border-b { display:none !important; }

/* Let the existing uploader's attachment menu escape the composer wrapper. */
.doctor-hud .dh-composer-box, .doctor-hud .dh-composer-box > .w-full { overflow:visible !important; }
.doctor-hud .dh-composer-box [class*="absolute"] { z-index:210 !important; }

/* Reference dashboard specification: visual layer only. */
.doctor-hud {
 --astra-bg:#030A12; --astra-workspace:#04111D; --astra-sidebar:#07131F; --astra-card:#0B1927; --astra-card-2:#0B1A2C; --astra-input:#102138;
 --astra-text-primary:#F7FAFF; --astra-text-secondary:#A9B7C8; --astra-text-muted:#718198; --astra-cyan:#16C8F3; --astra-blue:#2787FF; --astra-green:#18D69D; --astra-teal:#18D4B0; --astra-amber:#F6B928; --astra-red:#FF4248; --astra-purple:#8D56FF; --astra-border:rgba(100,155,210,.22); --astra-border-active:rgba(22,200,243,.60);
 min-height:100%; background:radial-gradient(circle at 92% 80%,rgba(17,105,255,.26) 0%,rgba(7,43,90,.12) 18%,transparent 38%),linear-gradient(135deg,#04101C 0%,#061421 48%,#04111D 100%)!important; color:var(--astra-text-primary); font-family:Inter,"Segoe UI",system-ui,sans-serif;
}
.doctor-hud .dh-shell{height:calc(100vh - 12px);max-width:none!important;padding:12px!important;gap:12px!important;overflow:hidden}.doctor-hud .dh-body{display:grid!important;grid-template-columns:315px minmax(0,1fr)!important;gap:18px!important;min-height:0;flex:1}.doctor-hud .dh-sidebar{width:auto!important;max-width:none!important;flex:none!important;height:auto!important;padding:14px 18px!important;background:var(--astra-sidebar)!important;border:1px solid rgba(100,155,210,.18)!important;border-radius:12px!important;box-shadow:none!important}.doctor-hud .dh-sidebar.is-collapsed{width:68px!important;max-width:68px!important;padding:10px!important}.doctor-hud .dh-main{min-width:0;min-height:0;padding:28px 32px 20px!important;position:relative;display:flex;flex-direction:column}.doctor-hud .dh-top{height:62px!important;padding:0 14px!important;border-radius:12px!important;background:transparent!important;border:0!important;box-shadow:none!important;gap:18px!important}.doctor-hud .dh-brand{font-size:36px!important;font-weight:700!important;line-height:1!important;letter-spacing:-.02em!important;color:#25B6EF!important;background:none!important;filter:none!important}.doctor-hud .dh-account{height:40px;padding:0 18px;border-radius:20px;background:#0B1928;border:1px solid rgba(115,170,220,.32);font-size:13px;font-weight:600}.doctor-hud .dh-gold{height:46px;padding:0 18px;border-radius:23px;background:rgba(95,57,0,.38)!important;border:1px solid rgba(246,185,40,.64)!important;color:#F6B928!important;font-size:12.5px!important;font-weight:600}.doctor-hud .dh-sidebar .dh-btn,.doctor-hud .dh-sidebar .dh-acc,.doctor-hud .dh-sidebar .dh-white-box{min-height:48px!important;height:48px!important;margin-bottom:4px!important;padding:0 14px!important;border-radius:10px!important;justify-content:flex-start!important;text-align:left!important;background:#0B1927!important;border:1px solid rgba(100,155,210,.18)!important;box-shadow:none!important;font-size:13px!important;font-weight:500!important}.doctor-hud .dh-sidebar .dh-btn:hover,.doctor-hud .dh-sidebar .dh-acc:hover{background:#102235!important;border-color:rgba(22,200,243,.35)!important}.doctor-hud .dh-side-filter{height:44px!important;border-radius:10px!important;background:#091725!important;border-color:rgba(100,155,210,.20)!important;color:#A9B7C8!important;box-shadow:none!important}.doctor-hud .dh-white-stack{display:grid!important;grid-template-columns:1fr 1fr;gap:8px!important}.doctor-hud .dh-white-stack .tint-voice,.doctor-hud .dh-white-stack .tint-staff{grid-column:1/-1}.doctor-hud .dh-white-stack .dh-white-box{height:58px!important;min-height:58px!important;display:flex!important;flex-direction:column;align-items:flex-start!important;justify-content:center!important}.doctor-hud .dh-hello{width:min(930px,76%)!important;min-height:112px!important;margin:78px auto 0!important;padding:18px 22px!important;border-radius:16px!important;background:#0B1A2C!important;border:1px solid rgba(65,128,190,.45)!important;box-shadow:0 8px 26px rgba(0,0,0,.24)!important}.doctor-hud .dh-hello p{font-size:15px!important;font-weight:500!important;line-height:1.45!important}.doctor-hud .dh-composer-slot{position:absolute!important;left:32px!important;right:32px!important;bottom:22px!important;padding:0!important;background:transparent!important}.doctor-hud .dh-chatbox{height:96px!important;min-height:96px!important;max-width:1280px!important;margin:0 auto!important;padding:9px 12px!important;border-radius:48px!important;background:transparent!important;border:0!important;box-shadow:none!important;gap:12px!important}.doctor-hud .dh-plus-wrap>.dh-corner{width:58px!important;min-width:58px!important;height:58px!important;min-height:58px!important;border-radius:50%!important;background:#145486!important;border:1px solid rgba(22,200,243,.28)!important;font-size:28px!important}.doctor-hud .dh-composer-box{height:78px!important;border-radius:36px!important;background:#102138!important;border:1px solid rgba(65,145,220,.55)!important;padding:0 20px!important;box-shadow:0 16px 40px rgba(0,0,0,.30)!important}.doctor-hud .dh-composer-box>.w-full,.doctor-hud .dh-composer-box>.w-full>.flex{height:100%!important;background:transparent!important;border:0!important}.doctor-hud .dh-chatbox textarea{font-size:14px!important;font-weight:400!important;color:#F7FAFF!important;padding:12px 0!important}.doctor-hud .dh-chatbox textarea::placeholder{color:#8FA0B4!important}.doctor-hud .dh-composer-box .dh-corner{width:44px!important;min-width:44px!important;height:44px!important;min-height:44px!important;padding:0!important;background:transparent!important;border:0!important;box-shadow:none!important;color:#DCE9F6!important}.doctor-hud .dh-composer-box .dh-send-arrow{width:56px!important;min-width:56px!important;height:56px!important;min-height:56px!important;border-radius:50%!important;background:#278CFF!important;color:#fff!important}.doctor-hud .dh-composer-box>.w-full>:last-child{font-size:11.5px!important;color:#A1B0C1!important;opacity:.85!important;padding:0!important}.doctor-hud .dh-plus-menu{background:#0B1927!important;border:1px solid var(--astra-border)!important;border-radius:12px!important;box-shadow:0 8px 26px rgba(0,0,0,.24)!important}
@media(max-width:1279px){.doctor-hud .dh-body{grid-template-columns:260px minmax(0,1fr)!important}}@media(max-width:1023px){.doctor-hud .dh-body{display:flex!important}.doctor-hud .dh-sidebar{position:fixed!important;width:315px!important;z-index:50}.doctor-hud .dh-main{width:100%}}

/* Clinical response cards retain readable contrast on the navy console. */
.doctor-hud .dh-copilot-wrap [class*="grid-cols-4"] > div { background:#0B1927 !important; border-color:rgba(100,155,210,.30) !important; color:#F7FAFF !important; box-shadow:0 8px 20px rgba(0,0,0,.18) !important; }
.doctor-hud .dh-copilot-wrap [class*="grid-cols-4"] > div * { color:inherit !important; opacity:1 !important; }
.doctor-hud .dh-copilot-wrap [class*="grid-cols-4"] > div [class*="text-"] { color:#A9B7C8 !important; }
.doctor-hud .dh-copilot-wrap [class*="grid-cols-4"] > div p, .doctor-hud .dh-copilot-wrap [class*="grid-cols-4"] > div span:not([class*="text-"]) { color:#F7FAFF !important; }

/* Clinical stream contrast: no light cards with light text. */
.doctor-hud .dh-copilot-wrap, .doctor-hud .dh-thread { color:#F7FAFF !important; }
.doctor-hud .dh-copilot-wrap [class*="bg-white"], .doctor-hud .dh-copilot-wrap [class*="bg-slate-"], .doctor-hud .dh-copilot-wrap [class*="bg-gray-"] { background:#0B1927 !important; border-color:rgba(100,155,210,.30) !important; }
.doctor-hud .dh-copilot-wrap [class*="text-slate-"], .doctor-hud .dh-copilot-wrap [class*="text-gray-"], .doctor-hud .dh-copilot-wrap [class*="text-white"], .doctor-hud .dh-thread p, .doctor-hud .dh-thread li { color:#F7FAFF !important; opacity:1 !important; text-shadow:none !important; }
.doctor-hud .dh-copilot-wrap [class*="text-slate-400"], .doctor-hud .dh-copilot-wrap [class*="text-slate-500"], .doctor-hud .dh-thread small { color:#A9B7C8 !important; }
.doctor-hud .dh-copilot-wrap [class*="rounded"] { text-shadow:none; }

`;
