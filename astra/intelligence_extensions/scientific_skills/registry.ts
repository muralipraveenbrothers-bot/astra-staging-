/**
 * ASTRA AI — Intelligence Extensions: Scientific Skill Registry
 * ============================================================================
 * Indexes only lightweight metadata; skill bodies are lazy-loaded on demand.
 * Conservative allowlist enabled first; everything else is opt-in per review.
 * Repo: github.com/K-Dense-AI/scientific-agent-skills
 */
import { firstEnv } from "../_internal";
import { ScientificSkillMeta } from "./types";

function skill(p: Omit<ScientificSkillMeta, "enabled"> & { envKey: string; def: boolean }): ScientificSkillMeta {
  return { ...p, enabled: firstEnv(p.envKey, String(p.def)) === "true" };
}

const REGISTRY: ScientificSkillMeta[] = [
  skill({ name: "paper-lookup", description: "Search scholarly literature across PubMed, Crossref, Semantic Scholar, OpenAlex.", category: "literature", triggers: ["latest evidence", "find papers", "pubmed", "clinical evidence", "journal", "studies about", "research on"], requiredPackages: [], networkDomains: ["api.pubmed.ncbi.nlm.nih.gov", "api.crossref.org", "api.semanticscholar.org", "api.openalex.org"], riskClass: "research", sourcePath: "scientific_skills/paper-lookup/SKILL.md", version: "1.0.0", envKey: "SCIENTIFIC_SKILL_PAPER_LOOKUP", def: true }),
  skill({ name: "database-lookup", description: "Query scientific databases: ClinicalTrials.gov, ChEMBL, PubChem, UniProt, COSMIC, Open Targets, Reactome, KEGG, FDA.", category: "database", triggers: ["clinical trials", "drug database", "chembl", "pubchem", "uniprot", "fda", "drug info", "trial for"], requiredPackages: [], networkDomains: ["clinicaltrials.gov", "www.ebi.ac.uk", "pubchem.ncbi.nlm.nih.gov"], riskClass: "research", sourcePath: "scientific_skills/database-lookup/SKILL.md", version: "1.0.0", envKey: "SCIENTIFIC_SKILL_DATABASE_LOOKUP", def: true }),
  skill({ name: "scientific-writing", description: "Citation-traceable scientific text: evidence briefs, literature syntheses, structured reports.", category: "writing", triggers: ["write a review", "evidence brief", "literature synthesis", "summarize evidence", "cite sources"], requiredPackages: [], networkDomains: [], riskClass: "research", sourcePath: "scientific_skills/scientific-writing/SKILL.md", version: "1.0.0", envKey: "SCIENTIFIC_SKILL_SCIENTIFIC_WRITING", def: true }),
  skill({ name: "clinical-reports", description: "Draft clinical report structure from verified source-fact manifests. Marked draft requiring clinician review.", category: "writing", triggers: ["clinical report", "discharge summary", "case report", "draft report"], requiredPackages: [], networkDomains: [], riskClass: "clinical_draft", sourcePath: "scientific_skills/clinical-reports/SKILL.md", version: "1.0.0", envKey: "SCIENTIFIC_SKILL_CLINICAL_REPORTS", def: true }),
  skill({ name: "treatment-plans", description: "Format a clinician-diagnosed treatment plan into a structured document. Does NOT make clinical decisions.", category: "writing", triggers: ["treatment plan", "format plan", "structure the plan"], requiredPackages: [], networkDomains: [], riskClass: "clinical_draft", sourcePath: "scientific_skills/treatment-plans/SKILL.md", version: "1.0.0", envKey: "SCIENTIFIC_SKILL_TREATMENT_PLANS", def: true }),
  skill({ name: "pydicom", description: "DICOM medical imaging research workflows.", category: "imaging", triggers: ["dicom", "medical image", "ct scan", "mri", "x-ray"], requiredPackages: ["pydicom"], networkDomains: [], riskClass: "research", sourcePath: "scientific_skills/pydicom/SKILL.md", version: "1.0.0", envKey: "SCIENTIFIC_SKILL_PYDICOM", def: false }),
  skill({ name: "biopython", description: "Bioinformatics and genomics research workflows.", category: "genomics", triggers: ["genomics", "dna", "sequence", "biopython"], requiredPackages: ["biopython"], networkDomains: [], riskClass: "research", sourcePath: "scientific_skills/biopython/SKILL.md", version: "1.0.0", envKey: "SCIENTIFIC_SKILL_BIOPYTHON", def: false }),
  skill({ name: "rdkit", description: "Molecule and drug analysis workflows.", category: "pharmacology", triggers: ["molecule", "drug analysis", "rdkit", "smiles"], requiredPackages: ["rdkit"], networkDomains: [], riskClass: "research", sourcePath: "scientific_skills/rdkit/SKILL.md", version: "1.0.0", envKey: "SCIENTIFIC_SKILL_RDKIT", def: false }),
];

export function listSkills(): ScientificSkillMeta[] { return REGISTRY; }
export function listEnabledSkills(): ScientificSkillMeta[] { return REGISTRY.filter((s) => s.enabled); }

export function discoverSkills(query: string, limit = 3): ScientificSkillMeta[] {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return listEnabledSkills()
    .map((s) => ({
      s,
      score: s.triggers.reduce((acc, t) => {
        const tw = t.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
        // Match if every word of the trigger appears in the query (order-independent).
        return acc + (tw.length && tw.every((w) => words.includes(w)) ? tw.length : 0);
      }, 0),
    }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.s);
}