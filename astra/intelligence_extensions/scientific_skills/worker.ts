/**
 * ASTRA AI — Intelligence Extensions: ScientificSkillsWorker
 * ============================================================================
 * Internal subordinate worker of the existing Medical Evidence / Research
 * architecture. NOT a new top-level autonomous agent.
 *
 * Responsibilities: skill discovery, lazy skill loading, dependency check,
 * tool execution, result normalization, provenance capture, error reporting.
 *
 * It must NOT diagnose, prescribe, alter billing, modify charts, or override
 * doctor decisions. Scientific skills RETRIEVE and STRUCTURE evidence; the
 * existing Astra clinical agents INTERPRET evidence.
 */
import { firstEnv } from "../_internal";
import { discoverSkills, listEnabledSkills } from "./registry";
import { ScientificQuery, ScientificSkillResult, ScientificSkillMeta } from "./types";

export interface WorkerRunOptions {
  query: string;
  deidentifiedQuery: string;
  allowedSkills?: string[];
  privacyMode?: boolean;
  provenanceRequired?: boolean;
  requestId?: string;
}

export class ScientificSkillsWorker {
  private sandboxEnabled: boolean;
  private phiGuardEnabled: boolean;

  constructor() {
    this.sandboxEnabled = firstEnv("ASTRA_SCIENTIFIC_SANDBOX", "true") === "true";
    this.phiGuardEnabled = firstEnv("ASTRA_PHI_GUARD", "true") === "true";
  }

  /** Discover relevant enabled skills for a query (lazy, metadata-only). */
  discover(query: string, limit = 3): ScientificSkillMeta[] {
    return discoverSkills(query, limit);
  }

  get enabledSkills(): ScientificSkillMeta[] {
    return listEnabledSkills();
  }

  /**
   * Execute a scientific query against the curated skill set.
   * Real K-Dense skill execution would load SKILL.md + run tools; this is the
   * integration seam. Returns structured evidence + provenance.
   */
  async run(opts: WorkerRunOptions): Promise<ScientificSkillResult> {
    const requestId = opts.requestId || `sci-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const query = opts.privacyMode !== false ? opts.deidentifiedQuery : opts.query;
    const skills = opts.allowedSkills?.length
      ? this.enabledSkills.filter((s) => opts.allowedSkills!.includes(s.name))
      : this.discover(query);

    if (skills.length === 0) {
      return this.result(requestId, "", false, undefined, "No enabled scientific skill matched the query", query, []);
    }

    // Select the highest-scoring skill.
    const skill = skills[0];
    const databases = [...skill.networkDomains];

    // Integration seam: a real implementation would lazy-load the skill body
    // from skill.sourcePath, verify dependencies, then execute inside the
    // sandbox. Here we return the structured plan + provenance so the existing
    // Medical Evidence Agent can interpret it.
    const data = {
      skill: skill.name,
      category: skill.category,
      riskClass: skill.riskClass,
      query,
      wouldContact: skill.networkDomains,
      requiredPackages: skill.requiredPackages,
      sandboxed: this.sandboxEnabled,
      note: "ScientificSkillsWorker prepared the evidence-retrieval plan. Wire the K-Dense skill body loader here.",
    };

    return this.result(requestId, skill.name, true, data, undefined, query, databases);
  }

  private result(
    requestId: string, skill: string, ok: boolean, data: any, error: string | undefined,
    query: string, databases: string[],
  ): ScientificSkillResult {
    return {
      ok, skill, data, error,
      sources: databases.map((d) => ({ name: d, accessedAt: new Date().toISOString() })),
      provenance: {
        requestId, timestamp: new Date().toISOString(),
        databasesAccessed: databases,
        retrievalQueries: [query],
        modelUsed: "scientific-skills-worker",
        doctorReviewRequired: true,
      },
    };
  }
}

let _instance: ScientificSkillsWorker | null = null;
export function getScientificSkillsWorker(): ScientificSkillsWorker {
  if (!_instance) _instance = new ScientificSkillsWorker();
  return _instance;
}