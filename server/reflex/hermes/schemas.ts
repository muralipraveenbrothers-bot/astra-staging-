import { register } from "../schema/registry";
import type { DecisionOption, DecisionSchema } from "../schema/types";

const createdAt = "2026-09-29T00:00:00.000Z";
const thresholds = { auto: 0.9, assist: 0.65, minMargin: 0.25 };
const common = { version: 1, dataClass: "non_phi_decision_state", defaultMode: "SHADOW" as const, thresholds, languages: ["en"] as Array<"en">, owner: "astra-reflex-hermes", createdAt };
const abstain: DecisionOption[] = [
  { key: "unknown", label: "Unknown" },
  { key: "human_review", label: "Human review" },
];

function choice(id: string, domain: DecisionSchema["domain"], question: string, options: DecisionOption[]): DecisionSchema {
  return { ...common, id, kind: "choice", question, options: [...options, ...abstain], abstainKeys: abstain.map((o) => o.key), domain };
}

export const HERMES_DECISION_SCHEMAS: DecisionSchema[] = [
  choice("hermes.step_gate", "hermes", "Should Hermes proceed with this bounded plan step?", [
    { key: "proceed", label: "Proceed", description: "safe bounded step" },
    { key: "ask_human", label: "Ask human", description: "needs human input" },
    { key: "stop", label: "Stop", description: "stop current plan" },
    { key: "replan", label: "Replan", description: "needs revised plan" },
  ]),
  choice("router.delegate_to", "router", "Which existing Astra specialist should handle this step?", [
    { key: "Scientist", label: "Scientist", description: "research reasoning specialist" },
    { key: "Astra 7D", label: "Astra 7D", description: "clinical draft reasoning" },
    { key: "Book skills", label: "Book skills", description: "local skill knowledge" },
    { key: "Department Ops", label: "Department Ops", description: "hospital operations agent" },
    { key: "none", label: "None", description: "no delegation needed" },
  ]),
  choice("router.parallelizable", "router", "Can this delegated step run in parallel?", [
    { key: "yes", label: "Yes", description: "safe concurrent execution" },
    { key: "no", label: "No", description: "requires serial execution" },
  ]),
  choice("browser.next_action", "browser", "Which bounded browser action should run next?", [
    { key: "DONE", label: "Done", description: "goal has been reached" },
    { key: "WAIT", label: "Wait", description: "wait for page update" },
    { key: "BACK", label: "Back", description: "go browser history back" },
    { key: "SCROLL_DOWN", label: "Scroll down", description: "scroll page downward" },
    { key: "SCROLL_UP", label: "Scroll up", description: "scroll page upward" },
    { key: "ASK_HUMAN", label: "Ask human", description: "needs human decision" },
  ]),
];

export function registerHermesSchemas(): void {
  for (const schema of HERMES_DECISION_SCHEMAS) register(schema);
}

registerHermesSchemas();
