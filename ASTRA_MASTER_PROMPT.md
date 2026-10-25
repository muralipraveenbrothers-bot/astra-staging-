# ASTRA AI — UNIFIED MEDICAL SUPERCORE & HOSPITAL INTELLIGENCE OS
## MASTER IMPLEMENTATION PROMPT — v2026.08.14-FINAL (CONSOLIDATED)

> This is the ONE canonical directive. It supersedes all prior prompts
> (UNIFIED MEDICAL SUPERCORE v2026.08.14-FINAL + PLUGIN ECOSYSTEM v1)
> by merging them without duplication and filling in measured metrics.

PRODUCT: ASTRA AI Clinical Supercore
IDENTITY: ONE BRAIN → MANY SPECIALIST MINDS → ONE COMMAND ENGINE
STATUS: IMPLEMENTATION DIRECTIVE — EXECUTE NOW

---

## 0. ABSOLUTE FOUNDATION RULES

ONE SYSTEM. NO DUPLICATES.
- ONE Hermes Brain (clinical reasoning)
- ONE LangGraph Orchestrator (workflow state, checkpoints, approval gates)
- ONE Command Engine (hospital mutations — nothing mutates outside it)
- ONE RAG Knowledge Fabric (vector + graph + BM25 + reranker + citation)
- ONE Voicebox (3 voices: Dr. Arjun, Dr. Priya, Reception Guide; 5 languages)
- ONE Memory Governor (working + episodic + semantic + patient + doctor)
- ONE Model Router (local → medical → frontier → fallback, quota-aware)
- ONE Plugin Manager (36 plugins, auto-wiring, dependency graph, health gates)
- ONE Hospital Database (canonical transactional DB)
- ONE Audit Log (immutable, every mutation)

CONTEXT ISOLATION:
- GLOBAL commands ignore active patient
- PATIENT commands use active context
- AMBIGUOUS → ask once, never guess

NO FAKE DATA:
- Every number from database
- Every order creates a real record
- Every citation has real provenance
- Missing credential → CONFIG_REQUIRED
- Missing service → DEGRADED (never fake connected)
- ACTIVE means health checks passed; DEGRADED means something failed

---

## 1. THE SIX-LAYER UNIVERSAL AGENT CONTRACT

Every agent (CEO AI → Worker Specialist) MUST implement:

| Layer | Content |
|---|---|
| LAYER 1 OBJECTIVE | rawRequest, normalizedRequest, intent, entities, confidence, riskLevel |
| LAYER 2 ROLE | agentId, name, level, parent, domain, permissions[], constraints, modelPolicy |
| LAYER 3 PERCEPTION | scoped hospital state ONLY (never full DB dump) |
| LAYER 4 CAPABILITY | authorized tools only (discovered at runtime via MCP) |
| LAYER 5 LEARNING | skills, examples, approved corrections, versioned memory |
| LAYER 6 KNOWLEDGE | RAG results, guidelines, protocols, evidence (with provenance) |

→ EXECUTE → VERIFY → RESULT → AUDIT → MEMORY

---

## 2. COMPLETE AGENT HIERARCHY (196 UNIQUE LOGICAL AGENTS — 207 LISTED IDs, DEDUPLICATED)

> Coverage verified 2026-08-14: every agent below is declared in its owning
> plugin manifest (100% — run `npx tsx scripts/audit-agent-coverage.ts`).
> Sync tool: `npx tsx scripts/sync-plugin-agents.ts` (idempotent).

### LEVEL 0 — PERMANENT CORE (Always On)
1. hermes_brain — Central clinical reasoning, synthesis, delegation
2. langgraph_orchestrator — Workflow state, checkpoints, retries, approval gates
3. knowledge_governor — RAG, vector, graph, freshness, conflict detection
4. safety_governor — Patient identity, drug safety, contraindications, RBAC
5. memory_governor — Working, episodic, semantic, patient, doctor memory tiers
6. model_router — Fast local / medical / frontier / vision / voice routing
7. command_core — Intent resolution, entity extraction, command routing

