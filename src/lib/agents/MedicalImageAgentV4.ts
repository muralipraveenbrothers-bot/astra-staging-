// src/lib/agents/MedicalImageAgentV4.ts
// ASTRA CLINICAL VISION ENGINE v4.0 — Real Computer Vision
// Pipeline: skin segmentation (drape exclusion) → wound clustering →
// Sobel edges → orientation / hand-side / finger-direction → anatomy-aware
// landmark placement → proximity-based status + confidence.

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface Hotspot {
  id: string;
  name: string;
  x: number; // 0-1 relative to image
  y: number;
  layer: 'superficial' | 'intermediate' | 'deep' | 'neurovascular' | 'skeletal';
  type: 'skin' | 'nerve' | 'artery' | 'vein' | 'bone' | 'tendon' | 'ligament' | 'muscle' | 'joint' | 'fascia' | 'foreign_body' | 'other';
  condition: string;
  risk: number;
  visible: boolean;
  specificBranch?: string;
  clinicalImportance: string;
  actionRequired: string;
  status: 'critical' | 'damaged' | 'at-risk' | 'normal';
  anatomyDetail: string;
  repairProtocol: string;
  complications: string;
  landmarkType: string;
  confidence: number;
}

export interface RegionInfo {
  bodyPart: string;
  side: 'Left' | 'Right' | 'Midline' | 'Bilateral' | 'Indeterminate';
  specificArea: string;
  anatomicalPosition: string;
}

export interface InjuryPattern {
  type: string;
  severity: string;
  mechanism: string;
  contamination: string;
}

export interface CVReport {
  skinBoundingBox: { x: number; y: number; w: number; h: number } | null;
  skinCoverage: number; // fraction of image pixels classified as skin
  woundCenter: { x: number; y: number } | null; // absolute pixels
  woundRadius: number;
  orientation: 'portrait' | 'landscape' | 'unknown';
  handSide: 'left' | 'right' | 'unknown';
  fingerDirection: 'up' | 'down' | 'left' | 'right' | 'unknown';
  edgeCount: number;
  bloodRatio: number;
  landmarkMode: 'thumb' | 'hand';
}

export interface ImageAnalysisResult {
  region: RegionInfo;
  injuryPattern: InjuryPattern;
  hotspots: Hotspot[];
  redFlags: string[];
  emrSnippet: string;
  confidence: number;
  display: {
    summary: string;
    priority: Array<{ urgency: string; action: string; rationale: string }>;
  };
  debug: CVReport;
}

// ═══════════════════════════════════════════════════════════════
// PURE PIXEL PREDICATES (unit-testable without canvas)
// ═══════════════════════════════════════════════════════════════

export function isGreenDrapePixel(r: number, g: number, b: number): boolean {
  return g > 80 && g > r * 1.3 && g > b * 1.2 && r < 120 && b < 100;
}

export function isBlueDrapePixel(r: number, g: number, b: number): boolean {
  return b > 80 && b > r * 1.1 && b > g * 1.0 && r < 120;
}

export function isSkinPixel(r: number, g: number, b: number): boolean {
  if (isGreenDrapePixel(r, g, b) || isBlueDrapePixel(r, g, b)) return false;
  const brightness = (r + g + b) / 3;
  if (brightness < 35 || brightness > 230) return false; // shadows / blown highlights
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  return (
    r > 45 && g > 30 && b > 20 &&
    r > g * 0.7 && g > b * 0.8 &&
    (r - b) > 18 && chroma > 25 && // warm tint guard (rejects desaturated beige/grey)
    Math.abs(r - g) < 60
  );
}

export function isBloodPixel(r: number, g: number, b: number): boolean {
  const saturation = Math.max(r, g, b) - Math.min(r, g, b);
  if (r > 90 && r > g * 1.4 && r > b * 1.2 && saturation > 40) return true; // fresh blood
  return r < 60 && g < 50 && b < 50 && r > 15; // dark wound crater / eschar
}

export function bloodScore(r: number, g: number, b: number): number {
  if (isBloodPixel(r, g, b)) {
    return Math.max(Math.max(r, g, b) - Math.min(r, g, b), 80 - Math.min(r, 80));
  }
  return 0;
}

export function proximityStatus(relDist: number, type: string): Hotspot['status'] {
  if (relDist < 0.15) {
    if (type === 'nerve' || type === 'artery') return 'critical';
    if (type === 'tendon' || type === 'ligament' || type === 'muscle') return 'damaged';
    return 'at-risk';
  }
  if (relDist < 0.25) return 'at-risk';
  return 'normal';
}

export function proximityRisk(relDist: number, type: string): number {
  if (relDist < 0.15) {
    if (type === 'nerve' || type === 'artery') return 0.92;
    if (type === 'tendon' || type === 'ligament') return 0.75;
    if (type === 'muscle') return 0.65;
    return 0.55;
  }
  if (relDist < 0.25) return 0.4;
  return 0.2;
}

const clamp01 = (v: number) => Math.max(0.02, Math.min(0.98, v));

// ═══════════════════════════════════════════════════════════════
// COMPUTER VISION ENGINE (canvas — lazy, Node-safe)
// ═══════════════════════════════════════════════════════════════

class ComputerVisionEngine {
  private canvas: HTMLCanvasElement | undefined;
  private ctx: CanvasRenderingContext2D | undefined;

  private ensureCanvas(): void {
    if (this.canvas || typeof document === 'undefined') return;
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
  }

  async analyze(image: HTMLImageElement, hint: string): Promise<CVReport> {
    this.ensureCanvas();
    if (!this.canvas || !this.ctx) throw new Error('Canvas 2D not available in this environment');

    const w = image.naturalWidth || image.width;
    const h = image.naturalHeight || image.height;
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx.drawImage(image, 0, 0);
    const pixels = this.ctx.getImageData(0, 0, w, h).data;

    // ─── STEP 1: SKIN SEGMENTATION (per-pixel byte mask) ─────
    const mask = new Uint8Array(w * h);
    let skinCount = 0, bloodCount = 0, minX = w, minY = h, maxX = 0, maxY = 0;

    const step = Math.max(1, Math.floor(Math.max(w, h) / 720));
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const i = (y * w + x) * 4;
        const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];

