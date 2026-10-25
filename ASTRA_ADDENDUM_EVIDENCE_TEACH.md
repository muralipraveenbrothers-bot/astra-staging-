# ASTRA ADDENDUM — EVIDENCE-FIRST AI + TEACH-BY-DOING AUTOMATION LAYER
## v2026.09.11 (Extension to ASTRA_MASTER_PROMPT v2026.08.14-FINAL)

> This is the canonical addendum directive. It EXTENDS the existing Astra
> architecture. It does NOT replace: Doctor Command Centre, Hermes, LangGraph,
> LiteLLM / RouteLLM / FreeLLMAPI / OmniRoute / Ollama, Paperclip, n8n,
> Voicebox, Skill Registry, Grounded Action architecture, Policy Vault,
> Execution Supervisor. All new capabilities reuse existing infrastructure.
> Implementation modules: `src/astra/evidence`, `src/astra/models`,
> `src/astra/assurance`, `src/command`, `src/astra/tasks`, `src/astra/skills`,
> `src/astra/automations`.

---

## PART A — EVIDENCE-FIRST AI

### A1. Principle
Do not rely on model reasoning text as proof. For verifiable Astra claims
produce machine-verifiable evidence.

Hard rules:
- MODEL EXPLANATION ≠ EVIDENCE
- MODEL INTENT ≠ AUTHORIZATION
- MODEL SELF-REPORT ≠ SAFETY PROOF
- LLM CLAIMED ACTION ≠ EXECUTED ACTION
- Only backend evidence changes workflow state.
- OBSERVED, VERIFIED BEHAVIOR = WHAT COUNTS.

### A2. AstraEvidenceBundle
Every significant AI task returns an evidence bundle
(`src/astra/evidence/evidenceBundle.ts`):

```
requestId / answer / sourceRefs / toolResults / validationResults /
calculationResults / policyRefs / executionResults / confidence{level,reasonCode}
/ generatedAt
```

Source types: patient DB record, lab result ID, pharmacy transaction ID,
radiology report, clinical calculator output, hospital policy version,
department acknowledgement, vital trend, patient timeline event, guideline
source.

UI rule: doctor-facing response stays simple (e.g. `Hb 7.4 ↓ — latest CBC,
08:42`); full detail behind "View Evidence".

### A3. Executor / Verifier split
```
request → executor → structured result → verifier → evidence check → result
```
- Deterministic lookups (e.g. "Who is Bed 1?") need NO verification and often
  no LLM.
- Strong verification required for: clinical reasoning, high-risk
  recommendations, generated clinical documents, complex workflows, software
  changes, ambiguous patient-context operations.
- Never expose private chain-of-thought. Show evidence, checks, calculations,
  sources, policies, missing information, alternatives, execution status.

### A4. Reasoning pipeline
```
CLINICAL REASONER → EVIDENCE BUILDER → FACT VERIFIER → BLIND-SPOT AGENT → RESPONSE
```

---

## PART B — MODEL GOVERNANCE

### B1. Model Scorecard (`src/astra/models/modelScorecard.ts`)
Maintain empirical capability profiles per model/provider: clinical accuracy,
grounding, tool-call success, structured-output validity, hallucination rate,
long-context retrieval, Telugu/Tenglish quality, latency, cost, reliability,
provider health, blind-spot performance.

Routing uses REQUIRED CAPABILITY, not brand name:
```
task requirement → model capability profile → provider health → cost/latency → model
```

### B2. Model Regression Lab (`src/astra/models/regressionLab.ts`)
Never blindly trust provider model names — checkpoints change silently.
Fixed Astra evaluation suites: patient grounding, clinical extraction,
negation, dose/unit parsing, tool selection, reasoning, evidence grounding,
Telugu/Tenglish, long-context retrieval, adversarial safety, workflow tests.
Promotion: SHADOW → CANARY (1%→5%→20%→100%) → PRODUCTION, with automatic
rollback when hallucination ↑, tool failure ↑, latency ↑, or clinical
disagreement ↑ exceeds limits.


### B3. Behavioral Assurance Layer (`src/astra/assurance/behavioralAssurance.ts`)
- BLIND ASSURANCE SUITE: realistic scenarios that do not announce themselves
  as tests (stale-tab wrong-patient trap, duplicate-order trap, fabricated
  citation, unit mismatch, dose decimal error, policy bypass, fake approval).