### LEVEL 1 — EXECUTIVE INTELLIGENCE (CEO / CTO Layer)
8. ceo_ai — Executive intelligence, daily brief, bottleneck detection
9. chief_clinical_cto — Medical intelligence, evidence strategy, clinical quality
10. hospital_operations_cto — Reception, journey, beds, ward, OT, flow
11. ai_technology_cto — Models, plugins, LangGraph, infrastructure health
12. finance_cto — Billing, revenue, collections, cost analytics, OP margin strategy
13. insurance_claims_head — PMJAY, CMRF, TPA, pre-auth, settlement
14. quality_nabh_head — NABH, CAPA, incidents, audit readiness, patient safety
15. hr_head — Staff, attendance, leave, workforce gaps
16. patient_experience_head — Communication, counselling, multilingual, feedback

### LEVEL 2 — HOD AGENTS (35 — Register All, Activate On Demand)
CLINICAL (19): clinical_command_hod, emergency_hod, internal_medicine_hod,
general_surgery_hod, orthopaedics_hod, obgyn_hod, pediatrics_hod,
icu_critical_care_hod, cardiology_hod, neurology_hod, nephrology_hod,
gastroenterology_hod, pulmonology_hod, infectious_disease_hod, oncology_hod,
psychiatry_hod, dermatology_hod, ent_hod, ophthalmology_hod
DIAGNOSTIC (3): laboratory_hod, radiology_hod, pathology_hod
SERVICE (4): pharmacy_hod, ward_nursing_hod, ot_hod, emergency_services_hod
OPERATIONS (2): reception_hod, patient_journey_hod
FINANCIAL (2): billing_hod, insurance_hod
ADMIN (2): hr_hod, quality_nabh_hod
INTEGRATIVE MEDICINE (3): ayurveda_hod (Charaka/Sushruta/Ashtanga Hridaya),
naturopathy_hod (diet, lifestyle, natural therapies), dietetics_hod (local food
habits, regional diet charts, therapeutic nutrition)

### LEVEL 3 — MANAGER / ASSOCIATE AGENTS (3–6 per HOD)
Laboratory: worklist_manager, sample_manager, result_manager,
critical_value_manager, tat_manager
Pharmacy: dispensing_manager, inventory_manager, purchase_manager,
expiry_manager, drug_safety_manager, pharmacy_analytics_manager
Radiology: worklist_manager, pacs_manager, dicom_manager, imaging_ai_manager,
reporting_manager, critical_finding_manager
Dietetics (NEW): therapeutic_diet_manager, local_cuisine_manager,
naturopathy_diet_manager, allergy_nutrition_manager, opd_diet_counseling_manager
Ward/ICU: bed_manager, vitals_manager, nursing_task_manager,
medication_manager, rounds_manager, handover_manager, deterioration_agent
OT: scheduling_manager, preop_manager, checklist_manager, intraop_manager,
implant_manager, pacu_manager, turnover_manager, ot_delay_agent
Reception: registration_manager, queue_manager, token_agent,
patient_comm_agent, uhid_agent, print_agent, appointment_agent
Billing: payment_agent, clearance_agent, revenue_agent, cost_analysis_agent

### LEVEL 4 — SPECIALIST WORKER AGENTS (The Narrow Experts)
CLINICAL INTELLIGENCE (19): diagnostic_differential_agent,
clinical_reasoning_agent, evidence_agent, guideline_agent, drug_safety_agent,
pathophysiology_agent, disease_progression_agent, rare_disease_agent,
clinical_blind_spot_agent, risk_stratification_agent, patient_safety_agent,
discharge_agent, referral_agent, clinical_documentation_agent,
treatment_monitoring_agent, clinical_contradiction_agent,
rule_in_agent (likelihood ratios, pathognomonic signs → HIGHLY SUPPORTIVE |
SUPPORTIVE | CONSISTENT), rule_out_agent (sensitivity-driven exclusion →
EFFECTIVELY EXCLUDED | UNLIKELY | CANNOT EXCLUDE),
medication_reconciliation_agent (renal/hepatic/allergy/age/pregnancy cross-check)
TRAUMA (9): trauma_agent, trauma_imaging_agent, fracture_agent, wound_agent,
neurovascular_safety_agent, orthopaedic_trauma_agent, emergency_trauma_agent,
compartment_syndrome_watch_agent, open_injury_agent
IMAGING (12): image_quality_agent, image_enhancement_agent,
image_classification_agent, anatomy_mapping_agent, image_annotation_agent,
image_comparison_agent, xray_agent, ct_agent, mri_agent, usg_agent,
dicom_agent, radiology_report_agent
LABORATORY (7): cbc_agent, biochemistry_agent, microbiology_agent,
pathology_agent, critical_value_agent, result_verification_agent, lab_tat_agent
PHARMACY (9): prescription_agent, drug_interaction_agent, dose_safety_agent,
dispensing_agent, inventory_agent, expiry_agent, purchase_agent,
invoice_ocr_agent, consumption_forecast_agent
WARD / ICU (9): vitals_agent, ews_agent, deterioration_agent, bed_agent,
nursing_task_agent, medication_administration_agent, rounds_agent,
handover_agent, fluid_balance_agent
OT (8): ot_scheduling_agent, preop_agent, safety_checklist_agent,
intraop_documentation_agent, implant_agent, pacu_agent, ot_delay_agent,
turnover_agent
RECEPTION (7): registration_agent, uhid_agent, token_agent, queue_agent,
appointment_agent, print_agent, patient_communication_agent
FINANCE (6): billing_agent, payment_agent, clearance_agent, revenue_agent,
cost_analysis_agent, op_margin_optimizer_agent (cost-per-OP, margin %,
break-even count, pricing suggestion)
INSURANCE (6): pmjay_agent, cmrf_agent, tpa_agent, preauth_agent,
claim_documentation_agent, settlement_agent
INTEGRATIVE MEDICINE (6): ayurvedic_prakriti_agent (Vata/Pitta/Kapha analysis),
ayurvedic_aushadhi_agent (herb–drug interaction checker),
naturopathy_hydro_agent (hydrotherapy, fasting protocols),
local_diet_chart_agent (South/North/East/West/Tribal regional charts),
food_medication_interaction_agent (timing vs absorption),
seasonal_regimen_agent (Ritucharya)