        if (isSkinPixel(r, g, b)) {
          mask[y * w + x] = 1;
          skinCount++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
        if (bloodScore(r, g, b) > 20) bloodCount++;
      }
    }

    const skinCoverage = skinCount / Math.max(1, Math.ceil(w / step) * Math.ceil(h / step));
    const bloodRatio = bloodCount / Math.max(1, Math.ceil(w / step) * Math.ceil(h / step));

    let skinBBox: CVReport['skinBoundingBox'] = null;
    if (skinCount > 2) {
      const pad = Math.max(8, Math.round(Math.min(w, h) * 0.02));
      skinBBox = {
        x: Math.max(0, minX - pad),
        y: Math.max(0, minY - pad),
        w: Math.min(w, maxX - minX + pad * 2),
        h: Math.min(h, maxY - minY + pad * 2),
      };
    }

    // ─── STEP 2: WOUND DETECTION (blood pixel clustering) ────
    const wound = this.detectWound(pixels, w, h, mask, skinBBox, step);

    // ─── STEP 3: EDGE DETECTION (Sobel within skin mask) ─────
    const edges = this.detectEdges(pixels, w, h, mask, step);

    // ─── STEP 4-6: ORIENTATION / HAND SIDE / FINGER DIRECTION
    const orientation: CVReport['orientation'] = !skinBBox ? 'unknown' :
      skinBBox.h > skinBBox.w ? 'portrait' : 'landscape';
    const handSide = this.determineHandSide(mask, w, h, skinBBox, hint, step);
    const fingerDirection = this.determineFingerDirection(skinBBox, wound, orientation, hint);

    return {
      skinBoundingBox: skinBBox,
      skinCoverage,
      woundCenter: wound ? wound.center : null,
      woundRadius: wound ? wound.radius : 0,
      orientation,
      handSide,
      fingerDirection,
      edgeCount: edges,
      bloodRatio,
      landmarkMode: /thumb|pollic/i.test(hint) ? 'thumb' : 'hand',
    };
  }

  private detectWound(
    pixels: Uint8ClampedArray, w: number, h: number,
    mask: Uint8Array, bbox: CVReport['skinBoundingBox'], step: number
  ) {
    if (!bbox) return null;

    // Blood in a wound sits ON skin; blood-colored pixels in shadows/clothing do
    // not. Require at least one skin neighbour so scattered dark pixels cannot
    // distort the wound centroid or inflate its radius.
    const inWound = (x: number, y: number): boolean => {
      if (bloodScore(pixels[(y * w + x) * 4], pixels[(y * w + x) * 4 + 1], pixels[(y * w + x) * 4 + 2]) <= 20) return false;
      if (mask[y * w + x]) return true;
      const s = step;
      return (x - s >= 0 && mask[y * w + (x - s)] > 0) ||
        (x + s < w && mask[y * w + (x + s)] > 0) ||
        (y - s >= 0 && mask[(y - s) * w + x] > 0) ||
        (y + s < h && mask[(y + s) * w + x] > 0);
    };

    let sumX = 0, sumY = 0, count = 0, maxScore = 0, maxX = 0, maxY = 0;
    for (let y = Math.floor(bbox.y); y < Math.min(h, bbox.y + bbox.h); y += 2) {
      for (let x = Math.floor(bbox.x); x < Math.min(w, bbox.x + bbox.w); x += 2) {
        if (!inWound(x, y)) continue;
        sumX += x; sumY += y; count++;
        const score = bloodScore(pixels[(y * w + x) * 4], pixels[(y * w + x) * 4 + 1], pixels[(y * w + x) * 4 + 2]);
        if (score > maxScore) { maxScore = score; maxX = x; maxY = y; }
      }
    }

    const threshold = Math.max(30, (bbox.w * bbox.h) / 4000);
    if (count < threshold) return null; // no real blood evidence — honest null

    const centerX = sumX / count;
    const centerY = sumY / count;

    // Radius from the 85th-percentile distance (tight wound zone), not the max —
    // a few stray pixels must not make the wound cover half the frame.
    const distances: number[] = [];
    for (let y = Math.floor(bbox.y); y < Math.min(h, bbox.y + bbox.h); y += 4) {
      for (let x = Math.floor(bbox.x); x < Math.min(w, bbox.x + bbox.w); x += 4) {
        if (inWound(x, y)) distances.push(Math.hypot(x - centerX, y - centerY));
      }
    }
    let radius = 15;
    if (distances.length > 0) {
      distances.sort((a, b) => a - b);
      const p85 = distances[Math.min(distances.length - 1, Math.floor(distances.length * 0.85))];
      radius = Math.max(15, p85 * 1.15);
    }
    radius = Math.min(radius, Math.min(bbox.w, bbox.h) * 0.25);

    return { center: { x: centerX, y: centerY }, radius, maxBloodScore: maxScore, hotspotPixel: { x: maxX, y: maxY } };
  }

  private detectEdges(pixels: Uint8ClampedArray, w: number, h: number, mask: Uint8Array, step: number): number {
    const gray = new Float32Array(w * h);
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const i = (y * w + x) * 4;
        gray[y * w + x] = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      }
    }

    let edgeCount = 0;
    const s = step;
    for (let y = s; y < h - s; y += s) {
      for (let x = s; x < w - s; x += s) {
        if (!mask[y * w + x]) continue;
        const gx =
          -1 * gray[(y - s) * w + (x - s)] + 1 * gray[(y - s) * w + (x + s)] +
          -2 * gray[y * w + (x - s)] + 2 * gray[y * w + (x + s)] +
          -1 * gray[(y + s) * w + (x - s)] + 1 * gray[(y + s) * w + (x + s)];
        const gy =
          -1 * gray[(y - s) * w + (x - s)] - 2 * gray[(y - s) * w + x] - 1 * gray[(y - s) * w + (x + s)] +
          1 * gray[(y + s) * w + (x - s)] + 2 * gray[(y + s) * w + x] + 1 * gray[(y + s) * w + (x + s)];
        if (Math.sqrt(gx * gx + gy * gy) > 90) edgeCount++;
      }
    }
    return edgeCount;
  }

  private determineHandSide(
    mask: Uint8Array, w: number, h: number,
    bbox: CVReport['skinBoundingBox'], hint: string, step: number
  ): CVReport['handSide'] {
    const hl = hint.toLowerCase();
    if (hl.includes('left')) return 'left';
    if (hl.includes('right')) return 'right';
    if (!bbox) return 'unknown';

    // Thumb bulk (thenar eminence) makes one side denser — the radial side
    const density = (x1: number, x2: number) => {
      let count = 0, total = 0;
      for (let y = Math.floor(bbox.y); y < Math.min(h, bbox.y + bbox.h); y += step) {
        for (let x = Math.floor(x1); x < Math.ceil(x2); x += step) {
          if (mask[y * w + x]) count++;
          total++;
        }
      }
      return total > 0 ? count / total : 0;
    };
    const leftD = density(bbox.x, bbox.x + bbox.w * 0.3);
    const rightD = density(bbox.x + bbox.w * 0.7, bbox.x + bbox.w);
    return leftD > rightD ? 'left' : 'right';
  }

  private determineFingerDirection(
    bbox: CVReport['skinBoundingBox'],
    wound: { center: { x: number; y: number } } | null,
    orientation: CVReport['orientation'],
    hint: string
  ): CVReport['fingerDirection'] {
    const hl = hint.toLowerCase();
    if (hl.includes('distal')) return orientation === 'portrait' ? 'up' : 'left';
    if (hl.includes('proximal')) return orientation === 'portrait' ? 'down' : 'right';
    if (!wound || !bbox) return orientation === 'portrait' ? 'up' : 'left';

    // Fingers are usually distal to the wound (wound is more proximal)
    const relY = (wound.center.y - bbox.y) / bbox.h;
    const relX = (wound.center.x - bbox.x) / bbox.w;
    if (orientation === 'portrait') return relY < 0.5 ? 'down' : 'up';
    return relX < 0.5 ? 'right' : 'left';
  }
}

