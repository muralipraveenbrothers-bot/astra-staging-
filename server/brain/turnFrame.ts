/**
 * Compact brain record attached to a live Saarathi turn.
 * The existing answer, voice chain, and ports stay as they are.
 */
import { assessSaarathiAuthority } from "../../src/astra/saarathi/command/clinicalAuthority";
import { decidePackSync, type RuntimeDecisions } from "./layaDecisionApi";
import { routeModelTier } from "./modelRouter";
import { classifyPrivacy } from "./privacy";
import { selectSpecialists } from "./specialists";
import { scrubSecrets } from "./secretVault";

export function buildTurnBrainFrame(input: { text: string; role: string; runtime?: RuntimeDecisions; voice?: boolean }) {
  const text = scrubSecrets(input.text ?? "");
  const authority = assessSaarathiAuthority(input.role, text);
  const decisions = decidePackSync(text, input.role, input.runtime);
  const privacy = classifyPrivacy(text);
  const tier = routeModelTier({
    text,
    clinical: decisions.needsHermes,
    needsHermes: decisions.needsHermes,
    disagreement: false,
    voice: input.voice === true,
  });
  const specialists = decisions.needsSpecialist ? selectSpecialists(text) : { active: [], queued: [] };
  return {
    version: "clinical-case-v1",
    privacy,
    tier: tier.tier,
    tierReason: tier.reason,
    voiceChainUnchanged: input.voice === true,
    authority,
    approvalRequired: authority.clinical || authority.safetyDenied || decisions.decisions.some((item) => item.verdict === "REQUIRES_HUMAN_REVIEW"),
    specialists,
    toolClasses: decisions.toolClasses,
    localOnly: decisions.localOnly,
    calibratedForClinicalUse: false,
  };
}