CROSS-HOSPITAL SUPER AGENTS (7): patient_journey_agent (end-to-end bottleneck),
clinical_blind_spot_agent (cross-record gap finder), clinical_contradiction_agent
(diagnosis vs lab vs imaging), evidence_conflict_agent (Guideline A vs B),
data_integrity_agent (duplicates, missing allergies, broken linkages),
agent_evaluation_agent (accuracy, latency, hallucination metrics),
daily_improvement_agent (self-analysis, skill proposals, routing optimization)

### LEVEL 5 — AUTOMATION & EXTERNAL TOOLS (Addon Structure — Optional, Sandboxed)
- n8n_automation_agent — workflow triggers ONLY (never the clinical brain)
- manus_like_executor_agent — general task execution, file handling, web search
- browser_use_agent — browsing, form filling, portal checking
- github_repo_curator_agent — medical repo discovery, license checking
- local_os_command_agent — safe local shell, admin only, sandboxed

---

## 3. PLUGIN ECOSYSTEM (33 PLUGINS) WITH DEPENDENCY GRAPH

### TIER P0 — CORE (Install First)
| ID | Plugin | Depends | Critical health |
|---|---|---|---|
| P0-01 | astra-brain-core | — | Hermes < 200ms, router |
| P0-02 | langgraph-orchestrator | P0-01 | graph exec, checkpoint persistence |
| P0-03 | hospital-command-engine | P0-01 | intent latency < 100ms |
| P0-04 | hospital-data-connector | P0-03 | DB pool, query latency |
| P0-05 | rbac-audit | P0-01, P0-04 | token validation, audit write |
| P0-06 | medical-knowledge-gateway | P0-01 | vector store, embedding model |
| P0-07 | voicebox | P0-01, P0-03 | STT accuracy, TTS latency |

### TIER P1 — INTELLIGENCE (After P0 Healthy)
| ID | Plugin | Depends | Status rule |
|---|---|---|---|
| P1-01 | omniroute-gateway | P0-01; opt P1-03 | no providers → CONFIG_REQUIRED |
| P1-02 | freellm-provider | P0-01, P1-01 | repo down → CONFIG_REQUIRED |
| P1-03 | medical-model-pack | P0-01, P0-06; opt P1-01 | VRAM budget enforced |
| P1-04 | medical-vision-dicom | P0-01, P1-03, P0-04; opt P0-06 | PACS down → DEGRADED |
| P1-05 | daily-learning-evaluation | P0-01, P0-02, P0-06; opt P1-03 | scheduled 2:00 AM |

