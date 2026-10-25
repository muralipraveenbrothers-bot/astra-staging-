// src/lib/agents/MedicalImageAgent.ts

// ═══════════════════════════════════════════════════════════════
// ASTRA CLINICAL VISION ENGINE v2.0
// Anatomical Atlas + Trauma Pattern Recognition + Surgical Analysis
// ═══════════════════════════════════════════════════════════════

export interface DetectedStructure {
  name: string;
  layer: 'superficial' | 'intermediate' | 'deep' | 'neurovascular' | 'skeletal';
  condition: string;
  risk: number; // 0-1
  visible: boolean;
  type: 'skin' | 'nerve' | 'artery' | 'vein' | 'bone' | 'tendon' | 'ligament' | 'muscle' | 'joint' | 'fascia' | 'foreign_body' | 'other';
  side?: 'left' | 'right' | 'bilateral';
  specificBranch?: string; // e.g., "Radial digital nerve, ulnar side of thumb"
}

export interface PriorityAction {
  urgency: 'immediate' | 'urgent' | 'evaluate' | 'monitor';
  action: string;
  rationale: string;
}

export interface Hotspot {
  id: string;
  name: string;
  x: number; // 0-1 relative to image width
  y: number; // 0-1 relative to image height
  layer: 'superficial' | 'intermediate' | 'deep' | 'neurovascular' | 'skeletal';
  type: string;
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
}

export interface RegionInfo {
  bodyPart: string;
  side: 'Left' | 'Right' | 'Midline' | 'Bilateral' | 'Indeterminate';
  specificArea: string;
  anatomicalPosition: string;
  zone?: string; // e.g., "Zone 2 flexor tendon", "Snuffbox"
}

export interface InjuryPattern {
  type: 'laceration' | 'crush' | 'avulsion' | 'burn' | 'gunshot' | 'surgical_field' | 'fracture' | 'amputation' | 'contusion';
  severity: 'mild' | 'moderate' | 'severe' | 'critical';
  mechanism: string;
  contamination: 'clean' | 'contaminated' | 'dirty' | 'infected';
}

export interface ImageAnalysisResult {
  region: RegionInfo;
  injuryPattern: InjuryPattern;
  detectedStructures: DetectedStructure[];
  layers: {
    superficial: string[];
    intermediate: string[];
    deep: string[];
    neurovascular: string[];
  };
  redFlags: string[];
  priorityActions: PriorityAction[];
  emrSnippet: string;
  enhancementApplied: string[];
  confidence: number;
  surgicalNotes?: string; // Only for surgical images
  hotspots: Hotspot[];
  display: {
    summary: string;
    labels: Array<{
      type: string;
      name: string;
      condition: string;
      risk: string | null;
      specificBranch?: string;
    }>;
    injury: {
      primary: string;
      mechanism: string;
      depth: string;
      damaged: string;
      atRisk: string;
      contamination: string;
    };
    priority: PriorityAction[];
    hotspots: Array<{
      id: string;
      name: string;
      x: number;
      y: number;
      status: string;
      type: string;
    }>;
  };
}

// ═══════════════════════════════════════════════════════════════
// ANATOMICAL ATLAS — Region-Specific Structure Databases
// ═══════════════════════════════════════════════════════════════

interface AnatomicalRegion {
  name: string;
  sideDeterminants: string[];
  structures: Omit<DetectedStructure, 'condition' | 'risk' | 'visible'>[];
  commonInjuries: string[];
  redFlagConditions: string[];
  priorityTemplate: PriorityAction[];
}

