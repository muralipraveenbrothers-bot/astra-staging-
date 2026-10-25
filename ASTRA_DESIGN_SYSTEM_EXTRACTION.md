# ASTRA HEALTH OS — DESIGN SYSTEM & VISUAL SPECIFICATION

## 1. Color Palette & Semantic Tokens

### Core Colors & Dark Cockpit Palette
- **Background Root**: `bg-slate-950` (`#020617`) / `bg-slate-900/95` (`#0f172a`)
- **Card & Panel Surfaces**: `bg-slate-900/80` (`#0f172a`), `border-slate-800` (`#1e293b`), `border-slate-700/60` (`#334155`)
- **Light Workspace Canvas**: `bg-slate-100` (`#f1f5f9`), card surfaces `bg-white`, text `text-slate-900`
- **Primary Clinical Blue**: `#0284c7` (Sky-600), `#2563eb` (Blue-600), `#38bdf8` (Sky-400)
- **Clinical Cyan / AI Intelligence**: `#06b6d4` (Cyan-500), `#22d3ee` (Cyan-400)
- **Surgical & OT Purple**: `#7c3aed` (Violet-600), `#a855f7` (Purple-500)
- **Diagnostic Teal / Emerald**: `#0d9488` (Teal-600), `#10b981` (Emerald-500)
- **Critical Red / Code Blue**: `#ef4444` (Red-500), `#f87171` (Red-400), surface `bg-rose-950/30`
- **Warning Amber / Attention**: `#f59e0b` (Amber-500), `#fbbf24` (Amber-400), surface `bg-amber-950/30`

### Typography & Fonts
- **Primary Sans**: `Inter`, `Segoe UI`, `-apple-system`, `BlinkMacSystemFont`, `sans-serif`
- **Headings & Display**: `Inter Display`, `Outfit`, font weights: `800` (ExtraBold) & `900` (Black)
- **Monospace Telemetry**: `JetBrains Mono`, `Fira Code`, `ui-monospace` (for UHIDs, Token #, Vitals, ICD-10)
- **Font Scale Hierarchy**:
  - `text-[9px]` & `text-[10px]`: Telemetry labels, uppercase section tags, sub-chips.
  - `text-xs` (12px): Standard data grids, order lines, alert details, table cells.
  - `text-sm` (14px): Card headers, input controls, patient demographic titles.
  - `text-base` (16px) & `text-lg` (18px): Dashboard sub-headings, quick counters.
  - `text-2xl` (24px) & `text-3xl` (30px): Main command banners, pulse scores, total collections.

### Spacing & Grid System
- **Layout Grid**: 12-Column responsive fluid container (`max-w-[1550px] mx-auto p-4`)
- **Gaps**: `gap-2` (micro metrics), `gap-3` (cards & queues), `gap-5` (major split-view columns)
- **Corner Radii**:
  - `rounded-lg` (8px): Inputs, table rows, button chips.
  - `rounded-xl` (12px): Metric cards, modal headers, sub-tabs.
  - `rounded-2xl` (16px): Major command banners, 3D organ viewports, patient charts.
  - `rounded-full`: Status dots, floating Astra Copilot microphone orb, token badges.

### Shadows & Elevation
- **Card Shadow**: `shadow-md shadow-slate-950/40`
- **Command Banner**: `shadow-2xl shadow-blue-950/50`
- **Active Pill Glow**: `shadow-md shadow-blue-900/30`
- **Floating Orb Glow**: `shadow-xl shadow-cyan-900/50` with pulsating emerald ping indicator.

---

## 2. Micro-Interactions & Interactive States

1. **Top Sub-Nav Department Pill Bar**:
   - **Inactive**: `bg-slate-800/60 border-slate-700/40 text-slate-400 hover:text-slate-200 hover:bg-slate-800`
   - **Active**: `bg-gradient-to-r text-white scale-[1.02] shadow-md border-cyan-400/50`
2. **"What Needs Attention" Action Triggers**:
   - **OPEN**: Navigates directly into active patient EMR chart.
   - **ACK**: Transitions alert status from `UNRESOLVED` to `ACKNOWLEDGED`.
   - **RESOLVE**: Fades alert with `opacity-40` and tags `RESOLVED` green badge.
3. **Universal Order Center (4 Quick Badge)**:
   - Click opens CPOE Quick Order modal with instant keyboard search.
4. **Floating Astra Copilot Orb**:
   - Continuous ambient listening state with pulsating green beacon; hover triggers scale up (`scale-105`), click launches full voice/command modal with immediate audio barge-in / interrupt.
5. **Toast Notifications**:
   - Powered by `sonner` with high-contrast glassmorphism (`bg-slate-900/90 border-slate-700 text-white`).

---

## 3. Form Controls & Data Tables

1. **Search Inputs**:
   - Glass-dark inputs with left-aligned search icon (`pl-9 pr-4 py-1.5 bg-slate-800/80 border-slate-700/60 text-xs text-white`).
   - Focus ring: `focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50`.
2. **Data Tables (OP Queue, IP Census, Lab Worklist, Bills)**:
   - High-density tabular layout (`py-2 px-3 text-xs`).
   - Zebra striping with hover highlight (`hover:bg-slate-800/60 transition-colors`).
   - Panic/Critical rows highlighted with `bg-rose-950/30 text-rose-300 font-bold`.
