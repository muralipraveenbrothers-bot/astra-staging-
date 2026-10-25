/**
 * ASTRA AI — Agent Operating Framework: Tests
 * ============================================================================
 * Covers the framework subsystems + the full Bed-3 deterioration scenario.
 */

import { describe, it, expect } from "vitest";
import { assessAgentNecessity, assessForRequest, cheapestSurface } from "./necessityGate";
import { classifyAction, permissionForAutonomy } from "./permissionLadder";
import { createBudget, checkBudget, tickStep, outcomeForStop } from "./stopConditions";
import { LoopDetector, fingerprint } from "./loopDetector";
import { autopsy } from "./failureAutopsy";
import { contractFromRecord, autonomyFromRiskLevel } from "./specCard";
import { runAgentContract, AgentRuntime, Decision } from "./agentOperatingSystem";
import type { AgentRecord } from "../core/AgentDefinition";

describe("necessityGate (§33 — intelligence over activity)", () => {
  it("requires an agent only when all three conditions hold", () => {
    const a = assessAgentNecessity({ needsDynamicStep: true, needsExternalAccess: true, selfDecidesCompletion: true });
    expect(a.needsAgent).toBe(true);
    expect(a.verdict).toBe("AGENT");
    expect(cheapestSurface(a)).toBe("AGENT");
    const b = assessAgentNecessity({ needsDynamicStep: false, needsExternalAccess: true, selfDecidesCompletion: false });
    expect(b.needsAgent).toBe(false);
    expect(cheapestSurface(b)).toBe("TOOL_CALL");
  });

  it("prefers a direct answer for a trivial query", () => {
    expect(cheapestSurface(assessForRequest("what is 2 + 2", false))).toBe("DIRECT_ANSWER");
  });

  it("flags a deterioration investigation as agent-worthy", () => {
    expect(assessForRequest("bed 3 looks worse, assess trajectory and vitals", true).needsAgent).toBe(true);
  });
});

describe("permissionLadder (§17 GREEN/AMBER/RED)", () => {
  it("classifies verbs onto the ladder", () => {
    expect(classifyAction("Retrieve latest vitals")).toBe("GREEN");
    expect(classifyAction("Repeat ABG/lactate")).toBe("AMBER");
    expect(classifyAction("Delete patient record")).toBe("RED");
  });

  it("intersects the ladder with the autonomy grant", () => {
    expect(permissionForAutonomy("GREEN", "READ_ONLY")).toBe("allow");
    expect(permissionForAutonomy("AMBER", "READ_ONLY")).toBe("block");
    expect(permissionForAutonomy("RED", "READ_ONLY")).toBe("block");
    expect(permissionForAutonomy("AMBER", "APPROVAL_REQUIRED")).toBe("approval");
    expect(permissionForAutonomy("GREEN", "AUTONOMOUS")).toBe("allow");
  });
});

describe("stopConditions (§21)", () => {
  it("honours step limits and reports honestly", () => {
    const b = createBudget({ maxSteps: 2, maxToolCalls: 5, timeoutMs: 10_000, retryLimit: 1, humanCheckpoint: "on-red" });
    tickStep(b);
    expect(checkBudget(b).exhausted).toBe(false);
    tickStep(b);
    expect(checkBudget(b).reason).toBe("STEP_LIMIT");
  });

  it("never fabricates completion", () => {
    expect(outcomeForStop("STEP_LIMIT", false, 3)).toBe("PARTIALLY_COMPLETED");
    expect(outcomeForStop("STEP_LIMIT", false, 0)).toBe("MISSING");
    expect(outcomeForStop("DONE", true, 5)).toBe("COMPLETED");
  });
});

describe("loopDetector (§22)", () => {
  it("stops on repeated identical states", () => {
    const ld = new LoopDetector(3);
    const fp = fingerprint("tool", "getPatientContext", { bed: "3" });
    expect(ld.record(fp, false)).toBe(false);
    expect(ld.record(fp, false)).toBe(false);
    expect(ld.record(fp, false)).toBe(true);
  });

  it("resets when new evidence arrives", () => {
    const ld = new LoopDetector(3);
    const fp = fingerprint("tool", "getPatientContext", { bed: "3" });
    ld.record(fp, false);
    ld.record(fp, true);
    expect(ld.record(fp, false)).toBe(false);
  });
});

describe("failureAutopsy (§23)", () => {
  it("classifies root causes instead of blind retrying", () => {
    expect(autopsy(new Error("Permission denied: role NURSE cannot submit orders")).primaryCause).toBe("PERMISSION_FAILURE");
    expect(autopsy(new Error("connect ECONNREFUSED to 127.0.0.1:3001")).primaryCause).toBe("UNAVAILABLE_SERVICE");
    expect(autopsy(new Error("no such tool: prescribe_medication")).primaryCause).toBe("MISSING_TOOL");
  });
});
//__PART2__

