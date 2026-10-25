# SAARATHI — PART-WISE IMPLEMENTATION PLAN

> Source directives merged here (nothing dropped):
> 1. **Correction prompt** — 21 sections (fish removal, real Gesture Vision, status UI, safety, tests).
> 2. **Voice + Brain repair prompt** — sections A–M + FINAL RULE.
> 3. **Saarathi secondary-brain design** — 13 modules, department personas, context graph, clinical pipeline, proactive engine, media studio, OP caller.
>
> ARCHITECTURE RULE THAT OVERRIDES EVERYTHING ELSE:
> **ASTRA = primary clinical/execution brain. SAARATHI = secondary interaction brain.**
> Saarathi never becomes an independent clinical authority.

---

## 0. AUDIT — what already exists (reuse, do not duplicate)

| Capability | Existing asset | Verdict |
|---|---|---|
| Saarathi server routes | `server/saarathi/routes.ts` (`/api/saarathi/health`, `/turn`, `/gesture`) | REUSE |
| Voice policy per dashboard | `src/astra/saarathi/prompt/VoicePolicyProfile.ts` | REUSE |
| Prompt compiler (policy slices, not one giant prompt) | `src/astra/saarathi/prompt/PromptCompiler.ts` | REUSE |
| Command interpreter (orders/RBAC/nav) | `src/astra/saarathi/command/SaarathiCommand.ts` | REUSE |
| Gesture **policy + server gate** | `src/astra/saarathi/gesture/GesturePolicy.ts`, `HoloGestureBridge.ts` | REUSE (policy) / REPLACE (input source) |
| High-risk action guard | `src/astra/saarathi/actions/AstraActionBroker.ts` | REUSE |
| Session memory | `src/astra/saarathi/memory/SessionMemory.ts` | REUSE |
| Voicebox client (health/STT/TTS) | `src/lib/voicebox.ts` | REUSE |
| TTS chain text-first contract | `src/astra/voice/roundTrip/ttsFallback.ts`, `deliverResponse.ts` | REUSE |
| STT/wake detection | `src/astra/voice/roundTrip/wakeDetection.ts`, `microphone.ts` | REUSE |
| Multi-brain fallback chain (server) | `server/ai/providerRegistry.ts` → `aiGatewayChat`, entry `POST /api/ai/chat` | REUSE (single sanctioned entry) |
| Truthful AI provider health | `GET /api/health/ai` (`server/ai/health.ts`) | REUSE |
| Voicebox TTS proxy route | `GET /api/voicebox/audio-proxy` (`server/voice/voiceRoutes.ts`) | REUSE + harden |
| Voicebox `speak` mislabeled "Voicebox-Natural-Neural" | `src/utils/audioAlerts.ts` (`speakHumanVoice`) | FIX |
| `listenHumanSpeech()` browser-only STT | `src/utils/audioAlerts.ts` | FIX (secondary only) |
| False provider status | `src/hooks/useVoicebox.ts` | FIX (truthful status) |

---

## PART 1 — REMOVE BOTH FISH ANIMATIONS (no substitutes)

| # | File | Action |
|---|---|---|
| 1.1 | `src/components/AstraBackground.tsx` | DELETE `drawFish()`, `Fish` interface, `fishes[]`, fish draw loop, `fishSpeed` config |
| 1.2 | `src/components/AvatarOrb.tsx` | DELETE orbiting golden fish SVG block + `fish[]` + `orbitDur` |
| 1.3 | `src/lib/types.ts` | DELETE `AppearanceSettings.fish` + `defaultAppearance.fish` |
| 1.4 | `src/sections/settings/Settings.tsx` | DELETE the "Golden betta fish" toggle; retitle preset description |

Not replaced with another animal animation. Nothing aquatic remains.

## PART 2 — VOICE PIPELINE REPAIR (A–L)

**Failover order (mandatory):**
`Voicebox local → Gemini Live → Browser/OS TTS → text-only HUD`

