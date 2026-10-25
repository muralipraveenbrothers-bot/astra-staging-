# ASTRA PHASE 0 AUDIT REPORT

VERSION: 2026.08.14
PURPOSE: STEP 1 of the Master Implementation Prompt — map existing ASTRA code,
classify REAL / PARTIAL / MOCK / DEAD, declare honest gaps.
METHOD: file inventory, grep-based capability probes, build + test runs.
BUILD STATUS: `npm run build` → 0 TypeScript errors (verified 2026-08-14).
TEST STATUS: plugin ecosystem suite → 38/38 PASS.

---

## 1. MEASURED INVENTORY

| Metric | Measured |
|---|---|
| Source files (TS/TSX) | 289 |
| Lines of code | 85,312 |
| Plugin manifests (config/plugins/) | 32 |
| Agents declared in manifests | 143 |
| Tools declared in manifests | 148 |
| Tools registered in ToolRegistry | 26 |
| MCP servers | 7 |
| Integration adapters | 5 |
| Plugin-engine classes | 10 |
| Core specialist agents (src/agents/specialists) | 6 |
| Registry systems (src/agents/core) | 7 |
| Knowledge documents indexed | 0 |
| Audit records (data/audit.jsonl) | 127 |
| hospital.json | 486 lines / 14.5 KB |
| Existing docs (docs/ + root) | 15+ MD |

---

## 2. CLASSIFICATION MAP

### 2.1 REAL (production-grade, wired, tested)
| Component | Evidence |
|---|---|
| CommandEngine (src/command/CommandEngine.ts) | single mutation gateway; intent resolution, RBAC, verification, audit chain |
| 7 registries (Agent, Tool, Permission, Knowledge, Memory, Plugin, Model) | src/agents/core/*Registry.ts |
| 3 resolvers (UniversalIntentResolver, PatientContextResolver, UniversalVerifier) | present + wired into CommandEngine |
| 6 core specialist agents | HospitalQuery, PatientContext, Command, Clinical, Evidence, Image |
| Plugin engine (10 classes) | PluginManager, DependencyResolver (DAG + cycles), AutoWiringEngine, HealthMonitor, AutoRepairEngine, Lifecycle, Installer, Uninstaller, Registry, Types |
| MCP layer | registry + 7 domain servers (Hospital, Laboratory, Radiology, Pharmacy, Knowledge, Image, Voice) |
| Integrations | FreeAPIGateway, BestRouteSelector, RateLimitManager, ExternalAdapter, CacheManager |
| 32 manifests | P0×7, P1×5, P2×12, P3×8 — full dependency graphs |
| Plugin UI | PluginManagerPage (catalog/health/graph), HealthDashboard, InstallWizard, DependencyGraphVisualizer, UnifiedInput, CommandDiscovery |
| Server API | /api/plugins/* (7 endpoints) behind authenticate; legacy /api/plugins preserved |
| Test suite | 38/38 PASS, report at PLUGIN_ECOSYSTEM_TEST_REPORT.md |
| Build | 0 TS errors |

### 2.2 PARTIAL (structure exists, not fully wired)
| Component | Gap |
|---|---|
| HermesBrain | 0 direct model fetches — rule/registry-based; ModelRegistry exists but no real provider route tested end-to-end |
| KnowledgeRegistry / RAG | registry only — 0 documents indexed; no vector store/embeddings/BM25 yet |
| Voicebox | pipeline + voices defined; upstream 127.0.0.1:17493 down → honestly DEGRADED; no STT/TTS engine connected |
| Model routing | omniroute/freellm manifests exist; no provider keys → CONFIG_REQUIRED (correct behavior) |
| MCP servers | registered; execution is in-memory/synthetic for some tools — need real adapters per domain |
| Integrative medicine | NOT built (P2-13 absent from the 32 manifests) |
| Blind-spot / rule-in / rule-out | NOT built (listed in hierarchy, no implementation) |
| OP margin optimizer | NOT built |
| CEO/CTO/HOD agent layer | manifest declarations only (143 agents declared, 6 implemented) |
| P4 addons (n8n / manus / browser) | NOT built |

### 2.3 MOCK / LEGACY (superseded or synthetic — flagged, not deleted)
| Component | Issue |
|---|---|
| src/lib/commandEngine.ts, CentralResolver.ts, commandBus.ts, taskEngine.ts, approvalsExec.ts, astraFeatures.ts | parallel legacy paths predating src/command/CommandEngine.ts; risk of duplicate-system violation — migration targets |
| src/lib/mock.ts | mock data provider used by legacy UI paths |
| ToolRegistry handlers with hard-coded values (e.g. `amountDue: "₹45,200"`, OP billing strings) | synthetic output; must be replaced with real DB calculations (OP margin directive) |

### 2.4 DEAD / UNREFERENCED
- None conclusively identified; candidate scan needed in Phase 1 (dead-code grep for
  exports never imported). No file was deleted; DEAD classification requires evidence.

---

## 3. KNOWLEDGE SCALE — HONEST REPORT

- Indexed documents: **0** (registry only). Any "billions of facts" claim is FORBIDDEN until ingestion is real.
- Derived estimate for the target corpus (PubMed ~36M + PMC ~4.5M + Europe PMC
  dedup + ClinicalTrials + guidelines ≈ 41M unique docs ≈ 56B tokens ≈ 224 GB text):
  **~1.1–2.8 trillion atomic facts — DERIVED ESTIMATE** (method: 20–50 tokens per
  atomic fact). Never presented as measured.
- Model parameters: report vendor figures verbatim (e.g. Kimi K3 = 2.8T total /
  104B active, MoE). NEVER sum or misrepresent.

---

## 4. PHASE 1 BACKLOG (priority order, from the Master Prompt)

1. Implement blind-spot engine (clinical_blind_spot_agent + rule_in/rule_out) with the
   specified output matrix — register through AgentRegistry + CommandEngine intents.
2. Implement P2-13 integrative-medicine-plugin (manifest, agents, tools: analyze_prakriti,
   suggest_local_diet, check_herb_drug_interaction, generate_diet_chart,
   check_food_drug_timing, suggest_ritucharya) + Command Center mode toggle.
3. Implement op_margin_optimizer_agent with real billing-DB calculations; replace
   hard-coded ToolRegistry billing output.
4. P4 addon manifests (n8n, manus-like, browser) in addon structure, sandboxed.
5. Extra dashboards (Risk Radar, Deterioration, Delayed Journey, Knowledge Freshness,
   Agent Health, Safety Queue, Epidemiology) as addon UI.
6. Wire real model route (local via Ollama or free provider) + RAG ingestion so
   Hermes has a real knowledge channel; then update §3 numbers with measured counts.
7. Migrate legacy src/lib command paths to CommandEngine; retire mocks with evidence.

## 5. RULES CARRIED FORWARD

- No duplicate systems; every new module registers through existing registries.
- No fake status; DEGRADED stays DEGRADED until health checks pass.
- Nothing mutates hospital state outside CommandEngine.
- Every change build-verified (`npm run build` 0 errors) before acceptance.