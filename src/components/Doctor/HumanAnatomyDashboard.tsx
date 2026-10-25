import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bone,
  Brain,
  ChevronRight,
  Crosshair,
  Heart,
  Layers,
  RotateCw,
  Salad,
  ScanLine,
  ShieldAlert,
  Sparkles,
  Stethoscope,
  Wind,
  Zap,
  Mic,
  Volume2,
  MessageSquare,
  Send,
  CheckCircle2,
  Radio,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { speakHumanVoice } from "../../utils/audioAlerts";

export type AnatomySystem = "cardio" | "resp" | "skeletal" | "muscular" | "nervous" | "digestive";

export interface AnatomyPatient {
  id: string;
  uhid: string;
  name: string;
  age: number;
  gender: string;
  department: string;
  bed: string;
  type: string;
  diagnosis: string;
  complaints: string;
  vitals: {
    bp: string;
    hr: number;
    temp: number;
    spo2: number;
    rr: number;
  };
}

export type HotspotSeverity = "NORMAL" | "ATTENTION" | "CRITICAL";

export interface AnatomyHotspot {
  id: string;
  system: AnatomySystem;
  name: string;
  x: number;
  y: number;
  severity: HotspotSeverity;
  anatomy: string;
  significance: string;
  order: { item: string; category: "radiology" | "laboratory" };
  affected?: boolean;
  affectedNote?: string;
}

interface SystemMeta {
  id: AnatomySystem;
  label: string;
  short: string;
  icon: LucideIcon;
  accent: string;
  fill: string;
}

const SYSTEMS: SystemMeta[] = [
  { id: "cardio", label: "Cardiovascular", short: "Cardio", icon: Heart, accent: "#fb7185", fill: "#f43f5e" },
  { id: "resp", label: "Respiratory", short: "Resp", icon: Wind, accent: "#22d3ee", fill: "#0891b2" },
  { id: "skeletal", label: "Skeletal", short: "Skeletal", icon: Bone, accent: "#cbd5e1", fill: "#94a3b8" },
  { id: "muscular", label: "Muscular", short: "Muscle", icon: Activity, accent: "#fbbf24", fill: "#d97706" },
  { id: "nervous", label: "Nervous", short: "Nerve", icon: Brain, accent: "#a78bfa", fill: "#7c3aed" },
  { id: "digestive", label: "Digestive", short: "GI", icon: Salad, accent: "#34d399", fill: "#059669" },
];

const SYSTEM_MAP = Object.fromEntries(SYSTEMS.map((s) => [s.id, s])) as Record<AnatomySystem, SystemMeta>;

export const HOTSPOTS: AnatomyHotspot[] = [
  // ---------- CARDIOVASCULAR ----------
  {
    id: "hs-cardio-lad", system: "cardio", name: "LAD Coronary Artery", x: 146, y: 210, severity: "NORMAL",
    anatomy: "Left anterior descending — runs the anterior interventricular groove from the left coronary origin to the apex.",
    significance: "Supplies the anterior LV wall and septum. High-grade stenosis → anterior ischemia / STEMI.",
    order: { item: "Coronary Angiogram & Troponin-I", category: "radiology" },
  },
  {
    id: "hs-cardio-rca", system: "cardio", name: "Right Coronary Artery", x: 134, y: 218, severity: "NORMAL",
    anatomy: "Originates the right aortic sinus, courses the right AV groove toward the posterior interventricular groove.",
    significance: "Supplies the RV, SA/AV node and inferior wall. Occlusion → inferior MI / bradyarrhythmia.",
    order: { item: "Coronary Angiogram + 12-lead ECG", category: "radiology" },
  },
  {
    id: "hs-cardio-lcx", system: "cardio", name: "Left Circumflex Artery", x: 170, y: 206, severity: "NORMAL",
    anatomy: "Branches off the left main, wraps the left AV groove toward the posterior LV.",
    significance: "Supplies the lateral wall. Occlusion → lateral NSTEMI with less specific ECG change.",
    order: { item: "Serial Troponin-I + 2D Echo", category: "laboratory" },
  },
  {
    id: "hs-cardio-lv", system: "cardio", name: "Left Ventricle / Apex", x: 154, y: 232, severity: "NORMAL",
    anatomy: "Main pumping chamber with the thickest myocardium; the apex forms the cardiac tip.",
    significance: "Wall-motion, ejection fraction and diastolic function are assessed here.",
    order: { item: "2D Echo + EF assessment", category: "radiology" },
  },
  {
    id: "hs-cardio-sa", system: "cardio", name: "Sinoatrial Node / Right Atrium", x: 136, y: 196, severity: "NORMAL",
    anatomy: "SA node at the SVC–right atrium junction — the dominant cardiac pacemaker.",
    significance: "Drives sinus rhythm and rate. Dysfunction → bradycardia, pauses, AF.",
    order: { item: "12-lead ECG + rhythm strip", category: "radiology" },
  },
  {
    id: "hs-cardio-aorta", system: "cardio", name: "Aortic Arch", x: 150, y: 165, severity: "NORMAL",
    anatomy: "Ascending aorta arches over the pulmonary trunk and descends along the left thorax.",
    significance: "Main systemic conduit; dilation raises dissection/aneurysm risk.",
    order: { item: "Chest X-Ray + CT Aortogram", category: "radiology" },
  },
  {
    id: "hs-cardio-micro", system: "cardio", name: "Systemic Microvasculature", x: 150, y: 262, severity: "NORMAL",
    anatomy: "Capillary bed spanning skin, mucosa and viscera — the fluid–platelet exchange surface.",
    significance: "Permeability, platelet consumption and third-space fluid shift occur here.",
    order: { item: "CBC + Hematocrit q6h + Platelets", category: "laboratory" },
  },
  // ---------- RESPIRATORY ----------
  {
    id: "hs-resp-trachea", system: "resp", name: "Trachea", x: 150, y: 134, severity: "NORMAL",
    anatomy: "Cartilaginous airway from cricoid (C6) to carina (T4), ~10-12 cm.",
    significance: "Airway patency, secretions, stricture or compression.",
    order: { item: "ABG + Airway Assessment", category: "laboratory" },
  },
  {
    id: "hs-resp-carina", system: "resp", name: "Carina & Main Bronchi", x: 150, y: 170, severity: "NORMAL",
    anatomy: "Tracheal bifurcation into right and left main bronchi.",
    significance: "Foreign body, tumor or thick secretions collect at the bifurcation.",
    order: { item: "CT Chest + Bronchoscopy eval", category: "radiology" },
  },
  {
    id: "hs-resp-rul", system: "resp", name: "Right Upper Lobe", x: 126, y: 194, severity: "NORMAL",
    anatomy: "Apical, anterior and posterior segments of the right lung.",
    significance: "Site of aspiration and apical cavitary disease.",
    order: { item: "Chest X-Ray (PA view)", category: "radiology" },
  },
  {
    id: "hs-resp-rll", system: "resp", name: "Right Lower Lobe", x: 132, y: 246, severity: "NORMAL",
    anatomy: "Basal segments overlying the right diaphragm.",
    significance: "Consolidation, effusion and ARDS gravitation zones predominate here.",
    order: { item: "Chest X-Ray + ABG", category: "radiology" },
  },
  {
    id: "hs-resp-lll", system: "resp", name: "Left Lower Lobe", x: 166, y: 246, severity: "NORMAL",
    anatomy: "Basal segments of the left lung behind the heart silhouette.",
    significance: "Consolidation and effusion tracking toward the costophrenic angle.",
    order: { item: "Chest X-Ray", category: "radiology" },
  },
  {
    id: "hs-resp-pleura", system: "resp", name: "Pleural Cavity (Left)", x: 160, y: 216, severity: "NORMAL",
    anatomy: "Parietal–visceral pleural space holding a physiologic <15 ml film.",
    significance: "Effusion, pneumothorax or pleuritis manifest in this space.",
    order: { item: "USG Chest + Thoracentesis eval", category: "radiology" },
  },
  // ---------- SKELETAL ----------
  {
    id: "hs-skel-skull", system: "skeletal", name: "Skull", x: 150, y: 60, severity: "NORMAL",
    anatomy: "Cranial vault — frontal, parietal and occipital plates enclose the brain.",
    significance: "Fracture or penetrating injury risks intracranial hemorrhage.",
    order: { item: "CT Head", category: "radiology" },
  },
  {
    id: "hs-skel-cspine", system: "skeletal", name: "Cervical Spine", x: 150, y: 118, severity: "NORMAL",
    anatomy: "C1–C7 vertebral segments supporting the head and conduit for the cord.",
    significance: "Fracture/dislocation risks spinal cord injury; immobilize first.",
    order: { item: "CT C-Spine + Neuro consult", category: "radiology" },
  },
  {
    id: "hs-skel-ribs", system: "skeletal", name: "Rib Cage (Right)", x: 128, y: 186, severity: "NORMAL",
    anatomy: "Twelve paired ribs joined by costal cartilages to the sternum.",
    significance: "Fracture or flail segment impairs ventilation and lung protection.",
    order: { item: "Chest X-Ray + Pain control", category: "radiology" },
  },
  {
    id: "hs-skel-sternum", system: "skeletal", name: "Sternum", x: 150, y: 184, severity: "NORMAL",
    anatomy: "Midline anterior chest plate; the sternal angle marks the T4 level.",
    significance: "Sternal fracture (crush/CPR) and marrow access site.",
    order: { item: "Lateral Chest X-Ray", category: "radiology" },
  },
  {
    id: "hs-skel-clavicle-l", system: "skeletal", name: "Clavicle (Left)", x: 162, y: 148, severity: "NORMAL",
    anatomy: "S-shaped strut connecting the shoulder girdle to the sternum.",
    significance: "Common fracture after falls onto the shoulder or birth trauma.",
    order: { item: "Shoulder X-Ray", category: "radiology" },
  },
  {
    id: "hs-skel-humerus-l", system: "skeletal", name: "Humerus (Left)", x: 212, y: 188, severity: "NORMAL",
    anatomy: "Upper arm bone; head articulates at the glenohumeral joint.",
    significance: "Fracture or dislocation after high-energy trauma.",
    order: { item: "Humerus X-Ray", category: "radiology" },
  },
  {
    id: "hs-skel-radius-l", system: "skeletal", name: "Radius/Ulna (Left)", x: 214, y: 255, severity: "NORMAL",
    anatomy: "Forearm pair joined by the interosseous membrane.",
    significance: "Both-bone fractures (e.g. Colles) need precise reduction.",
    order: { item: "Forearm X-Ray", category: "radiology" },
  },
  {
    id: "hs-skel-pelvis", system: "skeletal", name: "Pelvis", x: 150, y: 332, severity: "NORMAL",
    anatomy: "Ilium, ischium and pubis ring enclosing the bladder and rectum.",
    significance: "Pelvic ring fracture carries major retroperitoneal hemorrhage risk.",
    order: { item: "Pelvis X-Ray + CT", category: "radiology" },
  },
  {
    id: "hs-skel-femur-r", system: "skeletal", name: "Femur (Right)", x: 120, y: 390, severity: "NORMAL",
    anatomy: "Longest, strongest bone — head to femoral condyles with a thick cortical shaft.",
    significance: "Shaft fracture (RTA) typically needs operative fixation (ORIF).",
    order: { item: "Femur X-Ray + Ortho consult", category: "radiology" },
  },
  {
    id: "hs-skel-tibia-r", system: "skeletal", name: "Tibia (Right)", x: 115, y: 480, severity: "NORMAL",
    anatomy: "Medial weight-bearing bone; subcutaneous anteromedial face.",
    significance: "High risk of open (compound) fracture after RTA.",
    order: { item: "Tibia/Fibula X-Ray", category: "radiology" },
  },
  {
    id: "hs-skel-femur-l", system: "skeletal", name: "Femur (Left)", x: 180, y: 390, severity: "NORMAL",
    anatomy: "Left-sided femur — head to condyles with thick cortical shaft.",
    significance: "Shaft fracture typically needs operative fixation (ORIF).",
    order: { item: "Femur X-Ray + Ortho consult", category: "radiology" },
  },
  {
    id: "hs-skel-tibia-l", system: "skeletal", name: "Tibia (Left)", x: 185, y: 480, severity: "NORMAL",
    anatomy: "Left medial weight-bearing bone with a subcutaneous anteromedial face.",
    significance: "High risk of open fracture; assess distal pulses.",
    order: { item: "Tibia/Fibula X-Ray", category: "radiology" },
  },
  // ---------- MUSCULAR ----------
  {
    id: "hs-musc-pec", system: "muscular", name: "Pectoralis Major", x: 130, y: 180, severity: "NORMAL",
    anatomy: "Chest sheet — clavicular and sternal heads converge on the humerus.",
    significance: "Tear, strain or myalgia after exertion or trauma.",
    order: { item: "USG Soft Tissue", category: "radiology" },
  },
  {
    id: "hs-musc-abs", system: "muscular", name: "Rectus Abdominis", x: 150, y: 250, severity: "NORMAL",
    anatomy: "Paired midline strap with three tendinous intersections.",
    significance: "Hernia, diastasis or strain on this wall.",
    order: { item: "USG Abdomen", category: "radiology" },
  },
  {
    id: "hs-musc-deltoid-l", system: "muscular", name: "Deltoid (Left)", x: 206, y: 160, severity: "NORMAL",
    anatomy: "Shoulder cap responsible for arm abduction.",
    significance: "Strain or injection-site injury.",
    order: { item: "Shoulder Exam + USG", category: "radiology" },
  },
  {
    id: "hs-musc-biceps-l", system: "muscular", name: "Biceps Brachii (Left)", x: 211, y: 195, severity: "NORMAL",
    anatomy: "Anterior arm flexor with long and short heads.",
    significance: "Tendon rupture or strain — Popeye deformity if the long head avulses.",
    order: { item: "USG Soft Tissue", category: "radiology" },
  },
  {
    id: "hs-musc-quad-l", system: "muscular", name: "Quadriceps (Left)", x: 172, y: 385, severity: "NORMAL",
    anatomy: "Rectus femoris plus three vasti — the knee extensor group.",
    significance: "Contusion, tear or rhabdomyolysis risk after crush injury.",
    order: { item: "CK Level + USG Thigh", category: "laboratory" },
  },
  {
    id: "hs-musc-calf-l", system: "muscular", name: "Gastrocnemius / Soleus (Left)", x: 183, y: 480, severity: "NORMAL",
    anatomy: "Posterior calf pump responsible for venous return.",
    significance: "Calf strain must be separated from deep-vein thrombosis.",
    order: { item: "D-Dimer + USG Doppler", category: "laboratory" },
  },
  // ---------- NERVOUS ----------
  {
    id: "hs-nerve-brain", system: "nervous", name: "Brain / Cerebral Cortex", x: 150, y: 60, severity: "NORMAL",
    anatomy: "Forebrain lobes, basal ganglia and ventricles within the skull.",
    significance: "Stroke, seizure or hemorrhage present here.",
    order: { item: "CT/MRI Brain + Neuro consult", category: "radiology" },
  },
  {
    id: "hs-nerve-spine", system: "nervous", name: "Spinal Cord", x: 150, y: 240, severity: "NORMAL",
    anatomy: "Runs cervical to conus medullaris (L1) giving paired nerve roots.",
    significance: "Compression, myelitis or trauma threaten motor/sensory function.",
    order: { item: "MRI Spine + urgent Neuro", category: "radiology" },
  },
  {
    id: "hs-nerve-plexus-l", system: "nervous", name: "Brachial Plexus (Left)", x: 200, y: 166, severity: "NORMAL",
    anatomy: "C5–T1 roots forming the arm's motor and sensory nerves.",
    significance: "Traction injury or thoracic outlet compression.",
    order: { item: "NCS / EMG", category: "radiology" },
  },
  {
    id: "hs-nerve-sciatic-l", system: "nervous", name: "Sciatic Nerve (Left)", x: 170, y: 400, severity: "NORMAL",
    anatomy: "L4–S3 roots descend the posterior thigh, dividing at the popliteal fossa.",
    significance: "Sciatica, compressive neuropathy or piriformis syndrome.",
    order: { item: "NCS + MRI LS Spine", category: "radiology" },
  },
  {
    id: "hs-nerve-ulnar-l", system: "nervous", name: "Ulnar/Median Nerves (Left)", x: 207, y: 262, severity: "NORMAL",
    anatomy: "Forearm and intrinsic hand control via the ulnar and median nerves.",
    significance: "Cubital/carpal tunnel entrapment or peripheral neuropathy.",
    order: { item: "NCS / EMG", category: "radiology" },
  },
  // ---------- DIGESTIVE ----------
  {
    id: "hs-dig-esophagus", system: "digestive", name: "Esophagus", x: 150, y: 190, severity: "NORMAL",
    anatomy: "Muscular tube from the cricopharyngeus to the EGJ at T10.",
    significance: "Reflux, stricture or motility disorder.",
    order: { item: "Endoscopy + pH study", category: "radiology" },
  },
  {
    id: "hs-dig-stomach", system: "digestive", name: "Stomach", x: 164, y: 252, severity: "NORMAL",
    anatomy: "J-shaped sac — fundus, body and antrum along the greater/lesser curves.",
    significance: "Gastritis, ulceration or upper-GI bleeding.",
    order: { item: "Endoscopy + H. pylori test", category: "laboratory" },
  },
  {
    id: "hs-dig-liver", system: "digestive", name: "Liver", x: 130, y: 230, severity: "NORMAL",
    anatomy: "Right hypochondrium organ with four lobes and the portal triad.",
    significance: "Hepatitis, cirrhosis or hepatomegaly.",
    order: { item: "LFT + USG Abdomen", category: "laboratory" },
  },
  {
    id: "hs-dig-gb", system: "digestive", name: "Gallbladder", x: 127, y: 256, severity: "NORMAL",
    anatomy: "Pear-shaped sac beneath the liver storing and concentrating bile.",
    significance: "Calculi, cholecystitis or empyema — Murphy's sign positive.",
    order: { item: "USG Abdomen + LFT", category: "radiology" },
  },
  {
    id: "hs-dig-pancreas", system: "digestive", name: "Pancreas", x: 150, y: 266, severity: "NORMAL",
    anatomy: "Retroperitoneal head, body and tail with exocrine and endocrine roles.",
    significance: "Acute pancreatitis or mass lesion.",
    order: { item: "Amylase/Lipase + CT", category: "laboratory" },
  },
  {
    id: "hs-dig-si", system: "digestive", name: "Small Intestine", x: 150, y: 302, severity: "NORMAL",
    anatomy: "Duodenum through ileum — the main absorptive surface.",
    significance: "Enteritis, obstruction or malabsorption.",
    order: { item: "USG + Stool studies", category: "laboratory" },
  },
  {
    id: "hs-dig-li", system: "digestive", name: "Large Intestine", x: 145, y: 325, severity: "NORMAL",
    anatomy: "Cecum to rectum with haustra for water resorption.",
    significance: "Colitis, obstruction or appendicitis.",
    order: { item: "USG Abdomen + CT", category: "radiology" },
  },
];

