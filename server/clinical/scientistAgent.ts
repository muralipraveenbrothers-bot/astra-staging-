/**
 * ASTRA SCIENTIST AGENT — interactive diagnosis engine + cause-finder
 * ============================================================================
 * Works like a clinician-scientist on a structured case:
 *   1. Problem representation (age/sex band, tempo, pattern)
 *   2. Three-tier differential: most-likely / expanded / can't-miss
 *   3. Mechanism ladder (root cause → pathophysiology → findings)
 *   4. Unexplained findings — findings no hypothesis explains
 *   5. Discriminating tests ranked by expected information gain (heuristic)
 *   6. Update loop — likelihood-ratio style re-ranking when a result arrives
 *   7. Evidence — citations ONLY from the local RAG store (never invented)
 *   8. Safety — deterministic red-flag rules fire with every LLM down
 *
 * Output is decision support only. Every diagnosis is a suggestion that the
 * doctor approves. Nothing here orders, prescribes, or acts.
 *
 * Privacy: identifiable patient data may only go to local Ollama. The case
 * is de-identified (age banded, identifiers scrubbed) before ANY model call,
 * and the model gateway is told the payload is HIGH_RISK_CLINICAL so the
 * existing router keeps it on the local path.
 */
import type { MechanismLadder7D } from "./astra7dEngine";
import { vectorStore } from "../rag/vectorStore";
import { modelGatewayChat, readModelGatewayEnv } from "../ai/modelGateway";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HypothesisTier = "most-likely" | "expanded" | "cant-miss";

export interface ScientistCase {
  complaint: string;
  history?: string;
  vitals?: Record<string, string | number>;
  exam?: string;
  labs?: Record<string, string | number>;
  imaging?: string;
  meds?: string[];
  timeline?: string[];
  patient?: { age?: number; sex?: string };
}

export interface ScientistHypothesis {
  diagnosis: string;
  tier: HypothesisTier;
  /** Pre-test probability band from rules and prevalence (India context). */
  band: { low: number; high: number };
  /** Representative estimate for display bars (0-1). */
  probability: number;
  reasoning: string;
  supports: string[];
  against: string[];
  rootCauseCategory:
    | "genetic" | "infectious" | "toxic" | "autoimmune" | "vascular"
    | "neoplastic" | "metabolic" | "traumatic" | "iatrogenic" | "unknown";
  mechanism: MechanismLadder7D;
  /** Organ/structure name for the 3D anatomy viewer's selectStructure. */
  anatomyFocus?: string;
  source: "rule" | "llm" | "base";
  lastUpdate?: {
    result: string;
    basis: "likelihood-ratio" | "qualitative";
    reason: string;
    delta: number;
  };
}

export interface ScientistTest {
  id: string;
  name: string;
  /** Expected information gain heuristic 0..1 (simple pair-separation model). */
  informationGain: number;
  rationale: string;
  costBand: "low" | "medium" | "high";
  approximateCostRs: string;
  turnaround: string;
  availableAtPMBrothers: boolean;
  /** "What result would change my mind" — per test. */
  wouldChangeMyMind: string;
}

export type DdxConfidence = "High" | "Moderate" | "Low";
export type InvestigationGroup = "Urgent" | "Confirmatory" | "Optional";
export type InvestigationModality = "lab" | "radiology" | "clinical-review";

export interface DdxMatrixRow {
  id: string;
  diagnosis: string;
  probabilityEstimatePct: number;
  confidence: DdxConfidence;
  supports: string[];
  againstOrMissing: string[];
  definitiveRuleOutCriterion: string;
  nextTestThatSettlesIt: string;
  pinnedRedFlag: boolean;
  ruledOutByDoctor: boolean;
  estimateLabel: "derived estimate";
}

export interface InvestigationPlanItem {
  id: string;
  name: string;
  group: InvestigationGroup;
  utilityPct: number;
  rationale: string;
  expectedAbnormalResult: string;
  movesDdxRowId: string | null;
  modality: InvestigationModality;
  orderCategory: "laboratory" | "radiology" | "clinical";
  checked: false;
}

export interface ScientistEvidence {
  title: string;
  source: string;
  snippet: string;
  evidenceLevel?: string;
}

export interface ScientistUpdateEntry {
  diagnosis: string;
  before: number;
  after: number;
  delta: number;
  reason: string;
  basis: "likelihood-ratio" | "qualitative";
}

export interface ScientistAnalysis {
  revision: number;
  mode: "llm-augmented" | "rules-only";
  llm: { answeredBy?: string; model?: string } | null;
  problemRepresentation: string;
  caseSummary: string[];
  hypotheses: ScientistHypothesis[];
  unexplainedFindings: string[];
  tests: ScientistTest[];
  evidence: ScientistEvidence[];
  evidenceNote: string;
  redFlags: string[];
  ddxMatrix: DdxMatrixRow[];
  causeChain: string;
  investigationPlanner: InvestigationPlanItem[];
  safeInterpretationLine: string | null;
  schemaWarning: string | null;
  safety: {
    decisionSupportOnly: true;
    requiresDoctorConfirmation: true;
    rulesRun: boolean;
  };
  spokenSummary: string;
  update: { result: { test: string; value: string }; entries: ScientistUpdateEntry[] } | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// De-identification (identifiers never reach a model — local or otherwise)
// ---------------------------------------------------------------------------

/** Keys the scientist may read. Identifiers are dropped even if a caller sends them. */
const ALLOWED_CASE_KEYS = new Set([
  "complaint", "history", "vitals", "exam", "labs", "imaging", "meds", "timeline", "patient",
]);

export function sanitizeCaseInput(raw: unknown): ScientistCase {
  if (!raw || typeof raw !== "object") return { complaint: "" };
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED_CASE_KEYS) {
    if (key in src) out[key] = src[key];
  }
  if (typeof out.patient === "object" && out.patient !== null) {
    const p = out.patient as Record<string, unknown>;
    out.patient = {
      age: typeof p.age === "number" && Number.isFinite(p.age) ? p.age : undefined,
      sex: typeof p.sex === "string" ? String(p.sex).slice(0, 20) : undefined,
    };
  }
  const vitals: Record<string, string | number> = {};
  if (out.vitals && typeof out.vitals === "object") {
    for (const [k, v] of Object.entries(out.vitals as Record<string, unknown>)) {
      if (typeof v === "string" || typeof v === "number") vitals[k.slice(0, 40)] = v;
    }
    out.vitals = vitals;
  }
  const labs: Record<string, string | number> = {};
  if (out.labs && typeof out.labs === "object") {
    for (const [k, v] of Object.entries(out.labs as Record<string, unknown>)) {
      if (typeof v === "string" || typeof v === "number") labs[k.slice(0, 40)] = v;
    }
    out.labs = labs;
  }
  return out as unknown as ScientistCase;
}

