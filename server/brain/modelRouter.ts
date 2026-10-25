/**
 * Smallest sufficient intelligence. This router decides the tier for the
 * Astra brain. Spoken Saarathi turns keep their existing gateway order.
 */
import { classifyPrivacy, providerAllowed, type PrivacyClass } from "./privacy";
import { currentGovernorMode } from "./resourceGovernor";

export const INTELLIGENCE_TIERS = [
  "NO_AI",
  "RULE",
  "LAYA",
  "MICRO_ASTRA",
  "SMALL_LOCAL",
  "HERMES",
  "DEEP",
  "MULTI_MODEL",
] as const;

export type IntelligenceTier = (typeof INTELLIGENCE_TIERS)[number];

export interface TierDecision {
  tier: IntelligenceTier;
  reason: string;
  privacy: PrivacyClass;
  providers: string[];
  voiceChainUnchanged: boolean;
}

const NAV = /^(open|show|stop|pause)\b|\b(open|show)\s+(pharmacy|lab|ward|billing|radiology)\b/i;
const CENSUS = /\b(census|bed occupancy|how many (patients|inpatients)|opd queue)\b/i;
const EVIDENCE = /\b(pubmed|pmid|guideline|literature|systematic review|meta-analysis)\b/i;

export function routeModelTier(input: {
  text: string;
  clinical: boolean;
  needsHermes: boolean;
  disagreement: boolean;
  voice?: boolean;
  hasPatientContext?: boolean;
}): TierDecision {
  const privacy = classifyPrivacy(input.text, input.hasPatientContext);
  const voice = input.voice === true;
  let tier: IntelligenceTier = "HERMES";
  let reason = "Hermes coordinates when the request needs judgment.";

  if (!input.text.trim() || NAV.test(input.text)) {
    tier = "NO_AI";
    reason = "Navigation and stop are handled by the command interpreter.";
  } else if (CENSUS.test(input.text)) {
    tier = "RULE";
    reason = "Census comes from the hospital database.";
  } else if (!input.needsHermes && !input.clinical) {
    tier = "LAYA";
    reason = "A bounded decision is enough.";
  } else if (input.clinical && !input.needsHermes) {
    tier = "LAYA";
    reason = "Laya routes the clinical request before a larger model.";
  } else if (EVIDENCE.test(input.text) && input.disagreement) {
    tier = "MULTI_MODEL";
    reason = "More than one model is justified only when evidence and disagreement both require it.";
  } else if (EVIDENCE.test(input.text)) {
    tier = "DEEP";
    reason = "Literature synthesis needs the deeper reasoning tier.";
  } else if (input.needsHermes) {
    tier = "HERMES";
    reason = "Hermes assigns the specialist subset and reviews it.";
  }

  const mode = currentGovernorMode();
  if ((mode === "ECO" || mode === "CLINICAL_PRIORITY") && !input.clinical && (tier === "DEEP" || tier === "MULTI_MODEL" || tier === "HERMES")) {
    tier = "MICRO_ASTRA";
    reason = "The resource governor keeps non-clinical work on Micro Astra.";
  }
  if (mode === "CLINICAL_PRIORITY" && input.clinical && tier === "MULTI_MODEL") {
    tier = "HERMES";
    reason = "Clinical priority keeps one executive path and preserves the case.";
  }

  let providers = voice
    ? ["freellmapi", "ollama"]
    : ["laya", "micro-astra", "ollama", "hermes-via-astra-gateway"];
  if (privacy === "PHI" || privacy === "HIGH-RISK CLINICAL") {
    providers = providers.filter((id) => providerAllowed(privacy, id));
  }

  return {
    tier,
    reason,
    privacy,
    providers,
    voiceChainUnchanged: voice,
  };
}
