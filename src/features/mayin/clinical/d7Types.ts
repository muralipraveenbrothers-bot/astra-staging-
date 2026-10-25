/**
 * ASTRA 7D — STRUCTURED CLINICAL REASONING TYPES
 * ============================================================================
 * "1D → 7D" is a CLINICAL REASONING METAPHOR, not literal dimensional physics.
 * Every node of the LangGraph workflow produces these structured JSON states —
 * no hidden free text is passed between critical clinical nodes.
 *
 * Provenance buckets (§23 of Part H) are never merged silently:
 * PATIENT_FACT | EVIDENCE | AI_INFERENCE | DOCTOR_DECISION.
 */

export type ProvenanceBucket = "PATIENT_FACT" | "EVIDENCE" | "AI_INFERENCE" | "DOCTOR_DECISION";

export interface EvidenceSource {
  source: string;
  year?: number;
  guidelineOrStudy?: string;
  population?: string;
  intervention?: string;
  comparator?: string;
  outcome?: string;
  certainty?: string;
  applicability?: string;
}

export interface Provenanced<T> {
  value: T;
  provenance: ProvenanceBucket;
  evidence?: EvidenceSource;
}

/** Rule-in / rule-out classification (Part B). */
export type FindingClassification =
  | "RULE_IN_SUPPORT"
  | "RULE_OUT_SUPPORT"
  | "NON_DISCRIMINATING"
  | "UNKNOWN";

/** Qualitative likelihood when no validated model/LR exists (§5D). */
export type LikelihoodLabel =
  | "Higher likelihood"
  | "Intermediate likelihood"
  | "Lower likelihood"
  | "Cannot exclude";

/** Probability ONLY from validated sources — never LLM confidence. */
export interface ValidatedProbability {
  value: number; // 0..1
  basis:
    | "validated_clinical_prediction_model"
    | "bayesian_with_validated_likelihood_ratios"
    | "externally_calibrated_clinical_model";
  evidence: EvidenceSource;
}

export type EvidenceTier =
  | "CURRENT_STANDARD"
  | "EMERGING"
  | "INVESTIGATIONAL"
  | "PRECLINICAL"
  | "HYPOTHESIS";

export type RuleOutcome = "POSITIVE" | "NEGATIVE" | "INDETERMINATE";

// --------------------------------------------------------------------- D1-D7

export interface D1State {
  phenotype: {
    chiefComplaint?: string;
    age?: number;
    sex?: string;
    pregnancyStatus?: string;
    vitals?: Record<string, Provenanced<string | number>>;
    dominantSymptom?: string;
    severity?: string;
    comorbidities: string[];
    medicationsTaken: string[];
    allergies: string[];
    recentProceduresOrExposures: string[];
  };
  redFlags: string[];
}

export interface D2Candidate {
  symptom: string;
  supports: string[];
  arguesAgainst: string[];
  unknown: string[];
}

export interface D2State {
  associatedSymptoms: D2Candidate[];
  pertinentNegatives: string[];
  riskFactors: string[];
  exposures: string[];
}

export interface D3Observation {
  name: string;
  /** Which D3 bucket this observation belongs to. */
  domain?: "exam" | "lab" | "imaging" | "ecg" | "other";
  result?: string | number;
  units?: string;
  referenceRange?: string;
  timing?: string;
  quality?: string;
  /** Optional linkage to candidate diagnoses in D5 (deterministic tagging). */
  dxTags?: string[];
  /** Provided ONLY from approved evidence sources — never invented. */
  sensitivity?: number;
  specificity?: number;
  lrPlus?: number;
  lrMinus?: number;
  classification: FindingClassification;
  provenance: ProvenanceBucket;
}

export interface PostTestUpdate {
  preTestProbability: number;
  preTestOdds: number;
  likelihoodRatio: number;
  postTestOdds: number;
  postTestProbability: number;
}

export interface D3State {
  exam: D3Observation[];
  labs: D3Observation[];
  imaging: D3Observation[];
  ecg?: D3Observation[];
  likelihoodRatios: D3Observation[];
  bayesUpdates: PostTestUpdate[];
}

export type TimelinePhase =
  | "PAST"
  | "BASELINE"
  | "ONSET"
  | "EARLY_EVOLUTION"
  | "CURRENT_STATE"
  | "EXPECTED_NEXT_STATE";

export interface TimelineEvent {
  phase: TimelinePhase;
  at: string;
  kind: "symptom" | "vital" | "lab" | "imaging" | "medication" | "procedure" | "event";
  label: string;
  value?: string | number;
  provenance: ProvenanceBucket;
}