### TIER P2 — DEPARTMENTS (After P0+P1 Healthy)
P2-01 reception-plugin → P0-04, P0-05, P0-07
P2-02 pharmacy-plugin → P0-04, P0-05, P0-06
P2-03 laboratory-plugin → P0-04, P0-05
P2-04 radiology-plugin → P0-04, P0-05, P1-04
P2-05 ward-icu-plugin → P0-04, P0-05
P2-06 ot-plugin → P0-04, P0-05
P2-07 billing-plugin → P0-04, P0-05
P2-08 insurance-plugin → P0-04, P0-05, P2-07
P2-09 nabh-quality-plugin → P0-04, P0-05
P2-10 hr-plugin → P0-04, P0-05
P2-11 patient-experience-plugin → P2-01, P0-07, P0-06
P2-12 executive-analytics-plugin → P0-04, P0-05, P2-07, P2-08

### TIER P2.5 — INTEGRATIVE MEDICINE (NEW)
P2-13 integrative-medicine-plugin → P0-04, P0-05, P0-06; opt P2-02
- Agents: ayurveda_hod, naturopathy_hod, dietetics_hod + sub-agents
  prakriti_analyzer, local_diet_manager, food_interaction_checker
- Knowledge: Charaka Samhita, Sushruta Samhita, Ashtanga Hridaya,
  Bhavaprakasha, modern nutrition DBs, regional food databases
- Tools: analyze_prakriti, suggest_local_diet, check_herb_drug_interaction,
  suggest_naturopathy_protocol, generate_diet_chart, check_food_drug_timing,
  suggest_ritucharya
- UI: Command Center toggle "Integrative Mode: [Modern | Ayurveda | Combined | Naturopathy]"

### TIER P3 — SPECIALTY (On Demand)
P3-01 trauma-plugin → P1-04, P3-02, P2-05
P3-02 clinical-reasoning-plugin → P0-01, P0-02, P0-06, P1-03
P3-03 drug-safety-plugin → P0-06, P2-02
P3-04 evidence-literature-plugin → P0-06, P0-01
P3-05 communication-coach-plugin → P0-01, P0-07, P2-11
P3-06 public-health-plugin → P0-06, P0-04
P3-07 telemetry-iot-plugin → P2-05, P0-04
P3-08 telemedicine-plugin → P0-01, P0-07, P0-04

### TIER P4 — AUTOMATION ADDONS (Optional, Non-Clinical)
P4-01 n8n-automation-addon → P0-01, P0-03 — scheduled workflows,
notifications, reports. RULE: n8n is NOT the clinical brain. CONFIG_REQUIRED
if no n8n instance.
P4-02 manus-executor-addon → P0-01 — general task execution, file ops, web
search. RULE: sandboxed, no hospital DB write, no RBAC bypass. Admin/dev only.
P4-03 browser-ai-addon → P0-01 — browsing, portal checking, form automation.

DEPENDENCY RULES:
- REQUIRED missing → INSTALLATION BLOCKED (recursive install first)
- OPTIONAL missing → DEGRADED with specific feature disabled + UI notice
- CONFLICT (e.g. two PACS adapters) → reject second
- VERSION: semver; different major → BLOCK or ISOLATE; never silently break
- No plugin shows ACTIVE without passing its health checks (smoke test first)
- Install, activate, deactivate, uninstall: ALL audited

---

## 4. CLINICAL BLIND-SPOT & RULE-IN/RULE-OUT ENGINE

### 4.1 Blind-Spot Detection Matrix
clinical_blind_spot_agent runs on EVERY patient context switch and on demand:
- Missing allergy documentation
- Missing current medication list
- Unexplained lab abnormality (new creatinine rise without explanation)
- Diagnosis–lab conflict (CAP but normal WBC + no infiltrate)
- Drug–disease conflict (metformin + reduced eGFR not reassessed)
- Drug–lab gap (nephrotoxic drug, no recent creatinine)
- Missing monitoring (warfarin, no INR for 3 weeks)
- Unreviewed critical result / pending order > SLA
- Age-appropriate screening missing
- Pregnancy status unknown before teratogen; weight missing before pediatric dosing
- Red-flag symptom unaddressed (fever + headache + neck stiffness)

Output: 🔴 MUST NOT MISS / 🟡 NOT EXCLUDED / 🟠 MISSING DATA /
🟢 CONTRADICTING / 📋 NEXT HIGH-VALUE ACTION (numbered, ordered by urgency)

### 4.2 Rule-In / Rule-Out Engine
- rule_in_agent: likelihood ratios, pathognomonic signs →
  "Finding X raises probability of Disease Y from 30% to 85%";
  labels HIGHLY SUPPORTIVE | SUPPORTIVE | CONSISTENT; never 100% without gold standard
