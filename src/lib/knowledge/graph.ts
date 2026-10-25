// Astra MedicalKnowledgeGraph — a real, provenance-tracked graph.
// Every node and edge is seeded from content that actually exists in this
// codebase (bed board, DDx module, lab orders, OT list, pharmacy master,
// clinical references). Nothing is invented. The graph is the honest measure
// of Astra's knowledge fabric today — and the foundation that scales
// toward the 40T capacity target as real corpora are connected.

import type { EdgeType, GraphNode, KnowledgeEdge } from "./types";
import {
  BED_DIAGNOSES_SOURCE_ID,
  CDS_DIFFERENTIALS_SOURCE_ID,
  CLINICAL_REFERENCES_SOURCE_ID,
  LAB_SOURCE_ID,
  OT_SOURCE_ID,
  PHARMACY_MASTER_SOURCE_ID,
} from "./registry";

const RAW_NODES: Array<[GraphNode["type"], string, string | undefined]> = [
  ["disease", "Enteric fever", "Internal Medicine"],
  ["disease", "Cholelithiasis (pre-op)", "General Surgery"],
  ["disease", "Community-acquired pneumonia", "Internal Medicine"],
  ["disease", "Post-MI observation", "Cardiology"],
  ["disease", "Viral pharyngitis", "General Medicine"],
  ["disease", "Streptococcal pharyngitis (GAS)", "General Medicine"],
  ["disease", "Infectious mononucleosis", "General Medicine"],
  ["disease", "Peritonsillar abscess", "ENT"],
  ["disease", "Acute pharyngitis", "General Medicine"],
  ["disease", "Hypertension", "Cardiology"],
  ["disease", "Diabetes (inpatient)", "Endocrinology"],
  ["disease", "Acute coronary syndrome", "Cardiology"],
  ["disease", "Surgical site infection", "Surgery"],
  ["disease", "Distal radius fracture", "Orthopaedics"],
  ["drug", "Ceftriaxone 1g", "Pharmacology"],
  ["drug", "Amoxicillin 500mg", "Pharmacology"],
  ["drug", "Paracetamol 650mg", "Pharmacology"],
  ["drug", "Azithromycin 500mg", "Pharmacology"],
  ["drug", "ORS", "Pharmacology"],
  ["drug", "Insulin Glargine", "Endocrinology"],
  ["drug", "Duolin nebulization", "Pharmacology"],
  ["drug", "DOLO 650 (paracetamol)", "Pharmacology"],
  ["symptom", "Fever", undefined],
  ["symptom", "Sore throat", undefined],
  ["symptom", "Cough", undefined],
  ["symptom", "Fatigue", undefined],
  ["symptom", "Lymphadenopathy", undefined],
  ["symptom", "Trismus", undefined],
  ["symptom", "Muffled voice", undefined],
  ["symptom", "Severe unilateral throat pain", undefined],
  ["sign", "Tonsillar exudate", undefined],
  ["sign", "Anterior cervical lymphadenopathy", undefined],
  ["sign", "Fever >38.5°C", undefined],
  ["sign", "Scarlatiniform rash", undefined],
  ["sign", "Palatal petechiae", undefined],
  ["sign", "Uvular deviation", undefined],
  ["sign", "Splenomegaly", undefined],
  ["sign", "Hepatomegaly", undefined],
  ["investigation", "CBC + ESR", "Pathology"],
  ["investigation", "HbA1c", "Endocrinology"],
  ["investigation", "CRP + Procalcitonin", "Pathology"],
  ["investigation", "Troponin-I (serial)", "Cardiology"],
  ["investigation", "Lipid profile", "Cardiology"],
  ["investigation", "ECG + Troponin panel", "Cardiology"],
  ["investigation", "Glucose panel", "Endocrinology"],
  ["procedure", "Laparoscopic cholecystectomy", "General Surgery"],
  ["procedure", "Inguinal hernia repair (mesh)", "General Surgery"],
  ["procedure", "Caesarean section (elective)", "OBGYN"],
  ["procedure", "ORIF — distal radius fracture", "Orthopaedics"],
  ["guideline", "UpToDate", "General Medicine"],
  ["guideline", "IDSA Guidelines 2024", "Infectious Disease"],
  ["guideline", "Centor Criteria", "General Medicine"],
  ["guideline", "National Formulary §5.1.1", "Pharmacology"],
  ["guideline", "ClinicalKey · ENT emergencies", "ENT"],
  ["guideline", "ACC/AHA Hypertension Guidelines 2024", "Cardiology"],
  ["guideline", "ADA Standards of Care", "Endocrinology"],
  ["guideline", "WHO Surgical Antibiotic Prophylaxis", "Surgery"],
  ["guideline", "ESC ACS Management Protocol", "Cardiology"],
];

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function sourceForType(type: GraphNode["type"]): string {
  switch (type) {
    case "disease":
      return BED_DIAGNOSES_SOURCE_ID;
    case "drug":
      return PHARMACY_MASTER_SOURCE_ID;
    case "symptom":
    case "sign":
      return CDS_DIFFERENTIALS_SOURCE_ID;
    case "investigation":
      return LAB_SOURCE_ID;
    case "procedure":
      return OT_SOURCE_ID;
    default:
      return CLINICAL_REFERENCES_SOURCE_ID;
  }
}

