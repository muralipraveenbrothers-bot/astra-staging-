/**
 * Astra-facing Laya decision API.
 * Runtime Laya still answers only its bounded tasks. This layer refuses a
 * firm answer when confidence is low, and it never treats a score as a
 * clinical probability.
 */
import type { LayaDecideResult } from "../services/layaService";

export const LAYA_VERDICTS = [
  "YES",
  "NO",
  "CHOICE",
  "SCORE",
  "UNKNOWN",
  "INSUFFICIENT_INFORMATION",
  "REQUIRES_HUMAN_REVIEW",
] as const;

export type LayaVerdict = (typeof LAYA_VERDICTS)[number];

export const SCORE_MEANING = "routing_confidence_not_clinical_probability" as const;

export interface AstraDecision {
  task: string;
  verdict: LayaVerdict;
  choice?: string;
  score?: number;
  reason: string;
  source: "laya-runtime" | "laya-policy" | "insufficient";
  calibratedForClinicalUse: false;
  scoreMeaning: typeof SCORE_MEANING;
}

export interface DecisionPack {
  decisions: AstraDecision[];
  needsHermes: boolean;
  needs7D: boolean;
  needsScientist: boolean;
  needsSpecialist: boolean;
  toolClasses: Array<"hospital_read" | "hospital_operations" | "clinical_read" | "clinical_write" | "evidence" | "documentation" | "voice">;
  silent: boolean;
  localOnly: boolean;
}

export interface RuntimeDecisions {
  urgency?: LayaDecideResult;
  department?: LayaDecideResult;
  intent?: LayaDecideResult;
  confirmation?: LayaDecideResult;
}

const CLINICAL = /\b(pain|fever|symptom|patient|diagnos|weakness|numb|radicul|breath|chest|pregnan|bleeding|seizure|vomit|swelling|limb|back)\b/i;
const ADMIN = /\b(census|roster|billing|staff|revenue|occupancy|kpi|budget)\b/i;
const COMMAND = /\b(order|prescribe|indent|admit|discharge|open|show|stop)\b/i;
const EVIDENCE = /\b(pubmed|pmid|guideline|literature|evidence|study|trial)\b/i;
const WRITE = /\b(prescrib|order|indent|discharge|transfus|surger|admit)\b/i;
const RADICULAR = /\b(back pain|lower back|radiat\w+|sciatica|radicul\w+)\b/i;
const CONFIDENT = 0.55;

function decision(partial: Omit<AstraDecision, "calibratedForClinicalUse" | "scoreMeaning">): AstraDecision {
  return { ...partial, calibratedForClinicalUse: false, scoreMeaning: SCORE_MEANING };
}

function bestChoice(result?: LayaDecideResult): { label?: string; confidence: number } {
  if (!result?.ok || !result.answers) return { confidence: 0 };
  for (const answer of Object.values(result.answers)) {
    if (!answer) continue;
    const probs = answer.probabilities;
    if (probs && Object.keys(probs).length > 0) {
      let label = answer.choice;
      let confidence = 0;
      for (const [key, value] of Object.entries(probs)) {
        if (value > confidence) {
          confidence = value;
          label = answer.legend?.[key] ?? answer.choice ?? key;
        }
      }
      return { label, confidence };
    }
    if (typeof answer.noul === "number") return { confidence: Math.abs(answer.noul - 0.5) * 2 };
  }
  return { confidence: 0 };
}

function noulOf(result?: LayaDecideResult): number | undefined {
  const value = result?.answers?.confirmation_needed?.noul;
  return typeof value === "number" ? value : undefined;
}

export function isRadicularPresentation(text: string): boolean {
  return RADICULAR.test(text) && /\b(limb|leg|thigh|calf|foot)\b/i.test(text);
}

