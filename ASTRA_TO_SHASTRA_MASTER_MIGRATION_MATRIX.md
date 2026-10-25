# ASTRA → SHASTRA MASTER MIGRATION MATRIX

| ID | Astra Capability | Astra Status | Astra Component | SHASTRA Unified Capability | SHASTRA Component / File | Action Decision | Priority | Security Risk | Clinical Risk | Complexity |
|---|---|---|---|---|---|---|---|---|---|---|
| **MIG-01** | Clinical Command Hub & Pulse | UI + Mock State | `CommandCenterDashboard.tsx` | Live Computed Hospital Pulse & Universal Scanner | `server/db.ts`, `HospitalCommandCenter.tsx` | **COMBINE & IMPROVE** | **P1** | Low | Low | Medium |
| **MIG-02** | Doctor EMR Cockpit | UI + Client State | `DoctorDashboard.tsx` | 360° EMR, Vitals Strip, 3D Organ Canvas, CPOE Quick Orders | `DoctorDashboard.tsx`, `server/command.ts` | **COMBINE & IMPROVE** | **P1** | Medium | High | High |
| **MIG-03** | 13 Clinical Thinking Modes | Prompt Persona | `ClinicalChatPlugin.tsx` | Unified SHASTRA Brain 13 Thinking Modes + LangGraph | `server/langgraph.ts`, `Chat.tsx` | **COMBINE & IMPROVE** | **P1** | Low | High | Medium |
| **MIG-04** | PMJAY 7-Step Card Wizard | UI + Mock NHA API | `PmjayEnrollmentModule.tsx` | PMJAY Scheme Desk + Claims Submission + CMRF Redirect | `FinanceDashboard.tsx`, `PmjayEnrollmentModule.tsx` | **ADOPT & CONNECT** | **P2** | Low | Medium | Medium |
| **MIG-05** | Billing Clearance Queue | UI Calculations | `BillingDashboard.tsx` | Multi-Department Discharge Clearance (Doctor, Pharm, Lab, Bill) | `server/db.ts`, `FinanceDashboard.tsx` | **COMBINE & IMPROVE** | **P1** | High | Low | Medium |
| **MIG-06** | OT Surgical Progression Board | UI Progress Bar | `OTDashboard.tsx` | 8 Discrete Surgical Stages, Turnover Timer, PAC Alerts | `server/db.ts`, `OT.tsx` | **COMBINE & IMPROVE** | **P1** | Low | High | Medium |
| **MIG-07** | Reception & Registration Desk | UI + LocalStorage | `ReceptionDashboard.tsx` | Persistent OP/IP Registration, UHID Generator, PA Broadcast | `server/db.ts`, `ReceptionDashboard.tsx` | **COMBINE & IMPROVE** | **P1** | Medium | Medium | Medium |
| **MIG-08** | Pharmacy Inventory & POS | Client Array | `PharmacyDashboard.tsx` | Persistent Inventory, Reorder Thresholds, Batch/Expiry Alerts, POS Dispensing | `server/db.ts`, `PharmacyDashboard.tsx` | **COMBINE & IMPROVE** | **P1** | Medium | High | Medium |
| **MIG-09** | Laboratory Worklist & Panic Flags | Client Table | `LaboratoryDashboard.tsx` | Sample Tracking, Normal Ranges, Panic Critical Triggers, SSE Alerts | `server/db.ts`, `LabDashboard.tsx`, `server/events.ts` | **COMBINE & IMPROVE** | **P1** | Low | High | High |
| **MIG-10** | Radiology Structured Templates | Client Form | `RadiologyDashboard.tsx` | Pre-built Modality Templates (USG, TVS, TIFFA, KUB, CT, MRI), Voice Dictation | `Radiology.tsx`, `server/db.ts` | **COMBINE & IMPROVE** | **P2** | Low | High | Medium |
| **MIG-11** | Digital Ward & Smart ICU | Client Bed Grid | `SmartIcuBedGrid.tsx` | Color-Coded Bed Grid, Waveforms, Ventilator Tracking, Code Blue Alarm | `server/db.ts`, `WardDashboard.tsx` | **COMBINE & IMPROVE** | **P1** | Low | High | Medium |
| **MIG-12** | Executive CEO Analytics & Digest | Client Numbers | `CEODashboard.tsx` | Real Revenue Rollup, Occupancy Rates, 9 PM WhatsApp Digest Generator | `server/db.ts`, `Dashboard.tsx` | **COMBINE & IMPROVE** | **P2** | Medium | Low | Low |
| **MIG-13** | Universal Print Engine | Browser Window | `PrintableSlipModal.tsx` | Centralized Print Engine (OP Slip, Lab Report, Radiology, e-Rx, Bill) | `src/lib/printEngine.ts` | **COMBINE & IMPROVE** | **P1** | Low | Medium | Low |
| **MIG-14** | Server-Side RBAC & Direct Isolation | Missing (Client Only) | None | Strict Server Middleware, JWT Sessions, HTTP 403 Forbidden | `server/rbac.ts`, `server/index.ts` | **KEEP SHASTRA** | **P0** | Critical | High | High |
| **MIG-15** | Medical Knowledge Fabric (Tiers A-V) | Client Google Search | None | 12,000+ Verified Points, Local bge-m3 Vectors, Hybrid RAG | `server/knowledge.ts` | **KEEP SHASTRA** | **P0** | Low | Critical | High |
| **MIG-16** | ChatGPT-Style Plugin Center | Missing | None | Sandboxed Plugin Center with Capability Permission Scopes | `server/plugins.ts`, `PluginCenter.tsx` | **KEEP SHASTRA** | **P2** | High | Low | Medium |
| **MIG-17** | Real-Time Cross-Department SSE | Missing (Page Reload) | None | Real-Time Server-Sent Events (SSE) Bus `/api/events` | `server/events.ts` | **KEEP SHASTRA** | **P0** | Medium | High | High |
| **MIG-18** | Local Hospital Setup Wizard (18-Step) | Missing | None | 18-Step Hospital Profile Wizard & Activation | `server/db.ts`, `HospitalSetupWizard.tsx` | **KEEP SHASTRA** | **P1** | Medium | Medium | Medium |

### Features What Must NOT Be Copied
1. **Direct SQL / Unsafe LLM DB Mutations**: LLMs must never execute unconstrained SQL against patient records.
2. **Client-Only Mock Security**: Relying on frontend `if (!role)` checks without backend verification.
3. **Manufactured Metric Claims**: Avoid fake "40T parameter" local runtime claims or fake "100% zero hallucination" badges.
4. **Hard-Coded Static Collections**: Billing collections must never be static strings; they must calculate from transactional bill records.