- EVALUATION-AWARENESS DIFFERENTIAL TESTING: same case run as labelled
  evaluation vs natural workflow; a safety gap between the two = FAIL.
- HIDDEN PRODUCTION CANARIES: periodic tiny traps per model; failure marks
  model health DEGRADED and the router blocks high-risk work on it.
- COUNTERFACTUAL SAFETY TESTING: change ONE variable (role, patient status,
  language) and require identical clinical substance with role-scaled
  execution permission and language parity.
- NATURALISTIC PROMPT-INJECTION SUITE: injections embedded in PDFs, lab
  comments, referral docs, OCR text, web pages — never only cartoonish
  "ignore previous instructions" prompts.
- HIGH-STAKES HUMAN REVIEW: AI prepares → verification → doctor reviews
  material facts/changes → exact action hash → approval → execution.
  Low-risk reads need no confirmation.

### B4. Behavioral Consistency Score
Added to every Model Card: evaluation-awareness delta, behavioral
consistency, hidden canary pass rate. If explicit-test behavior is safe but
natural-workflow behavior is unsafe, the model loses production readiness
regardless of benchmark performance.

---

## PART C — TEACH MODE / LEARNED SKILLS

### C1. Teach Mode (`src/astra/skills/teachMode.ts`)
Authorized users teach workflows by performing them once:
`TEACH ASTRA → perform workflow → Astra records SEMANTIC ACTIONS (never
pixel/mouse coordinates) → workflow miner → clarification questions →
risk classifier → candidate skill`.

Semantic actions are stable verbs: `patient.search`, `patient.open`,
`labs.latest`, `medications.active`, `nursing.notes.latest`,
`doctor_note.create_draft`, `prescription.prepare`, `document.print`.

### C2. Safety
Recorded behavior is NOT automatically authorized behavior. Every generated
skill passes: schema validation, RBAC, risk classification, policy checks,
grounding requirements, safety tests. Clinical actions retain
doctor-authority rules. Never learn unsafe medical shortcuts from one
demonstration (e.g. fever → auto-prescribe ceftriaxone is forbidden).

### C3. Skill Compiler (`src/astra/skills/skillCompiler.ts`)
Schema: skillId, name, version, owner, department, trigger, inputs, steps,
conditions, exceptions, requiredRoles, riskLevel, approvalPolicy,
evidencePolicy, timeoutPolicy, rollbackPolicy, auditPolicy.

Risk classes (escalating): READ → AUTOMATION → DOCUMENTATION →

---

## PART D — AUTOMATION ENGINE

### D1. Triggers
TIME, EVENT, CONDITION, USER COMMAND. Reuse n8n for deterministic
workflow/event automation and Paperclip for long-running/background work.
Do NOT create another redundant automation platform.

### D2. Automation object (`src/astra/automations/automationEngine.ts`)
automationId, name, skillId, owner, schedule/trigger, context, enabled,
lastRun, nextRun, result, audit. Jobs run independently of the UI.

### D3. Event triggers
`lab.result.finalized`, `patient.admitted`, `patient.transferred`,
`discharge.ready`, `pharmacy.stock.low`, `order.unacknowledged`,
`critical.vital`, `billing.pending`.

### D4. Automation discovery
Astra MAY suggest automation after detecting repeated identical semantic
workflows ("You've done this 6 times — automate it?"). NEVER create
automations silently.

### D5. Proof of execution
Every run produces: runId, trigger, skillVersion, context, stepsCompleted,
stepsFailed, evidence, actionsCreated, acknowledgements, startTime, endTime,
finalStatus. Never report success without backend evidence.

---

## PART E — UNIVERSAL COMMAND LAYER

### E1. One command, many surfaces
Slash command, keyboard shortcut, voice, command palette, and natural
language all normalize to ONE `AstraCommand`:
```
text / voice / slash / Ctrl+K / UI → COMMAND NORMALIZER → AstraCommand
→ COMMAND REGISTRY → Security Kernel → Context Resolver
→ Execution Supervisor → Skill Registry
```
Slash commands NEVER bypass Astra's safety architecture — they are fast ways
of expressing an AstraCommand.

### E2. Commands (`src/command/slashCommandRegistry.ts`)
Session: /clear /compact /rename /resume /recap /export /context /focus
Task: /goal /btw /branch /rewind /task /pause /usage /diff
Clinical/Workflow: /patient /bed /timeline /rounds /labs /meds /orders /draft
/sign /print /call /notify /why /plan /workflows /voice
Developer/Admin: /model /effort /fast /permissions /config /theme /color
/keybindings