const IDENTIFIER_PATTERNS: RegExp[] = [
  /\bUHID[-\s:]?[A-Za-z0-9-]+/gi,
  /\b\d{10,}\b/g,
  /\+\d{10,}\b/g,
  /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi,
  /(?:phone|mobile|address|email|dob|date of birth|aadhaar|abha|policy ?no\.?|policy number)\s*[:#-]?\s*[^\n,;]+/gi,
];

export function scrubIdentifiers(text: string): string {
  let out = text;
  for (const re of IDENTIFIER_PATTERNS) out = out.replace(re, "[REDACTED]");
  return out;
}

export function bandAge(age?: number): string {
  if (typeof age !== "number" || !Number.isFinite(age) || age < 0) return "age not stated";
  if (age < 1) return "infant (<1y)";
  if (age <= 5) return "1-5y";
  if (age <= 12) return "6-12y";
  if (age <= 17) return "13-17y";
  if (age <= 30) return "18-30y";
  if (age <= 45) return "31-45y";
  if (age <= 60) return "46-60y";
  if (age <= 75) return "61-75y";
  return ">75y";
}

function caseToText(c: ScientistCase, ageBand: string): string {
  const sex = c.patient?.sex?.toLowerCase() === "female" ? "female"
    : c.patient?.sex?.toLowerCase() === "male" ? "male" : "sex not stated";
  const parts = [`Age band: ${ageBand}. Sex: ${sex}.`];
  parts.push(`Complaint: ${String(c.complaint ?? "").slice(0, 600)}`);
  if (c.history) parts.push(`History: ${String(c.history).slice(0, 600)}`);
  if (c.vitals && Object.keys(c.vitals).length) {
    parts.push(`Vitals: ${Object.entries(c.vitals).map(([k, v]) => `${k} ${v}`).join(", ").slice(0, 400)}`);
  }
  if (c.exam) parts.push(`Examination: ${String(c.exam).slice(0, 400)}`);
  if (c.labs && Object.keys(c.labs).length) {
    parts.push(`Labs: ${Object.entries(c.labs).map(([k, v]) => `${k} ${v}`).join(", ").slice(0, 400)}`);
  }
  if (c.imaging) parts.push(`Imaging: ${String(c.imaging).slice(0, 300)}`);
  if (c.meds?.length) parts.push(`Medications: ${c.meds.map((m) => String(m).slice(0, 80)).join(", ").slice(0, 300)}`);
  if (c.timeline?.length) parts.push(`Timeline: ${c.timeline.map((t) => String(t).slice(0, 120)).join(" | ").slice(0, 400)}`);
  return parts.join("\n");
}

/** De-identified text safe to hand to a model. Identifiers are scrubbed twice. */
export function deidentifyForRemote(input: ScientistCase): { text: string; ageBand: string } {
  const clean = sanitizeCaseInput(input);
  const ageBand = bandAge(clean.patient?.age);
  return { text: scrubIdentifiers(caseToText(clean, ageBand)), ageBand };
}

// ---------------------------------------------------------------------------
// Deterministic red-flag rules (fire even when every LLM is down)
// ---------------------------------------------------------------------------

export interface RedFlagRule {
  id: string;
  name: string;
  /** Case text fingerprint used for matching. */
  match: (text: string, c: ScientistCase) => boolean;
  hypothesis: ScientistHypothesis;
  /** Tests that must always appear for this rule. */
  requiredTests: string[];
}

function bayesUpdate(pre: number, lr: number): number {
  const odds = pre / (1 - pre);
  const post = (odds * lr) / (1 + odds * lr);
  return Math.min(0.99, Math.max(0.01, post));
}

const GENERIC_MECHANISM: MechanismLadder7D = {
  molecular: ["Pathway-level detail not yet characterised for this case"],
  cellular: ["Cellular injury or dysfunction consistent with the clinical picture"],
  tissue: ["Tissue-level involvement localised to the affected organ"],
  organ: ["Organ-level functional impairment"],
  system: ["Systemic compensatory response"],
  multiOrgan: ["Multi-organ effects follow if the process is unchecked"],
  compensationStatus: "COMPENSATED",
  activeCompensationMechanisms: ["Physiological compensatory responses"],
  failureWarningSigns: ["Worsening vital signs", "New organ dysfunction"],
};

function hypothesis(partial: Omit<ScientistHypothesis, "mechanism" | "source" | "probability" | "band"> & {
  probability: number;
  band?: { low: number; high: number };
  source?: ScientistHypothesis["source"];
  mechanism?: MechanismLadder7D;
}): ScientistHypothesis {
  return {
    ...partial,
    band: partial.band ?? {
      low: Math.max(0.01, partial.probability - 0.15),
      high: Math.min(0.99, partial.probability + 0.15),
    },
    mechanism: partial.mechanism ?? GENERIC_MECHANISM,
    source: partial.source ?? "rule",
  };
}

const ACS_MECHANISM: MechanismLadder7D = {
  molecular: ["Atherosclerotic plaque rupture → tissue factor exposure → thrombin activation"],
  cellular: ["Platelet adhesion/aggregation, microvascular occlusion, cardiomyocyte hypoxia"],
  tissue: ["Ischaemic myocardial stunning, anaerobic lactate accumulation"],
  organ: ["Impaired LV contraction and diastolic compliance"],
  system: ["Sympathetic overdrive: tachycardia, vasoconstriction"],
  multiOrgan: ["Reduced cardiac output → renal hypoperfusion → cardiorenal strain"],
  compensationStatus: "COMPENSATION_FAILING",
  activeCompensationMechanisms: ["Sympathetic activation maintains blood pressure"],
  failureWarningSigns: ["Hypotension", "Pulmonary oedema", "Ventricular arrhythmia"],
};

const CHOLANGITIS_MECHANISM: MechanismLadder7D = {
  molecular: ["Biliary obstruction → cholestasis → bacterial overgrowth (E. coli, Klebsiella)"],
  cellular: ["Bactibilia with translocation into portal/systemic circulation"],
  tissue: ["Biliary epithelial injury, neutrophil infiltration"],
  organ: ["Cholangiolar inflammation and hepatocyte dysfunction"],
  system: ["Systemic inflammatory response — fever, tachycardia"],
  multiOrgan: ["Bacteraemia → sepsis → renal hypoperfusion"],
  compensationStatus: "COMPENSATION_FAILING",
  activeCompensationMechanisms: ["Febrile immune response"],
  failureWarningSigns: ["Hypotension", "Altered mentation (Reynolds pentad)"],
};

const HEPATITIS_MECHANISM: MechanismLadder7D = {
  molecular: ["Hepatotropic viral replication (or drug metabolite injury)"],
  cellular: ["Hepatocyte necrosis and apoptosis, ALT/AST release"],
  tissue: ["Lobular inflammation, Kupffer cell activation"],
  organ: ["Impaired bilirubin conjugation and excretion → jaundice"],
  system: ["Anorexia, malaise, fever"],
  multiOrgan: ["Coagulopathy if synthetic failure ensues"],
  compensationStatus: "COMPENSATED",
  activeCompensationMechanisms: ["Hepatic regenerative capacity"],
  failureWarningSigns: ["Deepening jaundice", "INR rise", "Encephalopathy"],
};

const MALARIA_MECHANISM: MechanismLadder7D = {
  molecular: ["Plasmodium sporozoite → hepatocyte schizogony → merozoite release"],
  cellular: ["RBC invasion, haemozoin pigment accumulation"],
  tissue: ["Intravascular haemolysis, splenic sequestration"],
  organ: ["Splenomegaly, hepatic Kupffer cell activation"],
  system: ["Paroxysmal fever with chills (erythrocytic cycle)"],
  multiOrgan: ["Anaemia, thrombocytopenia; cerebral malaria if P. falciparum"],
  compensationStatus: "COMPENSATED",
  activeCompensationMechanisms: ["Reticulocytosis"],
  failureWarningSigns: ["Altered sensorium", "Dark urine", "Hypoglycaemia"],
};

const LEPTOSPIROSIS_MECHANISM: MechanismLadder7D = {
  molecular: ["Leptospira spirochete entry via skin/mucosa (contaminated water)"],
  cellular: ["Endothelial invasion, vasculitis"],
  tissue: ["Hepatic and renal interstitial inflammation"],
  organ: ["Hepatitis with conjugated hyperbilirubinaemia, tubulointerstitial nephritis"],
  system: ["Fever, myalgia (calves), conjunctival suffusion"],
  multiOrgan: ["Weil disease — jaundice + renal failure + haemorrhage"],
  compensationStatus: "COMPENSATED",
  activeCompensationMechanisms: ["Renal tubular compensation"],
  failureWarningSigns: ["Oliguria", "Haemoptysis", "Shock"],
};

const NOF_MECHANISM: MechanismLadder7D = {
  molecular: ["Low-energy fall → impact load exceeds femoral neck strength (osteoporosis)"],
  cellular: ["Cortical and trabecular bone disruption, haematoma formation"],
  tissue: ["Periosteal stripping, capsular distension"],
  organ: ["Hip joint instability — limb shortened and externally rotated"],
  system: ["Pain → immobility; sympathetic response"],
  multiOrgan: ["Immobility complications — DVT, pneumonia, delirium"],
  compensationStatus: "COMPENSATED",
  activeCompensationMechanisms: ["Pain-guarded positioning"],
  failureWarningSigns: ["Inability to bear weight", "Avascular necrosis risk if displaced"],
};

const ANAEMIA_MECHANISM: MechanismLadder7D = {
  molecular: ["Iron deficiency / chronic blood loss → reduced haem synthesis"],
  cellular: ["Hypochromic microcytic erythrocytes"],
  tissue: ["Reduced oxygen carrying capacity of blood"],
  organ: ["Tissue hypoxia most evident in muscle and brain"],
  system: ["Fatigue, pallor, tachycardia on exertion"],
  multiOrgan: ["High-output state if severe"],
  compensationStatus: "COMPENSATED",
  activeCompensationMechanisms: ["Increased 2,3-DPG shifts the oxygen dissociation curve"],
  failureWarningSigns: ["Dyspnoea at rest", "Haemodynamic compromise"],
};

const HYPOTHYROID_MECHANISM: MechanismLadder7D = {
  molecular: ["Reduced T4/T3 synthesis (autoimmune destruction in India: iodine or Hashimoto)"],
  cellular: ["Lowered basal metabolic rate in all cells"],
  tissue: ["Myxoedema — glycosaminoglycan deposition"],
  organ: ["Bradycardia, slowed gut motility"],
  system: ["Fatigue, weight gain, cold intolerance"],
  multiOrgan: ["Pericardial effusion if long-standing"],
  compensationStatus: "COMPENSATED",
  activeCompensationMechanisms: ["Raised TSH drives residual thyroid tissue"],
  failureWarningSigns: ["Myxoedema coma (hypothermia, bradycardia, altered mentation)"],
};

const MENINGITIS_MECHANISM: MechanismLadder7D = {
  molecular: ["Bacterial (S. pneumoniae, N. meningitidis) or viral CNS invasion"],
  cellular: ["Neutrophilic pleocytosis in CSF"],
  tissue: ["Meningeal inflammation, cerebral oedema"],
  organ: ["Raised intracranial pressure"],
  system: ["Fever, neck stiffness, photophobia, headache"],
  multiOrgan: ["Sepsis, shock, adrenal haemorrhage (meningococcaemia)"],
  compensationStatus: "COMPENSATION_FAILING",
  activeCompensationMechanisms: ["Cerebral autoregulation"],
  failureWarningSigns: ["Altered mentation", "Seizures", "Petechial rash"],
};

const PE_MECHANISM: MechanismLadder7D = {
  molecular: ["Deep vein thrombus embolises to the pulmonary arterial tree"],
  cellular: ["Platelet-fibrin thrombus lodges in lobar/segmental arteries"],
  tissue: ["Ventilation-perfusion mismatch, pulmonary infarction"],
  organ: ["Right ventricular pressure overload"],
  system: ["Tachycardia, hypoxia, pleuritic pain"],
  multiOrgan: ["Obstructive shock if massive"],
  compensationStatus: "COMPENSATION_FAILING",
  activeCompensationMechanisms: ["RV hypertrophy acutely recruits reserve"],
  failureWarningSigns: ["Syncope", "Hypotension", "Raised JVP"],
};

const DENGUE_MECHANISM: MechanismLadder7D = {
  molecular: ["Dengue NS1 binding to endothelial surface glycosaminoglycans"],
  cellular: ["Endothelial activation, monocyte cytokine storm"],
  tissue: ["Capillary leak, plasma extravasation"],
  organ: ["Hepatic transaminitis, splenic platelet sequestration"],
  system: ["High fever, retro-orbital pain, myalgia, thrombocytopenia"],
  multiOrgan: ["Shock if capillary leak decompensates (warning signs)"],
  compensationStatus: "COMPENSATED",
  activeCompensationMechanisms: ["Haemoconcentration compensation"],
  failureWarningSigns: ["Mucosal bleed", "Pleural effusion", "Rising haematocrit with falling platelets"],
};

const CELLULITIS_MECHANISM: MechanismLadder7D = {
  molecular: ["Bacterial entry through skin barrier -> innate immune activation"],
  cellular: ["Neutrophil recruitment and cytokine release"],
  tissue: ["Dermal and subcutaneous inflammation with oedema"],
  organ: ["Skin warmth, erythema, swelling and pain"],
  system: ["Fever or sepsis physiology if infection spreads"],
  multiOrgan: ["Bacteraemia can progress to shock if unchecked"],
  compensationStatus: "COMPENSATED",
  activeCompensationMechanisms: ["Local inflammatory containment", "Febrile immune response"],
  failureWarningSigns: ["Hypotension", "Rapid spread", "Pain out of proportion"],
};

const DVT_MECHANISM: MechanismLadder7D = {
  molecular: ["Venous stasis/endothelial injury/hypercoagulability -> thrombin generation"],
  cellular: ["Platelet-fibrin clot formation in deep veins"],
  tissue: ["Venous obstruction and local inflammatory tenderness"],
  organ: ["Unilateral leg swelling and calf pain"],
  system: ["Embolisation risk to pulmonary circulation"],
  multiOrgan: ["Pulmonary embolism can cause hypoxia and shock"],
  compensationStatus: "COMPENSATED",
  activeCompensationMechanisms: ["Collateral venous drainage"],
  failureWarningSigns: ["New dyspnoea", "Pleuritic chest pain", "Syncope"],
};

const MECHANISMS: Record<string, MechanismLadder7D> = {
  "acute coronary syndrome": ACS_MECHANISM,
  "choledocholithiasis with ascending cholangitis": CHOLANGITIS_MECHANISM,
  "acute viral hepatitis": HEPATITIS_MECHANISM,
  "malaria": MALARIA_MECHANISM,
  "leptospirosis": LEPTOSPIROSIS_MECHANISM,
  "neck-of-femur fracture": NOF_MECHANISM,
  "iron deficiency anaemia": ANAEMIA_MECHANISM,
  "hypothyroidism": HYPOTHYROID_MECHANISM,
  "bacterial meningitis": MENINGITIS_MECHANISM,
  "pulmonary embolism": PE_MECHANISM,
  "dengue fever": DENGUE_MECHANISM,
  "cellulitis": CELLULITIS_MECHANISM,
  "deep vein thrombosis": DVT_MECHANISM,
};

const caseFingerprint = (c: ScientistCase): string =>
  [
    c.complaint, c.history, c.exam, c.imaging,
    c.vitals ? Object.entries(c.vitals).map(([k, v]) => `${k} ${v}`).join(" ") : "",
    c.labs ? Object.entries(c.labs).map(([k, v]) => `${k} ${v}`).join(" ") : "",
  ].join(" ").toLowerCase();

export const RED_FLAG_RULES: RedFlagRule[] = [
  {
    id: "REDFLAG-ACS",
    name: "Chest pain with ST changes → ACS",
    match: (text) => /chest pain|retrosternal|crushing|substernal/.test(text) && /st elevation|st segment|st changes|st.?depression/.test(text),
    hypothesis: hypothesis({
      diagnosis: "Acute Coronary Syndrome (STEMI/NSTEMI)",
      tier: "cant-miss",
      probability: 0.82,
      reasoning: "Deterministic rule: cardiac-sounding chest pain with ST changes is ACS until proven otherwise.",
      supports: ["Crushing/retrosternal chest pain", "ST-segment changes on ECG"],
      against: ["No documented normal ECG", "Pain not reproducible on palpation"],
      rootCauseCategory: "vascular",
      mechanism: ACS_MECHANISM,
      anatomyFocus: "Heart",
    }),
    requiredTests: ["12-lead ECG", "High-sensitivity Troponin I/T"],
  },
  {
    id: "REDFLAG-CHEST-PAIN-ACS",
    name: "Chest pain -> ACS/STEMI rule-out first",
    match: (text) => /chest pain|retrosternal|crushing|substernal/.test(text),
    hypothesis: hypothesis({
      diagnosis: "Acute Coronary Syndrome (STEMI/NSTEMI)",
      tier: "cant-miss",
      probability: 0.72,
      reasoning: "Deterministic rule: acute chest pain keeps ACS/STEMI on the rule-out-first list until ECG and troponin are reviewed.",
      supports: ["Chest pain presentation", "ECG/troponin not yet documented normal"],
      against: ["No documented normal ECG", "Pain not reproducible on palpation"],
      rootCauseCategory: "vascular",
      mechanism: ACS_MECHANISM,
      anatomyFocus: "Heart",
    }),
    requiredTests: ["12-lead ECG", "High-sensitivity Troponin I/T"],
  },
  {
    id: "REDFLAG-LEG-NEC-FASC",
    name: "Leg cellulitis with swelling/pain -> necrotizing fasciitis rule-out first",
    match: (text) => /cellulitis|red swollen painful.*leg|leg.*red.*swollen|spreading erythema|lower limb.*edema/.test(text),
    hypothesis: hypothesis({
      diagnosis: "Necrotizing Fasciitis",
      tier: "cant-miss",
      probability: 0.22,
      reasoning: "Deterministic rule: rapidly painful swollen erythematous limb must exclude necrotizing fasciitis and sepsis before routine cellulitis framing.",
      supports: ["Painful red swollen limb", "Soft-tissue infection pattern"],
      against: ["No documented crepitus, bullae, anesthesia, shock, or pain out of proportion yet"],
      rootCauseCategory: "infectious",
      anatomyFocus: "Skin",
    }),
    requiredTests: ["Urgent senior surgical review", "CBC with differential", "CRP", "Serum lactate", "Blood cultures"],
  },
  {
    id: "REDFLAG-SEPSIS-SOFT-TISSUE",
    name: "Soft-tissue infection -> sepsis rule-out first",
    match: (text) => /cellulitis|red swollen painful.*leg|spreading erythema|fever|sepsis/.test(text),
    hypothesis: hypothesis({
      diagnosis: "Sepsis",
      tier: "cant-miss",
      probability: 0.28,
      reasoning: "Deterministic rule: suspected infection with abnormal vitals must explicitly assess sepsis risk.",
      supports: ["Possible infection source", "Vitals require review"],
      against: ["No documented hypotension, altered sensorium, or lactate elevation yet"],
      rootCauseCategory: "infectious",
      anatomyFocus: "Blood",
    }),
    requiredTests: ["CBC with differential", "CRP", "Serum lactate", "Blood cultures"],
  },
  {
    id: "REDFLAG-CHOLANGITIS",
    name: "Fever + jaundice + RUQ pain → cholangitis",
    match: (text) => /fever/.test(text) && /jaundice|icterus|yellow/.test(text) && /ruq|right upper|right hypochondr/.test(text),
    hypothesis: hypothesis({
      diagnosis: "Choledocholithiasis with Ascending Cholangitis",
      tier: "cant-miss",
      probability: 0.45,
      reasoning: "Deterministic rule: Charcot's triad (fever, jaundice, RUQ pain) is ascending cholangitis until biliary drainage is secured.",
      supports: ["Fever with chills", "Jaundice", "RUQ pain"],
      against: ["No documented hypotension or altered mentation"],
      rootCauseCategory: "infectious",
      mechanism: CHOLANGITIS_MECHANISM,
      anatomyFocus: "Liver",
    }),
    requiredTests: ["Liver Function Tests", "USG Abdomen (biliary tree)", "Blood Culture (2 sets)"],
  },
  {
    id: "REDFLAG-NOF",
    name: "Elderly fall + hip pain + can't bear weight → NOF fracture",
    match: (text, c) =>
      /fall|fell|slip/.test(text) &&
      /hip|groin/.test(text) &&
      (c.patient?.age ?? 0) >= 60 &&
      /bear weight|weight.?bearing|unable to stand|cannot stand|can't stand|shortened|externally rotated/.test(text),
    hypothesis: hypothesis({
      diagnosis: "Neck-of-Femur Fracture",
      tier: "cant-miss",
      probability: 0.72,
      reasoning: "Deterministic rule: elderly fall + hip pain + inability to bear weight is a neck-of-femur fracture until X-ray proves otherwise.",
      supports: ["Fall from standing height", "Hip/groin pain", "Cannot bear weight", "Age ≥ 60 (osteoporosis risk)"],
      against: ["No documented normal X-ray pelvis yet"],
      rootCauseCategory: "traumatic",
      mechanism: NOF_MECHANISM,
      anatomyFocus: "Femur",
    }),
    requiredTests: ["X-ray Pelvis (AP + Lateral Hip)"],
  },
  {
    id: "REDFLAG-MENINGITIS",
    name: "Fever + neck stiffness → meningitis",
    match: (text) => /fever/.test(text) && /neck stiffness|stiff neck|meningism/.test(text),
    hypothesis: hypothesis({
      diagnosis: "Bacterial Meningitis",
      tier: "cant-miss",
      probability: 0.42,
      reasoning: "Deterministic rule: fever with neck stiffness requires CSF analysis to exclude bacterial meningitis.",
      supports: ["Fever", "Neck stiffness"],
      against: ["No documented focal deficit"],
      rootCauseCategory: "infectious",
      mechanism: MENINGITIS_MECHANISM,
      anatomyFocus: "Brain",
    }),
    requiredTests: ["Lumbar Puncture + CSF Analysis", "Blood Culture (2 sets)"],
  },
  {
    id: "REDFLAG-PE",
    name: "Pleuritic chest pain + tachycardia → PE",
    match: (text) => /pleuritic|sharp chest pain/.test(text) && /tachycardia|heart rate|hr\s*1[0-9][0-9]/.test(text),
    hypothesis: hypothesis({
      diagnosis: "Pulmonary Embolism",
      tier: "cant-miss",
      probability: 0.3,
      reasoning: "Deterministic rule: pleuritic chest pain with tachycardia keeps PE on the can't-miss list.",
      supports: ["Pleuritic chest pain", "Tachycardia"],
      against: ["No haemoptysis documented"],
      rootCauseCategory: "vascular",
      mechanism: PE_MECHANISM,
      anatomyFocus: "Lung",
    }),
    requiredTests: ["D-Dimer", "CT Pulmonary Angiography"],
  },
  {
    id: "REDFLAG-DENGUE",
    name: "Fever + petechiae/thrombocytopenia → dengue",
    match: (text) => /fever/.test(text) && /petechi|rash|platelet|thrombocyt/.test(text),
    hypothesis: hypothesis({
      diagnosis: "Dengue Fever",
      tier: "most-likely",
      probability: 0.35,
      reasoning: "Deterministic rule: febrile illness with petechiae or thrombocytopenia in an endemic region is dengue until NS1/serology settles it.",
      supports: ["Fever", "Petechial rash / thrombocytopenia"],
      against: ["No documented bleeding"],
      rootCauseCategory: "infectious",
      mechanism: DENGUE_MECHANISM,
      anatomyFocus: "Liver",
    }),
    requiredTests: ["Dengue NS1 Antigen", "CBC with Platelets"],
  },
];

// ---------------------------------------------------------------------------
// Expanded-tier knowledge (India prevalence context, deterministic)
// ---------------------------------------------------------------------------

interface BaseHypothesisSpec {
  diagnosis: string;
  probability: number;
  reasoning: string;
  rootCauseCategory: ScientistHypothesis["rootCauseCategory"];
  mechanism?: MechanismLadder7D;
  anatomyFocus?: string;
  match: (text: string, c: ScientistCase) => boolean;
}

const BASE_HYPOTHESES: BaseHypothesisSpec[] = [
  {
    diagnosis: "Cellulitis",
    probability: 0.55,
    reasoning: "Unilateral painful erythematous swollen limb is most consistent with skin and soft-tissue infection once necrotizing infection is excluded.",
    rootCauseCategory: "infectious",
    mechanism: CELLULITIS_MECHANISM,
    anatomyFocus: "Skin",
    match: (text) => /cellulitis|red swollen painful.*leg|leg.*red.*swollen|spreading erythema|lower limb.*edema/.test(text),
  },
  {
    diagnosis: "Deep Vein Thrombosis",
    probability: 0.32,
    reasoning: "Unilateral leg swelling and pain requires DVT exclusion using Wells score and venous Doppler.",
    rootCauseCategory: "vascular",
    mechanism: DVT_MECHANISM,
    anatomyFocus: "Vein",
    match: (text) => /leg.*swollen|swollen.*leg|calf pain|lower limb.*edema|unilateral.*swelling/.test(text),
  },
  {
    diagnosis: "Acute Viral Hepatitis",
    probability: 0.22,
    reasoning: "Jaundice with fever in an Indian district hospital context — viral hepatitis is a leading expanded differential.",
    rootCauseCategory: "infectious",
    mechanism: HEPATITIS_MECHANISM,
    anatomyFocus: "Liver",
    match: (text) => /fever|jaundice|yellow/.test(text),
  },
  {
    diagnosis: "Malaria",
    probability: 0.2,
    reasoning: "Endemic malaria (P. vivax/falciparum) — fever with jaundice or chills must keep malaria on the list.",
    rootCauseCategory: "infectious",
    mechanism: MALARIA_MECHANISM,
    anatomyFocus: "Spleen",
    match: (text) => /fever|chills|rigor/.test(text),
  },
  {
    diagnosis: "Leptospirosis",
    probability: 0.15,
    reasoning: "Fever with jaundice and renal/liver derangement — leptospirosis is a monsoon-season expanded differential.",
    rootCauseCategory: "infectious",
    mechanism: LEPTOSPIROSIS_MECHANISM,
    anatomyFocus: "Kidney",
    match: (text) => /fever|jaundice|myalgia/.test(text),
  },
  {
    diagnosis: "Iron Deficiency Anaemia",
    probability: 0.3,
    reasoning: "Fatigue in a young adult — anaemia is the commonest reversible cause in this context.",
    rootCauseCategory: "metabolic",
    mechanism: ANAEMIA_MECHANISM,
    match: (text) => /fatigue|tired|weakness/.test(text),
  },
  {
    diagnosis: "Hypothyroidism",
    probability: 0.2,
    reasoning: "Persistent fatigue without anaemia — hypothyroidism is a common, treatable expanded differential.",
    rootCauseCategory: "metabolic",
    mechanism: HYPOTHYROID_MECHANISM,
    anatomyFocus: "Thyroid",
    match: (text) => /fatigue|tired|letharg/.test(text),
  },
];

// ---------------------------------------------------------------------------
// Unexplained findings — what no hypothesis explains
// ---------------------------------------------------------------------------

const EXPLAINED_BY: Record<string, RegExp> = {
  "acute coronary syndrome": /chest pain|st elevation|st segment|troponin|diaphoresis|sweat|ecg/i,
  "choledocholithiasis with ascending cholangitis": /fever|jaundice|ruq|right upper|bilirubin|alkp|alp|wbc|charcot/i,
  "neck-of-femur fracture": /fall|hip|groin|leg|shorten|externally rotated|bear weight|weight.?bearing/i,
  "bacterial meningitis": /fever|neck|stiff|meningism|headache|photophobia|csf/i,
  "pulmonary embolism": /chest pain|pleuritic|tachycardia|spo2|oxygen|dyspnea|shortness/i,
  "dengue fever": /fever|rash|petechi|platelet|ns1|hematocrit|haematocrit/i,
  "cellulitis": /cellulitis|erythema|redness|warmth|swelling|pain|wbc|crp|fever/i,
  "deep vein thrombosis": /dvt|calf|swelling|doppler|wells|immobil|tenderness/i,
  "acute viral hepatitis": /jaundice|alt|ast|bilirubin|nausea|fever/i,
  "malaria": /fever|chill|rigor|platelet|splen|smear|parasite/i,
  "leptospirosis": /fever|jaundice|creatinine|myalgia|conjunctiv/i,
  "iron deficiency anaemia": /fatigue|pallor|hb|hemoglobin|haemoglobin|mcv|ferritin/i,
  "hypothyroidism": /fatigue|tired|weight gain|cold intolerance|tsh|bradycardia/i,
};

function collectFindings(c: ScientistCase): string[] {
  const findings: string[] = [];
  const push = (raw: string) => {
    for (const part of String(raw ?? "").split(/[.;\n]/)) {
      const t = part.trim();
      if (t.length >= 3 && t.length <= 200) findings.push(t);
    }
  };
  push(c.exam);
  push(c.imaging);
  for (const [k, v] of Object.entries(c.labs ?? {})) findings.push(`${k} ${v}`);
  return findings;
}

// ---------------------------------------------------------------------------
// Test catalogue (PM Brothers local lab/imaging)
// ---------------------------------------------------------------------------

const TEST_CATALOGUE: Array<Omit<ScientistTest, "informationGain"> & { separates: string[] }> = [
  { id: "ecg", name: "12-lead ECG", rationale: "Directly demonstrates ischaemia/infarction pattern.", costBand: "low", approximateCostRs: "₹150", turnaround: "15 min", availableAtPMBrothers: true, wouldChangeMyMind: "ST elevation → activate STEMI pathway; normal ECG → look beyond ACS.", separates: ["acute coronary syndrome", "pulmonary embolism"] },
  { id: "troponin", name: "High-sensitivity Troponin I/T", rationale: "Myocardial necrosis marker; serial values rule ACS in or out.", costBand: "medium", approximateCostRs: "₹700", turnaround: "60 min", availableAtPMBrothers: true, wouldChangeMyMind: "Elevated above 99th percentile → ACS confirmed; negative at 0/1/3h → ACS unlikely.", separates: ["acute coronary syndrome"] },
  { id: "xray-pelvis", name: "X-ray Pelvis (AP + Lateral Hip)", rationale: "First-line imaging for suspected hip fracture.", costBand: "low", approximateCostRs: "₹400", turnaround: "45 min", availableAtPMBrothers: true, wouldChangeMyMind: "Displaced fracture line → ortho referral now; normal → consider MRI hip.", separates: ["neck-of-femur fracture"] },
  { id: "lft", name: "Liver Function Tests", rationale: "Hepatitis vs obstructive cholestasis pattern separates the top jaundice causes.", costBand: "low", approximateCostRs: "₹350", turnaround: "2 h", availableAtPMBrothers: true, wouldChangeMyMind: "Obstructive pattern (raised ALP > AST) → cholangitis more likely; hepatocellular → hepatitis.", separates: ["acute viral hepatitis", "choledocholithiasis with ascending cholangitis", "leptospirosis"] },
  { id: "usg-abdomen", name: "USG Abdomen (biliary tree)", rationale: "Dilated CBD + stones make cholangitis the top cause.", costBand: "medium", approximateCostRs: "₹900", turnaround: "60 min", availableAtPMBrothers: true, wouldChangeMyMind: "Dilated ducts with calculi → cholangitis; normal ducts → hepatitis/malaria/leptospirosis.", separates: ["choledocholithiasis with ascending cholangitis", "acute viral hepatitis"] },
  { id: "blood-culture", name: "Blood Culture (2 sets)", rationale: "Confirms bacteraemia driving sepsis syndromes.", costBand: "medium", approximateCostRs: "₹1,200", turnaround: "48-72 h", availableAtPMBrothers: true, wouldChangeMyMind: "Gram-negative growth → cholangitis/sepsis confirmed; negative → viral aetiology more likely.", separates: ["choledocholithiasis with ascending cholangitis", "bacterial meningitis"] },
  { id: "cbc", name: "CBC with Platelets", rationale: "Anaemia, leucocytosis, thrombocytopenia each narrow the list.", costBand: "low", approximateCostRs: "₹250", turnaround: "30 min", availableAtPMBrothers: true, wouldChangeMyMind: "Thrombocytopenia → dengue/malaria; leucocytosis → cholangitis/meningitis.", separates: ["dengue fever", "malaria", "iron deficiency anaemia", "choledocholithiasis with ascending cholangitis"] },
  { id: "ns1", name: "Dengue NS1 Antigen", rationale: "Day 1-5 dengue marker in endemic region.", costBand: "medium", approximateCostRs: "₹650", turnaround: "4 h", availableAtPMBrothers: true, wouldChangeMyMind: "NS1 positive → dengue confirmed; negative → repeat serology or look for malaria/lepto.", separates: ["dengue fever", "malaria"] },
  { id: "smear", name: "Peripheral Smear for Malaria Parasite", rationale: "Gold standard for malaria species identification.", costBand: "low", approximateCostRs: "₹200", turnaround: "2 h", availableAtPMBrothers: true, wouldChangeMyMind: "Parasites seen → malaria treated; negative ×3 → consider dengue/lepto.", separates: ["malaria", "dengue fever"] },
  { id: "lepto-igm", name: "Leptospira IgM ELISA", rationale: "Serology for leptospirosis in febrile jaundice.", costBand: "medium", approximateCostRs: "₹800", turnaround: "24 h", availableAtPMBrothers: true, wouldChangeMyMind: "Positive IgM → leptospirosis; negative early → repeat or pursue hepatitis.", separates: ["leptospirosis", "acute viral hepatitis"] },
  { id: "d-dimer", name: "D-Dimer", rationale: "High sensitivity (low specificity) for venous thromboembolism.", costBand: "medium", approximateCostRs: "₹850", turnaround: "2 h", availableAtPMBrothers: true, wouldChangeMyMind: "Negative → PE effectively excluded (age-adjusted); positive → CTPA.", separates: ["pulmonary embolism"] },
  { id: "ctpa", name: "CT Pulmonary Angiography", rationale: "Definitive imaging for PE.", costBand: "high", approximateCostRs: "₹4,500", turnaround: "60 min", availableAtPMBrothers: true, wouldChangeMyMind: "Filling defect → PE confirmed; negative → stop anticoagulation workup.", separates: ["pulmonary embolism"] },
  { id: "lumbar-puncture", name: "Lumbar Puncture + CSF Analysis", rationale: "Diagnostic for meningitis.", costBand: "high", approximateCostRs: "₹1,500", turnaround: "90 min", availableAtPMBrothers: true, wouldChangeMyMind: "Neutrophilic pleocytosis → bacterial meningitis; clear CSF → viral.", separates: ["bacterial meningitis"] },
  { id: "tsh", name: "Thyroid Function Tests (TSH)", rationale: "First-line test for hypothyroid fatigue.", costBand: "low", approximateCostRs: "₹300", turnaround: "4 h", availableAtPMBrothers: true, wouldChangeMyMind: "Raised TSH → hypothyroidism; normal TSH → pursue anaemia/other causes.", separates: ["hypothyroidism", "iron deficiency anaemia"] },
  { id: "iron-studies", name: "Serum Ferritin + Iron Studies", rationale: "Confirms iron deficiency as the cause of anaemia.", costBand: "low", approximateCostRs: "₹450", turnaround: "4 h", availableAtPMBrothers: true, wouldChangeMyMind: "Low ferritin → iron deficiency anaemia; normal → anaemia of chronic disease.", separates: ["iron deficiency anaemia", "hypothyroidism"] },
  { id: "mri-hip", name: "MRI Hip", rationale: "Occult fractures missed on X-ray.", costBand: "high", approximateCostRs: "₹6,000", turnaround: "Next day", availableAtPMBrothers: true, wouldChangeMyMind: "Oedema/fracture line → NOF despite normal X-ray; negative → soft-tissue cause.", separates: ["neck-of-femur fracture"] },
  { id: "cbc-diff", name: "CBC with differential", rationale: "Urgent baseline for infection severity; leucocytosis supports cellulitis/sepsis and helps triage necrotizing infection risk.", costBand: "low", approximateCostRs: "Rs 250", turnaround: "30 min", availableAtPMBrothers: true, wouldChangeMyMind: "Marked leucocytosis -> infection/sepsis risk rises; normal WBC lowers but does not exclude cellulitis.", separates: ["cellulitis", "necrotizing fasciitis", "sepsis"] },
  { id: "crp", name: "CRP", rationale: "Inflammatory burden marker; high values support soft-tissue infection and escalation risk.", costBand: "low", approximateCostRs: "Rs 350", turnaround: "2 h", availableAtPMBrothers: true, wouldChangeMyMind: "Very high CRP -> deep infection/necrotizing concern rises; normal CRP makes severe bacterial inflammation less likely.", separates: ["cellulitis", "necrotizing fasciitis", "sepsis"] },
  { id: "venous-doppler", name: "Venous Doppler", rationale: "Compression ultrasound directly evaluates DVT in the swollen painful limb.", costBand: "medium", approximateCostRs: "Rs 1,200", turnaround: "60 min", availableAtPMBrothers: true, wouldChangeMyMind: "Non-compressible deep vein -> DVT confirmed; normal compressibility -> DVT unlikely.", separates: ["deep vein thrombosis"] },
  { id: "serum-lactate", name: "Serum lactate", rationale: "Detects tissue hypoperfusion in sepsis or necrotizing soft-tissue infection.", costBand: "medium", approximateCostRs: "Rs 600", turnaround: "45 min", availableAtPMBrothers: true, wouldChangeMyMind: "Raised lactate -> urgent sepsis/surgical escalation; normal lactate lowers shock physiology concern.", separates: ["necrotizing fasciitis", "sepsis"] },
];

function keyFor(diagnosis: string): string {
  const d = diagnosis.toLowerCase();
  if (/coronary|acs|stemi/.test(d)) return "acute coronary syndrome";
  if (/cholangitis/.test(d)) return "choledocholithiasis with ascending cholangitis";
  if (/noF|neck.of.femur|hip fracture/.test(d)) return "neck-of-femur fracture";
  if (/meningitis/.test(d)) return "bacterial meningitis";
  if (/pulmonary embolism|\bpe\b/.test(d)) return "pulmonary embolism";
  if (/dengue/.test(d)) return "dengue fever";
  if (/necrotizing|necrotising/.test(d)) return "necrotizing fasciitis";
  if (/\bdvt\b|deep vein thrombosis/.test(d)) return "deep vein thrombosis";
  if (/cellulitis/.test(d)) return "cellulitis";
  if (/sepsis/.test(d)) return "sepsis";
  if (/hepatitis/.test(d)) return "acute viral hepatitis";
  if (/malaria/.test(d)) return "malaria";
  if (/leptospir/.test(d)) return "leptospirosis";
  if (/anaemia|anemia/.test(d)) return "iron deficiency anaemia";
  if (/hypothyroid/.test(d)) return "hypothyroidism";
  return d;
}

function computeInformationGain(test: { separates: string[] }, hypotheses: ScientistHypothesis[]): number {
  let gain = 0;
  const keys = hypotheses.map((h) => keyFor(h.diagnosis));
  for (let i = 0; i < hypotheses.length; i++) {
    for (let j = i + 1; j < hypotheses.length; j++) {
      const sepI = test.separates.some((s) => keys[i].includes(s) || s.includes(keys[i]));
      const sepJ = test.separates.some((s) => keys[j].includes(s) || s.includes(keys[j]));
      if (sepI !== sepJ) gain += Math.abs(hypotheses[i].probability - hypotheses[j].probability) * 0.5;
    }
  }
  const topSeparated = hypotheses.length > 0 && test.separates.some((s) => keys[0].includes(s) || s.includes(keys[0]));
  if (topSeparated) gain += 0.3;
  return Math.min(1, gain);
}

function rankTests(hypotheses: ScientistHypothesis[], required: string[]): ScientistTest[] {
  const scored = TEST_CATALOGUE.map((t) => ({
    ...t,
    informationGain: Number(computeInformationGain(t, hypotheses).toFixed(2)),
  }));
  scored.sort((a, b) => b.informationGain - a.informationGain || a.costBand.localeCompare(b.costBand));
  const ordered: typeof scored = [];
  for (const name of required) {
    const idx = scored.findIndex((t) => t.name.toLowerCase() === name.toLowerCase());
    if (idx >= 0) ordered.push(scored.splice(idx, 1)[0]);
  }
  ordered.push(...scored);
  const out: ScientistTest[] = ordered.map(({ separates: _separates, ...rest }) => rest);
  return out;
}

const RULE_OUT_CRITERIA: Record<string, string> = {
  "acute coronary syndrome": "Rule out only after non-ischaemic ECG and serial high-sensitivity troponins per ACC/AHA chest pain pathway.",
  "choledocholithiasis with ascending cholangitis": "Rule out if no Charcot triad physiology and USG/MRCP shows no biliary obstruction, with alternative cause established.",
  "neck-of-femur fracture": "Rule out if X-ray pelvis/hip is normal and MRI is negative when clinical suspicion persists.",
  "bacterial meningitis": "Rule out with appropriate CSF analysis and clinical context after imaging safety is assessed.",
  "pulmonary embolism": "Rule out by low Wells score plus negative age-adjusted D-dimer, or negative CTPA when indicated.",
  "dengue fever": "Rule out if dengue NS1/serology is negative in the appropriate window and another diagnosis explains fever/thrombocytopenia.",
  "necrotizing fasciitis": "Rule out only after senior surgical review finds no pain out of proportion, crepitus/bullae/anaesthesia/shock, and imaging/labs do not support deep fascial infection.",
  "cellulitis": "Rule out if no local warmth/erythema/tenderness and inflammatory markers are normal with another cause for swelling.",
  "deep vein thrombosis": "Rule out by low Wells score with negative D-dimer, or normal compression venous Doppler.",
  "sepsis": "Rule out if infection is not supported and qSOFA/lactate/vitals do not show organ dysfunction or hypoperfusion.",
  "acute viral hepatitis": "Rule out with negative viral markers and absent hepatocellular LFT pattern.",
  "malaria": "Rule out with negative serial peripheral smears/rapid antigen in the right clinical window.",
  "leptospirosis": "Rule out with negative Leptospira testing when timing is appropriate and no renal/hepatic pattern supports it.",
  "iron deficiency anaemia": "Rule out with normal ferritin/iron indices and no microcytic anaemia.",
  "hypothyroidism": "Rule out with normal TSH/free T4.",
};

function confidenceFor(h: ScientistHypothesis): DdxConfidence {
  if (h.probability >= 0.65 || h.source === "rule") return "High";
  if (h.probability >= 0.3) return "Moderate";
  return "Low";
}

function modalityFor(testName: string): InvestigationModality {
  return /x-?ray|ct|mri|usg|ultrasound|doppler|echo/i.test(testName) ? "radiology"
    : /review|consult|surgical/i.test(testName) ? "clinical-review"
    : "lab";
}

function buildCauseChain(hypotheses: ScientistHypothesis[]): string {
  const top = hypotheses[0];
  if (!top?.mechanism) return "Cause not available -> mechanism not available -> finding pattern under review";
  const first = top.mechanism.molecular?.[0] ?? "Cause not available";
  const tissue = top.mechanism.tissue?.[0] ?? "Tissue response not available";
  const organ = top.mechanism.organ?.[0] ?? "Clinical finding not available";
  return `${first} -> ${tissue} -> ${organ}`;
}

function buildDdxMatrix(hypotheses: ScientistHypothesis[], tests: ScientistTest[]): DdxMatrixRow[] {
  const pinned = hypotheses.filter((h) => h.tier === "cant-miss");
  const rest = hypotheses.filter((h) => h.tier !== "cant-miss");
  return [...pinned, ...rest].slice(0, 7).map((h, index) => {
    const key = keyFor(h.diagnosis);
    const next = tests.find((t) => TEST_CATALOGUE.find((cat) => cat.id === t.id)?.separates.some((s) => key.includes(s) || s.includes(key))) ?? tests[index] ?? tests[0];
    return {
      id: `ddx-${index + 1}-${key.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      diagnosis: h.diagnosis,
      probabilityEstimatePct: Math.round(h.probability * 100),
      confidence: confidenceFor(h),
      supports: h.supports?.length ? h.supports : ["not available"],
      againstOrMissing: h.against?.length ? h.against : ["not available"],
      definitiveRuleOutCriterion: RULE_OUT_CRITERIA[key] ?? "not available",
      nextTestThatSettlesIt: next?.name ?? "not available",
      pinnedRedFlag: h.tier === "cant-miss",
      ruledOutByDoctor: false,
      estimateLabel: "derived estimate",
    };
  });
}

function buildInvestigationPlanner(tests: ScientistTest[], matrix: DdxMatrixRow[]): InvestigationPlanItem[] {
  return tests.slice(0, 8).map((t) => {
    const modality = modalityFor(t.name);
    const match = matrix.find((row) => keyFor(row.diagnosis) && TEST_CATALOGUE.find((cat) => cat.id === t.id)?.separates.some((s) => keyFor(row.diagnosis).includes(s) || s.includes(keyFor(row.diagnosis))));
    const utilityPct = Math.max(30, Math.min(95, Math.round(t.informationGain * 100) || (t.name === "CBC with differential" ? 90 : t.name === "Venous Doppler" ? 85 : 50)));
    const group: InvestigationGroup = t.informationGain >= 0.75 || /urgent|lactate|blood culture|cbc with differential/i.test(t.name) ? "Urgent"
      : t.informationGain >= 0.35 || /doppler|crp|troponin|usg|ct|x-ray/i.test(t.name) ? "Confirmatory"
      : "Optional";
    return {
      id: t.id,
      name: t.name,
      group,
      utilityPct,
      rationale: t.rationale,
      expectedAbnormalResult: t.wouldChangeMyMind,
      movesDdxRowId: match?.id ?? null,
      modality,
      orderCategory: modality === "radiology" ? "radiology" : modality === "clinical-review" ? "clinical" : "laboratory",
      checked: false,
    };
  });
}

export function validateScientistDecisionSchema(analysis: Pick<ScientistAnalysis, "ddxMatrix" | "investigationPlanner">): string | null {
  if (!Array.isArray(analysis.ddxMatrix) || analysis.ddxMatrix.length === 0) return "DDx matrix unavailable.";
  for (const row of analysis.ddxMatrix) {
    if (
      !row.id ||
      !row.diagnosis ||
      typeof row.probabilityEstimatePct !== "number" ||
      row.probabilityEstimatePct < 0 ||
      row.probabilityEstimatePct > 100 ||
      !["High", "Moderate", "Low"].includes(row.confidence) ||
      !row.supports?.length ||
      !row.againstOrMissing?.length ||
      !row.definitiveRuleOutCriterion ||
      !row.nextTestThatSettlesIt ||
      row.estimateLabel !== "derived estimate"
    ) {
      return "DDx matrix schema incomplete.";
    }
  }
  if (!Array.isArray(analysis.investigationPlanner)) return "Investigation planner unavailable.";
  for (const item of analysis.investigationPlanner) {
    if (
      !item.id ||
      !item.name ||
      !["Urgent", "Confirmatory", "Optional"].includes(item.group) ||
      typeof item.utilityPct !== "number" ||
      item.utilityPct < 0 ||
      item.utilityPct > 100 ||
      !item.rationale ||
      !item.expectedAbnormalResult ||
      !["lab", "radiology", "clinical-review"].includes(item.modality) ||
      !["laboratory", "radiology", "clinical"].includes(item.orderCategory) ||
      item.checked !== false
    ) {
      return "Investigation planner schema incomplete.";
    }
  }
  return null;
}

function buildSafeInterpretationLine(update: ScientistAnalysis["update"]): string | null {
  if (!update?.result?.test || !update.result.value) return null;
  return `${update.result.test}: ${update.result.value}. Pattern summary only; final diagnosis requires doctor confirmation.`;
}

// ---------------------------------------------------------------------------
// Likelihood-ratio update table (deterministic, offline)
// ---------------------------------------------------------------------------

interface LrEntry {
  test: RegExp;
  result: RegExp;
  hypotheses: Array<{ diagnosis: RegExp; lr: number; reason: string }>;
}

const LIKELIHOOD_RATIOS: LrEntry[] = [
  {
    test: /troponin/i,
    result: /positive|elevated|raised|high|\d+\s*(ng|pg)/i,
    hypotheses: [{ diagnosis: /coronary|acs|stemi/i, lr: 8.5, reason: "Elevated troponin: LR+ ≈ 8.5 for myocardial necrosis (ESC NSTEMI guidance)." }],
  },
  {
    test: /ecg/i,
    result: /st elevation|st segment|ste/i,
    hypotheses: [{ diagnosis: /coronary|acs|stemi/i, lr: 11.2, reason: "ST elevation on ECG: LR+ ≈ 11 for ACS (ACC/AHA)." }],
  },
  {
    test: /x-?ray pelvis|hip x-?ray/i,
    result: /fracture|displaced|intertrochanteric|intracapsular/i,
    hypotheses: [{ diagnosis: /noF|neck.of.femur|hip fracture/i, lr: 20, reason: "Fracture line on pelvis/hip X-ray is essentially diagnostic of NOF fracture." }],
  },
  {
    test: /ns1/i,
    result: /positive|reactive/i,
    hypotheses: [{ diagnosis: /dengue/i, lr: 12, reason: "Positive NS1 antigen: LR+ ≈ 12 for dengue (day 1-5)." }],
  },
  {
    test: /usg|ultrasound/i,
    result: /dilated|stone|calculus|obstruct/i,
    hypotheses: [{ diagnosis: /cholangitis/i, lr: 8, reason: "Dilated ducts with stones on USG: LR+ ≈ 8 for cholangitis." }],
  },
  {
    test: /blood culture/i,
    result: /positive|growth|isolated/i,
    hypotheses: [
      { diagnosis: /cholangitis|meningitis/i, lr: 6, reason: "Positive blood culture confirms bacteraemia — LR+ ≈ 6 for cholangitis/meningitis." },
    ],
  },
  {
    test: /smear|mp\b|malaria parasite/i,
    result: /positive|parasite|seen|ring/i,
    hypotheses: [{ diagnosis: /malaria/i, lr: 15, reason: "Parasites on smear are diagnostic of malaria." }],
  },
  {
    test: /leptospira|lepto.?igm/i,
    result: /positive|reactive/i,
    hypotheses: [{ diagnosis: /leptospir/i, lr: 10, reason: "Positive Leptospira IgM: strong serological support (LR+ ≈ 10)." }],
  },
  {
    test: /d-?dimer/i,
    result: /negative|normal/i,
    hypotheses: [{ diagnosis: /pulmonary embolism|\bpe\b/i, lr: 0.1, reason: "Negative (age-adjusted) D-dimer: LR− ≈ 0.1 — PE effectively excluded." }],
  },
  {
    test: /tsh/i,
    result: /raised|elevated|high/i,
    hypotheses: [{ diagnosis: /hypothyroid/i, lr: 9, reason: "Raised TSH: LR+ ≈ 9 for primary hypothyroidism." }],
  },
  {
    test: /ferritin/i,
    result: /low/i,
    hypotheses: [{ diagnosis: /anaemia|anemia/i, lr: 6, reason: "Low ferritin: LR+ ≈ 6 for iron deficiency anaemia." }],
  },
];

// ---------------------------------------------------------------------------
// Core builders
// ---------------------------------------------------------------------------

function tierLabel(t: HypothesisTier): string {
  return t === "cant-miss" ? "Can't-miss" : t === "most-likely" ? "Most likely" : "Expanded";
}

function buildProblemRepresentation(c: ScientistCase, redFlagNames: string[]): string {
  const ageBand = bandAge(c.patient?.age);
  const sex = c.patient?.sex ? c.patient.sex : "sex not stated";
  const text = caseFingerprint(c);
  const tempo = /acute|sudden|hours|today|now/i.test(text) ? "acute onset"
    : /gradual|weeks|months|insidious|progressive/i.test(text) ? "insidious course"
    : "tempo not stated";
  const pattern = /intermittent|paroxysmal/i.test(text) ? "intermittent pattern"
    : /constant|continuous/i.test(text) ? "constant pattern"
    : /progressive|worsening/i.test(text) ? "progressive pattern"
    : "pattern not stated";
  const flags = redFlagNames.length ? ` Red-flag rules fired: ${redFlagNames.join("; ")}.` : "";
  return `${ageBand} ${sex} with ${String(c.complaint ?? "unrecorded complaint").slice(0, 120)} — ${tempo}, ${pattern}.${flags}`;
}

function buildDeterministicHypotheses(c: ScientistCase): { hypotheses: ScientistHypothesis[]; redFlags: string[]; requiredTests: string[] } {
  const text = caseFingerprint(c);
  const fired = RED_FLAG_RULES.filter((r) => r.match(text, c));
  const required: string[] = [];
  const seen = new Set<string>();
  const out: ScientistHypothesis[] = [];

  for (const rule of fired) {
    const h = { ...rule.hypothesis, supports: [...rule.hypothesis.supports], against: [...rule.hypothesis.against] };
    out.push(h);
    seen.add(keyFor(h.diagnosis));
    required.push(...rule.requiredTests);
  }
  // Expanded-tier knowledge base
  for (const spec of BASE_HYPOTHESES) {
    if (!spec.match(text, c)) continue;
    const k = keyFor(spec.diagnosis);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(hypothesis({
      diagnosis: spec.diagnosis,
      tier: "expanded",
      probability: spec.probability,
      reasoning: spec.reasoning,
      supports: ["Consistent with the presentation", "Common in this prevalence context"],
      against: ["Awaiting discriminating results"],
      rootCauseCategory: spec.rootCauseCategory,
      mechanism: spec.mechanism,
      anatomyFocus: spec.anatomyFocus,
      source: "base",
    }));
  }
  // A case must never return empty — generic fallback keeps decision support honest.
  if (out.length === 0) {
    out.push(hypothesis({
      diagnosis: "Undifferentiated presentation — needs more data",
      tier: "most-likely",
      probability: 0.5,
      reasoning: "No deterministic rule matched. More history, examination and baseline labs are required before a differential can be committed.",
      supports: ["Presenting complaint recorded"],
      against: ["Insufficient structured data to commit to a disease"],
      rootCauseCategory: "unknown",
      source: "base",
    }));
  }

  // When no red-flag rule fired, promote the strongest evidence-based entry to
  // most-likely so the three-tier structure stays meaningful.
  if (out.every((h) => h.tier === "expanded")) {
    out.sort((a, b) => b.probability - a.probability);
    out[0] = { ...out[0], tier: "most-likely" };
  }

  out.sort((a, b) => {
    const rank: Record<HypothesisTier, number> = { "cant-miss": 0, "most-likely": 1, "expanded": 2 };
    return rank[a.tier] - rank[b.tier] || b.probability - a.probability;
  });

  return { hypotheses: out, redFlags: fired.map((r) => r.name), requiredTests: [...new Set(required)] };
}

function findUnexplainedFindings(c: ScientistCase, hypotheses: ScientistHypothesis[]): string[] {
  const findings = collectFindings(c);
  if (findings.length === 0) return [];
  const keys = hypotheses.map((h) => keyFor(h.diagnosis));
  const unexplained: string[] = [];
  for (const f of findings) {
    const explained = keys.some((k) => {
      const re = EXPLAINED_BY[k];
      return re ? re.test(f) : false;
    });
    if (!explained && !unexplained.includes(f)) unexplained.push(f);
  }
  return unexplained;
}

function localEvidence(c: ScientistCase, hypotheses: ScientistHypothesis[]): { evidence: ScientistEvidence[]; note: string } {
  const query = `${String(c.complaint ?? "")} ${hypotheses.slice(0, 3).map((h) => h.diagnosis).join(" ")}`.slice(0, 500);
  const hits = vectorStore.search(query, 5);
  const evidence: ScientistEvidence[] = hits.map((h) => ({
    title: h.title ?? h.source ?? h.id,
    source: h.source ?? "local-knowledge-base",
    snippet: h.text.slice(0, 220),
    evidenceLevel: h.evidenceLevel,
  }));
  return {
    evidence,
    note: evidence.length === 0
      ? "No local knowledge-base entry matched this case — no references are cited (nothing is invented)."
      : "Citations retrieved from the local Astra knowledge base only.",
  };
}

function buildSpokenSummary(a: Omit<ScientistAnalysis, "spokenSummary">): string {
  const top = a.hypotheses[0];
  const cantMiss = a.hypotheses.find((h) => h.tier === "cant-miss");
  const s1 = top
    ? `Doctor, the leading hypothesis is ${top.diagnosis} in the ${tierLabel(top.tier).toLowerCase()} tier, with a pre-test probability around ${Math.round(top.probability * 100)} percent.`
    : "Doctor, no hypothesis could be committed from the data provided.";
  const s2 = cantMiss
    ? `${cantMiss.diagnosis} stays on the can't-miss list and must be actively excluded.`
    : "No can't-miss red-flag rule has fired so far.";
  const s3 = a.tests[0]
    ? `The highest-value next test is ${a.tests[0].name} — ${a.tests[0].wouldChangeMyMind}`
    : "Add more findings or results and I will re-rank.";
  return `${s1} ${s2} ${s3} This is decision support only — please confirm before acting.`;
}

// ---------------------------------------------------------------------------
// LLM augmentation (de-identified, local-only via the existing router)
// ---------------------------------------------------------------------------

const SCIENTIST_SYSTEM =
  "You are the Astra Scientist agent — a clinician-scientist assistant. " +
  "You receive a DE-IDENTIFIED case (age band only). Propose up to 4 additional " +
  "differential hypotheses and, for each, one mechanism insight and any finding " +
  "the current differential fails to explain. Reply with ONLY JSON: " +
  '{"hypotheses":[{"diagnosis":"...","tier":"most-likely|expanded","reasoning":"...",' +
  '"supports":["..."],"against":["..."],"rootCauseCategory":"infectious|vascular|traumatic|metabolic|autoimmune|neoplastic|toxic|genetic|iatrogenic|unknown",' +
  '"anatomyFocus":"organ name"}],"unexplained":["finding text"]}. ' +
  "Any probability-like value is only an estimate and must be labelled as an estimate if included. " +
  "Any unknown field is null; never invent findings, results, textbook names or guideline names. " +
  "If a textbook or guideline name is provided in the case, cite that name inside reasoning; otherwise do not cite. " +
  "Never include identifiers, never invent lab values, never claim certainty. " +
  "Your hypotheses are suggestions the doctor must approve.";

async function tryLlmAugmentation(c: ScientistCase): Promise<{
  hypotheses: ScientistHypothesis[];
  unexplained: string[];
  answeredBy?: string;
  model?: string;
} | null> {
  try {
    const env = readModelGatewayEnv();
    if (!env.localModel) return null;
    const { text } = deidentifyForRemote(c);
    const res = await modelGatewayChat({
      model: env.localModel,
      dataClass: "HIGH_RISK_CLINICAL",
      messages: [
        { role: "system", content: SCIENTIST_SYSTEM },
        { role: "user", content: text },
      ],
      temperature: 0.2,
      max_tokens: 1200,
      signal: AbortSignal.timeout(30_000),
    });
    const raw = (res.text ?? "").replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(raw) as {
      hypotheses?: Array<Partial<ScientistHypothesis>>;
      unexplained?: string[];
    };
    const hypotheses: ScientistHypothesis[] = [];
    for (const h of (parsed.hypotheses ?? []).slice(0, 4)) {
      if (!h.diagnosis || typeof h.diagnosis !== "string") continue;
      const tier: HypothesisTier = h.tier === "most-likely" || h.tier === "expanded" ? h.tier : "expanded";
      hypotheses.push(hypothesis({
        diagnosis: String(h.diagnosis).slice(0, 120),
        tier,
        probability: tier === "most-likely" ? 0.35 : 0.18,
        reasoning: String(h.reasoning ?? "Model-proposed hypothesis (de-identified input).").slice(0, 300),
        supports: (h.supports ?? []).map((s) => String(s).slice(0, 120)).slice(0, 4),
        against: (h.against ?? []).map((s) => String(s).slice(0, 120)).slice(0, 4),
        rootCauseCategory: (["genetic", "infectious", "toxic", "autoimmune", "vascular", "neoplastic", "metabolic", "traumatic", "iatrogenic"] as const).includes(h.rootCauseCategory as never)
          ? h.rootCauseCategory as ScientistHypothesis["rootCauseCategory"]
          : "unknown",
        anatomyFocus: h.anatomyFocus ? String(h.anatomyFocus).slice(0, 60) : undefined,
        source: "llm",
      }));
    }
    const unexplained = (parsed.unexplained ?? []).map((s) => String(s).slice(0, 200)).slice(0, 5);
    return { hypotheses, unexplained, answeredBy: res.answeredBy, model: res.model };
  } catch {
    return null; // any gateway/parse failure → deterministic path only
  }
}

// ---------------------------------------------------------------------------
// Update loop (likelihood-ratio style)
// ---------------------------------------------------------------------------

export function applyNewResult(
  prior: ScientistAnalysis,
  newResult: { test: string; value: string }
): ScientistAnalysis {
  const entries: ScientistUpdateEntry[] = [];
  const hypotheses = prior.hypotheses.map((h) => {
    const before = h.probability;
    let after = before;
    let reason = "";
    let basis: "likelihood-ratio" | "qualitative" = "qualitative";
    const resultText = `${newResult.test} ${newResult.value}`;

    const lrHit = LIKELIHOOD_RATIOS.find((e) => e.test.test(resultText) && e.result.test(resultText));
    const lrFor = lrHit?.hypotheses.find((x) => x.diagnosis.test(h.diagnosis));
    if (lrHit && lrFor) {
      after = bayesUpdate(before, lrFor.lr);
      reason = lrFor.reason;
      basis = "likelihood-ratio";
    } else if (lrHit) {
      // The result discriminates this test's diseases away from this hypothesis.
      after = Math.max(0.01, before - 0.05);
      reason = `${newResult.test} moved probability toward other hypotheses (no LR applies).`;
    } else {
      const cat = TEST_CATALOGUE.find((t) => t.name.toLowerCase() === newResult.test.trim().toLowerCase()
        || newResult.test.trim().toLowerCase().includes(t.name.toLowerCase().split(" ")[0] ?? ""));
      const k = keyFor(h.diagnosis);
      const separated = cat?.separates.some((s) => k.includes(s) || s.includes(k));
      if (cat && separated) {
        after = Math.min(0.99, before + 0.1);
        reason = `Qualitative up: ${newResult.test} is a discriminating test for ${h.diagnosis}; the reported result is compatible.`;
      } else {
        after = Math.max(0.01, before - 0.03);
        reason = `Qualitative down: ${newResult.test} does not discriminate toward ${h.diagnosis}.`;
      }
    }
    if (Math.abs(after - before) > 0.001) {
      entries.push({
        diagnosis: h.diagnosis,
        before: Number(before.toFixed(3)),
        after: Number(after.toFixed(3)),
        delta: Number((after - before).toFixed(3)),
        reason,
        basis,
      });
    }
    return {
      ...h,
      probability: Number(after.toFixed(3)),
      lastUpdate: { result: resultText.slice(0, 120), basis, reason, delta: Number((after - before).toFixed(3)) },
    };
  });

  hypotheses.sort((a, b) => {
    const rank: Record<HypothesisTier, number> = { "cant-miss": 0, "most-likely": 1, "expanded": 2 };
    return rank[a.tier] - rank[b.tier] || b.probability - a.probability;
  });

  const ddxMatrix = buildDdxMatrix(hypotheses, prior.tests);
  const investigationPlanner = buildInvestigationPlanner(prior.tests, ddxMatrix);

  return {
    ...prior,
    revision: prior.revision + 1,
    hypotheses,
    update: { result: newResult, entries },
    ddxMatrix,
    causeChain: buildCauseChain(hypotheses),
    investigationPlanner,
    safeInterpretationLine: buildSafeInterpretationLine({ result: newResult, entries }),
    schemaWarning: validateScientistDecisionSchema({ ddxMatrix, investigationPlanner }),
    spokenSummary: buildSpokenSummary({ ...prior, hypotheses } as Omit<ScientistAnalysis, "spokenSummary">),
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export async function runScientistAnalysis(
  rawCase: unknown,
  opts: { prior?: ScientistAnalysis | null; newResult?: { test: string; value: string } | null } = {}
): Promise<ScientistAnalysis> {
  const c = sanitizeCaseInput(rawCase);
  if (!String(c.complaint ?? "").trim()) {
    throw new Error("MISSING_COMPLAINT: a structured case needs at least a chief complaint");
  }

  // Update loop branch — deterministic re-rank of the prior analysis.
  if (opts.prior && opts.newResult && String(opts.newResult.test ?? "").trim()) {
    return applyNewResult(opts.prior, {
      test: String(opts.newResult.test).slice(0, 80),
      value: String(opts.newResult.value ?? "").slice(0, 200),
    });
  }

  const det = buildDeterministicHypotheses(c);
  const now = new Date().toISOString();

  // LLM augmentation through the existing router (de-identified, local-only).
  const llm = await tryLlmAugmentation(c);
  let hypotheses = det.hypotheses;
  let extraUnexplained: string[] = [];
  if (llm && llm.hypotheses.length) {
    const seen = new Set(hypotheses.map((h) => keyFor(h.diagnosis)));
    const added: ScientistHypothesis[] = [];
    for (const h of llm.hypotheses) {
      const k = keyFor(h.diagnosis);
      if (!seen.has(k)) {
        seen.add(k);
        added.push(h);
      }
    }
    hypotheses = [...hypotheses, ...added];
    extraUnexplained = llm.unexplained;
    hypotheses.sort((a, b) => {
      const rank: Record<HypothesisTier, number> = { "cant-miss": 0, "most-likely": 1, "expanded": 2 };
      return rank[a.tier] - rank[b.tier] || b.probability - a.probability;
    });
  }

  const unexplained = [...new Set([...findUnexplainedFindings(c, hypotheses), ...extraUnexplained])];
  const { evidence, evidenceNote } = localEvidence(c, hypotheses);
  const tests = rankTests(hypotheses, det.requiredTests);
  const ddxMatrix = buildDdxMatrix(hypotheses, tests);
  const investigationPlanner = buildInvestigationPlanner(tests, ddxMatrix);

  const caseSummary = [
    `Age: ${bandAge(c.patient?.age)}${c.patient?.sex ? ` · Sex: ${c.patient.sex}` : ""}`,
    `Complaint: ${String(c.complaint).slice(0, 80)}`,
    ...(det.redFlags.length ? [`Red flags: ${det.redFlags.length}`] : []),
    ...(unexplained.length ? [`Unexplained findings: ${unexplained.length}`] : []),
  ];

  const base: Omit<ScientistAnalysis, "spokenSummary"> = {
    revision: 1,
    mode: llm && llm.hypotheses.length ? "llm-augmented" : "rules-only",
    llm: llm ? { answeredBy: llm.answeredBy, model: llm.model } : null,
    problemRepresentation: buildProblemRepresentation(c, det.redFlags),
    caseSummary,
    hypotheses,
    unexplainedFindings: unexplained,
    tests,
    evidence,
    evidenceNote,
    redFlags: det.redFlags,
    ddxMatrix,
    causeChain: buildCauseChain(hypotheses),
    investigationPlanner,
    safeInterpretationLine: null,
    schemaWarning: validateScientistDecisionSchema({ ddxMatrix, investigationPlanner }),
    safety: {
      decisionSupportOnly: true,
      requiresDoctorConfirmation: true,
      rulesRun: true,
    },
    update: null,
    createdAt: now,
    updatedAt: now,
  };

  return { ...base, spokenSummary: buildSpokenSummary(base) };
}
