import { MedicalImageAgentFinal, computeWoundZone, detectView, type Hotspot } from "./src/lib/agents/MedicalImageAgentFinal";

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = "") => {
  if (ok) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};

// ─── 1. NODE-SAFE GUARD ────────────────────────────────────────
console.log("Node environment guard:");
const agent = new MedicalImageAgentFinal();
let threw = false;
try { await agent.analyzeImage("data:image/png;base64,iVBORw0KGgo="); } catch (e: any) {
  threw = /Canvas 2D not available/.test(String(e?.message));
}
check("analyzeImage throws graceful CanvasUnavailable error in Node", threw);

// ─── 2. LANDMARK PLACEMENT + STATUS (mirror of placer math, v5 offsets) ──
console.log("\nLandmark placement & wound-proximity status (17 landmarks):");

// Synthetic: hand fills skinBox (100,100)-(1100,900), wound at (500,400), img 1200x800
const skinBox = { x: 100, y: 100, w: 1000, h: 800 };
const woundCenter = { x: 500, y: 400 };
const imgW = 1200, imgH = 800;
const sx = (v: number) => v / imgW;
const sy = (v: number) => v / imgH;
const skinCX = skinBox.x + skinBox.w / 2;
const skinCY = skinBox.y + skinBox.h / 2;
const wX = woundCenter.x, wY = woundCenter.y;

const landmarks = new Map<string, { x: number; y: number; name: string; type: string; layer: string; id: string }>();
const put = (id: string, x: number, y: number, name: string, type: string, layer: string, atlasId: string) =>
  landmarks.set(id, { x: sx(x), y: sy(y), name, type, layer, id: atlasId });

put('wound', wX, wY, 'Wound Center — Laceration', 'skin', 'superficial', 'wound');
put('thenar', skinBox.x + skinBox.w * 0.12, skinBox.y + skinBox.h * 0.22, 'Thenar Eminence', 'muscle', 'deep', 'thenar_muscles');
put('hypothenar', skinBox.x + skinBox.w * 0.82, skinBox.y + skinBox.h * 0.28, 'Hypothenar Eminence', 'muscle', 'deep', 'hypothenar_muscles');
put('nerve_radial', wX - skinBox.w * 0.09, wY - skinBox.h * 0.02, 'Proper Palmar Digital Nerve (Radial)', 'nerve', 'neurovascular', 'proper_digital_nerve_radial');
put('artery_radial', wX - skinBox.w * 0.13, wY + skinBox.h * 0.04, 'Proper Palmar Digital Artery (Radial)', 'artery', 'neurovascular', 'proper_digital_artery');
put('nerve_ulnar', wX + skinBox.w * 0.09, wY - skinBox.h * 0.02, 'Proper Palmar Digital Nerve (Ulnar)', 'nerve', 'neurovascular', 'proper_digital_nerve_ulnar');
put('artery_ulnar', wX + skinBox.w * 0.13, wY + skinBox.h * 0.04, 'Proper Palmar Digital Artery (Ulnar)', 'artery', 'neurovascular', 'proper_digital_artery');
put('flexor_tendons', wX, wY - skinBox.h * 0.08, 'Flexor Tendons (FDS/FDP)', 'tendon', 'deep', 'fds_tendon');
put('palmar_aponeurosis', skinCX, skinBox.y + skinBox.h * 0.12, 'Palmar Aponeurosis', 'fascia', 'intermediate', 'palmar_aponeurosis');
put('carpal_tunnel', skinCX - skinBox.w * 0.05, skinBox.y + skinBox.h * 0.02, 'Carpal Tunnel', 'fascia', 'deep', 'flexor_retinaculum');
put('median_nerve', skinCX - skinBox.w * 0.08, skinBox.y + skinBox.h * 0.06, 'Median Nerve', 'nerve', 'neurovascular', 'median_nerve_wrist');
put('radial_artery', skinBox.x + skinBox.w * 0.18, skinBox.y + skinBox.h * 0.08, 'Radial Artery', 'artery', 'neurovascular', 'radial_artery_wrist');
put('mc_heads', wX, wY - skinBox.h * 0.03, 'Metacarpal Heads', 'bone', 'skeletal', 'mc_3');
put('finger_tips', skinBox.x + skinBox.w * 0.65, skinBox.y + skinBox.h * 0.88, 'Digital Tips', 'skin', 'superficial', 'skin_palm');
put('a1_pulley', wX - skinBox.w * 0.02, wY - skinBox.h * 0.06, 'A1 Pulley', 'ligament', 'intermediate', 'a1_pulley');
put('sp_arch', skinCX + skinBox.w * 0.05, skinBox.y + skinBox.h * 0.35, 'Superficial Palmar Arch', 'artery', 'neurovascular', 'superficial_palmar_arch');
put('lumbricals', wX + skinBox.w * 0.06, wY - skinBox.h * 0.08, 'Lumbrical Muscles', 'muscle', 'deep', 'lumbricals');