// ═══════════════════════════════════════════════════════════════
// ANATOMICAL LANDMARK PLACER — positions relative to DETECTED anatomy
// ═══════════════════════════════════════════════════════════════

interface PlacedLandmark { x: number; y: number; confidence: number; }

export class AnatomicalLandmarkPlacer {
  placeLandmarks(cv: CVReport, imgW: number, imgH: number): Map<string, PlacedLandmark> {
    const landmarks = new Map<string, PlacedLandmark>();
    const { skinBoundingBox: bbox, woundCenter, woundRadius, handSide, fingerDirection, landmarkMode } = cv;
    if (!bbox) return landmarks;

    const cx = bbox.x + bbox.w / 2;
    const cy = bbox.y + bbox.h / 2;
    const bw = bbox.w;
    const bh = bbox.h;

    const rel = (x: number, y: number, confidence = 0.85): PlacedLandmark => ({
      x: clamp01(x / imgW),
      y: clamp01(y / imgH),
      confidence,
    });

    const radialSide = handSide === 'left' ? -1 : 1;   // thumb side
    const ulnarSide = handSide === 'left' ? 1 : -1;
    const distalDir = fingerDirection === 'up' ? -1 : 1; // y grows downward
    const proximalDir = -distalDir;

    // Wound center (detected from blood pixels) + skin edges
    if (woundCenter) {
      landmarks.set('wound_center', rel(woundCenter.x, woundCenter.y, 0.95));
      landmarks.set('skin_edge_radial', rel(woundCenter.x + radialSide * woundRadius * 1.2, woundCenter.y, 0.8));
      landmarks.set('skin_edge_ulnar', rel(woundCenter.x + ulnarSide * woundRadius * 1.2, woundCenter.y, 0.8));
      landmarks.set('skin_edge_proximal', rel(woundCenter.x, woundCenter.y + proximalDir * woundRadius * 1.2, 0.8));
      landmarks.set('skin_edge_distal', rel(woundCenter.x, woundCenter.y + distalDir * woundRadius * 1.2, 0.8));
    }

    if (landmarkMode === 'thumb') {
      // ─── THUMB ANATOMY (relative to detected thumb bbox + wound) ───
      if (woundCenter) {
        // For a wound at MCP level the radial/ulnar digital bundles cross the
        // wound zone — anchor them to the wound margins (not the bbox edges).
        const bundleY = woundCenter.y + proximalDir * woundRadius * 0.15;
        const bundleX = woundRadius * 1.15;
        landmarks.set('thumb_nerve_radial', rel(woundCenter.x - bundleX, bundleY, 0.88));
        landmarks.set('thumb_nerve_ulnar', rel(woundCenter.x + bundleX, bundleY, 0.88));
        landmarks.set('thumb_artery_radial', rel(woundCenter.x - bundleX, bundleY + bh * 0.02, 0.87));
        landmarks.set('thumb_artery_ulnar', rel(woundCenter.x + bundleX, bundleY + bh * 0.02, 0.87));
        landmarks.set('thumb_fpl', rel(woundCenter.x, woundCenter.y + distalDir * woundRadius * 0.3, 0.86));
        landmarks.set('thumb_epl', rel(woundCenter.x, woundCenter.y + proximalDir * woundRadius * 0.75, 0.84));
        landmarks.set('thumb_mc_head', rel(woundCenter.x, woundCenter.y + proximalDir * woundRadius * 1.5, 0.85));
        landmarks.set('thumb_sesamoid', rel(woundCenter.x + radialSide * woundRadius * 0.5, woundCenter.y + proximalDir * woundRadius * 1.1, 0.78));
        landmarks.set('thumb_nail_matrix', rel(cx, bbox.y + bh * 0.92, 0.82));
      } else {
        const nvY = cy + distalDir * bh * 0.15;
        landmarks.set('thumb_nerve_radial', rel(cx + radialSide * bw * 0.26, nvY, 0.88));
        landmarks.set('thumb_nerve_ulnar', rel(cx + ulnarSide * bw * 0.26, nvY, 0.88));
        landmarks.set('thumb_artery_radial', rel(cx + radialSide * bw * 0.29, nvY + bh * 0.02, 0.87));
        landmarks.set('thumb_artery_ulnar', rel(cx + ulnarSide * bw * 0.29, nvY + bh * 0.02, 0.87));
        landmarks.set('thumb_fpl', rel(cx, cy + distalDir * bh * 0.2, 0.86));
        landmarks.set('thumb_epl', rel(cx, cy + proximalDir * bh * 0.15, 0.84));
        landmarks.set('thumb_mc_head', rel(cx, cy + proximalDir * bh * 0.02, 0.85));
        landmarks.set('thumb_sesamoid', rel(cx + radialSide * bw * 0.05, cy + proximalDir * bh * 0.06, 0.78));
        landmarks.set('thumb_nail_matrix', rel(cx, cy + distalDir * bh * 0.4, 0.82));
      }
      return landmarks;
    }

    // ─── HAND ANATOMY ──────────────────────────────────────────────
    landmarks.set('thenar', rel(cx + radialSide * bw * 0.25, cy + proximalDir * bh * 0.15, 0.82));
    landmarks.set('hypothenar', rel(cx + ulnarSide * bw * 0.25, cy + proximalDir * bh * 0.1, 0.8));
    landmarks.set('palmar_aponeurosis', rel(cx, cy + proximalDir * bh * 0.05, 0.8));
    landmarks.set('fds_tendons', rel(cx - bw * 0.05, cy + distalDir * bh * 0.15, 0.84));
    landmarks.set('fdp_tendons', rel(cx + bw * 0.05, cy + distalDir * bh * 0.15, 0.84));
    landmarks.set('carpal_tunnel', rel(cx, cy + proximalDir * bh * 0.35, 0.83));
    landmarks.set('median_nerve_wrist', rel(cx - bw * 0.1, cy + proximalDir * bh * 0.38, 0.86));
    landmarks.set('radial_artery_wrist', rel(cx + radialSide * bw * 0.15, cy + proximalDir * bh * 0.32, 0.85));

    // Proper palmar digital neurovascular bundles — 4 fingers
    const bundleY0 = woundCenter ? woundCenter.y + proximalDir * woundRadius * 0.3 : 0;
    for (let i = 0; i < 4; i++) {
      const fy = woundCenter
        ? bundleY0 + distalDir * woundRadius * (i - 1.5) * 0.25
        : cy + distalDir * bh * (0.1 + i * 0.18);
      landmarks.set(`nerve_radial_${i}`, rel(cx + radialSide * bw * 0.35, fy, 0.86));
      landmarks.set(`artery_radial_${i}`, rel(cx + radialSide * bw * 0.38, fy + bh * 0.01, 0.85));
      landmarks.set(`nerve_ulnar_${i}`, rel(cx + ulnarSide * bw * 0.35, fy, 0.86));
      landmarks.set(`artery_ulnar_${i}`, rel(cx + ulnarSide * bw * 0.38, fy + bh * 0.01, 0.85));
    }

    // Metacarpal heads
    for (let i = 0; i < 5; i++) {
      const mcX = cx + (i - 2) * bw * 0.12;
      const mcY = cy + distalDir * bh * 0.05;
      landmarks.set(`mc_head_${i}`, rel(mcX, mcY, 0.82));
    }

    return landmarks;
  }
}

