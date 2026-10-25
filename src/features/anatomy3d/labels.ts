/**
 * src/features/anatomy3d/labels.ts
 *
 * Maps GLB node names to clean clinical labels, system tags, side, and
 * one-line descriptions. Labels are derived from node names, never from
 * hand-placed x/y coordinates.
 *
 * The node naming convention from Z-Anatomy:
 *   - ".l" suffix  → patient's left
 *   - ".r" suffix  → patient's right
 *   - ".001" etc   → numeric duplicates (stripped)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AnatomySystem =
  | "skeletal"
  | "muscular"
  | "cardiovascular"
  | "respiratory"
  | "nervous"
  | "digestive";

export interface AnatomyLabel {
  /** Clean clinical name shown to the user */
  label: string;
  /** Which side of the patient, derived from .l / .r suffix */
  side: "left" | "right" | "midline";
  /** Body system */
  system: AnatomySystem;
  /** One-line clinical description */
  description: string;
}

// ---------------------------------------------------------------------------
// Curated descriptions for ~60 important structures per system
// ---------------------------------------------------------------------------

const SKELETAL_LABELS: Record<string, { label: string; desc: string }> = {
  "Humerus": { label: "Humerus", desc: "Long bone of the upper arm, connecting shoulder to elbow" },
  "Femur": { label: "Femur", desc: "Longest bone in the body, extending from hip to knee" },
  "Tibia": { label: "Tibia", desc: "Larger weight-bearing bone of the lower leg (shinbone)" },
  "Fibula": { label: "Fibula", desc: "Slender lateral bone of the lower leg" },
  "Radius": { label: "Radius", desc: "Lateral forearm bone, enables pronation and supination" },
  "Ulna": { label: "Ulna", desc: "Medial forearm bone, forms the elbow joint with the humerus" },
  "Patella": { label: "Patella", desc: "Sesamoid bone protecting the front of the knee joint" },
  "Clavicle": { label: "Clavicle", desc: "Collar bone, connects sternum to scapula" },
  "Scapula": { label: "Scapula", desc: "Shoulder blade, provides attachment for arm and shoulder muscles" },
  "Hip bone": { label: "Hip bone", desc: "Large irregular bone forming half the pelvis" },
  "Calcaneus": { label: "Calcaneus", desc: "Heel bone, the largest tarsal bone" },
  "Talus": { label: "Talus", desc: "Ankle bone that articulates with tibia and fibula" },
  "Mandible": { label: "Mandible", desc: "Lower jaw bone, the only movable skull bone" },
  "Frontal bone": { label: "Frontal bone", desc: "Bone forming the forehead and upper eye sockets" },
  "Parietal bone": { label: "Parietal bone", desc: "Paired bones forming the superior and lateral skull walls" },
  "Temporal bone": { label: "Temporal bone", desc: "Bone enclosing the middle and inner ear structures" },
  "Occipital bone": { label: "Occipital bone", desc: "Bone forming the back and base of the skull" },
  "Sphenoid bone": { label: "Sphenoid bone", desc: "Butterfly-shaped bone at the skull base" },
  "Ethmoid bone": { label: "Ethmoid bone", desc: "Bone between the eye sockets, part of the nasal cavity" },
  "Maxilla": { label: "Maxilla", desc: "Upper jaw bone, forms the floor of the orbit" },
  "Zygomatic bone": { label: "Zygomatic bone", desc: "Cheekbone, forms the prominence of the cheek" },
  "Nasal bone": { label: "Nasal bone", desc: "Small paired bones forming the bridge of the nose" },
  "Hyoid bone": { label: "Hyoid bone", desc: "U-shaped bone supporting the tongue and larynx" },
  "Sacrum": { label: "Sacrum", desc: "Triangular bone at the base of the spine, formed by fused vertebrae" },
  "Coccyx": { label: "Coccyx", desc: "Tailbone, formed by fused terminal vertebrae" },
  "Atlas (C1)": { label: "Atlas (C1)", desc: "First cervical vertebra, supports the skull" },
  "Axis (C2)": { label: "Axis (C2)", desc: "Second cervical vertebra, enables head rotation" },
  "Body of sternum": { label: "Body of sternum", desc: "Central flat bone of the chest (breastbone body)" },
  "Manubrium of sternum": { label: "Manubrium", desc: "Superior part of the sternum" },
  "Xiphoid process": { label: "Xiphoid process", desc: "Small cartilaginous extension at the lower sternum" },
  "First rib": { label: "First rib", desc: "Shortest and most curved rib, protects the subclavian vessels" },
  "Navicular bone": { label: "Navicular bone", desc: "Tarsal bone on the medial side of the foot" },
  "Cuboid bone": { label: "Cuboid bone", desc: "Tarsal bone on the lateral side of the foot" },
  "Scaphoid bone": { label: "Scaphoid bone", desc: "Carpal bone prone to fracture in falls on outstretched hand" },
  "Lunate bone": { label: "Lunate bone", desc: "Crescent-shaped carpal bone in the proximal row" },
  "Capitate bone": { label: "Capitate bone", desc: "Largest carpal bone at the centre of the wrist" },
  "Hamate bone": { label: "Hamate bone", desc: "Carpal bone with a hook, on the ulnar side of the wrist" },
  "Trapezium bone": { label: "Trapezium bone", desc: "Carpal bone at the base of the thumb" },
  "Trapezoid bone": { label: "Trapezoid bone", desc: "Small carpal bone in the distal row" },
  "Triquetrum bone": { label: "Triquetrum bone", desc: "Pyramidal carpal bone on the ulnar side" },
  "Pisiform bone": { label: "Pisiform bone", desc: "Small sesamoid carpal bone, palpable on the medial wrist" },
  "Incus": { label: "Incus", desc: "Anvil-shaped middle ear ossicle" },
  "Malleus": { label: "Malleus", desc: "Hammer-shaped middle ear ossicle attached to the tympanic membrane" },
  "Stapes": { label: "Stapes", desc: "Stirrup-shaped middle ear ossicle, the smallest bone in the body" },
  "Medial cuneiform bone": { label: "Medial cuneiform", desc: "Largest cuneiform tarsal bone" },
  "Intermediate cuneiform bone": { label: "Intermediate cuneiform", desc: "Smallest cuneiform tarsal bone" },
  "Lateral cuneiform bone": { label: "Lateral cuneiform", desc: "Cuneiform tarsal bone between intermediate cuneiform and cuboid" },
  "Lacrimal bone": { label: "Lacrimal bone", desc: "Smallest facial bone, forms medial orbital wall" },
  "Vomer": { label: "Vomer", desc: "Thin bone forming the posterior nasal septum" },
  "Inferior nasal concha bone": { label: "Inferior nasal concha", desc: "Scroll-shaped bone in the lateral nasal wall" },
  "Palatine bone": { label: "Palatine bone", desc: "Paired bone forming part of the hard palate and nasal cavity" },
};