const analysis = { skinBox, woundCenter, handPosition: 'center', width: imgW, height: imgH };
const hotspots = agent.buildHotspots(landmarks, analysis);
const byId = new Map(hotspots.map(h => [h.id, h]));

check("17 hotspots built (14 + a1_pulley, sp_arch, lumbricals)", hotspots.length === 17, `got ${hotspots.length}`);

// CORE GUARANTEE: every dot lands INSIDE the detected skin box (not on drape/background)
const allOnSkin = hotspots.every(h =>
  h.x * imgW >= skinBox.x - 1 && h.x * imgW <= skinBox.x + skinBox.w + 1 &&
  h.y * imgH >= skinBox.y - 1 && h.y * imgH <= skinBox.y + skinBox.h + 1);
check("ALL dots inside detected skin bounding box (none on drape)", allOnSkin);

const wound = byId.get('wound')!;
check("wound center marked damaged (primary laceration)", wound.status === 'damaged', wound.status);
check("radial nerve at 0.09×skinW → CRITICAL (<0.10 threshold)", byId.get('nerve_radial')!.status === 'critical', byId.get('nerve_radial')!.status);
check("ulnar nerve at 0.09×skinW → CRITICAL", byId.get('nerve_ulnar')!.status === 'critical', byId.get('nerve_ulnar')!.status);
check("flexor tendons at 0.08×skinH → DAMAGED", byId.get('flexor_tendons')!.status === 'damaged', byId.get('flexor_tendons')!.status);
check("arteries at 0.13 → AT-RISK (not critical, outside 0.10)", byId.get('artery_radial')!.status === 'at-risk', byId.get('artery_radial')!.status);
check("thenar far → NORMAL", byId.get('thenar')!.status === 'normal', byId.get('thenar')!.status);
check("mc heads at 0.03 → AT-RISK (bone in wound zone)", byId.get('mc_heads')!.status === 'at-risk', byId.get('mc_heads')!.status);
check("a1 pulley at 0.062 → AT-RISK", byId.get('a1_pulley')!.status === 'at-risk', byId.get('a1_pulley')!.status);
check("lumbricals at 0.094 → AT-RISK (borderline, inside 0.10)", byId.get('lumbricals')!.status === 'at-risk', byId.get('lumbricals')!.status);
check("sp_arch at 0.127 → AT-RISK (inside 0.20, outside 0.10)", byId.get('sp_arch')!.status === 'at-risk', byId.get('sp_arch')!.status);
check("nerve carries full clinical data", byId.get('nerve_radial')!.clinicalImportance.includes('CRITICAL') && byId.get('nerve_radial')!.repairProtocol.includes('nylon'));

// ─── 3. ATLAS RESOLUTION + V5 HOTSPOT FIELDS ───────────────────
console.log("\nAnatomical atlas resolution & v5 fields:");
check("nerve_radial resolved to atlas anatomyDetail", byId.get('nerve_radial')!.anatomyDetail.includes('2-3mm diameter'), byId.get('nerve_radial')!.anatomyDetail.slice(0, 40));
check("sp_arch resolved to atlas anatomyDetail", byId.get('sp_arch')!.anatomyDetail.includes('common digital arteries'));
check("wound uses fallback desc (no atlas entry)", byId.get('wound')!.anatomyDetail.includes('Primary injury site'));
check("hotspots carry landmarkType='center'", hotspots.every(h => h.landmarkType === 'center'));
check("specificBranch carries atlas detail", byId.get('median_nerve')!.specificBranch?.includes('carpal tunnel'));

