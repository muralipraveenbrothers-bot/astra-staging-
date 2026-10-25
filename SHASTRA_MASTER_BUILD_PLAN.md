# SHASTRA AI — MASTER BUILD PLAN & ARCHITECTURE SPECIFICATION
**Version:** 1.0.0-PROD-BUILD  
**Status:** READY FOR PHASED IMPLEMENTATION

---

## 1. CURRENT SYSTEM vs TARGET SYSTEM

| Area | Current System (Discovered Assets) | Target System (SHASTRA OS) |
|---|---|---|
| **Architecture** | Client-heavy SPA with local storage store + mock cards | Unified Full-Stack Hospital AI OS with Express backend, Server RBAC, LangGraph & React Frontend |
| **Doctor Interface** | Chat tab + Command console + separate role pages | Central Doctor Command Cockpit with 13 Thinking Modes, Vitals Telemetry, CPOE, My Rounds, Delta Tracker |
| **Security & RBAC** | Client-side role switching (localStorage auth) | Strict Server-Side RBAC (Session tokens, 403 on unauthorized routes & API actions) |
| **Mutations** | Direct store mutations & client execution | Authoritative Hospital Command Engine (`Intent -> Resolve -> Authorize -> Validate -> Execute -> Audit`) |
| **AI Orchestration** | Dropdown with mock fusion & config-only agent nodes | Stateful LangGraph Multi-Agent Orchestrator with Human-in-the-Loop & checkpointing |
| **Agents** | 7 mock UI nodes (canned responses) | Real Specialist Agents (Clinical Reasoning, Evidence, Drug Safety, Ops, Learning/Skills) |
| **Knowledge Engine** | Persistent JSON store with 12,000+ points + PubMed | Scaled Hybrid RAG (bge-m3 1024-dim vectors + Knowledge Graph + Tiers A–V + Provenance) |
| **Model Routing** | Dropdown selector | Intelligent Router (Local Ollama fast models + Cloud Frontier + Medical Vision + Voicebox) |
| **Department Screens**| Individual dashboards | 26 Astra-inspired Clinical & Operational Workstations (Doctor, Reception, Pharmacy, Lab, Ward, OT, Billing, CEO) |
| **Voice Interaction** | Web Speech STT/TTS + Voicebox connector | Low-latency Voice Interface with VAD Barge-in & Telugu/Hindi/Tamil/English support |
| **Extensions** | None | ChatGPT-style Plugin Center with fine-grained permission scopes & live health diagnostics |
| **Real-time Sync** | Mock events | Live Server-Sent Events (SSE) bus synchronizing all department workstations |

---

## 2. SYSTEM INVENTORY (KEEP / REPLACE / ADAPT / ADD / REMOVE)

### KEEP (Proven Assets Preserved)
- **Persistent Knowledge Data**: 12,000+ verified PubMed/RxNorm points in `knowledge-data/` with `bge-m3` vectors.
- **Command Engine Pipeline Logic**: 40+ medical & hospital command specs with safety classification (`info`, `reversible`, `important`, `high-risk`).
- **Core Clinical Computations**: Hospital census calculations, delta tracking algorithms, and attention priority scoring in `astraFeatures.ts`.
- **Voice Stack**: Multi-lingual speech synthesis/recognition and VAD barge-in architecture in `speech.ts` & `voicebox.ts`.
- **Proven Medical Schemas**: TypeScript definitions for patients, beds, orders, vitals, CDS differentials, and surgical plans in `types.ts`.

### REPLACE (Inadequate / Insecure Components)
- **Client-Side Auth**: Replaced with hardened server-side session & RBAC middleware (`server/middleware/auth.ts`).
- **Mock Agent Configs**: Replaced with active LangGraph workflow execution nodes (`server/agents/`).
- **Cosmetic Model Dropdown**: Replaced with dynamic intent + complexity Model Router (`server/router/`).

### ADAPT (Elevated to Astra Clinical Standards)
- **Doctor Dashboard**: Adapted into the complete Doctor Central Command Cockpit with 13 Thinking Modes, Vitals Telemetry, and CPOE Quick Orders.
- **Department Pages**: Adapted into high-density clinical workstations for Reception, Pharmacy, Lab, Radiology, Ward/ICU, OT, and Billing.
- **Task & Notification Center**: Adapted to support cross-department escalation and SLA monitoring.

### ADD (New Production Architecture)
- **LangGraph Multi-Agent Engine**: Stateful execution, human confirmation checkpoints, and tool routing.
- **Learning & Skills Agent**: Controlled repository for clinician-approved skills, routing rules, and error recovery playbooks with versioning and rollback.
- **ChatGPT-Style Plugin Center**: Discovery, fine-grained permission gates (`READ_PATIENT`, `CREATE_ORDER`, `WRITE_LAB_RESULT`, `USE_MODEL`), and lifecycle management.
- **Real-Time Cross-Department SSE Hub**: Instant synchronization of orders, results, alerts, and occupancy.
- **System Self-Diagnostics & Observability**: Real-time status monitoring for all brain subsystems.

### REMOVE (Visual Fluff & Non-Functional Code)
- Removed fake 3D anatomy and non-functional decorative animations.
- Removed client-side role switching bypasses.
- Removed fake benchmark counters and manufactured metric claims.

---

## 3. RESOURCE & ENVIRONMENT SPECIFICATION

- **RAM**: 24 GB Physical Memory
- **GPU**: AMD Radeon Graphics
- **Ollama**: Port 11434 with `bge-m3:latest` (1.2 GB active)
- **Node.js**: v20.20.0
- **Python**: 3.11.15
- **Ports**: 3000 (Backend Server + API + SSE), 5173 (Vite Frontend Development / PWA)

---

## 4. PHASED EXECUTION ROADMAP

1. **Phase 1: Project Scaffolding & Git Checkpoint** (Baseline setup in `d:\astra PM`, `git tag: shastra-master-build-start`)
2. **Phase 2: Server-Side RBAC & Live Data Fabric** (Express server, JWT session auth, role route guards, SSE event bus, transactional database)
3. **Phase 3: LangGraph Agent Engine & Model Router** (Stateful LangGraph workflows, Specialist Agents, Learning Agent, Ollama/Frontier router)
4. **Phase 4: Medical Knowledge Fabric & Hybrid RAG** (Knowledge graph, `bge-m3` vector search, PubMed/RxNav connectors, Tiers A–V)
5. **Phase 5: Hospital Command Engine & Universal Orders** (Deterministic CPOE pipeline, 40+ handlers, safety levels, audit logging)
6. **Phase 6: Astra Doctor Command Cockpit & 13 Thinking Modes** (Clinical cockpit UI, vitals telemetry, delta tracker, attention queue, voice UX)
7. **Phase 7: Department Workstations** (Reception, Pharmacy, Lab, Radiology, Ward/ICU, OT, Billing, CEO)
8. **Phase 8: Plugin Ecosystem & System Diagnostics** (ChatGPT-style plugin marketplace, permission gate, system health page)
9. **Phase 9: Comprehensive Testing & End-to-End Verification** (Security RBAC tests, deterministic order routing, cross-department live workflows)

---
*Ready to proceed with execution upon user review.*