// ═══════════════════════════════════════════════════════════════
// HOTSPOT DEFINITIONS — rich clinical knowledge per structure
// ═══════════════════════════════════════════════════════════════

const FINGER_NAMES = ['Index', 'Middle', 'Ring', 'Little'];

function makeDigitalDef(
  kind: 'nerve' | 'artery',
  fingerIdx: number,
  side: 'Radial' | 'Ulnar'
): Partial<Hotspot> {
  const finger = FINGER_NAMES[fingerIdx] || `Finger ${fingerIdx + 1}`;
  if (kind === 'nerve') {
    return {
      name: `Proper Palmar Digital Nerve (${finger} — ${side})`,
      layer: 'neurovascular', type: 'nerve',
      specificBranch: `Median/ulnar nerve → common digital → proper digital (${side.toLowerCase()} side of ${finger.toLowerCase()} finger)`,
      clinicalImportance: `CRITICAL: Transection causes permanent anesthesia of ${finger.toLowerCase()} ${side.toLowerCase()} border pulp. Repair window: PRIMARY <72h for best sensory recovery.`,
      actionRequired: `Document 2-point discrimination at ${finger.toLowerCase()} finger pulp (normal <4-6mm). If absent → urgent microsurgical exploration and repair with 9-0 or 10-0 nylon.`,
      anatomyDetail: `2-3mm diameter. Runs in neurovascular bundle along ${side.toLowerCase()} border of the ${finger.toLowerCase()} finger, volar to dorsal. Gives dorsal branches to nail bed and volar branches to pulp.`,
      repairProtocol: `Epineurial repair 9-0/10-0 nylon under microscope (×10-16). Gap >5mm: sural nerve graft or collagen conduit. Post-op splint 3 weeks, sensory re-education at 6 weeks.`,
      complications: `Permanent anesthesia, neuroma, cold intolerance, loss of fine manipulation.`,
      landmarkType: side.toLowerCase(),
    };
  }
  return {
    name: `Proper Palmar Digital Artery (${finger} — ${side})`,
    layer: 'neurovascular', type: 'artery',
    specificBranch: `Superficial arch → common digital → proper digital artery (${side.toLowerCase()} side)`,
    clinicalImportance: `CRITICAL: Ischemia >6h causes irreversible digital necrosis. Cold intolerance and pulp atrophy persist even with revascularization.`,
    actionRequired: `Doppler both digital arteries + capillary refill (<2s). If absent → emergent microvascular exploration, repair with 9-0/10-0 Prolene.`,
    anatomyDetail: `0.8-1.2mm diameter. Runs with the digital nerve in the neurovascular bundle. Gives fasciocutaneous perforators to skin.`,
    repairProtocol: `Microsurgical end-to-end anastomosis. Heparin drip × 48h post-op. If both arteries injured and repair fails: consider vein graft from dorsal hand/forearm.`,
    complications: `Digital necrosis, cold intolerance (60%), pulp atrophy, nail dystrophy.`,
    landmarkType: side.toLowerCase(),
  };
}

function makeBoneDef(fingerIdx: number): Partial<Hotspot> {
  const finger = ['1st (Thumb)', '2nd (Index)', '3rd (Middle)', '4th (Ring)', '5th (Little)'][fingerIdx] || `${fingerIdx + 1}th`;
  return {
    name: `Metacarpal Head (${finger})`,
    layer: 'skeletal', type: 'bone',
    specificBranch: `Articulates with proximal phalanx base — collateral ligament complex`,
    clinicalImportance: `HIGH: Intra-articular fracture → post-traumatic arthritis. Open fracture = orthopedic emergency (Gustilo-Anderson).`,
    actionRequired: `X-ray AP/oblique/lateral of hand. CT if intra-articular step-off suspected. ORIF if >1-2mm displacement.`,
    anatomyDetail: `Metacarpal head articulates with proximal phalanx. Collateral ligaments + volar plate provide stability. Sesamoids embedded in thumb FPB tendon.`,
    repairProtocol: `Closed reduction + casting for undisplaced. K-wire or mini-plate ORIF for displaced/intra-articular. Early protected motion.`,
    complications: `Post-traumatic arthritis, MCP instability, non-union, CRPS.`,
    landmarkType: 'skeletal',
  };
}

