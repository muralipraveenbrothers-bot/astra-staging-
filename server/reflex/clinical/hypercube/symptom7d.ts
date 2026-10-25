import type { AxisId, ClinicalVector } from "./types";

export interface SymptomQuestion {
  axis: AxisId;
  question: string;
  schemaId?: string;
  redFlag?: boolean;
}

const QUESTIONS: Record<"D4" | "D6" | "D7", SymptomQuestion> = {
  D4: { axis: "D4", question: "What was the patient doing just before it started, and what brings it on or eases it?", schemaId: "clinical.symptom.aggravating_relieving" },
  D6: { axis: "D6", question: "Does the pain travel anywhere, and along which path? Location alone does not identify a spinal segment.", schemaId: "clinical.symptom.radiation" },
  D7: { axis: "D7", question: "Are there associated symptoms, including bladder or bowel change, saddle numbness, or leg weakness?", schemaId: "clinical.symptom.associated", redFlag: true },
};

/** Targeted history questions for missing axes. Never assigns a spinal level from location. */
export function symptomQuestions(text: string, documented: AxisId[] = []): SymptomQuestion[] {
  const lower = text.toLowerCase();
  const have = new Set(documented);
  if (/radiat|travels|into the/.test(lower)) have.add("D6");
  if (/while|after lifting|bending|trigger|worse when|eased/.test(lower)) have.add("D4");
  if (/bladder|bowel|numbness|weakness|fever|vomit/.test(lower)) have.add("D7");
  const questions: SymptomQuestion[] = [];
  if (/back pain|low back/.test(lower) || text.trim()) {
    for (const axis of ["D4", "D6", "D7"] as const) {
      if (!have.has(axis)) questions.push(QUESTIONS[axis]);
    }
  }
  return questions.filter((item) => !/spinal level|L[1-5]\/|segment is/.test(item.question));
}

export function questionsForVector(vector: ClinicalVector, text: string): SymptomQuestion[] {
  const documented = (Object.keys(vector.axes) as AxisId[]).filter((axis) => vector.axes[axis].status === "documented" || !!vector.axes[axis].confirmedBy);
  return symptomQuestions(text, documented);
}