const CARDIOVASCULAR_LABELS: Record<string, { label: string; desc: string }> = {
  "Left ventricle": { label: "Left ventricle", desc: "Main pumping chamber sending oxygenated blood to the body" },
  "Right ventricle": { label: "Right ventricle", desc: "Pumps deoxygenated blood to the lungs" },
  "Left atrium": { label: "Left atrium", desc: "Receives oxygenated blood from the pulmonary veins" },
  "Right atrium": { label: "Right atrium", desc: "Receives deoxygenated blood from the superior and inferior venae cavae" },
  "Aorta": { label: "Aorta", desc: "Largest artery, carries oxygenated blood from the left ventricle" },
  "Ascending aorta": { label: "Ascending aorta", desc: "First segment of the aorta, gives off coronary arteries" },
  "Aortic arch": { label: "Aortic arch", desc: "Curved portion giving off brachiocephalic, left carotid, and left subclavian arteries" },
  "Descending aorta": { label: "Descending aorta", desc: "Thoracic and abdominal aorta, supplies trunk and lower body" },
  "Pulmonary trunk": { label: "Pulmonary trunk", desc: "Artery carrying deoxygenated blood from the right ventricle to the lungs" },
  "Left pulmonary artery": { label: "Left pulmonary artery", desc: "Carries blood to the left lung" },
  "Right pulmonary artery": { label: "Right pulmonary artery", desc: "Carries blood to the right lung" },
  "Superior vena cava": { label: "Superior vena cava", desc: "Large vein returning blood from the head, neck, arms and upper chest" },
  "Inferior vena cava": { label: "Inferior vena cava", desc: "Largest vein, returns blood from the lower body" },
  "Left coronary artery": { label: "Left coronary artery", desc: "Supplies blood to the left ventricle and interventricular septum" },
  "Right coronary artery": { label: "Right coronary artery", desc: "Supplies the right atrium, right ventricle, and inferior left ventricle" },
  "Anterior interventricular artery": { label: "Left anterior descending artery", desc: "Branch of left coronary artery supplying the anterior interventricular septum" },
  "Circumflex artery of heart": { label: "Circumflex artery", desc: "Branch of left coronary artery running in the coronary sulcus" },
  "Common carotid artery": { label: "Common carotid artery", desc: "Major artery supplying the head and neck" },
  "Internal carotid artery": { label: "Internal carotid artery", desc: "Supplies the brain and orbit" },
  "External carotid artery": { label: "External carotid artery", desc: "Supplies the face, scalp, and neck structures" },
  "Subclavian artery": { label: "Subclavian artery", desc: "Major artery supplying the arm, also gives off vertebral artery" },
  "Axillary artery": { label: "Axillary artery", desc: "Continuation of subclavian in the axilla" },
  "Brachial artery": { label: "Brachial artery", desc: "Main artery of the upper arm, used for blood pressure measurement" },
  "Radial artery": { label: "Radial artery", desc: "Forearm artery, commonly used for pulse palpation" },
  "Ulnar artery": { label: "Ulnar artery", desc: "Forearm artery running alongside the ulna" },
  "Femoral artery": { label: "Femoral artery", desc: "Major artery of the thigh, continuation of external iliac" },
  "Popliteal artery": { label: "Popliteal artery", desc: "Continuation of femoral artery behind the knee" },
  "Common iliac artery": { label: "Common iliac artery", desc: "Terminal branch of the aorta supplying the pelvis and lower limb" },
  "External iliac artery": { label: "External iliac artery", desc: "Becomes the femoral artery below the inguinal ligament" },
  "Internal iliac artery": { label: "Internal iliac artery", desc: "Supplies the pelvis, gluteal region, and perineum" },
  "Coeliac trunk": { label: "Coeliac trunk", desc: "First major ventral branch of abdominal aorta, supplies foregut organs" },
  "Superior mesenteric artery": { label: "Superior mesenteric artery", desc: "Supplies the midgut: jejunum, ileum, ascending and transverse colon" },
  "Inferior mesenteric artery": { label: "Inferior mesenteric artery", desc: "Supplies the hindgut: descending colon, sigmoid, and upper rectum" },
  "Left renal artery": { label: "Left renal artery", desc: "Supplies the left kidney" },
  "Right renal artery": { label: "Right renal artery", desc: "Supplies the right kidney" },
  "Splenic artery": { label: "Splenic artery", desc: "Tortuous branch of the coeliac trunk supplying the spleen" },
  "Common hepatic artery": { label: "Common hepatic artery", desc: "Branch of coeliac trunk supplying the liver and gallbladder" },
  "Left gastric artery": { label: "Left gastric artery", desc: "Supplies the lesser curvature of the stomach" },
  "Anterior tibial artery": { label: "Anterior tibial artery", desc: "Supplies the anterior compartment of the leg" },
  "Posterior tibial artery": { label: "Posterior tibial artery", desc: "Supplies the posterior compartment of the leg" },
  "Jugular vein": { label: "Jugular vein", desc: "Major vein draining blood from the head" },
  "Internal jugular vein": { label: "Internal jugular vein", desc: "Main venous drainage of the brain and face" },
  "External jugular vein": { label: "External jugular vein", desc: "Drains the scalp and face superficially" },
  "Subclavian vein": { label: "Subclavian vein", desc: "Continues from the axillary vein, joins the jugular to form brachiocephalic" },
  "Brachiocephalic vein": { label: "Brachiocephalic vein", desc: "Formed by junction of subclavian and internal jugular veins" },
  "Hepatic veins": { label: "Hepatic veins", desc: "Drain the liver into the inferior vena cava" },
  "Portal vein": { label: "Portal vein", desc: "Carries nutrient-rich blood from GI tract to the liver" },
  "Left testicular artery": { label: "Left gonadal artery", desc: "Supplies the left gonad" },
  "Fibrous pericardium": { label: "Fibrous pericardium", desc: "Tough outer sac enclosing the heart" },
};

