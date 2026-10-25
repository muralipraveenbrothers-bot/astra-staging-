/**
 * ASTRA AI — Intelligence Extensions: Intelligence Router
 * ============================================================================
 * Extends (does not replace) the existing Astra router in
 * server/ai/routingBridge.ts. Adds three-tier classification:
 *   LOW        -> astra-micro (MiniMind) — fast local operational brain
 *   MEDIUM     -> existing appropriate Astra model
 *   HIGH_CLINICAL -> existing Clinical Reasoning pathway (Hermes/LangGraph/RAG)
 *
 * Confidence-threshold aware: low confidence DOES NOT guess — it escalates.
 */
import { firstEnv } from "../_internal";
import { HIGH_CLINICAL_ESCALATION_TOPICS } from "../minimind/systemPrompt";

export type IntelligenceTier = "LOW" | "MEDIUM" | "HIGH_CLINICAL";

export interface IntelligenceRoute {
  tier: IntelligenceTier;
  reason: string;
  confidence: number; // 0..1
  /** Model/backend hint for the chosen tier. */
  target: "astra-micro" | "existing-appropriate" | "clinical-reasoning-pathway";
  /** Skills to invoke if a scientific query is detected. */
  scientificSkills: string[];
  /** True when the request must escalate regardless of tier. */
  escalate: boolean;
}

/** Operational commands that are safe for the lightweight local brain. */
const LOW_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b(who is|which patient|name of|bed\s+\d+\s*patient)\b/i, reason: "patient lookup" },
  { pattern: /\b(open|show|display|navigate to)\s+(pharmacy|lab|radiology|ward|reception|billing|opd|icu|ot|usg|discharge|cmrf)/i, reason: "navigation/open command" },
  { pattern: /\b(send|route|forward)\s+(this\s+)?(order|request|message|notification)\s+to\s+(pharmacy|lab|ward|reception|radiology|billing)/i, reason: "operational routing" },
  { pattern: /\b(tell|ask|notify)\s+(the\s+)?(pharmacy|lab|ward|reception)\b/i, reason: "department notification" },
  { pattern: /\b(extract|parse|normalize)\b/i, reason: "structured extraction" },
  { pattern: /\b(what is|show)\s+(bed|mrn|ip\s*number|op\s*number)\b/i, reason: "reference extraction" },
  { pattern: /\b(summarize|summarise)\s+(short|brief)\b/i, reason: "short summarization" },
];

/** Scientific/research queries needing the skills layer. */
const SCIENTIFIC_PATTERNS: Array<{ pattern: RegExp; skills: string[] }> = [
  { pattern: /\b(latest|recent|new)\s+(evidence|studies|research|papers|trials|literature)\b/i, skills: ["paper-lookup"] },
  { pattern: /\b(find|search|get)\s+(papers|studies|articles|publications|literature)\b/i, skills: ["paper-lookup"] },
  { pattern: /\b(clinical trials?|trial for|studies on)\b/i, skills: ["database-lookup"] },
  { pattern: /\b(drug|medication|pharma)\s+(info|database|interaction|properties)\b/i, skills: ["database-lookup"] },
  { pattern: /\b(evidence brief|literature synthesis|write.*review|cite sources)\b/i, skills: ["scientific-writing"] },
  { pattern: /\b(clinical report|discharge summary|case report)\b/i, skills: ["clinical-reports"] },
  { pattern: /\b(treatment plan|format.*plan)\b/i, skills: ["treatment-plans"] },
  { pattern: /\b(dicom|medical image|ct|mri|x-ray)\b/i, skills: ["pydicom"] },
  { pattern: /\b(genomics|dna|sequence|biopython|single cell|scanpy)\b/i, skills: ["biopython", "scanpy"] },
  { pattern: /\b(molecule|rdkit|drug analysis|smiles|chemical)\b/i, skills: ["rdkit"] },
  { pattern: /\b(p-value|regression|statistical|significance|power analysis)\b/i, skills: ["stats"] },
];

export function routeIntelligence(query: string, explicitTier?: IntelligenceTier): IntelligenceRoute {
  const q = query.toLowerCase().trim();

  // 1. High-risk clinical reasoning — MUST escalate (Step 4 rule).
  const clinicalHit = HIGH_CLINICAL_ESCALATION_TOPICS.find((t) => q.includes(t));
  if (clinicalHit) {
    return {
      tier: "HIGH_CLINICAL", reason: `high-risk clinical topic: ${clinicalHit}`,
      confidence: 0.95, target: "clinical-reasoning-pathway",
      scientificSkills: [], escalate: true,
    };
  }

  // 2. Scientific/research queries — skills layer (can be LOW or MEDIUM risk).
  for (const sp of SCIENTIFIC_PATTERNS) {
    if (sp.pattern.test(q)) {
      return {
        tier: "MEDIUM", reason: "scientific/research query",
        confidence: 0.8, target: "existing-appropriate",
        scientificSkills: sp.skills, escalate: false,
      };
    }
  }

  // 3. Explicit override.
  if (explicitTier) {
    return {
      tier: explicitTier, reason: "explicit override",
      confidence: 1.0,
      target: explicitTier === "LOW" ? "astra-micro" : explicitTier === "MEDIUM" ? "existing-appropriate" : "clinical-reasoning-pathway",
      scientificSkills: [], escalate: explicitTier === "HIGH_CLINICAL",
    };
  }

  // 4. Low-confidence guard: if nothing matches confidently, escalate.
  // (Don't guess — send to the stronger existing route.)

  // 5. Low-risk operational patterns → astra-micro.
  // Classification is independent of whether astra-micro is currently enabled;
  // availability is a runtime concern handled by the adapter's fail-safe.
  for (const lp of LOW_PATTERNS) {
    if (lp.pattern.test(q)) {
      return {
        tier: "LOW", reason: `operational: ${lp.reason}`,
        confidence: 0.7, target: "astra-micro",
        scientificSkills: [], escalate: false,
      };
    }
  }

  // Default: medium → existing appropriate Astra model.
  return {
    tier: "MEDIUM", reason: "default — no strong low/confident match",
    confidence: 0.5, target: "existing-appropriate",
    scientificSkills: [], escalate: false,
  };
}