const CONDITION_RULES: { match: RegExp; hits: Array<{ id: string; severity: "ATTENTION" | "CRITICAL"; note?: string }> }[] = [
  {
    match: /\blad\b|stenosis|angina|chest pain|stemi|heart attack|myocardial|ischemi|coronary|\bmi\b/i,
    hits: [
      { id: "hs-cardio-lad", severity: "CRITICAL", note: "High-grade stenosis — reduced antegrade coronary flow." },
      { id: "hs-cardio-lv", severity: "ATTENTION", note: "Regional wall-motion concern on strain pattern." },
    ],
  },
  { match: /\brca\b|inferior wall|inferior mi/i, hits: [{ id: "hs-cardio-rca", severity: "CRITICAL", note: "Right coronary territory involvement." }] },
  { match: /heart failure|chf|\bef\s*\d|cardiomyopath|hypokinesi/i, hits: [{ id: "hs-cardio-lv", severity: "CRITICAL", note: "Reduced ejection fraction / pump dysfunction." }, { id: "hs-cardio-lad", severity: "ATTENTION" }] },
  { match: /arrhythmia|arrhythmi|afib|\baf\b|brady|tachy|\bpac\b|palpitation/i, hits: [{ id: "hs-cardio-sa", severity: "ATTENTION", note: "Rhythm disturbance — continuous monitoring." }] },
  { match: /aortic|coarctation|aneurysm|aorta/i, hits: [{ id: "hs-cardio-aorta", severity: "CRITICAL", note: "Aortic dilation / structural concern." }] },
  {
    match: /dengue|hemorrhagic|capillary leak|thrombocytopeni|viral fever/i,
    hits: [
      { id: "hs-cardio-micro", severity: "CRITICAL", note: "Capillary leak syndrome — endothelial junction breakdown with third-space plasma shift." },
      { id: "hs-dig-liver", severity: "ATTENTION", note: "Viral hepatotropism — acute transaminitis and hepatic congestion." },
    ],
  },
  {
    match: /severe cap|\bcap\b|pneumonia|consolidation|ards|pneumonitis|copd|asthma|lung\b|respiratory|bronch|effusion|pleur/i,
    hits: [
      { id: "hs-resp-rll", severity: "CRITICAL", note: "Severe CAP: Lobar alveolar consolidation, air bronchograms, and impaired gas exchange." },
      { id: "hs-resp-lll", severity: "CRITICAL", note: "Contralateral lower lobe infiltrate tracking to the costophrenic angle." },
      { id: "hs-resp-pleura", severity: "ATTENTION", note: "Parapneumonic reactive pleural effusion and pleuritic pain focus." },
      { id: "hs-resp-trachea", severity: "ATTENTION", note: "Tracheobronchial inflammatory secretions with compromised clearance." },
      { id: "hs-cardio-micro", severity: "CRITICAL", note: "Sepsis-induced systemic microvascular endothelial dysfunction." },
    ],
  },
  { match: /tracheostom|carina|bronch/i, hits: [{ id: "hs-resp-carina", severity: "ATTENTION", note: "Airway bifurcation involvement." }] },
  { match: /pneumothorax|pleural/i, hits: [{ id: "hs-resp-pleura", severity: "CRITICAL", note: "Pleural space air/fluid collection." }] },
  { match: /fracture|ortho|trauma|\brta\b/i, hits: [{ id: "hs-skel-femur-r", severity: "CRITICAL", note: "Traumatic fracture — assess alignment and distal pulse." }, { id: "hs-skel-tibia-r", severity: "ATTENTION", note: "Adjacent shaft stress / open fracture risk." }] },
  { match: /femur/i, hits: [{ id: "hs-skel-femur-r", severity: "CRITICAL" }, { id: "hs-skel-femur-l", severity: "ATTENTION", note: "Contralateral limb screening advised." }] },
  { match: /tibia|fibula|shin/i, hits: [{ id: "hs-skel-tibia-r", severity: "CRITICAL", note: "Shaft involvement — open fracture risk." }, { id: "hs-skel-tibia-l", severity: "ATTENTION" }] },
  { match: /humerus|shoulder|clavicle/i, hits: [{ id: "hs-skel-humerus-l", severity: "ATTENTION" }] },
  { match: /skull|head injury|concuss/i, hits: [{ id: "hs-skel-skull", severity: "CRITICAL", note: "Vault injury — intracranial assessment." }, { id: "hs-nerve-brain", severity: "ATTENTION" }] },
  { match: /spine|spinal|cervical|vertebra/i, hits: [{ id: "hs-skel-cspine", severity: "ATTENTION", note: "Segment screening required." }, { id: "hs-nerve-spine", severity: "ATTENTION" }] },
  { match: /stroke|\bcva\b|infarct|hemorrhage|\bnia\b|tia\b|bleed/i, hits: [{ id: "hs-nerve-brain", severity: "CRITICAL", note: "Cerebral event — urgent neuro-imaging." }] },
  { match: /seizure|epilepsy|convulsion/i, hits: [{ id: "hs-nerve-brain", severity: "ATTENTION", note: "Seizure focus — EEG correlation." }] },
  { match: /neuropathy|sciatic|numbness|diabetic|diabetes|neuropath/i, hits: [{ id: "hs-nerve-sciatic-l", severity: "ATTENTION", note: "Peripheral nerve involvement." }, { id: "hs-nerve-ulnar-l", severity: "ATTENTION" }] },
  { match: /muscle|myalgia|rhabdo|strain|tear\b|myositis/i, hits: [{ id: "hs-musc-quad-l", severity: "ATTENTION", note: "Muscle injury / metabolic stress." }, { id: "hs-musc-calf-l", severity: "ATTENTION" }] },
  { match: /gastritis|ulcer|peptic|dyspepsia|stomach|gastric/i, hits: [{ id: "hs-dig-stomach", severity: "CRITICAL", note: "Mucosal inflammation / ulcer risk." }] },
  { match: /liver|hepat|jaundice|cirrhosis|fatty|hepato/i, hits: [{ id: "hs-dig-liver", severity: "CRITICAL", note: "Hepatic inflammation / dysfunction." }] },
  { match: /gallbladder|cholelith|cholecyst|gallstone|ruq pain|biliary/i, hits: [{ id: "hs-dig-gb", severity: "CRITICAL", note: "Calculus impaction / cholecystitis." }, { id: "hs-dig-liver", severity: "ATTENTION", note: "Secondary cholestasis." }] },
  { match: /pancreat|amylase|lipase/i, hits: [{ id: "hs-dig-pancreas", severity: "CRITICAL", note: "Glandular inflammation." }] },
  { match: /esophag|reflux|gerd/i, hits: [{ id: "hs-dig-esophagus", severity: "ATTENTION" }] },
  { match: /append|colitis|diarrhea|ibd|crohn|enteritis/i, hits: [{ id: "hs-dig-li", severity: "ATTENTION", note: "Colonic inflammation / obstruction." }, { id: "hs-dig-si", severity: "ATTENTION" }] },
  { match: /abdomen|abdominal|periton|ascites/i, hits: [{ id: "hs-dig-si", severity: "ATTENTION", note: "Peritoneal/visceral irritation." }] },
];