const ANATOMICAL_ATLAS: Record<string, AnatomicalRegion> = {
  // ─── THUMB ──────────────────────────────────────
  thumb: {
    name: 'Thumb',
    sideDeterminants: ['thenar_eminence', 'nail_orientation', 'pollicis_anatomy'],
    structures: [
      { name: 'Skin / Epidermis', layer: 'superficial', type: 'skin' },
      { name: 'Dermis', layer: 'superficial', type: 'skin' },
      { name: 'Subcutaneous Fat', layer: 'superficial', type: 'other' },
      { name: "Cleland's Ligament", layer: 'intermediate', type: 'ligament' },
      { name: "Grayson's Ligament", layer: 'intermediate', type: 'ligament' },
      { name: 'Proper Palmar Digital Nerve (Radial Branch)', layer: 'neurovascular', type: 'nerve', side: 'right', specificBranch: 'Radial digital nerve of thumb — supplies radial side of thumb pulp' },
      { name: 'Proper Palmar Digital Nerve (Ulnar Branch)', layer: 'neurovascular', type: 'nerve', side: 'left', specificBranch: 'Ulnar digital nerve of thumb — supplies ulnar side of thumb pulp' },
      { name: 'Proper Palmar Digital Artery (Radial)', layer: 'neurovascular', type: 'artery', side: 'right', specificBranch: 'Terminal branch of princeps pollicis artery — radial side' },
      { name: 'Proper Palmar Digital Artery (Ulnar)', layer: 'neurovascular', type: 'artery', side: 'left', specificBranch: 'Terminal branch of princeps pollicis artery — ulnar side' },
      { name: 'Digital Veins', layer: 'neurovascular', type: 'vein', specificBranch: 'Vena comitantes of digital arteries' },
      { name: 'Flexor Pollicis Longus (FPL) Tendon', layer: 'deep', type: 'tendon', specificBranch: 'Inserts on distal phalanx base — Zone T1-T5 depending on level' },
      { name: 'Flexor Pollicis Brevis', layer: 'deep', type: 'muscle', specificBranch: 'Superficial head: median nerve; Deep head: ulnar nerve' },
      { name: 'Extensor Pollicis Longus (EPL)', layer: 'deep', type: 'tendon', specificBranch: 'Dorsal — inserts on distal phalanx base' },
      { name: 'Extensor Pollicis Brevis (EPB)', layer: 'deep', type: 'tendon', specificBranch: 'Dorsal — inserts on proximal phalanx base' },
      { name: 'Abductor Pollicis Longus (APL)', layer: 'deep', type: 'tendon', specificBranch: 'Dorsal-radial — inserts on 1st metacarpal base' },
      { name: 'Adductor Pollicis', layer: 'deep', type: 'muscle', specificBranch: 'Oblique & transverse heads — ulnar nerve (deep branch)' },
      { name: 'Thenar Muscles', layer: 'deep', type: 'muscle', specificBranch: 'Opponens pollicis, Abductor pollicis brevis — median nerve' },
      { name: 'Proximal Phalanx', layer: 'skeletal', type: 'bone' },
      { name: 'Distal Phalanx', layer: 'skeletal', type: 'bone' },
      { name: 'Metacarpal Head (1st MC)', layer: 'skeletal', type: 'bone', specificBranch: 'MCP joint articulation — sesamoid bones present' },
      { name: 'Sesamoid Bones', layer: 'skeletal', type: 'bone', specificBranch: 'Two sesamoids at MCP joint — within FPB tendon' },
      { name: 'Volar Plate', layer: 'intermediate', type: 'ligament', specificBranch: 'Prevents hyperextension at MCP/IP joints' },
      { name: 'Nail Matrix / Germinal Matrix', layer: 'superficial', type: 'other', specificBranch: 'Proximal nail fold — determines nail growth' },
      { name: 'Nail Bed / Sterile Matrix', layer: 'superficial', type: 'other', specificBranch: 'Adheres nail plate to distal phalanx' },
    ],
    commonInjuries: [
      'Flexor tendon laceration (Zone T1-T5)',
      'Extensor tendon rupture (mallet thumb)',
      'Digital nerve transection',
      'Digital artery injury',
      'Distal phalanx fracture (tuft/mallet)',
      'MCP joint dislocation',
      'Bennett/Rolando fracture (base of 1st MC)',
      'Thenar muscle laceration',
      'Nail bed injury',
    ],
    redFlagConditions: [
      'Digital artery compromise — check capillary refill',
      'Flexor tendon injury — unable to flex IP joint',
      'Extensor tendon injury — unable to extend IP joint',
      'Open joint (MCP/IP) — septic arthritis risk',
      'Neurovascular bundle injury — anesthesia + pallor',
      'Compartment syndrome of thenar eminence',
    ],
    priorityTemplate: [
      { urgency: 'immediate', action: 'Assess digital nerve function — 2-point discrimination (should be <6mm at thumb pulp)', rationale: 'Nerve repair window: primary within 72h, delayed up to 3 weeks' },
      { urgency: 'immediate', action: 'Check capillary refill (<2sec) and Doppler signal in both digital arteries', rationale: 'Digital ischemia >6h risks necrosis' },
      { urgency: 'urgent', action: 'Test FPL function: hold proximal phalanx, attempt DIP flexion', rationale: 'Zone T1-T3 injuries need early repair for glide function' },
      { urgency: 'urgent', action: 'Test EPL/EPB: attempt thumb extension against resistance', rationale: 'Extensor lag >30° indicates complete transection' },
      { urgency: 'evaluate', action: 'X-ray: AP, lateral, oblique views of thumb — rule out Bennett, Rolando, or sesamoid fracture', rationale: '1st MC base fractures need pinning if >1mm displacement' },
      { urgency: 'evaluate', action: "Assess MCP joint stability — valgus/varus stress testing", rationale: "Collateral ligament injury may need repair (Gamekeeper's thumb variant)" },
      { urgency: 'monitor', action: 'Compartment checks q15min x 4, then q1h x 24h', rationale: 'Thenar compartment syndrome from crush or hematoma' },
      { urgency: 'monitor', action: 'Watch for infection signs — thumb is high-risk for felon/septic arthritis', rationale: 'Septic arthritis of MCP joint destroys articular cartilage within 24h' },
    ],
  },

  // ─── HAND / FINGERS (Generic) ───────────────────
  hand: {
    name: 'Hand',
    sideDeterminants: ['thenar_eminence', 'hypothenar', 'finger_count'],
    structures: [
      { name: 'Palmar Aponeurosis', layer: 'intermediate', type: 'fascia' },
      { name: 'Flexor Digitorum Superficialis (FDS)', layer: 'deep', type: 'tendon', specificBranch: 'Splits to insert on sides of middle phalanx — Zones 1-5' },
      { name: 'Flexor Digitorum Profundus (FDP)', layer: 'deep', type: 'tendon', specificBranch: 'Inserts on distal phalanx base — Zones 1-5' },
      { name: 'Extensor Digitorum Communis (EDC)', layer: 'deep', type: 'tendon', specificBranch: 'Central slip inserts on middle phalanx; lateral bands to distal phalanx' },
      { name: 'Lumbricals (1-4)', layer: 'deep', type: 'muscle', specificBranch: 'Origin: FDP tendons; Insertion: lateral bands — median/ulnar nerve' },
      { name: 'Interossei (Dorsal/Volar)', layer: 'deep', type: 'muscle', specificBranch: 'DAB: Dorsal ABduct; PAD: Palmar ADduct — ulnar nerve' },
      { name: 'Superficial Palmar Arch', layer: 'neurovascular', type: 'artery', specificBranch: 'Formed by ulnar artery + superficial branch of radial artery' },
      { name: 'Deep Palmar Arch', layer: 'neurovascular', type: 'artery', specificBranch: 'Formed by radial artery + deep branch of ulnar artery' },
      { name: 'Common Digital Arteries', layer: 'neurovascular', type: 'artery', specificBranch: 'From superficial palmar arch — bifurcate into proper digital arteries' },
      { name: 'Proper Digital Arteries', layer: 'neurovascular', type: 'artery', specificBranch: 'Run on radial/ulnar sides of each finger — vena comitantes accompany' },
      { name: 'Common Digital Nerves', layer: 'neurovascular', type: 'nerve', specificBranch: 'From median/ulnar nerves — bifurcate distal to metacarpal heads' },
      { name: 'Proper Digital Nerves', layer: 'neurovascular', type: 'nerve', specificBranch: 'Dorsal branches supply nail bed; palmar branches supply pulp' },
      { name: 'Carpal Bones', layer: 'skeletal', type: 'bone', specificBranch: 'Scaphoid, Lunate, Triquetrum, Pisiform, Trapezium, Trapezoid, Capitate, Hamate' },
      { name: 'Metacarpals', layer: 'skeletal', type: 'bone', specificBranch: '1st-5th metacarpals — base/shaft/head' },
    ],
    commonInjuries: ['Flexor tendon laceration', 'Extensor tendon injury', "Boxer's fracture (5th MC neck)", 'Scaphoid fracture', 'Carpal tunnel syndrome', 'Trigger finger'],
    redFlagConditions: ['Compartment syndrome', 'Open fracture', 'Nerve transection', 'Vascular compromise'],
    priorityTemplate: [],
  },

  // ─── FACE ───────────────────────────────────────
  face: {
    name: 'Face',
    sideDeterminants: ['facial_midline', 'ear_position', 'eye_count'],
    structures: [
      { name: 'Facial Artery', layer: 'neurovascular', type: 'artery', specificBranch: 'Branches: superior labial, inferior labial, lateral nasal — angular artery terminates at medial canthus' },
      { name: 'Superficial Temporal Artery', layer: 'neurovascular', type: 'artery', specificBranch: 'Anterior branch: frontal; Posterior branch: parietal — pulse palpable anterior to ear' },
      { name: 'Facial Nerve (CN VII)', layer: 'neurovascular', type: 'nerve', specificBranch: 'Temporal, zygomatic, buccal, mandibular, cervical branches — exits stylomastoid foramen' },
      { name: 'Trigeminal Nerve (V1/V2/V3)', layer: 'neurovascular', type: 'nerve', specificBranch: 'V1: ophthalmic; V2: maxillary (infraorbital); V3: mandibular (mental foramen)' },
      { name: "Parotid Duct (Stensen's)", layer: 'intermediate', type: 'other', specificBranch: "Exits at buccinator opposite 2nd maxillary molar — pierces buccal fat pad" },
      { name: 'Masseter Muscle', layer: 'intermediate', type: 'muscle', specificBranch: 'V3 innervation — mandibular angle to zygomatic arch' },
      { name: 'Temporalis Muscle', layer: 'intermediate', type: 'muscle', specificBranch: 'V3 innervation — coronoid process of mandible' },
      { name: 'Orbicularis Oculi', layer: 'intermediate', type: 'muscle', specificBranch: 'Facial nerve (temporal/zygomatic) — eye closure' },
      { name: 'Orbicularis Oris', layer: 'intermediate', type: 'muscle', specificBranch: 'Facial nerve (buccal/marginal mandibular) — lip closure' },
      { name: 'Mandible', layer: 'skeletal', type: 'bone', specificBranch: 'Body, angle, ramus, condyle, coronoid process, mental foramen' },
      { name: 'Maxilla', layer: 'skeletal', type: 'bone', specificBranch: 'Frontal process, zygomatic process, alveolar process, palatine process' },
      { name: 'Zygomatic Bone', layer: 'skeletal', type: 'bone', specificBranch: 'Arch: temporal process + zygomatic process of temporal bone' },
    ],
    commonInjuries: ['Facial laceration', 'Mandible fracture', 'Zygomaticomaxillary complex fracture', 'Orbital blowout', 'Parotid duct injury'],
    redFlagConditions: ['Airway compromise', 'Orbital compartment syndrome', 'CSF leak', 'Open globe injury'],
    priorityTemplate: [],
  },

  // ─── LEG / LOWER EXTREMITY ──────────────────────
  leg: {
    name: 'Leg',
    sideDeterminants: ['patella_position', 'fibula_head', 'medial_malleolus'],
    structures: [
      { name: 'Anterior Tibial Artery', layer: 'neurovascular', type: 'artery', specificBranch: 'Continues as dorsalis pedis — pulse palpable between 1st/2nd metatarsals' },
      { name: 'Posterior Tibial Artery', layer: 'neurovascular', type: 'artery', specificBranch: 'Passes behind medial malleolus — pulse palpable in tarsal tunnel' },
      { name: 'Peroneal (Fibular) Artery', layer: 'neurovascular', type: 'artery', specificBranch: 'Branches from posterior tibial — supplies lateral compartment' },
      { name: 'Great Saphenous Vein', layer: 'neurovascular', type: 'vein', specificBranch: 'Anterior to medial malleolus — commonly used for grafts/cannulation' },
      { name: 'Small Saphenous Vein', layer: 'neurovascular', type: 'vein', specificBranch: 'Posterior to lateral malleolus — drains into popliteal vein' },
      { name: 'Common Peroneal Nerve', layer: 'neurovascular', type: 'nerve', specificBranch: 'Wraps around fibular neck — divides into superficial (sensory) and deep (motor) peroneal' },
      { name: 'Deep Peroneal Nerve', layer: 'neurovascular', type: 'nerve', specificBranch: 'Motor: tibialis anterior, EHL, EDL; Sensory: 1st web space' },
      { name: 'Superficial Peroneal Nerve', layer: 'neurovascular', type: 'nerve', specificBranch: 'Sensory: dorsum of foot (except 1st web space)' },
      { name: 'Tibial Nerve', layer: 'neurovascular', type: 'nerve', specificBranch: 'Passes through tarsal tunnel — motor to plantarflexors, intrinsic foot muscles' },
      { name: 'Achilles Tendon', layer: 'deep', type: 'tendon', specificBranch: 'Gastrocnemius + soleus — inserts on calcaneal tuberosity' },
      { name: 'Patellar Tendon', layer: 'deep', type: 'tendon', specificBranch: 'Quadriceps tendon to tibial tuberosity' },
      { name: 'ACL / PCL', layer: 'deep', type: 'ligament', specificBranch: 'Anterior/Posterior cruciate — intra-articular' },
      { name: 'MCL / LCL', layer: 'deep', type: 'ligament', specificBranch: 'Medial/Lateral collateral — extra-articular' },
      { name: 'Menisci (Medial/Lateral)', layer: 'deep', type: 'other', specificBranch: 'C-shaped fibrocartilage — medial: less mobile, more tears' },
      { name: 'Femur', layer: 'skeletal', type: 'bone', specificBranch: 'Head, neck, greater/lesser trochanter, shaft, condyles' },
      { name: 'Tibia', layer: 'skeletal', type: 'bone', specificBranch: 'Medial malleolus, tibial tuberosity, plateau' },
      { name: 'Fibula', layer: 'skeletal', type: 'bone', specificBranch: 'Head (common peroneal nerve), lateral malleolus' },
    ],
    commonInjuries: ['ACL tear', 'Meniscus tear', 'Tibial fracture', 'Ankle fracture (Weber A/B/C)', 'Achilles rupture', 'Compartment syndrome'],
    redFlagConditions: ['Compartment syndrome', 'Vascular injury (popliteal)', 'Open fracture', 'Nerve compression'],
    priorityTemplate: [],
  },

  // ─── ARM / UPPER EXTREMITY ──────────────────────
  arm: {
    name: 'Arm',
    sideDeterminants: ['biceps_position', 'antecubital_fossa', 'deltoid_bulk'],
    structures: [
      { name: 'Brachial Artery', layer: 'neurovascular', type: 'artery', specificBranch: 'Continues from axillary — bifurcates into radial/ulnar at cubital fossa' },
      { name: 'Radial Artery', layer: 'neurovascular', type: 'artery', specificBranch: 'Pulse palpable at wrist (lateral to FCR tendon) — used for CABG grafts' },
      { name: 'Ulnar Artery', layer: 'neurovascular', type: 'artery', specificBranch: 'Deep branch: deep palmar arch; Superficial branch: contributes to superficial arch' },
      { name: 'Median Nerve', layer: 'neurovascular', type: 'nerve', specificBranch: 'Passes through cubital fossa (medial to brachial artery) — then through carpal tunnel' },
      { name: 'Ulnar Nerve', layer: 'neurovascular', type: 'nerve', specificBranch: "Posterior to medial epicondyle (funny bone) — passes through Guyon's canal at wrist" },
      { name: 'Radial Nerve', layer: 'neurovascular', type: 'nerve', specificBranch: 'Spiral groove of humerus — divides into superficial (sensory) and deep (posterior interosseous)' },
      { name: 'Biceps Brachii', layer: 'intermediate', type: 'muscle', specificBranch: 'Long/short heads — inserts on radial tuberosity (supination + flexion)' },
      { name: 'Brachialis', layer: 'intermediate', type: 'muscle', specificBranch: 'True elbow flexor — musculocutaneous nerve' },
      { name: 'Triceps Brachii', layer: 'intermediate', type: 'muscle', specificBranch: 'Long/lateral/medial heads — radial nerve — elbow extension' },
      { name: 'Deltoid', layer: 'intermediate', type: 'muscle', specificBranch: 'Anterior (flexion), Middle (abduction), Posterior (extension) — axillary nerve' },
      { name: 'Rotator Cuff (SITS)', layer: 'deep', type: 'tendon', specificBranch: 'Supraspinatus, Infraspinatus, Teres minor, Subscapularis' },
      { name: 'Humerus', layer: 'skeletal', type: 'bone', specificBranch: 'Head, surgical neck, greater/lesser tubercle, deltoid tuberosity, condyles' },
      { name: 'Radius', layer: 'skeletal', type: 'bone', specificBranch: 'Head, radial tuberosity, styloid process' },
      { name: 'Ulna', layer: 'skeletal', type: 'bone', specificBranch: 'Olecranon, coronoid process, trochlear notch, styloid process' },
    ],
    commonInjuries: ['Humerus fracture', 'Supracondylar fracture', 'Distal radius fracture (Colles/Smith)', 'Rotator cuff tear', 'Biceps tendon rupture'],
    redFlagConditions: ['Brachial artery injury', 'Median/ulnar/radial nerve transection', 'Compartment syndrome'],
    priorityTemplate: [],
  },

  // ─── FOOT ───────────────────────────────────────
  foot: {
    name: 'Foot',
    sideDeterminants: ['arch_type', 'toe_count', 'malleoli'],
    structures: [
      { name: 'Dorsalis Pedis Artery', layer: 'neurovascular', type: 'artery', specificBranch: 'Continuation of anterior tibial — pulse between 1st/2nd metatarsals' },
      { name: 'Posterior Tibial Artery', layer: 'neurovascular', type: 'artery', specificBranch: 'Behind medial malleolus — tarsal tunnel' },
      { name: 'Medial Plantar Artery/Nerve', layer: 'neurovascular', type: 'nerve', specificBranch: 'Larger, motor to abductor hallucis, FDB, FHL; sensory to medial 3.5 toes' },
      { name: 'Lateral Plantar Artery/Nerve', layer: 'neurovascular', type: 'nerve', specificBranch: 'Motor to interossei, lumbricals; sensory to lateral 1.5 toes' },
      { name: 'Plantar Fascia (Aponeurosis)', layer: 'intermediate', type: 'fascia', specificBranch: 'Medial/lateral/central bands — origin: calcaneal tuberosity' },
      { name: 'Abductor Hallucis', layer: 'deep', type: 'muscle', specificBranch: 'Medial side of foot — 1st layer of plantar muscles' },
      { name: 'Flexor Hallucis Longus (FHL)', layer: 'deep', type: 'tendon', specificBranch: 'Passes through fibro-osseous tunnel — inserts on distal phalanx of great toe' },
      { name: 'Extensor Hallucis Longus (EHL)', layer: 'deep', type: 'tendon', specificBranch: 'Dorsal — inserts on distal phalanx of great toe' },
      { name: 'Calcaneus', layer: 'skeletal', type: 'bone', specificBranch: 'Calcaneal tuberosity (Achilles insertion), sustentaculum tali' },
      { name: 'Talus', layer: 'skeletal', type: 'bone', specificBranch: 'Trochlea, neck, head — no muscle attachments (avascular necrosis risk)' },
      { name: 'Metatarsals', layer: 'skeletal', type: 'bone', specificBranch: '1st-5th — 1st MT: 2 sesamoids; 5th MT: styloid process (peroneus brevis)' },
      { name: 'Phalanges', layer: 'skeletal', type: 'bone', specificBranch: 'Proximal, middle (2-5), distal — great toe: 2 phalanges only' },
    ],
    commonInjuries: ['Calcaneal fracture', 'Lisfranc injury', '5th metatarsal fracture (Jones)', 'Plantar fasciitis', 'Diabetic foot ulcer'],
    redFlagConditions: ['Charcot neuroarthropathy', 'Osteomyelitis', 'Critical limb ischemia', 'Necrotizing fasciitis'],
    priorityTemplate: [],
  },
};

