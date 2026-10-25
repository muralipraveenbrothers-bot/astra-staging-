/**
 * ASTRA AI — CLINICAL SKILL REGISTRY (17.3)
 * ============================================================================
 * Repository for versioned, auditable, clinician-approved clinical rules & skills.
 * All skill changes are auditable and rollbackable.
 */

export interface ClinicalSkill {
  skillId: string;
  name: string;
  purpose: string;
  version: string;
  authorizingClinician: string;
  clinicalRationale: string;
  evidenceReference: string;
  agentTypes: string[];
  knowledgeNeeded: string[];
  toolsNeeded: string[];
  instructions: string;
  examples: { input: string; expectedAction: string }[];
  evaluationScore: number;
  status: "ACTIVE" | "PENDING_APPROVAL" | "ROLLED_BACK";
  rollbackVersion?: string;
  createdAt: string;
  updatedAt: string;
}

class SkillRegistryService {
  private skills: Map<string, ClinicalSkill> = new Map();

  constructor() {
    this.seedDefaultSkills();
  }

  private seedDefaultSkills() {
    const defaultSkills: ClinicalSkill[] = [
      {
        skillId: "SKL-DENGUE-TRIAGE-2026",
        name: "Dengue Warning Signs & Fluid Triage Protocol",
        purpose: "Rapid assessment of capillary leak, hematocrit elevation, and platelet drop in acute dengue patients.",
        version: "1.2.0",
        authorizingClinician: "Dr. Murali Praveen, M.D. (Internal Medicine)",
        clinicalRationale: "Prevent dengue shock syndrome (DSS) through timely warning sign recognition and controlled isotonic fluid resuscitation.",
        evidenceReference: "WHO Comprehensive Guidelines for Prevention and Control of Dengue (official WHO/NVBDCP document; not PubMed-indexed — no PMID claimed)",
        agentTypes: ["clinical_reasoning_agent", "patient_context_agent"],
        knowledgeNeeded: ["guidelines_who_cdc_nice", "hospital_sop_protocols"],
        toolsNeeded: ["getPatientTimeline", "getLabResult", "createLabOrder"],
        instructions: "If hematocrit increases by >20% concurrent with rapid platelet decline below 50,000/uL, alert clinician immediately for fluid escalation and reserve ICU bed.",
        examples: [
          {
            input: "Rajesh has dengue with platelet 42k and abdominal pain",
            expectedAction: "Flag severe warning sign (abdominal pain + thrombocytopenia) and recommend baseline hematocrit + IV fluid protocol."
          }
        ],
        evaluationScore: 98.5,
        status: "ACTIVE",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        skillId: "SKL-CURB65-CAP",
        name: "CURB-65 Severe Pneumonia Risk Calibration",
        purpose: "Calibrate mortality risk and ICU admission requirement for community-acquired pneumonia.",
        version: "1.0.1",
        authorizingClinician: "Dr. Murali Praveen, M.D. (Critical Care)",
        clinicalRationale: "Stratify pneumonia severity objectively to prevent delayed ICU admission.",
        evidenceReference: "British Thoracic Society Guidelines for CAP (PMID: 20498114)",
        agentTypes: ["clinical_reasoning_agent"],
        knowledgeNeeded: ["guidelines_who_cdc_nice"],
        toolsNeeded: ["getVitals", "getLabResult"],
        instructions: "Score 1 point each for Confusion, Urea > 7 mmol/L, RR >= 30, BP < 90/60, Age >= 65. Score >= 3 requires prompt ICU consult.",
        examples: [
          {
            input: "Elderly patient 72yo with pneumonia, RR 32, BP 85/55",
            expectedAction: "Calculate CURB-65 >= 3 (Age, RR, BP) -> recommend urgent ICU admission and blood gas."
          }
        ],
        evaluationScore: 99.0,
        status: "ACTIVE",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    for (const skill of defaultSkills) {
      this.skills.set(skill.skillId, skill);
    }
  }

  public register(skill: ClinicalSkill): void {
    this.skills.set(skill.skillId, skill);
  }

  public get(skillId: string): ClinicalSkill | undefined {
    return this.skills.get(skillId);
  }

  public list(): ClinicalSkill[] {
    return Array.from(this.skills.values());
  }

  public listActive(): ClinicalSkill[] {
    return this.list().filter(s => s.status === "ACTIVE");
  }

  public rollback(skillId: string): boolean {
    const skill = this.skills.get(skillId);
    if (skill && skill.rollbackVersion) {
      skill.status = "ROLLED_BACK";
      skill.updatedAt = new Date().toISOString();
      return true;
    }
    return false;
  }
}

export const SkillRegistry = new SkillRegistryService();