| # | Deliverable | File |
|---|---|---|
| 2.1 | `TtsProvider` / `SttProvider` unions + truthful `VoiceProviderStatus` | `src/astra/voice/providers/voiceContracts.ts` |
| 2.2 | Settings incl. `allowBrowserVoiceFallback = false` (Settings → Voice → Emergency Browser Voice Fallback) | `src/astra/voice/providers/voiceSettings.ts` |
| 2.3 | Voicebox local speaker (never relabels, structured failure, recovery health) | `src/astra/voice/providers/voiceboxLocal.ts` |
| 2.4 | Gemini Live secondary speaker (honest STANDBY/OFFLINE, Cloud Privacy Gate) | `src/astra/voice/providers/geminiLiveVoice.ts` |
| 2.5 | Browser/OS TTS — LAST RESORT ONLY, gated | `src/astra/voice/providers/browserVoice.ts` |
| 2.6 | `speakSaarathi()` failover chain, text-only final | `src/astra/voice/providers/ttsPriority.ts` |
| 2.7 | STT: MediaRecorder → Voicebox `/transcribe` (Whisper) primary; browser STT explicitly labelled FALLBACK; no hard-coded `en-US` | `src/astra/voice/providers/sttPriority.ts` |
| 2.8 | Route `speakHumanVoice` / `listenHumanSpeech` through the new chain | `src/utils/audioAlerts.ts` |
| 2.9 | Remove silent downgrade + false "Voicebox" labels | `src/utils/audioAlerts.ts`, `src/lib/offlineSpeech.ts` |

## PART 3 — SAARATHI LOCAL INTENT BRAIN (never needs an LLM)

| # | Deliverable | File |
|---|---|---|
| 3.1 | `WHO_ARE_YOU`, `YOUR_NAME`, `WHAT_CAN_YOU_DO`, `HELP`, `STOP/CANCEL/PAUSE/RESUME`, `CURRENT_DASHBOARD`, `VOICE_STATUS`, `SYSTEM_STATUS`, `SELECT_PATIENT`, `OPEN_BED`, `OPEN_DASHBOARD` — EN/TE/HI/Tenglish/Hinglish | `src/astra/saarathi/intent/LocalIntentBrain.ts` |
| 3.2 | Offline guarantee: answers with all model providers down | (same file, zero network imports) |

## PART 4 — ASTRA BRAIN ROUTER (E–I)

| # | Deliverable | File |
|---|---|---|
| 4.1 | `extractModelText()` + `EmptyModelResponseError` + `hasUsableAnswer()` | `src/astra/ai/modelText.ts` |
| 4.2 | `AstraBrainRouter`: real chain FreeLLMAPI → OmniRoute → Ollama → Gemini via `POST /api/ai/chat`; empty/timeout/exception ⇒ next provider; never surfaces "empty answer" | `src/astra/ai/AstraBrainRouter.ts` |
| 4.3 | Frontend checks `response.ok` before `.json()`; never fabricates clinical content on network error | `src/astra/ai/AstraBrainRouter.ts` |
| 4.4 | Delete user-facing "Saarathi heard you, but Astra returned an empty answer." — internal diagnostic only | all call sites |

## PART 5 — TRUTHFUL PROVIDER STATUS HUD (J–K, §14, §19)

| # | Deliverable | File |
|---|---|---|
| 5.1 | `useProviderStatus()` — polls `GET /api/health/ai` + `/api/voice/providers/status`; reports BRAIN / VOICE OUTPUT / VOICE INPUT truthfully; no hard-coded ACTIVE | `src/astra/saarathi/status/useProviderStatus.ts` |
| 5.2 | `SaarathiProviderStatus.tsx` panel (BRAIN · VOICE OUTPUT · VOICE INPUT · current answer/TTS/STT provider) | `src/astra/saarathi/status/SaarathiProviderStatus.tsx` |

## PART 6 — REAL SAARATHI GESTURE VISION (§1–§21)

`src/features/saarathi/gesture/` — camera → MediaPipe 21 landmarks → smoothing → gesture state machine → target manager → Saarathi context → real dashboard response.

