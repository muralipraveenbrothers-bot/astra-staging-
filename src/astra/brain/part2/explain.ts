/**
 * One doctor-facing explanation. The existing 7D synthesis, when supplied,
 * is returned untouched beside these layers.
 */
import type { VerifiedFacts } from "./facts";
import { known } from "./facts";
import {
  clinicalSections,
  disagreementCards,
  draftCaseDocument,
  temporaryWorkers,
  type ClinicalSection,
  type DisagreementCard,
  type DocumentKind,
  type WorkerResult,
} from "./follow";
import { readInvestigations, type InvestigationRead } from "./investigations";
import { buildMechanism, crossCuttingLinks, nodesForView, type CausalLink, type GraphNode, type MechanismGraph, type PathView } from "./mechanism";
import { comorbidityOverlay, deteriorationRadar, type OverlayAnswer, type Radar } from "./overlay";

export interface WhyExplanation {
  factsUsed: string[];
  supporting: string[];
  against: string[];
  missing: string[];
  evidenceSource: string;
  uncertainty: string;
  hiddenChainOfThought: false;
}

export interface CaseExplanation {
  mechanism: MechanismGraph;
  visibleNodes: GraphNode[];
  crossCutting: CausalLink[];
  comorbidity: OverlayAnswer[];
  radar: Radar | null;
  investigations: InvestigationRead;
  why: WhyExplanation;
  workers: WorkerResult[];
  disagreements: DisagreementCard[];
  sections: ClinicalSection[];
  diagnosis: null;
  ordersPlaced: false;
}

export function explainCase(input: { text: string; facts?: VerifiedFacts; view?: PathView }): CaseExplanation {
  const text = (input.text ?? "").trim();
  const facts = input.facts ?? {};
  const mechanism = buildMechanism(text, facts.pulsesPresent, facts.examinationReliable);
  const fracture = mechanism.chain.length > 0;
  const investigations = readInvestigations(facts, text);
  const workers = temporaryWorkers(text, { ...facts, presentation: facts.presentation || text });
  const why: WhyExplanation = {
    factsUsed: [facts.presentation || text || "unknown", ...(facts.comorbidities ?? []), ...(facts.labs ?? []).map((lab) => lab.name)].filter(Boolean),
    supporting: fracture ? ["Injury inside a closed fascial compartment can raise pressure."] : ["Only the recorded presentation is used."],
    against: facts.pulsesPresent ? ["Pulses are present. That fact is recorded and does not clear the compartment."] : ["No finding has been recorded that argues against the leading concern."],
    missing: fracture ? ["Which compartment", "Pain on passive stretch", "Sensation", "Motor power", "Whether the exam is reliable"] : ["Signs, anatomy, and results that were not recorded"],
    evidenceSource: fracture ? "Orthopedic compartment-syndrome examination pathway. Not a hidden model trace." : "Verified case text. No external citation is invented.",
    uncertainty: fracture ? "The case is not diagnosed as compartment syndrome. It is on the watch list." : "The mechanism is unknown until more verified facts arrive.",
    hiddenChainOfThought: false,
  };
  const sections = clinicalSections({
    text,
    facts: { ...facts, presentation: facts.presentation || text },
    redFlags: fracture ? ["Compartment syndrome until examination says otherwise"] : [],
    possibilities: fracture ? ["Limb-threatening compartment ischemia: cannot safely exclude"] : [],
    why: why.supporting,
    alternatives: fracture ? ["Fracture pain without raised compartment pressure", "Nerve injury", "Vascular injury"] : [],
    missing: why.missing,
    investigations: investigations.hiddenInformation,
    extraTests: fracture ? ["No routine blood test is added to exclude early compartment syndrome."] : [],
    mechanism: mechanism.chain.length ? mechanism.chain : mechanism.levels.cell,
    medical: fracture ? ["Analgesia is recorded as a trend. It is not a treatment order from Astra."] : [],
    surgical: fracture ? ["Fasciotomy is a surgeon's decision. Astra does not schedule it."] : [],
    pkpd: (facts.medications ?? []).length ? ["Dose adjustment waits for the recorded renal and hepatic results."] : [],
    watch: fracture ? mechanism.nodes.find((node) => node.id === "CLINICAL SIGNS")!.statements : [],
    disposition: facts.admitted ? ["Inpatient monitoring continues under the doctor."] : [],
    cost: fracture ? ["Serial examination uses the clinician already assigned. It does not add an unvalidated assay."] : [],
    uncertainty: [why.uncertainty],
    approvals: ["Doctor review is required before any order or procedure."],
  });
  return {
    mechanism,
    visibleNodes: nodesForView(mechanism, input.view ?? "Clinical"),
    crossCutting: crossCuttingLinks(text),
    comorbidity: comorbidityOverlay(facts, text),
    radar: deteriorationRadar(facts, text),
    investigations,
    why,
    workers,
    disagreements: disagreementCards(text, facts),
    sections,
    diagnosis: null,
    ordersPlaced: false,
  };
}

export function explainDocument(kind: DocumentKind, facts: VerifiedFacts) {
  return draftCaseDocument(kind, facts);
}

export function knownField(value: string | number | undefined): string {
  return known(value);
}