const MUSCULAR_LABELS: Record<string, { label: string; desc: string }> = {
  "Biceps brachii": { label: "Biceps brachii", desc: "Two-headed muscle flexing the elbow and supinating the forearm" },
  "Triceps brachii": { label: "Triceps brachii", desc: "Three-headed muscle extending the elbow" },
  "Deltoid": { label: "Deltoid", desc: "Triangular muscle abducting the arm at the shoulder" },
  "Pectoralis major": { label: "Pectoralis major", desc: "Large chest muscle for arm adduction and flexion" },
  "Latissimus dorsi": { label: "Latissimus dorsi", desc: "Broad back muscle for arm extension and adduction" },
  "Trapezius": { label: "Trapezius", desc: "Large superficial back muscle moving the scapula" },
  "Rectus abdominis": { label: "Rectus abdominis", desc: "Paired muscle running vertically on the anterior abdomen" },
  "External oblique": { label: "External oblique", desc: "Superficial abdominal muscle for trunk rotation and flexion" },
  "Internal oblique": { label: "Internal oblique", desc: "Intermediate abdominal muscle layer" },
  "Transversus abdominis": { label: "Transversus abdominis", desc: "Deepest abdominal muscle, stabilises the trunk" },
  "Gluteus maximus": { label: "Gluteus maximus", desc: "Largest gluteal muscle, extends and externally rotates the hip" },
  "Gluteus medius": { label: "Gluteus medius", desc: "Abducts and medially rotates the hip, stabilises pelvis in gait" },
  "Gluteus minimus": { label: "Gluteus minimus", desc: "Smallest gluteal muscle, assists in hip abduction" },
  "Quadriceps femoris": { label: "Quadriceps femoris", desc: "Four-headed thigh muscle extending the knee" },
  "Rectus femoris": { label: "Rectus femoris", desc: "Central quadriceps component, crosses hip and knee" },
  "Vastus lateralis": { label: "Vastus lateralis", desc: "Largest quadriceps component on the lateral thigh" },
  "Vastus medialis": { label: "Vastus medialis", desc: "Medial quadriceps component, stabilises the patella" },
  "Vastus intermedius": { label: "Vastus intermedius", desc: "Deep quadriceps component beneath rectus femoris" },
  "Biceps femoris": { label: "Biceps femoris", desc: "Lateral hamstring muscle, flexes the knee" },
  "Semitendinosus": { label: "Semitendinosus", desc: "Medial hamstring, flexes knee and extends hip" },
  "Semimembranosus": { label: "Semimembranosus", desc: "Deep medial hamstring" },
  "Gastrocnemius": { label: "Gastrocnemius", desc: "Two-headed calf muscle, plantarflexes the ankle" },
  "Soleus": { label: "Soleus", desc: "Deep calf muscle, important postural muscle for standing" },
  "Tibialis anterior": { label: "Tibialis anterior", desc: "Anterior leg muscle, dorsiflexes the ankle" },
  "Diaphragm": { label: "Diaphragm", desc: "Primary muscle of respiration, separates thorax and abdomen" },
  "Sternocleidomastoid": { label: "Sternocleidomastoid", desc: "Neck muscle for head rotation and flexion" },
  "Masseter": { label: "Masseter", desc: "Powerful jaw muscle for mastication" },
  "Temporalis": { label: "Temporalis", desc: "Fan-shaped muscle for jaw elevation" },
  "Iliopsoas": { label: "Iliopsoas", desc: "Major hip flexor group (iliacus + psoas major)" },
  "Psoas major": { label: "Psoas major", desc: "Deep hip flexor connecting lumbar spine to femur" },
  "Sartorius": { label: "Sartorius", desc: "Longest muscle in the body, crosses hip and knee" },
  "Gracilis": { label: "Gracilis", desc: "Thin adductor muscle on the medial thigh" },
  "Adductor longus": { label: "Adductor longus", desc: "Adductor of the thigh" },
  "Adductor magnus": { label: "Adductor magnus", desc: "Largest adductor of the thigh" },
  "Tensor fasciae latae": { label: "Tensor fasciae latae", desc: "Lateral hip muscle tensing the iliotibial band" },
  "Piriformis": { label: "Piriformis", desc: "Deep gluteal muscle, external rotator of the hip" },
  "Erector spinae": { label: "Erector spinae", desc: "Group of back muscles maintaining posture and extending the spine" },
  "Serratus anterior": { label: "Serratus anterior", desc: "Muscle along the rib cage, protracts and rotates the scapula" },
  "Supraspinatus": { label: "Supraspinatus", desc: "Rotator cuff muscle initiating arm abduction" },
  "Infraspinatus": { label: "Infraspinatus", desc: "Rotator cuff muscle for external rotation of the arm" },
  "Teres minor": { label: "Teres minor", desc: "Rotator cuff muscle assisting external rotation" },
  "Subscapularis": { label: "Subscapularis", desc: "Rotator cuff muscle for internal rotation of the arm" },
  "Brachioradialis": { label: "Brachioradialis", desc: "Forearm muscle flexing the elbow in neutral position" },
  "Extensor digitorum": { label: "Extensor digitorum", desc: "Forearm muscle extending fingers 2–5" },
  "Flexor digitorum superficialis": { label: "Flexor digitorum superficialis", desc: "Forearm muscle flexing the proximal interphalangeal joints" },
  "Peroneus longus": { label: "Fibularis longus", desc: "Lateral leg muscle, everts the foot and supports the arch" },
  "Tibialis posterior": { label: "Tibialis posterior", desc: "Deep posterior leg muscle, inverts the foot" },
  "Pronator teres": { label: "Pronator teres", desc: "Forearm muscle pronating the forearm" },
  "Orbicularis oculi": { label: "Orbicularis oculi", desc: "Sphincter muscle closing the eyelids" },
  "Orbicularis oris": { label: "Orbicularis oris", desc: "Sphincter muscle of the mouth" },
};

