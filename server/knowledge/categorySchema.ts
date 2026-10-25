import { get, register } from "../reflex/schema/registry";
import type { DecisionSchema } from "../reflex/schema/types";

/** SHADOW category hint. A human confirms the category before publish. */
export function ensureKnowledgeCategorySchema(): DecisionSchema {
  const existing = get("knowledge.category", 1);
  if (existing) return existing;
  const schema: DecisionSchema = {
    id: "knowledge.category",
    version: 1,
    kind: "choice",
    question: "Which knowledge category should a human confirm for this document?",
    options: [
      { key: "clinical", label: "Clinical", description: "Clinical reference needing doctor review" },
      { key: "hospital_policy", label: "Hospital policy", description: "Hospital policy or operating manual" },
      { key: "equipment", label: "Equipment", description: "Equipment manual or maintenance note" },
      { key: "legal", label: "Legal", description: "Legal or regulatory reference text" },
      { key: "templates", label: "Templates", description: "Non clinical document template" },
      { key: "unknown", label: "Unknown" },
      { key: "human_review", label: "Human review" },
    ],
    abstainKeys: ["unknown", "human_review"],
    domain: "knowledge",
    dataClass: "non_phi_decision_state",
    defaultMode: "SHADOW",
    thresholds: { auto: 0.9, assist: 0.65, minMargin: 0.25 },
    languages: ["en", "te", "hi"],
    owner: "astra-knowledge",
    createdAt: "2026-09-29T00:00:00.000Z",
  };
  return register(schema);
}