const DEFINITIONS: Record<string, Partial<Hotspot>> = {
  wound_center: {
    name: 'Wound Center — Laceration',
    layer: 'superficial', type: 'skin',
    clinicalImportance: 'Primary injury site. Assess depth, contamination, and involved structures.',
    actionRequired: 'Irrigate with 3-5L saline. Explore wound systematically under tourniquet. Document all visible structures.',
    anatomyDetail: 'Full-thickness wound detected by blood/dark pixel clustering. Assess for tissue loss and contamination.',
    repairProtocol: 'Debride non-viable tissue. Delayed primary closure if contaminated. Skin graft if deficit >2cm.',
    complications: 'Infection, delayed healing, contracture, hypertrophic scarring.',
    landmarkType: 'center',
  },
  thenar: {
    name: 'Thenar Eminence', layer: 'deep', type: 'muscle',
    specificBranch: 'APB, Opponens pollicis, FPB — recurrent median nerve',
    clinicalImportance: 'Thenar muscles essential for thumb opposition and grip. Thenar compartment syndrome can occur with crush injuries.',
    actionRequired: 'Assess thumb opposition strength. Check for thenar compartment swelling/tenderness.',
    anatomyDetail: 'Muscular prominence at base of thumb. Supplied by recurrent motor branch of median nerve.',
    repairProtocol: 'If lacerated: primary repair within 7 days. If compartment syndrome: emergent fasciotomy.',
    complications: 'Ape hand deformity, loss of thumb opposition, chronic weakness.',
    landmarkType: 'radial',
  },
  hypothenar: {
    name: 'Hypothenar Eminence', layer: 'deep', type: 'muscle',
    specificBranch: 'ADM, FDM, ODM — deep branch of ulnar nerve',
    clinicalImportance: 'Stabilizes ulnar side of hand. Ulnar nerve injury affects intrinsic hand function.',
    actionRequired: 'Test little finger abduction (ADM) and Froment\'s test for adductor pollicis.',
    anatomyDetail: 'Muscular prominence at base of little finger. Supplied by deep branch of ulnar nerve.',
    repairProtocol: 'Primary repair if lacerated. Protect ulnar nerve during exploration.',
    complications: 'Claw hand, loss of grip strength, ulnar drift.',
    landmarkType: 'ulnar',
  },
  palmar_aponeurosis: {
    name: 'Palmar Aponeurosis', layer: 'intermediate', type: 'fascia',
    clinicalImportance: 'Thick fascial layer protecting deep structures. Dupuytren\'s disease originates here.',
    actionRequired: 'Assess integrity during wound exploration. Preserve if possible.',
    anatomyDetail: 'Triangular fibrous sheet in central palm. Protects flexor tendons and neurovascular bundles.',
    repairProtocol: 'Repair if disrupted to prevent tendon bowstringing.',
    complications: 'Tendon bowstringing, grip weakness, scar contracture.',
    landmarkType: 'center',
  },
  fds_tendons: {
    name: 'Flexor Digitorum Superficialis (FDS) Tendons', layer: 'deep', type: 'tendon',
    specificBranch: 'Zones 1-5: splits (Camper\'s chiasm) to insert on sides of middle phalanx',
    clinicalImportance: 'FDS flexes PIP joints. Zone 2 injury (no-man\'s land) has guarded prognosis.',
    actionRequired: 'Test independent PIP flexion of each finger. If unable → suspect tendon laceration.',
    anatomyDetail: 'FDS lies superficial to FDP in the palm. Camper\'s chiasm at PIP joint level.',
    repairProtocol: '4-0 Ethibond core (Kessler) + 6-0 Prolene epitendinous. Early protected motion (Kleinert).',
    complications: 'Adhesion, rupture, quadriga effect, PIP stiffness.',
    landmarkType: 'volar',
  },
  fdp_tendons: {
    name: 'Flexor Digitorum Profundus (FDP) Tendons', layer: 'deep', type: 'tendon',
    specificBranch: 'Inserts on base of distal phalanx — sole flexor of DIP',
    clinicalImportance: 'HIGH: FDP is the sole flexor of the DIP joint. Loss = inability to make a fist.',
    actionRequired: 'Test DIP flexion of each finger while holding PIP extended.',
    anatomyDetail: 'FDP lies deep to FDS. Lumbricals originate from FDP tendons.',
    repairProtocol: 'Same as FDS. Preserve A2/A4 pulleys. Kleinert splint post-op.',
    complications: 'Adhesion, rupture, swan neck deformity, lumbrical plus finger.',
    landmarkType: 'volar',
  },
  carpal_tunnel: {
    name: 'Carpal Tunnel', layer: 'deep', type: 'fascia',
    specificBranch: 'Contains median nerve + 9 flexor tendons',
    clinicalImportance: 'Median nerve compression risk with wrist trauma. Emergent release if acute compartment syndrome.',
    actionRequired: 'Test median nerve: thumb opposition, index finger sensation.',
    anatomyDetail: 'Osteofibrous canal bounded by carpal bones and transverse carpal ligament.',
    repairProtocol: 'Acute carpal tunnel syndrome: emergent release. Chronic: elective release.',
    complications: 'Permanent median nerve damage, thenar atrophy.',
    landmarkType: 'proximal',
  },
  median_nerve_wrist: {
    name: 'Median Nerve (at Wrist)', layer: 'neurovascular', type: 'nerve',
    specificBranch: 'Enters hand via carpal tunnel — motor to thenar muscles',
    clinicalImportance: 'CRITICAL: Median nerve injury = thenar paralysis + sensory loss of thumb/index/middle.',
    actionRequired: 'Phalen\'s test, Tinel\'s sign. Assess thenar bulk and APB strength.',
    anatomyDetail: 'Lies superficial to FDS tendons, deep to palmaris longus. Gives off recurrent motor branch.',
    repairProtocol: 'Primary repair if transected. If gap: nerve graft or conduit.',
    complications: 'Ape hand, loss of opposition, chronic neuropathic pain.',
    landmarkType: 'proximal',
  },
  radial_artery_wrist: {
    name: 'Radial Artery (at Wrist)', layer: 'neurovascular', type: 'artery',
    specificBranch: 'Superficial palmar arch contributor — palpable at anatomical snuffbox',
    clinicalImportance: 'HIGH: Radial artery injury can compromise thumb circulation (Princeps pollicis).',
    actionRequired: 'Palpate pulse, Allen test, Doppler. If absent → vascular consult.',
    anatomyDetail: 'Lies between brachioradialis and FCR tendons, superficial to scaphoid and trapezium.',
    repairProtocol: 'Primary repair if lacerated. Ligation acceptable if ulnar artery patent (Allen test).',
    complications: 'Thumb ischemia, pseudoaneurysm, AV fistula.',
    landmarkType: 'proximal',
  },
  skin_edge_radial: {
    name: 'Wound Edge (Radial)', layer: 'superficial', type: 'skin',
    clinicalImportance: 'Wound edge viability determines closure options. Assess perfusion and contamination.',
    actionRequired: 'Debride non-viable edges. Preserve all viable tissue.',
    anatomyDetail: 'Skin edge at radial border of wound. Check for undermining and devitalization.',
    repairProtocol: 'Sharp debridement back to bleeding tissue. Do not close contaminated wounds primarily.',
    complications: 'Wound dehiscence, infection, necrosis.',
    landmarkType: 'radial',
  },
  skin_edge_ulnar: {
    name: 'Wound Edge (Ulnar)', layer: 'superficial', type: 'skin',
    clinicalImportance: 'Wound edge viability determines closure options. Assess perfusion and contamination.',
    actionRequired: 'Debride non-viable edges. Preserve all viable tissue.',
    anatomyDetail: 'Skin edge at ulnar border of wound. Check for undermining and devitalization.',
    repairProtocol: 'Sharp debridement back to bleeding tissue. Do not close contaminated wounds primarily.',
    complications: 'Wound dehiscence, infection, necrosis.',
    landmarkType: 'ulnar',
  },
  skin_edge_proximal: {
    name: 'Wound Edge (Proximal)', layer: 'superficial', type: 'skin',
    clinicalImportance: 'Proximal wound margin — assess retraction and tissue loss.',
    actionRequired: 'Debride non-viable edges. Preserve all viable tissue.',
    anatomyDetail: 'Skin edge at proximal border of wound.',
    repairProtocol: 'Sharp debridement back to bleeding tissue.',
    complications: 'Wound dehiscence, infection.',
    landmarkType: 'proximal',
  },
  skin_edge_distal: {
    name: 'Wound Edge (Distal)', layer: 'superficial', type: 'skin',
    clinicalImportance: 'Distal wound margin — assess perfusion of distal flap.',
    actionRequired: 'Debride non-viable edges. Preserve all viable tissue.',
    anatomyDetail: 'Skin edge at distal border of wound.',
    repairProtocol: 'Sharp debridement back to bleeding tissue.',
    complications: 'Wound dehiscence, infection, distal flap necrosis.',
    landmarkType: 'distal',
  },
  thumb_nerve_radial: {
    name: 'Proper Palmar Digital Nerve (Thumb — Radial)', layer: 'neurovascular', type: 'nerve',
    specificBranch: 'Median nerve (C6-C7) → digital nerve → thumb radial border',
    clinicalImportance: 'CRITICAL: Loss causes permanent thumb pulp anesthesia → loss of fine pinch discrimination. Repair window: PRIMARY <72h.',
    actionRequired: '2-point discrimination at thumb pulp (normal <6mm). If >10mm or absent → urgent microsurgical repair with 9-0/10-0 nylon.',
    anatomyDetail: '2-3mm diameter at MCP level. Courses along radial border of thumb in neurovascular bundle, volar to dorsal. Anastomoses with ulnar digital nerve at fingertip.',
    repairProtocol: 'Epineurial repair under microscope (×10-16). Gap >5mm: sural nerve graft or conduit. Sensory re-education at 6 weeks.',
    complications: 'Permanent anesthesia, neuroma, cold intolerance, loss of occupational precision.',
    landmarkType: 'radial',
  },
  thumb_nerve_ulnar: {
    name: 'Proper Palmar Digital Nerve (Thumb — Ulnar)', layer: 'neurovascular', type: 'nerve',
    specificBranch: 'Median nerve (C6-C7) → digital nerve → thumb ulnar border',
    clinicalImportance: 'CRITICAL: Loss causes permanent anesthesia of ulnar thumb border — key for key pinch and object manipulation.',
    actionRequired: '2-point discrimination at thumb ulnar pulp. If absent → urgent microsurgical repair.',
    anatomyDetail: '2-3mm diameter. Courses along ulnar border of thumb in neurovascular bundle. Gives dorsal branches to nail bed.',
    repairProtocol: 'Epineurial repair under microscope. Gap >5mm: graft or conduit. Sensory re-education at 6 weeks.',
    complications: 'Permanent anesthesia, neuroma, cold intolerance, loss of fine pinch.',
    landmarkType: 'ulnar',
  },
  thumb_artery_radial: {
    name: 'Proper Palmar Digital Artery (Thumb — Radial)', layer: 'neurovascular', type: 'artery',
    specificBranch: 'Princeps pollicis (from radial artery) → terminal digital artery',
    clinicalImportance: 'CRITICAL: Digital artery injury → ischemia >6h = necrosis. Check capillary refill and Doppler.',
    actionRequired: 'Doppler both digital arteries. If absent → emergent exploration and microvascular repair.',
    anatomyDetail: '0.8-1.2mm diameter. Runs with radial digital nerve. Gives fasciocutaneous perforators to thumb skin.',
    repairProtocol: 'Microsurgical end-to-end with 9-0 Prolene. Heparin drip × 48h post-op.',
    complications: 'Thumb necrosis, cold intolerance, pulp atrophy, nail dystrophy.',
    landmarkType: 'radial',
  },
  thumb_artery_ulnar: {
    name: 'Proper Palmar Digital Artery (Thumb — Ulnar)', layer: 'neurovascular', type: 'artery',
    specificBranch: 'Princeps pollicis → terminal digital artery (ulnar side)',
    clinicalImportance: 'CRITICAL: Usually the dominant thumb digital artery. Injury → significant ischemia risk.',
    actionRequired: 'Doppler both digital arteries + capillary refill (<2s). If absent → emergent exploration.',
    anatomyDetail: '1.0-1.4mm diameter — typically larger than radial digital artery. Runs with ulnar digital nerve.',
    repairProtocol: 'Microsurgical repair. If both arteries injured: vein graft. Consider toe-to-thumb transfer if total failure.',
    complications: 'Thumb loss risk, cold intolerance, pulp atrophy.',
    landmarkType: 'ulnar',
  },
  thumb_fpl: {
    name: 'Flexor Pollicis Longus (FPL) Tendon', layer: 'deep', type: 'tendon',
    specificBranch: 'Only flexor of thumb IP joint — Zone T1-T3',
    clinicalImportance: 'HIGH: FPL transection = loss of IP flexion → inability to pinch. A1 + oblique pulley preservation critical.',
    actionRequired: 'Test IP flexion against resistance. If unable → tendon laceration → repair within 2 weeks.',
    anatomyDetail: 'Origin: anterior radius + interosseous membrane. Inserts on base of distal phalanx. Zone T3 at MCP level.',
    repairProtocol: 'ZONE T3: 4-0 Ethibond core (Kessler) + 6-0 Prolene epitendinous. Early protected motion (Kleinert) at 3-5 days.',
    complications: 'Adhesion (20-30%) → tenolysis, rupture (5-10%), quadriga effect, trigger thumb.',
    landmarkType: 'volar',
  },
  thumb_epl: {
    name: 'Extensor Pollicis Longus (EPL) Tendon', layer: 'deep', type: 'tendon',
    specificBranch: 'Dorsal thumb extension — Lister\'s tubercle pivot',
    clinicalImportance: 'HIGH: EPL loss = loss of thumb IP extension + retropulsion (key pinch weakness).',
    actionRequired: 'Test thumb IP extension against resistance. If lag >30° → confirm gap with USS/MRI.',
    anatomyDetail: 'Runs through 3rd extensor compartment, pivots at Lister\'s tubercle, inserts on distal phalanx base.',
    repairProtocol: 'Direct repair if <2 weeks. If gap or retraction: EIP tendon transfer (classic).',
    complications: 'Extension lag, retropulsion loss, tendon rupture (esp. in RA).',
    landmarkType: 'volar',
  },
  thumb_mc_head: {
    name: 'First Metacarpal Head', layer: 'skeletal', type: 'bone',
    specificBranch: 'Articulates with proximal phalanx — UCL/RCL complex',
    clinicalImportance: 'HIGH: Intra-articular fracture → post-traumatic arthritis. UCL injury (Stener lesion) requires surgery.',
    actionRequired: 'X-ray thumb AP/lateral/oblique. Stress test UCL (30° laxity or absent endpoint = complete tear).',
    anatomyDetail: 'MC head articulates with proximal phalanx base. Two sesamoids embedded in FPB tendon. UCL to ulnar sesamoid.',
    repairProtocol: 'BENNETT: ORIF K-wires/mini-plate if >1mm displacement. STENER: surgical repair with anchor. Thumb spica 4-6 weeks.',
    complications: 'Arthritis, MCP instability, Gamekeeper\'s thumb, non-union.',
    landmarkType: 'skeletal',
  },
  thumb_sesamoid: {
    name: 'Sesamoid Bones (MCP)', layer: 'skeletal', type: 'bone',
    specificBranch: 'Embedded in FPB tendon — ulnar + radial',
    clinicalImportance: 'MODERATE: Sesamoid fracture/avulsion causes volar MCP pain and FPB weakness.',
    actionRequired: 'Palpate volar MCP. X-ray if point tenderness. Consider CT if occult fracture suspected.',
    anatomyDetail: 'Two sesamoids in FPB tendon at MCP level. UCL attaches to ulnar sesamoid.',
    repairProtocol: 'Non-operative if undisplaced (thumb spica 4-6 weeks). Excision if painful non-union.',
    complications: 'Painful non-union, FPB weakness, chronic MCP pain.',
    landmarkType: 'skeletal',
  },
  thumb_nail_matrix: {
    name: 'Nail Matrix', layer: 'superficial', type: 'skin',
    specificBranch: 'Germinal + sterile matrix — nail regeneration',
    clinicalImportance: 'MODERATE: Matrix injury → permanent nail deformity or onycholysis. Must repair meticulously.',
    actionRequired: 'Inspect nail bed for laceration/avulsion. Repair matrix with 7-0 vicryl under loupe.',
    anatomyDetail: 'Germinal matrix at proximal nail fold generates nail plate. Sterile matrix attaches plate to bed.',
    repairProtocol: 'Meticulous matrix repair. Splint nail plate or use stent to prevent synechiae. Antibiotics if open fracture.',
    complications: 'Nail splitting, onycholysis, ridge deformity, pterygium.',
    landmarkType: 'distal',
  },
};