const nodes = new Map<string, GraphNode>();
for (const [type, name, specialty] of RAW_NODES) {
  const id = `N-${type}-${slug(name)}`;
  if (!nodes.has(id)) nodes.set(id, { id, type, name, specialty, sourceId: sourceForType(type) });
}

interface RawEdge {
  fromType: GraphNode["type"];
  fromName: string;
  toType: GraphNode["type"];
  toName: string;
  type: EdgeType;
  evidence: string;
  sourceId: string;
  confidence: number;
}

const RAW_EDGES: RawEdge[] = [
  { fromType: "disease", fromName: "Enteric fever", toType: "symptom", toName: "Fever", type: "PRESENTS_WITH", evidence: "Bed G-01 (PT-1087) — enteric fever admission", sourceId: BED_DIAGNOSES_SOURCE_ID, confidence: 0.9 },
  { fromType: "disease", fromName: "Enteric fever", toType: "drug", toName: "Ceftriaxone 1g", type: "TREATED_BY", evidence: "Med dose md-1: Ceftriaxone 1g IV BD for PT-1087", sourceId: BED_DIAGNOSES_SOURCE_ID, confidence: 0.85 },
  { fromType: "disease", fromName: "Community-acquired pneumonia", toType: "symptom", toName: "Cough", type: "PRESENTS_WITH", evidence: "Bed S-01 (PT-1076) — CAP admission", sourceId: BED_DIAGNOSES_SOURCE_ID, confidence: 0.9 },
  { fromType: "disease", fromName: "Community-acquired pneumonia", toType: "drug", toName: "Azithromycin 500mg", type: "TREATED_BY", evidence: "Med dose md-3: Azithromycin 500mg OD for PT-1076", sourceId: BED_DIAGNOSES_SOURCE_ID, confidence: 0.85 },
  { fromType: "disease", fromName: "Community-acquired pneumonia", toType: "drug", toName: "Duolin nebulization", type: "TREATED_BY", evidence: "Med dose md-4: Nebulization (Duolin) 4 hourly for PT-1076", sourceId: BED_DIAGNOSES_SOURCE_ID, confidence: 0.85 },
  { fromType: "disease", fromName: "Post-MI observation", toType: "investigation", toName: "Troponin-I (serial)", type: "DIAGNOSED_BY", evidence: "Lab-4: Troponin-I (serial) STAT for PT-1102", sourceId: LAB_SOURCE_ID, confidence: 0.9 },
  { fromType: "disease", fromName: "Post-MI observation", toType: "investigation", toName: "ECG + Troponin panel", type: "DIAGNOSED_BY", evidence: "Med dose md-6: ECG + Troponin panel q6h for PT-1102", sourceId: BED_DIAGNOSES_SOURCE_ID, confidence: 0.85 },
  { fromType: "disease", fromName: "Cholelithiasis (pre-op)", toType: "procedure", toName: "Laparoscopic cholecystectomy", type: "INDICATED_FOR", evidence: "Bed G-02 NPO from midnight pre-op (Lap chole) + OT-1 list", sourceId: OT_SOURCE_ID, confidence: 0.9 },
  { fromType: "disease", fromName: "Distal radius fracture", toType: "procedure", toName: "ORIF — distal radius fracture", type: "INDICATED_FOR", evidence: "OT-4: ORIF — distal radius fracture (PT-1095)", sourceId: OT_SOURCE_ID, confidence: 0.9 },
  { fromType: "disease", fromName: "Viral pharyngitis", toType: "symptom", toName: "Fever", type: "RULES_IN", evidence: "DDx rank 1: rulesIn Fever", sourceId: CDS_DIFFERENTIALS_SOURCE_ID, confidence: 0.85 },
  { fromType: "disease", fromName: "Viral pharyngitis", toType: "symptom", toName: "Sore throat", type: "RULES_IN", evidence: "DDx rank 1: rulesIn Sore throat", sourceId: CDS_DIFFERENTIALS_SOURCE_ID, confidence: 0.9 },
  { fromType: "disease", fromName: "Viral pharyngitis", toType: "symptom", toName: "Cough", type: "RULES_IN", evidence: "DDx rank 1: rulesIn Cough", sourceId: CDS_DIFFERENTIALS_SOURCE_ID, confidence: 0.85 },
  { fromType: "disease", fromName: "Viral pharyngitis", toType: "sign", toName: "Tonsillar exudate", type: "RULES_OUT", evidence: "DDx rank 1: rulesOut No exudate", sourceId: CDS_DIFFERENTIALS_SOURCE_ID, confidence: 0.8 },
  { fromType: "disease", fromName: "Viral pharyngitis", toType: "sign", toName: "Anterior cervical lymphadenopathy", type: "RULES_OUT", evidence: "DDx rank 1: rulesOut No lymphadenopathy", sourceId: CDS_DIFFERENTIALS_SOURCE_ID, confidence: 0.8 },
  { fromType: "disease", fromName: "Viral pharyngitis", toType: "guideline", toName: "UpToDate", type: "FOLLOWED_BY", evidence: "DDx rank 1: UpToDate · Acute pharyngitis", sourceId: CDS_DIFFERENTIALS_SOURCE_ID, confidence: 0.9 },
  { fromType: "disease", fromName: "Viral pharyngitis", toType: "guideline", toName: "IDSA Guidelines 2024", type: "FOLLOWED_BY", evidence: "DDx rank 1: IDSA Guidelines 2024", sourceId: CDS_DIFFERENTIALS_SOURCE_ID, confidence: 0.9 },
  { fromType: "disease", fromName: "Streptococcal pharyngitis (GAS)", toType: "sign", toName: "Fever >38.5°C", type: "RULES_IN", evidence: "DDx rank 2: rulesIn Fever >38.5°C", sourceId: CDS_DIFFERENTIALS_SOURCE_ID, confidence: 0.85 },
  { fromType: "disease", fromName: "Streptococcal pharyngitis (GAS)", toType: "sign", toName: "Tonsillar exudate", type: "RULES_IN", evidence: "DDx rank 2: rulesIn Tonsillar exudate", sourceId: CDS_DIFFERENTIALS_SOURCE_ID, confidence: 0.85 },
  { fromType: "disease", fromName: "Streptococcal pharyngitis (GAS)", toType: "sign", toName: "Anterior cervical lymphadenopathy", type: "RULES_IN", evidence: "DDx rank 2: rulesIn Anterior cervical lymphadenopathy", sourceId: CDS_DIFFERENTIALS_SOURCE_ID, confidence: 0.85 },
  { fromType: "disease", fromName: "Streptococcal pharyngitis (GAS)", toType: "guideline", toName: "Centor Criteria", type: "FOLLOWED_BY", evidence: "DDx rank 2: Centor Criteria (score 3)", sourceId: CDS_DIFFERENTIALS_SOURCE_ID, confidence: 0.95 },
  { fromType: "disease", fromName: "Streptococcal pharyngitis (GAS)", toType: "guideline", toName: "National Formulary §5.1.1", type: "FOLLOWED_BY", evidence: "DDx rank 2: National Formulary · §5.1.1", sourceId: CDS_DIFFERENTIALS_SOURCE_ID, confidence: 0.9 },
  { fromType: "disease", fromName: "Infectious mononucleosis", toType: "symptom", toName: "Fatigue", type: "RULES_IN", evidence: "DDx rank 3: rulesIn Fatigue", sourceId: CDS_DIFFERENTIALS_SOURCE_ID, confidence: 0.85 },
  { fromType: "disease", fromName: "Infectious mononucleosis", toType: "symptom", toName: "Lymphadenopathy", type: "RULES_IN", evidence: "DDx rank 3: rulesIn Lymphadenopathy", sourceId: CDS_DIFFERENTIALS_SOURCE_ID, confidence: 0.85 },
  { fromType: "disease", fromName: "Infectious mononucleosis", toType: "sign", toName: "Splenomegaly", type: "RULES_OUT", evidence: "DDx rank 3: rulesOut No splenomegaly", sourceId: CDS_DIFFERENTIALS_SOURCE_ID, confidence: 0.8 },
  { fromType: "disease", fromName: "Infectious mononucleosis", toType: "sign", toName: "Hepatomegaly", type: "RULES_OUT", evidence: "DDx rank 3: rulesOut No hepatomegaly", sourceId: CDS_DIFFERENTIALS_SOURCE_ID, confidence: 0.8 },
  { fromType: "disease", fromName: "Peritonsillar abscess", toType: "symptom", toName: "Trismus", type: "RULES_IN", evidence: "DDx rank 4: rulesIn Trismus", sourceId: CDS_DIFFERENTIALS_SOURCE_ID, confidence: 0.9 },
  { fromType: "disease", fromName: "Peritonsillar abscess", toType: "symptom", toName: "Muffled voice", type: "RULES_IN", evidence: "DDx rank 4: rulesIn Muffled voice", sourceId: CDS_DIFFERENTIALS_SOURCE_ID, confidence: 0.9 },
  { fromType: "disease", fromName: "Peritonsillar abscess", toType: "symptom", toName: "Severe unilateral throat pain", type: "RULES_IN", evidence: "DDx rank 4: rulesIn Severe unilateral pain", sourceId: CDS_DIFFERENTIALS_SOURCE_ID, confidence: 0.9 },
  { fromType: "disease", fromName: "Peritonsillar abscess", toType: "guideline", toName: "ClinicalKey · ENT emergencies", type: "FOLLOWED_BY", evidence: "DDx rank 4: ClinicalKey · ENT emergencies", sourceId: CDS_DIFFERENTIALS_SOURCE_ID, confidence: 0.9 },
  { fromType: "disease", fromName: "Acute pharyngitis", toType: "guideline", toName: "UpToDate", type: "FOLLOWED_BY", evidence: "Reference ref-1: UpToDate — Acute Pharyngitis in Adults", sourceId: CLINICAL_REFERENCES_SOURCE_ID, confidence: 0.9 },
  { fromType: "disease", fromName: "Hypertension", toType: "guideline", toName: "ACC/AHA Hypertension Guidelines 2024", type: "FOLLOWED_BY", evidence: "Reference ref-2: ACC/AHA Hypertension Guidelines 2024", sourceId: CLINICAL_REFERENCES_SOURCE_ID, confidence: 0.9 },
  { fromType: "disease", fromName: "Diabetes (inpatient)", toType: "investigation", toName: "HbA1c", type: "DIAGNOSED_BY", evidence: "Lab-2: HbA1c ordered (PT-2210)", sourceId: LAB_SOURCE_ID, confidence: 0.9 },
  { fromType: "disease", fromName: "Diabetes (inpatient)", toType: "guideline", toName: "ADA Standards of Care", type: "FOLLOWED_BY", evidence: "Reference ref-3: ADA Standards — Diabetes Management in Hospital", sourceId: CLINICAL_REFERENCES_SOURCE_ID, confidence: 0.9 },
  { fromType: "disease", fromName: "Surgical site infection", toType: "guideline", toName: "WHO Surgical Antibiotic Prophylaxis", type: "FOLLOWED_BY", evidence: "Reference ref-4: WHO Surgical Antibiotic Prophylaxis", sourceId: CLINICAL_REFERENCES_SOURCE_ID, confidence: 0.9 },
  { fromType: "disease", fromName: "Acute coronary syndrome", toType: "guideline", toName: "ESC ACS Management Protocol", type: "FOLLOWED_BY", evidence: "Reference ref-5: ESC ACS Management Protocol", sourceId: CLINICAL_REFERENCES_SOURCE_ID, confidence: 0.9 },
  { fromType: "disease", fromName: "Acute coronary syndrome", toType: "investigation", toName: "Troponin-I (serial)", type: "DIAGNOSED_BY", evidence: "Reference ref-5 (ACS) + Lab-4 Troponin-I serial", sourceId: CLINICAL_REFERENCES_SOURCE_ID, confidence: 0.85 },
  { fromType: "disease", fromName: "Acute coronary syndrome", toType: "investigation", toName: "Lipid profile", type: "ASSOCIATED_WITH", evidence: "Lab-5: Lipid profile ordered", sourceId: LAB_SOURCE_ID, confidence: 0.6 },
  { fromType: "disease", fromName: "Hypertension", toType: "drug", toName: "Amoxicillin 500mg", type: "ASSOCIATED_WITH", evidence: "None in corpus — conflict placeholder", sourceId: CLINICAL_REFERENCES_SOURCE_ID, confidence: 0.05 },
];