const RESPIRATORY_LABELS: Record<string, { label: string; desc: string }> = {
  "Left main bronchus": { label: "Left main bronchus", desc: "Primary bronchus entering the left lung" },
  "Right main bronchus": { label: "Right main bronchus", desc: "Primary bronchus entering the right lung, wider and shorter" },
  "Trachea": { label: "Trachea", desc: "Windpipe connecting the larynx to the bronchi" },
  "Left lung": { label: "Left lung", desc: "Two-lobed lung, slightly smaller due to the heart" },
  "Right lung": { label: "Right lung", desc: "Three-lobed lung, slightly larger" },
  "Superior lobe of left lung": { label: "Left upper lobe", desc: "Upper lobe of the left lung" },
  "Inferior lobe of left lung": { label: "Left lower lobe", desc: "Lower lobe of the left lung" },
  "Superior lobe of right lung": { label: "Right upper lobe", desc: "Upper lobe of the right lung" },
  "Middle lobe of right lung": { label: "Right middle lobe", desc: "Middle lobe, unique to the right lung" },
  "Inferior lobe of right lung": { label: "Right lower lobe", desc: "Lower lobe of the right lung" },
  "Larynx": { label: "Larynx", desc: "Voice box, houses the vocal cords" },
  "Epiglottis": { label: "Epiglottis", desc: "Cartilaginous flap preventing aspiration during swallowing" },
  "Thyroid cartilage": { label: "Thyroid cartilage", desc: "Largest laryngeal cartilage, forms the Adam's apple" },
  "Cricoid cartilage": { label: "Cricoid cartilage", desc: "Ring-shaped cartilage forming the base of the larynx" },
};

