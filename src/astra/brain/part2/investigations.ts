/**
 * Investigation intelligence. A result is read for what it contains.
 * It is not summarized as a single reassuring word.
 */
import type { LabFact, VerifiedFacts } from "./facts";
import { isFractureRisk } from "./mechanism";

export interface InvestigationRead {
  alreadyExist: string[];
  hiddenInformation: string[];
  trends: string[];
  unanswered: string[];
  wouldChangeManagement: string;
  newTestRecommended: false | string;
}

function indices(lab: LabFact): string[] {
  const blob = `${lab.name} ${lab.value ?? ""}`;
  const found: string[] = [];
  if (/h[ae]moglobin|\bhb\b/i.test(blob)) found.push("hemoglobin is mentioned");
  if (/\bwbc\b|white cell|leukocyt/i.test(blob)) found.push("white-cell count is mentioned");
  if (/platelet/i.test(blob)) found.push("platelet count is mentioned");
  if (/creatinine/i.test(blob)) found.push("creatinine is mentioned");
  if (/\bck\b|cpk|creatine kinase/i.test(blob)) found.push("CK/CPK is mentioned");
  if (/potassium|\bk\b/i.test(blob)) found.push("potassium is mentioned");
  return found;
}

export function readInvestigations(facts: VerifiedFacts, text: string): InvestigationRead {
  const labs = facts.labs ?? [];
  const named = [...labs.map((lab) => lab.name), ...(facts.investigations ?? [])].filter(Boolean);
  const alreadyExist = named.length ? named : ["none recorded"];
  const hidden = labs.flatMap(indices);
  const cbc = labs.find((lab) => /cbc|complete blood|hemogram/i.test(lab.name));
  if (cbc && indices(cbc).length === 0) {
    hidden.push("CBC is on the chart. Hemoglobin, white cells, and platelets were not stated, so those indices stay unknown.");
  }
  const hiddenInformation = hidden.length ? hidden : ["No measured index was supplied."];
  const byName = new Map<string, LabFact[]>();
  for (const lab of labs) {
    const key = lab.name.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), lab]);
  }
  const trends = [...byName.entries()]
    .filter(([, rows]) => rows.length > 1 && rows.every((row) => row.value))
    .map(([name, rows]) => `${name}: ${rows.map((row) => row.value).join(" → ")}`);
  const unanswered = [
    cbc ? "The CBC does not identify the cause of pain or prove a compartment is safe." : "The question the existing tests cannot answer is still open.",
  ];
  if (isFractureRisk(text)) {
    unanswered.push("Early compartment syndrome is not excluded by CK, potassium, creatinine, urinalysis, or myoglobin.");
  }
  const wouldChangeManagement = named.length
    ? "A new test is useful only when its result would change the doctor's next action. Repeating a panel that already answers the question does not."
    : "No existing test is on the chart, so the first useful test is the one that answers the doctor's current question.";
  return {
    alreadyExist,
    hiddenInformation,
    trends: trends.length ? trends : ["No paired results, so no trend is claimed."],
    unanswered,
    wouldChangeManagement,
    newTestRecommended: false,
  };
}