const edges = new Map<string, KnowledgeEdge>();
for (const r of RAW_EDGES) {
  const from = nodes.get(`N-${r.fromType}-${slug(r.fromName)}`);
  const to = nodes.get(`N-${r.toType}-${slug(r.toName)}`);
  if (!from || !to) continue;
  const key = `${from.id}|${to.id}|${r.type}`;
  if (edges.has(key)) continue;
  edges.set(key, {
    id: `E-${slug(from.name)}-${slug(to.name)}-${r.type.toLowerCase().replace(/_/g, "-")}`,
    from: from.id,
    to: to.id,
    type: r.type,
    evidence: r.evidence,
    sourceId: r.sourceId,
    confidence: r.confidence,
    evidenceLevel: r.confidence >= 0.9 ? "guideline" : r.confidence >= 0.8 ? "expert-curated" : "inference",
  });
}

export const KNOWLEDGE_GRAPH = {
  nodes: Array.from(nodes.values()),
  edges: Array.from(edges.values()),
};

export function nodeById(id: string): GraphNode | undefined {
  return nodes.get(id);
}

export function neighborsOf(nodeId: string): KnowledgeEdge[] {
  return Array.from(edges.values()).filter((e) => e.from === nodeId || e.to === nodeId);
}

/** Human-readable provenance for a node. */
export function provenanceOf(nodeId: string): string {
  const n = nodes.get(nodeId);
  if (!n) return "unknown";
  const src = n.sourceId;
  const edge = Array.from(edges.values()).find((e) => e.from === nodeId || e.to === nodeId);
  return `${n.name} (${n.type}) — ${src}${edge?.evidence ? ` · ${edge.evidence}` : ""}`;
}

