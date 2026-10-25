import path from "path";
import { astraDataRoot } from "../services/env";
import { open } from "../persistence/durableJsonl";

export interface OutcomeRecord {
  decisionId: string;
  truth: string;
  source: "human_override" | "workflow_event" | "approval" | "result" | "manual_label";
  at: string;
}

const memory: OutcomeRecord[] = [];

export function recordOutcome(decisionId: string, outcome: Omit<OutcomeRecord, "decisionId">): OutcomeRecord {
  const row: OutcomeRecord = { decisionId, ...outcome, at: outcome.at || new Date().toISOString() };
  memory.push(row);
  if (!process.env.VITEST) {
    try { open("outcomes", path.join(astraDataRoot(), "reflex")).append("outcome", row); } catch { /* best effort */ }
  }
  return row;
}

export function outcomeFromDepartmentChange(decisionId: string, department: string): OutcomeRecord {
  return recordOutcome(decisionId, { truth: department, source: "human_override", at: new Date().toISOString() });
}

export function outcomeFromApproval(decisionId: string, decision: "Approve" | "Modify" | "Reject"): OutcomeRecord {
  return recordOutcome(decisionId, { truth: decision, source: "approval", at: new Date().toISOString() });
}

export function outcomeFromWorkflow(decisionId: string, event: string): OutcomeRecord {
  return recordOutcome(decisionId, { truth: event, source: "workflow_event", at: new Date().toISOString() });
}

export function outcomeFromAlertReview(decisionId: string, appropriate: boolean): OutcomeRecord {
  return recordOutcome(decisionId, { truth: appropriate ? "appropriate" : "not_appropriate", source: "result", at: new Date().toISOString() });
}

export function listOutcomes(): OutcomeRecord[] {
  return memory.slice();
}