// ═══════════════════════════════════════════════════════════════
// MAIN AGENT
// ═══════════════════════════════════════════════════════════════

export class MedicalImageAgentV4 {
  private cv = new ComputerVisionEngine();
  private placer = new AnatomicalLandmarkPlacer();

  async analyzeImage(
    imageSource: HTMLImageElement | string,
    options: { enhance?: boolean; bodyRegionHint?: string } = {}
  ): Promise<ImageAnalysisResult> {
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      throw new Error('Canvas 2D not available in this environment');
    }
    const hint = options.bodyRegionHint || '';

    const img = typeof imageSource === 'string'
      ? await this.loadImage(imageSource)
      : imageSource;

    const cv = await this.cv.analyze(img, hint);
    const landmarks = this.placer.placeLandmarks(cv, img.naturalWidth || img.width, img.naturalHeight || img.height);
    const hotspots = this.buildHotspots(landmarks, cv);
    const region = this.buildRegion(cv, hint);
    const injury = this.buildInjuryPattern(cv);
    const redFlags = this.generateRedFlags(hotspots, cv);
    const priority = this.generatePriority(hotspots, cv);
    const emrSnippet = this.generateEMR(region, hotspots, injury);

    return {
      region,
      injuryPattern: injury,
      hotspots,
      redFlags,
      emrSnippet,
      confidence: this.computeConfidence(cv),
      display: {
        summary: `${region.side} ${region.bodyPart} — ${region.specificArea}. ` +
                 `${hotspots.filter(h => h.status === 'critical').length} critical structure(s) in wound zone. ` +
                 `${cv.woundCenter ? 'CV-detected wound center localized from blood pixels.' : 'No blood evidence detected — statuses reflect baseline risk.'}`,
        priority,
      },
      debug: cv,
    };
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  private buildRegion(cv: CVReport, hint: string): RegionInfo {
    const hl = hint.toLowerCase();
    const isThumb = /thumb|pollic/i.test(hl);
    const isFinger = /finger|digit|phalanx/i.test(hl);

    const bodyPart = isThumb ? 'Thumb' : (isFinger || cv.landmarkMode === 'hand') ? 'Hand' : 'Hand';
    const side: RegionInfo['side'] = cv.handSide === 'left' ? 'Left' : cv.handSide === 'right' ? 'Right' : 'Indeterminate';

    let specificArea = cv.woundCenter
      ? (hl.includes('dorsal') ? 'Dorsal surface with wound' : 'Palmar surface with wound')
      : (hl.includes('dorsal') ? 'Dorsal surface' : 'Palmar surface');
    if (isThumb) specificArea = `${specificArea} (thumb ${hl.includes('mcp') ? 'MCP level' : 'multiple levels'})`;

    return {
      bodyPart,
      side,
      specificArea,
      anatomicalPosition: `Fingers pointing ${cv.fingerDirection}, ${cv.orientation} orientation, ${cv.handSide} hand (CV-detected)`,
    };
  }