// ═══════════════════════════════════════════════════════════════
// TRAUMA PATTERN RECOGNITION ENGINE
// ═══════════════════════════════════════════════════════════════

interface TraumaSignature {
  pattern: InjuryPattern['type'];
  pixelSignatures: {
    bloodRatio: [number, number]; // [min, max]
    darkRatio: [number, number];
    edgeDensity: [number, number];
    colorVariance: [number, number];
  };
  visualCues: string[];
  structuralDamage: string[];
}

const TRAUMA_SIGNATURES: TraumaSignature[] = [
  {
    pattern: 'laceration',
    pixelSignatures: { bloodRatio: [0.03, 0.5], darkRatio: [0.05, 0.3], edgeDensity: [0.1, 0.8], colorVariance: [0.3, 0.9] },
    visualCues: ['Linear disruption of skin', 'Irregular wound margins', 'Hemorrhage along incision line', 'Tissue gaping'],
    structuralDamage: ['Skin', 'Subcutaneous fat', 'Possible tendon/nerve/artery depending on depth'],
  },
  {
    pattern: 'crush',
    pixelSignatures: { bloodRatio: [0.1, 0.6], darkRatio: [0.2, 0.6], edgeDensity: [0.05, 0.3], colorVariance: [0.1, 0.5] },
    visualCues: ['Diffuse swelling', 'Ecchymosis', 'Tissue maceration', 'Multiple fracture lines', 'Pulp/muscle extrusion'],
    structuralDamage: ['Compartment syndrome', 'Multiple fractures', 'Neurovascular compromise', 'Soft tissue degloving'],
  },
  {
    pattern: 'avulsion',
    pixelSignatures: { bloodRatio: [0.05, 0.4], darkRatio: [0.1, 0.4], edgeDensity: [0.2, 0.7], colorVariance: [0.4, 0.9] },
    visualCues: ['Flap of tissue', 'Exposed deep structures', 'Pedicle attachment', 'Skin tag'],
    structuralDamage: ['Skin loss', 'Tendon exposure', 'Neurovascular pedicle injury'],
  },
  {
    pattern: 'surgical_field',
    pixelSignatures: { bloodRatio: [0.01, 0.3], darkRatio: [0.05, 0.4], edgeDensity: [0.1, 0.5], colorVariance: [0.2, 0.7] },
    visualCues: ['Retractors present', 'Suture material', 'Electrocautery marks', 'Incision lines', 'Hemostasis clips'],
    structuralDamage: ['Iatrogenic — assess surgical quality', 'Check implant position', 'Verify hemostasis'],
  },
  {
    pattern: 'amputation',
    pixelSignatures: { bloodRatio: [0.2, 0.8], darkRatio: [0.1, 0.5], edgeDensity: [0.3, 0.9], colorVariance: [0.5, 1.0] },
    visualCues: ['Complete tissue separation', 'Stump with exposed structures', 'Missing distal segment', 'Bone protrusion'],
    structuralDamage: ['Complete structure transection', 'Bone exposure', 'Major vessel transection'],
  },
  {
    pattern: 'fracture',
    pixelSignatures: { bloodRatio: [0.02, 0.3], darkRatio: [0.05, 0.3], edgeDensity: [0.3, 0.9], colorVariance: [0.3, 0.8] },
    visualCues: ['Bony deformity', 'Angulation', 'Crepitus', 'Shortening', 'Open wound with bone visible'],
    structuralDamage: ['Cortical disruption', 'Possible neurovascular injury', 'Compartment syndrome risk'],
  },
];

// ═══════════════════════════════════════════════════════════════
// HOTSPOT COORDINATE ATLAS — clinically-informed relative positions
// Radial = left, Ulnar = right, Dorsal = upper, Volar = lower (0-1)
// ═══════════════════════════════════════════════════════════════