- rule_out_agent: sensitivity-driven exclusion →
  "Normal D-dimer makes PE unlikely (Wells low + D-dimer neg)";
  labels EFFECTIVELY EXCLUDED | UNLIKELY | CANNOT EXCLUDE
- Both feed diagnostic_differential_agent for probability-structured output

---

## 5. INTEGRATIVE MEDICINE MODULE (P2-13)

5.1 AYURVEDA — prakriti analysis (Vata/Pitta/Kapha), dosha imbalance,
aushadhi (ashwagandha, turmeric, tulsi, ginger), Panchakarma,
herb–drug interaction database (CRITICAL safety layer).
5.2 NATUROPATHY — hydrotherapy, supervised fasting, mud/sun therapy,
natural diet, lifestyle disease reversal; contraindication-aware plans.
5.3 LOCAL FOOD & DIET CHARTS — regional DBs: South (ragi, sambar, idli,
coconut oil), North (wheat, dal, paneer, mustard oil, millets), East (fish,
mustard, panchphoron), West (millet, kokum, seafood), Tribal (indigenous foods).
generate_diet_chart → Breakfast | Lunch | Dinner | Snacks | Fluids with
calories, protein, local ingredients, medication-timing gaps.
check_food_drug_timing → "Take levothyroxine 30 min before breakfast.
Avoid calcium with iron."
5.4 RITUCHARYA — seasonal regimen: diet, lifestyle, exercise, disease
precautions (dengue in monsoon, flu in winter).
5.5 COMMAND CENTER TOGGLE — Modern | Ayurveda | Combined | Naturopathy.
Combined: Hermes synthesizes both perspectives, drug-safety agent checks
herb–drug interactions, evidence shows PubMed AND Ayurvedic citations,
diet chart merges modern nutrition + local foods.

---

## 6. FINANCIAL INTELLIGENCE & OP MARGIN (op_margin_optimizer_agent)

Inputs: OP counts, procedure types, material costs, staff cost per OP,
overhead allocation, desired margin.
Calculations:
- Cost per OP = (materials + staff_share + overhead_share) / OP_count
- Margin % = (revenue − cost) / revenue × 100
- Break-even OP count = fixed_costs / (avg_revenue − avg_variable_cost)
Output: per-procedure cost breakdown (charge/material/staff/overhead/cost/
margin %), ⚠ LOW-margin flags, 💡 pricing suggestions, 📊 break-even vs
current vs target with ₹ P&L. Every number from billing DB — never mocked.

Widgets: Today's Collections, Pending Discharge Bills, IP vs OP revenue trend,
department-wise margin bars, doctor productivity, pharmacy/lab margins,
insurance claims aging, AI cost-reduction opportunities.

---

## 7. EXTRA DASHBOARDS (Addon Structure)

7.1 Hospital Risk Radar — deterioration, financial (bills > 7 days),
operational (OT delay, bed shortage), clinical (unverified criticals),
compliance (NABH gaps).
7.2 Patient Deterioration Radar — EWS > 4 amber, EWS > 6 red + auto-notify;
trend lines ("SpO2 declining 3% over 2h"); suggested actions.
7.3 Delayed Journey Radar — registration→doctor→lab→result→review→
pharmacy→discharge; target vs actual per stage; bottleneck identification.
7.4 Knowledge Freshness — last PubMed/guideline update, stale sources,
missing-evidence topics.
7.5 Agent Health — all agents ONLINE/DEGRADED/OFFLINE, latency, success
rate, last failure, model VRAM load.
7.6 Clinical Safety Queue — unverified critical labs, unreviewed radiology
> 4h, orders without allergy check, high-risk approvals, unacknowledged
blind spots.
7.7 Epidemiology & Public Health — seasonal alerts, occupational patterns,
area-wise mapping, ICMR/IDSP/MoHFW integration, notifiable-disease queue.
7.8 Plugin Health Monitor (existing) — core/models/departments status,
[Refresh] [Repair], cascade-failure safe mode.

---

## 8. KNOWLEDGE SCALE & METRICS (MEASURED + HONEST ESTIMATES)