// ─── 3b. PRECISION DATA MODEL (spec §11/§12/§19) ───────────────
console.log("\nPrecision labeling data model:");
check("priority maps by status (critical→CRITICAL, damaged→HIGH, at-risk→MODERATE, normal→LOW)",
  byId.get('nerve_radial')!.priority === 'CRITICAL' &&
  byId.get('flexor_tendons')!.priority === 'HIGH' &&
  byId.get('artery_radial')!.priority === 'MODERATE' &&
  byId.get('thenar')!.priority === 'LOW');
check("confidence tiers: critical 0.94 / at-risk 0.66 / normal 0.78",
  byId.get('nerve_radial')!.confidence === 0.94 &&
  byId.get('artery_radial')!.confidence === 0.66 &&
  byId.get('thenar')!.confidence === 0.78);
check("uncertain only for at-risk (image-limited) findings",
  byId.get('artery_radial')!.uncertain === true &&
  byId.get('nerve_radial')!.uncertain === false &&
  byId.get('thenar')!.uncertain === false);
check("laterality carried per hotspot (INDETERMINATE when centered)", byId.get('nerve_radial')!.laterality === 'INDETERMINATE');
check("every hotspot has finding + evidence + label_position + leader_line",
  hotspots.every(h => typeof h.finding === 'string' && h.finding.length > 0 &&
    typeof h.evidence === 'string' && h.evidence.length > 0 &&
    typeof h.label_position?.x === 'number' &&
    Array.isArray(h.leader_line?.start) && Array.isArray(h.leader_line?.end)));
check("critical finding states 'likely transected'", byId.get('nerve_radial')!.finding.includes('likely transected'));
check("uncertain finding marked 'near wound field, monitor'", byId.get('artery_radial')!.finding.includes('near wound field'));

// ─── 3c. WOUND BOUNDING BOX (spec §5 Level 2) ──────────────────
console.log("\nWound bounding box (segmentation → tight bbox):");
const analysisWithBbox = {
  ...analysis,
  woundCenter: { x: 500, y: 400, intensity: 42, bbox: { minX: 460, minY: 360, maxX: 540, maxY: 440 } },
};
const bboxHotspots = agent.buildHotspots(landmarks, analysisWithBbox);
const woundBbox = bboxHotspots.find(h => h.id === 'wound')!.bounding_box;
check("wound hotspot carries tight bounding box", !!woundBbox);
check("wound bbox normalized to image dims",
  woundBbox && Math.abs(woundBbox.x - 460 / imgW) < 0.001 &&
  Math.abs(woundBbox.y - 360 / imgH) < 0.001 &&
  Math.abs(woundBbox.width - 80 / imgW) < 0.001 &&
  Math.abs(woundBbox.height - 80 / imgH) < 0.001);
check("wound finding reports pixel extent", bboxHotspots.find(h => h.id === 'wound')!.finding.includes('laceration spanning'));

// ─── 4. STRUCTURE LINES ────────────────────────────────────────
console.log("\nStructure lines:");
const lines = agent.buildStructureLines(landmarks);
check("structureLines generated (>=1)", lines.length >= 1, `got ${lines.length}`);
check("each line has >=2 points, coords in 0-1", lines.every(l => l.points.length >= 2 && l.points.every(p => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1)));
check("tendon + nerve + artery courses present", ['fds_fdp_course', 'median_nerve_course', 'nerve_radial_bundle', 'radial_artery_course'].every(id => lines.some(l => l.id === id)));

// ─── 5. WOUND ZONE + VIEW HELPERS ──────────────────────────────
console.log("\nWound zone & view detection:");
check("woundRelY 0.32 → proximal", computeWoundZone(0.32) === 'proximal');
check("woundRelY 0.5 → middle", computeWoundZone(0.5) === 'middle');
check("woundRelY 0.8 → distal", computeWoundZone(0.8) === 'distal');
check("hint 'dorsal surface' → dorsal view", detectView('dorsal surface') === 'dorsal');
check("hint 'lateral' → lateral view", detectView('lateral') === 'lateral');
check("no hint → palmar view", detectView('') === 'palmar');

// ─── 6. NO-WOUND PATH ──────────────────────────────────────────
console.log("\nNo-wound fallback:");
const noWoundAnalysis = { ...analysis, woundCenter: null };
const noWoundHotspots = agent.buildHotspots(landmarks, noWoundAnalysis);
check("all structures NORMAL when no wound detected", noWoundHotspots.every(h => h.status === 'normal'));

console.log(`\nRESULTS: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);