const NERVOUS_LABELS: Record<string, { label: string; desc: string }> = {
  "Brain": { label: "Brain", desc: "Central organ of the nervous system" },
  "Cerebrum": { label: "Cerebrum", desc: "Largest brain region, responsible for higher functions" },
  "Cerebellum": { label: "Cerebellum", desc: "Coordinates voluntary movement and balance" },
  "Brainstem": { label: "Brainstem", desc: "Connects the brain to the spinal cord, controls vital functions" },
  "Spinal cord": { label: "Spinal cord", desc: "Bundle of nerves running through the vertebral canal" },
  "Optic nerve": { label: "Optic nerve", desc: "Cranial nerve II, transmits visual information to the brain" },
  "Sciatic nerve": { label: "Sciatic nerve", desc: "Largest nerve in the body, supplies the lower limb" },
  "Brachial plexus": { label: "Brachial plexus", desc: "Network of nerves from C5–T1 supplying the upper limb" },
  "Femoral nerve": { label: "Femoral nerve", desc: "Major nerve of the anterior thigh" },
  "Median nerve": { label: "Median nerve", desc: "Forearm and hand nerve, compressed in carpal tunnel syndrome" },
  "Ulnar nerve": { label: "Ulnar nerve", desc: "Nerve of the medial forearm and hand" },
  "Radial nerve": { label: "Radial nerve", desc: "Nerve supplying the posterior arm and forearm extensors" },
  "Vagus nerve": { label: "Vagus nerve", desc: "Cranial nerve X, major parasympathetic nerve" },
  "Phrenic nerve": { label: "Phrenic nerve", desc: "C3–C5 nerve innervating the diaphragm" },
  "Tibial nerve": { label: "Tibial nerve", desc: "Branch of sciatic nerve supplying the posterior leg and foot" },
  "Common peroneal nerve": { label: "Common fibular nerve", desc: "Branch of sciatic nerve, vulnerable at fibular neck" },
  "Trigeminal nerve": { label: "Trigeminal nerve", desc: "Cranial nerve V, provides facial sensation and mastication" },
  "Facial nerve": { label: "Facial nerve", desc: "Cranial nerve VII, controls facial expression muscles" },
  "Left optic nerve": { label: "Left optic nerve", desc: "Transmits visual information from the left eye" },
  "Right optic nerve": { label: "Right optic nerve", desc: "Transmits visual information from the right eye" },
  "Left ophthalmic nerve": { label: "Left ophthalmic nerve", desc: "First division of the left trigeminal nerve" },
  "Right ophthalmic nerve": { label: "Right ophthalmic nerve", desc: "First division of the right trigeminal nerve" },
};

