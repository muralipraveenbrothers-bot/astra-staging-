// ASTRA AI — Declarative Internal Worker Modes v1.0

export type ModelClass = "fast" | "balanced" | "strong" | "low_latency";

export interface AstraModeDefinition {
  modeId: string;
  name: string;
  description: string;
  preferredModelClass: ModelClass;
  allowedSkills: string[];
  riskLimit: string;
  timeoutMs: number;
}

export const ASTRA_MODES: Record<string, AstraModeDefinition> = {
  ClinicalReasoning: {
    modeId: "ClinicalReasoning",
    name: "Clinical Reasoning & Differential Diagnosis",
    description: "Deep multi-system pathophysiological trajectory & differential diagnosis",
    preferredModelClass: "strong",
    allowedSkills: ["clinical.differential", "clinical.evidence", "clinical.risk_scores", "clinical.drug_safety"],
    riskLimit: "L3_CLINICAL_SIGN",
    timeoutMs: 60000,
  },
  PatientLookup: {
    modeId: "PatientLookup",
    name: "Patient Context & HIMS Search",
    description: "Fast deterministic lookup of demographics, bed census, and vitals",
    preferredModelClass: "fast",
    allowedSkills: ["patient.search", "patient.snapshot"],
    riskLimit: "L0_READ",
    timeoutMs: 5000,
  },
  WardOperations: {
    modeId: "WardOperations",
    name: "Ward & Bed Operations",
    description: "Ward census, bed status, and interdepartmental communications",
    preferredModelClass: "fast",
    allowedSkills: ["ward.bed_status", "communication.call", "task.assign"],
    riskLimit: "L1_OPERATIONAL",
    timeoutMs: 10000,
  },
  ClinicalDocumentation: {
    modeId: "ClinicalDocumentation",
    name: "OPD & Clinical Dictation Structuring",
    description: "Structure natural language speech/notes into signed clinical records",
    preferredModelClass: "balanced",
    allowedSkills: ["opd.create_note", "opd.finalize", "opd.print"],
    riskLimit: "L3_CLINICAL_SIGN",
    timeoutMs: 20000,
  },
  EvidenceResearch: {
    modeId: "EvidenceResearch",
    name: "Medical Literature & Evidence Synthesis",
    description: "Retrieval from PubMed, ClinicalTrials.gov, RxNav Tiers A–V",
    preferredModelClass: "strong",
    allowedSkills: ["pubmed.search", "evidence.rank"],
    riskLimit: "L0_READ",
    timeoutMs: 45000,
  },
  VoiceConversation: {
    modeId: "VoiceConversation",
    name: "Low-Latency Voice Conversation",
    description: "Real-time streaming speech interaction with barge-in support",
    preferredModelClass: "low_latency",
    allowedSkills: ["context.resolve", "command.route"],
    riskLimit: "L1_OPERATIONAL",
    timeoutMs: 8000,
  },
};

export class AstraModeRouter {
  /**
   * Intelligently select internal worker mode based on user prompt intent.
   * Doctor interacts with ONE ASTRA; backend routes internally.
   */
  static selectMode(promptText: string): AstraModeDefinition {
    const text = (promptText || "").toLowerCase();

    if (text.includes("bed") || text.includes("ward") || text.includes("call")) {
      return ASTRA_MODES.WardOperations;
    }
    if (text.includes("differential") || text.includes("diagnosis") || text.includes("wells") || text.includes("curb")) {
      return ASTRA_MODES.ClinicalReasoning;
    }
    if (text.includes("dictate") || text.includes("fever") || text.includes("history") || text.includes("finalize op")) {
      return ASTRA_MODES.ClinicalDocumentation;
    }
    if (text.includes("pubmed") || text.includes("trial") || text.includes("evidence")) {
      return ASTRA_MODES.EvidenceResearch;
    }

    return ASTRA_MODES.PatientLookup;
  }
}
