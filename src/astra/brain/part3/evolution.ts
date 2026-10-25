/**
 * Hermes evolution room. A working skill version stays active until a draft
 * passes evaluation. One past case never becomes a clinical rule.
 */

export type SkillShelf =
  | "current"
  | "draft"
  | "suggested"
  | "recently-changed"
  | "under-evaluation"
  | "approved"
  | "deprecated"
  | "failed";

export type SkillDomain = "clinical" | "nonclinical";

export interface SkillVersion {
  id: string;
  family: string;
  version: number;
  status: SkillShelf;
  domain: SkillDomain;
  body: string;
  active: boolean;
  changeReason: string;
}

export const PIPELINE = [
  "IDEA",
  "DRAFT",
  "STATIC_CHECK",
  "SANDBOX",
  "UNIT_TEST",
  "REPLAY_TEST",
  "ADVERSARIAL_TEST",
  "OLD_CASE_TEST",
  "SHADOW_MODE",
  "HUMAN_REVIEW",
  "CANARY_RELEASE",
  "PRODUCTION",
  "CONTINUOUS_MONITORING",
] as const;

export type PipelineStage = (typeof PIPELINE)[number];

export interface EvalRecord {
  skillId: string;
  domain: SkillDomain;
  stage: PipelineStage;
  currentVersion: string;
  previousSafeVersion: string | null;
  diff: string;
  reason: string;
  tests: string[];
  clinicalReviewer: string | null;
  deploymentDate: string | null;
  blocked: string | null;
}

export const CLINICAL_GATED = [
  "clinical rules",
  "drug dosing logic",
  "diagnostic thresholds",
  "surgical critical steps",
  "clinical escalation",
] as const;

export const SELF_SERVE = [
  "tool selection",
  "navigation",
  "UI workflows",
  "developer procedures",
  "documentation formatting",
  "nonclinical automation",
] as const;

export function seedSkills(): SkillVersion[] {
  return [{
    id: "discharge-summary-v4",
    family: "discharge-summary",
    version: 4,
    status: "current",
    domain: "clinical",
    body: "Active discharge summary format.",
    active: true,
    changeReason: "Current production version.",
  }];
}

export function proposeRevision(skills: SkillVersion[], family: string, body: string, domain: SkillDomain, reason: string): { skills: SkillVersion[]; draft: SkillVersion } {
  const current = skills.find((skill) => skill.family === family && skill.active);
  const version = (current?.version ?? 0) + 1;
  const draft: SkillVersion = {
    id: `${family}-v${version}-draft`,
    family,
    version,
    status: "draft",
    domain,
    body,
    active: false,
    changeReason: reason,
  };
  return { skills: [...skills, draft], draft };
}

export function shelf(skills: SkillVersion[]): Record<SkillShelf, SkillVersion[]> {
  const empty = {
    current: [], draft: [], suggested: [], "recently-changed": [], "under-evaluation": [], approved: [], deprecated: [], failed: [],
  } as Record<SkillShelf, SkillVersion[]>;
  for (const skill of skills) empty[skill.status].push(skill);
  return empty;
}

export function openEvaluation(skill: SkillVersion, previousSafeId: string | null): EvalRecord {
  return {
    skillId: skill.id,
    domain: skill.domain,
    stage: "IDEA",
    currentVersion: previousSafeId ?? skill.id,
    previousSafeVersion: previousSafeId,
    diff: skill.changeReason,
    reason: skill.changeReason,
    tests: [],
    clinicalReviewer: null,
    deploymentDate: null,
    blocked: null,
  };
}

const PRODUCTION_STAGES = new Set<PipelineStage>(["CANARY_RELEASE", "PRODUCTION", "CONTINUOUS_MONITORING"]);

export function advanceEvaluation(record: EvalRecord, reviewer?: string): EvalRecord {
  const index = PIPELINE.indexOf(record.stage);
  const next = PIPELINE[Math.min(index + 1, PIPELINE.length - 1)]!;
  if (record.domain === "clinical" && PRODUCTION_STAGES.has(next) && !reviewer?.trim()) {
    return { ...record, stage: "HUMAN_REVIEW", blocked: "Clinical evaluation and a named reviewer are required before production." };
  }
  return {
    ...record,
    stage: next,
    blocked: null,
    clinicalReviewer: reviewer?.trim() || record.clinicalReviewer,
    deploymentDate: next === "PRODUCTION" ? new Date().toISOString() : record.deploymentDate,
    tests: next === "UNIT_TEST" ? [...record.tests, "unit"] : record.tests,
  };
}

export function rollback(record: EvalRecord): EvalRecord {
  return { ...record, stage: "DRAFT", blocked: "Rolled back to the previous safe version.", deploymentDate: null };
}

