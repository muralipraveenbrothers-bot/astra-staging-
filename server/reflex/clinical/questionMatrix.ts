import { decideBatch, type FabricDecisionResult } from "../decisionFabric";
import { register } from "../schema/registry";
import type { DecisionSchema } from "../schema/types";

const createdAt = "2026-09-29T00:00:00.000Z";
const thresholds = { auto: 0.99, assist: 0.65, minMargin: 0.15 };
const owner = "clinical-reflex-mesh";

const docUnknown = { key: "unknown", label: "Unknown", description: "available data is insufficient" };
const humanReview = { key: "human_review", label: "Human review", description: "requires direct clinician review" };
const yesNoUnknown = [
  { key: "yes", label: "Yes", description: "the item appears present" },
  { key: "no", label: "No", description: "the item appears absent" },
  docUnknown,
  humanReview,
];

function choice(id: string, question: string, options: DecisionSchema["options"]): DecisionSchema {
  return { id, version: 1, kind: "choice", question, options, abstainKeys: ["unknown", "human_review"], domain: "clinical", dataClass: "HIGH_RISK_CLINICAL_LOCAL_ONLY", defaultMode: "SHADOW", thresholds, languages: ["en", "te", "hi"], owner, createdAt };
}

function score(id: string, question: string): DecisionSchema {
  return { id, version: 1, kind: "score", question, levels: ["1", "2", "3", "4", "5"], abstainKeys: ["unknown", "human_review"], domain: "clinical", dataClass: "HIGH_RISK_CLINICAL_LOCAL_ONLY", defaultMode: "SHADOW", thresholds, languages: ["en", "te", "hi"], owner, createdAt };
}

const documented = [
  { key: "documented", label: "Documented", description: "clearly documented in state" },
  { key: "not_documented", label: "Not documented", description: "not documented in state" },
  docUnknown,
  humanReview,
];

const systems = ["cardio", "resp", "neuro", "gi", "gu_renal", "endocrine_metabolic", "id_sepsis", "heme", "msk", "derm", "psych", "obstetric", "none", "unknown"].map((key) => ({
  key,
  label: key.replace(/_/g, " "),
  description: key === "unknown" ? "available data is insufficient" : key === "none" ? "no organ expansion needed" : `consider expanding ${key.replace(/_/g, " ")} review`,
}));

const missingOptions = [
  "pregnancy_status_missing", "medication_history_missing", "allergy_history_missing", "ecg_missing", "glucose_missing",
  "focused_exam_missing", "vital_trend_missing", "timeline_missing", "none", "unknown",
].map((key) => ({ key, label: key.replace(/_/g, " "), description: key === "unknown" ? "available data is insufficient" : key === "none" ? "no missing item identified" : `flag ${key.replace(/_/g, " ")}` }));

const treatmentResponse = ["as_expected", "partial", "not_as_expected", "not_applicable", "unknown"].map((key) => ({
  key,
  label: key.replace(/_/g, " "),
  description: key === "unknown" ? "available data is insufficient" : `response is ${key.replace(/_/g, " ")}`,
}));

const schemas: DecisionSchema[] = [
  choice("clinical.symptom.onset", "Is symptom onset documented?", documented),
  choice("clinical.symptom.duration", "Is symptom duration documented?", documented),
  choice("clinical.symptom.severity", "Is symptom severity documented?", documented),
  choice("clinical.symptom.character", "Is symptom character documented?", documented),
  choice("clinical.symptom.radiation", "Is symptom radiation documented?", documented),
  choice("clinical.symptom.aggravating_relieving", "Are aggravating or relieving factors documented?", documented),
  choice("clinical.symptom.associated", "Are associated symptoms documented?", documented),
  choice("clinical.symptom.timeline", "Is the symptom timeline documented?", documented),
  choice("clinical.system.expand", "Which organ system should the doctor expand first?", systems),
  score("clinical.must_not_miss.acs", "Should the doctor explicitly rule out ACS?"),
  score("clinical.must_not_miss.pe", "Should the doctor explicitly rule out PE?"),
  score("clinical.must_not_miss.aortic_dissection", "Should the doctor explicitly rule out aortic dissection?"),
  score("clinical.must_not_miss.sepsis", "Should the doctor explicitly rule out sepsis?"),
  score("clinical.must_not_miss.meningitis", "Should the doctor explicitly rule out meningitis?"),
  score("clinical.must_not_miss.stroke_tia", "Should the doctor explicitly rule out stroke or TIA?"),
  score("clinical.must_not_miss.ectopic_pregnancy", "Should the doctor explicitly rule out ectopic pregnancy?"),
  score("clinical.must_not_miss.dka", "Should the doctor explicitly rule out DKA?"),
  score("clinical.must_not_miss.gi_bleed", "Should the doctor explicitly rule out GI bleed?"),
  score("clinical.must_not_miss.surgical_abdomen", "Should the doctor explicitly rule out surgical abdomen?"),
  choice("clinical.missing.history", "Which history item is missing?", missingOptions),
  choice("clinical.missing.exam", "Which focused exam or bedside test is missing?", missingOptions),
  choice("clinical.missing.tests", "Which test information is missing?", missingOptions),
  choice("clinical.explain_all_findings", "Do current hypotheses explain all findings?", [
    { key: "yes", label: "Yes", description: "all findings appear explained" },
    { key: "partially", label: "Partially", description: "some findings remain unexplained" },
    { key: "no", label: "No", description: "findings are not explained" },
    docUnknown,
    humanReview,
  ]),
  choice("clinical.contradiction.present", "Is there a contradiction between history, vitals and results?", yesNoUnknown),
  score("clinical.escalate.now", "Should a senior doctor be alerted now?"),
  choice("clinical.blind_spot.two_conditions", "Could two conditions be present rather than one?", yesNoUnknown),
  choice("clinical.blind_spot.drug_iatrogenic", "Could this be drug-induced or iatrogenic?", yesNoUnknown),
  choice("clinical.blind_spot.atypical", "Could this be an atypical presentation for age, sex or comorbidity?", yesNoUnknown),
  choice("clinical.blind_spot.artefact", "Could an abnormal value be measurement, sampling or artefact?", yesNoUnknown),
  choice("clinical.blind_spot.dangerous_low_likelihood", "Is a dangerous low-likelihood alternative not yet addressed?", yesNoUnknown),
  choice("clinical.temporal.new_med_or_procedure", "Did a new medication or procedure precede the new symptom?", yesNoUnknown),
  choice("clinical.temporal.time_course_consistent", "Is the time course consistent with the working explanation?", yesNoUnknown),
  choice("clinical.treatment.response", "Is response to current treatment as expected?", treatmentResponse),
];

export const CLINICAL_QUESTION_SCHEMAS = schemas;
export const CLINICAL_SCHEMA_IDS = schemas.map((schema) => schema.id);

export function registerClinicalQuestionMatrix(): void {
  for (const schema of schemas) register(schema);
}

registerClinicalQuestionMatrix();

export async function runClinicalQuestionBatch(stateText: string): Promise<FabricDecisionResult[]> {
  return decideBatch({ schemaIds: CLINICAL_SCHEMA_IDS, input: stateText, timeoutMs: 1800 });
}
