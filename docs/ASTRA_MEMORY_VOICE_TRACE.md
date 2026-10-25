# ASTRA — Memory + Voice + Flight Recorder (prompt 06)

Round-2 wiring for three subsystems that already had Part 5 rules but no live
seam. Nothing here invents a provider, a token count or a transcript.

## 1. Flight Recorder — `src/astra/brain/part5/trace.ts`

One correlation id follows the request, and the recorder stores **measured**
spans, not a stage list.

- `beginTrace(seed)` — opens the request trace (also `current`).
- `beginTraceFor(correlationId)` — opens a background trace keyed by the id its
  caller already owns (LangGraph / Hermes flow) without stealing `current`.
- `recordSpan({kind, name, latencyMs, ok?, detail?, model?, tokens?, correlationId?})`
  — one really executed step. `kind` is one of `request, voice, laya, memory,
  langgraph, hermes, sevenD, model, tool, browser, approval, error`.
- Shortcuts: `recordModelCall`, `recordToolCall`, `recordBrowserAction`,
  `recordApproval`, `recordError`, `recordMemorySpan`.
- `endTrace()` / `endTraceFor(id)`, `reconstructTrace(id)`, `listTraceIds()`,
  `resetTraceStore()`.

Honesty rules enforced in code:

| Rule | Behaviour |
| --- | --- |
| Timings | `Date.now()` deltas on the real call, never an estimate. |
| Tokens | Summed **only** from spans where the caller/gateway reported them; otherwise `tokens: null`. |
| Cost | Always `null` — no price table is claimed. |
| Scrubbing | `freellmapi-*`, `sk-*` → `[redacted]`; `UHID/MRN/IP no/bed <n>` → `[id]`. |
| PHI | `phiInTelemetry: false` and `phi: "excluded"` on every span; span details carry lengths and labels, not patient text. |
| Unknown id | `reconstructTrace("never")` returns `found: false` with empty steps — no invented history. |

History is bounded (200 traces, FIFO).

## 2. Memory Fabric — `src/astra/brain/part5/memoryFabric.ts`

`memoryFabric` (`classedMemoryFabric`) is the single seam over the existing
classed store in `./memory`. Mem0 / MemGraph / pgvector / Qdrant are reported as
`degraded` / `not installed` — the seam exists so they can be added later without
touching a call site.

Scopes: `working, encounter, patient, user, procedural, organizational, evidence`.
Legacy persisted scopes are normalised, not rewritten: `workflow → working`,
`agent → procedural`, `hospital → organizational`, `session → working`,
`case → encounter`.

- `gates(text)` — Laya's memory gates in one object: recall/store verdicts,
  class, scope, sensitivity, verification state and the expiry **declared as a
  policy default** (`{duration, expiresAt, source: "policy default"}`).
- `recall({text, patientId, scopes, limit})` — structured Astra database first.
  A clinical utterance (`needsRecall === "YES"`) with **no exact patient id** is
  refused and returns zero records with a reason; a patient id never widens the
  scope for another patient; `semanticUsed: false` and
  `structuredOutranksSemantic: true` are part of the payload.
- `store(input)` — normalises the scope, then defers to `storeMemory`
  (secrets rejected, `AI INFERENCE` never stored as verified, PHI + patient
  scope requires an exact patient id).
- `why(record, query)` and `status()` — retrieval explanation and live fabric
  status (`providers`, `clinicalScopeRule`, scope counts).
- `renderRecallForPrompt(recall)` — the labelled, non-authoritative block that
  is actually injected into the model prompt.

## 3. Voice — `src/astra/brain/part5/voicePipeline.ts`

Pipeline: `audio → local STT (Voicebox/Whisper) → raw transcript → Laya intent →
Astra EventBus → response → local TTS (Voicebox)`.

`runVoiceTurnPipeline(input, deps)` takes every transport as an injected
dependency (`stt`, `respond`, `tts`), so the live server and the synthetic tests
run the same stage list and a missing transport is reported as
`VOICEBOX_STT_UNAVAILABLE` / `NO_RESPONDER` instead of being simulated. Every
stage is also written to the Flight Recorder as a `voice` span.