const SEVERITY_COLOR: Record<HotspotSeverity, string> = {
  NORMAL: "#64748b",
  ATTENTION: "#f59e0b",
  CRITICAL: "#f43f5e",
};

interface HumanAnatomyDashboardProps {
  patient: AnatomyPatient | null;
  isDarkTheme?: boolean;
  onQuickOrder?: (item: string, category: "radiology" | "laboratory") => void;
  onNavigate?: (route: string) => void;
}

export const HumanAnatomyDashboard: React.FC<HumanAnatomyDashboardProps> = ({
  patient,
  isDarkTheme = false,
  onQuickOrder,
  onNavigate,
}) => {
  const diagnosis = patient?.diagnosis?.toLowerCase() || "";

  const affectedMap = useMemo(() => {
    const map = new Map<string, AnatomyHotspot>();
    if (!diagnosis) return map;
    for (const rule of CONDITION_RULES) {
      if (rule.match.test(diagnosis)) {
        for (const hit of rule.hits) {
          const base = HOTSPOTS.find((h) => h.id === hit.id);
          if (!base) continue;
          const prev = map.get(hit.id);
          map.set(hit.id, {
            ...base,
            severity: hit.severity,
            affected: true,
            affectedNote: hit.note ?? prev?.affectedNote ?? base.significance,
          });
        }
      }
    }
    return map;
  }, [diagnosis]);

  const affectedIds = useMemo(() => [...affectedMap.keys()], [affectedMap]);
  const affectedSystems = useMemo(
    () => SYSTEMS.filter((s) => affectedIds.some((id) => affectedMap.get(id)?.system === s.id)),
    [affectedIds, affectedMap]
  );

  const defaultSystem = useMemo(() => {
    const first = SYSTEMS.find((s) => affectedIds.some((id) => affectedMap.get(id)?.system === s.id));
    return first ? first.id : ("all" as const);
  }, [affectedIds, affectedMap]);

  const defaultHotspot = useMemo(() => affectedIds[0] || "hs-cardio-lad", [affectedIds]);

  const [activeSystem, setActiveSystem] = useState<AnatomySystem | "all">(defaultSystem);
  const [selectedId, setSelectedId] = useState<string>(defaultHotspot);
  const [orbit, setOrbit] = useState(true);
  const [scan, setScan] = useState(true);

  // ---------- Live Clinical Telemetry from port 8284 ----------
  const [telemetry, setTelemetry] = useState<{
    curb65?: number;
    curb65Triage?: string;
    permeabilityIndex?: number;
    fluidShiftRisk?: string;
    systemsAffectedCount?: number;
    rllConsolidation?: string;
    lllInfiltrate?: string;
  } | null>(null);

  const fetchTelemetry = useCallback(() => {
    const vitals = patient?.vitals;
    const params = new URLSearchParams({
      diagnosis: patient?.diagnosis || "dengue viral fever vs severe cap",
      hr: String(vitals?.hr ?? 94),
      spo2: String(vitals?.spo2 ?? 97),
      rr: String(vitals?.rr ?? 24),
      bp: vitals?.bp ?? "130/85",
    });
    fetch(`http://127.0.0.1:8284/api/anatomy/telemetry?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setTelemetry({
          curb65: d.organTelemetry?.respiratoryPulmonary?.curb65Score,
          curb65Triage: d.organTelemetry?.respiratoryPulmonary?.curb65Triage,
          permeabilityIndex: d.organTelemetry?.cardioMicrovascular?.permeabilityIndex,
          fluidShiftRisk: d.organTelemetry?.cardioMicrovascular?.fluidShiftRisk,
          systemsAffectedCount: d.differentialDiagnosis?.systemsAffectedCount,
          rllConsolidation: d.organTelemetry?.respiratoryPulmonary?.rllConsolidation,
          lllInfiltrate: d.organTelemetry?.respiratoryPulmonary?.lllInfiltrate,
        });
      })
      .catch(() => null);
  }, [patient?.diagnosis, patient?.vitals?.hr, patient?.vitals?.rr, patient?.vitals?.bp]);

  useEffect(() => {
    fetchTelemetry();
    const iv = setInterval(fetchTelemetry, 30000);
    return () => clearInterval(iv);
  }, [fetchTelemetry]);

  // Voice and text controls share the clinical command area; no avatar runtime.
  const [broadcastMode, setBroadcastMode] = useState<"voice" | "text">("voice");
  const [broadcastLang, setBroadcastLang] = useState<"en-IN" | "hi-IN" | "te-IN">("en-IN");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const visemeJaw = 0;
  const visemeMouth = 0;
  const visemeBlink = false;
  const [commandText, setCommandText] = useState("");
  const [lastBroadcastInfo, setLastBroadcastInfo] = useState<string | null>(null);

  // Unified Broadcast Dispatcher
  const triggerBroadcast = async (text: string, customMode?: "voice" | "text") => {
    const activeMode = customMode || broadcastMode;
    const durationSec = Math.max(2.5, Math.min(10.0, text.length * 0.065));

    setIsSpeaking(true);
    setLastBroadcastInfo(text);

    // All spoken output goes through the local Voicebox gateway.
    if (activeMode !== "text") {
      speakHumanVoice(
        text,
        () => setIsSpeaking(true),
        () => setIsSpeaking(false),
        () => setIsSpeaking(false),
        "instructional",
        broadcastLang
      );
    } else {
      setTimeout(() => {
        setIsSpeaking(false);
      }, durationSec * 1000);
    }
  };

  // Pre-configured clinical pathway execution
  const executeClinicalPathway = (pathway: "femur" | "pancreas" | "dengue" | "cbc") => {
    if (pathway === "femur") {
      setActiveSystem("skeletal");
      setSelectedId("hs-skel-femur-l");
      triggerBroadcast(
        "Orthopedic alert: Left femur fracture identified at mid-shaft. Skeletal layer isolated. Operative fixation review recommended.",
        broadcastMode
      );
    } else if (pathway === "pancreas") {
      setActiveSystem("digestive");
      setSelectedId("hs-dig-pancreas");
      triggerBroadcast(
        "CT Abdomen view activated: Pancreas isolated with peripancreatic stranding. Correlate with serum lipase and amylase trends.",
        broadcastMode
      );
    } else if (pathway === "dengue") {
      setActiveSystem("cardio");
      setSelectedId("hs-cardio-micro");
      triggerBroadcast(
        "Dengue capillary leak alert: Systemic microvascular network isolated. Increased permeability concern. Monitoring hematocrit and fluid balance.",
        broadcastMode
      );
    } else if (pathway === "cbc") {
      triggerBroadcast(
        "Hematology trend: Platelet count 48,000, hematocrit elevated at 46%. Close fluid balance protocol initiated.",
        broadcastMode
      );
    }
  };

  // Voice speech recognition for Doctor Command input
  const handleStartVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      triggerBroadcast("Voice input not supported by browser. Please type your command.", "text");
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = broadcastLang;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setCommandText(transcript);
        handleExecuteCommand(transcript);
      };
      recognition.start();
    } catch {
      triggerBroadcast("Microphone access error.", "text");
    }
  };

  const handleExecuteCommand = (inputStr?: string) => {
    const cmd = (inputStr || commandText).trim().toLowerCase();
    if (!cmd) return;

    if (cmd.includes("femur") || cmd.includes("fracture") || cmd.includes("bone")) {
      executeClinicalPathway("femur");
    } else if (cmd.includes("pancreas") || cmd.includes("pancreatitis") || cmd.includes("abdomen") || cmd.includes("lipase")) {
      executeClinicalPathway("pancreas");
    } else if (cmd.includes("dengue") || cmd.includes("capillary") || cmd.includes("leak") || cmd.includes("platelet")) {
      executeClinicalPathway("dengue");
    } else if (cmd.includes("trend") || cmd.includes("hematocrit") || cmd.includes("lab")) {
      executeClinicalPathway("cbc");
    } else {
      triggerBroadcast(`Clinical instruction logged: "${cmd}". Dispatching to Doctor Central Command.`, broadcastMode);
    }
    setCommandText("");
  };

  useEffect(() => {
    setActiveSystem(defaultSystem);
    setSelectedId(defaultHotspot);
  }, [defaultSystem, defaultHotspot, patient?.id]);

  const hotspots = useMemo(
    () => HOTSPOTS.map((h) => (affectedMap.has(h.id) ? affectedMap.get(h.id)! : h)),
    [affectedMap]
  );

  const selected = hotspots.find((h) => h.id === selectedId) ?? hotspots[0];
  const visibleSystems = activeSystem === "all" ? SYSTEMS : [SYSTEM_MAP[activeSystem]];

  const severityBadge = (s: HotspotSeverity, affected?: boolean) => {
    if (affected) {
      return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/40">Patient Affected</span>;
    }
    if (s === "CRITICAL") return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/40">Critical</span>;
    if (s === "ATTENTION") return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/40">Attention</span>;
    return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-slate-500/15 text-slate-400 border border-slate-500/40">Normal</span>;
  };

  const skin = isDarkTheme ? "#334155" : "#94a3b8";
  const skinFill = isDarkTheme ? "rgba(51,65,85,0.35)" : "rgba(148,163,184,0.35)";

  return (
    <div className={`rounded-2xl border p-4 shadow-sm space-y-3 transition-colors ${
      isDarkTheme ? "border-slate-800 bg-slate-900/90 text-white" : "border-slate-200 bg-white text-slate-900"
    }`}>
      <style>{`
        @keyframes had-orbit { 0%,100% { transform: rotateY(14deg) rotateX(3deg); } 50% { transform: rotateY(-14deg) rotateX(-3deg); } }
        @keyframes had-scan { 0% { top: -4%; opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { top: 104%; opacity: 0; } }
        @keyframes had-flow { to { stroke-dashoffset: -22; } }
        @keyframes had-ping { 0% { transform: scale(0.5); opacity: 0.9; } 100% { transform: scale(1.8); opacity: 0; } }
        .had-orbit { animation: had-orbit 14s ease-in-out infinite; }
        .had-flow { stroke-dasharray: 3 9; animation: had-flow 1.1s linear infinite; }
        .had-ping-circle { transform-box: fill-box; transform-origin: center; animation: had-ping 1.6s ease-out infinite; }
        .had-scan-band { animation: had-scan 6s linear infinite; }
      `}</style>

      {/* Header */}
      <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b pb-2 ${
        isDarkTheme ? "border-slate-800" : "border-slate-200"
      }`}>
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg border ${
            isDarkTheme ? "bg-rose-500/10 text-rose-400 border-rose-500/30" : "bg-rose-50 text-rose-600 border-rose-200"
          }`}>
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className={`text-xs font-black flex items-center gap-2 ${isDarkTheme ? "text-white" : "text-slate-900"}`}>
              Interactive 3D Human Anatomy Dashboard
              <span className="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-cyan-500/15 text-cyan-400 border border-cyan-500/40">3D Holo-Engine</span>
            </div>
            <p className={`text-[10px] ${isDarkTheme ? "text-slate-400" : "text-slate-500"}`}>
              {patient ? (
                <>
                  Patient Match: <span className={`font-semibold ${isDarkTheme ? "text-cyan-300" : "text-cyan-700"}`}>{diagnosis || "—"}</span>
                  {affectedSystems.length > 0 && (
                    <span className="ml-1 text-rose-400">• {affectedSystems.length} system{affectedSystems.length > 1 ? "s" : ""} affected</span>
                  )}
                </>
              ) : (
                "Select a patient to map affected anatomy"
              )}
            </p>
            {/* Live Telemetry Badge Row */}
            {telemetry && (
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {telemetry.curb65 !== undefined && (
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                    telemetry.curb65 >= 3
                      ? "bg-rose-500/15 text-rose-400 border-rose-500/40"
                      : "bg-amber-500/15 text-amber-400 border-amber-500/40"
                  }`}>
                    CURB-65: {telemetry.curb65} · {telemetry.curb65Triage}
                  </span>
                )}
                {telemetry.permeabilityIndex !== undefined && (
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                    (telemetry.permeabilityIndex ?? 0) > 60
                      ? "bg-rose-500/15 text-rose-400 border-rose-500/40"
                      : "bg-slate-500/15 text-slate-400 border-slate-500/40"
                  }`}>
                    Cap. Leak: {telemetry.permeabilityIndex}% · {telemetry.fluidShiftRisk} Risk
                  </span>
                )}
                {telemetry.rllConsolidation === "DENSE_LOBAR" && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border bg-sky-500/15 text-sky-400 border-sky-500/40">
                    RLL: Dense Lobar Consolidation
                  </span>
                )}
                <span className="text-[8px] text-slate-500 font-mono">⟳ LIVE · :8284</span>
              </div>
            )}
          </div>
        </div>

        {affectedSystems.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {affectedSystems.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSystem(s.id)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border transition-all ${
                    isDarkTheme ? "bg-slate-800 text-slate-200 border-slate-700 hover:border-rose-500/50" : "bg-slate-100 text-slate-700 border-slate-200 hover:border-rose-400"
                  }`}
                >
                  <Icon className="w-3 h-3" style={{ color: s.accent }} /> {s.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* System switcher pills */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveSystem("all")}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all shrink-0 ${
            activeSystem === "all"
              ? "bg-cyan-600 text-white shadow"
              : isDarkTheme
              ? "bg-slate-800 text-slate-400 hover:text-slate-200"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
          }`}
        >
          <Layers className="w-3 h-3" /> All Systems
        </button>
        {SYSTEMS.map((s) => {
          const Icon = s.icon;
          const hasAffected = affectedIds.some((id) => affectedMap.get(id)?.system === s.id);
          return (
            <button
              key={s.id}
              onClick={() => setActiveSystem(s.id)}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-bold transition-all shrink-0 ${
                activeSystem === s.id
                  ? "text-white shadow"
                  : isDarkTheme
                  ? "bg-slate-800 text-slate-400 hover:text-slate-200"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
              }`}
              style={activeSystem === s.id ? { backgroundColor: s.accent } : undefined}
            >
              <Icon className="w-3 h-3" /> {s.label}
              {hasAffected && <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />}
            </button>
          );
        })}
      </div>

      {/* Body viewport + detail panel */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        {/* 3D Body Viewport */}
        <div className={`md:col-span-7 rounded-xl border p-3 relative flex flex-col min-h-[420px] ${
          isDarkTheme ? "bg-slate-950/80 border-slate-800 text-slate-400" : "bg-slate-900 border-slate-800 text-slate-300"
        }`}>
          <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono">
            <span className="flex items-center gap-1">
              <Crosshair className="w-3 h-3 text-cyan-400" /> 3D ORBIT {orbit ? "ON" : "OFF"} • TILT 14°
            </span>
            <span className={`font-bold ${scan ? "text-cyan-400" : "text-slate-500"}`}>AUTO-SCAN {scan ? "ON" : "OFF"}</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setOrbit(!orbit)}
                className="px-1.5 py-0.5 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 transition-all"
                title="Toggle 3D orbit"
              >
                <RotateCw className="w-3 h-3" />
              </button>
              <button
                onClick={() => setScan(!scan)}
                className={`px-1.5 py-0.5 rounded border transition-all ${
                  scan ? "border-cyan-500/50 text-cyan-400" : "border-slate-700 text-slate-300 hover:bg-slate-800"
                }`}
                title="Toggle scan sweep"
              >
                <ScanLine className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* 3D perspective wrapper */}
          <div className="relative flex-1 flex items-center justify-center my-2 overflow-hidden rounded-lg" style={{ perspective: 900 }}>
            <div className={`relative ${orbit ? "had-orbit" : ""}`} style={{ transformStyle: "preserve-3d", transform: "rotateY(14deg) rotateX(3deg)" }}>
              <svg viewBox="0 0 300 620" className="h-[400px] max-w-full select-none" style={{ filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.45))" }}>
                <defs>
                  <clipPath id="had-clip"><rect x="0" y="0" width="300" height="620" /></clipPath>

                  {/* --- Scan gradient --- */}
                  <linearGradient id="had-scanGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="transparent" />
                    <stop offset="100%" stopColor="#22d3ee" />
                  </linearGradient>

                  {/* === VOLUMETRIC MEDICAL GRADIENTS === */}

                  {/* Heart Myocardium — deep crimson to warm arterial red */}
                  <radialGradient id="gradHeartMyo" cx="50%" cy="40%" r="55%">
                    <stop offset="0%" stopColor="#ff4d6d" stopOpacity="0.95" />
                    <stop offset="45%" stopColor="#c9184a" stopOpacity="0.80" />
                    <stop offset="100%" stopColor="#590d22" stopOpacity="0.60" />
                  </radialGradient>

                  {/* Right Lung — aerated cyan-blue, trachea to base */}
                  <linearGradient id="gradLungR" x1="0" y1="0" x2="0.2" y2="1">
                    <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.30" />
                    <stop offset="55%" stopColor="#38bdf8" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#0284c7" stopOpacity="0.18" />
                  </linearGradient>

                  {/* Left Lung — slightly different angle for 3D realism */}
                  <linearGradient id="gradLungL" x1="1" y1="0" x2="0.8" y2="1">
                    <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.28" />
                    <stop offset="60%" stopColor="#22d3ee" stopOpacity="0.20" />
                    <stop offset="100%" stopColor="#0e7490" stopOpacity="0.16" />
                  </linearGradient>

                  {/* Liver — hepatic amber-brown with capsule highlight */}
                  <linearGradient id="gradLiverAnat" x1="0" y1="0" x2="0.5" y2="1">
                    <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.50" />
                    <stop offset="40%" stopColor="#d97706" stopOpacity="0.40" />
                    <stop offset="100%" stopColor="#92400e" stopOpacity="0.30" />
                  </linearGradient>

                  {/* Pancreas — lobular pale amber */}
                  <linearGradient id="gradPancreasAnat" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#fde68a" stopOpacity="0.50" />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.30" />
                  </linearGradient>

                  {/* RLL Dense Consolidation overlay — alveolar exudate HU+55 grey-white */}
                  <linearGradient id="gradConsolidationRLL" x1="0" y1="0" x2="0.3" y2="1">
                    <stop offset="0%" stopColor="#f0f9ff" stopOpacity="0.55" />
                    <stop offset="50%" stopColor="#bae6fd" stopOpacity="0.45" />
                    <stop offset="100%" stopColor="#7dd3fc" stopOpacity="0.35" />
                  </linearGradient>

                  {/* LLL Peribronchial thickening — hazy semi-opaque */}
                  <linearGradient id="gradConsolidationLLL" x1="1" y1="0" x2="0.7" y2="1">
                    <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.40" />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.28" />
                  </linearGradient>

                  {/* Capillary Leak Lattice — dengue endothelial glow */}
                  <radialGradient id="gradCapillaryLeak" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#ff4d6d" stopOpacity="0.50" />
                    <stop offset="60%" stopColor="#f43f5e" stopOpacity="0.20" />
                    <stop offset="100%" stopColor="#9f1239" stopOpacity="0.05" />
                  </radialGradient>

                  {/* Pleural effusion pool — blunted costophrenic translucent blue */}
                  <linearGradient id="gradPleuralEff" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#93c5fd" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.50" />
                  </linearGradient>

                  {/* Skeleton bone cortex — cool ivory */}
                  <linearGradient id="gradBoneCortex" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#f8fafc" stopOpacity="0.70" />
                    <stop offset="100%" stopColor="#94a3b8" stopOpacity="0.40" />
                  </linearGradient>

                  {/* Filters */}
                  <filter id="had-glow" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                    <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                  <filter id="had-consolidation-blur" x="-5%" y="-5%" width="110%" height="110%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" />
                  </filter>
                </defs>

                {/* Body silhouette */}
                <g>
                  <ellipse cx="150" cy="66" rx="34" ry="40" fill={skinFill} stroke={skin} strokeWidth="1.5" />
                  <rect x="139" y="100" width="22" height="34" rx="6" fill={skinFill} stroke={skin} strokeWidth="1.5" />
                  <path
                    d="M96 142 C 90 205, 104 262, 105 322 C 118 340, 182 340, 195 322 C 196 262, 210 205, 204 142 C 176 130, 124 130, 96 142 Z"
                    fill={skinFill} stroke={skin} strokeWidth="1.5"
                  />
                  <path d="M98 146 C 88 210, 82 300, 84 372 L 101 376 C 100 300, 108 220, 113 148 Z" fill={skinFill} stroke={skin} strokeWidth="1.5" />
                  <path d="M202 146 C 212 210, 218 300, 216 372 L 199 376 C 200 300, 192 220, 187 148 Z" fill={skinFill} stroke={skin} strokeWidth="1.5" />
                  <circle cx="93" cy="388" r="8" fill={skinFill} stroke={skin} strokeWidth="1.5" />
                  <circle cx="207" cy="388" r="8" fill={skinFill} stroke={skin} strokeWidth="1.5" />
                  <path d="M112 326 C 114 390, 118 450, 115 536 L 141 538 C 146 450, 142 390, 140 326 Z" fill={skinFill} stroke={skin} strokeWidth="1.5" />
                  <path d="M160 326 C 158 390, 152 450, 155 536 L 181 538 C 186 450, 190 390, 188 326 Z" fill={skinFill} stroke={skin} strokeWidth="1.5" />
                  <rect x="110" y="536" width="36" height="16" rx="6" fill={skinFill} stroke={skin} strokeWidth="1.5" />
                  <rect x="154" y="536" width="36" height="16" rx="6" fill={skinFill} stroke={skin} strokeWidth="1.5" />
                </g>

                {/* System layers */}
                {visibleSystems.map((sys) => {
                  const C = sys.accent;
                  const F = sys.fill;
                  return (
                    <g key={sys.id} strokeLinecap="round" strokeLinejoin="round">
                      {sys.id === "cardio" && (
                        <g>
                          {/* === HEART — Volumetric Myocardium === */}
                          {/* Aortic arch */}
                          <path d="M142 192 C 141 178, 140 168, 141 168 C 148 168, 156 168, 157 168 C 160 176, 160 186, 160 196" fill="none" stroke={C} strokeWidth="3.5" className="had-flow" opacity="0.9" />
                          {/* Superior vena cava */}
                          <path d="M154 194 C 156 182, 157 174, 158 172 C 150 172, 142 172, 138 170 M158 172 C 166 172, 172 172, 174 173" fill="none" stroke={C} strokeWidth="2.5" opacity="0.7" />
                          {/* Pulmonary trunk */}
                          <path d="M164 182 L 168 162 M 168 162 C 172 152, 178 148, 182 150" fill="none" stroke={C} strokeWidth="2" opacity="0.6" />
                          {/* Main heart body — volumetric radial fill */}
                          <path
                            d="M133 188 C 127 191, 120 201, 122 213 C 124 228, 136 241, 146 243 C 152 244, 159 238, 163 228 C 170 216, 173 204, 169 194 C 166 186, 159 183, 153 184 C 146 184, 138 184, 133 188 Z"
                            fill="url(#gradHeartMyo)" stroke={C} strokeWidth="1.8"
                          />
                          {/* Interventricular sulcus */}
                          <path d="M150 196 L 146 240" fill="none" stroke="#590d22" strokeWidth="1.4" opacity="0.7" />
                          {/* Left ventricle contour */}
                          <path d="M142 194 Q 136 220, 147 240" fill="none" stroke={C} strokeWidth="1.2" opacity="0.6" />
                          {/* Right ventricle contour */}
                          <path d="M158 194 Q 166 220, 153 236" fill="none" stroke={C} strokeWidth="1.2" opacity="0.6" />
                          {/* LAD coronary flow */}
                          <path d="M144 196 C 144 212, 144 224, 146 236" fill="none" stroke="#ff4d6d" strokeWidth="2.2" className="had-flow" opacity="0.85" />
                          {/* Diagonal branch */}
                          <path d="M145 210 L 136 218" fill="none" stroke={C} strokeWidth="1.4" opacity="0.5" />
                          {/* LCx territory */}
                          <path d="M140 199 C 132 202, 128 208, 130 215" fill="none" stroke={C} strokeWidth="1.6" opacity="0.55" />
                          {/* RCA territory */}
                          <path d="M161 198 C 170 202, 173 208, 169 219 C 167 228, 160 230, 156 225" fill="none" stroke={C} strokeWidth="1.6" opacity="0.55" />
                          {/* Cardiac apex glow */}
                          <circle cx="146" cy="240" r="4" fill="#ff4d6d" opacity="0.35" filter="url(#had-glow)" />
                          {/* Capillary leak lattice overlay for dengue (conditional) */}
                          {affectedMap.has("hs-cardio-micro") && (
                            <g opacity="0.7">
                              {[0,1,2,3,4,5].map(i => (
                                <line key={`cl-h-${i}`} x1="110" y1={250 + i * 14} x2="190" y2={250 + i * 14}
                                  stroke="#f43f5e" strokeWidth="0.6" strokeDasharray="2 6" className="had-flow" />
                              ))}
                              {[0,1,2,3,4,5].map(i => (
                                <line key={`cl-v-${i}`} x1={110 + i * 16} y1="248" x2={110 + i * 16} y2="334"
                                  stroke="#f43f5e" strokeWidth="0.6" strokeDasharray="2 6" className="had-flow" />
                              ))}
                              <ellipse cx="150" cy="290" rx="40" ry="42" fill="url(#gradCapillaryLeak)" />
                              <text x="150" y="342" textAnchor="middle" fontSize="6" fill="#ff4d6d" fontWeight="700" fontFamily="monospace" opacity="0.9">CAPILLARY LEAK ACTIVE</text>
                            </g>
                          )}
                        </g>
                      )}

                      {sys.id === "resp" && (
                        <g>
                          {/* === RESPIRATORY — Volumetric Lung Rendering === */}
                          {/* Trachea */}
                          <path d="M150 118 L 150 170" fill="none" stroke={C} strokeWidth="5" strokeLinecap="round" />
                          {/* Main bronchi */}
                          <path d="M150 170 L 126 186 M150 170 L 174 186" fill="none" stroke={C} strokeWidth="4" strokeLinecap="round" />

                          {/* RIGHT LUNG — main parenchyma with volumetric gradient */}
                          <path
                            d="M115 174 C 106 192, 105 234, 117 255 C 126 268, 143 270, 151 263 C 149 247, 150 216, 149 190 C 146 175, 128 170, 115 174 Z"
                            fill="url(#gradLungR)" stroke={C} strokeWidth="1.6"
                          />
                          {/* Right lung — horizontal fissure (RUL / RML division) */}
                          <path d="M115 210 C 128 208, 140 208, 149 210" fill="none" stroke={C} strokeWidth="1" opacity="0.55" strokeDasharray="3 3" />
                          {/* Right lung — oblique fissure (RML / RLL division) */}
                          <path d="M122 220 C 132 228, 140 238, 148 252" fill="none" stroke={C} strokeWidth="1" opacity="0.45" strokeDasharray="2 4" />
                          {/* Right bronchial tree */}
                          <path d="M125 180 C 130 208, 128 236, 135 258" fill="none" stroke={C} strokeWidth="1.2" strokeDasharray="2 4" opacity="0.7" />
                          <path d="M127 208 C 134 204, 142 204, 147 206" fill="none" stroke={C} strokeWidth="1" opacity="0.6" />
                          <path d="M128 230 C 135 226, 140 224, 145 226" fill="none" stroke={C} strokeWidth="1" opacity="0.5" />

                          {/* LEFT LUNG — with cardiac notch */}
                          <path
                            d="M167 174 C 180 188, 182 224, 173 250 C 167 264, 151 268, 141 261 C 146 245, 145 214, 148 190 C 151 175, 161 170, 167 174 Z"
                            fill="url(#gradLungL)" stroke={C} strokeWidth="1.6"
                          />
                          {/* Cardiac notch of left lung */}
                          <path d="M148 230 C 148 218, 151 212, 155 218 C 159 224, 158 232, 148 238" fill="none" stroke={C} strokeWidth="1" opacity="0.5" strokeDasharray="2 3" />
                          {/* Left oblique fissure */}
                          <path d="M178 196 C 171 218, 162 238, 152 256" fill="none" stroke={C} strokeWidth="1" opacity="0.45" strokeDasharray="2 4" />
                          {/* Left bronchial tree */}
                          <path d="M167 180 C 161 206, 162 234, 156 256" fill="none" stroke={C} strokeWidth="1.2" strokeDasharray="2 4" opacity="0.7" />

                          {/* === PATHOLOGY OVERLAYS === */}
                          {/* RLL Dense Lobar Consolidation (Severe CAP / +affectedMap) */}
                          {(affectedMap.has("hs-resp-rll")) && (
                            <g>
                              {/* Consolidation density blob — RLL */}
                              <path
                                d="M116 238 C 108 248, 110 264, 120 270 C 129 275, 142 270, 149 263 C 147 250, 145 238, 138 234 Z"
                                fill="url(#gradConsolidationRLL)" filter="url(#had-consolidation-blur)" opacity="0.90"
                              />
                              {/* Air bronchograms inside consolidation */}
                              {[0,1,2].map(i => (
                                <path key={`abg-${i}`}
                                  d={`M${122 + i*8} 242 L${120 + i*8} 265`}
                                  fill="none" stroke="#0ea5e9" strokeWidth="0.8" opacity="0.6"
                                />
                              ))}
                              <text x="128" y="282" textAnchor="middle" fontSize="5.5" fill="#7dd3fc" fontWeight="700" fontFamily="monospace" opacity="0.9">DENSE CONSOLIDATION</text>
                            </g>
                          )}

                          {/* LLL Peribronchial infiltrate */}
                          {(affectedMap.has("hs-resp-lll")) && (
                            <path
                              d="M152 242 C 157 252, 168 260, 172 256 C 176 248, 174 236, 167 232 Z"
                              fill="url(#gradConsolidationLLL)" filter="url(#had-consolidation-blur)" opacity="0.80"
                            />
                          )}

                          {/* Pleural effusion pool at costophrenic angle */}
                          {(affectedMap.has("hs-resp-pleura") || affectedMap.has("hs-resp-lll")) && (
                            <g>
                              <path d="M148 262 C 150 268, 158 272, 170 268 C 174 264, 172 260, 165 258 Z"
                                fill="url(#gradPleuralEff)" opacity="0.65" />
                              <path d="M115 262 C 115 268, 124 274, 135 270 C 139 266, 136 260, 128 258 Z"
                                fill="url(#gradPleuralEff)" opacity="0.60" />
                            </g>
                          )}

                          {/* Diaphragm */}
                          <path d="M114 266 C 134 278, 166 278, 186 264" fill="none" stroke={C} strokeWidth="2" opacity="0.7" />
                        </g>
                      )}

                      {sys.id === "skeletal" && (
                        <g>
                          <ellipse cx="150" cy="62" rx="27" ry="31" fill={F} fillOpacity="0.14" stroke={C} strokeWidth="1.6" />
                          <path d="M123 78 C 128 94, 142 100, 150 100 C 158 100, 172 94, 177 78" fill="none" stroke={C} strokeWidth="1.4" />
                          <circle cx="140" cy="58" r="4" fill="none" stroke={C} strokeWidth="1" />
                          <circle cx="160" cy="58" r="4" fill="none" stroke={C} strokeWidth="1" />
                          <path d="M147 72 L 150 76 L 153 72" fill="none" stroke={C} strokeWidth="1" />
                          <path d="M114 150 C 128 144, 140 146, 150 150" fill="none" stroke={C} strokeWidth="2.4" />
                          <path d="M150 150 C 160 146, 172 144, 186 150" fill="none" stroke={C} strokeWidth="2.4" />
                          <rect x="148" y="154" width="4" height="60" rx="2" fill={F} fillOpacity="0.2" stroke={C} strokeWidth="1" />
                          {Array.from({ length: 6 }).map((_, i) => {
                            const y = 160 + i * 9;
                            return (
                              <g key={i} stroke={C} strokeWidth="1.6" fill="none">
                                <path d={`M151 ${y} C 140 ${y - 12}, 126 ${y - 18}, 114 ${y - 22}`} />
                                <path d={`M149 ${y} C 160 ${y - 12}, 174 ${y - 18}, 186 ${y - 22}`} />
                              </g>
                            );
                          })}
                          {Array.from({ length: 19 }).map((_, i) => {
                            const y = 112 + i * 12;
                            return (
                              <g key={i}>
                                <rect x="146" y={y} width="8" height="8" rx="2" fill={F} fillOpacity="0.5" stroke={C} strokeWidth="1" />
                                <path d={`M150 ${y + 4} L 140 ${y}`} stroke={C} strokeWidth="1" />
                                <path d={`M150 ${y + 4} L 160 ${y}`} stroke={C} strokeWidth="1" />
                              </g>
                            );
                          })}
                          <path d="M112 318 C 130 336, 146 342, 150 342 C 154 342, 170 336, 188 318 C 182 330, 158 344, 150 344 C 142 344, 118 330, 112 318 Z" fill={F} fillOpacity="0.14" stroke={C} strokeWidth="1.5" />
                          <path d="M140 342 L 160 342" fill="none" stroke={C} strokeWidth="1.5" />
                          <circle cx="93" cy="152" r="4" fill={F} fillOpacity="0.4" stroke={C} strokeWidth="1" />
                          <path d="M92 154 L 88 216" fill="none" stroke={C} strokeWidth="4" />
                          <circle cx="88" cy="218" r="4" fill={F} fillOpacity="0.4" stroke={C} strokeWidth="1" />
                          <path d="M88 218 L 84 292 M92 218 L 89 292" fill="none" stroke={C} strokeWidth="2.2" />
                          <path d="M84 292 L 82 318" fill="none" stroke={C} strokeWidth="1.6" />
                          <circle cx="207" cy="152" r="4" fill={F} fillOpacity="0.4" stroke={C} strokeWidth="1" />
                          <path d="M208 154 L 212 216" fill="none" stroke={C} strokeWidth="4" />
                          <circle cx="212" cy="218" r="4" fill={F} fillOpacity="0.4" stroke={C} strokeWidth="1" />
                          <path d="M212 218 L 216 292 M208 218 L 211 292" fill="none" stroke={C} strokeWidth="2.2" />
                          <path d="M216 292 L 218 318" fill="none" stroke={C} strokeWidth="1.6" />
                          <circle cx="128" cy="330" r="4" fill={F} fillOpacity="0.4" stroke={C} strokeWidth="1" />
                          <path d="M126 332 L 118 426" fill="none" stroke={C} strokeWidth="5" />
                          <circle cx="118" cy="428" r="4" fill={F} fillOpacity="0.4" stroke={C} strokeWidth="1" />
                          <path d="M118 428 L 114 530" fill="none" stroke={C} strokeWidth="4" />
                          <path d="M122 428 L 119 524" fill="none" stroke={C} strokeWidth="2" />
                          <circle cx="114" cy="532" r="3" fill={F} fillOpacity="0.4" stroke={C} strokeWidth="1" />
                          <circle cx="172" cy="330" r="4" fill={F} fillOpacity="0.4" stroke={C} strokeWidth="1" />
                          <path d="M174 332 L 182 426" fill="none" stroke={C} strokeWidth="5" />
                          <circle cx="182" cy="428" r="4" fill={F} fillOpacity="0.4" stroke={C} strokeWidth="1" />
                          <path d="M182 428 L 186 530" fill="none" stroke={C} strokeWidth="4" />
                          <path d="M178 428 L 181 524" fill="none" stroke={C} strokeWidth="2" />
                          <circle cx="186" cy="532" r="3" fill={F} fillOpacity="0.4" stroke={C} strokeWidth="1" />
                        </g>
                      )}

                      {sys.id === "muscular" && (
  <g>
    <circle cx="94" cy="158" r="10" fill={F} fillOpacity="0.14" stroke={C} strokeWidth="1.4" />
    <circle cx="206" cy="158" r="10" fill={F} fillOpacity="0.14" stroke={C} strokeWidth="1.4" />
    <path d="M150 158 C 128 158, 114 170, 115 184 C 127 200, 143 204, 150 200 C 150 186, 150 172, 150 158 Z" fill={F} fillOpacity="0.16" stroke={C} strokeWidth="1.3" />
    <path d="M150 158 C 172 158, 186 170, 185 184 C 173 200, 157 204, 150 200 C 150 186, 150 172, 150 158 Z" fill={F} fillOpacity="0.16" stroke={C} strokeWidth="1.3" />
    <path d="M141 212 C 139 216, 139 226, 139 240 L 139 300 C 139 308, 143 312, 150 312 C 157 312, 161 308, 161 300 L 161 240 C 161 226, 161 216, 159 212 C 153 210, 147 210, 141 212 Z" fill={F} fillOpacity="0.14" stroke={C} strokeWidth="1.3" />
    <path d="M139 244 L 161 244 M139 272 L 161 272" stroke={C} strokeWidth="1" />
    <ellipse cx="89" cy="196" rx="6" ry="25" fill={F} fillOpacity="0.16" stroke={C} strokeWidth="1.3" />
    <ellipse cx="87" cy="256" rx="5" ry="22" fill={F} fillOpacity="0.14" stroke={C} strokeWidth="1.2" />
    <ellipse cx="211" cy="196" rx="6" ry="25" fill={F} fillOpacity="0.16" stroke={C} strokeWidth="1.3" />
    <ellipse cx="213" cy="256" rx="5" ry="22" fill={F} fillOpacity="0.14" stroke={C} strokeWidth="1.2" />
    <ellipse cx="127" cy="385" rx="11" ry="42" fill={F} fillOpacity="0.15" stroke={C} strokeWidth="1.3" />
    <ellipse cx="117" cy="482" rx="8" ry="30" fill={F} fillOpacity="0.15" stroke={C} strokeWidth="1.3" />
    <ellipse cx="173" cy="385" rx="11" ry="42" fill={F} fillOpacity="0.15" stroke={C} strokeWidth="1.3" />
    <ellipse cx="183" cy="482" rx="8" ry="30" fill={F} fillOpacity="0.15" stroke={C} strokeWidth="1.3" />
  </g>
)}

{sys.id === "nervous" && (
  <g>
    <path d="M132 48 C 136 40, 164 40, 168 48 C 172 56, 172 64, 168 72 C 164 80, 136 80, 132 72 C 128 64, 128 56, 132 48 Z" fill={F} fillOpacity="0.16" stroke={C} strokeWidth="1.4" />
    <path d="M136 52 C 141 58, 139 64, 143 70" fill="none" stroke={C} strokeWidth="1" />
    <path d="M160 52 C 155 60, 157 66, 153 72" fill="none" stroke={C} strokeWidth="1" />
    <path d="M148 50 C 150 58, 148 66, 150 76" fill="none" stroke={C} strokeWidth="1" />
    <path d="M150 80 L 150 106" fill="none" stroke={C} strokeWidth="2.5" />
    <path d="M150 106 L 150 326" fill="none" stroke={C} strokeWidth="3" />
    {Array.from({ length: 10 }).map((_, i) => {
      const y = 130 + i * 20;
      return (
        <g key={i} stroke={C} strokeWidth="1" fill="none">
          <path d={`M150 ${y} L 130 ${y - 4}`} />
          <path d={`M150 ${y} L 170 ${y - 4}`} />
        </g>
      );
    })}
    <path d="M150 150 C 140 150, 122 156, 112 164 C 104 170, 96 176, 92 186" fill="none" stroke={C} strokeWidth="1.6" />
    <path d="M98 186 L 90 220" fill="none" stroke={C} strokeWidth="1.2" />
    <path d="M150 150 C 160 150, 178 156, 188 164 C 196 170, 204 176, 208 186" fill="none" stroke={C} strokeWidth="1.6" />
    <path d="M202 186 L 210 220" fill="none" stroke={C} strokeWidth="1.2" />
    <path d="M150 320 C 144 342, 136 360, 132 382 C 128 402, 124 430, 122 470 L 118 520" fill="none" stroke={C} strokeWidth="1.6" />
    <path d="M150 320 C 156 342, 164 360, 168 382 C 172 402, 176 430, 178 470 L 182 520" fill="none" stroke={C} strokeWidth="1.6" />
  </g>
)}

{sys.id === "digestive" && (
  <g>
    {/* === DIGESTIVE — Volumetric Organ Rendering === */}
    {/* Esophagus */}
    <path d="M150 158 L 150 224" fill="none" stroke={C} strokeWidth="3" strokeLinecap="round" />

    {/* Stomach — J-shaped sac, volumetric fill */}
    <path d="M150 226 C 141 223, 129 229, 127 244 C 125 260, 137 275, 150 276 C 159 276, 158 265, 150 263 C 143 263, 136 254, 139 242 C 141 233, 146 228, 150 227 Z"
      fill={F} fillOpacity="0.22" stroke={C} strokeWidth="1.5"
    />
    {/* Rugae folds */}
    <path d="M133 238 C 142 236, 147 238, 150 240" fill="none" stroke={C} strokeWidth="0.9" opacity="0.5" />
    <path d="M131 248 C 140 246, 148 248, 150 252" fill="none" stroke={C} strokeWidth="0.9" opacity="0.5" />
    {/* Pylorus */}
    <path d="M150 276 C 157 276, 162 282, 157 287 C 151 291, 143 287, 145 282" fill="none" stroke={C} strokeWidth="1.4" />
    {/* Pyloric sphincter ring */}
    <path d="M138 270 C 145 265, 155 265, 163 270" fill="none" stroke={C} strokeWidth="4" strokeLinecap="round" opacity="0.8" />

    {/* Small intestine loops */}
    <path d="M146 291 C 135 297, 134 309, 147 313" fill="none" stroke={C} strokeWidth="1.4" opacity="0.8" />
    <path d="M154 298 C 166 304, 164 316, 153 317" fill="none" stroke={C} strokeWidth="1.4" opacity="0.8" />
    <path d="M148 315 C 136 319, 138 330, 150 328" fill="none" stroke={C} strokeWidth="1.4" opacity="0.8" />

    {/* Large intestine frame */}
    <path d="M132 317 C 128 324, 128 337, 135 340" fill="none" stroke={C} strokeWidth="1.8" opacity="0.8" />
    <path d="M132 317 C 140 310, 160 310, 168 317" fill="none" stroke={C} strokeWidth="1.8" opacity="0.8" />
    <path d="M168 317 C 172 324, 172 337, 165 341" fill="none" stroke={C} strokeWidth="1.8" opacity="0.8" />
    <path d="M165 341 C 157 350, 142 350, 136 342" fill="none" stroke={C} strokeWidth="1.8" opacity="0.8" />
    {/* Haustra */}
    <path d="M140 317 L 140 313 M148 315 L 148 311 M157 315 L 157 311" stroke={C} strokeWidth="1.1" opacity="0.6" />

    {/* LIVER — volumetric hepatic amber gradient */}
    <path
      d="M156 210 C 162 204, 178 202, 183 213 C 190 222, 188 246, 178 256 C 170 265, 158 260, 154 252 C 153 237, 155 222, 156 210 Z"
      fill="url(#gradLiverAnat)" stroke={C} strokeWidth="1.5"
    />
    {/* Hepatic capsule highlight */}
    <path d="M157 212 C 168 210, 176 212, 180 220" fill="none" stroke="#fbbf24" strokeWidth="0.8" opacity="0.6" />
    {/* Liver lobar fissure */}
    <path d="M168 210 L 162 252" fill="none" stroke="#92400e" strokeWidth="0.8" opacity="0.5" strokeDasharray="2 3" />
    {/* Gallbladder fossa */}
    <path d="M170 254 C 174 253, 177 258, 175 265 C 173 270, 168 271, 167 265 C 167 260, 168 256, 170 254 Z"
      fill={F} fillOpacity="0.30" stroke={C} strokeWidth="1.3"
    />

    {/* PANCREAS — lobular retroperitoneal */}
    <path
      d="M121 229 C 116 233, 115 243, 122 247 C 130 251, 138 248, 148 245 C 155 244, 162 246, 164 242 C 166 238, 164 234, 158 232 C 148 230, 132 226, 121 229 Z"
      fill="url(#gradPancreasAnat)" stroke={C} strokeWidth="1.2" opacity="0.85"
    />
    {/* Pancreatic duct */}
    <path d="M125 238 C 138 238, 152 240, 162 238" fill="none" stroke={C} strokeWidth="0.8" opacity="0.6" strokeDasharray="2 3" />

    {/* Viral hepatitis overlay for dengue */}
    {affectedMap.has("hs-dig-liver") && (
      <ellipse cx="168" cy="232" rx="14" ry="22" fill="#f59e0b" fillOpacity="0.20" stroke="#f59e0b" strokeWidth="1" strokeDasharray="3 3" className="had-ping-circle" />
    )}
  </g>
)}
                    </g>
                  );
                })}

                {/* Scan sweep band */}
                {scan && (
                  <g clipPath="url(#had-clip)">
                    <rect x="0" y="0" width="300" height="620" className="had-scan-band" fill="url(#had-scanGrad)" style={{ opacity: 0.55 }} />
                  </g>
                )}

                {/* Hotspots */}
                {hotspots
                  .filter((h) => activeSystem === "all" || h.system === activeSystem)
                  .map((h) => {
                    const sys = SYSTEM_MAP[h.system];
                    const isSelected = h.id === selectedId;
                    const color = h.affected
                      ? SEVERITY_COLOR.CRITICAL
                      : h.severity === "CRITICAL"
                      ? SEVERITY_COLOR.CRITICAL
                      : h.severity === "ATTENTION"
                      ? SEVERITY_COLOR.ATTENTION
                      : sys.accent;
                    const labelAnchor = h.x >= 150 ? "end" : "start";
                    const labelX = h.x >= 150 ? h.x - 12 : h.x + 12;
                    return (
                      <g
                        key={h.id}
                        onClick={() => setSelectedId(h.id)}
                        className="cursor-pointer"
                        style={{ pointerEvents: "all" }}
                      >
                        {h.affected && (
                          <circle cx={h.x} cy={h.y} r="7" fill="none" stroke={SEVERITY_COLOR.CRITICAL} strokeWidth="1.2" className="had-ping-circle" />
                        )}
                        <circle
                          cx={h.x} cy={h.y}
                          r={isSelected ? 5 : 4}
                          fill={color}
                          stroke="#0b1220"
                          strokeWidth={isSelected ? 2 : 1.2}
                          opacity={h.affected ? 1 : 0.9}
                        />
                        {h.affected && (
                          <circle cx={h.x} cy={h.y} r="6.5" fill="none" stroke={SEVERITY_COLOR.CRITICAL} strokeWidth="1" />
                        )}
                        {isSelected && (
                          <circle cx={h.x} cy={h.y} r="9" fill="none" stroke="#e2e8f0" strokeWidth="1" className="had-ping-circle" />
                        )}
                        <line x1={h.x + (labelAnchor === "end" ? -3 : 3)} y1={h.y} x2={labelX} y2={h.y} stroke={color} strokeWidth="0.75" opacity="0.7" />
                        <text
                          x={labelX} y={h.y - 4} textAnchor={labelAnchor} fontSize="8" fontWeight="700"
                          fill={isSelected ? "#f8fafc" : color} stroke="#0b1220" strokeWidth="0.4"
                          style={{ fontFamily: "inherit", pointerEvents: "none" }}
                        >
                          {h.name}
                        </text>
                      </g>
                    );
                  })}
              </svg>
            </div>
          </div>

          {/* Legend + status strip */}
          <div className="flex items-center justify-between flex-wrap gap-1 border-t border-slate-800/80 pt-1.5 text-[9px] font-mono">
            <div className="flex items-center gap-2 text-slate-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> CRITICAL</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> ATTENTION</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-cyan-400" /> NORMAL</span>
            </div>
            <span className={affectedIds.length ? "text-rose-400 font-bold" : "text-slate-500"}>
              {affectedIds.length ? `${affectedIds.length} AFFECTED ANATOMICAL SITES` : "NO PATIENT-DERIVED HIGHLIGHTS"}
            </span>
          </div>
        </div>

        {/* Detail Panel */}
        <div className={`md:col-span-5 rounded-xl border p-3 flex flex-col justify-between ${
          isDarkTheme ? "bg-slate-950/80 border-slate-800" : "bg-slate-50 border-slate-200"
        }`}>
          {selected && (
            <>
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-xs font-black ${isDarkTheme ? "text-white" : "text-slate-900"}`}>{selected.name}</span>
                      {severityBadge(selected.severity, selected.affected)}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      {(() => {
                        const Icon = SYSTEM_MAP[selected.system].icon;
                        return (
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                            isDarkTheme ? "bg-slate-800 text-slate-300 border-slate-700" : "bg-white text-slate-600 border-slate-200"
                          }`}>
                            <Icon className="w-3 h-3" style={{ color: SYSTEM_MAP[selected.system].accent }} />
                            {SYSTEM_MAP[selected.system].label}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                <div className={`rounded-lg border p-2 ${
                  isDarkTheme ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200"
                }`}>
                  <div className={`text-[9px] font-bold uppercase tracking-wider mb-0.5 ${isDarkTheme ? "text-slate-500" : "text-slate-400"}`}>Anatomical Location</div>
                  <p className={`text-[11px] leading-snug ${isDarkTheme ? "text-slate-300" : "text-slate-700"}`}>{selected.anatomy}</p>
                </div>

                <div className={`rounded-lg border p-2 ${
                  selected.affected
                    ? isDarkTheme ? "bg-rose-950/30 border-rose-500/40" : "bg-rose-50 border-rose-200"
                    : isDarkTheme ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200"
                }`}>
                  <div className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider mb-0.5 ${
                    selected.affected ? "text-rose-400" : isDarkTheme ? "text-slate-500" : "text-slate-400"
                  }`}>
                    <ShieldAlert className="w-3 h-3" /> Clinical Significance
                  </div>
                  <p className={`text-[11px] leading-snug ${isDarkTheme ? "text-slate-300" : "text-slate-700"}`}>
                    {selected.affectedNote ?? selected.significance}
                  </p>
                </div>

                <button
                  onClick={() => onQuickOrder?.(selected.order.item, selected.order.category)}
                  className={`w-full px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    isDarkTheme
                      ? "bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-900/20"
                      : "bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-200"
                  }`}
                >
                  <Zap className="w-3.5 h-3.5 fill-current" /> EXECUTE HOTSPOT COMMAND <ChevronRight className="w-3.5 h-3.5" />
                </button>

                {selected.affected && affectedIds.length > 1 && (
                  <div className="space-y-1">
                    <div className={`text-[9px] font-bold uppercase tracking-wider ${isDarkTheme ? "text-slate-500" : "text-slate-400"}`}>Other affected sites</div>
                    <div className="flex flex-wrap gap-1">
                      {affectedIds
                        .filter((id) => id !== selected.id)
                        .map((id) => {
                          const h = hotspots.find((x) => x.id === id);
                          if (!h) return null;
                          return (
                            <button
                              key={id}
                              onClick={() => setSelectedId(id)}
                              className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border transition-all ${
                                isDarkTheme
                                  ? "bg-slate-800 text-slate-300 border-slate-700 hover:border-rose-500/50"
                                  : "bg-slate-100 text-slate-600 border-slate-200 hover:border-rose-400"
                              }`}
                            >
                              {h.name}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* ASTRA 3D ANATOMY BUS & CLINICAL PATHWAY DISPATCHER           */}
      {/* ============================================================ */}
      <div className={`pt-2 border-t space-y-2.5 ${isDarkTheme ? "border-slate-800" : "border-slate-200"}`}>
        {/* Pathway shortcuts */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 mr-1 ${
              isDarkTheme ? "text-cyan-400" : "text-cyan-700"
            }`}>
              <Stethoscope className="w-3.5 h-3.5 text-cyan-400" /> ASTRA 3D ANATOMY BUS:
            </span>
            <button
              onClick={() => executeClinicalPathway("femur")}
              className={`px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 border transition-all ${
                isDarkTheme
                  ? "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 hover:border-cyan-500"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300"
              }`}
            >
              <Bone className="w-3 h-3 text-cyan-400" /> Femur Fracture (AP X-Ray)
            </button>
            <button
              onClick={() => executeClinicalPathway("pancreas")}
              className={`px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 border transition-all ${
                isDarkTheme
                  ? "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 hover:border-emerald-500"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300"
              }`}
            >
              <Salad className="w-3 h-3 text-emerald-400" /> CT Abdomen: Pancreas
            </button>
            <button
              onClick={() => executeClinicalPathway("dengue")}
              className={`px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 border transition-all ${
                isDarkTheme
                  ? "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 hover:border-rose-500"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300"
              }`}
            >
              <Heart className="w-3 h-3 text-rose-400" /> Dengue Capillary Leak
            </button>
            <button
              onClick={() => executeClinicalPathway("cbc")}
              className={`px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 border transition-all ${
                isDarkTheme
                  ? "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 hover:border-amber-500"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300"
              }`}
            >
              <Activity className="w-3 h-3 text-amber-400" /> Platelet & Hct Trend
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onNavigate?.("/radiology")}
              className={`px-2.5 py-1 rounded border text-[10px] font-bold transition-all ${
                isDarkTheme ? "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200" : "bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700"
              }`}
            >
              + 3D Radiology Scan
            </button>
            <button
              onClick={() => selected && onQuickOrder?.(selected.order.item, selected.order.category)}
              className={`px-2.5 py-1 rounded border text-[10px] font-bold transition-all ${
                isDarkTheme ? "bg-cyan-600 hover:bg-cyan-500 text-white border-cyan-500" : "bg-cyan-600 hover:bg-cyan-500 text-white border-cyan-600"
              }`}
            >
              + {selected ? selected.order.item : "Quick Order"}
            </button>
          </div>
        </div>

        {/* ============================================================ */}
        {/* CLINICAL VOICE & COMMAND PANEL */}
        {/* ============================================================ */}
        <div className={`p-3 rounded-xl border flex flex-col md:flex-row items-center gap-3 transition-all ${
          isDarkTheme ? "bg-slate-950/80 border-cyan-500/30 shadow-lg shadow-cyan-950/20" : "bg-slate-50 border-cyan-200 shadow-sm"
        }`}>
          {/* Removed legacy speaking-human viewport; anatomy remains available above. */}
          <div className="hidden" aria-hidden="true">
            {/* Holographic grid and scanning line */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(6,182,212,0.15),transparent_70%)]" />
            <div className="absolute inset-0 border border-cyan-500/20 rounded-xl pointer-events-none" />

            {/* High-End Photorealistic 3D Doctor Avatar SVG with Volumetric Shading & Dynamic A2F Lip-Sync */}
            <svg viewBox="0 0 120 120" className={`w-full h-full relative z-10 transition-transform duration-300 ${isSpeaking ? "scale-105" : "scale-100"}`}>
              <defs>
                {/* Photorealistic skin gradient with ambient occlusion */}
                <radialGradient id="skinVolumetric" cx="48%" cy="40%" r="58%" fx="42%" fy="32%">
                  <stop offset="0%" stopColor="#ffeed9" />
                  <stop offset="35%" stopColor="#f6c29e" />
                  <stop offset="75%" stopColor="#e2956c" />
                  <stop offset="100%" stopColor="#b66642" />
                </radialGradient>
                {/* Doctor White Coat with cloth texture shading */}
                <linearGradient id="doctorCoatRealistic" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="45%" stopColor="#f1f5f9" />
                  <stop offset="75%" stopColor="#e2e8f0" />
                  <stop offset="100%" stopColor="#94a3b8" />
                </linearGradient>
                {/* Metallic stethoscope chrome */}
                <linearGradient id="stethoscopeChrome" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#94a3b8" />
                  <stop offset="50%" stopColor="#f8fafc" />
                  <stop offset="100%" stopColor="#475569" />
                </linearGradient>
                {/* Realistic Iris with Depth */}
                <radialGradient id="irisGrad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#1e293b" />
                  <stop offset="55%" stopColor="#0f766e" />
                  <stop offset="85%" stopColor="#042f2e" />
                  <stop offset="100%" stopColor="#000000" />
                </radialGradient>
                {/* Holographic HUD ring */}
                <linearGradient id="hudRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.9" />
                  <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0.8" />
                </linearGradient>
              </defs>

              {/* Holographic targeting and telemetry ring */}
              <circle cx="60" cy="60" r="55" fill="none" stroke="url(#hudRingGrad)" strokeWidth="1.2" strokeDasharray="5 3" className={isSpeaking ? "animate-spin" : ""} style={{ transformOrigin: "center", animationDuration: "12s" }} />

              {/* Back Neck & Trapezius */}
              <path d="M 40 76 L 40 95 L 80 95 L 80 76 Z" fill="#b66642" opacity="0.6" />
              <path d="M 44 68 L 44 86 L 76 86 L 76 68 Z" fill="url(#skinVolumetric)" />

              {/* Doctor White Coat Shoulders & V-Neck Scrub */}
              <path d="M 16 112 C 18 90, 36 82, 60 82 C 84 82, 102 90, 104 112 Z" fill="url(#doctorCoatRealistic)" stroke="#cbd5e1" strokeWidth="1" />
              {/* Inner Medical Scrub Shirt (Cyan/Teal) */}
              <path d="M 46 84 L 60 104 L 74 84 Z" fill="#0e7490" />
              <path d="M 52 84 L 60 96 L 68 84 Z" fill="#0891b2" />

              {/* Stethoscope Tubing & Bell */}
              <path d="M 40 85 C 38 102, 54 108, 60 108 C 66 108, 82 102, 80 85" fill="none" stroke="#334155" strokeWidth="3" strokeLinecap="round" />
              <circle cx="60" cy="108" r="4.5" fill="url(#stethoscopeChrome)" stroke="#1e293b" strokeWidth="1" />
              <circle cx="60" cy="108" r="2" fill="#0ea5e9" />

              {/* Head / Craniofacial Volume */}
              <ellipse cx="60" cy="48" rx="23" ry="28" fill="url(#skinVolumetric)" />
              {/* Cheekbone & Chin specular highlight */}
              <ellipse cx="50" cy="46" rx="6" ry="10" fill="#ffffff" opacity="0.18" />
              <ellipse cx="70" cy="46" rx="6" ry="10" fill="#ffffff" opacity="0.18" />
              <ellipse cx="60" cy="68" rx="5" ry="3" fill="#ffffff" opacity="0.12" />

              {/* Professional Doctor Surgical Cap / Groomed Hair */}
              <path d="M 36 42 C 36 24, 84 24, 84 42 C 84 31, 76 21, 60 21 C 44 21, 36 31, 36 42 Z" fill="#0f766e" />
              <path d="M 37 40 C 42 36, 78 36, 83 40" fill="none" stroke="#14b8a6" strokeWidth="1.2" opacity="0.6" />

              {/* Ears */}
              <ellipse cx="37" cy="49" rx="3" ry="6" fill="#e2956c" />
              <ellipse cx="83" cy="49" rx="3" ry="6" fill="#e2956c" />

              {/* Eyes with Realistic Blink and Cornea Reflections */}
              {visemeBlink ? (
                <>
                  <path d="M 47 45 Q 52 47 57 45" fill="none" stroke="#1e293b" strokeWidth="2.2" strokeLinecap="round" />
                  <path d="M 63 45 Q 68 47 73 45" fill="none" stroke="#1e293b" strokeWidth="2.2" strokeLinecap="round" />
                </>
              ) : (
                <>
                  {/* Left Eye */}
                  <ellipse cx="52" cy="45" rx="5" ry="3.5" fill="#f8fafc" />
                  <circle cx="52" cy="45" r="2.8" fill="url(#irisGrad)" />
                  <circle cx="52" cy="45" r="1.4" fill="#000000" />
                  <circle cx="53.2" cy="43.8" r="0.9" fill="#ffffff" />

                  {/* Right Eye */}
                  <ellipse cx="68" cy="45" rx="5" ry="3.5" fill="#f8fafc" />
                  <circle cx="68" cy="45" r="2.8" fill="url(#irisGrad)" />
                  <circle cx="68" cy="45" r="1.4" fill="#000000" />
                  <circle cx="69.2" cy="43.8" r="0.9" fill="#ffffff" />
                </>
              )}

              {/* Natural Eyebrows with pitch elevation */}
              <path d={`M 46 ${38 - visemeJaw * 2} Q 52 ${35 - visemeJaw * 2.5} 58 ${38 - visemeJaw * 2}`} fill="none" stroke="#292524" strokeWidth="2" strokeLinecap="round" />
              <path d={`M 62 ${38 - visemeJaw * 2} Q 68 ${35 - visemeJaw * 2.5} 74 ${38 - visemeJaw * 2}`} fill="none" stroke="#292524" strokeWidth="2" strokeLinecap="round" />

              {/* Anatomical Nose with Bridge Highlight */}
              <path d="M 60 41 L 58.5 52 L 62.5 52 Z" fill="#c2734a" opacity="0.4" />
              <path d="M 57 52 Q 60 54 63 52" fill="none" stroke="#9a3412" strokeWidth="1.2" strokeLinecap="round" />

              {/* Photorealistic Dynamic Lip-Sync Mouth driven by visemeJaw */}
              <ellipse
                cx="60"
                cy={62 + visemeJaw * 2.2}
                rx={6.5 + Math.abs(visemeMouth) * 2}
                ry={2.0 + visemeJaw * 4.8}
                fill={visemeJaw > 0.08 ? "#4c0519" : "#a14828"}
                stroke="#881337"
                strokeWidth="1.2"
              />
              {/* Upper Teeth on Vowel articulation */}
              {visemeJaw > 0.22 && (
                <path d={`M 56.5 ${60.5 + visemeJaw} Q 60 ${61.5 + visemeJaw} 63.5 ${60.5 + visemeJaw}`} fill="#ffffff" stroke="#e2e8f0" strokeWidth="0.8" />
              )}
              {/* Lower Lip definition */}
              <path d={`M 54 ${63 + visemeJaw * 3} Q 60 ${65 + visemeJaw * 3.5} 66 ${63 + visemeJaw * 3}`} fill="none" stroke="#b45309" strokeWidth="1" opacity="0.6" />
            </svg>

            {/* Audio Wave Pulsing Indicator when Speaking */}
            {isSpeaking && (
              <div className="absolute bottom-1.5 left-2 right-2 flex items-end justify-center gap-0.5 h-3 z-20">
                {[0.4, 0.9, 0.6, 1.0, 0.7, 0.5, 0.8].map((h, i) => (
                  <span
                    key={i}
                    className="w-1 bg-cyan-400 rounded-full animate-pulse"
                    style={{ height: `${h * 100}%`, animationDuration: `${0.3 + i * 0.1}s` }}
                  />
                ))}
              </div>
            )}

            {/* A2F Tag */}
            <div className="absolute top-1 right-1 px-1 py-0.2 rounded text-[7px] font-black uppercase tracking-wider bg-cyan-950/80 text-cyan-300 border border-cyan-500/50 z-20">
              60 FPS
            </div>
          </div>

          {/* Interactive Command Center & Controls */}
          <div className="flex-1 space-y-2 w-full">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className={`text-[11px] font-bold ${isDarkTheme ? "text-cyan-300" : "text-cyan-800"}`}>
                  Astra Clinical Voice
                </span>
                <span className="px-1.5 py-0.2 rounded text-[8px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                  LOCAL-FIRST
                </span>
              </div>

              {/* Mode Selector & Language */}
              <div className="flex items-center gap-1">
                <div className="flex rounded-lg border border-slate-700 bg-slate-900/60 p-0.5 text-[9px] font-bold">
                  <button
                    onClick={() => setBroadcastMode("voice")}
                    className={`px-2 py-0.5 rounded transition-all ${
                      broadcastMode === "voice" ? "bg-cyan-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <Volume2 className="w-2.5 h-2.5 inline mr-1" /> VoiceOnly
                  </button>
                  <button
                    onClick={() => setBroadcastMode("text")}
                    className={`px-2 py-0.5 rounded transition-all ${
                      broadcastMode === "text" ? "bg-cyan-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    <MessageSquare className="w-2.5 h-2.5 inline mr-1" /> TextOnly
                  </button>
                </div>

                <select
                  value={broadcastLang}
                  onChange={(e) => setBroadcastLang(e.target.value as any)}
                  className={`text-[9px] font-bold px-1.5 py-1 rounded border ${
                    isDarkTheme ? "bg-slate-900 border-slate-700 text-slate-300" : "bg-white border-slate-300 text-slate-700"
                  }`}
                >
                  <option value="en-IN">EN (Indian)</option>
                  <option value="hi-IN">HI (Hindi)</option>
                  <option value="te-IN">TE (Telugu)</option>
                </select>
              </div>
            </div>

            {/* Last Broadcast Live Transcript */}
            {lastBroadcastInfo && (
              <div className={`px-2.5 py-1 rounded-md text-[10px] flex items-center gap-1.5 border ${
                isDarkTheme ? "bg-slate-900/90 text-cyan-200 border-cyan-500/30" : "bg-cyan-50 text-cyan-900 border-cyan-200"
              }`}>
                <Radio className={`w-3 h-3 text-cyan-400 flex-shrink-0 ${isSpeaking ? "animate-pulse" : ""}`} />
                <span className="font-semibold truncate">"{lastBroadcastInfo}"</span>
                {isSpeaking && <span className="ml-auto text-[8px] font-bold text-cyan-400 uppercase tracking-wider">Broadcasting</span>}
              </div>
            )}

            {/* Command Input Bar with Send & Voice Mic */}
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={commandText}
                  onChange={(e) => setCommandText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleExecuteCommand()}
                  placeholder='Ask: "Show left femur fracture" or "Open CT abdomen and highlight pancreas"...'
                  className={`w-full text-[11px] px-3 py-1.5 rounded-lg border outline-none transition-all ${
                    isDarkTheme
                      ? "bg-slate-900/80 border-slate-700 text-white placeholder-slate-500 focus:border-cyan-500"
                      : "bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-600"
                  }`}
                />
              </div>

              <button
                onClick={handleStartVoiceInput}
                title="Speak clinical command"
                className={`p-1.5 rounded-lg border transition-all ${
                  isDarkTheme
                    ? "bg-slate-800 hover:bg-slate-700 text-cyan-400 border-slate-700"
                    : "bg-slate-100 hover:bg-slate-200 text-cyan-600 border-slate-300"
                }`}
              >
                <Mic className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => handleExecuteCommand()}
                className="px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 bg-cyan-600 hover:bg-cyan-500 text-white transition-all shadow-xs"
              >
                <Send className="w-3 h-3" /> SEND
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
