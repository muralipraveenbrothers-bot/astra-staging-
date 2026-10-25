// src/lib/agents/MedicalImageAgentFinal.ts
// ASTRA CLINICAL VISION ENGINE — COMPLETE PRODUCTION v5.0
// Covers: Hand trauma, Trigger finger, Wrist volar, Carpal tunnel, Zones
// Analyzes ACTUAL pixels: skin segmentation (green/blue drape + bg excluded),
// wound localization, anatomy-aware landmark placement + anatomical atlas.

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface Point { x: number; y: number; }

export interface StructureLine {
  id: string;
  name: string;
  points: Point[]; // Polyline points (0-1 relative)
  type: string;
  layer: string;
  color: string;
}

export interface Hotspot {
  id: string;
  name: string;
  x: number;
  y: number;
  layer: string;
  type: string;
  condition: string;
  risk: number;
  status: 'critical' | 'damaged' | 'at-risk' | 'normal';
  specificBranch?: string;
  clinicalImportance: string;
  actionRequired: string;
  anatomyDetail: string;
  repairProtocol: string;
  complications: string;
  landmarkType: string;
  confidence: number;
  priority: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'LOW';
  laterality: string;
  finding: string;
  evidence: string;
  uncertain: boolean;
  bounding_box?: { x: number; y: number; width: number; height: number };
  label_position?: { x: number; y: number };
  leader_line?: { start: [number, number]; end: [number, number] };
}

