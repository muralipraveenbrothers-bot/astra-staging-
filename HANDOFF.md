# ASTRA PMB Agent Brief

Working folder: `D:\Astra pmb\astra-staging` only. Branch: `master`. Remote: none.

This is a hospital command-center app: React/Vite UI on the registry UI port, Express API on the registry API port, Laya on its registry port, FreeLLMAPI external and never started or modified, and Hermes launched by `scripts/start-hermes.ps1`.

Use `config/ports.json` as the sole port source. Do not reinstall or reference removed tools: Paperclip, OpenClaw, n8n, Agent Zero, OpenHands, LiteLLM, or OmniRoute.

Existing proven capabilities include the work-order/SLA loop, approval crypto/classifier/gate (default off), audited Hermes and Laya routes, PHI Janitor (default off), launcher scripts, and server-vault login.

Rules: never expose keys, PINs, tokens, or patient values; use synthetic data; do not edit environment files, auth vaults, runtime data, or hospital/work-order JSON; stage explicit paths only; one small commit per item; run `npx tsc -p tsconfig.app.json --noEmit` and `npm test` after each item; preserve fail-closed safety and existing assertions; do not claim WORKING without a real API request and matching audit entry.

No concrete TASK was supplied in the agent brief. Do not make functional changes until a task names exact files, expected behavior, and a proving test.