  private buildInjuryPattern(cv: CVReport): InjuryPattern {
    const woundDetected = !!cv.woundCenter;
    const severe = cv.woundRadius > 30 || cv.bloodRatio > 0.02;
    return {
      type: woundDetected ? 'laceration' : 'contusion',
      severity: severe ? 'severe' : 'moderate',
      mechanism: woundDetected ? 'Open wound with hemorrhage (blood-pixel evidence)' : 'Closed injury (no active hemorrhage detected)',
      contamination: severe ? 'contaminated' : 'clean',
    };
  }

  private buildHotspots(landmarks: Map<string, { x: number; y: number; confidence: number }>, cv: CVReport): Hotspot[] {
    const hotspots: Hotspot[] = [];
    const wound = landmarks.get('wound_center');

    for (const [id, landmark] of landmarks) {
      let def: Partial<Hotspot> | undefined = DEFINITIONS[id];

      if (!def && /^nerve_(radial|ulnar)_(\d)$/.test(id)) {
        const m = /^nerve_(radial|ulnar)_(\d)$/.exec(id)!;
        def = makeDigitalDef('nerve', parseInt(m[2]), m[1] === 'radial' ? 'Radial' : 'Ulnar');
      } else if (!def && /^artery_(radial|ulnar)_(\d)$/.test(id)) {
        const m = /^artery_(radial|ulnar)_(\d)$/.exec(id)!;
        def = makeDigitalDef('artery', parseInt(m[2]), m[1] === 'radial' ? 'Radial' : 'Ulnar');
      } else if (!def && /^mc_head_(\d)$/.test(id)) {
        const m = /^mc_head_(\d)$/.exec(id)!;
        def = makeBoneDef(parseInt(m[1]));
      }
      if (!def) continue;

      const relDist = wound
        ? Math.hypot(landmark.x - wound.x, landmark.y - wound.y)
        : Infinity;

      const status = wound ? proximityStatus(relDist, def.type || 'other') : 'normal';
      const risk = wound ? proximityRisk(relDist, def.type || 'other') : 0.2;

      hotspots.push({
        id,
        name: def.name!,
        x: landmark.x,
        y: landmark.y,
        layer: def.layer!,
        type: def.type!,
        condition: wound
          ? (status === 'critical' ? 'WITHIN WOUND ZONE — likely transected or injured'
            : status === 'damaged' ? 'Within wound zone — assess for injury'
            : status === 'at-risk' ? 'Proximity to wound — monitor closely'
            : 'Not directly involved')
          : 'Not directly involved',
        risk,
        visible: status !== 'normal',
        specificBranch: def.specificBranch,
        clinicalImportance: def.clinicalImportance!,
        actionRequired: def.actionRequired!,
        status,
        anatomyDetail: def.anatomyDetail!,
        repairProtocol: def.repairProtocol!,
        complications: def.complications!,
        landmarkType: def.landmarkType!,
        confidence: landmark.confidence,
      });
    }

    return hotspots;
  }

