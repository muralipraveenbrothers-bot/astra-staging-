# SHASTRA AI — ARCHITECTURE OVERVIEW

## 1. System Topology

```
                    SHASTRA AI
          HOSPITAL AI OPERATING SYSTEM
                       |
             DOCTOR CENTRAL COMMAND
             (Clinical AI Cockpit)
                       |
                 SHASTRA BRAIN
                       |
       +---------------+---------------+
       |               |               |
  ORCHESTRATION   MODEL ROUTER     KNOWLEDGE
  (LangGraph)    (Local + Cloud)   (RAG + Graph)
       |               |               |
     Agents     Medical Models      Evidence
       |               |
       +---------------+---------------+
                       |
                 SAFETY / RBAC
             (Server Session Gate)
                       |
                COMMAND ENGINE
          (Deterministic Execution)
                       |
            DETERMINISTIC HOSPITAL
                  WORKFLOWS
                       |
     +-----------------+-----------------+
     |                 |                 |
 RECEPTION          PHARMACY            LAB
 /reception         /pharmacy           /lab
     |
  RADIOLOGY
  /radiology
     |
    WARD
    /ward
     |
     OT
    /ot
     |
    HR
    /hr
     |
   BILLING
   /billing
     |
  INSURANCE
  /insurance
     |
    CEO
    /ceo
```

## 2. Core Pillars

1. **Doctor Central Command Cockpit**: The single intelligence hub for hospital operations, clinical decision support, rounds, and orders.
2. **Deterministic Hospital Command Engine**: All mutations flow through `Intent -> Entity Resolution -> RBAC -> Validation -> Confirmation -> Deterministic API -> Audit -> Real-time Broadcast`.
3. **LangGraph Multi-Agent Orchestrator**: Stateful, checkpointed agent workflows with human-in-the-loop gates.
4. **Medical Knowledge Fabric**: Provenance-tracked knowledge graph + hybrid RAG using local `bge-m3` vectors and tiers A–V.
5. **Server-Side RBAC**: Strict role boundaries returning HTTP 403 on unauthorized routes and actions.
6. **ChatGPT-Style Plugin Center**: Discoverable, permission-gated extensions.
7. **Real-Time Cross-Department Event Fabric**: Server-Sent Events (SSE) bus synchronizing all department terminals.
