/**
 * ASTRA AI — Intelligence Extensions: Scientific Skills Types
 * ============================================================================
 * K-Dense Scientific Agent Skills integration (github.com/K-Dense-AI/scientific-agent-skills).
 *
 * Design rules from the integration spec:
 *   - All 165 skills are NOT loaded into every prompt (token/RAM/safety).
 *   - Only lightweight metadata is indexed; skill bodies are LAZY-LOADED.
 *   - A curated core is enabled first; everything else is opt-in per review.
 *   - Hermes remains planner, LangGraph remains orchestrator.
 *   - Skills are PROCEDURAL CAPABILITIES used by existing systems.
 */
export type ScientificSkillRisk = "research" | "clinical_draft" | "write_back";

export interface ScientificSkillMeta {
  name: string;
  description: string;
  category: "literature" | "database" | "analysis" | "writing" | "imaging" | "genomics" | "pharmacology";
  triggers: string[];
  requiredPackages: string[];
  networkDomains: string[];
  riskClass: ScientificSkillRisk;
  enabled: boolean;
  sourcePath: string;
  version: string;
}

export interface ScientificQuery {
  query: string;
  deidentifiedQuery: string;
  allowedSkills: string[];
  privacyMode: boolean;
  provenanceRequired: boolean;
  requestId: string;
}

export interface ScientificSkillResult {
  ok: boolean;
  skill: string;
  data?: any;
  error?: string;
  sources: Array<{ name: string; url?: string; pmid?: string; doi?: string; accessedAt: string }>;
  provenance: {
    requestId: string;
    timestamp: string;
    databasesAccessed: string[];
    retrievalQueries: string[];
    modelUsed: string;
    doctorReviewRequired: boolean;
  };
}