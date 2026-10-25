/**
 * ASTRA AI — Agent Operating Framework: Agent Spec Card
 * ============================================================================
 * Every agent gets a precise, machine-readable specification of its six-block
 * contract — goal, done-test, allowed tools, instructions, context, guardrails,
 * escalation rules and limits. Example: tox_command's card demands toxidrome,
 * exposure, severity, immediate threats, antidote considerations, monitoring
 * and escalation criteria — not a vague "manage poisoning".
 */

import { AgentContract, AutonomyLevel, StopCondition } from "./types";
import type { AgentRecord, RiskLevel } from "../core/AgentDefinition";

export interface AgentSpecCard {
  id: string;
  version: string;
  name?: string;
  goal: string;
  doneTest: string;
  allowedTools: string[];
  instructions: string[];
  contextRequirements: string[];
  prohibitedActions: string[];
  redLines: string[];
  escalateTo?: string;
  limits: Required<Pick<StopCondition, "maxSteps" | "maxToolCalls" | "timeoutMs" | "retryLimit">> & {
    humanCheckpoint: StopCondition["humanCheckpoint"];
  };
  autonomy: AutonomyLevel;
}

export function buildSpecCard(contract: AgentContract): AgentSpecCard {
  const sc: StopCondition = contract.stopCondition;
  return {
    id: contract.id,
    version: contract.version,
    name: contract.name,
    goal: contract.goal.objective,
    doneTest: contract.goal.doneTest,
    allowedTools: contract.tools.allowedToolIds,
    instructions: contract.instructions,
    contextRequirements: contract.context.required,
    prohibitedActions: contract.guardrails.prohibitedActions,
    redLines: contract.guardrails.redLines ?? [],
    escalateTo: contract.guardrails.escalateTo,
    limits: {
      maxSteps: sc.maxSteps ?? 10,
      maxToolCalls: sc.maxToolCalls ?? 20,
      timeoutMs: sc.timeoutMs ?? 60_000,
      retryLimit: sc.retryLimit ?? 2,
      humanCheckpoint: sc.humanCheckpoint ?? "on-red",
    },
    autonomy: contract.autonomy,
  };
}

/** Map an existing RiskLevel to the most conservative sensible AutonomyLevel. */
export function autonomyFromRiskLevel(risk: RiskLevel | undefined): AutonomyLevel {
  switch (risk) {
    case "INFO":
      return "READ_ONLY";
    case "REVERSIBLE":
      return "RECOMMEND_ONLY";
    case "IMPORTANT":
    case "HIGH_RISK":
    case "CRITICAL":
      return "APPROVAL_REQUIRED";
    default:
      return "READ_ONLY";
  }
}

/**
 * Bridge: convert the ~300 already-registered AgentRecords (AgentRegistry.ts /
 * plugin manifests) into six-block AgentContracts without editing each agent.
 * Done-test and guardrails are derived deterministically from the record so the
 * contract is never weaker than the registry entry it came from.
 */
export function contractFromRecord(
  record: AgentRecord,
  overrides: Partial<AgentContract> = {},
): AgentContract {
  const base: AgentContract = {
    id: record.agentId,
    version: record.version,
    name: record.name,
    goal: {
      objective: record.objective,
      doneTest: `Review complete when: ${record.objective} — evidence from permitted tools only (${record.capabilitySchema.toolIds.join(", ") || "none"}), conflicting data surfaced, ${record.verificationPolicy} satisfied.`,
    },
    tools: { allowedToolIds: [...(record.capabilitySchema.toolIds ?? [])] },
    instructions: [
      ...(record.constraints.map((c) => `CONSTRAINT: ${c}`)),
      `Domain: ${record.domain}. Role: ${record.role}. Scope: ${record.scope}.`,
      ...(record.permissions.map((p) => `PERMISSION: ${p}`)),
    ],
    context: { required: [], initial: { riskLevel: record.riskLevel } } as AgentContract["context"],
    guardrails: {
      prohibitedActions: [...record.constraints],
      escalateTo: record.parentAgent ?? "hermes_brain",
    },
    stopCondition: {
      maxSteps: 10,
      maxToolCalls: 20,
      timeoutMs: 60_000,
      retryLimit: 2,
      humanCheckpoint: "on-red",
    },
    autonomy: autonomyFromRiskLevel(record.riskLevel),
  };
  return { ...base, ...overrides } as AgentContract;
}