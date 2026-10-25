// Comprehensive Orthopedic Classification & Treatment Database
// Based on AO/OTA and Sub-specialty Classification Systems
// v2.0 — Extended: Pelvis, Clavicle, Calcaneus, Denis Spine, Salter-Harris, Pauwels

export interface FractureClassification {
  id: string;
  bone: string;
  region: string;
  system: "AO/OTA" | "Neer" | "Garden" | "Pauwels" | "Schatzker" | "Weber" | "Gustilo-Anderson" | "Mason" | "Salter-Harris" | "Denis" | "Essex-Lopresti" | "Young-Burgess" | "Robinson";
  code: string;
  name: string;
  description: string;
  severity: "low" | "moderate" | "high" | "critical";
  treatmentOptions: {
    conservative: string[];
    surgical: string[];
    implants: string[];
    postOpCare: string;
    complications: string[];
  };
  reconstruction3DParams: {
    fractureLevel: number; // 0.0 (proximal) to 1.0 (distal)
    gapMm: number;
    angulationDeg: number;
    displacementMm: number;
    fragments: number;
    osteotomyPlanes?: { angle: number; position: number; label?: string }[];
    boneGeometry?: "cylinder" | "curved" | "flat" | "irregular";
  };
}

export const ORTHO_BONES = [
  { id: "humerus",       name: "Humerus",           region: "Upper Limb",    icon: "💪" },
  { id: "radius_ulna",  name: "Radius / Ulna",     region: "Upper Limb",    icon: "🦴" },
  { id: "femur",        name: "Femur",              region: "Lower Limb",    icon: "🦵" },
  { id: "tibia_fibula", name: "Tibia / Fibula",    region: "Lower Limb",    icon: "🦴" },
  { id: "mandible",     name: "Mandible",           region: "Craniofacial",  icon: "🦷" },
  { id: "pelvis",       name: "Pelvis / Acetabulum",region: "Pelvic Ring",   icon: "🦴" },
  { id: "clavicle",     name: "Clavicle",           region: "Shoulder",      icon: "🦴" },
  { id: "calcaneus",    name: "Calcaneus",          region: "Hindfoot",      icon: "🦶" },
  { id: "spine",        name: "Thoracolumbar Spine",region: "Axial Skeleton",icon: "🦴" },
  { id: "patella",      name: "Patella",            region: "Knee",          icon: "🦴" },
];

