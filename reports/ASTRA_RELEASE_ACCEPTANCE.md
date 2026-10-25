# ASTRA Release Acceptance

Generated: 2026-09-27

## Classification

**NOT_READY**

READY is not allowed because mandatory release-candidate commands failed: `npm run lint`, `npm run build`, and `npm run stack:preflight`. The unified ASTRA verifier itself passed all required gates with one optional n8n warning.

## Command Results

| Command | Result | Notes |
| --- | --- | --- |
| `npm ls --depth=0` | PASS | Dependency validation only; no install was run. Reported extraneous packages but exit code was 0. |
| `npm run typecheck:server` | PASS | `tsc --noEmit -p tsconfig.server.json` passed. |
| `npm run lint` | FAIL | `tsc -b` fails on existing Sanjeevani/test typing and tool contract errors. |
| `npm test` | PASS | 54 files, 526 tests passed. |
| `npm run stack:contract` | PASS | 2 files, 41 tests passed. |
| `npm run stack:preflight` | FAIL | Required check failed: `litellm[proxy] importable`. |
| `npm run build` | FAIL | Fails during `tsc -b` on the same TypeScript errors as lint. |
| `npx playwright test` | FAIL | Tried to fetch `playwright` from npm and failed with `EACCES` under restricted network/cache permissions; no install was performed. |
| `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-astra.ps1` | PASS_WITH_WARNING | 40 PASS, 0 FAIL, 1 WARN, exit 0. Optional n8n health check warned with `ECONNREFUSED`. |

## Final Component Table

| COMPONENT | WIRED | HEALTHY | TESTED | FALLBACK | BLOCKER |
| --- | --- | --- | --- | --- | --- |
| Astra API :3000 | YES | YES | YES | Start via `start-astra-api.cmd` / PM2 | None in unified verifier |
| UI :5173 | YES | YES | YES | Start via `start-astra-vite.cmd` / PM2 | Full build blocked by TypeScript errors |
| JSON hospital store | YES | YES | YES | Restore from backups if corrupt | None; not modified |
| Saarathi | YES | YES | YES | Restart Astra API | None in unified verifier |
| Voicebox :17493 | YES | YES | YES | `scripts\start-voicebox-server.ps1` | None in unified verifier |
| FreeLLMAPI :31415 | YES | YES | YES | OmniRoute -> Ollama | None in unified verifier |
| OmniRoute :20128 | YES | YES | YES | Ollama local | None in unified verifier |
| Ollama :11434 | YES | YES | YES | Fail closed for PHI if unavailable | None in unified verifier |
| Laya :8791 | YES | YES | YES | Low-confidence fallback | None in unified verifier |
| Hermes | YES | YES | YES | Diagnostic restraint / structured failure | None in unified verifier |
| LangGraph | YES | YES | YES | Checkpoint/resume path | None in unified verifier |
| D1-D7 | YES | YES | YES | Synthetic case validation | None in unified verifier |
| Scientist / skills | YES | YES | YES | Structured source failures | None in unified verifier |
| Tool Registry -> plugins | YES | YES | YES | R2/R3/R4 authorization gates | None in unified verifier |
| Internal Browser -> Service Registry | YES | YES | YES | API-first routing fallback | None in unified verifier |
| Memory Fabric | YES | YES | YES | Scoped recall/store gates | None in unified verifier |
| Flight Recorder | YES | YES | YES | Secret-scrubbed local spans | None in unified verifier |
| Dashboards -> live health APIs | YES | YES | YES | Health API degradation states | None in unified verifier |
| n8n :5678 | OPTIONAL | WARN | YES | Start `start-n8n.cmd` when needed | Offline optional extension |

## Blocking Errors To Clear

`npm run lint` and `npm run build` fail with existing TypeScript errors in:

- `src/__tests__/sanjeevaniEventListener.test.ts`
- `src/__tests__/sanjeevaniOverlayLanguagePersona.test.ts`
- `src/agents/specialists/SanjeevaniConfirmationAgent.ts`
- `src/agents/specialists/SanjeevaniEventListener.ts`
- `src/agents/specialists/SanjeevaniReasoningAgent.ts`
- `src/astra/brain/part3/surgery.ts`
- `src/astra/plugins/layaDecision.spec.ts`
- `src/plugins/sanjeevaniVoicePlugin.ts`

`npm run stack:preflight` fails on:

- `litellm[proxy] importable`

## Reboot Verification Commands

```powershell
npm ls --depth=0
pm2 resurrect
pm2 status
npm run typecheck:server
npm test
npm run stack:contract
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-astra.ps1
```

If PM2 state does not restore services:

```powershell
.\start-astra-api.cmd
.\start-astra-vite.cmd
.\start-freellmapi-server.cmd
.\scripts\start-omniroute-external.cmd
.\scripts\start-voicebox-server.ps1
python server/plugins/astra_laya_server.py --port 8791
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\verify-astra.ps1
```