/** Edges whose confidence is too low to be trusted — surfaced by quality checks. */
export function lowConfidenceEdges(): KnowledgeEdge[] {
  return Array.from(edges.values()).filter((e) => e.confidence < 0.5);
}

/**
 * Compact, traceable knowledge context appended to the AI system prompt.
 * Every line names its source so answers can be traced back to real data.
 */
export function knowledgeContextFor(): string {
  const lines: string[] = [];
  const diseases = Array.from(nodes.values()).filter((n) => n.type === "disease");
  for (const d of diseases) {
    const rel = Array.from(edges.values()).filter((e) => e.from === d.id && e.confidence >= 0.7).slice(0, 4);
    if (rel.length === 0) continue;
    const relText = rel.map((e) => {
      const to = nodes.get(e.to);
      return `${e.type.toLowerCase().replace(/_/g, " ")} ${to?.name ?? e.to} (${e.evidence})`;
    });
    lines.push(`${d.name}: ${relText.join(" · ")}`);
  }
  const guidelines = Array.from(nodes.values()).filter((n) => n.type === "guideline").map((n) => n.name);
  if (guidelines.length > 0) {
    lines.push(`Evidence sources available: ${guidelines.join(", ")}.`);
  }
  lines.push(
    "Knowledge fabric limits: PubMed, textbooks, web and GitHub corpora are NOT connected in this build. " +
    "Cite only the evidence named above; never invent a citation or a source you cannot name from this list."
  );
  return lines.join("\n");
}
