# Astra Brain Flow

The Round 2 brain path is implemented by `server/brain/astraBrainFlow.ts`.
It wires the existing components without replacing them:

`Input -> Safety/Identity -> Laya -> Context Compiler -> LangGraph master -> Hermes -> Specialist Dispatcher / Astra 7D -> Tool Registry -> Flight Recorder`

## Master Paths

- Laya remains a bounded decision layer. It returns structured verdicts, confidence for routing only, and `UNKNOWN`, `INSUFFICIENT_INFORMATION`, or `REQUIRES_HUMAN_REVIEW` when the text is not safe to decide.
- `server/brain/langGraphMaster.ts` is the master clinical workflow. Other LangGraph surfaces should route into this case spine instead of creating a competing clinical state machine.
- `server/brain/hermesCortex.ts` is the shared Hermes execution path for brain requests. It assigns work, integrates specialist output, and does not duplicate existing 7D or command behavior.
- `server/brain/sevenDWrap.ts` calls the existing Astra 7D engine and returns its D1-D7 structure unchanged.
- The Tool Registry sees only relevant tool cards from the Context Compiler. Read tools can run through the existing executor; write or clinical-risk tools stop for approval.

## Events And Trace

Each stage emits an `ASTRA_BRAIN_EVENT` on the EventBus with the same `correlationId`.
The flow result also returns the same trace for tests and local debugging.
Clinical action does not proceed autonomously past human approval gates.

## Synthetic Fixture

The orchestration test uses a non-PHI fixture:

`55-year-old woman lower back pain radiating to the right lower limb`

The test checks routing, 7D invocation, missing-data questions, structured output, and absence of a hardcoded diagnosis.