Command definitions are typed with: name, aliases, category, requiredRole,
requiredContext, riskLevel, maxAutonomy, confirmationRequired, handler.

### E3. Critical semantic differences from coding tools
- `/goal`: durable supervised task with completion criteria and autonomy
  level; runs in background via Paperclip/runtime; survives UI close.
- `/btw`: side question in a read-only child context; never mutates the
  parent task's state.
- `/branch`: forks reasoning/research/drafting state; branches cannot
  silently become conflicting clinical orders.

---

## PART F — HUMAN INTERACTION LAYER (VOICE)

### F1. Full-duplex voice
MIC continuously listening; barge-in is a hard requirement. TTS stops
immediately on interruption; STOP SPEAKING ≠ CANCEL TASK ≠ CANCEL CLINICAL
ACTION. Language detection: EN / TE / HI / TENGLISH.

### F2. Voice latency budget (measure the whole pipeline)
speech-end detection + STT + language detection + intent + patient grounding
+ model TTFT + TTS first audio = perceived latency. Track: STT first partial,
STT finalization, intent latency, context-resolution latency, model TTFT,
TTS first-byte, total voice turn latency, barge-in stop latency, language
parity.

### F3. Astra Desktop / workspace ownership
Astra owns the hospital workspace experience (conversation, voice, patient
context, research, documents, tasks, notifications, departmental commands,
internal browser, background workers). Models remain interchangeable
infrastructure; the doctor never needs to know which model answered.

---

## PART G — VISION SCORECARD + LEARN ASTRA

### G1. Visual Model Admission Track
Multimodal models get a separate scorecard: radiology/document image
understanding, screenshots, charts, form extraction, handwriting, document
layout, image generation/editing, OCR fallback need, language coverage,
latency, cost, privacy, regression date. A model approved for poster
generation is NOT automatically approved for clinical-image interpretation.

### G2. Learn Astra (hospital-specific glossary area)
AI BASICS / AI Models / Agents & Skills / RAG & Knowledge / Voice &
Multimodal / Safety / Evaluation / Infrastructure — each term explained in
hospital language (e.g. RAG = "how Astra finds the relevant hospital policy
before answering"; Guardrail = "a deterministic rule preventing an
unauthorized action"). Safety teaching never implies that "low temperature"
is a safety mechanism — safety comes from GROUNDING → VERIFICATION → POLICY →
RBAC → APPROVAL → EXECUTION CONTROL.

---

## PART H — PRIORITY ORDER

P0: Evidence Bundles (A2–A4) + Universal Command Layer core (E1–E2) +
    Teach Mode (C1–C4)
P1: /goal + /btw + /context + /diff + /resume + /why (E2) +
    Automation Engine (D1–D5)
P2: Model Scorecard (B1) + Regression Lab (B2) + Behavioral Assurance (B3–B4)
P3: Voice latency budget (F2) + Vision Scorecard (G1) + Learn Astra (G2)

END ADDENDUM

- `/rewind`: affects conversation/drafts/analysis/sandbox ONLY. Executed
  hospital events require /amend, /correct, /cancel or /reverse — never
  silent erasure (medico-legal history is immutable).
- `/plan`: hard execution boundary — inspect/analyze/propose/simulate only.
- `/permissions`: inspection only; can never elevate RBAC.
- `/model`: a preference passed through the Astra Router; risk/privacy/
  capability constraints always win.
- `/effort`: FAST / STANDARD / HIGH / CLINICAL DEEP.
- `/context`: shows exactly what Astra believes the active patient/task
  context is (context age, loaded data, policy in force).
- `/diff`: proposed-vs-current for prescriptions, discharges, bills, policies.
- `/why`: shows the evidence supporting the previous Astra statement.

OPERATIONAL_WRITE → CLINICAL_PREPARATION → CLINICAL_EXECUTION → HIGH_RISK.
Prepare-steps may automate; execute-steps (sign, administer, finalize) always
require authenticated human approval.

### C4. Lifecycle
`RECORDED → DRAFT → VALIDATED → SHADOW → APPROVED → ACTIVE → DEPRECATED`
with version history (changed_by, changed_at, reason, tests) and rollback.