export interface D4State {
  timeline: TimelineEvent[];
  observedPast: TimelineEvent[];
  observedPresent: TimelineEvent[];
  predictedFuture: Array<{ description: string; uncertainty: string; evidence?: EvidenceSource }>;
  trajectory: "acute_worsening" | "acute_improving" | "static" | "chronic_fluctuating" | "unknown";
}

export interface D5Diagnosis {
  name: string;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  missingEvidence: string[];
  ruleInEvidence: string[];
  ruleOutEvidence: string[];
  dangerIfMissed: string;
  nextDiscriminatingTest?: string;
  /** Qualitative unless a validated probability source exists (§5D). */
  likelihood: LikelihoodLabel;
  validatedProbability?: ValidatedProbability;
}

export interface CounterfactualBranch {
  label: "NO_TREATMENT" | "STANDARD_TREATMENT" | "ALTERNATIVE_TREATMENT" | "ESCALATED_TREATMENT";
  expectedCourse: string;
  uncertainty: string;
  evidence?: EvidenceSource;
}

export interface D5State {
  differential: D5Diagnosis[];
  counterfactualBranches: CounterfactualBranch[];
}

export type MechanismLevel =
  | "molecular"
  | "cellular"
  | "tissue"
  | "organ"
  | "system"
  | "multi_system"
  | "whole_patient";

export type CompensationStatus = "COMPENSATED" | "COMPENSATION_FAILING" | "DECOMPENSATED";

export interface MechanismStep {
  level: MechanismLevel;
  statement: string;
  evidence?: EvidenceSource;
  provenance: ProvenanceBucket;
}

export interface CompensationStep {
  mechanism: string;
  active: boolean;
  helping?: boolean;
  cost?: string;
  failureSignal?: string;
  status: CompensationStatus;
}

export interface D6State {
  ladder: MechanismStep[];
  compensation: CompensationStep[];
}

export interface ManagementOption {
  label: string;
  description: string;
  benefit: string;
  risk: string;
  evidence?: EvidenceSource;
  tier: EvidenceTier;
  /** Irreversible actions always require authenticated clinician confirmation. */
  requiresClinicianConfirmation: boolean;
}

export interface D7State {
  managementOptions: ManagementOption[];
  bestSupportedCurrentOption?: string;
  alternatives: string[];
  whenToEscalate: string[];
  whenToRefer: string[];
  monitoring: string[];
  whatFailureLooksLike: string[];
  expectedRecovery: string[];
  prognosis: string[];
  uncertainties: string[];
}

/** Input packet assembled from EMR / evidence browser / rule engine. */
export interface D7CasePacket {
  patient: {
    id: string;
    encounterId?: string;
    age?: number;
    sex?: string;
    pregnancyStatus?: string;
    allergies?: string[];
    comorbidities?: string[];
    medications?: string[];
  };
  chiefComplaint?: string;
  dominantSymptom?: string;
  severity?: string;
  vitals?: Record<string, Provenanced<string | number>>;
  recentProceduresOrExposures?: string[];
  redFlags: string[];
  symptoms: Array<{ name: string; present: boolean; detail?: string }>;
  riskFactors: string[];
  exposures: string[];
  observations: D3Observation[];
  timeline: TimelineEvent[];
  differentialInput: Array<{
    name: string;
    supporting: string[];
    contradicting: string[];
    missing: string[];
    dangerIfMissed: string;
    nextDiscriminatingTest?: string;
    likelihood: LikelihoodLabel;
    validatedProbability?: ValidatedProbability;
  }>;
  mechanismInput: MechanismStep[];
  compensationInput: CompensationStep[];
  managementInput: ManagementOption[];
  counterfactualInput: CounterfactualBranch[];
  scores?: Array<{ name: string; score: number | null; outcome: RuleOutcome }>;
  /** Explicit trajectory judgement supplied by clinician/evidence tooling. */
  trajectoryInput?: { trajectory: D4State["trajectory"]; basis: string };
  /**
   * Bayesian updates ONLY when both a pre-test probability and a validated
   * likelihood ratio are supplied — nothing is ever computed from thin air.
   */
  bayesianInputs?: Array<{
    observationName: string;
    preTestProbability: number;
    likelihoodRatio: number;
    direction: "positive" | "negative";
    evidence?: EvidenceSource;
  }>;
  /** Explicit D7 planning inputs — derived fields are never invented. */
  monitoringInput?: string[];
  escalationInput?: string[];
  referInput?: string[];
  recoveryInput?: string[];
  prognosisInput?: string[];
  whatFailureInput?: string[];
  uncertaintyInput?: string[];
}

export interface D7Result {
  patient: D7CasePacket["patient"];
  D1: D1State;
  D2: D2State;
  D3: D3State;
  D4: D4State;
  D5: D5State;
  D6: D6State;
  D7: D7State;
  scores: Array<{ name: string; score: number | null; outcome: RuleOutcome }>;
  executedNodes: string[];
}