const DIGESTIVE_LABELS: Record<string, { label: string; desc: string }> = {
  "Esophagus": { label: "Oesophagus", desc: "Muscular tube connecting the pharynx to the stomach" },
  "Stomach": { label: "Stomach", desc: "Muscular organ for food storage, mixing, and acid digestion" },
  "Duodenum": { label: "Duodenum", desc: "First part of the small intestine, receives bile and pancreatic juice" },
  "Jejunum": { label: "Jejunum", desc: "Middle segment of the small intestine, primary site of absorption" },
  "Ileum": { label: "Ileum", desc: "Terminal segment of the small intestine" },
  "Ascending colon": { label: "Ascending colon", desc: "First segment of the large intestine, ascending on the right side" },
  "Transverse colon": { label: "Transverse colon", desc: "Segment crossing the abdomen from right to left" },
  "Descending colon": { label: "Descending colon", desc: "Segment descending on the left side" },
  "Sigmoid colon": { label: "Sigmoid colon", desc: "S-shaped segment connecting descending colon to rectum" },
  "Rectum": { label: "Rectum", desc: "Terminal segment of the large intestine" },
  "Appendix": { label: "Appendix", desc: "Vestigial appendage at the caecum" },
  "Liver": { label: "Liver", desc: "Largest solid organ, processes nutrients and produces bile" },
  "Gallbladder": { label: "Gallbladder", desc: "Stores and concentrates bile from the liver" },
  "Pancreas": { label: "Pancreas", desc: "Dual-function organ producing digestive enzymes and hormones" },
  "Spleen": { label: "Spleen", desc: "Lymphoid organ filtering blood, in the left upper quadrant" },
  "Pancreatic duct": { label: "Pancreatic duct", desc: "Duct draining pancreatic secretions into the duodenum" },
  "Taenia libera": { label: "Taenia libera", desc: "Free band of longitudinal muscle on the large intestine" },
  "Taenia mesocolica": { label: "Taenia mesocolica", desc: "Mesenteric band of the colon" },
  "Taenia omentalis": { label: "Taenia omentalis", desc: "Omental band of the colon" },
};

// Combined lookup maps (key: base name without side suffix)
const ALL_CURATED: Record<string, Record<string, { label: string; desc: string }>> = {
  skeletal: SKELETAL_LABELS,
  muscular: MUSCULAR_LABELS,
  cardiovascular: CARDIOVASCULAR_LABELS,
  respiratory: RESPIRATORY_LABELS,
  nervous: NERVOUS_LABELS,
  digestive: DIGESTIVE_LABELS,
};

