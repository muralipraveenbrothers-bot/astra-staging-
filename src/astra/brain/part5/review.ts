/**
 * One doctor-facing review. Hermes coordinates the parts that already exist.
 * Missing facts stay unknown. Astra does not replace the clinician.
 */
import { explainCase } from "../part2/explain";
import type { VerifiedFacts } from "../part2/facts";
import { draftCaseDocument } from "../part2/follow";
import { costEstimate, expectedStay } from "../part3/value";
import { isMicroCommand } from "./voice";
import { differenceMatrix, memoryGate, mem0Status } from "./memory";

export const REVIEW_STEPS = [
  "identify patient",
  "collect existing information",
  "recognize missing information",
  "identify red flags",
  "interpret symptoms and signs",
  "extract investigation signals",
  "construct mechanism",
  "build differential",
  "rule in and rule out",
  "determine what additional information matters",
  "consider medical and surgical management",
  "consider comorbidities",
  "check medicines",
  "forecast complications",
  "consider resource availability",
  "estimate stay and cost when meaningful",
  "prepare documentation",
  "present a concise decision-support view",
] as const;

export function reviewPatient(text: string, facts: VerifiedFacts = {}) {
  if (isMicroCommand(text)) {
    return { kind: "micro" as const, hermesInvoked: false, steps: [] as string[], view: "Micro Astra handles this command." };
  }
  const explained = explainCase({ text, facts });
  const meaningful = facts.admitted === true || /\b(surgery|procedure|admitted)\b/i.test(text);
  const document = draftCaseDocument("progress-note", { ...facts, presentation: facts.presentation || text });
  return {
    kind: "clinical-review" as const,
    hermesInvoked: true,
    decider: "Laya",
    organizer: "LangGraph",
    clinical: "7D",
    evidence: "Scientist",
    voice: "Voicebox",
    steps: [...REVIEW_STEPS],
    patient: facts.presentation || "unknown",
    missing: explained.why.missing,
    redFlags: explained.sections.find((section) => section.index === 2)?.body ?? [],
    differential: explained.sections.find((section) => section.index === 3)?.body ?? [],
    mechanism: explained.mechanism.chain.length ? explained.mechanism.chain : ["unknown"],
    comorbidities: explained.comorbidity.map((item) => item.comorbidity),
    medicines: facts.medications ?? [],
    stay: meaningful ? expectedStay({ icu: /\bicu\b/i.test(text) }) : null,
    cost: meaningful ? costEstimate() : null,
    document,
    diagnosis: null,
    replacesClinician: false,
    memory: mem0Status(),
    gate: memoryGate(text),
    copiesPriorTreatment: differenceMatrix({}, {}).copiesTreatment,
  };
}
