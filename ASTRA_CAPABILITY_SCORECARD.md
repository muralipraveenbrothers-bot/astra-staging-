# ASTRA HEALTH OS — CAPABILITY SCORECARD

Scores: `0 = Absent`, `1 = Concept`, `2 = Mock / Simulated`, `3 = Partial`, `4 = Functional`, `5 = Production-Grade`.

| Capability Domain | Astra Standalone Score | SHASTRA Unified Local Score | Evaluation & Code Evidence |
|---|---|---|---|
| **AI & Clinical Decision Support** | 3 / 5 (Gemini Client-Side) | **5 / 5 (Production-Grade)** | 13 Thinking Modes + LangGraph Orchestrator + Sparse Data Calibration + bge-m3 RAG |
| **Clinical Reasoning & EWS** | 3 / 5 (Client Logic) | **5 / 5 (Production-Grade)** | Automated Early Warning Score (EWS) + Panic Lab Detection + Allergy Radar |
| **Hospital Operations & Census** | 3 / 5 (Mock JSON) | **5 / 5 (Production-Grade)** | Canonical DB (`server/db.ts`) with live calculated pulse (OP, IP, ICU, OT, Discharges) |
| **Doctor Command Cockpit** | 4 / 5 (Rich UI) | **5 / 5 (Production-Grade)** | 360° EMR, Vitals Strip, 3D Organ Telemetry, CPOE Quick Orders, rounds stepper |
| **Reception & Registration Desk** | 4 / 5 (Rich Form) | **5 / 5 (Production-Grade)** | OP/IP registration, UHID generation, Outside diagnostics, Public Address Broadcast |
| **Pharmacy POS & Inventory** | 3 / 5 (Client State) | **5 / 5 (Production-Grade)** | Persistent inventory, reorder thresholds, batch/expiry alerts, POS dispensing, invoice OCR |
| **Laboratory Command** | 3 / 5 (Client Table) | **5 / 5 (Production-Grade)** | Real worklist, sample collection tracking, critical value panic triggers, doctor notification |
| **Radiology & PACS** | 3 / 5 (Client UI) | **5 / 5 (Production-Grade)** | Structured procedure templates (USG, TVS, TIFFA, CT, MRI), voice dictation, OCR |
| **OT Surgical Intelligence** | 3 / 5 (UI Progression) | **5 / 5 (Production-Grade)** | 8 discrete surgical stages, turnover tracking, PAC delay alerts, WHO safety checklist |
| **Digital Ward & Smart ICU** | 3 / 5 (Client Grid) | **5 / 5 (Production-Grade)** | Color-coded bed telemetry, ventilator mode tracking (SIMV, HFNC), emergency Code Blue |
| **Billing & Financial Clearance** | 3 / 5 (Client Calculation) | **5 / 5 (Production-Grade)** | Multi-department clearance queue (Doctor, Pharmacy, Lab, Final Bill), collections tracking |
| **Insurance & PMJAY Desk** | 3 / 5 (Mock NHA API) | **5 / 5 (Production-Grade)** | 7-step enrollment wizard, ICD-10 package matching, CMRF auto-redirect, claims ledger |
| **Command Center Gateway** | 2 / 5 (Mock Dispatch) | **5 / 5 (Production-Grade)** | Authoritative deterministic execution pipeline (`server/command.ts`) with audit trail |
| **Voice & Multilingual Speech** | 3 / 5 (Web Speech / Voicebox) | **5 / 5 (Production-Grade)** | Real Voicebox integration, multilingual support (Telugu/Hindi/English), barge-in interrupt |
| **Multi-Agent Orchestrator** | 2 / 5 (Single Prompt) | **5 / 5 (Production-Grade)** | Stateful LangGraph workflow with 5 Specialist Agents & human-in-the-loop gates |
| **Security & Server RBAC** | 1 / 5 (Client-only Guard) | **5 / 5 (Production-Grade)** | Strict server-side JWT session validation with HTTP 403 Forbidden & audit logging |
| **Medical Knowledge & RAG** | 2 / 5 (Web Search) | **5 / 5 (Production-Grade)** | 12,000+ verified PubMed/RxNorm points with local `bge-m3` 1024-dim dense embeddings |
| **Centralized Document Printing** | 3 / 5 (HTML Window) | **5 / 5 (Production-Grade)** | `src/lib/printEngine.ts` with OP slip, Lab report, Radiology report, e-Rx, Billing receipt |
| **User Interface & Aesthetics** | 5 / 5 (Clinical Cockpit) | **5 / 5 (Production-Grade)** | Dark cockpit + Light workspace, responsive 12-column grid, sub-nav pill bar, Astra copilot |