describe("specCard / contractFromRecord", () => {
  const record: AgentRecord = {
    agentId: "tox_command", name: "Tox-Command", version: "1.0.0", level: "SPECIALIST",
    parentAgent: "hermes_brain", domain: "Toxicology", role: "Emergency Toxicology & Antidotes",
    objective: "Identify toxidrome, severity and immediate threats from exposure history and vitals.",
    scope: "Emergency department", constraints: ["cannot prescribe autonomously"], permissions: ["ai:toxicology"],
    riskLevel: "HIGH_RISK", perceptionSchema: {}, capabilitySchema: { toolIds: ["checkDrugInteraction"] },
    learningExamples: [], knowledgeSources: ["PoisonsInfo"], memoryPolicy: "SESSION_ONLY",
    modelPolicy: "ADVANCED_REASONING", verificationPolicy: "UNIVERSAL_VERIFIER_STRICT",
    outputSchema: {}, status: "ACTIVE", health: 100,
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  };

  it("derives a six-block contract from an AgentRecord", () => {
    const c = contractFromRecord(record);
    expect(c.id).toBe("tox_command");
    expect(c.tools.allowedToolIds).toEqual(["checkDrugInteraction"]);
    expect(c.guardrails.prohibitedActions).toContain("cannot prescribe autonomously");
    expect(c.guardrails.escalateTo).toBe("hermes_brain");
    expect(c.autonomy).toBe("APPROVAL_REQUIRED");
  });

  it("maps risk levels to conservative autonomy", () => {
    expect(autonomyFromRiskLevel("INFO")).toBe("READ_ONLY");
    expect(autonomyFromRiskLevel("REVERSIBLE")).toBe("RECOMMEND_ONLY");
    expect(autonomyFromRiskLevel("HIGH_RISK")).toBe("APPROVAL_REQUIRED");
  });
});