export const FRACTURE_CLASSIFICATIONS: FractureClassification[] = [
  // ─────────────────────────────────────────────────────────────────────────
  //  HUMERUS
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "ao-12-a1",
    bone: "humerus",
    region: "Midshaft",
    system: "AO/OTA",
    code: "12-A1",
    name: "Simple Spiral Diaphyseal Fracture",
    severity: "moderate",
    description: "Spiral fracture of the humeral shaft typically from torsion injury. Low energy mechanism, periosteal sleeve often intact. Associated radial nerve palsy in 11–18% of cases (Holstein-Lewis pattern).",
    treatmentOptions: {
      conservative: [
        "Coaptation splint (acute 1–2 wk) followed by Sarmiento functional brace",
        "Sling immobilization with early pendulum ROM at 2 weeks",
        "Acceptable alignment: <20° anterior, <30° varus/valgus, <3 cm shortening",
      ],
      surgical: [
        "Open reduction internal fixation (ORIF) with 3.5mm/4.5mm LCP — preferred if radial nerve palsy on presentation or post-reduction",
        "Antegrade or retrograde intramedullary humeral nailing (avoid in proximal or distal 1/3)",
      ],
      implants: [
        "Broad 4.5mm LC-DCP / LCP Plate",
        "Interlocking Intramedullary Humeral Nail (Synthes Expert / Stryker T2)",
        "Cortical screws 4.5mm (lag technique across spiral plane)",
      ],
      postOpCare: "Pendulum exercises at 10–14 days; active forward elevation once bridging callus visible (approx. 4–6 wk); monitor radial nerve recovery.",
      complications: ["Radial nerve palsy (Holstein-Lewis)", "Nonunion (5–10%)", "Vascular injury (brachial artery)", "Shoulder impingement (IM nail)"],
    },
    reconstruction3DParams: {
      fractureLevel: 0.5,
      gapMm: 2.5,
      angulationDeg: 12,
      displacementMm: 8,
      fragments: 2,
      boneGeometry: "cylinder",
    },
  },
  {
    id: "ao-12-b2",
    bone: "humerus",
    region: "Midshaft",
    system: "AO/OTA",
    code: "12-B2",
    name: "Wedge Fracture with Intact Butterfly Fragment",
    severity: "moderate",
    description: "Bending fracture of humeral diaphysis featuring a distinct triangular wedge fragment preserving cortical contact at the apex.",
    treatmentOptions: {
      conservative: [
        "Functional bracing if angulation <20° anterior and <30° varus/valgus, with <3 cm shortening",
      ],
      surgical: [
        "ORIF with bridge plating preserving wedge vascularity (MIPO approach preferred)",
        "Humeral intramedullary locking nail (if butterfly small/non-significant)",
      ],
      implants: [
        "Anatomical Humeral Shaft LCP",
        "Multi-axial angle-stable locking screws",
        "Cable cerclage for large butterfly fragment",
      ],
      postOpCare: "Protect against external rotational stress; monitor radial nerve neuropraxia closely.",
      complications: ["Radial nerve injury", "Nonunion due to devascularized fragment", "Plate failure if premature weight-bearing"],
    },
    reconstruction3DParams: {
      fractureLevel: 0.52,
      gapMm: 4.0,
      angulationDeg: 18,
      displacementMm: 12,
      fragments: 3,
      boneGeometry: "cylinder",
    },
  },
  {
    id: "ao-12-c3",
    bone: "humerus",
    region: "Midshaft",
    system: "AO/OTA",
    code: "12-C3",
    name: "Complex Comminuted Humeral Shaft Fracture",
    severity: "high",
    description: "High-energy comminuted fracture of the humeral diaphysis with multiple fragments and no cortical contact. Often associated with polytrauma.",
    treatmentOptions: {
      conservative: ["Temporizing coaptation splint + skeletal traction until surgically stable"],
      surgical: [
        "Bridge plating with MIPO technique across comminuted zone",
        "External fixator if contaminated wound or vascular injury requiring rapid stabilization",
      ],
      implants: [
        "Long Broad LCP 4.5mm (spanning all fragments)",
        "AO Delta Frame External Fixator (temporary)",
      ],
      postOpCare: "Non-weight bearing; strict elevation; serial neurovascular checks for 72 hours.",
      complications: ["Nonunion (up to 15% in C-type)", "Vascular injury requiring repair", "Compartment syndrome"],
    },
    reconstruction3DParams: {
      fractureLevel: 0.48,
      gapMm: 8.0,
      angulationDeg: 22,
      displacementMm: 18,
      fragments: 5,
      boneGeometry: "cylinder",
    },
  },
  {
    id: "neer-prox-humerus",
    bone: "humerus",
    region: "Proximal Humerus",
    system: "Neer",
    code: "Neer 3-Part",
    name: "Three-Part Proximal Humeral Fracture (Surgical Neck + Greater Tuberosity)",
    severity: "high",
    description: "Displaced fracture involving surgical neck and greater tuberosity (>1 cm displacement or >45° angulation). Disrupted rotator cuff attachment.",
    treatmentOptions: {
      conservative: ["Reserved for elderly low-demand patients with severe surgical contraindications"],
      surgical: [
        "ORIF with proximal humerus internal locking system (PHILOS plate)",
        "Reverse shoulder arthroplasty for osteoporotic bone or failed ORIF",
      ],
      implants: [
        "PHILOS / Anatomical Proximal Humeral LCP",
        "Ethibond / FiberWire suture augmentation for rotator cuff",
        "Calcar support locking screws (to prevent varus collapse)",
      ],
      postOpCare: "Sling for 3 weeks; progressive passive to active-assisted physiotherapy at 6 weeks.",
      complications: ["Avascular necrosis of humeral head (15–30%)", "Loss of fixation / screw perforation", "Malunion / varus collapse"],
    },
    reconstruction3DParams: {
      fractureLevel: 0.15,
      gapMm: 3.5,
      angulationDeg: 25,
      displacementMm: 14,
      fragments: 3,
      boneGeometry: "cylinder",
    },
  },
  {
    id: "neer-4-part",
    bone: "humerus",
    region: "Proximal Humerus",
    system: "Neer",
    code: "Neer 4-Part",
    name: "Four-Part Proximal Humeral Fracture",
    severity: "critical",
    description: "All four major segments displaced: humeral head, surgical neck, greater tuberosity, lesser tuberosity. Very high AVN risk (>70%).",
    treatmentOptions: {
      conservative: ["Not recommended — AVN risk prohibitive"],
      surgical: [
        "Reverse Total Shoulder Arthroplasty (rTSA) — treatment of choice in elderly",
        "Hemi-arthroplasty (rare — if <65y, good bone stock)",
        "ORIF only in young high-demand patients <50y with excellent bone quality",
      ],
      implants: [
        "Reverse Shoulder Prosthesis (Delta III / Grammont design)",
        "Modular Humeral Stem",
        "Suture reattachment of tuberosities",
      ],
      postOpCare: "Sling 4–6 weeks; avoid active abduction until tuberosities healed; outpatient physiotherapy at 6 weeks.",
      complications: ["Prosthesis loosening", "Dislocation", "Acromial stress fracture (rTSA-specific)", "Glenoid notching"],
    },
    reconstruction3DParams: {
      fractureLevel: 0.1,
      gapMm: 5.0,
      angulationDeg: 40,
      displacementMm: 18,
      fragments: 4,
      boneGeometry: "cylinder",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  //  FEMUR
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "ao-32-a1",
    bone: "femur",
    region: "Diaphysis",
    system: "AO/OTA",
    code: "32-A1",
    name: "Femoral Shaft Simple Spiral Fracture",
    severity: "high",
    description: "High-energy spiral fracture of the middle third of femur diaphysis with potential neurovascular or compartment tension. 1.2L blood loss typical.",
    treatmentOptions: {
      conservative: ["Skeletal traction (temporary bridging until urgent definitive fixation)"],
      surgical: [
        "Reamed antegrade or retrograde femoral intramedullary nail (Gold Standard)",
        "Submuscular bridge plating if proximal/distal extension precludes nailing",
      ],
      implants: [
        "Reamed Femoral Interlocking Nail (diameter 10–12 mm)",
        "Proximal cephalomedullary or transverse locking bolts",
        "Distal multi-planar dynamic/static locking screws",
      ],
      postOpCare: "Immediate partial weight-bearing with crutches/walker; early quadriceps isometric exercises; DVT prophylaxis.",
      complications: ["Compartment syndrome", "Malrotation after IM nailing", "DVT/PE", "Anterior knee pain (retrograde nail entry)"],
    },
    reconstruction3DParams: {
      fractureLevel: 0.5,
      gapMm: 3.0,
      angulationDeg: 10,
      displacementMm: 15,
      fragments: 2,
      boneGeometry: "cylinder",
    },
  },
  {
    id: "garden-femur-neck",
    bone: "femur",
    region: "Femoral Neck",
    system: "Garden",
    code: "Garden III/IV",
    name: "Displaced Subcapital Femoral Neck Fracture",
    severity: "critical",
    description: "Completely displaced subcapital fracture with disrupted trabecular lines. High AVN risk >50% in displaced variants.",
    treatmentOptions: {
      conservative: ["Non-surgical management contraindicated except in palliative/end-stage patients"],
      surgical: [
        "Bipolar Hemiarthroplasty (elderly >70y)",
        "Total Hip Arthroplasty (active elderly / pre-existing arthritis)",
        "Closed reduction + cannulated cancellous screws (young patients <60y, emergency pathway within 6h)",
      ],
      implants: [
        "Modular Bipolar Femoral Stem and Head",
        "Cemented / Uncemented Femoral Stem",
        "Triangular inverted 7.3 mm Cannulated Screws",
      ],
      postOpCare: "Full weight bearing as tolerated on post-op day 1 for arthroplasty; hip precautions for 6 weeks.",
      complications: ["AVN (>50% displaced)", "Nonunion after screw fixation", "Dislocation post-arthroplasty", "Periprosthetic fracture"],
    },
    reconstruction3DParams: {
      fractureLevel: 0.08,
      gapMm: 5.0,
      angulationDeg: 35,
      displacementMm: 16,
      fragments: 2,
      boneGeometry: "curved",
    },
  },
  {
    id: "pauwels-femur-neck",
    bone: "femur",
    region: "Femoral Neck",
    system: "Pauwels",
    code: "Pauwels Type III",
    name: "Vertical Stress Femoral Neck Fracture",
    severity: "high",
    description: "Steep (>70°) vertical fracture line with strong shear forces. High failure rate with conventional screw fixation. Typically in young patients after high-energy trauma.",
    treatmentOptions: {
      conservative: ["Not recommended for Pauwels III"],
      surgical: [
        "Valgus-producing intertrochanteric osteotomy + internal fixation (young active patients)",
        "ORIF with valgus intertrochanteric osteotomy to convert shear to compressive forces",
        "Sliding hip screw with derotation screw for less vertical patterns",
      ],
      implants: [
        "135° Angled Blade Plate / DHS Barrel",
        "Compression Hip Screw + Derotation Screw",
        "Cannulated Screws (Pauwels I/II only)",
      ],
      postOpCare: "Toe-touch weight-bearing until consolidation; monitor for avascular necrosis.",
      complications: ["High nonunion rate (>25%) if not adequately stabilized", "Cut-out of fixation device", "AVN"],
    },
    reconstruction3DParams: {
      fractureLevel: 0.07,
      gapMm: 3.5,
      angulationDeg: 70,
      displacementMm: 10,
      fragments: 2,
      boneGeometry: "curved",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  //  TIBIA & FIBULA
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "ao-42-a1",
    bone: "tibia_fibula",
    region: "Midshaft",
    system: "AO/OTA",
    code: "42-A1",
    name: "Tibial Shaft Simple Spiral Fracture",
    severity: "moderate",
    description: "Torsional fracture of tibial diaphysis with or without accompanying fibular fracture. Common sports and road-traffic injury.",
    treatmentOptions: {
      conservative: [
        "Long leg cast 4–6 weeks followed by PTB (patellar tendon-bearing) cast if <5° varus/valgus, <1 cm shortening",
      ],
      surgical: [
        "Reamed tibial intramedullary interlocking nail — infrapatellar or suprapatellar approach",
        "External fixator if Gustilo-Anderson IIIB/IIIC open wound",
      ],
      implants: [
        "Expert Tibial Nail (ETN) with multi-directional distal locking",
        "AO Tubular External Fixator with Schanz pins",
        "3.5mm LCP (small fragment bridge plate for distal extension)",
      ],
      postOpCare: "Early weight bearing according to callus formation; monitor compartment syndrome within first 48 hours.",
      complications: ["Compartment syndrome (emergent fasciotomy)", "Delayed union / nonunion", "Malrotation", "Infection (open fractures)"],
    },
    reconstruction3DParams: {
      fractureLevel: 0.55,
      gapMm: 2.0,
      angulationDeg: 8,
      displacementMm: 6,
      fragments: 2,
      boneGeometry: "cylinder",
    },
  },
  {
    id: "schatzker-tibia-plateau",
    bone: "tibia_fibula",
    region: "Proximal Tibia",
    system: "Schatzker",
    code: "Schatzker II",
    name: "Split-Depression Lateral Tibial Plateau Fracture",
    severity: "moderate",
    description: "Cleavage and articular depression of the lateral tibial plateau, frequently associated with lateral meniscus tears (80%) and ACL injury (10–30%).",
    treatmentOptions: {
      conservative: ["Hinged knee brace if depression <4 mm and joint stable in full extension"],
      surgical: [
        "Arthrotomy / arthroscopy-assisted elevation of joint depression, bone grafting, lateral buttress/locking plate",
        "Arthroscopy for associated meniscus tear",
      ],
      implants: [
        "3.5 mm / 4.5 mm Lateral Proximal Tibial LCP",
        "Cancellous autograft or calcium phosphate void filler",
        "Subchondral raft screws (for articular support)",
      ],
      postOpCare: "Non-weight bearing 6–8 weeks; CPM (continuous passive motion) immediately post-op; meniscus healing protocol.",
      complications: ["Post-traumatic arthritis", "Knee instability (ligament injury)", "Compartment syndrome", "Wound dehiscence"],
    },
    reconstruction3DParams: {
      fractureLevel: 0.1,
      gapMm: 4.5,
      angulationDeg: 14,
      displacementMm: 9,
      fragments: 3,
      boneGeometry: "flat",
    },
  },
  {
    id: "ao-44-b2",
    bone: "tibia_fibula",
    region: "Distal Tibia",
    system: "AO/OTA",
    code: "44-B2",
    name: "Bimalleolar Ankle Fracture",
    severity: "moderate",
    description: "Fractures of both medial and lateral malleoli with disruption of ankle mortise. Significant risk of talar shift and arthritis.",
    treatmentOptions: {
      conservative: [
        "Short leg cast / walking boot only if non-displaced and mortise intact on stress views",
      ],
      surgical: [
        "ORIF: lateral malleolus one-third tubular plate + medial malleolus lag screws",
        "Restore talar alignment within the mortise — critical for outcome",
      ],
      implants: [
        "3.5 mm One-Third Tubular Plate (lateral)",
        "4.0 mm Cancellous Lag Screws (medial malleolus)",
        "Syndesmotic Screw (if Lauge-Hansen SERO IV / Weber C)",
      ],
      postOpCare: "Non-weight bearing 6 weeks; progressive rehabilitation; remove syndesmotic screw at 8–12 weeks before full weight-bearing.",
      complications: ["Syndesmosis malreduction", "Wound breakdown (thin skin)", "Post-traumatic arthritis", "Sural nerve injury"],
    },
    reconstruction3DParams: {
      fractureLevel: 0.92,
      gapMm: 3.0,
      angulationDeg: 10,
      displacementMm: 7,
      fragments: 2,
      boneGeometry: "irregular",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  //  MANDIBLE & CRANIOFACIAL
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "mandible-body-angle",
    bone: "mandible",
    region: "Body / Angle",
    system: "AO/OTA",
    code: "AO CMF 91-B/C",
    name: "Mandibular Angle / Body Fracture with Malocclusion",
    severity: "moderate",
    description: "Fracture through the mandibular angle or body behind molar teeth, frequently displaced by masseter and pterygoid pull. Malocclusion and mouth opening limitation hallmark.",
    treatmentOptions: {
      conservative: [
        "Closed reduction with Maxillomandibular Fixation (MMF) using arch bars or IMF screws (4–6 weeks)",
      ],
      surgical: [
        "ORIF via transoral approach per Champy's ideal osteosynthesis line with 2.0 mm locking miniplates",
        "2.4 mm Mandibular Locking Reconstruction Plate (for comminuted or infected cases)",
        "Free fibula flap reconstruction (if extensive bony loss or tumor resection margin clearance required)",
      ],
      implants: [
        "2.0 mm Miniplates & Monocortical Screws (Champy technique — 1 superior, 1 inferior border for angle)",
        "2.4 mm Mandibular Locking Reconstruction Plate",
        "Bicortical lag screws for symphysis fractures",
      ],
      postOpCare: "Soft/liquid diet for 4–6 weeks; optimal oral hygiene and 0.12% chlorhexidine rinses; remove MMF at 4 weeks.",
      complications: ["Plate infection/exposure", "Malocclusion", "Inferior alveolar nerve paresthesia", "Nonunion (heavy smokers, diabetics)"],
    },
    reconstruction3DParams: {
      fractureLevel: 0.45,
      gapMm: 3.0,
      angulationDeg: 15,
      displacementMm: 7,
      fragments: 2,
      boneGeometry: "curved",
      osteotomyPlanes: [
        { angle: 45, position: 0.35, label: "Champy's Line A" },
        { angle: 60, position: 0.65, label: "Champy's Line B" },
      ],
    },
  },
  {
    id: "mandible-condyle",
    bone: "mandible",
    region: "Condylar Process",
    system: "AO/OTA",
    code: "AO CMF 91-A",
    name: "Condylar Subcondylar Fracture",
    severity: "moderate",
    description: "Fracture at the condylar head or neck — most common mandibular fracture site (30–40%). Chin trauma causes bilateral condyle fractures.",
    treatmentOptions: {
      conservative: [
        "Closed MMF for 10–14 days + physiotherapy in undisplaced fractures, children, and intracapsular fractures",
      ],
      surgical: [
        "Open reduction via retromandibular / transparotid approach for displaced or dislocated condylar neck fractures in adults",
        "ORIF restores vertical ramus height and prevents ankylosis",
      ],
      implants: [
        "2.0 mm Locking Titanium Miniplates (Synthes Matrix / Stryker KLS Martin)",
        "Subcondylar plate system with monocortical screws",
      ],
      postOpCare: "Elastic traction for occlusal guidance; aggressive physiotherapy for TMJ mobility from week 2; monthly CBCT for 6 months.",
      complications: ["TMJ ankylosis", "Facial nerve palsy (transient)", "Frey's syndrome", "Malocclusion"],
    },
    reconstruction3DParams: {
      fractureLevel: 0.05,
      gapMm: 2.0,
      angulationDeg: 20,
      displacementMm: 10,
      fragments: 2,
      boneGeometry: "curved",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  //  RADIUS & ULNA
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "ao-2r3-a2",
    bone: "radius_ulna",
    region: "Distal Radius",
    system: "AO/OTA",
    code: "2R3-A2 (Colles')",
    name: "Extra-Articular Distal Radius Fracture with Dorsal Tilt",
    severity: "moderate",
    description: "Extra-articular fracture of the distal radius with dorsal displacement, radial shortening, and loss of volar tilt (Colles' fracture). FOOSH mechanism.",
    treatmentOptions: {
      conservative: [
        "Closed reduction and sugar-tong splint / below-elbow cast if acceptable alignment restored (radial inclination >15°, dorsal tilt <10°, shortening <5 mm)",
      ],
      surgical: [
        "ORIF with volar locking compression plate (VLP) via modified Henry approach — younger patients / unacceptable alignment after reduction",
        "Percutaneous K-wire pinning + cast (elderly / soft tissue at risk)",
      ],
      implants: [
        "2.4 mm / 2.7 mm Variable-Angle Volar Distal Radius LCP (Synthes / Depuy)",
        "1.6 mm Kirschner Wires",
        "Subchondral distal pegs / locking screws",
      ],
      postOpCare: "Immediate active finger / thumb mobilization; wrist active-assisted ROM at 2 weeks; pronation/supination at 4 weeks.",
      complications: ["Extensor pollicis longus (EPL) rupture", "Carpal tunnel syndrome", "CRPS Type I", "Loss of reduction"],
    },
    reconstruction3DParams: {
      fractureLevel: 0.9,
      gapMm: 2.0,
      angulationDeg: 22,
      displacementMm: 5,
      fragments: 2,
      boneGeometry: "flat",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  //  CLAVICLE
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "robinson-clavicle-2a",
    bone: "clavicle",
    region: "Mid-Shaft",
    system: "Robinson",
    code: "Robinson 2A",
    name: "Displaced Mid-Shaft Clavicle Fracture",
    severity: "moderate",
    description: "The most common clavicle fracture pattern (80%). Displacement from sternocleidomastoid pull superiorly and gravity + limb weight inferiorly.",
    treatmentOptions: {
      conservative: [
        "Broad arm sling for 4–6 weeks — acceptable for minimally displaced fractures",
        "Figure-of-8 bandage (limited evidence, less comfortable)",
      ],
      surgical: [
        "ORIF with anatomical pre-contoured locking plate (for shortening >2 cm, >100% displacement, skin tent, open fractures, bilateral, floating shoulder)",
        "Intramedullary fixation with elastic titanium nail (TEN)",
      ],
      implants: [
        "3.5 mm Clavicle Anatomical Locking Plate (superior or anteroinferior)",
        "Elastic Titanium Nail (TEN) 2.0–2.5 mm",
        "Cortical screws 3.5 mm",
      ],
      postOpCare: "Sling 2 weeks post-ORIF; progressive active ROM; return to contact sports at 3–4 months.",
      complications: ["Nonunion (up to 15% displaced, 1% non-displaced)", "Hardware irritation", "Brachial plexus stretch injury", "Subclavian vessel proximity"],
    },
    reconstruction3DParams: {
      fractureLevel: 0.5,
      gapMm: 4.0,
      angulationDeg: 20,
      displacementMm: 15,
      fragments: 2,
      boneGeometry: "curved",
    },
  },
  {
    id: "robinson-clavicle-3b",
    bone: "clavicle",
    region: "Lateral / Distal",
    system: "Robinson",
    code: "Robinson 3B",
    name: "Displaced Lateral Clavicle Fracture (Ligament Ruptured)",
    severity: "high",
    description: "Distal clavicle fracture medial to intact conoid/trapezoid ligaments — leading to superior displacement of medial fragment (like AC joint disruption).",
    treatmentOptions: {
      conservative: ["Conservative management has high nonunion rate (>30%)"],
      surgical: [
        "Hook plate fixation (temporary — must be removed at 3 months)",
        "Coracoclavicular ligament reconstruction with tendon graft",
        "Distal clavicle ORIF + CC fixation (TightRope / FiberTape)",
      ],
      implants: [
        "3.5 mm Clavicle Hook Plate (Synthes / DePuy)",
        "TightRope CC fixation button (Arthrex)",
        "Allograft or semitendinosus for CC ligament reconstruction",
      ],
      postOpCare: "Sling 6 weeks; removal of hook plate at 3 months mandatory to prevent acromion erosion.",
      complications: ["Nonunion", "Acromion stress fracture / erosion from hook plate", "Subacromial impingement"],
    },
    reconstruction3DParams: {
      fractureLevel: 0.88,
      gapMm: 5.0,
      angulationDeg: 30,
      displacementMm: 18,
      fragments: 2,
      boneGeometry: "curved",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  //  CALCANEUS
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "essex-calcaneus-ia",
    bone: "calcaneus",
    region: "Posterior Facet",
    system: "Essex-Lopresti",
    code: "Essex-Lopresti Tongue Type",
    name: "Intra-Articular Calcaneus Fracture (Tongue Type)",
    severity: "high",
    description: "Axial loading fracture involving posterior facet of subtalar joint. 75% are intra-articular. Fall from height and MVA most common. Bilateral in 10%.",
    treatmentOptions: {
      conservative: [
        "Non-weight bearing cast 10–12 weeks for non-displaced fractures (Böhler's angle >25°)",
        "Early mobilization without weight-bearing using ROM therapy",
      ],
      surgical: [
        "ORIF via extensile lateral approach — restore Böhler's angle and articular congruence",
        "Minimally invasive percutaneous screw fixation (ARIF) for selected patterns",
        "Primary subtalar arthrodesis (severely comminuted fractures)",
      ],
      implants: [
        "2.7 mm / 3.5 mm Calcaneal Plate (anatomical H-plate design)",
        "4.0 mm Cannulated Cancellous Screws",
        "Subtalar fusion bolt (if primary arthrodesis indicated)",
      ],
      postOpCare: "Non-weight bearing 10–12 weeks; subtalar ROM exercises week 6; full weight bearing by 3–4 months.",
      complications: ["Wound breakdown/necrosis (extensile approach)", "Sural nerve injury", "Post-traumatic subtalar arthritis (30–50%)", "Peroneal tendon impingement"],
    },
    reconstruction3DParams: {
      fractureLevel: 0.5,
      gapMm: 5.0,
      angulationDeg: 25,
      displacementMm: 12,
      fragments: 4,
      boneGeometry: "irregular",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  //  PELVIS
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "young-burgess-apc-ii",
    bone: "pelvis",
    region: "Pelvic Ring",
    system: "Young-Burgess",
    code: "APC-II",
    name: "Anteroposterior Compression Pelvis Fracture (Open Book Grade II)",
    severity: "critical",
    description: "Symphysis pubis diastasis >2.5 cm with disrupted anterior sacroiliac ligaments. Significant hemorrhage risk (2–3 L average pelvic blood loss). Life-threatening.",
    treatmentOptions: {
      conservative: ["Pelvic binder as immediate resuscitative adjunct — not definitive treatment"],
      surgical: [
        "Pelvic packing ± angiography for hemorrhage control (damage control phase)",
        "External pelvic fixator (emergent stabilization)",
        "Definitive ORIF with anterior plate (symphysis) ± posterior sacroiliac screw fixation at 3–5 days once stabilized",
      ],
      implants: [
        "3.5 mm 6-hole Pelvic Reconstruction Plate (symphysis)",
        "7.3 mm Cannulated Iliosacral Screws (SI joint)",
        "Pelvic C-clamp (temporary emergency compression)",
      ],
      postOpCare: "ICU monitoring; DVT chemoprophylaxis; partial weight-bearing 6–8 weeks; pelvic floor physiotherapy.",
      complications: ["Massive hemorrhage (1st leading cause of mortality)", "Urethral injury", "Sexual dysfunction", "Lumbosacral plexus injury"],
    },
    reconstruction3DParams: {
      fractureLevel: 0.5,
      gapMm: 25.0,
      angulationDeg: 8,
      displacementMm: 25,
      fragments: 2,
      boneGeometry: "irregular",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  //  SPINE — Denis Classification
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "denis-spine-burst-b",
    bone: "spine",
    region: "Thoracolumbar Junction (T12-L2)",
    system: "Denis",
    code: "Denis Burst B",
    name: "Unstable Burst Fracture with Posterior Element Disruption",
    severity: "critical",
    description: "Failure of anterior AND middle columns under axial compression with retropulsion of posterior vertebral wall fragment into spinal canal. Neurological compromise in 40–70%.",
    treatmentOptions: {
      conservative: [
        "Thoracolumbosacral orthosis (TLSO) 12 weeks for neurologically intact, kyphosis <30°, canal compromise <50%",
      ],
      surgical: [
        "Posterior pedicle screw instrumentation and fusion (2 levels above / 2 below)",
        "Anterior corpectomy + cage + plate for significant anterior column loss",
        "Decompressive laminectomy for progressive neurological deficit",
      ],
      implants: [
        "6.0–7.0 mm Pedicle Screws + Titanium Rods",
        "Expandable Titanium Cage (anterior corpectomy)",
        "Allograft / Autograft bone for fusion",
      ],
      postOpCare: "TLSO brace post-operatively; log-roll transfers; mobilize with physiotherapy by day 2–3; monitor ASIA scale.",
      complications: ["Neurological deterioration", "CSF leak", "Hardware failure / rod breakage", "Pseudarthrosis"],
    },
    reconstruction3DParams: {
      fractureLevel: 0.5,
      gapMm: 8.0,
      angulationDeg: 18,
      displacementMm: 6,
      fragments: 3,
      boneGeometry: "irregular",
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  //  PEDIATRIC — Salter-Harris
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: "salter-harris-iii",
    bone: "tibia_fibula",
    region: "Distal Tibia Physis",
    system: "Salter-Harris",
    code: "Salter-Harris III",
    name: "Pediatric Triplane / Physeal Fracture (Salter-Harris III)",
    severity: "high",
    description: "Intra-articular fracture through physis with epiphyseal fragment. Juvenile Tillaux fracture variant. High risk of growth disturbance and angular deformity if articular step >2 mm.",
    treatmentOptions: {
      conservative: [
        "Closed reduction and long leg cast if articular step <2 mm",
        "Sedation + fluoroscopy-guided reduction under general anesthesia",
      ],
      surgical: [
        "Arthroscopy-assisted ORIF for articular step >2 mm — minimize growth plate damage by avoiding screw across physis",
        "Percutaneous physeal-sparing cannulated screws",
      ],
      implants: [
        "4.0 mm Cannulated Cancellous Screws (parallel to physis)",
        "3.5 mm Cortical Screws (epiphyseal fragment only)",
        "Absorbable pin fixation (in very young patients)",
      ],
      postOpCare: "Non-weight bearing 4–6 weeks; monitor growth velocity and angular deformity every 6 months for 2 years.",
      complications: ["Growth arrest / angular deformity", "Physeal bar formation", "Post-traumatic arthritis", "Compartment syndrome"],
    },
    reconstruction3DParams: {
      fractureLevel: 0.95,
      gapMm: 3.0,
      angulationDeg: 15,
      displacementMm: 8,
      fragments: 3,
      boneGeometry: "irregular",
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
//  Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getFractureByBone(boneId: string): FractureClassification[] {
  return FRACTURE_CLASSIFICATIONS.filter((f) => f.bone === boneId);
}

export function getFractureById(id: string): FractureClassification | undefined {
  return FRACTURE_CLASSIFICATIONS.find((f) => f.id === id);
}

export function getFractureBySeverity(severity: FractureClassification["severity"]): FractureClassification[] {
  return FRACTURE_CLASSIFICATIONS.filter((f) => f.severity === severity);
}

export const SEVERITY_COLOR: Record<FractureClassification["severity"], string> = {
  low:      "text-emerald-300 bg-emerald-500/10 border-emerald-500/30",
  moderate: "text-amber-300  bg-amber-500/10  border-amber-500/30",
  high:     "text-orange-300 bg-orange-500/10 border-orange-500/30",
  critical: "text-rose-300   bg-rose-500/10   border-rose-500/30",
};