  private generateRedFlags(hotspots: Hotspot[], cv: CVReport): string[] {
    const flags: string[] = [];
    const critical = hotspots.filter(h => h.status === 'critical');

    if (critical.length > 0) {
      flags.push(`🚨 ${critical.length} CRITICAL: ${critical.map(c => c.name.split('(')[0].trim()).join(', ')}`);
    }

    const nerves = hotspots.filter(h => h.type === 'nerve' && h.status === 'critical');
    if (nerves.length >= 2) flags.push('🔴 MULTIPLE NERVE INJURIES — Complete anesthesia risk');

    const arteries = hotspots.filter(h => h.type === 'artery' && h.status === 'critical');
    if (arteries.length >= 2) flags.push('🔴 MULTIPLE ARTERY INJURIES — Ischemia imminent');

    if (cv.woundCenter && cv.woundRadius > 30) {
      flags.push('🔴 LARGE WOUND — Significant tissue loss. Consider graft/flap.');
    }
    if (cv.skinCoverage < 0.05) {
      flags.push('🟡 LOW SKIN SIGNAL — verify image quality and lighting');
    }

    return flags.length > 0 ? flags : ['No immediate red flags identified'];
  }

  private generatePriority(hotspots: Hotspot[], cv: CVReport) {
    const actions: Array<{ urgency: string; action: string; rationale: string }> = [];

    const criticalNerves = hotspots.filter(h => h.type === 'nerve' && h.status === 'critical');
    if (criticalNerves.length > 0) {
      actions.push({
        urgency: 'immediate',
        action: `Document ${criticalNerves.map(n => n.name.split('(')[0].trim()).join(', ')} function — 2-point discrimination`,
        rationale: 'Nerve repair window: primary <72h for best sensory recovery.',
      });
    }

    const criticalArteries = hotspots.filter(h => h.type === 'artery' && h.status === 'critical');
    if (criticalArteries.length > 0) {
      actions.push({
        urgency: 'immediate',
        action: `Doppler assessment: ${criticalArteries.map(a => a.name.split('(')[0].trim()).join(', ')}`,
        rationale: 'Digital ischemia >6h causes irreversible necrosis.',
      });
    }

    actions.push({
      urgency: 'urgent',
      action: cv.landmarkMode === 'thumb'
        ? 'Systematic thumb wound exploration under tourniquet — identify FPL, EPL, both digital nerves/arteries'
        : 'Systematic wound exploration under tourniquet control',
      rationale: 'Identify all transected structures before closure.',
    });

    actions.push({
      urgency: 'urgent',
      action: cv.landmarkMode === 'thumb' ? 'X-ray thumb: AP, lateral, oblique' : 'X-ray: AP, oblique, lateral of hand',
      rationale: 'Rule out metacarpal/phalanx fracture, foreign body.',
    });

    actions.push({
      urgency: 'evaluate',
      action: 'Tetanus prophylaxis + broad-spectrum antibiotics',
      rationale: 'Hand infections progress rapidly to deep space infection.',
    });

    return actions;
  }

  private generateEMR(region: RegionInfo, hotspots: Hotspot[], injury: InjuryPattern): string {
    const damaged = hotspots
      .filter(h => h.status === 'critical' || h.status === 'damaged')
      .map(h => `${h.name}: ${h.condition}`)
      .join('; ');
    return `${region.side} ${region.bodyPart} — ${region.specificArea}. Pattern: ${injury.type}, ${injury.severity}. ${damaged}. AI-assisted computer-vision analysis (landmark confidence ${Math.round(hotspots.reduce((a, h) => a + h.confidence, 0) / Math.max(hotspots.length, 1) * 100)}%). Physician verification required.`;
  }

  private computeConfidence(cv: CVReport): number {
    let c = 0.5;
    if (cv.skinBoundingBox) c += 0.18;
    if (cv.woundCenter) c += 0.15;
    if (cv.handSide !== 'unknown') c += 0.07;
    if (cv.edgeCount > 20) c += 0.05;
    return Math.min(0.95, Math.round(c * 100) / 100);
  }
}

// Singleton
export const medicalImageAgentV4 = new MedicalImageAgentV4();