- `refineTranscript(raw)` — whitespace, sentence case, terminal punctuation only.
  `keepTranscripts(raw, refined)` keeps the pair with `rawPreserved: true`.
- `recordTranscriptPair(...)` / `voiceTranscripts()` — raw and refined text are
  stored side by side and labelled as such. Persistence can be switched off with
  `ASTRA_VOICE_TRANSCRIPT_STORE=false`; the result then says
  `persistence: {stored: false, reason: "...disabled..."}`.
- `astra.voice.transcript` / `astra.voice.response` are published on the EventBus
  with `privacyClass` `PHI`/`INTERNAL` and payloads that carry **lengths**, never
  text (the bus flight recorder stays PHI-free by construction).
- `NOT ADDRESSED TO ASTRA` (side conversation) → `silent: true`, no brain call,
  no spoken answer.
- `voiceboxHealth()` — real probe of `ASTRA_VOICEBOX_URL` or
  `http://127.0.0.1:17493`; unreachable is `OFF`, never "ready".
- `authorization: {voiceIsAuthorization: false, authority: "role-based only"}` —
  voice is input, never authorization.

## Live wiring

| Path | What it does |
| --- | --- |
| `POST /api/saarathi/turn` | Memory gates + scoped recall + `memory` span + `astra.memory.recall` event; the recall block is injected into the orchestrator prompt; recalls a patient memory only for the exact id supplied; stores patient-reported information through the fabric with the policy expiry; records request/Laya/model/7D/tool/error spans; returns `memory` and `flightRecorder`. |
| `POST /api/brain/flow` | `beginTraceFor(correlationId)` plus spans for request, Laya, LangGraph, Hermes, 7D, every read tool and a pending-approval span; the result carries `flightTrace`. |
| `GET /api/brain/trace` | Current trace, optional `?correlationId=` reconstruction, known ids, brain tool trace, Mem0 state. |
| `GET /api/brain/trace/:correlationId` | Full reconstruction (404 when the id is unknown). |
| `POST /api/brain/memory` | Fabric recall (`memories`, `recall`, `prompt`, `gates`, fabric status) or fabric store with the gate expiry. |
| `GET /api/brain/voice/health` | Voicebox probe. |
| `GET /api/brain/voice/transcripts` | Authenticated raw/refined transcript pairs with the privacy note. |
| `POST /api/brain/tools/run`, `POST /api/brain/browser` | Tool span / browser span (`api-first`) keyed by the request correlation id. |
| `POST /api/voice/transcribe` | STT span with the measured latency; returns `text` (raw, unchanged for existing clients), `rawTranscript`, `refinedTranscript`, `intent`, `correlationId`; records the transcript pair. |
| `POST /api/voice/conversation` | Voice spans for audio/STT/raw transcript/Laya intent/model/TTS, the transcript pair, `astra.voice.*` events, `correlationId` on the SSE payloads. |

## Tests

`server/brain/part5MemoryVoiceTrace.spec.ts` (14 synthetic tests) covers the
measured spans, token honesty, scrubbing, background vs current traces, scope
normalisation, refusal without a patient id, no cross-patient recall, non-clinical
scope recall, inference refusal, the STT-unavailable path, the full chain with
injected transports, PHI-free bus payloads, the silence rule, persistence off and
the Voicebox probe. Run:

```
npx vitest run server/brain/part5MemoryVoiceTrace.spec.ts server/brain/part5.spec.ts server/astraEventBus.spec.ts
npx tsc --noEmit -p tsconfig.astra-check.json
```

## Not done (deliberately)

- No Mem0 / MemGraph / pgvector / Qdrant adapter and no semantic recall: the
  status reports them as missing.
- No token accounting is claimed for providers that do not return usage.
- Voicebox STT/TTS still run on the local runtime only; the server reports
  availability rather than substituting a cloud voice.

