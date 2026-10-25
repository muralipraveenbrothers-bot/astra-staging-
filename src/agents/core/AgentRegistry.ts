/**
 * ASTRA AI — AGENT REGISTRY (1.1)
 * ============================================================================
 * Canonical registry for discovering, registering, updating, and health-checking
 * all agents across the ASTRA AI hierarchy.
 */

import { AgentRecord, AgentLevel, AgentStatus, RiskLevel } from "./AgentDefinition";

class AgentRegistryService {
  private registry: Map<string, AgentRecord> = new Map();

  constructor() {
    this.seedDefaultAgents();
  }

  private seedDefaultAgents() {
    const defaultAgents: AgentRecord[] = [
      // 1. CORE BRAIN & ORCHESTRATION
      {
        agentId: "hermes_brain",
        name: "Hermes Central Clinical Brain",
        version: "2026.08.14",
        level: "CORE",
        parentAgent: null,
        domain: "Clinical Intelligence",
        role: "Supervisory Clinical Intelligence & Reasoning",
        objective: "Synthesize medical data, orchestrate specialist agents, identify blind spots, and calibrate differential diagnosis.",
        scope: "Hospital-wide clinical reasoning",
        constraints: ["Cannot mutate database without CommandEngine", "Cannot prescribe autonomously", "Must enforce RBAC"],
        permissions: ["ai:clinical_reasoning", "ai:evidence_search"],
        riskLevel: "INFO",
        perceptionSchema: {},
        capabilitySchema: { toolIds: ["searchMedicalKnowledge", "retrieveGuideline", "checkDrugInteraction"] },
        learningExamples: [],
        knowledgeSources: ["PubMed", "ClinicalTrials.gov", "HospitalProtocols"],
        memoryPolicy: "WORKING_AND_EPISODIC",
        modelPolicy: "HERMES_REASONING_TIER",
        verificationPolicy: "UNIVERSAL_VERIFIER_STRICT",
        outputSchema: {},
        status: "ACTIVE",
        health: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        agentId: "langgraph_orchestrator",
        name: "LangGraph Orchestrator Core",
        version: "2026.08.14",
        level: "CORE",
        parentAgent: null,
        domain: "System Orchestration",
        role: "Workflow State & Agent Sequencing",
        objective: "Manage multi-agent state machines, step boundaries, retries, and human-in-the-loop approval gates.",
        scope: "System-wide graph execution",
        constraints: ["Max 10 steps for standard graphs", "Max 20 steps for deep clinical graphs", "Strict token budget"],
        permissions: ["admin:agent"],
        riskLevel: "INFO",
        perceptionSchema: {},
        capabilitySchema: { toolIds: [] },
        learningExamples: [],
        knowledgeSources: [],
        memoryPolicy: "SESSION_STATE",
        modelPolicy: "DETERMINISTIC",
        verificationPolicy: "GRAPH_INVARIANT_CHECK",
        outputSchema: {},
        status: "ACTIVE",
        health: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        agentId: "validator_agent",
        name: "Universal Validator Agent",
        version: "2026.08.14",
        level: "CORE",
        parentAgent: "hermes_brain",
        domain: "Safety & Verification",
        role: "Output Verification & Safety Guardrail",
        objective: "Perform 10 mandatory safety and factual grounding checks prior to delivering final outputs.",
        scope: "All agent outputs",
        constraints: ["Cannot be bypassed by any role or model", "Max 2 retries before escalating to human"],
        permissions: ["ai:verification"],
        riskLevel: "INFO",
        perceptionSchema: {},
        capabilitySchema: { toolIds: [] },
        learningExamples: [],
        knowledgeSources: [],
        memoryPolicy: "EPISODIC_AUDIT",
        modelPolicy: "FAST_VERIFIER",
        verificationPolicy: "SELF_CONSISTENCY",
        outputSchema: {},
        status: "ACTIVE",
        health: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },

      // 2. CORE SPECIALIST AGENTS (PHASE 1)
      {
        agentId: "hospital_query_agent",
        name: "Hospital Query Agent",
        version: "2026.08.14",
        level: "SPECIALIST",
        parentAgent: "hermes_brain",
        domain: "Hospital Operations",
        role: "Deterministic Hospital Data Retrieval",
        objective: "Retrieve live hospital census, bed occupancy, queues, and status with <500ms latency and 0% LLM hallucination.",
        scope: "Hospital operations data",
        constraints: ["Deterministic DB queries only", "No LLM hallucinations"],
        permissions: ["patient:read", "lab:read", "radiology:read", "pharmacy:dispense", "billing:read"],
        riskLevel: "INFO",
        perceptionSchema: {},
        capabilitySchema: {
          toolIds: [
            "getHospitalCensus", "getIPPatients", "getOPPatients", "getICUPatients",
            "getWardPatients", "getLabQueue", "getRadiologyQueue", "getPharmacyQueue",
            "getOTStatus", "getBillingSummary"
          ]
        },
        learningExamples: [],
        knowledgeSources: ["HospitalDB"],
        memoryPolicy: "SESSION_ONLY",
        modelPolicy: "NONE_DETERMINISTIC",
        verificationPolicy: "DATA_INTEGRITY_CHECK",
        outputSchema: {},
        status: "ACTIVE",
        health: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        agentId: "patient_context_agent",
        name: "Patient Context Agent",
        version: "2026.08.14",
        level: "SPECIALIST",
        parentAgent: "hermes_brain",
        domain: "Clinical Records",
        role: "Patient Record & Timeline Assembly",
        objective: "Resolve patient identities, retrieve chronological timelines, vitals, active medications, and lab results.",
        scope: "Patient clinical charts",
        constraints: ["Must enforce patient authorization scope", "No cross-patient contamination"],
        permissions: ["patient:read", "patient:read_clinical"],
        riskLevel: "INFO",
        perceptionSchema: {},
        capabilitySchema: {
          toolIds: ["getPatient", "getPatientTimeline", "getVitals", "getActiveMedications", "getLabResult", "getRadiologyReport"]
        },
        learningExamples: [],
        knowledgeSources: ["HospitalDB"],
        memoryPolicy: "PATIENT_MEMORY_AUDITED",
        modelPolicy: "DETERMINISTIC_PLUS_FAST",
        verificationPolicy: "PATIENT_IDENTITY_CHECK",
        outputSchema: {},
        status: "ACTIVE",
        health: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        agentId: "command_agent",
        name: "Command Execution Agent",
        version: "2026.08.14",
        level: "MANAGER",
        parentAgent: "hermes_brain",
        domain: "Hospital Mutations",
        role: "Authorized Mutation Orchestration",
        objective: "Parse, validate, authorize, and execute hospital orders, bed transfers, task creation, and clinical actions through CommandEngine.",
        scope: "All state-modifying actions",
        constraints: ["Must pass through CommandEngine", "High-risk actions require confirmation", "Server-side RBAC mandatory"],
        permissions: ["order:create", "patient:write", "lab:verify", "radiology:verify"],
        riskLevel: "IMPORTANT",
        perceptionSchema: {},
        capabilitySchema: {
          toolIds: ["createLabOrder", "createRadiologyOrder", "createPrescription", "createTask", "transferBed", "updateOTStatus"]
        },
        learningExamples: [],
        knowledgeSources: ["HospitalDB"],
        memoryPolicy: "EPISODIC_AUDIT",
        modelPolicy: "DETERMINISTIC",
        verificationPolicy: "COMMAND_VALIDATOR",
        outputSchema: {},
        status: "ACTIVE",
        health: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        agentId: "clinical_reasoning_agent",
        name: "Clinical Reasoning Specialist Agent",
        version: "2026.08.14",
        level: "SPECIALIST",
        parentAgent: "hermes_brain",
        domain: "Clinical Medicine",
        role: "Diagnostic Differential & Pathophysiology Reasoning",
        objective: "Execute 13 thinking modes, differential calibration, multi-system trajectory analysis, and blind-spot identification.",
        scope: "Clinical diagnostics and care planning",
        constraints: ["Cannot issue prescriptions autonomously", "Must state explicit uncertainty on sparse data"],
        permissions: ["ai:clinical_reasoning"],
        riskLevel: "INFO",
        perceptionSchema: {},
        capabilitySchema: { toolIds: ["searchMedicalKnowledge", "retrieveGuideline", "checkDrugInteraction", "getPatientTimeline"] },
        learningExamples: [],
        knowledgeSources: ["PubMed", "ClinicalTrials.gov", "SpecialtyGuidelines"],
        memoryPolicy: "WORKING_MEMORY",
        modelPolicy: "FRONTIER_REASONING",
        verificationPolicy: "EVIDENCE_GROUNDING",
        outputSchema: {},
        status: "ACTIVE",
        health: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        agentId: "evidence_agent",
        name: "Medical Evidence & Literature Agent",
        version: "2026.08.14",
        level: "SPECIALIST",
        parentAgent: "hermes_brain",
        domain: "Medical Research",
        role: "PubMed & Guideline Retrieval",
        objective: "Retrieve and score peer-reviewed literature, official guidelines, and clinical trial evidence with real citations.",
        scope: "Biomedical literature",
        constraints: ["Never fabricate PMID, DOI, or trial IDs", "Tag evidence hierarchy Tiers A through V"],
        permissions: ["ai:evidence_search"],
        riskLevel: "INFO",
        perceptionSchema: {},
        capabilitySchema: { toolIds: ["searchPubMed", "retrieveGuideline", "queryKnowledgeGraph"] },
        learningExamples: [],
        knowledgeSources: ["PubMed", "PMC", "EuropePMC", "ClinicalTrials.gov", "WHO"],
        memoryPolicy: "SEMANTIC_MEMORY",
        modelPolicy: "MEDICAL_SPECIALIST",
        verificationPolicy: "REAL_CITATION_VERIFIER",
        outputSchema: {},
        status: "ACTIVE",
        health: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        agentId: "image_agent",
        name: "Medical Image & Trauma Intelligence Agent",
        version: "2026.08.14",
        level: "SPECIALIST",
        parentAgent: "hermes_brain",
        domain: "Radiology & Vision",
        role: "Multimodal Imaging & Anatomical Mapping",
        objective: "Analyze radiology, DICOM series, wound photographs, verify image quality, detect anatomical structures, and enforce neurovascular checklists.",
        scope: "Medical vision and imaging",
        constraints: ["Must not declare neurovascular intact from image alone", "Preserve original images intact"],
        permissions: ["ai:image_analysis", "radiology:read"],
        riskLevel: "INFO",
        perceptionSchema: {},
        capabilitySchema: { toolIds: ["analyzeImage", "compareImages", "getDICOMSeries", "createRadiologyOrder"] },
        learningExamples: [],
        knowledgeSources: ["DICOMArchive", "AnatomyOntology"],
        memoryPolicy: "PATIENT_MEMORY_AUDITED",
        modelPolicy: "MEDICAL_VISION",
        verificationPolicy: "ANATOMY_CONSISTENCY",
        outputSchema: {},
        status: "ACTIVE",
        health: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        agentId: "voice_agent",
        name: "Voicebox Multilingual Agent",
        version: "2026.08.14",
        level: "SPECIALIST",
        parentAgent: "hermes_brain",
        domain: "Voice & Speech",
        role: "Voice Ingestion, VAD, & Streaming Audio Response",
        objective: "Handle real-time streaming speech-to-text, barge-in interrupt handling, and streaming TTS across 3 human-like voices.",
        scope: "Speech processing in 5 languages",
        constraints: ["Zero patient private data spoken in public reception mode", "Immediate stop on user interruption"],
        permissions: ["ai:voice_command"],
        riskLevel: "INFO",
        perceptionSchema: {},
        capabilitySchema: { toolIds: ["transcribeVoice", "speakVoice", "sendNotification"] },
        learningExamples: [],
        knowledgeSources: ["VoiceboxModelPack"],
        memoryPolicy: "SESSION_ONLY",
        modelPolicy: "VOICEBOX_STREAMING",
        verificationPolicy: "TRANSCRIPT_CONFIDENCE_GATE",
        outputSchema: {},
        status: "ACTIVE",
        health: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        agentId: "clinical_copilot_agent",
        name: "Astra Clinical Co-Pilot Agent",
        version: "2026.08.17",
        level: "SPECIALIST",
        parentAgent: "hermes_brain",
        domain: "Medical Imaging & Trauma",
        role: "Layer-by-Layer Anatomical Identification & Clinical Prioritization",
        objective: "Analyze ANY uploaded medical image (trauma, surgical, radiograph, clinical) with structured layer-by-layer anatomical identification, injury assessment, and triage prioritization guidance.",
        scope: "Universal medical image analysis for EMR integration",
        constraints: [
          "Cannot declare neurovascular intact from image alone",
          "Cannot provide definitive treatment prescriptions (drug dosages, suture techniques, anesthesia)",
          "Must always include clinical decision support disclaimer",
          "Must flag pediatric patients if age indicators present"
        ],
        permissions: ["ai:image_analysis", "radiology:read", "patient:read"],
        riskLevel: "INFO",
        perceptionSchema: {},
        capabilitySchema: { toolIds: ["analyzeClinicalImage", "analyzeImage", "createRadiologyOrder", "getPatient"] },
        learningExamples: [],
        knowledgeSources: ["DICOMArchive", "AnatomyOntology", "TraumaProtocols"],
        memoryPolicy: "PATIENT_MEMORY_AUDITED",
        modelPolicy: "MEDICAL_VISION",
        verificationPolicy: "ANATOMY_CONSISTENCY",
        outputSchema: {},
        status: "ACTIVE",
        health: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      // 3. DEEP SPECIALIST ENGINES & ADVANCED CLINICAL AGENTS
      {
        agentId: "susruta_clinical_superbrain",
        name: "Susruta Clinical Superbrain (Hope Engine V3)",
        version: "2026.08.14",
        level: "SPECIALIST",
        parentAgent: "hermes_brain",
        domain: "Clinical Diagnostics & Rare Disease",
        role: "5-Step Diagnostic Sieve & Zebra Hunter",
        objective: "Execute the 5-stage diagnostic loop (Ingestion → Cross-ref → Differential sieve → Rule-in/out → Human judgment) and trigger Hope Engine V3 zebra hunting for undiagnosed cases >48h.",
        scope: "Hospital-wide clinical reasoning & rare diseases",
        constraints: ["Never auto-prescribe", "All outputs advisory awaiting doctor approval", "Derived probabilities labeled"],
        permissions: ["ai:clinical_reasoning", "ai:evidence_search"],
        riskLevel: "INFO",
        perceptionSchema: {},
        capabilitySchema: { toolIds: ["runHopeEngine", "susrutaAnalyze", "searchGlobalCase"] },
        learningExamples: [],
        knowledgeSources: ["PubMed", "RareDiseaseDB", "HospitalProtocols"],
        memoryPolicy: "WORKING_AND_EPISODIC",
        modelPolicy: "HERMES_REASONING_TIER",
        verificationPolicy: "UNIVERSAL_VERIFIER_STRICT",
        outputSchema: {},
        status: "ACTIVE",
        health: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        agentId: "clinical_blind_spot_agent",
        name: "Clinical Blind-Spot & Cognitive Bias Detector",
        version: "2026.08.14",
        level: "SPECIALIST",
        parentAgent: "hermes_brain",
        domain: "Diagnostic Safety",
        role: "5-Quadrant Diagnostic Safety Matrix & Rule-In/Out",
        objective: "Screen every patient context for Must-Not-Miss life threats, unexcluded differentials, missing critical data, and contradicting evidence.",
        scope: "Diagnostic error prevention and cognitive de-biasing",
        constraints: ["Must evaluate on every patient context switch", "No fake data derivation"],
        permissions: ["ai:clinical_reasoning", "patient:read_clinical"],
        riskLevel: "INFO",
        perceptionSchema: {},
        capabilitySchema: { toolIds: ["detectBlindSpots", "evaluateRuleIn", "evaluateRuleOut"] },
        learningExamples: [],
        knowledgeSources: ["DiagnosticSafetyMatrix", "HospitalDB"],
        memoryPolicy: "WORKING_MEMORY",
        modelPolicy: "FRONTIER_REASONING",
        verificationPolicy: "EVIDENCE_GROUNDING",
        outputSchema: {},
        status: "ACTIVE",
        health: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        agentId: "mitra_wellness_agent",
        name: "Mitra Patient Wellness & Jargon Simplifier",
        version: "2026.08.14",
        level: "SPECIALIST",
        parentAgent: "hermes_brain",
        domain: "Patient Communication & Wellness",
        role: "Medical Jargon Simplification & Multilingual Discharge Guidance",
        objective: "Translate complex clinical diagnoses into empathetic, 5th-grade readable patient guides, discharge advice, and family counseling in 5 languages (EN, TE, HI, TA, KN).",
        scope: "Patient education, family counseling, discharge instructions",
        constraints: ["Flesch-Kincaid grade level calibrated", "Must flag clinical review required"],
        permissions: ["ai:voice_command", "patient:read"],
        riskLevel: "INFO",
        perceptionSchema: {},
        capabilitySchema: { toolIds: ["simplifyJargon", "generateDischargeInstructions", "generateDietPlan", "generateCounselingScript"] },
        learningExamples: [],
        knowledgeSources: ["PatientEducationProtocols", "MultilingualOntology"],
        memoryPolicy: "SESSION_ONLY",
        modelPolicy: "EMPATHETIC_PHYSICIAN",
        verificationPolicy: "READABILITY_GATE",
        outputSchema: {},
        status: "ACTIVE",
        health: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        agentId: "molecular_cascade_agent",
        name: "Molecular Intelligence Cascade Engine",
        version: "2026.08.14",
        level: "SPECIALIST",
        parentAgent: "hermes_brain",
        domain: "Pathophysiology & Molecular Medicine",
        role: "7-Stage Pathophysiological Trajectory Solver",
        objective: "Compute deterministic 7-stage molecular, organelle, cellular, microvascular, organ, systemic, and clinical trajectories for symptoms.",
        scope: "Deep pathophysiology analysis and symptom etiology",
        constraints: ["Deterministic knowledge engine linked to real patient vitals and labs"],
        permissions: ["ai:clinical_reasoning"],
        riskLevel: "INFO",
        perceptionSchema: {},
        capabilitySchema: { toolIds: ["computeMolecularCascade", "mapCellularStress", "calculateSIRSPath"] },
        learningExamples: [],
        knowledgeSources: ["PathophysiologyOntology", "HarrisonMedical"],
        memoryPolicy: "SEMANTIC_MEMORY",
        modelPolicy: "MEDICAL_SPECIALIST",
        verificationPolicy: "MECHANISM_CONSISTENCY",
        outputSchema: {},
        status: "ACTIVE",
        health: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        agentId: "surgical_roadmap_agent",
        name: "Surgical Roadmap & Perioperative Planner",
        version: "2026.08.14",
        level: "SPECIALIST",
        parentAgent: "hermes_brain",
        domain: "Surgery & Operative Planning",
        role: "AO/WebSurg 10-Stage Pathway & ASA Risk Stratifier",
        objective: "Generate structured 10-stage surgical pathways, ASA physical status scores, operative positioning, fixation approaches, and complication failure prevention.",
        scope: "Perioperative surgical planning and risk scoring",
        constraints: ["Surgeon holds final decision authority", "Must screen non-surgical mimics"],
        permissions: ["ai:clinical_reasoning", "order:create"],
        riskLevel: "INFO",
        perceptionSchema: {},
        capabilitySchema: { toolIds: ["generateSurgicalRoadmap", "estimateASAScore", "planOperativeFixation"] },
        learningExamples: [],
        knowledgeSources: ["AO_Surgery_Reference", "WebSurg", "WHO_Surgical_Safety"],
        memoryPolicy: "WORKING_AND_EPISODIC",
        modelPolicy: "SURGICAL_SPECIALIST",
        verificationPolicy: "ANATOMY_CONSISTENCY",
        outputSchema: {},
        status: "ACTIVE",
        health: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        agentId: "vent_brain",
        name: "Vent-Brain ICU Ventilator Co-Pilot",
        version: "2026.08.14",
        level: "SPECIALIST",
        parentAgent: "hermes_brain",
        domain: "Critical Care & Pulmonology",
        role: "Driving Pressure Monitor, RSBI Weaning Predictor & ABG Interpreter",
        objective: "Calculate lung-protective driving pressures (Plateau - PEEP), Rapid Shallow Breathing Index (RSBI) weaning readiness, and Stewart ABG acid-base classification.",
        scope: "ICU mechanical ventilation and arterial blood gas analysis",
        constraints: ["Driving pressure alert when >14 cmH2O", "Advisory ICU decision support only"],
        permissions: ["ai:clinical_reasoning", "patient:read_clinical"],
        riskLevel: "INFO",
        perceptionSchema: {},
        capabilitySchema: { toolIds: ["calculateDrivingPressure", "assessRSBIWeaning", "interpretABG"] },
        learningExamples: [],
        knowledgeSources: ["ARDSNetProtocols", "StewartAcidBase"],
        memoryPolicy: "SESSION_ONLY",
        modelPolicy: "DETERMINISTIC",
        verificationPolicy: "DATA_INTEGRITY_CHECK",
        outputSchema: {},
        status: "ACTIVE",
        health: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        agentId: "tox_command",
        name: "Tox-Command Emergency Toxicology & Antidotes",
        version: "2026.08.14",
        level: "SPECIALIST",
        parentAgent: "hermes_brain",
        domain: "Emergency Medicine & Toxicology",
        role: "Toxidrome Pattern Matcher, Nomogram Plotter & Antidote Calculator",
        objective: "Recognize acute poisoning toxidromes (OP, Opioids, Paracetamol, Snakebite), plot Rumack-Matthew nomogram, and calculate weight-based antidote protocols.",
        scope: "Emergency envenomation, overdoses, and antidote management",
        constraints: ["Must include clinical titration endpoints (e.g. dried secretions for atropine)"],
        permissions: ["ai:clinical_reasoning", "order:create"],
        riskLevel: "IMPORTANT",
        perceptionSchema: {},
        capabilitySchema: { toolIds: ["matchToxidrome", "calculateAntidoteDose", "plotRumackMatthew"] },
        learningExamples: [],
        knowledgeSources: ["ToxicologyProtocols", "WHO_Snakebite_Guidelines"],
        memoryPolicy: "WORKING_MEMORY",
        modelPolicy: "DETERMINISTIC_PLUS_FAST",
        verificationPolicy: "EVIDENCE_GROUNDING",
        outputSchema: {},
        status: "ACTIVE",
        health: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        agentId: "op_margin_optimizer",
        name: "OP Margin & Consumable Cost Optimizer",
        version: "2026.08.14",
        level: "MANAGER",
        parentAgent: "hermes_brain",
        domain: "Hospital Finance & Operations",
        role: "Cost-per-OP, Break-Even & Financial Margin Calibration",
        objective: "Compute procedure-level margins (Charge - Materials - Staff - Overhead), daily break-even patient volumes, and flag loss-making consumable procedures.",
        scope: "Hospital financial optimization and consumable tracking",
        constraints: ["Uses institutional rate cards and transparent cost models"],
        permissions: ["billing:read", "admin:agent"],
        riskLevel: "INFO",
        perceptionSchema: {},
        capabilitySchema: { toolIds: ["calculateOpMargins", "projectBreakEven", "optimizeConsumableCosts"] },
        learningExamples: [],
        knowledgeSources: ["HospitalRateCard", "BillingLedger"],
        memoryPolicy: "EPISODIC_AUDIT",
        modelPolicy: "DETERMINISTIC",
        verificationPolicy: "DATA_INTEGRITY_CHECK",
        outputSchema: {},
        status: "ACTIVE",
        health: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        agentId: "pragnya_coordinator",
        name: "Pragnya Multi-Agent Consensus Coordinator",
        version: "2026.08.14",
        level: "CORE",
        parentAgent: "hermes_brain",
        domain: "Multidisciplinary Orchestration",
        role: "Specialist Conflict Reconciliation & Risk-Benefit Synthesis",
        objective: "Reconcile conflicting specialist agent recommendations, weigh clinical urgency, and formulate unified multidisciplinary consensus recommendations.",
        scope: "Cross-specialty conflict resolution and risk balancing",
        constraints: ["Must provide transparent rationale for resolved trade-offs"],
        permissions: ["ai:clinical_reasoning"],
        riskLevel: "INFO",
        perceptionSchema: {},
        capabilitySchema: { toolIds: ["reconcileSpecialistConflict", "weighRiskBenefit", "synthesizeMDTPlan"] },
        learningExamples: [],
        knowledgeSources: ["MDTGuidelines", "HospitalProtocols"],
        memoryPolicy: "WORKING_AND_EPISODIC",
        modelPolicy: "FRONTIER_REASONING",
        verificationPolicy: "UNIVERSAL_VERIFIER_STRICT",
        outputSchema: {},
        status: "ACTIVE",
        health: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        agentId: "bio_sim_engine",
        name: "Bio-Sim Hemodynamic & Acid-Base Simulator",
        version: "2026.08.14",
        level: "SPECIALIST",
        parentAgent: "hermes_brain",
        domain: "Physiological Simulation",
        role: "SVR, Cardiac Output, DO2 & Stewart Acid-Base Calculation",
        objective: "Simulate cardiovascular and metabolic dynamics under critical care interventions (fluid challenges, vasopressor titration, Stewart SIDa calculations).",
        scope: "Hemodynamic and acid-base mathematical simulation",
        constraints: ["Mathematical deterministic calculations only"],
        permissions: ["ai:clinical_reasoning", "patient:read_clinical"],
        riskLevel: "INFO",
        perceptionSchema: {},
        capabilitySchema: { toolIds: ["calculateSVR", "calculateDO2", "calculateStewartSIDa"] },
        learningExamples: [],
        knowledgeSources: ["PhysiologyMathEngine"],
        memoryPolicy: "SESSION_ONLY",
        modelPolicy: "DETERMINISTIC",
        verificationPolicy: "DATA_INTEGRITY_CHECK",
        outputSchema: {},
        status: "ACTIVE",
        health: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        agentId: "cerebellum_filter",
        name: "Cerebellum Real-Time Safety & Empathy Filter",
        version: "2026.08.14",
        level: "CORE",
        parentAgent: "hermes_brain",
        domain: "Safety & Communication",
        role: "Real-Time Bias, Hallucination & Empathy Filtering",
        objective: "Filter AI outputs in sub-milliseconds to ensure medical facts are strictly grounded while clinical language is empathetic and de-escalating.",
        scope: "All outward AI clinical communication",
        constraints: ["Must never alter factual medical data", "Must operate in <10ms"],
        permissions: ["ai:verification"],
        riskLevel: "INFO",
        perceptionSchema: {},
        capabilitySchema: { toolIds: ["screenTone", "checkHallucination", "deescalateLanguage"] },
        learningExamples: [],
        knowledgeSources: ["SafetyGuardrails"],
        memoryPolicy: "SESSION_ONLY",
        modelPolicy: "FAST_VERIFIER",
        verificationPolicy: "SELF_CONSISTENCY",
        outputSchema: {},
        status: "ACTIVE",
        health: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        agentId: "shield_guardian",
        name: "Shield Core Security & Audit Gatekeeper",
        version: "2026.08.14",
        level: "CORE",
        parentAgent: "hermes_brain",
        domain: "Security, Governance & Compliance",
        role: "RBAC Scope Enforcer & Immutable Audit Logger",
        objective: "Enforce permission scopes (READ_CLINICAL, USE_MODEL, CREATE_ORDER), prevent unauthorized data mutations, and log immutable AuditEvents per HIPAA/DPDP.",
        scope: "Hospital-wide access control and compliance logging",
        constraints: ["Cannot be bypassed by any user role", "Every mutation must be logged"],
        permissions: ["admin:agent", "admin:system"],
        riskLevel: "CRITICAL",
        perceptionSchema: {},
        capabilitySchema: { toolIds: ["enforceRBAC", "logAuditEvent", "verifyScope"] },
        learningExamples: [],
        knowledgeSources: ["SecurityPolicy", "AuditLogStore"],
        memoryPolicy: "EPISODIC_AUDIT",
        modelPolicy: "DETERMINISTIC",
        verificationPolicy: "DATA_INTEGRITY_CHECK",
        outputSchema: {},
        status: "ACTIVE",
        health: 100,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    for (const agent of defaultAgents) {
      this.registry.set(agent.agentId, agent);
    }
  }

  public register(agent: AgentRecord): void {
    agent.updatedAt = new Date().toISOString();
    this.registry.set(agent.agentId, agent);
  }

  public get(agentId: string): AgentRecord | undefined {
    return this.registry.get(agentId);
  }

  public list(): AgentRecord[] {
    return Array.from(this.registry.values());
  }

  public listActive(): AgentRecord[] {
    return this.list().filter(a => a.status === "ACTIVE");
  }

  public update(agentId: string, updates: Partial<AgentRecord>): AgentRecord | undefined {
    const existing = this.registry.get(agentId);
    if (!existing) return undefined;
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    this.registry.set(agentId, updated);
    return updated;
  }

  public enable(agentId: string): boolean {
    const agent = this.registry.get(agentId);
    if (agent) {
      agent.status = "ACTIVE";
      agent.updatedAt = new Date().toISOString();
      return true;
    }
    return false;
  }

  public disable(agentId: string): boolean {
    const agent = this.registry.get(agentId);
    if (agent) {
      agent.status = "DISABLED";
      agent.updatedAt = new Date().toISOString();
      return true;
    }
    return false;
  }

  public health(agentId: string): number {
    return this.registry.get(agentId)?.health ?? 0;
  }

  public version(agentId: string): string {
    return this.registry.get(agentId)?.version ?? "0.0.0";
  }
}

export const AgentRegistry = new AgentRegistryService();
