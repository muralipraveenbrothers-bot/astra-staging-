import { register } from "../schema/registry";
import type { DecisionOption, DecisionSchema } from "../schema/types";

const createdAt = "2026-09-29T00:00:00.000Z";
const thresholds = { auto: 0.9, assist: 0.65, minMargin: 0.25 };
const abstain: DecisionOption[] = [
  { key: "unknown", label: "Unknown" },
  { key: "human_review", label: "Human review" },
];

function choice(id: string, domain: DecisionSchema["domain"], question: string, options: DecisionOption[]): DecisionSchema {
  return {
    id, version: 1, kind: "choice", question, domain,
    options: [...options, ...abstain],
    abstainKeys: ["unknown", "human_review"],
    dataClass: "non_phi_decision_state",
    defaultMode: "SHADOW",
    thresholds, languages: ["en", "te", "hi"], owner: "astra-reflex", createdAt,
  };
}

function score(id: string, domain: DecisionSchema["domain"], question: string, levels: string[]): DecisionSchema {
  return {
    id, version: 1, kind: "score", question, domain, levels,
    abstainKeys: ["unknown"],
    dataClass: "non_phi_decision_state", defaultMode: "SHADOW", thresholds,
    languages: ["en", "te", "hi"], owner: "astra-reflex", createdAt,
  };
}

const other = (description: string): DecisionOption => ({ key: "other", label: "Other", description });
const emergency = { key: "emergency", label: "Emergency", description: "needs immediate human escalation" };

export const PACKS: Record<string, DecisionSchema[]> = {
  reception: [
    choice("reception.visit_intent", "reception", "What does this reception visit seem to be for?", [
      { key: "registration", label: "Registration", description: "new registration or file open" },
      { key: "appointment", label: "Appointment", description: "book change or ask appointment" },
      emergency, other("another reception visit purpose"),
    ]),
    choice("reception.department", "reception", "Which department should reception suggest?", [
      { key: "lab", label: "Lab", description: "laboratory tests and samples" },
      { key: "billing", label: "Billing", description: "payments invoices refunds and receipts" },
      emergency, other("another hospital department"),
    ]),
    choice("reception.urgency_band", "reception", "How urgent is this reception routing request?", [
      { key: "routine", label: "Routine", description: "can wait in the normal queue" },
      { key: "urgent", label: "Urgent", description: "should be seen ahead of routine" },
      emergency,
    ]),
    choice("reception.new_vs_followup", "reception", "Is this a new visit or a follow up?", [
      { key: "new", label: "New", description: "first visit for this problem" },
      { key: "followup", label: "Follow up", description: "return visit for prior care" },
    ]),
    choice("reception.needs_interpreter", "reception", "Which language help does reception need?", [
      { key: "en", label: "English", description: "English is enough for this visit" },
      { key: "te", label: "Telugu", description: "Telugu interpreter or Telugu speech" },
      { key: "hi", label: "Hindi", description: "Hindi interpreter or Hindi speech" },
    ]),
    choice("reception.document_missing", "reception", "Is a required reception document missing?", [
      { key: "no", label: "No", description: "required documents are already present" },
      { key: "yes", label: "Yes", description: "a required document is missing" },
    ]),
    choice("reception.appointment_action", "reception", "What appointment action is being asked?", [
      { key: "book", label: "Book", description: "create a new appointment slot" },
      { key: "cancel", label: "Cancel", description: "cancel an existing appointment" },
      { key: "none", label: "None", description: "no appointment change is requested" },
    ]),
  ],
  pharmacy: [
    choice("pharmacy.rx_legibility_ok", "pharmacy", "Is the prescription legible enough to prepare?", [
      { key: "yes", label: "Yes", description: "the prescription can be read" },
      { key: "no", label: "No", description: "the prescription cannot be read" },
    ]),
    choice("pharmacy.substitution_needed", "pharmacy", "Should a pharmacist consider a substitution suggestion?", [
      { key: "no", label: "No", description: "no substitution suggestion is needed" },
      { key: "suggest", label: "Suggest", description: "suggest only, pharmacist decides" },
    ]),
    choice("pharmacy.needs_pharmacist_review", "pharmacy", "Does a pharmacist need to review this?", [
      { key: "no", label: "No", description: "no extra pharmacist review is indicated" },
      { key: "yes", label: "Yes", description: "a pharmacist should review before dispensing" },
    ]),
  ],
  billing: [
    choice("billing.discount_request", "billing", "Is this a discount or waiver request?", [
      { key: "no", label: "No", description: "no discount or waiver is requested" },
      { key: "yes", label: "Yes", description: "a discount or waiver needs approval" },
    ]),
    choice("billing.package_vs_itemized", "billing", "Does this look like a package or itemized bill?", [
      { key: "package", label: "Package", description: "a bundled package price applies" },
      { key: "itemized", label: "Itemized", description: "individual line items are being billed" },
    ]),
  ],
  safety: [
    score("safety.emergency_now", "safety", "How strong is the signal that a human should be called now?", ["none", "watch", "escalate"]),
    choice("safety.self_harm_signal", "safety", "Is there a self-harm signal that needs a human now?", [
      { key: "no", label: "No", description: "no self-harm signal is present" },
      { key: "yes", label: "Yes", description: "hand to a human immediately" },
    ]),
  ],
  router: [
    choice("router.tool_family", "router", "Which tool family fits this request?", [
      { key: "queue", label: "Queue", description: "queue position and sorting tools" },
      { key: "pharmacy", label: "Pharmacy", description: "pharmacy stock and counselling tools" },
      { key: "none", label: "None", description: "no tool family fits this request" },
      emergency, other("another tool family"),
    ]),
    choice("router.execution_tier", "router", "Which execution tier should handle this?", [
      { key: "T0", label: "T0", description: "deterministic tool with no model" },
      { key: "T1", label: "T1", description: "Laya answer only, no further model" },
      { key: "T2", label: "T2", description: "Micro Astra small local language help" },
      { key: "T3", label: "T3", description: "Hermes or a normal local model" },
      { key: "T5", label: "T5", description: "a human or doctor is mandatory" },
    ]),
    choice("router.micro_astra_can_handle", "router", "Can Micro Astra handle this language step?", [
      { key: "yes", label: "Yes", description: "a short local language step is enough" },
      { key: "no", label: "No", description: "Micro Astra should not handle this" },
      { key: "uncertain", label: "Uncertain", description: "uncertain means do not use Micro Astra" },
    ]),
    score("router.risk", "router", "How risky is this action if it were executed?", ["1", "2", "3", "4", "5"]),
  ],
};

export const SCHEMA_AUTHORITY: Record<string, "APPROVAL_REQUIRED" | "DOCTOR_ONLY" | "CONFIRM_USER"> = {
  "billing.discount_request": "APPROVAL_REQUIRED",
  "safety.self_harm_signal": "DOCTOR_ONLY",
};

export function registerPacks(): void {
  for (const schemas of Object.values(PACKS)) {
    for (const schema of schemas) register(schema);
  }
}

registerPacks();