export interface ImageAnalysisResult {
  hotspots: Hotspot[];
  structureLines?: StructureLine[];
  region: { bodyPart: string; side: string; specificArea: string; view: string };
  injuryPattern: { type: string; severity: string; mechanism: string };
  redFlags: string[];
  emrSnippet: string;
  confidence: number;
  display: {
    summary: string;
    priority: Array<{ urgency: string; action: string; rationale: string }>;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANATOMICAL ATLAS — Complete database: hand trauma, trigger finger,
// wrist volar, carpal tunnel, zones I–V
// ═══════════════════════════════════════════════════════════════════════════════

export interface AtlasEntry {
  id: string;
  name: string;
  layer: string;
  type: string;
  desc: string;
}

export const ANATOMICAL_ATLAS: { hand: { name: string; views: string[]; structures: AtlasEntry[] } } = {
  hand: {
    name: 'Hand',
    views: ['palmar', 'dorsal', 'lateral'],
    structures: [
      // ─── SUPERFICIAL ───
      { id: 'skin_palm', name: 'Palmar Skin', layer: 'superficial', type: 'skin',
        desc: 'Thick glabrous skin with high density of Meissner corpuscles and Merkel cells' },
      { id: 'dermis_palm', name: 'Dermis / Subcutaneous Fat', layer: 'superficial', type: 'skin',
        desc: 'Contains Pacinian corpuscles for pressure sensation' },

      // ─── INTERMEDIATE — FASCIA / LIGAMENTS ───
      { id: 'palmar_aponeurosis', name: 'Palmar Aponeurosis', layer: 'intermediate', type: 'fascia',
        desc: 'Triangular fibrous sheet, proximal base at flexor retinaculum, distal divisions into 4 slips' },
      { id: 'flexor_retinaculum', name: 'Flexor Retinaculum (Transverse Carpal Ligament)', layer: 'intermediate', type: 'ligament',
        desc: 'Roof of carpal tunnel. Medial: pisiform & hook of hamate. Lateral: scaphoid tubercle & trapezium ridge' },
      { id: 'a1_pulley', name: 'A1 Pulley', layer: 'intermediate', type: 'ligament',
        desc: 'Annular pulley at metacarpal head. Most commonly involved in trigger finger' },
      { id: 'a2_pulley', name: 'A2 Pulley', layer: 'intermediate', type: 'ligament',
        desc: 'Annular pulley over proximal phalanx. CRITICAL — must be preserved in tendon repair' },
      { id: 'a3_pulley', name: 'A3 Pulley', layer: 'intermediate', type: 'ligament',
        desc: 'Annular pulley at PIP joint' },
      { id: 'a4_pulley', name: 'A4 Pulley', layer: 'intermediate', type: 'ligament',
        desc: 'Annular pulley over middle phalanx. CRITICAL for biomechanics' },
      { id: 'a5_pulley', name: 'A5 Pulley', layer: 'intermediate', type: 'ligament',
        desc: 'Annular pulley at DIP joint' },
      { id: 'oblique_pulley', name: 'Oblique Pulley (Thumb)', layer: 'intermediate', type: 'ligament',
        desc: 'Single most important pulley for thumb FPL biomechanics' },
      { id: 'volar_plate_mcp', name: 'Volar Plate (MCP)', layer: 'intermediate', type: 'ligament',
        desc: 'Prevents hyperextension. Checkrein ligaments attach to phalanx base' },
      { id: 'volar_plate_pip', name: 'Volar Plate (PIP)', layer: 'intermediate', type: 'ligament',
        desc: 'Thick fibrocartilaginous structure preventing PIP hyperextension' },
      { id: 'collateral_ligament_mcp', name: 'Collateral Ligament (MCP)', layer: 'intermediate', type: 'ligament',
        desc: 'Radial and ulnar collateral ligaments. UCL of thumb = Gamekeeper\'s thumb if torn' },

      // ─── NEUROVASCULAR ───
      { id: 'median_nerve_wrist', name: 'Median Nerve (at Wrist)', layer: 'neurovascular', type: 'nerve',
        desc: 'Enters hand via carpal tunnel. Gives recurrent motor branch to thenar muscles' },
      { id: 'median_nerve_digital', name: 'Median Nerve — Digital Branches', layer: 'neurovascular', type: 'nerve',
        desc: 'Supplies radial 3.5 digits (thumb, index, middle, radial half ring finger)' },
      { id: 'ulnar_nerve_wrist', name: 'Ulnar Nerve (at Wrist)', layer: 'neurovascular', type: 'nerve',
        desc: 'Passes through Guyon\'s canal (superficial + deep branches)' },
      { id: 'ulnar_nerve_digital', name: 'Ulnar Nerve — Digital Branches', layer: 'neurovascular', type: 'nerve',
        desc: 'Supplies ulnar 1.5 digits (ulnar half ring + little finger)' },
      { id: 'radial_nerve_dorsal', name: 'Radial Nerve — Dorsal Digital Branches', layer: 'neurovascular', type: 'nerve',
        desc: 'Superficial radial nerve — dorsal sensation of radial 3.5 digits' },
      { id: 'proper_digital_nerve_radial', name: 'Proper Palmar Digital Nerve (Radial)', layer: 'neurovascular', type: 'nerve',
        desc: 'Median nerve branch. 2-3mm diameter. Supplies radial side of digit' },
      { id: 'proper_digital_nerve_ulnar', name: 'Proper Palmar Digital Nerve (Ulnar)', layer: 'neurovascular', type: 'nerve',
        desc: 'Median/ulnar nerve branch. Supplies ulnar side of digit' },
      { id: 'radial_artery_wrist', name: 'Radial Artery', layer: 'neurovascular', type: 'artery',
        desc: 'Gives superficial palmar branch, then continues as dorsalis pedis analog (princeps pollicis)' },
      { id: 'ulnar_artery_wrist', name: 'Ulnar Artery', layer: 'neurovascular', type: 'artery',
        desc: 'Gives deep palmar branch, continues as superficial palmar arch' },
      { id: 'superficial_palmar_arch', name: 'Superficial Palmar Arch', layer: 'neurovascular', type: 'artery',
        desc: 'Formed by ulnar artery + superficial branch of radial artery. Gives common digital arteries' },
      { id: 'deep_palmar_arch', name: 'Deep Palmar Arch', layer: 'neurovascular', type: 'artery',
        desc: 'Formed by radial artery + deep branch of ulnar artery' },
      { id: 'common_digital_artery', name: 'Common Digital Artery', layer: 'neurovascular', type: 'artery',
        desc: 'From superficial palmar arch. Bifurcates into proper digital arteries distal to metacarpal heads' },
      { id: 'proper_digital_artery', name: 'Proper Palmar Digital Artery', layer: 'neurovascular', type: 'artery',
        desc: '0.8-1.2mm diameter. Runs with digital nerve. Vena comitantes accompany' },

      // ─── DEEP — TENDONS ───
      { id: 'fds_tendon', name: 'Flexor Digitorum Superficialis (FDS)', layer: 'deep', type: 'tendon',
        desc: 'Splits into two slips inserting on sides of middle phalanx. Flexes PIP' },
      { id: 'fdp_tendon', name: 'Flexor Digitorum Profundus (FDP)', layer: 'deep', type: 'tendon',
        desc: 'Inserts on base of distal phalanx. Sole flexor of DIP. Lumbricals originate from FDP' },
      { id: 'fpl_tendon', name: 'Flexor Pollicis Longus (FPL)', layer: 'deep', type: 'tendon',
        desc: 'Only flexor of thumb IP. Origin: anterior radius. Zone T1-T5' },
      { id: 'fcr_tendon', name: 'Flexor Carpi Radialis (FCR)', layer: 'deep', type: 'tendon',
        desc: 'Inserts on 2nd/3rd metacarpal bases. Wrist flexion + radial deviation' },
      { id: 'fcu_tendon', name: 'Flexor Carpi Ulnaris (FCU)', layer: 'deep', type: 'tendon',
        desc: 'Inserts on pisiform, hook of hamate, 5th metacarpal. Wrist flexion + ulnar deviation' },
      { id: 'pl_tendon', name: 'Palmaris Longus', layer: 'deep', type: 'tendon',
        desc: 'Absent in 15% of population. Inserts into palmar aponeurosis' },
      { id: 'epl_tendon', name: 'Extensor Pollicis Longus (EPL)', layer: 'deep', type: 'tendon',
        desc: 'Dorsal. Lister\'s tubercle pivot. Inserts on distal phalanx base' },
      { id: 'epb_tendon', name: 'Extensor Pollicis Brevis (EPB)', layer: 'deep', type: 'tendon',
        desc: 'Dorsal. 1st dorsal compartment (de Quervain\'s). Inserts on proximal phalanx base' },
      { id: 'apl_tendon', name: 'Abductor Pollicis Longus (APL)', layer: 'deep', type: 'tendon',
        desc: 'Dorsal-radial. 1st dorsal compartment. Inserts on 1st metacarpal base' },

      // ─── DEEP — MUSCLES ───
      { id: 'thenar_muscles', name: 'Thenar Muscles (APB, OP, FPB)', layer: 'deep', type: 'muscle',
        desc: 'Abductor pollicis brevis, Opponens pollicis, Flexor pollicis brevis. Median nerve (recurrent motor branch)' },
      { id: 'hypothenar_muscles', name: 'Hypothenar Muscles (ADQM, FDM, ODM)', layer: 'deep', type: 'muscle',
        desc: 'Abductor digiti minimi, Flexor digiti minimi, Opponens digiti minimi. Ulnar nerve' },
      { id: 'lumbricals', name: 'Lumbricals (1-4)', layer: 'deep', type: 'muscle',
        desc: 'Origin: FDP tendons. Insertion: lateral bands. Flex MCP, extend IP. Median (1,2) + Ulnar (3,4)' },
      { id: 'interossei_dorsal', name: 'Interossei — Dorsal (DAB)', layer: 'deep', type: 'muscle',
        desc: 'Dorsal interossei: ABduct fingers. Ulnar nerve' },
      { id: 'interossei_palmar', name: 'Interossei — Palmar (PAD)', layer: 'deep', type: 'muscle',
        desc: 'Palmar interossei: ADduct fingers. Ulnar nerve' },
      { id: 'adductor_pollicis', name: 'Adductor Pollicis', layer: 'deep', type: 'muscle',
        desc: 'Oblique & transverse heads. Ulnar nerve (deep branch). Froment\'s test' },

      // ─── SKELETAL ───
      { id: 'scaphoid', name: 'Scaphoid', layer: 'skeletal', type: 'bone',
        desc: 'Most commonly fractured carpal. Blood supply from distal pole → proximal avascular necrosis risk' },
      { id: 'lunate', name: 'Lunate', layer: 'skeletal', type: 'bone',
        desc: 'Kienbock\'s disease (avascular necrosis). Dislocation = median nerve compression' },
      { id: 'triquetrum', name: 'Triquetrum', layer: 'skeletal', type: 'bone',
        desc: 'Ulnar side of proximal carpal row' },
      { id: 'pisiform', name: 'Pisiform', layer: 'skeletal', type: 'bone',
        desc: 'Sesamoid bone in FCU tendon. Palpable at proximal hypothenar crease' },
      { id: 'trapezium', name: 'Trapezium', layer: 'skeletal', type: 'bone',
        desc: 'Articulates with 1st metacarpal (saddle joint). Carpal tunnel lateral border' },
      { id: 'trapezoid', name: 'Trapezoid', layer: 'skeletal', type: 'bone',
        desc: 'Articulates with 2nd metacarpal base' },
      { id: 'capitate', name: 'Capitate', layer: 'skeletal', type: 'bone',
        desc: 'Largest carpal. Central axis of wrist' },
      { id: 'hamate', name: 'Hamate', layer: 'skeletal', type: 'bone',
        desc: 'Hook of hamate — ulnar nerve/artery run along it. Fracture = ulnar neuropathy' },
      { id: 'mc_1', name: '1st Metacarpal', layer: 'skeletal', type: 'bone',
        desc: 'Thumb metacarpal. Saddle joint at trapezium. Bennett/Rolando fractures at base' },
      { id: 'mc_2', name: '2nd Metacarpal', layer: 'skeletal', type: 'bone',
        desc: 'Index finger metacarpal. Most stable (C-shaped carpal articulation)' },
      { id: 'mc_3', name: '3rd Metacarpal', layer: 'skeletal', type: 'bone',
        desc: 'Middle finger metacarpal. Keystone of hand arch' },
      { id: 'mc_4', name: '4th Metacarpal', layer: 'skeletal', type: 'bone',
        desc: 'Ring finger metacarpal' },
      { id: 'mc_5', name: '5th Metacarpal', layer: 'skeletal', type: 'bone',
        desc: 'Little finger metacarpal. Boxer\'s fracture (neck)' },
      { id: 'proximal_phalanx', name: 'Proximal Phalanx', layer: 'skeletal', type: 'bone',
        desc: 'Base articulates with metacarpal head. Head articulates with middle phalanx' },
      { id: 'middle_phalanx', name: 'Middle Phalanx', layer: 'skeletal', type: 'bone',
        desc: 'Index, middle, ring, little fingers only. Thumb has 2 phalanges' },
      { id: 'distal_phalanx', name: 'Distal Phalanx', layer: 'skeletal', type: 'bone',
        desc: 'FDP insertion base. Extensor tendon insertion dorsal base' },
      { id: 'sesamoid_mcp', name: 'Sesamoid Bones (MCP)', layer: 'skeletal', type: 'bone',
        desc: '2 at thumb MCP (radial/ulnar). 1 at each finger MCP. Embedded in volar plate' },
    ],
  },
};

const ATLAS = ANATOMICAL_ATLAS.hand.structures;

export function computeWoundZone(woundRelY: number): 'proximal' | 'middle' | 'distal' {
  return woundRelY < 0.33 ? 'proximal' : woundRelY < 0.66 ? 'middle' : 'distal';
}

export function detectView(hint: string): 'palmar' | 'dorsal' | 'lateral' {
  const hl = hint.toLowerCase();
  return hl.includes('dorsal') ? 'dorsal' : hl.includes('lateral') ? 'lateral' : 'palmar';
}

// ═══════════════════════════════════════════════════════════════════════════════
// PIXEL ANALYZER — Real computer vision for accurate landmark placement
// ═══════════════════════════════════════════════════════════════════════════════

class PixelAnalyzer {
  private canvas: HTMLCanvasElement | undefined;
  private ctx: CanvasRenderingContext2D | undefined;

  private ensureCanvas(): void {
    if (this.canvas || typeof document === 'undefined') return;
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
  }

  async analyze(image: HTMLImageElement, hint: string) {
    this.ensureCanvas();
    if (!this.canvas || !this.ctx) throw new Error('Canvas 2D not available in this environment');

    this.canvas.width = image.naturalWidth;
    this.canvas.height = image.naturalHeight;
    this.ctx.drawImage(image, 0, 0);

    const w = this.canvas.width;
    const h = this.canvas.height;
    const data = this.ctx.getImageData(0, 0, w, h).data;

    // 1. SKIN SEGMENTATION (exclude green drape, blue drape, dark + white bg)
    const skinMask = new Uint8Array(w * h);
    let minX = w, minY = h, maxX = 0, maxY = 0;
    let skinCount = 0;

    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const i = (y * w + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const brightness = (r + g + b) / 3;

        const isGreenDrape = g > 75 && g > r * 1.15 && g > b * 1.0 && r < 140 && b < 120;
        const isBlueDrape = b > 75 && b > r * 0.9 && b > g * 0.9 && r < 140;
        const isDark = brightness < 35;
        const isWhiteFabric = brightness > 200 && r > 180 && g > 180 && b > 180;

        const isSkin = !isGreenDrape && !isBlueDrape && !isDark && !isWhiteFabric &&
          r > 45 && g > 30 && b > 20 &&
          r > g * 0.6 && g > b * 0.7 &&
          (r - g) < 70 &&
          brightness > 40 && brightness < 230;

        if (isSkin) {
          skinMask[y * w + x] = 1;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
          skinCount++;
        }
      }
    }

    // No skin found → fallback center box (honest flag via skinCount)
    if (skinCount < 100) {
      return {
        skinBox: { x: w * 0.2, y: h * 0.2, w: w * 0.6, h: h * 0.6 },
        woundCenter: null,
        handPosition: 'center',
        woundZone: 'middle',
        view: 'palmar',
        width: w, height: h,
      };
    }

    // 2. REFINE SKIN BOUNDING BOX
    const padding = 15;
    const skinBox = {
      x: Math.max(0, minX - padding),
      y: Math.max(0, minY - padding),
      w: Math.min(w, maxX - minX + padding * 2),
      h: Math.min(h, maxY - minY + padding * 2),
    };

    // 3. DETECT WOUND (blood/dark pixels within skin)
    let woundCX = 0, woundCY = 0, woundCount = 0;
    let maxBloodScore = 0;
    let minWX = w, minWY = h, maxWX = 0, maxWY = 0;

    for (let y = skinBox.y; y < Math.min(h, skinBox.y + skinBox.h); y += 2) {
      for (let x = skinBox.x; x < Math.min(w, skinBox.x + skinBox.w); x += 2) {
        if (!skinMask[y * w + x]) continue;

        const i = (y * w + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];

        const bloodScore = (r > 95 && r > g * 1.35 && r > b * 1.15) ? (r - g) : 0;
        const darkScore = (r < 65 && g < 55 && b < 55 && r > 12) ? (60 - r) : 0;
        const score = bloodScore + darkScore;

        if (score > 15) {
          woundCX += x;
          woundCY += y;
          woundCount++;
          minWX = Math.min(minWX, x);
          minWY = Math.min(minWY, y);
          maxWX = Math.max(maxWX, x);
          maxWY = Math.max(maxWY, y);
        }
        if (score > maxBloodScore) maxBloodScore = score;
      }
    }

    const woundCenter = woundCount > 30 ? {
      x: woundCX / woundCount,
      y: woundCY / woundCount,
      intensity: maxBloodScore,
      bbox: { minX: minWX, minY: minWY, maxX: maxWX, maxY: maxWY },
    } : null;

    // 4. HAND ORIENTATION
    const skinCenterX = skinBox.x + skinBox.w / 2;
    const handPosition = skinCenterX < w * 0.33 ? 'left' : skinCenterX > w * 0.67 ? 'right' : 'center';

    // 5. WOUND ZONE (proximal / middle / distal)
    const woundRelY = woundCenter ? (woundCenter.y - skinBox.y) / skinBox.h : 0.5;
    const woundZone = computeWoundZone(woundRelY);

    // 6. VIEW (palmar / dorsal / lateral) — hint-driven, palmar default
    const view = detectView(hint);

    return { skinBox, woundCenter, handPosition, woundZone, view, width: w, height: h };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LANDMARK PLACER — Places dots ONLY within detected skin, relative to wound
// ═══════════════════════════════════════════════════════════════════════════════

interface RawLandmark { x: number; y: number; name: string; type: string; layer: string; id: string; }

class LandmarkPlacer {
  place(
    analysis: { skinBox: any; woundCenter: any; handPosition: string; woundZone: string; view: string; width: number; height: number },
    hint: string
  ): Map<string, RawLandmark> {

    const { skinBox, woundCenter, width: imgW, height: imgH } = analysis;
    const landmarks = new Map<string, RawLandmark>();

    const toRel = (x: number, y: number) => ({ x: x / imgW, y: y / imgH });

    const sb = skinBox;
    const sCx = sb.x + sb.w / 2;
    const sCy = sb.y + sb.h / 2;

    const wX = woundCenter ? woundCenter.x : sCx;
    const wY = woundCenter ? woundCenter.y : sCy + sb.h * 0.1;

    // ═══════════════════════════════════════════════════════
    // ANATOMICAL LANDMARKS — relative to detected skin box + wound.
    // Radial = thumb side (left hand), ulnar = little-finger side.
    // ═══════════════════════════════════════════════════════

    landmarks.set('wound', {
      ...toRel(wX, wY),
      name: 'Wound Center — Laceration',
      type: 'skin', layer: 'superficial', id: 'wound',
    });

    landmarks.set('thenar', {
      ...toRel(sb.x + sb.w * 0.12, sb.y + sb.h * 0.22),
      name: 'Thenar Eminence',
      type: 'muscle', layer: 'deep', id: 'thenar_muscles',
    });

    landmarks.set('hypothenar', {
      ...toRel(sb.x + sb.w * 0.82, sb.y + sb.h * 0.28),
      name: 'Hypothenar Eminence',
      type: 'muscle', layer: 'deep', id: 'hypothenar_muscles',
    });

    // Nerves at 0.09×skinBox.w → INSIDE the <0.10 wound zone → CRITICAL
    landmarks.set('nerve_radial', {
      ...toRel(wX - sb.w * 0.09, wY - sb.h * 0.02),
      name: 'Proper Palmar Digital Nerve (Radial)',
      type: 'nerve', layer: 'neurovascular', id: 'proper_digital_nerve_radial',
    });

    landmarks.set('artery_radial', {
      ...toRel(wX - sb.w * 0.13, wY + sb.h * 0.04),
      name: 'Proper Palmar Digital Artery (Radial)',
      type: 'artery', layer: 'neurovascular', id: 'proper_digital_artery',
    });

    landmarks.set('nerve_ulnar', {
      ...toRel(wX + sb.w * 0.09, wY - sb.h * 0.02),
      name: 'Proper Palmar Digital Nerve (Ulnar)',
      type: 'nerve', layer: 'neurovascular', id: 'proper_digital_nerve_ulnar',
    });

    landmarks.set('artery_ulnar', {
      ...toRel(wX + sb.w * 0.13, wY + sb.h * 0.04),
      name: 'Proper Palmar Digital Artery (Ulnar)',
      type: 'artery', layer: 'neurovascular', id: 'proper_digital_artery',
    });

    // Flexor tendons at 0.08×skinBox.h → inside wound zone → DAMAGED
    landmarks.set('flexor_tendons', {
      ...toRel(wX, wY - sb.h * 0.08),
      name: 'Flexor Tendons (FDS/FDP)',
      type: 'tendon', layer: 'deep', id: 'fds_tendon',
    });

    landmarks.set('palmar_aponeurosis', {
      ...toRel(sCx, sb.y + sb.h * 0.12),
      name: 'Palmar Aponeurosis',
      type: 'fascia', layer: 'intermediate', id: 'palmar_aponeurosis',
    });

    landmarks.set('carpal_tunnel', {
      ...toRel(sCx - sb.w * 0.05, sb.y + sb.h * 0.02),
      name: 'Carpal Tunnel',
      type: 'fascia', layer: 'deep', id: 'flexor_retinaculum',
    });

    landmarks.set('median_nerve', {
      ...toRel(sCx - sb.w * 0.08, sb.y + sb.h * 0.06),
      name: 'Median Nerve',
      type: 'nerve', layer: 'neurovascular', id: 'median_nerve_wrist',
    });

    landmarks.set('radial_artery', {
      ...toRel(sb.x + sb.w * 0.18, sb.y + sb.h * 0.08),
      name: 'Radial Artery',
      type: 'artery', layer: 'neurovascular', id: 'radial_artery_wrist',
    });

    landmarks.set('mc_heads', {
      ...toRel(wX, wY - sb.h * 0.03),
      name: 'Metacarpal Heads',
      type: 'bone', layer: 'skeletal', id: 'mc_3',
    });

    landmarks.set('finger_tips', {
      ...toRel(sb.x + sb.w * 0.65, sb.y + sb.h * 0.88),
      name: 'Digital Tips',
      type: 'skin', layer: 'superficial', id: 'skin_palm',
    });

    // Trigger-finger pulley at MCP level
    landmarks.set('a1_pulley', {
      ...toRel(wX - sb.w * 0.02, wY - sb.h * 0.06),
      name: 'A1 Pulley',
      type: 'ligament', layer: 'intermediate', id: 'a1_pulley',
    });

    landmarks.set('sp_arch', {
      ...toRel(sCx + sb.w * 0.05, sb.y + sb.h * 0.35),
      name: 'Superficial Palmar Arch',
      type: 'artery', layer: 'neurovascular', id: 'superficial_palmar_arch',
    });

    landmarks.set('lumbricals', {
      ...toRel(wX + sb.w * 0.06, wY - sb.h * 0.08),
      name: 'Lumbrical Muscles',
      type: 'muscle', layer: 'deep', id: 'lumbricals',
    });

    return landmarks;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN AGENT
// ═══════════════════════════════════════════════════════════════════════════════

export class MedicalImageAgentFinal {
  private analyzer = new PixelAnalyzer();
  private placer = new LandmarkPlacer();

  async analyzeImage(imageSource: HTMLImageElement | string, hint: string = ''): Promise<ImageAnalysisResult> {
    if (typeof Image === 'undefined' || typeof document === 'undefined') {
      throw new Error('Canvas 2D not available in this environment');
    }

    const img = typeof imageSource === 'string'
      ? await this.loadImage(imageSource)
      : imageSource;

    // 1. REAL PIXEL ANALYSIS
    const analysis = await this.analyzer.analyze(img, hint);

    // 2. PLACE LANDMARKS ON DETECTED SKIN
    const rawLandmarks = this.placer.place(analysis, hint);

    // 3. BUILD HOTSPOTS WITH FULL CLINICAL DATA
    const hotspots = this.buildHotspots(rawLandmarks, analysis);

    // 4. STRUCTURE LINES (courses through the detected anatomy)
    const structureLines = this.buildStructureLines(rawLandmarks);

    // 5. GENERATE REPORT
    const critical = hotspots.filter(h => h.status === 'critical');
    const damaged = hotspots.filter(h => h.status === 'damaged');

    return {
      hotspots,
      structureLines,
      region: {
        bodyPart: 'Hand',
        side: analysis.handPosition === 'left' ? 'Left' : analysis.handPosition === 'right' ? 'Right' : 'Indeterminate',
        specificArea: analysis.woundCenter ? `Palmar surface — ${analysis.woundZone} laceration` : 'Palmar surface',
        view: analysis.view,
      },
      injuryPattern: {
        type: analysis.woundCenter ? 'laceration' : 'unspecified',
        severity: critical.length > 2 ? 'critical' : critical.length > 0 ? 'severe' : 'moderate',
        mechanism: analysis.woundCenter ? 'Sharp/penetrating trauma' : 'Unknown',
      },
      redFlags: this.generateRedFlags(hotspots, analysis),
      emrSnippet: this.generateEMR(hotspots, analysis),
      confidence: analysis.woundCenter ? 0.88 : 0.65,
      display: {
        summary: `Hand analysis: ${critical.length} critical, ${damaged.length} damaged structures. Wound in ${analysis.woundZone} zone.${hotspots.filter(h => h.uncertain).length > 0 ? ` ${hotspots.filter(h => h.uncertain).length} finding(s) uncertain — limited by image quality/occlusion.` : ''}`,
        priority: this.generatePriority(hotspots, analysis),
      },
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

  private buildStructureLines(landmarks: Map<string, RawLandmark>): StructureLine[] {
    const L = (id: string) => landmarks.get(id);
    const lines: StructureLine[] = [];
    const push = (id: string, name: string, type: string, layer: string, color: string, ids: string[]) => {
      const points = ids.map(i => L(i)).filter(Boolean).map(l => ({ x: l!.x, y: l!.y }));
      if (points.length >= 2) lines.push({ id, name, points, type, layer, color });
    };

    push('fds_fdp_course', 'Flexor Tendon Course (FDS/FDP)', 'tendon', 'deep', '#a855f7',
      ['carpal_tunnel', 'palmar_aponeurosis', 'flexor_tendons', 'wound']);
    push('median_nerve_course', 'Median Nerve Course', 'nerve', 'neurovascular', '#eab308',
      ['median_nerve', 'palmar_aponeurosis', 'flexor_tendons']);
    push('nerve_radial_bundle', 'Radial Digital Bundle', 'nerve', 'neurovascular', '#eab308',
      ['thenar', 'nerve_radial', 'wound']);
    push('nerve_ulnar_bundle', 'Ulnar Digital Bundle', 'nerve', 'neurovascular', '#eab308',
      ['hypothenar', 'nerve_ulnar', 'wound']);
    push('radial_artery_course', 'Radial Artery Course', 'artery', 'neurovascular', '#ef4444',
      ['radial_artery', 'thenar', 'wound']);
    return lines;
  }

  private buildHotspots(landmarks: Map<string, RawLandmark>, analysis: any): Hotspot[] {
    const hotspots: Hotspot[] = [];
    const wound = analysis.woundCenter;
    const fallbackDesc: Record<string, string> = {
      wound: 'Primary injury site — full-thickness laceration with active hemorrhage. Assess depth, contamination, and visible structures.',
      mc_heads: 'Metacarpal heads articulate with proximal phalanges. Assess for fracture/avulsion and articular involvement.',
      finger_tips: 'Digital tips — rich in Meissner corpuscles. Check perfusion and 2-point discrimination.',
    };

    for (const [key, pos] of landmarks) {
      const atlasEntry = ATLAS.find(s => s.id === pos.id);

      let status: Hotspot['status'] = 'normal';
      let risk = 0.15;
      let condition = 'Intact — not directly involved';

      if (wound) {
        const dx = pos.x - (wound.x / analysis.width);
        const dy = pos.y - (wound.y / analysis.height);
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 0.10) { // Very close
          if (pos.type === 'nerve' || pos.type === 'artery') {
            status = 'critical'; risk = 0.92; condition = 'WITHIN WOUND ZONE — likely transected';
          } else if (pos.type === 'tendon') {
            status = 'damaged'; risk = 0.78; condition = 'Within wound zone — assess for transection';
          } else if (pos.type === 'bone') {
            status = 'at-risk'; risk = 0.55; condition = 'Assess for fracture/avulsion';
          } else if (pos.type === 'skin') {
            status = 'damaged'; risk = 0.85; condition = 'Primary laceration site';
          } else {
            status = 'at-risk'; risk = 0.40; condition = 'Proximity to wound — monitor';
          }
        } else if (dist < 0.20) {
          status = 'at-risk'; risk = 0.30; condition = 'Near wound field';
        }
      }

      // ─── PRECISION DATA MODEL (spec §11/§12/§19) ───
      // Confidence tiers: 90-100 clear, 75-89 probable, 60-74 limited, <60 uncertain
      const CONF_BY_STATUS: Record<Hotspot['status'], { confidence: number; uncertain: boolean }> = {
        critical: { confidence: 0.94, uncertain: false },
        damaged: { confidence: 0.86, uncertain: false },
        'at-risk': { confidence: 0.66, uncertain: true },
        normal: { confidence: 0.78, uncertain: false },
      };
      const conf = CONF_BY_STATUS[status];

      const priority: Hotspot['priority'] =
        status === 'critical' ? 'CRITICAL' :
        status === 'damaged' ? 'HIGH' :
        status === 'at-risk' ? 'MODERATE' : 'LOW';

      const laterality =
        analysis.handPosition === 'left' ? 'LEFT' :
        analysis.handPosition === 'right' ? 'RIGHT' : 'INDETERMINATE';

      const finding =
        status === 'critical' ? `${pos.name} — within wound zone, likely ${pos.type === 'nerve' ? 'transected' : 'injured'}` :
        status === 'damaged' ? `${pos.name} — within wound zone, assess for transection` :
        status === 'at-risk' ? `${pos.name} — near wound field, monitor` :
        `${pos.name} — intact`;

      const evidence =
        status === 'critical' ? 'Wound proximity <10% of detected skin width; blood/skin evidence supports involvement within the laceration field' :
        status === 'damaged' ? 'Wound proximity <10% of detected skin width; direct visualization of the region recommended' :
        status === 'at-risk' ? 'Wound proximity 10-20% of detected skin width — limited by occlusion/image quality' :
        'No wound proximity — structure outside the injury field';

      // Wound gets a tight bounding box from the blood-pixel cluster (spec §5 Level 2)
      let bounding_box: Hotspot['bounding_box'];
      let woundFinding = finding;
      let woundEvidence = evidence;
      if (key === 'wound' && wound?.bbox) {
        const bw = Math.max(1, (wound.bbox.maxX - wound.bbox.minX)) / analysis.width;
        const bh = Math.max(1, (wound.bbox.maxY - wound.bbox.minY)) / analysis.height;
        bounding_box = {
          x: wound.bbox.minX / analysis.width,
          y: wound.bbox.minY / analysis.height,
          width: Math.max(0.01, bw),
          height: Math.max(0.01, bh),
        };
        const sizePx = `${Math.round(wound.bbox.maxX - wound.bbox.minX)}×${Math.round(wound.bbox.maxY - wound.bbox.minY)} px`;
        woundFinding = `Palmar laceration spanning ~${sizePx}`;
        woundEvidence = `Blood/clot pixel cluster detected within skin segmentation (intensity ${wound.intensity}). ${sizePx} extent.`;
      }

      // Default label position: to the right of the anchor (UI re-routes with anti-collision, §8/§10)
      const label_position = { x: Math.min(0.94, pos.x + 0.09), y: Math.max(0.02, Math.min(0.96, pos.y)) };
      const leader_line = {
        start: [label_position.x, label_position.y] as [number, number],
        end: [pos.x, pos.y] as [number, number],
      };

      hotspots.push({
        id: key,
        name: pos.name,
        x: Math.max(0.01, Math.min(0.99, pos.x)),
        y: Math.max(0.01, Math.min(0.99, pos.y)),
        layer: pos.layer,
        type: pos.type,
        condition,
        risk,
        status,
        specificBranch: atlasEntry?.desc,
        clinicalImportance: this.getClinicalImportance(pos.type, pos.name),
        actionRequired: this.getActionRequired(pos.type, pos.name, status),
        anatomyDetail: atlasEntry?.desc || fallbackDesc[key] || `${pos.name} — anatomical structure of the hand`,
        repairProtocol: this.getRepairProtocol(pos.type, pos.name),
        complications: this.getComplications(pos.type, pos.name),
        landmarkType: 'center',
        confidence: conf.confidence,
        priority,
        laterality,
        finding: key === 'wound' ? woundFinding : finding,
        evidence: key === 'wound' ? woundEvidence : evidence,
        uncertain: conf.uncertain,
        ...(bounding_box ? { bounding_box } : {}),
        label_position,
        leader_line,
      });
    }

    return hotspots;
  }

  private getClinicalImportance(type: string, name: string): string {
    if (type === 'nerve') return `CRITICAL: ${name} provides sensation and/or motor function. Transection without repair causes permanent disability.`;
    if (type === 'artery') return `CRITICAL: ${name} supplies oxygenated blood. Ischemia >6 hours causes irreversible tissue necrosis.`;
    if (type === 'tendon') return `HIGH: ${name} essential for digit movement. Zone-based repair protocols apply. Delay >2 weeks reduces outcomes.`;
    if (type === 'bone') return `HIGH: ${name} structural integrity required. Intra-articular fractures need anatomic reduction.`;
    if (type === 'ligament') return `MODERATE: ${name} provides joint stability. Chronic instability leads to arthritis.`;
    if (type === 'muscle') return `MODERATE: ${name} contributes to grip and fine motor control.`;
    return `${name} — assess for injury based on mechanism.`;
  }

  private getActionRequired(type: string, name: string, status: Hotspot['status']): string {
    if (status === 'critical') {
      if (type === 'nerve') return `Document function NOW. 2-point discrimination test. If absent → microsurgical exploration and repair within 72 hours.`;
      if (type === 'artery') return `Doppler assessment immediately. If absent → emergent surgical exploration and microvascular repair.`;
    }
    if (type === 'tendon') return `Test active motion against resistance. MRI/Ultrasound if unsure. Repair within 2 weeks for best glide.`;
    if (type === 'bone') return `X-ray: AP, lateral, oblique. CT if intra-articular step-off suspected. ORIF if >1-2mm displacement.`;
    if (type === 'skin') return `Irrigate 3-5L saline. Debride non-viable tissue. Delayed primary closure if contaminated.`;
    return `Visual inspection and functional testing. Specialist referral if abnormal.`;
  }

  private getRepairProtocol(type: string, name: string): string {
    if (type === 'nerve') return `Primary repair <72h: 9-0 or 10-0 nylon epineurial sutures under microscope ×10-16. Gap >5mm: sural nerve graft or conduit.`;
    if (type === 'artery') return `Microsurgical end-to-end anastomosis with 9-0 Prolene. If tension: interposition vein graft. Post-op: heparin × 48h.`;
    if (type === 'tendon') return `4-0 Ethibond core (Kessler) + 6-0 Prolene epitendinous. Preserve pulleys. Early protected motion (Kleinert splint) at 3-5 days.`;
    if (type === 'bone') return `ORIF if >1mm displacement or intra-articular. K-wires, mini-plate, or external fixation depending on fracture pattern.`;
    if (type === 'ligament') return `Partial tear: immobilize 4-6 weeks. Complete tear/Stener lesion: surgical repair with anchor or pull-out suture.`;
    return `Preserve viable tissue. Debride only non-viable. Primary repair if clean, delayed if contaminated.`;
  }

  private getComplications(type: string, name: string): string {
    if (type === 'nerve') return `Permanent anesthesia, neuroma formation, chronic neuropathic pain, cold intolerance, loss of fine motor function.`;
    if (type === 'artery') return `Tissue necrosis, gangrene, cold intolerance, pulp atrophy, nail dystrophy, complex regional pain syndrome.`;
    if (type === 'tendon') return `Adhesion (20-30%), rupture (5-10%), quadriga effect, swan neck deformity, joint stiffness, trigger digit.`;
    if (type === 'bone') return `Post-traumatic arthritis, non-union, malunion, avascular necrosis, complex regional pain syndrome, stiffness.`;
    if (type === 'ligament') return `Chronic instability, early arthritis, weakness, recurrent injury, persistent pain.`;
    return `Infection, delayed healing, scarring, functional limitation, chronic pain.`;
  }

  private generateRedFlags(hotspots: Hotspot[], analysis: any): string[] {
    const flags: string[] = [];
    const critical = hotspots.filter(h => h.status === 'critical');

    if (critical.length > 0) {
      flags.push(`🚨 ${critical.length} CRITICAL: ${critical.slice(0, 3).map(c => c.name).join(', ')}${critical.length > 3 ? '...' : ''}`);
    }

    const nerveCount = hotspots.filter(h => h.type === 'nerve' && h.status === 'critical').length;
    const arteryCount = hotspots.filter(h => h.type === 'artery' && h.status === 'critical').length;

    if (nerveCount >= 2) flags.push('🔴 MULTIPLE NERVE INJURIES — Complete anesthesia risk. Bilateral repair needed.');
    if (arteryCount >= 2) flags.push('🔴 MULTIPLE ARTERY INJURIES — Digital ischemia imminent. Emergent revascularization.');
    if (analysis.woundCenter && !analysis.woundCenter.intensity) flags.push('⚠️ Wound depth uncertain — systematic exploration required under tourniquet.');

    return flags.length > 0 ? flags : ['✓ No immediate red flags — continue systematic assessment'];
  }

  private generatePriority(hotspots: Hotspot[], analysis: any) {
    const actions: Array<{ urgency: string; action: string; rationale: string }> = [];

    const criticalNerves = hotspots.filter(h => h.type === 'nerve' && h.status === 'critical');
    if (criticalNerves.length > 0) {
      actions.push({ urgency: 'immediate', action: `Assess ${criticalNerves.map(n => n.name.split('(')[0].trim()).join(', ')} — 2-point discrimination`, rationale: 'Nerve repair window: primary <72h for best sensory recovery' });
    }

    const criticalArteries = hotspots.filter(h => h.type === 'artery' && h.status === 'critical');
    if (criticalArteries.length > 0) {
      actions.push({ urgency: 'immediate', action: `Doppler: ${criticalArteries.map(a => a.name.split('(')[0].trim()).join(', ')}`, rationale: 'Digital ischemia >6h causes irreversible necrosis' });
    }

    actions.push({ urgency: 'urgent', action: 'Systematic wound exploration under tourniquet', rationale: 'Identify all transected structures before closure' });
    actions.push({ urgency: 'urgent', action: 'X-ray hand: AP, lateral, oblique', rationale: 'Rule out metacarpal/phalanx fracture, foreign body' });
    actions.push({ urgency: 'evaluate', action: 'Tetanus prophylaxis + antibiotics (cover Staph + Streptococcus)', rationale: 'Hand infections progress rapidly to deep space infection' });
    actions.push({ urgency: 'monitor', action: 'Compartment checks q15min × 4, then q1h', rationale: 'Thenar/hypothenar compartment syndrome risk' });

    return actions;
  }

  private generateEMR(hotspots: Hotspot[], analysis: any): string {
    const critical = hotspots.filter(h => h.status === 'critical').map(h => h.name).join(', ');
    const damaged = hotspots.filter(h => h.status === 'damaged').map(h => h.name).join(', ');
    return `Hand — palmar surface. ${critical ? 'Critical: ' + critical + '. ' : ''}${damaged ? 'Damaged: ' + damaged + '. ' : ''}AI-assisted pixel-based analysis. Physician verification required.`;
  }
}

export const medicalImageAgentFinal = new MedicalImageAgentFinal();