| # | File | Role |
|---|---|---|
| 6.1 | `gestureTypes.ts` | `GestureId`, `GesturePhase`, `NormalizedGestureEvent`, `VisionStatus` (OFF/REQUESTING_PERMISSION/LOADING_MODEL/READY/TRACKING/PAUSED/ERROR) |
| 6.2 | `gestureSmoothing.ts` | adaptive EMA / one-euro style smoothing |
| 6.3 | `gestureRecognizer.ts` | POINT, PINCH, OPEN_PALM, FIST, SWIPE_L/R, TWO_HAND_SPREAD, TWO_HAND_MOVE, PALM_HOLD from landmarks |
| 6.4 | `gestureStateMachine.ts` | hysteresis + dwell + cooldown + debounce; `phase START/UPDATE/END/CANCEL` |
| 6.5 | `mediapipeLoader.ts` | lazy `@mediapipe/tasks-vision` loader (npm first, CDN fallback), GPU→CPU delegate fallback |
| 6.6 | `gestureTargetManager.ts` | resolves `data-gesture-target` / `-action` / `-id` under the cursor via real DOM rects |
| 6.7 | `gestureTargetRegistry.ts` | `useGestureTarget()` hook for real Astra components |
| 6.8 | `gestureSafety.ts` | gesture may navigate/select only; consequential actions ⇒ explicit confirmation |
| 6.9 | `useGestureVision.ts` | camera lifecycle, rAF loop, refs for high-frequency data, track disposal |
| 6.10 | `GestureVisionProvider.tsx` | context provider |
| 6.11 | `GestureVisionPanel.tsx` | REPLACES the keyboard-tile "Holo Gesture Bridge" card |
| 6.12 | `GestureSkeleton.tsx` / `GestureCameraPreview.tsx` | real landmark overlay, SKELETON or CAMERA mode |
| 6.13 | `GestureCursor.tsx` | holographic cursor + confidence ring + pinch animation |
| 6.14 | `GestureTargetOverlay.tsx` | edge glow on the focused Astra component |
| 6.15 | Keyboard bindings | demoted to Settings → Accessibility → Keyboard Navigation (internal/debug only) |

## PART 7 — REMAINING SAARATHI PROGRAM (staged, tracked)

| # | Module | Target | Status |
|---|---|---|---|
| 7.1 | 13-module Saarathi core (identity, context, truth sources, speech, conversation, context graph, dashboard awareness, HUD+gesture, command brain, clinical intelligence, proactive, personas, verify/authorize/audit) | `src/astra/saarathi/**` | Parts 2–6 deliver 1,2,3,4,8,9,13; rest staged |
| 7.2 | Department persona table (`SAARATHI PRIME/WELCOME/LEDGER/MEDSAFE/WARD/THEATRE/LAB/VISION`) | `VoicePolicyProfile.ts` extension | staged |
| 7.3 | Context Graph node/edge classes | `src/astra/saarathi/context/ContextGraph.ts` | staged |
| 7.4 | HUD event composer (`hudEvents[]`, `StructuredSaarathiTurn`) | `src/astra/saarathi/hud/HudComposer.ts` | staged |
| 7.5 | Proactive engine (event-bus watchers, factual notifications) | `src/astra/saarathi/proactive/ProactiveEngine.ts` | staged |
| 7.6 | Reception OP queue caller | `src/astra/saarathi/reception/OpQueueCaller.ts` | staged |
| 7.7 | Media Studio + Gemini Notebook connector | `src/astra/saarathi/media/MediaStudio.ts` | staged |
| 7.8 | Clinical superbrain pipeline (Extract→…→Proof+Audit) | routes through existing Astra clinical path | staged |

> Parts 1–6 are the explicitly-demanded corrections and are implemented in this change set.
> Part 7 is the follow-on program; it is listed so nothing is lost.

---

## ACCEPTANCE CRITERIA (§20 tests, mapped)

| Test | Covered by |
|---|---|
| 1 no fish anywhere | Part 1 |
| 2 gesture panel shows OFF, not ACTIVE | 6.11 |
| 3 START HAND CONTROL requests camera | 6.9 / 6.11 |
| 4 preview/skeleton appears | 6.12 |
| 5 Hands 0→1 | 6.9 |
| 6 21 landmarks track | 6.3 / 6.12 |
| 7 index finger moves cursor | 6.3 / 6.13 |
| 8 pinch selects once | 6.4 |
| 9 pinch+move drags | 6.4 / 6.6 |
| 10 two-hand spread zooms | 6.3 |
| 11 swipe changes panel once | 6.4 cooldown |
| 12 hands removed ⇒ TRACKING→READY | 6.9 |
| 13 stop ⇒ stream tracks stopped | 6.9 |
| 14 consequential action still needs confirmation | 6.8 |
| 15 voice + pointing resolves Bed 2 | 6.6 + 6.7 |
| A–I voice/brain failover | Parts 2, 4, 5 |