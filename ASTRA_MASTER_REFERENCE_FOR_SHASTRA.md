# ASTRA MASTER REFERENCE FOR SHASTRA AI
## The Unified Clinical & Hospital AI Operating System Blueprint

---

### 1. Functional & Workflow Architecture

```
FUNCTION
   ↓
WORKFLOW
   ↓
UI (Astra Clinical Cockpit + 14 Sub-Nav Terminals)
   ↓
UX (Micro-Interactions, Emergency Beacons, Floating Copilot)
   ↓
AI (13 Clinical Thinking Modes + LangGraph Specialist Pool)
   ↓
DATA (Canonical Transactional Store + Cryptographic Audit)
   ↓
BACKEND (Unified Express Server on Port 3000)
   ↓
SECURITY (Strict Server-Side RBAC + 403 Forbidden Gate)
   ↓
VOICE (Voicebox Multilingual STT/TTS with Barge-In Interrupt)
   ↓
AGENTS (Stateful Graphs, Human Checkpoints, Learning Agent)
   ↓
AUTOMATION (Real-Time SSE Sync & Deterministic CPOE)
```

---

### 2. What SHASTRA Should Become

```
                             SHASTRA BRAIN
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
      Hermes                   Paperclip             Specialist Agents
 (Planning / Tools)     (Background Schedulers)   (Clinical, Drug Safety,
         │                         │               Evidence, Ops, Skills)
         │                         │                         │
         └─────────────────────────┼─────────────────────────┘
                                   │
                              Model Router
                     (Local Ollama + Frontier Cloud)
                                   │
                   ┌───────────────┴───────────────┐
                   │                               │
              Local LLMs                      Cloud LLMs
           (bge-m3, Llama 3.2)            (Kimi K3, Gemini, Claude)
                   │                               │
                   └───────────────┬───────────────┘
                                   │
                        Medical Knowledge Fabric
                  (12,000+ Verified Points, RAG, Graph)
                                   │
                                Voicebox
                 (Multilingual Voice + Barge-in Interruption)
                                   │
                               Command Bus
                                   │
                             CommandEngine
                       (Deterministic Execution)
                                   │
                            Server-Side RBAC
                                   │
                            Hospital System
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
    Reception                  Pharmacy                   Laboratory
  /reception                   /pharmacy                     /lab
        │                          │                          │
    Radiology                  Ward & ICU                     OT
   /radiology                    /ward                       /ot
        │                          │                          │
     Billing                   Insurance                     CEO
    /billing                  /insurance                     /ceo
```

### Combined Architecture Strengths

| Layer | ASTRA Contribution | SHASTRA Contribution | Unified Outcome |
|---|---|---|---|
| **UI & UX** | High-density clinical cockpit, horizontal department pill bar, dark/light theme toggle | Clean layout components, responsive 12-column grid | World-class clinical cockpit interface with 0-clutter navigation |
| **Intelligence** | 13-mode clinical thinking framework | LangGraph stateful multi-agent orchestrator & Sparse Data Reasoning | Fully grounded, calibrated clinical reasoning with must-not-miss red flags |
| **Evidence & RAG** | Evidence query UI | 12,000+ verified PubMed/RxNorm points with local `bge-m3` vectors | Real-time literature grounding across Tiers A–V with exact citation provenance |
| **Operations** | 10 hospital pulse metrics & bottleneck queues | Canonical transactional database (`server/db.ts`) | Live computed hospital pulse (`85/100`), real occupancy, and SLA escalation |
| **Security & RBAC** | Role route definitions | Strict server-side JWT session validation & 403 Forbidden | Zero-bypass role isolation with cryptographic audit trail |
| **Execution** | Quick order triggers | Deterministic Command Engine with CPOE pipeline | Zero direct SQL by LLMs; 100% auditable deterministic mutations |
| **Voice** | Floating microphone orb | Voicebox multilingual STT/TTS with live barge-in | Seamless hands-free clinical voice interface in Telugu, Hindi, and English |