// ---------------------------------------------------------------------------
// Node-name → label resolution
// ---------------------------------------------------------------------------

/** Strip trailing .l / .r suffix */
export function stripSide(name: string): { base: string; side: "left" | "right" | "midline" } {
  if (name.endsWith(".l")) return { base: name.slice(0, -2), side: "left" };
  if (name.endsWith(".r")) return { base: name.slice(0, -2), side: "right" };
  return { base: name, side: "midline" };
}

/** Strip numeric suffixes like .001, .002 */
export function stripNumericSuffix(name: string): string {
  return name.replace(/\.\d{3,}$/, "");
}

/** Convert a raw node name to a clean title-case label */
function titleCase(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/** Resolve a node name to a curated label or generate a fallback */
export function resolveLabel(
  nodeName: string,
  systemHint: AnatomySystem,
): AnatomyLabel {
  // 1. Strip numeric suffix (.001)
  const cleaned = stripNumericSuffix(nodeName);

  // 2. Determine side from .l / .r
  const { base, side } = stripSide(cleaned);

  // 3. Look up in the curated dictionary for the hinted system
  const systemDict = ALL_CURATED[systemHint];
  const curated = systemDict?.[base];

  // 4. Also try across all systems (cross-system lookup)
  let foundSystem: AnatomySystem = systemHint;
  let found = curated;
  if (!found) {
    for (const [sys, dict] of Object.entries(ALL_CURATED)) {
      if (dict[base]) {
        found = dict[base];
        foundSystem = sys as AnatomySystem;
        break;
      }
    }
  }

  if (found) {
    const sidePrefix = side === "left" ? "Left " : side === "right" ? "Right " : "";
    return {
      label: side !== "midline" && !found.label.toLowerCase().startsWith(side)
        ? `${sidePrefix}${found.label.charAt(0).toLowerCase()}${found.label.slice(1)}`
        : found.label,
      side,
      system: foundSystem,
      description: found.desc,
    };
  }

  // 5. Fallback: title-case the base name
  const sidePrefix = side === "left" ? "Left " : side === "right" ? "Right " : "";
  return {
    label: `${sidePrefix}${titleCase(base)}`.trim(),
    side,
    system: systemHint,
    description: "",
  };
}

// ---------------------------------------------------------------------------
// Tour sequences (anatomical order for sequenced label animation)
// ---------------------------------------------------------------------------

export interface TourStep {
  nodeName: string;
  label: string;
}

/** Blood-flow order through the heart and great vessels */
export const CARDIOVASCULAR_TOUR: TourStep[] = [
  { nodeName: "Superior vena cava", label: "Superior vena cava" },
  { nodeName: "Inferior vena cava (abdominal part)", label: "Inferior vena cava" },
  { nodeName: "Right atrium", label: "Right atrium" },
  { nodeName: "Inferior leaflet of right atrioventricular valve", label: "Tricuspid valve" },
  { nodeName: "Right ventricle", label: "Right ventricle" },
  { nodeName: "Pulmonary trunk", label: "Pulmonary trunk" },
  { nodeName: "Right pulmonary artery", label: "Right pulmonary artery" },
  { nodeName: "Left pulmonary artery", label: "Left pulmonary artery" },
  { nodeName: "Left atrium", label: "Left atrium" },
  { nodeName: "Posterior leaflet of left atrioventricular valve", label: "Mitral valve" },
  { nodeName: "Left ventricle", label: "Left ventricle" },
  { nodeName: "Ascending aorta", label: "Ascending aorta" },
  { nodeName: "Aortic arch", label: "Aortic arch" },
  { nodeName: "Left coronary artery", label: "Left coronary artery" },
  { nodeName: "Right coronary artery", label: "Right coronary artery" },
];

/** Axial skeleton top-to-bottom */
export const SKELETAL_TOUR: TourStep[] = [
  { nodeName: "Frontal bone", label: "Frontal bone" },
  { nodeName: "Parietal bone.l", label: "Parietal bone" },
  { nodeName: "Temporal bone.l", label: "Temporal bone" },
  { nodeName: "Occipital bone", label: "Occipital bone" },
  { nodeName: "Mandible", label: "Mandible" },
  { nodeName: "Atlas (C1)", label: "Atlas (C1)" },
  { nodeName: "Axis (C2)", label: "Axis (C2)" },
  { nodeName: "Clavicle.l", label: "Clavicle" },
  { nodeName: "Scapula.l", label: "Scapula" },
  { nodeName: "Manubrium of sternum", label: "Manubrium" },
  { nodeName: "Body of sternum", label: "Sternum body" },
  { nodeName: "Humerus.r", label: "Right humerus" },
  { nodeName: "Radius.r", label: "Right radius" },
  { nodeName: "Ulna.r", label: "Right ulna" },
  { nodeName: "Hip bone.r", label: "Right hip bone" },
  { nodeName: "Sacrum", label: "Sacrum" },
  { nodeName: "Femur.r", label: "Right femur" },
  { nodeName: "Patella.r", label: "Right patella" },
  { nodeName: "Tibia.r", label: "Right tibia" },
  { nodeName: "Fibula.r", label: "Right fibula" },
  { nodeName: "Calcaneus.r", label: "Right calcaneus" },
];

/** Respiratory airway top-to-bottom */
export const RESPIRATORY_TOUR: TourStep[] = [
  { nodeName: "Trachea", label: "Trachea" },
  { nodeName: "Left main bronchus", label: "Left main bronchus" },
  { nodeName: "Right main bronchus", label: "Right main bronchus" },
];

/** Digestive tract in food-flow order */
export const DIGESTIVE_TOUR: TourStep[] = [
  { nodeName: "Esophagus", label: "Oesophagus" },
  { nodeName: "Stomach", label: "Stomach" },
  { nodeName: "Pancreas", label: "Pancreas" },
  { nodeName: "Duodenum", label: "Duodenum" },
  { nodeName: "Ascending colon", label: "Ascending colon" },
  { nodeName: "Transverse colon", label: "Transverse colon" },
  { nodeName: "Descending colon", label: "Descending colon" },
  { nodeName: "Rectum", label: "Rectum" },
  { nodeName: "Appendix", label: "Appendix" },
];

/** Muscular system tour – major muscle groups (using actual Muscles.glb node names) */
export const MUSCULAR_TOUR: TourStep[] = [
  { nodeName: "Descending part of trapezius muscle.r", label: "Trapezius" },
  { nodeName: "Acromial part of deltoid muscle.r", label: "Deltoid" },
  { nodeName: "Clavicular head of pectoralis major muscle.r", label: "Pectoralis major" },
  { nodeName: "Long head of biceps brachii.r", label: "Biceps brachii" },
  { nodeName: "Long head of triceps brachii.r", label: "Triceps brachii" },
  { nodeName: "Rectus abdominis muscle.r", label: "Rectus abdominis" },
  { nodeName: "Gluteus maximus muscle.r", label: "Gluteus maximus" },
  { nodeName: "Rectus femoris muscle.r", label: "Rectus femoris" },
  { nodeName: "Lateral head of gastrocnemius.r", label: "Gastrocnemius" },
];

export const TOUR_SEQUENCES: Record<AnatomySystem, TourStep[]> = {
  cardiovascular: CARDIOVASCULAR_TOUR,
  skeletal: SKELETAL_TOUR,
  respiratory: RESPIRATORY_TOUR,
  digestive: DIGESTIVE_TOUR,
  muscular: MUSCULAR_TOUR,
  nervous: [], // Populated dynamically from atlas if available
};

// ---------------------------------------------------------------------------
// Source file → system mapping
// ---------------------------------------------------------------------------

export type ModelSource = "skeleton" | "muscles" | "vascular" | "joints" | "atlas";

/** Which GLB/atlas source provides each system */
export const SYSTEM_SOURCES: Record<AnatomySystem, ModelSource[]> = {
  skeletal: ["skeleton"],
  muscular: ["muscles"],
  cardiovascular: ["vascular"],
  respiratory: ["atlas"],
  nervous: ["atlas"],
  digestive: ["atlas"],
};

/** Atlas system IDs that map to our system tabs */
export const ATLAS_SYSTEM_MAP: Record<string, AnatomySystem> = {
  respiratory: "respiratory",
  nervous: "nervous",
  digestive: "digestive",
};
