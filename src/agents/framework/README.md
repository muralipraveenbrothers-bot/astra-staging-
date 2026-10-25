# ASTRA Agent Operating Framework (AAOF)

Lives in `src/agents/framework/`. Implements the **[ASTRA Universal Agent Intelligence Constitution v2](../../../ASTRA-AGENT-CONSTITUTION.md)** and the **16-Step Intelligent Agent Framework** as typed, testable, runtime-agnostic code.

## Core idea

> An agent is a GOAL-DIRECTED LOOP, not a chatbot: **Goal → Decide → Act → Observe → Reassess → Continue/Stop.** The framework is the loop; your LLM/orchestrator supplies the hooks (`decide`, `reassess`, `doneTest`, …).

## Files

| File | Constitution § |
|---|---|
| `types.ts` | Six-block `AgentContract`, trace/hypothesis/report types |
| `agentOperatingSystem.ts` | `runAgentContract()` — the 16-step universal runner |
| `permissionLadder.ts` | §17 GREEN/AMBER/RED + §20 minimum privilege |
| `stopConditions.ts` | §21 budgets: steps, tool calls, time, retries + honest reports |
| `loopDetector.ts` | §22 repeated-state detection |
| `failureAutopsy.ts` | §23 failure classification + recommended fix |
| `necessityGate.ts` | §33 3-question "does this need an agent?" gate |
| `specCard.ts` | Machine-readable Spec Card + `contractFromRecord()` bridge for the ~300 registered agents |
| `executionTrace.ts` | §24 §26 §27 trace with hypothesis versioning |
| `agentOperatingSystem.spec.ts` | Tests incl. the Bed-3 deterioration scenario |

## 16 steps → runner phases

`GOAL → CONTEXT → PLAN → DECIDE → ACT → OBSERVE → REASSESS → BLIND_SPOT → VALIDATE → CONSENSUS → PERMISSION → DONE`

Every step is recorded on the trace (auditable); hypotheses update with `HypothesisDelta` (`previous`, `newEvidence`, `updated`, `why`); the run terminates on the done-test **or** a budget/loop/safety stop and returns an honest `CompletionReport` — never a fabricated completion.

## Usage

```ts
import { runAgentContract, buildSpecCard, contractFromRecord } from "./framework";

const contract = contractFromRecord(myAgentRecord); // six-block from existing record
const result = await runAgentContract(contract, request, context, {
  runtime: { callTool, callSubAgent },          // your runtime's tools/agents
  hooks: { decide, doneTest, reassess, blindSpot, validator, consensus },
});
console.log(buildSpecCard(contract));           // machine-readable card
console.log(result.report, result.preparedActions);
```

## Permission model

- `GREEN` (read/analyse/calculate/summarise/prepare) → autonomous
- `AMBER` (orders, external comms, discharge…) → **prepared but requires approval**
- `RED` (delete/grant/sign/spend…) → **never executed by the framework**

`permissionForAutonomy()` intersects the ladder with the agent's `AutonomyLevel` (start `READ_ONLY`, raise only with evidence — §15 "start controlled"). The runner also **structurally refuses** any tool call not in `contract.tools.allowedToolIds` — prompts are not security.

## Runtime agnosticism

Hermes, LangGraph, OpenHands, Paperclip and Agent Zero are treated as **runtimes**. Contracts + skills stay portable: the same `clinical_reasoning` contract can execute on Hermes today and another runtime tomorrow without rebuilding medical rules.