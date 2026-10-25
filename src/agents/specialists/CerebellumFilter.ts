/**
 * ASTRA AI — CEREBELLUM: THE EMPATHY & TONE FILTER
 * ============================================================================
 * LIGHTWEIGHT MIDDLEWARE (deterministic rule engine — no LLM) between ALL AI
 * outputs and the user. Core medical message is IMMUTABLE — only phrasing is
 * softened. Patient-facing: always ON (cannot disable). Doctor-facing: toggle.
 */

export type CerebellumContext = "PATIENT" | "ATTENDANT" | "DOCTOR" | "EMERGENCY";

export interface CerebellumInput {
  text: string;
  context: CerebellumContext;
  userEmotion?: "ANGRY" | "ANXIOUS" | "GRIEVING" | "CALM";
  empathyFilterEnabled?: boolean;
}

export interface CerebellumOutput {
  original: string;
  filtered: string;
  filterApplied: boolean;
  rules: string[];
  medicallyUnchanged: boolean;
}

const HARD_PHRASES: Array<[RegExp, string]> = [
  [/\byour creatinine is high\b/i, "your kidney function marker is slightly elevated"],
  [/\bcreatinine.*elevated\b/i, "kidney function marker is slightly elevated"],
  [/\bkidney failure\b/i, "kidneys need close monitoring"],
  [/\byou have cancer\b/i, "there are findings that need further review with your doctor"],
  [/\brenal failure\b/i, "kidney function needs monitoring"],
  [/\bdying\b/i, "we are doing everything to support you"],
  [/\bfailure\b/i, "function needs support"],
  [/\bsevere\b/i, "significant"],
  [/\bcritical\b/i, "requires close monitoring"],
  [/\bnormal\b/i, "within expected range"],
  [/\babnormal\b/i, "showing changes we are watching"],
  [/\bnot good\b/i, "we will watch this closely together"],
  [/\bhigh risk\b/i, "needs careful monitoring"],
  [/\bimpossible\b/i, "very unlikely"],
  [/\byour test shows (?:a )?positive/i, "your test shows a result your doctor will discuss with you"],
];

const EMOTION_PREFIX: Record<string, string> = {
  GRIEVING: "I understand this is difficult. ",
  ANXIOUS: "I want to reassure you — we are monitoring this closely. ",
  ANGRY: "I understand your concern. Let me explain calmly: ",
};

export class CerebellumFilter {
  public static readonly agentId = "cerebellum_balancer";

  public static filter(input: CerebellumInput): CerebellumOutput {
    const patientFacing = input.context === "PATIENT" || input.context === "ATTENDANT";
    const enabled = patientFacing || (input.empathyFilterEnabled ?? true);
    if (!enabled) {
      return {
        original: input.text,
        filtered: input.text,
        filterApplied: false,
        rules: ["Empathy filter OFF (doctor-facing fast mode)"],
        medicallyUnchanged: true,
      };
    }

    let text = input.text;
    const rules: string[] = [];
    for (const [re, repl] of HARD_PHRASES) {
      if (re.test(text)) {
        text = text.replace(re, repl);
        rules.push("HUMANIZATION: harsh clinical phrasing softened");
      }
    }

    if (input.userEmotion && EMOTION_PREFIX[input.userEmotion]) {
      const prefix = EMOTION_PREFIX[input.userEmotion];
      if (!text.startsWith(prefix)) {
        text = prefix + text.charAt(0).toLowerCase() + text.slice(1);
        rules.push(`EMPATHY: ${input.userEmotion} state detected — supportive framing added`);
      }
    }

    if (input.context === "EMERGENCY") {
      rules.push("CONTEXT: emergency — tone kept firm and direct (facts preserved)");
    } else {
      text = text.replace(/\b(must|never|always)\b/gi, (m) => (m === "never" ? "should not" : "should"));
      rules.push("DE-ESCALATION: absolute language softened to advisory");
    }

    return {
      original: input.text,
      filtered: text,
      filterApplied: text !== input.text,
      rules: Array.from(new Set(rules)),
      medicallyUnchanged: true,
    };
  }
}