describe("runAgentContract — universal execution protocol (16-step)", () => {
  const toolResults: Record<string, unknown> = {
    getPatientContext: {
      ok: true,
      data: {
        bed: "3", name: "Mr X", age: 56, sex: "M", ip: "IP1234", admission: "severe pneumonia",
        now: { bp: "92/58", hr: 122, spo2: "91% on 6 L", urineOutputMlHr: 20 },
        ago6h: { bp: "118/74", hr: 94, spo2: "96% on 2 L", urineOutputMlHr: 55 },
        creatinine: "1.1→1.5→2.2", crp: "95→146→220", lactate: 3.9,
      },
    },
    getChestXray: { ok: true, data: { finding: "worsening bilateral infiltrates; no bleeding" } },
  };
  const subAgentOutputs: Record<string, string> = {
    clinical_reasoning_agent:
      "Hypotheses: sepsis progression/septic shock (0.55); worsening pneumonia with respiratory failure (0.35); hypovolemia (0.3); AKI secondary to sepsis (0.4) — none final.",
    vent_brain: "Progressive hypoxemic respiratory compromise: O2 need 2L→6L; SpO2 96→91; coupling with falling urine output suggests multi-organ strain. O2 need 2L.",
    drug_safety_agent: "Review current medication: renal clearance implications; no allergy flag in context.",
    clinical_blind_spot_agent:
      "Consider pulmonary embolism. Consider occult bleeding. Check sedative/opioid administration. Check fluid balance.",
  };
  const runtime: AgentRuntime = {
    async callTool(toolId) {
      const out = toolResults[toolId];
      if (!out) throw new Error(`no such tool: ${toolId}`);
      return out;
    },
    async callSubAgent(agentId) {
      const out = subAgentOutputs[agentId];
      if (!out) throw new Error(`sub-agent unavailable: ${agentId}`);
      return { ok: true, agentId, output: out };
    },
  };
  //__PART3__

  it("runs the full bed-3 deterioration loop and stops on the done-test", async () => {
    let plan: Decision[] = [
      { kind: "tool", toolId: "getPatientContext", input: { bed: "3" } },
      { kind: "subagent", agentId: "clinical_reasoning_agent", task: "rank hypotheses for bed 3" },
      { kind: "subagent", agentId: "vent_brain", task: "evaluate respiratory trajectory" },
      { kind: "subagent", agentId: "drug_safety_agent", task: "screen medication for renal/airway risk" },
      { kind: "tool", toolId: "getChestXray", input: { bed: "3", reason: "blind-spot: PE/infiltrates" } },
    ];
    const result = await runAgentContract(
      {
        id: "bed3-deterioration-watch",
        version: "1.0.0",
        name: "Deterioration Watch (Bed 3)",
        goal: {
          objective: "Determine whether the Bed 3 patient is deteriorating, the likely reason, immediate threats, and next useful actions.",
          doneTest: "Trends reviewed, hypotheses ranked, targeted imaging looked up, AMBER actions prepared, validated.",
        },
        tools: { allowedToolIds: ["getPatientContext", "getChestXray"] },
        instructions: ["Do not execute treatment. Prepare AMBER, require clinician approval."],
        context: { required: ["bed", "patient context"] },
        guardrails: { prohibitedActions: ["administer medication", "perform physical treatment"], escalateTo: "hermes_brain" },
        stopCondition: { maxSteps: 12, maxToolCalls: 8, timeoutMs: 15_000, retryLimit: 1, humanCheckpoint: "on-amber" },
        autonomy: "APPROVAL_REQUIRED",
      },
      "ASTRA, check bed 3. Patient looks worse. Tell me what is happening.",
      { userRole: "DOCTOR", requestedBy: "dr-rana" },
      {
        runtime,
        hooks: {
          decide(state) {
            if (plan.length === 0) {
              for (const d of [
                "Notify responsible clinician for urgent review",
                "Repeat ABG/lactate",
                "Request CBC/RFT/electrolytes",
                "Collect blood cultures if not already obtained",
                "Review antimicrobial coverage",
                "Assess fluids/hemodynamics",
                "Escalate for ICU review",
                "Monitor SpO2/BP/UO continuously",
              ]) {
                state.preparedActions.push({
                  description: d, permission: "GREEN", prepared: true, executed: false, requiresApproval: false,
                });
              }
              return { kind: "done" };
            }
            return plan.shift()!;
          },
          reassess(state, observation) {
            const s = observation.summary;
            if (s.includes("O2 need 2L")) {
              state.deltas.push({
                previous: "hypovolemia plausible as primary driver",
                newEvidence: "O2 requirement escalated 2L→6L while SpO2 fell",
                updated: "sepsis-related deterioration with respiratory compromise now primary",
                why: "vent_brain trajectory outweighed the fluid-first hypothesis",
              });
            }
            if (s.includes("creatinine")) {
              state.deltas.push({
                previous: "single-point lab view",
                newEvidence: "creatinine 1.1→1.5→2.2 (progressive renal deterioration)",
                updated: "evolving AKI secondary to sepsis/hypoperfusion",
                why: "temporal trend over an isolated value",
              });
            }
          },
          doneTest(state) {
            const sources = state.observations.map((o) => o.source);
            return sources.includes("getChestXray") && state.preparedActions.length > 0;
          },
          blindSpot() {
            return subAgentOutputs.clinical_blind_spot_agent.split(/[.;]\s*/).filter(Boolean).slice(0, 3);
          },
          validator() {
            return { verdict: "PASS", passedCount: 8, checks: ["patient-match", "units", "red-flags", "no-unsupported-order"] };
          },
          consensus() {
            return {
              verdict: "CONSENSUS", confidence: "HIGH",
              detail: "sepsis-related deterioration with circulatory, respiratory and renal dysfunction; cardiopulmonary causes remain possible",
            };
          },
        },
      },
    );

    expect(result.outcome).toBe("COMPLETED");
    expect(result.stopReason).toBe("DONE");
    expect(result.report.unresolved.join(" ").toLowerCase()).toContain("pulmonary embolism");
    expect(result.deltas.length).toBeGreaterThan(0); // course correction happened
    expect(result.preparedActions.every((a) => a.executed === false)).toBe(true);
    expect(result.preparedActions.filter((a) => a.requiresApproval).length).toBeGreaterThanOrEqual(4);
    expect(result.verification?.verdict).toBe("PASS");
    expect(result.consensus?.verdict).toBe("CONSENSUS");
    const phases = result.trace.map((t) => t.phase);
    for (const p of ["BLIND_SPOT", "VALIDATE", "CONSENSUS", "PERMISSION", "DONE"]) {
      expect(phases).toContain(p);
    }
  });
  //__PART4__

  it("structurally refuses tools outside the contract (§20)", async () => {
    const result = await runAgentContract(
      {
        id: "sandbox", version: "1.0.0", goal: { objective: "x", doneTest: "never true" },
        tools: { allowedToolIds: ["getPatientContext"] }, instructions: [], context: { required: [] },
        guardrails: { prohibitedActions: [] }, stopCondition: { maxSteps: 4, humanCheckpoint: "never" },
        autonomy: "READ_ONLY",
      },
      "hi", {},
      { runtime, hooks: { decide: () => ({ kind: "tool", toolId: "delete-patient-db", input: {} }) } },
    );
    expect(result.stopReason).toBe("SAFETY_STOP");
    expect(result.outcome).toBe("BLOCKED");
  });

  it("budgets stop runaway loops with an honest PARTIALLY_COMPLETED report", async () => {
    const result = await runAgentContract(
      {
        id: "loop", version: "1.0.0", goal: { objective: "x", doneTest: "never true" },
        tools: { allowedToolIds: ["getPatientContext"] }, instructions: [], context: { required: [] },
        guardrails: { prohibitedActions: [] }, stopCondition: { maxSteps: 2, humanCheckpoint: "never" },
        autonomy: "READ_ONLY",
      },
      "hi", {},
      { runtime, hooks: { decide: () => ({ kind: "tool", toolId: "getPatientContext", input: { bed: "3" } }) } },
    );
    expect(result.stopReason).toBe("STEP_LIMIT");
    expect(result.outcome).toBe("PARTIALLY_COMPLETED");
  });
});