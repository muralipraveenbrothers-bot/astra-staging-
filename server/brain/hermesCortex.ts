/**
 * Hermes executive adapter. It assigns work and reviews the subset.
 * It does not carry the hospital's medical knowledge in one prompt,
 * and it does not call the Hermes CLI unless a later part asks for that.
 */
import { canAuthorizeClinicalAction } from "../../src/astra/saarathi/command/clinicalAuthority";
import { compileContext } from "./contextCompiler";
import { decidePackSync, type DecisionPack, type RuntimeDecisions } from "./layaDecisionApi";
import type { AstraCaseState } from "./caseState";
import { attachAssignment, openClinicalCase } from "./langGraphMaster";
import { routeModelTier, type TierDecision } from "./modelRouter";
import { classifyPrivacy } from "./privacy";
import { disagreementCards, temporaryWorkers } from "../../src/astra/brain/part2/follow";
import { buildDelegation, redFlagsInText, type DelegationPlan } from "./specialists";
import { saveCase } from "./caseState";
import { wrapExisting7D } from "./sevenDWrap";

export interface CortexAssignment {
  diagnosis: null;
  tier: TierDecision;
  decisions: DecisionPack;
  delegation: DelegationPlan | null;
  context: ReturnType<typeof compileContext>;
  caseState: AstraCaseState | null;
  disagreements: string[];
  missingInformation: string[];
  integrated: string;
  sevenD: Awaited<ReturnType<typeof wrapExisting7D>> | null;
  workers: ReturnType<typeof temporaryWorkers>;
  disagreementCards: ReturnType<typeof disagreementCards>;
  hermesCliInvoked: false;
}

export async function assignWork(input: {
  text: string;
  role: string;
  runtime?: RuntimeDecisions;
  invoke7D?: boolean;
  patientContext?: unknown;
  language?: string;
  openCase?: boolean;
}): Promise<CortexAssignment> {
  const text = (input.text ?? "").trim();
  const pack = decidePackSync(text, input.role, input.runtime);
  const privacy = classifyPrivacy(text, Boolean(input.patientContext));
  const delegation = pack.needsSpecialist ? buildDelegation(text) : null;
  const tier = routeModelTier({
    text,
    clinical: pack.needsHermes,
    needsHermes: pack.needsHermes,
    disagreement: false,
    hasPatientContext: Boolean(input.patientContext),
  });
  const missing = delegation?.reports.flatMap((report) => report.questions) ?? [];
  const flags = redFlagsInText(text);
  let caseState: AstraCaseState | null = null;
  if (input.openCase !== false && pack.needsHermes) {
    caseState = openClinicalCase(text, input.role);
    caseState = attachAssignment(
      caseState.caseId,
      delegation?.active ?? [],
      flags,
      missing,
    );
  }
  const context = compileContext({
    text,
    role: input.role,
    privacy,
    classes: pack.toolClasses,
    caseState,
  });
  const sevenD = input.invoke7D && pack.needs7D
    ? await wrapExisting7D(text, input.patientContext, input.language ?? "en")
    : null;
  const disagreements: string[] = [];
  if (sevenD && flags.length === 0 && /emergency|acs|sepsis/i.test(JSON.stringify(sevenD.synthesis).slice(0, 500))) {
    disagreements.push("The existing 7D template and the red-flag agent do not describe the same risk. A doctor reviews both.");
  }
  if (!canAuthorizeClinicalAction(input.role) && pack.decisions.some((item) => item.task === "modifies_hospital_data" && item.verdict === "YES")) {
    disagreements.push("The caller cannot authorize a clinical write.");
  }

  const integrated = delegation
    ? "Hermes assigned a specialist subset. The workers returned structured results and did not change treatment."
    : pack.needsHermes
      ? "Hermes kept the request and did not start the full specialist roster."
      : "Laya and the rule layer handled this request. Hermes was not required.";
  const workers = temporaryWorkers(text, { presentation: text });
  const cards = disagreementCards(text, { presentation: text });
  if (caseState) {
    caseState.specialistResults = workers.map((worker) => ({
      agent: worker.agent,
      conclusion: worker.conclusion,
      treatmentChanged: false as const,
    }));
    caseState.disagreementCards = cards.map((card) => ({
      agentA: card.agentA.conclusion,
      agentB: card.agentB.conclusion,
      wouldResolve: card.wouldResolve,
    }));
    caseState = saveCase(caseState);
  }

  return {
    diagnosis: null,
    tier,
    decisions: pack,
    delegation,
    context,
    caseState,
    disagreements,
    missingInformation: missing,
    integrated,
    sevenD,
    workers,
    disagreementCards: cards,
    hermesCliInvoked: false,
  };
}