export function decidePackSync(text: string, role: string, runtime?: RuntimeDecisions, previousPresentation?: string): DecisionPack {
  const said = (text ?? "").trim();
  const clinical = CLINICAL.test(said);
  const admin = ADMIN.test(said);
  const command = COMMAND.test(said);
  const thin = said.length < 8;
  const radicular = isRadicularPresentation(said);
  const doctor = (role ?? "").toLowerCase() === "doctor";
  const writes = WRITE.test(said);
  const urgency = bestChoice(runtime?.urgency);
  const department = bestChoice(runtime?.department);

  const decisions: AstraDecision[] = [];

  const push = (entry: AstraDecision) => decisions.push(entry);

  if (!said) {
    push(decision({ task: "remain_silent", verdict: "YES", reason: "There is no request to answer.", source: "laya-policy" }));
  } else {
    push(decision({ task: "remain_silent", verdict: "NO", reason: "The request has content.", source: "laya-policy" }));
  }

  push(decision({
    task: "clinical",
    verdict: thin ? "INSUFFICIENT_INFORMATION" : clinical ? "YES" : "NO",
    reason: thin ? "The text is too short to classify." : clinical ? "Clinical language is present." : "No clinical pattern is present.",
    source: thin ? "insufficient" : "laya-policy",
  }));
  push(decision({
    task: "administrative",
    verdict: admin ? "YES" : "NO",
    reason: admin ? "Operational language is present." : "No administrative pattern is present.",
    source: "laya-policy",
  }));
  push(decision({
    task: "conversation",
    verdict: !clinical && !admin && !command && said ? "YES" : "NO",
    reason: "Conversation is the residual class after clinical, administrative, and command checks.",
    source: "laya-policy",
  }));
  push(decision({
    task: "command",
    verdict: command ? "YES" : "NO",
    reason: command ? "A command verb is present." : "No command verb is present.",
    source: "laya-policy",
  }));

  if (runtime?.urgency?.ok && urgency.confidence >= CONFIDENT && urgency.label) {
    push(decision({
      task: "urgent",
      verdict: "CHOICE",
      choice: urgency.label,
      score: Number(urgency.confidence.toFixed(3)),
      reason: "Laya runtime urgency cleared the confidence floor. The score is routing confidence.",
      source: "laya-runtime",
    }));
  } else if (clinical && !thin) {
    push(decision({
      task: "urgent",
      verdict: "UNKNOWN",
      reason: "Urgency is not firm from this text, so Laya is not forced to grade it.",
      source: runtime?.urgency ? "laya-runtime" : "laya-policy",
    }));
  } else {
    push(decision({
      task: "urgent",
      verdict: "INSUFFICIENT_INFORMATION",
      reason: "There is not enough clinical text to grade urgency.",
      source: "insufficient",
    }));
  }

  if (radicular) {
    push(decision({
      task: "department",
      verdict: "CHOICE",
      choice: "musculoskeletal/neuro",
      reason: "Astra policy routes a possible radicular pattern to musculoskeletal/neuro. This is not a diagnosis.",
      source: "laya-policy",
    }));
  } else if (runtime?.department?.ok && department.confidence >= CONFIDENT && department.label) {
    push(decision({
      task: "department",
      verdict: "CHOICE",
      choice: department.label,
      score: Number(department.confidence.toFixed(3)),
      reason: "Laya runtime department cleared the confidence floor.",
      source: "laya-runtime",
    }));
  } else {
    push(decision({
      task: "department",
      verdict: clinical ? "UNKNOWN" : "NO",
      reason: clinical ? "Department is uncertain." : "No department routing is required.",
      source: "laya-policy",
    }));
  }

  push(decision({
    task: "patient_context",
    verdict: /\b(uhid|mrn|bed\s*\d+)\b/i.test(said) ? "CHOICE" : "INSUFFICIENT_INFORMATION",
    choice: /\b(uhid|mrn|bed\s*\d+)\b/i.test(said) ? "identifier-present" : undefined,
    reason: "A patient identifier in the text is noted. The chart is not assumed.",
    source: "laya-policy",
  }));

  const needsHermes = clinical && !thin;
  const needs7D = radicular || (clinical && /\b(diagnos|differential|manag|treat|pain|weakness)\b/i.test(said));
  const needsScientist = EVIDENCE.test(said);
  const needsSpecialist = needsHermes;
  push(decision({ task: "needs_hermes", verdict: needsHermes ? "YES" : "NO", reason: needsHermes ? "The case needs assignment and review." : "A bounded path can answer.", source: "laya-policy" }));
  push(decision({ task: "needs_7d", verdict: needs7D ? "YES" : "NO", reason: needs7D ? "The existing 7D engine is relevant." : "7D is not required.", source: "laya-policy" }));
  push(decision({ task: "needs_scientist", verdict: needsScientist ? "YES" : "NO", reason: needsScientist ? "The question asks for literature." : "No literature request.", source: "laya-policy" }));
  push(decision({ task: "needs_specialist", verdict: needsSpecialist ? "YES" : "NO", reason: needsSpecialist ? "A subset of specialists is required." : "No specialist is required.", source: "laya-policy" }));
  push(decision({
    task: "needs_investigation",
    verdict: clinical ? "REQUIRES_HUMAN_REVIEW" : "NO",
    reason: clinical ? "An investigation is a doctor decision. Back pain alone does not order imaging." : "No investigation is indicated by this text.",
    source: "laya-policy",
  }));
  push(decision({
    task: "already_answered",
    verdict: "INSUFFICIENT_INFORMATION",
    reason: "Existing chart facts were not supplied with this request.",
    source: "insufficient",
  }));
  push(decision({
    task: "needs_web_evidence",
    verdict: needsScientist ? "YES" : "NO",
    reason: needsScientist ? "Literature may be retrieved through the existing research path." : "Web evidence is not required.",
    source: "laya-policy",
  }));

  const localOnly = clinical || /\b(uhid|mrn|bed\s*\d+)\b/i.test(said);
  push(decision({ task: "local_only", verdict: localOnly ? "YES" : "NO", reason: localOnly ? "Clinical or identifier text stays on approved local paths." : "The text has no clinical identifier.", source: "laya-policy" }));
  push(decision({ task: "modifies_hospital_data", verdict: writes ? "YES" : "NO", reason: writes ? "The wording would change hospital data if executed." : "No hospital write is requested.", source: "laya-policy" }));

  const noul = noulOf(runtime?.confirmation);
  let approval: AstraDecision;
  if (writes && !doctor) {
    approval = decision({ task: "human_approval", verdict: "REQUIRES_HUMAN_REVIEW", reason: "A clinical or hospital write needs a doctor. The executive role does not approve it.", source: "laya-policy" });
  } else if (writes && doctor) {
    approval = decision({ task: "human_approval", verdict: "REQUIRES_HUMAN_REVIEW", reason: "The doctor confirms the order before the command engine executes it.", source: "laya-policy" });
  } else if (typeof noul === "number" && noul >= 0.75) {
    approval = decision({ task: "human_approval", verdict: "YES", score: noul, reason: "Laya confirmation score cleared 0.75. This is routing confidence.", source: "laya-runtime" });
  } else if (typeof noul === "number" && noul <= 0.25) {
    approval = decision({ task: "human_approval", verdict: "NO", score: noul, reason: "Laya confirmation score is low.", source: "laya-runtime" });
  } else if (typeof noul === "number") {
    approval = decision({ task: "human_approval", verdict: "UNKNOWN", score: noul, reason: "Confirmation sits in the uncertain band.", source: "laya-runtime" });
  } else {
    approval = decision({ task: "human_approval", verdict: clinical ? "REQUIRES_HUMAN_REVIEW" : "NO", reason: clinical ? "Clinical reasoning stays with the doctor." : "No approval gate is open.", source: "laya-policy" });
  }
  push(approval);

  const toolClasses: DecisionPack["toolClasses"] = [];
  if (admin) toolClasses.push("hospital_read", "hospital_operations");
  if (clinical) toolClasses.push("clinical_read");
  if (writes && doctor) toolClasses.push("clinical_write", "documentation");
  if (needsScientist) toolClasses.push("evidence");
  if (!toolClasses.length) toolClasses.push("voice");
  push(decision({
    task: "relevant_tools",
    verdict: "CHOICE",
    choice: toolClasses.join(","),
    reason: "Only these tool classes are in scope.",
    source: "laya-policy",
  }));

  const material: LayaVerdict = previousPresentation
    ? (radicular && !isRadicularPresentation(previousPresentation) ? "YES" : "NO")
    : "INSUFFICIENT_INFORMATION";
  push(decision({
    task: "material_change",
    verdict: material,
    reason: previousPresentation ? "Compared with the stored presentation." : "No stored case was supplied.",
    source: previousPresentation ? "laya-policy" : "insufficient",
  }));

  return {
    decisions,
    needsHermes,
    needs7D,
    needsScientist,
    needsSpecialist,
    toolClasses,
    silent: !said,
    localOnly,
  };
}
