# ASTRA AI — PHASE 1 EXISTING SYSTEM AUDIT & ARCHITECTURE MAP
**Generated**: 2026-08-14  
**Product**: ASTRA AI (Hospital Central AI Command Centre)  
**Architecture Policy**: ONE BRAIN RULE — Zero Duplication

---

## 1. Executive Summary & Inventory

This audit establishes the baseline of existing services, data stores, command engines, and UI layers across the codebase, identifying the canonical implementations to build upon without creating duplicate or competing engines.

| Architecture Layer | Existing Component | Status / Strategy |
|---|---|---|
| **Hospital DB** | `server/db.ts` & `data/hospital.json` | **Canonical Transactional Database & Audit Engine**. Real persistence of patients, beds, orders, labs, vitals, billing, OT, and immutable audit logs. |
| **Command Engine** | `server/command.ts` & `src/lib/commandEngine.ts` | **Canonical Mutation Engine**. Unify through `src/command/CommandEngine.ts` to ensure all hospital state mutations pass through deterministic RBAC, confirmation, and audit. |
| **Central Resolver** | `src/lib/CentralResolver.ts` & `src/components/CommandCenter/commandParser.ts` | **Unified Intent Engine**. Consolidate into `src/agents/core/UniversalIntentResolver.ts` with order-independent matching, spoken soundex handling, and patient context isolation. |
| **Orchestration** | `server/langgraph.ts` & `src/lib/agents/core/LangGraphOrchestrator.ts` | **LangGraph Orchestrator**. Establish bounded DAG execution with human-in-the-loop approvals under `src/agents/core/LangGraphOrchestrator.ts`. |
| **Clinical Brain** | `src/lib/agents/core/HermesBrain.ts` | **Hermes Central Brain**. Establish supervisory clinical synthesis and specialist delegation under `src/agents/core/HermesBrain.ts`. |
| **Knowledge / RAG** | `server/knowledge.ts` & `src/lib/knowledge/` | **Smart RAG Knowledge Fabric**. Single vector/lexical index, PubMed connector, and conflict detector under `src/knowledge/RAGPipeline.ts`. |
| **Voice Architecture** | `src/components/AstraCopilot.tsx` & `src/utils/audioAlerts.ts` | **Voicebox Engine**. Unify under `src/voice/VoiceboxEngine.ts` with 3 human-like voices (Dr. Arjun, Dr. Priya, Reception Guide) and barge-in interrupt handling. |
| **Model Routing** | `server/router.ts` & `src/lib/llm.ts` | **Smart Model Router**. Unified tier under `src/models/ModelRouter.ts` (Database -> Local Small LLM -> Medical LLM -> Frontier / Hermes). |
| **Plugin System** | `server/plugins.ts` | **Plugin Manager & Auto-Wiring**. Lifecycle manager, security scanning, and dependency graph under `src/plugins/PluginManager.ts`. |

---

## 2. Core Registries Inventory
Existing matrix configurations (`src/lib/agents/config/AstraAgentRegistry.ts`, `AstraMatrices.ts`) are upgraded into the **Seven Canonical Registries**:
1. `src/agents/core/AgentRegistry.ts`
2. `src/agents/core/ToolRegistry.ts`
3. `src/agents/core/PermissionRegistry.ts`
4. `src/agents/core/KnowledgeRegistry.ts`
5. `src/agents/core/MemoryRegistry.ts`
6. `src/agents/core/PluginRegistry.ts`
7. `src/agents/core/ModelRegistry.ts`

---

## 3. Specialist Agent Alignment
The initial 8 core specialist agents will be placed in `src/agents/specialists/`:
1. `HospitalQueryAgent.ts` (Deterministic DB queries, <500ms latency)
2. `PatientContextAgent.ts` (Patient search, timeline, delta, vitals)
3. `CommandAgent.ts` (Mutations via CommandEngine)
4. `ClinicalReasoningAgent.ts` (13 modes, 20-step differential, pathophysiology)
5. `EvidenceAgent.ts` (PubMed, PMC, guidelines, citations)
6. `ImageAgent.ts` (Vision, quality check, structure mapping, neurovascular safety)
7. `VoiceAgent.ts` (Multilingual streaming, VAD, interrupt handling)
8. `ValidatorAgent.ts` (Universal Verifier, 10 safety checks)

---

## 4. UI Layer Integration
The new **Clinical Supercore UI** (`src/ui/command/CommandCentre.tsx`) integrates directly into `src/App.tsx` and `src/sections/hospital/ClinicalCommandHub.tsx`, delivering the 7 modes (COMMAND, CLINICAL, PATIENT, HOSPITAL, EVIDENCE, AGENTS, SYSTEM) with real-time execution telemetry and Antigravity-style agent traces.