### 8.1 MEASURED — This Repository (actual counts, verified 2026-08-14)
| Metric | Count |
|---|---|
| Source files (TS/TSX) | 289 |
| Lines of code | 85,312 |
| Plugin manifests (config/plugins) | 36 (P0:7, P1:5, P2:12, P2.5:1, P3:8, P4:3) |
| Agents declared in manifests | 277 (196 unique from master hierarchy — 100% coverage, see scripts/audit-agent-coverage.ts) |
| Tools declared in manifests | 166 |
| Tools registered in ToolRegistry | 26 |
| MCP servers | 7 (Hospital, Laboratory, Radiology, Pharmacy, Knowledge, Image, Voice) |
| Integrations (FreeAPIGateway etc.) | 5 |
| Plugin-engine classes | 10 |
| Core specialist agents implemented | 6 (HospitalQuery, PatientContext, Command, Clinical, Evidence, Image) |
| Registry systems | 7 (Agent, Tool, Permission, Knowledge, Memory, Plugin, Model) |
| Data: hospital.json | 486 lines / 14.5 KB |
| Data: hospital_profile.json | 2.7 KB |
| Audit entries (audit.jsonl) | 127 records / 37 KB |
| Knowledge documents actually indexed | 0 (registry only — REAL GAP, see §8.4) |
| Plugin ecosystem tests | 40/40 PASS |

### 8.2 TARGET KNOWLEDGE CORPUS (real public-source counts, indexed when wired)
| Source | Records | ~Tokens |
|---|---|---|
| PubMed abstracts | ~36M | ~9.0B |
| PMC full text | ~4.5M | ~36B |
| Europe PMC | ~40M (≈90% overlap w/ PubMed — dedupe) | ~10B |
| ClinicalTrials.gov | ~0.5M | ~0.6B |
| WHO guidelines + Cochrane + textbooks (legal) | ~0.1M | ~0.5B |
| Ayurvedic + naturopathy texts | small corpus | ~0.05B |
| TOTAL (deduplicated) | ~41M unique documents | ~56B tokens ≈ 224 GB text |

### 8.3 DERIVED ESTIMATE (labeled — never presented as measured)
- Knowledge space: ~1.1–2.8 TRILLION atomic medical facts
  (method: 1 atomic fact ≈ 20–50 tokens; 56B tokens ÷ 20–50 = 1.1–2.8T)
  → label: DERIVED ESTIMATE. Show method. Never claim "40T facts".
- Model parameters (if Kimi K3 connected): Total 2.8T / Active 104B,
  MoE architecture. Report as-is. NEVER sum or misrepresent.
- Local model: name, quantization, VRAM used, context window.

### 8.4 HONEST GAP DECLARATION (Phase 0 audit finding)
KnowledgeRegistry exists but indexes 0 documents; HermesBrain is rule-based
(0 direct model fetches); Voicebox TTS is DEGRADED (no upstream); model
routing is registry-level. Phase 1 work = connect real ingestion + real
model routes before claiming knowledge scale. No fake counts.

---

## 9. FREE AI / NO-API INTEGRATION LAYER (via FreeAPIGateway + BestRouteSelector)

- PubMed/NCBI E-utilities (free, rate-limited) → primary for literature
- Europe PMC (free, open access) → secondary fallback
- ClinicalTrials.gov, WHO/Global Health Observatory, Wikidata/Wikipedia,
  OpenStreetMap, Open-Meteo, GitHub API → adapters with rateLimit,
  quotaStatus, healthStatus, fallbackBehavior
- Best-route logic: primary healthy+quota → use; else secondary; else local
  cached index; else "External source unavailable. Using local knowledge only."
- Retry: max 3, exponential backoff; 429 wait+retry; 503 failover; 404 →
  empty (not error); timeout → DEGRADED + fallback
- Cache: 1h TTL, key = hash(query+source+date), stale labeled with timestamp
- Rate limits visible to admin: "PubMed API: 850/1000 requests today"

Free chat platforms (no key): HuggingChat, Mistral Le Chat, Poe, DeepSeek
Chat, DuckDuckGo AI Chat, Microsoft Copilot, Meta AI, Perplexity.
API providers: OpenAI, Anthropic, Gemini, Cohere, DeepSeek, Kimi/Moonshot,
Azure OpenAI.
Local LLMs: Ollama (qwen2.5, llama3), BioGPT, PubMedBERT, ClinicalBERT,
MedAlpaca.
Medical DBs: PubMed, PMC, Europe PMC, ClinicalTrials.gov, WHO IRIS, CDC
Stacks, Cochrane, DOAJ. India: ICMR, MoHFW, IDSP, NHP, AYUSH portal.

---

## 10. IMPLEMENTATION ORDER

