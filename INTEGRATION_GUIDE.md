# ASTRA CLINICAL IMAGE ANNOTATOR v5.0 — INTEGRATION GUIDE

## What Was Built

### 1. `src/lib/agents/MedicalImageAgentFinal.ts` — Complete Production Vision Engine
The live agent. Analyzes **actual pixels** — no hardcoded image coordinates — and covers **all anatomical regions**: hand trauma, trigger finger, wrist volar, carpal tunnel, zones I–V.

| Step | Detection | Method |
|------|-----------|--------|
| 1 | Skin segmentation | Per-pixel warm-tone classification with **green/blue surgical drape exclusion** (`g > r*1.15`), dark-background rejection (`brightness < 35`), white fabric rejection |
| 2 | Hand bounding box | Min/max of all detected skin pixels → the real anatomical region |
| 3 | Wound localization | Blood-red + dark-clot clustering **inside the skin box only** → weighted centroid (honest `null` when insufficient blood evidence) |
| 4 | Hand position | Skin-center vs. frame → left / center / right |
| 5 | Wound zone | Wound Y within skin box → `proximal` (<0.33) / `middle` (<0.66) / `distal` |
| 6 | View | Hint-driven (`dorsal` / `lateral`) with `palmar` default |

### 2. ANATOMICAL_ATLAS — 60+ structures
A full database of hand structures with per-entry **layer, type, and clinical description**:
- Skin/dermis, palmar aponeurosis, flexor retinaculum
- **Pulleys**: A1–A5 + oblique (thumb) — A1 = trigger finger
- Volar plates (MCP/PIP), collateral ligaments (thumb UCL = Gamekeeper's)
- **Neurovascular**: median/ulnar/radial nerves (wrist + digital), superficial + deep palmar arches, common + proper digital arteries (radial & ulnar), radial/ulnar arteries
- **Tendons**: FDS, FDP, FPL, FCR, FCU, PL, EPL, EPB, APL
- **Muscles**: thenar, hypothenar, lumbricals, dorsal/palmar interossei, adductor pollicis
- **Skeletal**: scaphoid → sesamoids, MC1–5, proximal/middle/distal phalanges

Hotspots resolve to atlas entries by landmark id (`specificBranch` + `anatomyDetail`); the wound hotspot uses a clinical fallback description.

### 3. Landmark Placer — 17 landmarks inside the detected skin
Every dot lands on detected anatomy, never on the drape:
Wound center, thenar + hypothenar eminences, radial/ulnar proper digital nerves (at **0.09×skinW** → CRITICAL) + arteries (0.13), flexor tendons (0.08×skinH → DAMAGED), palmar aponeurosis, carpal tunnel, median nerve, radial artery (wrist), metacarpal heads (0.03), finger tips, **A1 pulley** (trigger-finger at MCP level), **superficial palmar arch**, **lumbricals**.

Statuses are **proximity-derived from the real wound** (relative distance, 0–1):
- `< 0.10` → nerve/artery = CRITICAL, tendon = DAMAGED, bone = AT-RISK, skin = DAMAGED, other = AT-RISK
- `< 0.20` → AT-RISK
- No blood evidence → honest `woundCenter: null`, all structures NORMAL

### 4. Structure Lines
`structureLines` polylines trace anatomical courses through the detected anatomy (flexor tendon course FDS/FDP, median nerve course, radial/ulnar digital bundles, radial artery course) — rendered from placed landmark points, all within 0–1 coordinates.

### 5. Chat UI (mic + attachment)
Both `DoctorDashboard.tsx` and `ClinicalChatPlugin.tsx` ship a working input row: mic voice dictation + ChatGPT-style paperclip uploader (image/PDF/doc) with preview bar and Enter-to-send. Attached images route to the CV engine via `CentralResolver` (the query text is passed as the **view hint**).

### 6. Viewer — AdvancedImageAnnotationViewer (v5 UI)
- Layer filter, click → detail panel (Anatomy / Clinical / Repair / Complications + Finding & Evidence strip, confidence tier, priority chip, laterality), compare, reference, calibrated measure (mm/px), **1920×1440** PNG export (critical findings + priority actions + measurements + legend + disclaimer), status chips (Critical/Damaged/At Risk)
- **Zoom/Pan**: scroll-wheel zoom (0.5×–4×, native non-passive listener), drag-to-pan when zoomed, − / % / + controls in the status strip, reset button, auto-reset on new image. Dots are anchored **inside** the transform group with the image (counter-scaled by 1/zoom), so they stay exactly on the anatomy while zooming/panning; the measurement canvas stays in container space so calibration/measurement math is unaffected.
- **Precision labeling (spec §2/§8/§10/§11/§18)**: "Smart" mode renders numbered label boxes + leader lines that terminate at the **exact anchor** — the label may move, the anchor never does. A greedy anti-collision layout (priority-ordered, radial candidate slots with AABB rejection) keeps labels in empty space; labels are inside the zoom transform so they stay on the image (spec §16).
- **Uncertain markers (spec §7/§11)**: at-risk/image-limited findings get dashed rings (not solid ping) + `?` in the label; wording states "limited by image quality/occlusion".
- **Doctor correction (spec §18)**: Confirm / Incorrect buttons in the detail panel persist per-image to localStorage — confirmed dots get an emerald ring + badge, incorrect dots are greyed out with an ✗. Corrections are authoritative for the case.

## Precision Data Model (spec §19)
Every hotspot carries: `id`, `name`, target `x/y` (normalized), `label_position`, `leader_line {start,end}`, `confidence` (tiered: critical 0.94 / damaged 0.86 / at-risk 0.66 / normal 0.78), `priority` (CRITICAL/HIGH/MODERATE/LOW), `laterality` (LEFT/RIGHT/INDETERMINATE), `finding`, `evidence`, `uncertain` flag, and a wound `bounding_box` derived from the blood-pixel cluster extent (spec §5 Level 2).

## Integration Status
- `CentralResolver.ts` routes the image branch to `medicalImageAgentFinal.analyzeImage(dataUrl, hint)` — the engine now returns **native** `confidence` / `injuryPattern` / `display.summary` / `display.priority` / `region.view` (compat adapter removed).
- `MedicalImageAgentV4.ts` (richer per-landmark confidence/thumb-mode engine) remains in-tree as an alternate/rollback — swap the single import in `CentralResolver.ts`.

## Pipeline (what the user sees)

```
Upload image + hint ("left thumb machine cut at MCP joint dorsal palmar")
  → PixelAnalyzer: skin box (green/blue drape + dark bg excluded) → blood cluster → wound center → wound zone → view
  → LandmarkPlacer: 17 anatomical dots placed inside the detected skin box, nerves at wound margins
  → Atlas: every hotspot resolves to its anatomical structure (specificBranch, anatomyDetail)
  → Status: CRITICAL/DAMAGED/AT-RISK by wound proximity (<0.10 / <0.20)
  → Structure lines: tendon / nerve / artery courses through the wound
  → Report: red flags (🚨 critical structures), EMR snippet, region, confidence, priority actions
  → Viewer: dots on real anatomy, detail panel with repair protocol, zoom/pan inspection, export PNG
```

## Tests
- `npx tsx test_clinical_copilot.ts` — 48/48 regression
- `npx tsx test_resolver.ts` — resolver routing
- `npx tsx test_image_agent_v4.ts` — v4 engine unit tests (35/35)
- `npx tsx test_image_agent_final.ts` — final agent: Node guard, 17 landmarks, ALL-dots-inside-skin-box guarantee, 0.10/0.20 proximity statuses, atlas resolution, structure lines, wound-zone/view helpers, precision data model (priorities, confidence tiers, uncertainty, laterality, finding/evidence, wound bounding box) (39/39)
- `node verify-image.mjs` — live browser harness (dev server on :5173): upload `test-image.jpg`, verify dots, critical markers, detail panel, **smart labels (leader lines + numbered boxes)**, **uncertain dashed markers**, **confidence tier + priority chip**, **Confirm/Incorrect clinician corrections**, zoom buttons + wheel + reset, dot-anchoring inside the zoom transform, measure → calibrate (20mm) → real-mm reading, export **1920×1440** report, dashboard card (32/32)

## Rollback
Backup the previous agent (`MedicalImageAgent.ts` is untouched) and revert the single import in `CentralResolver.ts` to restore v2 behavior.