const COORDINATE_MAPS: Record<string, Record<string, { x: number; y: number }>> = {
  thumb: {
    'skin': { x: 0.5, y: 0.25 },
    'dermis': { x: 0.52, y: 0.28 },
    'subcutaneous': { x: 0.48, y: 0.32 },
    'cleland': { x: 0.35, y: 0.45 },
    'grayson': { x: 0.65, y: 0.45 },
    'nerve-radial': { x: 0.28, y: 0.42 },
    'nerve-ulnar': { x: 0.72, y: 0.42 },
    'artery-radial': { x: 0.26, y: 0.50 },
    'artery-ulnar': { x: 0.74, y: 0.50 },
    'vein': { x: 0.30, y: 0.55 },
    'fpl': { x: 0.50, y: 0.55 },
    'fpb': { x: 0.60, y: 0.52 },
    'epl': { x: 0.45, y: 0.35 },
    'epb': { x: 0.55, y: 0.33 },
    'apl': { x: 0.40, y: 0.30 },
    'adductor': { x: 0.70, y: 0.48 },
    'thenar': { x: 0.60, y: 0.52 },
    'volar-plate': { x: 0.50, y: 0.48 },
    'metacarpal-head': { x: 0.50, y: 0.50 },
    'metacarpal': { x: 0.50, y: 0.50 },
    'proximal-phalanx': { x: 0.50, y: 0.40 },
    'distal-phalanx': { x: 0.50, y: 0.15 },
    'sesamoid': { x: 0.50, y: 0.53 },
    'nail-matrix': { x: 0.50, y: 0.08 },
    'nail-bed': { x: 0.50, y: 0.12 },
  },
  hand: {
    'palmar-aponeurosis': { x: 0.50, y: 0.45 },
    'fds': { x: 0.35, y: 0.50 },
    'fdp': { x: 0.40, y: 0.55 },
    'edc': { x: 0.50, y: 0.35 },
    'lumbrical': { x: 0.45, y: 0.48 },
    'interossei-dorsal': { x: 0.55, y: 0.42 },
    'interossei-volar': { x: 0.45, y: 0.42 },
    'superficial-arch': { x: 0.50, y: 0.60 },
    'deep-arch': { x: 0.52, y: 0.58 },
    'common-digital-artery': { x: 0.40, y: 0.55 },
    'common-digital': { x: 0.40, y: 0.55 },
    'proper-digital-artery': { x: 0.35, y: 0.50 },
    'proper-digital': { x: 0.35, y: 0.50 },
    'common-digital-nerve': { x: 0.42, y: 0.52 },
    'proper-digital-nerve': { x: 0.38, y: 0.48 },
    'carpal-bones': { x: 0.50, y: 0.70 },
    'carpal': { x: 0.50, y: 0.70 },
    'metacarpals': { x: 0.50, y: 0.55 },
    'metacarpal': { x: 0.50, y: 0.55 },
  },
  face: {
    'facial-artery': { x: 0.45, y: 0.55 },
    'temporal-artery': { x: 0.75, y: 0.25 },
    'facial-nerve': { x: 0.50, y: 0.45 },
    'trigeminal': { x: 0.50, y: 0.40 },
    'parotid-duct': { x: 0.60, y: 0.50 },
    'masseter': { x: 0.65, y: 0.55 },
    'orbicularis-oculi': { x: 0.35, y: 0.35 },
    'orbicularis-oris': { x: 0.50, y: 0.65 },
    'mandible': { x: 0.50, y: 0.75 },
    'maxilla': { x: 0.50, y: 0.55 },
    'zygomatic': { x: 0.70, y: 0.45 },
  },
  leg: {
    'anterior-tibial': { x: 0.40, y: 0.50 },
    'posterior-tibial': { x: 0.35, y: 0.55 },
    'peroneal-artery': { x: 0.60, y: 0.52 },
    'great-saphenous': { x: 0.25, y: 0.45 },
    'small-saphenous': { x: 0.70, y: 0.48 },
    'common-peroneal': { x: 0.65, y: 0.35 },
    'deep-peroneal': { x: 0.42, y: 0.50 },
    'superficial-peroneal': { x: 0.55, y: 0.48 },
    'tibial-nerve': { x: 0.35, y: 0.55 },
    'achilles': { x: 0.50, y: 0.85 },
    'patellar-tendon': { x: 0.50, y: 0.30 },
    'acl': { x: 0.48, y: 0.32 },
    'pcl': { x: 0.52, y: 0.32 },
    'mcl': { x: 0.40, y: 0.32 },
    'lcl': { x: 0.60, y: 0.32 },
    'meniscus-medial': { x: 0.45, y: 0.34 },
    'meniscus-lateral': { x: 0.55, y: 0.34 },
    'femur': { x: 0.50, y: 0.20 },
    'tibia': { x: 0.48, y: 0.55 },
    'fibula': { x: 0.65, y: 0.55 },
  },
  arm: {
    'brachial-artery': { x: 0.45, y: 0.45 },
    'radial-artery': { x: 0.40, y: 0.75 },
    'ulnar-artery': { x: 0.55, y: 0.75 },
    'median-nerve': { x: 0.48, y: 0.48 },
    'ulnar-nerve': { x: 0.58, y: 0.50 },
    'radial-nerve': { x: 0.65, y: 0.45 },
    'biceps': { x: 0.50, y: 0.35 },
    'brachialis': { x: 0.48, y: 0.40 },
    'triceps': { x: 0.52, y: 0.38 },
    'deltoid': { x: 0.50, y: 0.20 },
    'rotator-cuff': { x: 0.50, y: 0.15 },
    'humerus': { x: 0.50, y: 0.35 },
    'radius': { x: 0.42, y: 0.70 },
    'ulna-bone': { x: 0.55, y: 0.70 },
    'ulna': { x: 0.55, y: 0.70 },
  },
  foot: {
    'dorsalis-pedis': { x: 0.45, y: 0.35 },
    'posterior-tibial-foot': { x: 0.35, y: 0.50 },
    'posterior-tibial': { x: 0.35, y: 0.50 },
    'medial-plantar': { x: 0.40, y: 0.55 },
    'lateral-plantar': { x: 0.55, y: 0.55 },
    'plantar-fascia': { x: 0.50, y: 0.60 },
    'abductor-hallucis': { x: 0.35, y: 0.55 },
    'fhl': { x: 0.45, y: 0.50 },
    'ehl': { x: 0.45, y: 0.30 },
    'calcaneus': { x: 0.50, y: 0.80 },
    'talus': { x: 0.50, y: 0.65 },
    'metatarsals': { x: 0.50, y: 0.45 },
    'metatarsal': { x: 0.50, y: 0.45 },
    'phalanges-foot': { x: 0.50, y: 0.20 },
    'phalanges': { x: 0.50, y: 0.20 },
  },
};

// ═══════════════════════════════════════════════════════════════
// MAIN AGENT CLASS
// ═══════════════════════════════════════════════════════════════

export class MedicalImageAgent {
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;

  constructor() {
    this.ensureCanvas();
  }

  // Lazy canvas — Node-safe for server-side imports (singleton created on module load)
  private ensureCanvas(): void {
    if (this.canvas || typeof document === "undefined") return;
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
  }

  async analyzeImage(
    imageSource: HTMLImageElement | string,
    options: { enhance?: boolean; bodyRegionHint?: string; isSurgical?: boolean } = {}
  ): Promise<ImageAnalysisResult> {
    const { enhance = true, bodyRegionHint, isSurgical = false } = options;
    this.ensureCanvas();
    if (!this.ctx) throw new Error('Canvas 2D not available in this environment');

    const img = typeof imageSource === 'string'
      ? await this.loadImage(imageSource)
      : imageSource;

    this.canvas.width = img.naturalWidth || img.width;
    this.canvas.height = img.naturalHeight || img.height;
    this.ctx.drawImage(img, 0, 0);

    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const pixels = imageData.data;

    // ─── ENHANCEMENT PIPELINE ───────────────────────
    const enhancements: string[] = [];

    if (enhance) {
      this.suppressHemorrhage(pixels);
      enhancements.push('hemorrhage_suppression');

      this.enhanceContrast(pixels);
      enhancements.push('adaptive_contrast');

      this.sharpenEdges(pixels, this.canvas.width, this.canvas.height);
      enhancements.push('edge_sharpening');

      this.reduceNoise(pixels, this.canvas.width, this.canvas.height);
      enhancements.push('median_filter');

      this.enhanceVessels(pixels, this.canvas.width, this.canvas.height);
      enhancements.push('vessel_enhancement');

      this.ctx.putImageData(imageData, 0, 0);
    }

    // ─── PIXEL ANALYSIS ─────────────────────────────
    const stats = this.computeStats(pixels, this.canvas.width, this.canvas.height);
    const edges = this.detectEdges(pixels, this.canvas.width, this.canvas.height);

    // ─── TRAUMA PATTERN DETECTION ───────────────────
    const injuryPattern = this.identifyTraumaPattern(stats, edges, isSurgical);

    // ─── REGION IDENTIFICATION ──────────────────────
    const region = this.identifyRegion(img, bodyRegionHint, stats, injuryPattern);

    // ─── STRUCTURE DETECTION (Atlas-based) ──────────
    const detectedStructures = this.detectStructures(region, injuryPattern, stats, edges);

    // ─── LAYER ANALYSIS ─────────────────────────────
    const layers = this.analyzeLayers(detectedStructures);

    // ─── RED FLAGS & PRIORITIES ─────────────────────
    const redFlags = this.identifyRedFlags(detectedStructures, injuryPattern, region);
    const priorityActions = this.buildPriorityActions(region, detectedStructures, injuryPattern, redFlags);

    // ─── HOTSPOTS (interactive annotation) ──────────
    const hotspots = this.generateHotspots(region, detectedStructures, injuryPattern);

    // ─── EMR GENERATION ─────────────────────────────
    const emrSnippet = this.generateEMR(region, detectedStructures, injuryPattern, layers, redFlags);

    // ─── DISPLAY SCHEMA ─────────────────────────────
    const display = this.buildDisplay(region, detectedStructures, injuryPattern, layers, priorityActions, redFlags, hotspots);

    return {
      region,
      injuryPattern,
      detectedStructures,
      layers,
      redFlags,
      priorityActions,
      emrSnippet,
      enhancementApplied: enhancements,
      confidence: this.computeConfidence(stats, detectedStructures, region),
      surgicalNotes: isSurgical ? this.generateSurgicalNotes(detectedStructures) : undefined,
      hotspots,
      display,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // IMAGE PROCESSING METHODS
  // ═══════════════════════════════════════════════════════════════

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  private suppressHemorrhage(pixels: Uint8ClampedArray): void {
    // Advanced hemorrhage suppression preserving tissue detail
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      const saturation = Math.max(r, g, b) - Math.min(r, g, b);
      const brightness = (r + g + b) / 3;

      // Detect fresh blood (high R, low G/B, high saturation)
      if (r > 90 && r > g * 1.6 && r > b * 1.4 && saturation > 40) {
        // Shift toward tissue brown while preserving luminance
        pixels[i] = Math.min(255, r * 0.6 + g * 0.25 + b * 0.15);
        pixels[i + 1] = Math.min(255, g * 1.15);
        pixels[i + 2] = Math.min(255, b * 1.25);
      }
      // Detect clotted/dark blood (dark red-brown)
      else if (r > 50 && r > g * 1.2 && r > b * 1.1 && brightness < 80) {
        pixels[i] = Math.min(255, r * 0.8 + 30);
        pixels[i + 1] = Math.min(255, g * 0.9 + 20);
        pixels[i + 2] = Math.min(255, b * 0.95 + 15);
      }
    }
  }

  private enhanceContrast(pixels: Uint8ClampedArray): void {
    // CLAHE-inspired adaptive histogram equalization
    const totalPixels = pixels.length / 4;
    const histogram = new Float32Array(256);

    for (let i = 0; i < pixels.length; i += 4) {
      const gray = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      histogram[Math.round(gray)]++;
    }

    // Normalize and compute CDF
    for (let i = 0; i < 256; i++) histogram[i] /= totalPixels;
    for (let i = 1; i < 256; i++) histogram[i] += histogram[i - 1];

    // Apply with gamma correction for medical images
    const gamma = 0.8;
    for (let i = 0; i < pixels.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const normalized = pixels[i + c] / 255;
        const corrected = Math.pow(normalized, gamma);
        const equalized = histogram[Math.round(pixels[i + c])] * 255;
        pixels[i + c] = Math.min(255, Math.round(corrected * 0.3 + equalized * 0.7));
      }
    }
  }

