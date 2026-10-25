/**
 * Shared HUD design tokens — the single source of truth for the neon/glass
 * look used by BOTH the Command Centre (`#/command-center`, CentralCommand.tsx)
 * and the Doctor Command OS (`#/command-os`, DoctorDashboard.tsx). Import the
 * palette constants and inject `hudTokensCss` once per surface so the two
 * screens visibly share one style system instead of copy-pasted values.
 */

export const HUD_PALETTE = {
  midnight: "#0B1026",
  iris: "#6C63FF",
  lilac: "#C8A2FF",
  sky: "#7CC8FF",
  mint: "#5EF2C2",
  coral: "#FF7A6B",
  sunflower: "#FFD84D",
  neon: "#39FF88",
} as const;

export type HudAccent = keyof typeof HUD_PALETTE;

/** Panel accent colours used to tint the outer neon glow per panel. */
export const HUD_ACCENTS = {
  iris: HUD_PALETTE.iris,
  lilac: HUD_PALETTE.lilac,
  sky: HUD_PALETTE.sky,
  mint: HUD_PALETTE.mint,
  coral: HUD_PALETTE.coral,
  sunflower: HUD_PALETTE.sunflower,
  neon: HUD_PALETTE.neon,
} as const;

/**
 * Token + shared-class CSS. Scoped to `:root` for the variables and to the
 * `.hud-glass` / `.doctor-hud` / `.hud-root` wrappers for the classes, so it
 * never leaks heavy glass styling into the rest of the app (Round 3 prompt 07
 * "avoid heavy glass" stays the global default; the doctor HUD is a scoped
 * exception).
 */
export const hudTokensCss = `
:root {
  --hud-midnight: ${HUD_PALETTE.midnight};
  --hud-iris: ${HUD_PALETTE.iris};
  --hud-lilac: ${HUD_PALETTE.lilac};
  --hud-sky: ${HUD_PALETTE.sky};
  --hud-mint: ${HUD_PALETTE.mint};
  --hud-coral: ${HUD_PALETTE.coral};
  --hud-sunflower: ${HUD_PALETTE.sunflower};
  --hud-neon: ${HUD_PALETTE.neon};
  --hud-glass-fill: rgba(255,255,255,0.06);
  --hud-glass-border: rgba(255,255,255,0.14);
  --hud-glass-highlight: rgba(255,255,255,0.16);
  --hud-blur: blur(18px) saturate(140%);
  --hud-radius: 16px;
  --hud-radius-sm: 12px;
  --hud-accent: ${HUD_PALETTE.sky};
  --hud-grad-iris-sky: linear-gradient(135deg, ${HUD_PALETTE.iris}, ${HUD_PALETTE.sky});
  --hud-grad-lilac-coral: linear-gradient(135deg, ${HUD_PALETTE.lilac}, ${HUD_PALETTE.coral});
  --hud-grad-mint-sky: linear-gradient(135deg, ${HUD_PALETTE.mint}, ${HUD_PALETTE.sky});
}

.hud-glass {
  position: relative;
  background: var(--hud-glass-fill);
  border: 1px solid var(--hud-glass-border);
  border-radius: var(--hud-radius);
  backdrop-filter: var(--hud-blur);
  -webkit-backdrop-filter: var(--hud-blur);
  box-shadow:
    inset 0 1px 0 var(--hud-glass-highlight),
    0 18px 50px rgba(0,0,0,0.35),
    0 0 22px -6px var(--hud-accent);
  transition: box-shadow 0.3s ease, transform 0.3s ease, border-color 0.3s ease;
}
.hud-glass:hover, .hud-glass:focus-within {
  border-color: color-mix(in srgb, var(--hud-accent) 55%, transparent);
  box-shadow:
    inset 0 1px 0 var(--hud-glass-highlight),
    0 22px 60px rgba(0,0,0,0.42),
    0 0 24px -2px var(--hud-accent);
}

/* Performance mode: kill blur + heavy shadows, keep layout intact. */
.doctor-hud.perf .hud-glass,
.hud-root.perf .hud-glass {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: 0 6px 18px rgba(0,0,0,0.35);
}
.doctor-hud.perf .hud-glass:hover,
.doctor-hud.perf .hud-glass:focus-within {
  box-shadow: 0 6px 18px rgba(0,0,0,0.35);
}
`;