export type PluginRisk = "R0" | "R1" | "R2" | "R3" | "R4";

export interface PluginProposal {
  plugin_id: string;
  name: string;
  version: string;
  owner: string;
  purpose: string;
  capabilities: string[];
  inputs: string[];
  outputs: string[];
  tools: string[];
  dependencies: string[];
  data_classes: string[];
  permissions: string[];
  risk_class: PluginRisk;
  human_approval: boolean;
  health_endpoint: string;
  fallback: string;
  tests: string[];
  eval_suite: string;
  created_by: string;
  reviewed_by: string | null;
  release_status: "proposal" | "production";
}

export function proposePlugin(existingProductionIds: string[], proposal: PluginProposal): { appliedToProduction: false; accepted: boolean; reason: string } {
  if (existingProductionIds.includes(proposal.plugin_id)) {
    return { appliedToProduction: false, accepted: false, reason: "A production plugin is not modified from the laboratory." };
  }
  if ((proposal.risk_class === "R3" || proposal.risk_class === "R4") && !proposal.human_approval) {
    return { appliedToProduction: false, accepted: false, reason: "R3 and R4 changes require human approval." };
  }
  return { appliedToProduction: false, accepted: true, reason: "Proposal recorded. Production plugins were not changed." };
}

export interface ReplayCase {
  id: string;
  oldOutput: string;
  newOutput: string;
  clinicianOutcome: string;
  missedRedFlag?: boolean;
  wrongRoute?: boolean;
  missingDiagnosis?: boolean;
  unnecessaryTest?: boolean;
  incorrectDrug?: boolean;
  documentError?: boolean;
  toolError?: boolean;
  humanCorrection?: boolean;
  latencyMs?: number;
  costNote?: string;
}

export interface ReplayReport {
  casesRun: number;
  archiveEmpty: boolean;
  applyPastTreatmentToNewPatient: false;
  measures: Record<string, number>;
}

export function replayCases(cases: ReplayCase[]): ReplayReport {
  const measures = {
    missedRedFlags: 0, wrongRoute: 0, missingDiagnosis: 0, unnecessaryTesting: 0,
    incorrectDrugSuggestion: 0, documentErrors: 0, toolErrors: 0, humanCorrectionFrequency: 0, latencyMs: 0, costNotes: 0,
  };
  for (const item of cases) {
    if (item.missedRedFlag) measures.missedRedFlags += 1;
    if (item.wrongRoute) measures.wrongRoute += 1;
    if (item.missingDiagnosis) measures.missingDiagnosis += 1;
    if (item.unnecessaryTest) measures.unnecessaryTesting += 1;
    if (item.incorrectDrug) measures.incorrectDrugSuggestion += 1;
    if (item.documentError) measures.documentErrors += 1;
    if (item.toolError) measures.toolErrors += 1;
    if (item.humanCorrection) measures.humanCorrectionFrequency += 1;
    measures.latencyMs += item.latencyMs ?? 0;
    if (item.costNote) measures.costNotes += 1;
  }
  return { casesRun: cases.length, archiveEmpty: cases.length === 0, applyPastTreatmentToNewPatient: false, measures };
}

export const LEARNING_CLASSES = [
  "FACT ERROR", "CLINICAL REASONING ERROR", "MISSING QUESTION", "MISSING TEST", "WRONG TOOL",
  "WORKFLOW ERROR", "DOCUMENT ERROR", "VOICE ERROR", "MODEL ERROR", "DOCTOR PREFERENCE", "HOSPITAL POLICY CHANGE",
] as const;

export type LearningClass = (typeof LEARNING_CLASSES)[number];

export function classifyLearning(note: string): { class: LearningClass; becomes: string; becomesClinicalRule: false } {
  const text = note.toLowerCase();
  const found: LearningClass = /dose|drug/.test(text) ? "CLINICAL REASONING ERROR"
    : /voice|spoke/.test(text) ? "VOICE ERROR"
    : /document|summary/.test(text) ? "DOCUMENT ERROR"
    : /prefer/.test(text) ? "DOCTOR PREFERENCE"
    : /policy/.test(text) ? "HOSPITAL POLICY CHANGE"
    : /tool/.test(text) ? "WRONG TOOL"
    : "MISSING QUESTION";
  const becomes = found === "DOCTOR PREFERENCE" ? "new template"
    : found === "HOSPITAL POLICY CHANGE" ? "new workflow rule"
    : found === "WRONG TOOL" ? "new eval"
    : "new eval";
  return { class: found, becomes, becomesClinicalRule: false };
}

export function mayAutoApply(change: string): boolean {
  const text = change.toLowerCase();
  if (CLINICAL_GATED.some((item) => text.includes(item))) return false;
  return SELF_SERVE.some((item) => text.includes(item.toLowerCase()));
}