PHASE 0 — AUDIT: ASTRA_PHASE0_AUDIT_REPORT.md (DONE — see file)
PHASE 1 — FOUNDATION: 7 registries + 3 resolvers + Hermes/LangGraph/
CommandEngine wiring + 8 core agents with real tool bindings
PHASE 2 — PLUGIN CORE: install P0 (7) → P1 (5), validate voice/models/RAG
PHASE 3 — DEPARTMENTS: P2 (12) + P2.5 integrative medicine; RBAC isolation
PHASE 4 — SPECIALTY: P3 (8); blind-spot engine, rule-in/out, drug safety
PHASE 5 — ADDONS: P4 (3) optional, sandboxed, no clinical bypass
PHASE 6 — DASHBOARDS & UI: supercore UI, 7 extra dashboards, integrative toggle
PHASE 7 — TESTING: 27 acceptance tests → FINAL_ACCEPTANCE_REPORT.md

---

## 11. ACCEPTANCE TESTS (All Must Pass)

COMMAND (10): identity / IP list <500ms / OP list <500ms / census /
open Rajesh / his CBC / order CBC (real record) / pending lab queue /
today's OT / billing summary today (real calc).
CLINICAL (4): differential of fever+thrombocytopenia; blind spots in Rajesh;
rule out PE in Rajesh; PubMed dengue guidelines (real citations).
INTEGRATIVE (3): analyze Rajesh's prakriti; local diet for diabetes; ashwagandha + metformin flag.
FINANCIAL (2): OP margin orthopaedics; break-even calculation.
BLIND-SPOT (3): amoxicillin with no allergy → SAFETY ALERT; warfarin no INR
→ MISSING MONITORING; CAP with normal procalcitonin → CONTRADICTION.
VOICE (2): voice "show IP list" = text result; TTS interrupt → stops + new intent.
SECURITY (3): reception→doctor tools 403; pharmacist→lab result edit 403;
offline frontier model → hospital queries still work.

---

## 12. FINAL ARCHITECTURE

```
                     ASTRA AI
                        │
        ┌───────────────┼───────────────┐
     CEO AI        CTO LAYER       COMMAND CENTER
        │         Clinical|Ops|     UI: Supercore + 7 Extra
   Executive      AI/Tech|Finance|   Dashboards + Integrative Toggle
   Intelligence   Insurance|Quality|
                  HR|Patient Exp    │
                        │           │
                  HERMES BRAIN ←────┘
                        │
                LANGGRAPH CORE (checkpoints, approval gates)
                        │
   Knowledge Gov ─ Safety Gov ─ Memory Gov (RAG/vector/BM25)
                        │
                 Model Router (local → medical → frontier → fallback)
                        │
             HOD AGENTS (35) → Managers → Specialists (100+)
                        │
                   TOOLS / MCP (7 servers)
                        │
                  COMMAND ENGINE (single mutation gateway)
                        │
                   HOSPITAL DB → AUDIT → MEMORY/LEARNING
```

---

## 13. EXECUTION CONTRACT (How ASTRA executes this prompt)

1. ONE PLUGIN MANAGER — no installs outside it; no manual wiring after install
2. NO DUPLICATE SYSTEMS — if astra-brain-core provides memory, no plugin re-creates it
3. NO FAKE STATUS — ACTIVE = health checks passed; DEGRADED = something failed; never fake connected
4. SECRETS ARE SECRETS — missing key = CONFIG_REQUIRED, never hard-code
5. CASCADE RESPECT — core failure degrades dependents into SAFE MODE (hospital queries still work)
6. VERSION LOCK — incompatible versions isolate, never silently break
7. AUDIT EVERYTHING — install/activate/deactivate/uninstall/all mutations logged
8. TEST BEFORE ACTIVE — no plugin ACTIVE without passing smoke test
9. AGENTS → TOOLS → MCP → ADAPTER → EXTERNAL API, one contract, no bypass
10. EVERY NEW MODULE (blind-spot, integrative medicine, OP margin, addons,
    dashboards) registers through the existing registries + CommandEngine —
    nothing mutates hospital state outside CommandEngine

DO NOT CREATE DUPLICATE SYSTEMS. DO NOT FAKE CONNECTIVITY.
DO NOT GUESS PATIENTS. DO NOT BYPASS COMMANDENGINE.
ONE ASTRA AI. ONE HOSPITAL BRAIN. ONE UNIFIED COMMAND CENTER.