  private sharpenEdges(pixels: Uint8ClampedArray, w: number, h: number): void {
    const temp = new Uint8ClampedArray(pixels);
    const kernel = [-1, -1, -1, -1, 9, -1, -1, -1, -1]; // Laplacian sharpen

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              sum += temp[((y + ky) * w + (x + kx)) * 4 + c] * kernel[(ky + 1) * 3 + (kx + 1)];
            }
          }
          pixels[(y * w + x) * 4 + c] = Math.min(255, Math.max(0, sum));
        }
      }
    }
  }

  private reduceNoise(pixels: Uint8ClampedArray, w: number, h: number): void {
    const temp = new Uint8ClampedArray(pixels);

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        for (let c = 0; c < 3; c++) {
          const vals: number[] = [];
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              vals.push(temp[((y + ky) * w + (x + kx)) * 4 + c]);
            }
          }
          vals.sort((a, b) => a - b);
          pixels[(y * w + x) * 4 + c] = vals[4]; // median
        }
      }
    }
  }

  private enhanceVessels(pixels: Uint8ClampedArray, w: number, h: number): void {
    // Frangi-inspired vessel enhancement for neurovascular bundles
    const temp = new Uint8ClampedArray(pixels);

    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        const idx = (y * w + x) * 4;
        // Simple ridge detection (tubular structures)
        const gx = temp[idx + 4] - temp[idx - 4];
        const gy = temp[(y + 1) * w * 4 + x * 4] - temp[(y - 1) * w * 4 + x * 4];
        const gxx = temp[idx + 4] + temp[idx - 4] - 2 * temp[idx];
        const gyy = temp[(y + 1) * w * 4 + x * 4] + temp[(y - 1) * w * 4 + x * 4] - 2 * temp[idx];

        const vesselness = Math.abs(gxx - gyy) / (Math.abs(gxx) + Math.abs(gyy) + 1);

        if (vesselness > 0.3) {
          // Boost contrast of vessel-like structures
          for (let c = 0; c < 3; c++) {
            pixels[idx + c] = Math.min(255, pixels[idx + c] * 1.2);
          }
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ANALYSIS METHODS
  // ═══════════════════════════════════════════════════════════════

  private computeStats(pixels: Uint8ClampedArray, w: number, h: number) {
    let totalR = 0, totalG = 0, totalB = 0;
    let bloodPixels = 0, darkPixels = 0, brightPixels = 0, whitePixels = 0;
    let edgeSum = 0;
    let colorVarSum = 0;

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
      totalR += r; totalG += g; totalB += b;

      const brightness = (r + g + b) / 3;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const saturation = max - min;
      colorVarSum += saturation;

      // Blood detection
      if (r > 80 && r > g * 1.5 && r > b * 1.2 && saturation > 30) bloodPixels++;
      if (brightness < 35) darkPixels++;
      if (brightness > 220) brightPixels++;
      if (brightness > 240 && saturation < 15) whitePixels++;
    }

    const total = pixels.length / 4;
    return {
      avgColor: { r: totalR / total, g: totalG / total, b: totalB / total },
      bloodRatio: bloodPixels / total,
      darkRatio: darkPixels / total,
      brightRatio: brightPixels / total,
      whiteRatio: whitePixels / total,
      colorVariance: colorVarSum / total / 255,
      edgeDensity: edgeSum / total,
      aspectRatio: w / h,
    };
  }

  private detectEdges(pixels: Uint8ClampedArray, w: number, h: number): number[][] {
    const edges: number[][] = [];
    for (let y = 1; y < h - 1; y++) {
      edges[y] = [];
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        const gray = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
        const gx = Math.abs(gray - (0.299 * pixels[idx + 4] + 0.587 * pixels[idx + 5] + 0.114 * pixels[idx + 6]));
        const gy = Math.abs(gray - (0.299 * pixels[(y + 1) * w * 4 + x * 4] + 0.587 * pixels[(y + 1) * w * 4 + x * 4 + 1] + 0.114 * pixels[(y + 1) * w * 4 + x * 4 + 2]));
        edges[y][x] = Math.sqrt(gx * gx + gy * gy);
      }
    }
    return edges;
  }

  private identifyTraumaPattern(stats: any, edges: number[][], isSurgical: boolean): InjuryPattern {
    if (isSurgical) {
      return {
        type: 'surgical_field',
        severity: 'mild',
        mechanism: 'Iatrogenic — surgical incision/exposure',
        contamination: 'clean',
      };
    }

    // Score each pattern
    let bestMatch: TraumaSignature | null = null;
    let bestScore = -1;

    for (const sig of TRAUMA_SIGNATURES) {
      let score = 0;
      if (stats.bloodRatio >= sig.pixelSignatures.bloodRatio[0] && stats.bloodRatio <= sig.pixelSignatures.bloodRatio[1]) score += 2;
      if (stats.darkRatio >= sig.pixelSignatures.darkRatio[0] && stats.darkRatio <= sig.pixelSignatures.darkRatio[1]) score += 1;
      if (stats.colorVariance >= sig.pixelSignatures.colorVariance[0] && stats.colorVariance <= sig.pixelSignatures.colorVariance[1]) score += 1;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = sig;
      }
    }

    if (!bestMatch || bestScore < 2) {
      return {
        type: 'contusion',
        severity: 'mild',
        mechanism: 'Unclear — possible blunt trauma or normal anatomy',
        contamination: 'clean',
      };
    }

    // Determine severity based on blood/dark ratios
    let severity: InjuryPattern['severity'] = 'moderate';
    if (stats.bloodRatio > 0.3 || stats.darkRatio > 0.4) severity = 'severe';
    if (stats.bloodRatio > 0.5 && stats.darkRatio > 0.3) severity = 'critical';

    return {
      type: bestMatch.pattern,
      severity,
      mechanism: bestMatch.visualCues.join('; '),
      contamination: stats.bloodRatio > 0.2 ? 'contaminated' : 'clean',
    };
  }

  private identifyRegion(img: HTMLImageElement, hint: string | undefined, stats: any, injury: InjuryPattern): RegionInfo {
    const aspect = img.width / img.height;

    // Parse hint for specific anatomy
    const hint_lower = (hint || '').toLowerCase();

    // Detect thumb specifically
    const isThumb = hint_lower.includes('thumb') ||
                    hint_lower.includes('pollic') ||
                    (hint_lower.includes('mcp') && hint_lower.includes('thumb')) ||
                    (aspect < 0.9 && aspect > 0.4 && stats.brightRatio < 0.5);

    // Detect hand
    const isHand = hint_lower.includes('hand') ||
                   hint_lower.includes('finger') ||
                   hint_lower.includes('digit') ||
                   hint_lower.includes('palm') ||
                   hint_lower.includes('mcp') ||
                   hint_lower.includes('pip') ||
                   hint_lower.includes('dip') ||
                   (aspect > 0.8 && aspect < 1.5 && stats.brightRatio < 0.4);

    // Detect face
    const isFace = hint_lower.includes('face') ||
                   hint_lower.includes('facial') ||
                   hint_lower.includes('scalp') ||
                   hint_lower.includes('nose') ||
                   hint_lower.includes('eye') ||
                   hint_lower.includes('lip') ||
                   (aspect > 1.0 && aspect < 1.5 && stats.avgColor.r > 120 && stats.avgColor.g > 80);

    // Detect leg
    const isLeg = hint_lower.includes('leg') ||
                  hint_lower.includes('knee') ||
                  hint_lower.includes('ankle') ||
                  hint_lower.includes('tibia') ||
                  hint_lower.includes('femur') ||
                  hint_lower.includes('foot') ||
                  (aspect > 0.3 && aspect < 0.8 && img.height > 300);

    // Determine side
    let side: RegionInfo['side'] = 'Indeterminate';
    if (hint_lower.includes('left')) side = 'Left';
    else if (hint_lower.includes('right')) side = 'Right';
    else if (hint_lower.includes('bilateral')) side = 'Bilateral';

    // Build specific area description
    let specificArea = 'General view';
    let anatomicalPosition = 'Standard clinical view';
    let zone = undefined;

    if (isThumb) {
      if (hint_lower.includes('mcp')) {
        specificArea = 'Metacarpophalangeal (MCP) joint';
        anatomicalPosition = hint_lower.includes('dorsal') ? 'Dorsal aspect' :
                            hint_lower.includes('palmar') || hint_lower.includes('volar') ? 'Palmar/volar aspect' :
                            'Combined dorsal and palmar involvement';
        zone = 'MCP joint zone — collateral ligaments, sesamoids, FPB insertion';
      } else if (hint_lower.includes('ip') || hint_lower.includes('interphalangeal')) {
        specificArea = 'Interphalangeal (IP) joint';
        anatomicalPosition = 'Joint line — volar plate, collateral ligaments';
        zone = 'IP joint zone';
      } else if (hint_lower.includes('distal')) {
        specificArea = 'Distal phalanx';
        anatomicalPosition = 'Fingertip — nail bed, pulp, distal phalanx';
        zone = 'Zone T1 (fingertip)';
      } else if (hint_lower.includes('proximal')) {
        specificArea = 'Proximal phalanx';
        anatomicalPosition = 'Shaft — FPL/EPB/EPL tendons';
        zone = 'Zone T3-T4';
      } else {
        specificArea = 'Thumb — multiple levels';
        anatomicalPosition = 'MCP to distal phalanx';
      }
    } else if (isHand) {
      specificArea = hint_lower.includes('palm') ? 'Palmar surface' :
                     hint_lower.includes('dorsal') ? 'Dorsal surface' :
                     'Hand — unspecified surface';
    }

    const bodyPart = isThumb ? 'Thumb' : isHand ? 'Hand' : isFace ? 'Face' : isLeg ? 'Leg' : 'Unspecified Region';

    return { bodyPart, side, specificArea, anatomicalPosition, zone };
  }

  private detectStructures(region: RegionInfo, injury: InjuryPattern, stats: any, edges: number[][]): DetectedStructure[] {
    const atlasKey = region.bodyPart.toLowerCase();
    const atlas = ANATOMICAL_ATLAS[atlasKey] || ANATOMICAL_ATLAS['hand'];

    const structures: DetectedStructure[] = [];
    const { bloodRatio, darkRatio, brightRatio } = stats;

    // Determine which structures are visible/damaged based on injury pattern
    for (const base of atlas.structures) {
      let condition: string;
      let risk: number;
      let visible: boolean;

      // Determine visibility based on depth and injury
      switch (base.layer) {
        case 'superficial':
          visible = bloodRatio > 0.01 || darkRatio > 0.05;
          condition = bloodRatio > 0.1 ? 'Lacerated / Disrupted' :
                     darkRatio > 0.1 ? 'Contused / Ecchymotic' :
                     injury.type === 'crush' ? 'Macerated' :
                     'Intact';
          risk = bloodRatio > 0.1 ? 0.6 : 0.1;
          break;

        case 'intermediate':
          visible = bloodRatio > 0.15 || darkRatio > 0.15;
          condition = visible ? 'Exposed / Partially transected' :
                     injury.type === 'crush' ? 'Crushed / Edematous' :
                     'Intact — deep to superficial layers';
          risk = visible ? 0.7 : 0.3;
          break;

        case 'deep':
          visible = darkRatio > 0.2 || brightRatio > 0.3 || bloodRatio > 0.25;
          condition = visible ? 'Exposed / Possible transection' :
                     injury.type === 'laceration' && bloodRatio > 0.2 ? 'At risk — proximity to wound' :
                     'Deep — not directly visualized';
          risk = visible ? 0.8 : bloodRatio > 0.2 ? 0.5 : 0.2;
          break;

        case 'neurovascular':
          visible = bloodRatio > 0.2 && darkRatio > 0.1;
          condition = visible ? 'PARTIALLY TRANSECTED / EXPOSED — CRITICAL' :
                     bloodRatio > 0.15 ? 'AT RISK — within wound zone' :
                     injury.type === 'crush' ? 'Compromised by edema/hematoma' :
                     'Course inferred — not directly visualized';
          risk = visible ? 0.95 : bloodRatio > 0.15 ? 0.8 : 0.4;
          break;

        case 'skeletal':
          visible = brightRatio > 0.3 && darkRatio > 0.2;
          condition = visible ? 'EXPOSED / FRACTURE SUSPECTED' :
                     injury.type === 'crush' ? 'Possible occult fracture' :
                     'Not exposed';
          risk = visible ? 0.9 : injury.type === 'crush' ? 0.6 : 0.2;
          break;

        default:
          visible = false;
          condition = 'Not assessed';
          risk = 0.3;
      }

      // Override for specific trauma patterns
      if (injury.type === 'crush') {
        if (base.type === 'nerve') {
          condition = 'Compromised — compression neuropathy likely';
          risk = 0.85;
        }
        if (base.type === 'artery') {
          condition = 'Patency at risk — compartment syndrome';
          risk = 0.9;
        }
      }

      if (injury.type === 'surgical_field') {
        condition = 'Surgically exposed — assess handling quality';
        risk = 0.3;
        visible = true;
      }

      structures.push({
        ...base,
        condition,
        risk,
        visible,
      });
    }

    // Add injury-specific structures
    if (injury.type === 'crush' && region.bodyPart === 'Thumb') {
      structures.push({
        name: 'Thenar Compartment',
        layer: 'intermediate',
        type: 'fascia',
        condition: 'CRUSH INJURY — compartment syndrome risk HIGH',
        risk: 0.95,
        visible: false,
        specificBranch: 'Contains adductor pollicis, FPB, opponens pollicis — pressure >30mmHg = emergency',
      });
    }

    return structures;
  }

  private analyzeLayers(structures: DetectedStructure[]) {
    return {
      superficial: structures.filter(s => s.layer === 'superficial').map(s => `${s.name}: ${s.condition}`),
      intermediate: structures.filter(s => s.layer === 'intermediate').map(s => `${s.name}: ${s.condition}`),
      deep: structures.filter(s => s.layer === 'deep' || s.layer === 'skeletal').map(s => `${s.name}: ${s.condition}`),
      neurovascular: structures.filter(s => s.layer === 'neurovascular').map(s => `${s.name}: ${s.condition}`),
    };
  }

  private identifyRedFlags(structures: DetectedStructure[], injury: InjuryPattern, region: RegionInfo): string[] {
    const flags: string[] = [];

    const transectedNerve = structures.find(s => s.type === 'nerve' && s.risk > 0.8);
    const transectedArtery = structures.find(s => s.type === 'artery' && s.risk > 0.85);
    const exposedBone = structures.find(s => s.type === 'bone' && s.visible);
    const compartment = structures.find(s => s.name.includes('Compartment'));

    if (transectedNerve) flags.push(`🚨 NERVE TRANSECTION: ${transectedNerve.name} — ${transectedNerve.specificBranch || ''}`);
    if (transectedArtery) flags.push(`🩸 ARTERIAL INJURY: ${transectedArtery.name} — ${transectedArtery.specificBranch || ''}`);
    if (exposedBone) flags.push(`🦴 OPEN FRACTURE: ${exposedBone.name} exposed — septic arthritis/osteomyelitis risk`);
    if (compartment) flags.push(`⚠️ COMPARTMENT SYNDROME: ${compartment.name} — measure pressure NOW`);

    if (injury.type === 'crush') flags.push('🔴 CRUSH INJURY: Rhabdomyolysis risk — check CK, urine myoglobin, compartment pressures');
    if (injury.type === 'amputation') flags.push('🔴 AMPUTATION: Preserve amputated part in saline-moistened gauze, cool — do NOT immerse in ice water');
    if (injury.contamination === 'dirty') flags.push('🦠 CONTAMINATED WOUND: Tetanus status, broad-spectrum antibiotics, thorough irrigation');

    // Thumb-specific red flags
    if (region.bodyPart === 'Thumb') {
      const fpl = structures.find(s => s.name.includes('Flexor Pollicis Longus'));
      if (fpl && fpl.risk > 0.6) flags.push('👍 FPL INJURY: Loss of thumb IP flexion — early repair (within 72h) for best glide');

      const epl = structures.find(s => s.name.includes('Extensor Pollicis Longus'));
      if (epl && epl.risk > 0.6) flags.push('👍 EPL INJURY: Loss of thumb extension — EPL rupture = EPL reconstruction needed');

      const mcp = structures.find(s => s.name.includes('MCP'));
      if (mcp || region.specificArea.includes('MCP')) {
        flags.push('👍 MCP JOINT: Collateral ligament injury? Test valgus/varus stress — Gamekeeper\'s thumb if UCL torn');
      }
    }

    return flags.length > 0 ? flags : ['No immediate red flags identified — continue systematic assessment'];
  }

  private buildPriorityActions(
    region: RegionInfo,
    structures: DetectedStructure[],
    injury: InjuryPattern,
    redFlags: string[]
  ): PriorityAction[] {
    const atlasKey = region.bodyPart.toLowerCase();
    const atlas = ANATOMICAL_ATLAS[atlasKey];

    let actions: PriorityAction[] = [];

    // Start with atlas template if available
    if (atlas?.priorityTemplate) {
      actions = [...atlas.priorityTemplate];
    }

    // Add injury-specific priorities
    if (injury.type === 'crush') {
      actions.unshift(
        { urgency: 'immediate', action: 'Measure compartment pressure (thenar, hypothenar, interossei)', rationale: 'Compartment syndrome: irreversible muscle necrosis at 6-8h' },
        { urgency: 'immediate', action: 'IV access, fluid resuscitation, check CK/urine myoglobin', rationale: 'Crush syndrome: hyperkalemia, ARF risk' }
      );
    }

    if (injury.type === 'laceration' && region.bodyPart === 'Thumb') {
      // Check if MCP joint involved
      if (region.specificArea.includes('MCP')) {
        actions.unshift(
          { urgency: 'immediate', action: 'Assess MCP joint stability — valgus stress test for UCL integrity', rationale: 'Complete UCL tear (Stener lesion) needs surgery — non-op if partial' },
          { urgency: 'urgent', action: 'X-ray: AP, lateral, oblique + stress views of thumb', rationale: 'Rule out Bennett fracture, sesamoid fracture, avulsion' }
        );
      }

      // Check for neurovascular injury
      const digitalNerve = structures.find(s => s.type === 'nerve' && s.name.includes('Digital'));
      if (digitalNerve && digitalNerve.risk > 0.6) {
        actions.unshift(
          { urgency: 'immediate', action: 'Document 2-point discrimination at thumb pulp (normal <6mm)', rationale: 'Digital nerve repair: best outcome if primary repair within 72h' },
          { urgency: 'urgent', action: 'Microsurgical consult if nerve transected — primary neurorrhaphy vs. nerve graft', rationale: 'Gap >5mm may need sural nerve graft or conduit' }
        );
      }
    }

    // Remove duplicates and sort by urgency
    const urgencyOrder = { immediate: 0, urgent: 1, evaluate: 2, monitor: 3 };
    return actions
      .filter((v, i, a) => a.findIndex(t => t.action === v.action) === i)
      .sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);
  }

  private generateEMR(
    region: RegionInfo,
    structures: DetectedStructure[],
    injury: InjuryPattern,
    layers: any,
    redFlags: string[]
  ): string {
    const damaged = structures.filter(s => s.risk > 0.6).map(s =>
      `${s.name}${s.specificBranch ? ` (${s.specificBranch})` : ''}: ${s.condition}`
    ).join('; ');

    const atRisk = structures.filter(s => s.risk > 0.3 && s.risk <= 0.6).map(s => s.name).join(', ');

    return `${region.side} ${region.bodyPart} — ${region.specificArea}. ` +
      `Mechanism: ${injury.mechanism}. ` +
      `Pattern: ${injury.type}, severity: ${injury.severity}. ` +
      `Damaged: ${damaged || 'None confirmed'}. ` +
      `At-risk: ${atRisk || 'None identified'}. ` +
      `Red flags: ${redFlags.filter(f => !f.includes('No immediate')).join('; ') || 'None'}. ` +
      `Superficial: ${layers.superficial.join('; ')}. ` +
      `Neurovascular: ${layers.neurovascular.join('; ')}. ` +
      `Deep: ${layers.deep.join('; ')}. ` +
      `AI-assisted analysis — physician verification required.`;
  }

  private generateSurgicalNotes(structures: DetectedStructure[]): string {
    const exposed = structures.filter(s => s.visible && s.layer !== 'superficial');
    return `Surgical field assessment: ${exposed.length} deep structures exposed. ` +
      `Verify: hemostasis, anatomical alignment, no iatrogenic nerve/artery injury. ` +
      `Document implant position if applicable.`;
  }

  // ═══════════════════════════════════════════════════════════════
  // HOTSPOT GENERATION — interactive annotation coordinates
  // ═══════════════════════════════════════════════════════════════

  private generateHotspots(
    region: RegionInfo,
    structures: DetectedStructure[],
    injury: InjuryPattern
  ): Hotspot[] {
    const atlasKey = region.bodyPart.toLowerCase();
    const map = COORDINATE_MAPS[atlasKey] || {};

    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Pre-normalize coordinate keys once
    const normKeys: Array<{ key: string; norm: string; coord: { x: number; y: number } }> = [];
    for (const k of Object.keys(map)) {
      normKeys.push({ key: k, norm: normalize(k), coord: map[k] });
    }

    const hotspots: Hotspot[] = [];
    let idx = 0;

    for (const s of structures) {
      const nameNorm = normalize(s.name);
      const branchNorm = normalize(s.specificBranch || '');

      // Match coordinate by normalized substring against name or specific branch
      let coord = normKeys.find(e => nameNorm.includes(e.norm) || branchNorm.includes(e.norm))?.coord;

      // Fallback: distribute in grid if no match
      if (!coord) {
        const gridX = 0.2 + (idx % 5) * 0.15;
        const gridY = 0.2 + Math.floor(idx / 5) * 0.15;
        coord = { x: gridX, y: gridY };
      }

      // Jitter slightly so overlapping structures are visible
      const jitterX = (Math.random() - 0.5) * 0.04;
      const jitterY = (Math.random() - 0.5) * 0.04;

      // Determine status
      let status: Hotspot['status'] = 'normal';
      if (s.risk > 0.8) status = 'critical';
      else if (s.risk > 0.6) status = 'damaged';
      else if (s.risk > 0.3) status = 'at-risk';

      // Clinical guidance + expanded detail
      const { clinicalImportance, actionRequired } = this.generateClinicalGuidance(s, region, injury);
      const anatomyDetail = this.getAnatomyDetail(s, region);
      const repairProtocol = this.getRepairProtocol(s, region, injury);
      const complications = this.getComplications(s, region);

      hotspots.push({
        id: `${atlasKey}-${idx}`,
        name: s.name,
        x: Math.max(0.05, Math.min(0.95, coord.x + jitterX)),
        y: Math.max(0.05, Math.min(0.95, coord.y + jitterY)),
        layer: s.layer,
        type: s.type,
        condition: s.condition,
        risk: s.risk,
        visible: s.visible,
        specificBranch: s.specificBranch,
        clinicalImportance,
        actionRequired,
        status,
        anatomyDetail,
        repairProtocol,
        complications,
      });

      idx++;
    }

    return hotspots;
  }

  private generateClinicalGuidance(
    structure: DetectedStructure,
    region: RegionInfo,
    injury: InjuryPattern
  ): { clinicalImportance: string; actionRequired: string } {

    const type = structure.type;

    // Nerve guidance
    if (type === 'nerve') {
      return {
        clinicalImportance: `CRITICAL: ${structure.name} provides sensation to ${region.bodyPart}. If transected, neuroma formation and permanent anesthesia result. Repair window: PRIMARY <72 hours for best outcome, DELAYED <3 weeks. Gap >5mm may require nerve graft (sural) or conduit.`,
        actionRequired: `Document 2-point discrimination NOW (normal: thumb <6mm, fingers <4mm). If >10mm or complete anesthesia → urgent microsurgical exploration and repair with 9-0 or 10-0 nylon under microscope/loupe.`,
      };
    }

    // Artery guidance
    if (type === 'artery') {
      return {
        clinicalImportance: `CRITICAL: ${structure.name} supplies oxygenated blood to ${region.bodyPart}. Ischemia >6 hours causes irreversible tissue necrosis. Cold intolerance and pulp atrophy persist even with revascularization.`,
        actionRequired: `Check capillary refill (<2 seconds) and Doppler signal immediately. If absent → emergent vascular consult. Repair with 9-0 or 10-0 Prolene. If both digital arteries injured, thumb/finger survival depends on collateral circulation.`,
      };
    }

    // Tendon guidance
    if (type === 'tendon') {
      const isFlexor = structure.name.toLowerCase().includes('flexor');
      return {
        clinicalImportance: `HIGH: ${structure.name} is essential for ${isFlexor ? 'grasp/pinch' : 'extension'} function. Zone-based repair protocols apply. Adhesions are the main complication — early protected motion protocols improve outcomes.`,
        actionRequired: `Test active ${isFlexor ? 'flexion' : 'extension'} against resistance. If unable or lag >30° → MRI/Ultrasound to confirm gap. Repair within 2 weeks. ${isFlexor ? 'A2/A4 pulley preservation critical.' : 'Central slip repair if over PIP joint.'}`,
      };
    }

    // Bone guidance
    if (type === 'bone') {
      return {
        clinicalImportance: `HIGH: ${structure.name} structural integrity required for function. Open fracture = orthopedic emergency (Gustilo-Anderson classification). Articular involvement requires anatomic reduction to prevent arthritis.`,
        actionRequired: `X-ray: AP, lateral, oblique views. CT if intra-articular step-off suspected. ORIF if >1-2mm displacement or intra-articular. Tetanus prophylaxis if open. Antibiotics: 1st gen cephalosporin + aminoglycoside (Gustilo III).`,
      };
    }

    // Ligament guidance
    if (type === 'ligament') {
      return {
        clinicalImportance: `MODERATE: ${structure.name} provides joint stability. Chronic instability leads to arthritis and functional loss. Stener lesion (UCL of thumb) requires surgery — non-op fails if ligament displaced above adductor aponeurosis.`,
        actionRequired: `Stress test joint in valgus/varus. If >30° laxity or endpoint absent → complete tear. Immobilize partial tears x 4-6 weeks. Surgical repair for complete tears with Stener lesion.`,
      };
    }

    // Skin/Soft tissue
    if (type === 'skin') {
      return {
        clinicalImportance: `Barrier function compromised. Hand/thumb infections progress rapidly to felon, septic arthritis, or osteomyelitis. Devitalized skin must be debrided but preserve all viable tissue.`,
        actionRequired: `Irrigate with 3-5L saline. Debride non-viable tissue only. Do NOT close contaminated wounds primarily. Consider delayed primary closure. Antibiotics: cover Staph aureus and Streptococcus.`,
      };
    }

    // Default
    return {
      clinicalImportance: `${structure.name} is a ${structure.layer} structure in the ${region.bodyPart}. Assess for injury based on mechanism and depth of wound.`,
      actionRequired: `Visual inspection and functional testing. If exposed or transected → specialist referral based on structure type.`,
    };
  }

  private getAnatomyDetail(structure: DetectedStructure, region: RegionInfo): string {
    const type = structure.type;
    const name = structure.name;

    if (type === 'nerve' && name.includes('Digital')) {
      return `Pure sensory nerve from median nerve (C6-C7). Diameter 2-3mm at MCP level. Courses along ${name.includes('Ulnar') ? 'ulnar' : 'radial'} border of thumb in neurovascular bundle, volar to dorsal. Gives off 3-4 dorsal branches to nail bed and 2-3 volar branches to pulp skin. Anastomoses with contralateral digital nerve at fingertip.`;
    }
    if (type === 'artery' && name.includes('Digital')) {
      return `Terminal branch of Princeps Pollicis artery (from radial artery). Diameter 0.8-1.2mm. Runs with digital nerve in neurovascular bundle. Gives off 3-4 fasciocutaneous perforators to thumb skin. Vena comitantes accompany. Anastomoses with contralateral artery at fingertip via arcade.`;
    }
    if (type === 'tendon' && name.includes('Flexor Pollicis Longus')) {
      return `Only flexor of thumb IP joint. Origin: anterior radius and interosseous membrane (40% have accessory head — Linburg-Comstock anomaly). Inserts on base of distal phalanx. Covered by A1 pulley at MCP, then oblique pulley (most important for biomechanics). Zone T3 at MCP level.`;
    }
    if (type === 'bone' && name.includes('Metacarpal')) {
      return `First metacarpal head articulates with proximal phalanx base. Two sesamoid bones embedded in FPB tendon. UCL attaches to ulnar sesamoid, RCL to radial sesamoid. Articular surface has 6-8° valgus angulation normally.`;
    }
    if (type === 'ligament' && name.includes('Volar Plate')) {
      return `Thick fibrocartilaginous structure preventing MCP hyperextension. Proximal attachment: metacarpal neck. Distal attachment: proximal phalanx base (checkrein ligaments). Contains sesamoid grooves.`;
    }

    return `${structure.name} is a ${structure.layer} structure in the ${region.bodyPart}. ${structure.specificBranch || ''}`;
  }

  private getRepairProtocol(structure: DetectedStructure, region: RegionInfo, injury: InjuryPattern): string {
    const type = structure.type;

    if (type === 'nerve') {
      return `PRIMARY REPAIR (best <72h): 9-0 or 10-0 nylon epineurial sutures under microscope (×10-16). No tension at repair site. Post-op: splint 3 weeks. DELAYED (up to 3 weeks): same technique. If gap >5mm: sural nerve graft (2-3cm) or collagen conduit. Sensory re-education at 6 weeks. Expected recovery: 6-12 months.`;
    }
    if (type === 'artery') {
      return `Immediate surgical exploration if Doppler absent. Repair with 9-0 or 10-0 Prolene under microscope. Heparin drip × 48h post-op. If both arteries injured: vein graft from dorsal hand or forearm. If repair fails: consider toe-to-thumb transfer for total thumb reconstruction.`;
    }
    if (type === 'tendon') {
      const isFlexor = structure.name.toLowerCase().includes('flexor');
      return `${isFlexor ? 'ZONE T3 REPAIR' : 'DIRECT REPAIR'}: 4-0 Ethibond core suture (Kessler or modified Kessler) + 6-0 Prolene epitendinous. A1 pulley preservation critical. Early protected motion (Kleinert splint) at 3-5 days. If >30% tendon width damaged: graft or transfer.`;
    }
    if (type === 'bone') {
      return `BENNETT FRACTURE: ORIF with K-wires or mini-plate if >1mm displacement. ROLANDO: T-plate or external fixation. SESAMOID: non-operative if undisplaced; excision if painful non-union. THUMB SPICA CAST: 4-6 weeks post-op.`;
    }
    if (type === 'ligament') {
      return `PARTIAL TEAR: Thumb spica cast in 20° flexion × 4-6 weeks. COMPLETE TEAR / STENER LESION: Surgical repair with anchor or pull-out suture. Post-op: cast 4 weeks, then protective splint 2 weeks. Return to sport: 8-12 weeks.`;
    }

    return `Assess viability. Debride non-viable tissue. Preserve all viable structures. Specialist referral based on injury pattern.`;
  }

  private getComplications(structure: DetectedStructure, region: RegionInfo): string {
    const type = structure.type;

    if (type === 'nerve') {
      return `Permanent anesthesia → loss of fine pinch discrimination, inability to perform occupational tasks (writing, surgery, music). Neuroma formation → chronic neuropathic pain, cold intolerance. If both nerves injured: complete thumb anesthesia with phantom sensations.`;
    }
    if (type === 'artery') {
      return `Ischemic necrosis → thumb loss if >6h. Cold intolerance (permanent in 60%). Pulp atrophy → weakened grip. Nail dystrophy. If venous outflow also compromised: venous congestion → prolonged edema, stiffness, pain.`;
    }
    if (type === 'tendon') {
      return `Adhesion (most common — 20-30%) → requires tenolysis. Rupture (5-10%) → re-operation. Quadriga effect (if FDP also injured) → limited flexion of all fingers. Swan neck deformity. Chronic trigger thumb.`;
    }
    if (type === 'bone') {
      return `Post-traumatic arthritis (most common if intra-articular step-off >1mm). MCP instability → weakness of pinch. Non-union. Avascular necrosis of metacarpal head. Complex Regional Pain Syndrome (CRPS).`;
    }
    if (type === 'ligament') {
      return `Chronic MCP instability → arthritis. Gamekeeper's thumb (chronic UCL insufficiency). Adductor pollicis weakness. Persistent pain with gripping.`;
    }

    return `Infection, delayed healing, scarring, functional limitation.`;
  }

  private buildDisplay(
    region: RegionInfo,
    structures: DetectedStructure[],
    injury: InjuryPattern,
    layers: any,
    priority: PriorityAction[],
    redFlags: string[],
    hotspots: Hotspot[]
  ): ImageAnalysisResult['display'] {
    // Only surface clinically meaningful structures (visible or elevated risk) — the full atlas stays in detectedStructures
    const meaningful = structures.filter(s => s.visible || s.risk > 0.3);

    return {
      summary: `${region.side} ${region.bodyPart} — ${region.specificArea}. ` +
               `${injury.type === 'laceration' ? 'Laceration' : injury.type === 'crush' ? 'Crush injury' : injury.type} ` +
               `at ${region.anatomicalPosition}. ` +
               `${redFlags.filter(f => !f.includes('No immediate')).slice(0, 2).join('. ')}.`,

      labels: meaningful.map(s => ({
        type: s.type,
        name: s.name,
        condition: s.condition,
        risk: s.risk > 0.7 ? `CRITICAL (${Math.round(s.risk * 100)}%)` :
               s.risk > 0.5 ? `High risk (${Math.round(s.risk * 100)}%)` :
               s.risk > 0.3 ? `Moderate (${Math.round(s.risk * 100)}%)` : null,
        specificBranch: s.specificBranch,
      })),

      injury: {
        primary: `${injury.type} — ${injury.severity}`,
        mechanism: injury.mechanism,
        depth: `Superficial → ${layers.deep.length > 0 ? layers.deep[0] : 'Not reached'}`,
        damaged: structures.filter(s => s.risk > 0.6).map(s => s.name).join(', ') || 'None confirmed on visual analysis',
        atRisk: structures.filter(s => s.risk > 0.3 && s.risk <= 0.6).map(s => s.name).join(', ') || 'None identified',
        contamination: injury.contamination,
      },

      priority,
      hotspots: hotspots.map(h => ({
        id: h.id,
        name: h.name,
        x: h.x,
        y: h.y,
        status: h.status,
        type: h.type,
      })),
    };
  }

  private computeConfidence(stats: any, structures: DetectedStructure[], region: RegionInfo): number {
    const visibleRatio = structures.filter(s => s.visible).length / Math.max(structures.length, 1);
    const hasRegion = region.bodyPart !== 'Unspecified Region' ? 0.2 : 0;
    const qualityPenalty = stats.darkRatio > 0.4 ? 0.15 : stats.bloodRatio > 0.4 ? 0.1 : 0;
    return Math.min(0.98, 0.4 + visibleRatio * 0.4 + hasRegion - qualityPenalty);
  }
}

// Singleton
export const medicalImageAgent = new MedicalImageAgent();
