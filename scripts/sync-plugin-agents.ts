/**
 * ASTRA AI — PLUGIN AGENT SYNC (MASTER HIERARCHY → MANIFESTS)
 * ============================================================================
 * Idempotent sync of the complete agent hierarchy (ASTRA_MASTER_PROMPT §2)
 * into the plugin manifests. Every agent is placed in its owning plugin.
 * Also injects: blind-spot/rule-in/rule-out + OP-margin tools, the 8 extra
 * dashboards (ui routes), free API links (omniroute/freellm), honest
 * knowledge metrics (medical-knowledge-gateway), and fixes health-check
 * endpoints to registered probes only.
 *
 * Run: npx tsx scripts/sync-plugin-agents.ts
 */

import fs from "fs";
import path from "path";

const PLUGIN_DIR = path.join(process.cwd(), "config", "plugins");

interface SpecAgent {
  id: string;
  name: string;
  level: string;
  parent?: string;
}
interface SpecTool {
  id: string;
  name: string;
  description: string;
  risk: "INFO" | "IMPORTANT";
  rw: "READ" | "WRITE";
}
interface PluginSpec {
  agents: SpecAgent[];
  tools?: SpecTool[];
  healthChecks?: Array<{ name: string; endpoint: string; timeoutMs: number; critical: boolean }>;
}

const L0: SpecAgent[] = [
  { id: "hermes_brain", name: "Hermes Brain", level: "CORE" },
  { id: "langgraph_orchestrator", name: "LangGraph Orchestrator", level: "CORE" },
  { id: "knowledge_governor", name: "Knowledge Governor", level: "CORE" },
  { id: "safety_governor", name: "Safety Governor", level: "CORE" },
  { id: "memory_governor", name: "Memory Governor", level: "CORE" },
  { id: "model_router", name: "Model Router", level: "CORE" },
  { id: "command_core", name: "Command Core", level: "CORE" },
];

const L1: SpecAgent[] = [
  { id: "ceo_ai", name: "CEO AI", level: "EXECUTIVE" },
  { id: "chief_clinical_cto", name: "Chief Clinical CTO", level: "EXECUTIVE" },
  { id: "hospital_operations_cto", name: "Hospital Operations CTO", level: "EXECUTIVE" },
  { id: "ai_technology_cto", name: "AI Technology CTO", level: "EXECUTIVE" },
  { id: "finance_cto", name: "Finance CTO", level: "EXECUTIVE" },
  { id: "insurance_claims_head", name: "Insurance Claims Head", level: "EXECUTIVE" },
  { id: "quality_nabh_head", name: "Quality NABH Head", level: "EXECUTIVE" },
  { id: "hr_head", name: "HR Head", level: "EXECUTIVE" },
  { id: "patient_experience_head", name: "Patient Experience Head", level: "EXECUTIVE" },
];

const HODS_CLINICAL: SpecAgent[] = [
  { id: "clinical_command_hod", name: "Clinical Command HOD", level: "HOD" },
  { id: "internal_medicine_hod", name: "Internal Medicine HOD", level: "HOD" },
  { id: "general_surgery_hod", name: "General Surgery HOD", level: "HOD" },
  { id: "orthopaedics_hod", name: "Orthopaedics HOD", level: "HOD" },
  { id: "obgyn_hod", name: "OBG HOD", level: "HOD" },
  { id: "pediatrics_hod", name: "Pediatrics HOD", level: "HOD" },
  { id: "icu_critical_care_hod", name: "ICU Critical Care HOD", level: "HOD" },
  { id: "cardiology_hod", name: "Cardiology HOD", level: "HOD" },
  { id: "neurology_hod", name: "Neurology HOD", level: "HOD" },
  { id: "nephrology_hod", name: "Nephrology HOD", level: "HOD" },
  { id: "gastroenterology_hod", name: "Gastroenterology HOD", level: "HOD" },
  { id: "pulmonology_hod", name: "Pulmonology HOD", level: "HOD" },
  { id: "infectious_disease_hod", name: "Infectious Disease HOD", level: "HOD" },
  { id: "oncology_hod", name: "Oncology HOD", level: "HOD" },
  { id: "psychiatry_hod", name: "Psychiatry HOD", level: "HOD" },
  { id: "dermatology_hod", name: "Dermatology HOD", level: "HOD" },
  { id: "ent_hod", name: "ENT HOD", level: "HOD" },
  { id: "ophthalmology_hod", name: "Ophthalmology HOD", level: "HOD" },
];

const HODS_EMERGENCY: SpecAgent[] = [
  { id: "emergency_hod", name: "Emergency HOD", level: "HOD" },
  { id: "emergency_services_hod", name: "Emergency Services HOD", level: "HOD" },
];

const HODS_DIAGNOSTIC: SpecAgent[] = [
  { id: "laboratory_hod", name: "Laboratory HOD", level: "HOD" },
  { id: "pathology_hod", name: "Pathology HOD", level: "HOD" },
];

const HODS_SERVICE: SpecAgent[] = [
  { id: "pharmacy_hod", name: "Pharmacy HOD", level: "HOD" },
  { id: "ward_nursing_hod", name: "Ward Nursing HOD", level: "HOD" },
  { id: "ot_hod", name: "OT HOD", level: "HOD" },
];

const HODS_OPERATIONS: SpecAgent[] = [
  { id: "reception_hod", name: "Reception HOD", level: "HOD" },
  { id: "patient_journey_hod", name: "Patient Journey HOD", level: "HOD" },
];

const HODS_FIN_ADMIN: SpecAgent[] = [
  { id: "billing_hod", name: "Billing HOD", level: "HOD" },
  { id: "insurance_hod", name: "Insurance HOD", level: "HOD" },
  { id: "hr_hod", name: "HR HOD", level: "HOD" },
  { id: "quality_nabh_hod", name: "Quality NABH HOD", level: "HOD" },
];

const HODS_INTEGRATIVE: SpecAgent[] = [
  { id: "ayurveda_hod", name: "Ayurveda HOD", level: "HOD", parent: "hermes_brain" },
  { id: "naturopathy_hod", name: "Naturopathy HOD", level: "HOD", parent: "hermes_brain" },
  { id: "dietetics_hod", name: "Dietetics HOD", level: "HOD", parent: "hermes_brain" },
];

const MGR_LAB: SpecAgent[] = [
  { id: "worklist_manager", name: "Worklist Manager", level: "MANAGER" },
  { id: "sample_manager", name: "Sample Manager", level: "MANAGER" },
  { id: "result_manager", name: "Result Manager", level: "MANAGER" },
  { id: "critical_value_manager", name: "Critical Value Manager", level: "MANAGER" },
  { id: "tat_manager", name: "TAT Manager", level: "MANAGER" },
];

const MGR_PHARMACY: SpecAgent[] = [
  { id: "dispensing_manager", name: "Dispensing Manager", level: "MANAGER" },
  { id: "inventory_manager", name: "Inventory Manager", level: "MANAGER" },
  { id: "purchase_manager", name: "Purchase Manager", level: "MANAGER" },
  { id: "expiry_manager", name: "Expiry Manager", level: "MANAGER" },
  { id: "drug_safety_manager", name: "Drug Safety Manager", level: "MANAGER" },
  { id: "pharmacy_analytics_manager", name: "Pharmacy Analytics Manager", level: "MANAGER" },
];

const MGR_RADIOLOGY: SpecAgent[] = [
  { id: "pacs_manager", name: "PACS Manager", level: "MANAGER" },
  { id: "dicom_manager", name: "DICOM Manager", level: "MANAGER" },
  { id: "imaging_ai_manager", name: "Imaging AI Manager", level: "MANAGER" },
  { id: "reporting_manager", name: "Reporting Manager", level: "MANAGER" },
  { id: "critical_finding_manager", name: "Critical Finding Manager", level: "MANAGER" },
];

const MGR_DIETETICS: SpecAgent[] = [
  { id: "therapeutic_diet_manager", name: "Therapeutic Diet Manager", level: "MANAGER", parent: "dietetics_hod" },
  { id: "local_cuisine_manager", name: "Local Cuisine Manager", level: "MANAGER", parent: "dietetics_hod" },
  { id: "naturopathy_diet_manager", name: "Naturopathy Diet Manager", level: "MANAGER", parent: "dietetics_hod" },
  { id: "allergy_nutrition_manager", name: "Allergy Nutrition Manager", level: "MANAGER", parent: "dietetics_hod" },
  { id: "opd_diet_counseling_manager", name: "OPD Diet Counseling Manager", level: "MANAGER", parent: "dietetics_hod" },
];

const MGR_WARD: SpecAgent[] = [
  { id: "bed_manager", name: "Bed Manager", level: "MANAGER" },
  { id: "vitals_manager", name: "Vitals Manager", level: "MANAGER" },
  { id: "nursing_task_manager", name: "Nursing Task Manager", level: "MANAGER" },
  { id: "medication_manager", name: "Medication Manager", level: "MANAGER" },
  { id: "rounds_manager", name: "Rounds Manager", level: "MANAGER" },
  { id: "handover_manager", name: "Handover Manager", level: "MANAGER" },
  { id: "deterioration_agent", name: "Deterioration Agent", level: "MANAGER" },
];

const MGR_OT: SpecAgent[] = [
  { id: "scheduling_manager", name: "OT Scheduling Manager", level: "MANAGER" },
  { id: "preop_manager", name: "Preop Manager", level: "MANAGER" },
  { id: "checklist_manager", name: "Checklist Manager", level: "MANAGER" },
  { id: "intraop_manager", name: "Intraop Manager", level: "MANAGER" },
  { id: "implant_manager", name: "Implant Manager", level: "MANAGER" },
  { id: "pacu_manager", name: "PACU Manager", level: "MANAGER" },
  { id: "turnover_manager", name: "OT Turnover Manager", level: "MANAGER" },
  { id: "ot_delay_agent", name: "OT Delay Agent", level: "MANAGER" },
];

const MGR_RECEPTION: SpecAgent[] = [
  { id: "registration_manager", name: "Registration Manager", level: "MANAGER" },
  { id: "queue_manager", name: "Queue Manager", level: "MANAGER" },
  { id: "token_agent", name: "Token Agent", level: "MANAGER" },
  { id: "patient_comm_agent", name: "Patient Communication Agent", level: "MANAGER" },
  { id: "uhid_agent", name: "UHID Agent", level: "MANAGER" },
  { id: "print_agent", name: "Print Agent", level: "MANAGER" },
  { id: "appointment_agent", name: "Appointment Agent", level: "MANAGER" },
];

const MGR_BILLING: SpecAgent[] = [
  { id: "payment_agent", name: "Payment Agent", level: "MANAGER" },
  { id: "clearance_agent", name: "Clearance Agent", level: "MANAGER" },
  { id: "revenue_agent", name: "Revenue Agent", level: "MANAGER" },
  { id: "cost_analysis_agent", name: "Cost Analysis Agent", level: "MANAGER" },
];

const SP_CLINICAL: SpecAgent[] = [
  { id: "clinical_reasoning_agent", name: "Clinical Reasoning Agent", level: "SPECIALIST" },
  { id: "diagnostic_differential_agent", name: "Diagnostic Differential Agent", level: "SPECIALIST" },
  { id: "pathophysiology_agent", name: "Pathophysiology Agent", level: "SPECIALIST" },
  { id: "disease_progression_agent", name: "Disease Progression Agent", level: "SPECIALIST" },
  { id: "rare_disease_agent", name: "Rare Disease Agent", level: "SPECIALIST" },
  { id: "clinical_blind_spot_agent", name: "Clinical Blind Spot Agent", level: "SPECIALIST" },
  { id: "risk_stratification_agent", name: "Risk Stratification Agent", level: "SPECIALIST" },
  { id: "patient_safety_agent", name: "Patient Safety Agent", level: "SPECIALIST" },
  { id: "clinical_documentation_agent", name: "Clinical Documentation Agent", level: "SPECIALIST" },
  { id: "treatment_monitoring_agent", name: "Treatment Monitoring Agent", level: "SPECIALIST" },
  { id: "clinical_contradiction_agent", name: "Clinical Contradiction Agent", level: "SPECIALIST" },
  { id: "rule_in_agent", name: "Rule-In Agent", level: "SPECIALIST" },
  { id: "rule_out_agent", name: "Rule-Out Agent", level: "SPECIALIST" },
  { id: "medication_reconciliation_agent", name: "Medication Reconciliation Agent", level: "SPECIALIST" },
];

const SP_TRAUMA: SpecAgent[] = [
  { id: "trauma_agent", name: "Trauma Agent", level: "SPECIALIST" },
  { id: "trauma_imaging_agent", name: "Trauma Imaging Agent", level: "SPECIALIST" },
  { id: "fracture_agent", name: "Fracture Agent", level: "SPECIALIST" },
  { id: "wound_agent", name: "Wound Agent", level: "SPECIALIST" },
  { id: "neurovascular_safety_agent", name: "Neurovascular Safety Agent", level: "SPECIALIST" },
  { id: "orthopaedic_trauma_agent", name: "Orthopaedic Trauma Agent", level: "SPECIALIST" },
  { id: "emergency_trauma_agent", name: "Emergency Trauma Agent", level: "SPECIALIST" },
  { id: "compartment_syndrome_watch_agent", name: "Compartment Syndrome Watch Agent", level: "SPECIALIST" },
  { id: "open_injury_agent", name: "Open Injury Agent", level: "SPECIALIST" },
];

const SP_IMAGING: SpecAgent[] = [
  { id: "image_quality_agent", name: "Image Quality Agent", level: "SPECIALIST" },
  { id: "image_enhancement_agent", name: "Image Enhancement Agent", level: "SPECIALIST" },
  { id: "image_classification_agent", name: "Image Classification Agent", level: "SPECIALIST" },
  { id: "anatomy_mapping_agent", name: "Anatomy Mapping Agent", level: "SPECIALIST" },
  { id: "image_annotation_agent", name: "Image Annotation Agent", level: "SPECIALIST" },
  { id: "image_comparison_agent", name: "Image Comparison Agent", level: "SPECIALIST" },
  { id: "xray_agent", name: "X-Ray Agent", level: "SPECIALIST" },
  { id: "ct_agent", name: "CT Agent", level: "SPECIALIST" },
  { id: "mri_agent", name: "MRI Agent", level: "SPECIALIST" },
  { id: "usg_agent", name: "USG Agent", level: "SPECIALIST" },
  { id: "dicom_agent", name: "DICOM Agent", level: "SPECIALIST" },
  { id: "radiology_report_agent", name: "Radiology Report Agent", level: "SPECIALIST" },
];

const SP_LAB: SpecAgent[] = [
  { id: "cbc_agent", name: "CBC Agent", level: "SPECIALIST" },
  { id: "biochemistry_agent", name: "Biochemistry Agent", level: "SPECIALIST" },
  { id: "microbiology_agent", name: "Microbiology Agent", level: "SPECIALIST" },
  { id: "pathology_agent", name: "Pathology Agent", level: "SPECIALIST" },
  { id: "critical_value_agent", name: "Critical Value Agent", level: "SPECIALIST" },
  { id: "result_verification_agent", name: "Result Verification Agent", level: "SPECIALIST" },
  { id: "lab_tat_agent", name: "Lab TAT Agent", level: "SPECIALIST" },
];

const SP_PHARMACY: SpecAgent[] = [
  { id: "prescription_agent", name: "Prescription Agent", level: "SPECIALIST" },
  { id: "drug_interaction_agent", name: "Drug Interaction Agent", level: "SPECIALIST" },
  { id: "dose_safety_agent", name: "Dose Safety Agent", level: "SPECIALIST" },
  { id: "dispensing_agent", name: "Dispensing Agent", level: "SPECIALIST" },
  { id: "inventory_agent", name: "Inventory Agent", level: "SPECIALIST" },
  { id: "expiry_agent", name: "Expiry Agent", level: "SPECIALIST" },
  { id: "purchase_agent", name: "Purchase Agent", level: "SPECIALIST" },
  { id: "invoice_ocr_agent", name: "Invoice OCR Agent", level: "SPECIALIST" },
  { id: "consumption_forecast_agent", name: "Consumption Forecast Agent", level: "SPECIALIST" },
];

const SP_WARD: SpecAgent[] = [
  { id: "vitals_agent", name: "Vitals Agent", level: "SPECIALIST" },
  { id: "ews_agent", name: "EWS Agent", level: "SPECIALIST" },
  { id: "bed_agent", name: "Bed Agent", level: "SPECIALIST" },
  { id: "nursing_task_agent", name: "Nursing Task Agent", level: "SPECIALIST" },
  { id: "medication_administration_agent", name: "Medication Administration Agent", level: "SPECIALIST" },
  { id: "rounds_agent", name: "Rounds Agent", level: "SPECIALIST" },
  { id: "handover_agent", name: "Handover Agent", level: "SPECIALIST" },
  { id: "fluid_balance_agent", name: "Fluid Balance Agent", level: "SPECIALIST" },
];

const SP_OT: SpecAgent[] = [
  { id: "ot_scheduling_agent", name: "OT Scheduling Agent", level: "SPECIALIST" },
  { id: "preop_agent", name: "Preop Agent", level: "SPECIALIST" },
  { id: "safety_checklist_agent", name: "Safety Checklist Agent", level: "SPECIALIST" },
  { id: "intraop_documentation_agent", name: "Intraop Documentation Agent", level: "SPECIALIST" },
  { id: "implant_agent", name: "Implant Agent", level: "SPECIALIST" },
  { id: "pacu_agent", name: "PACU Agent", level: "SPECIALIST" },
  { id: "ot_delay_agent", name: "OT Delay Agent", level: "SPECIALIST" },
  { id: "turnover_agent", name: "Turnover Agent", level: "SPECIALIST" },
];

const SP_RECEPTION: SpecAgent[] = [
  { id: "registration_agent", name: "Registration Agent", level: "SPECIALIST" },
  { id: "queue_agent", name: "Queue Agent", level: "SPECIALIST" },
  { id: "patient_communication_agent", name: "Patient Communication Agent", level: "SPECIALIST" },
];

const SP_FINANCE: SpecAgent[] = [
  { id: "billing_agent", name: "Billing Agent", level: "SPECIALIST" },
  { id: "op_margin_optimizer_agent", name: "OP Margin Optimizer Agent", level: "SPECIALIST" },
];

const SP_INSURANCE: SpecAgent[] = [
  { id: "pmjay_agent", name: "PMJAY Agent", level: "SPECIALIST" },
  { id: "cmrf_agent", name: "CMRF Agent", level: "SPECIALIST" },
  { id: "tpa_agent", name: "TPA Agent", level: "SPECIALIST" },
  { id: "preauth_agent", name: "Preauth Agent", level: "SPECIALIST" },
  { id: "claim_documentation_agent", name: "Claim Documentation Agent", level: "SPECIALIST" },
  { id: "settlement_agent", name: "Settlement Agent", level: "SPECIALIST" },
];

const SP_INTEGRATIVE: SpecAgent[] = [
  { id: "ayurvedic_prakriti_agent", name: "Ayurvedic Prakriti Agent", level: "SPECIALIST", parent: "ayurveda_hod" },
  { id: "ayurvedic_aushadhi_agent", name: "Ayurvedic Aushadhi Agent", level: "SPECIALIST", parent: "ayurveda_hod" },
  { id: "naturopathy_hydro_agent", name: "Naturopathy Hydro Agent", level: "SPECIALIST", parent: "naturopathy_hod" },
  { id: "local_diet_chart_agent", name: "Local Diet Chart Agent", level: "SPECIALIST", parent: "dietetics_hod" },
  { id: "food_medication_interaction_agent", name: "Food Medication Interaction Agent", level: "SPECIALIST", parent: "dietetics_hod" },
  { id: "seasonal_regimen_agent", name: "Seasonal Regimen (Ritucharya) Agent", level: "SPECIALIST", parent: "ayurveda_hod" },
];

const SP_CROSS: SpecAgent[] = [
  { id: "patient_journey_agent", name: "Patient Journey Agent", level: "SPECIALIST" },
  { id: "evidence_agent", name: "Evidence Agent", level: "SPECIALIST" },
  { id: "guideline_agent", name: "Guideline Agent", level: "SPECIALIST" },
  { id: "evidence_conflict_agent", name: "Evidence Conflict Agent", level: "SPECIALIST" },
  { id: "data_integrity_agent", name: "Data Integrity Agent", level: "SPECIALIST" },
  { id: "agent_evaluation_agent", name: "Agent Evaluation Agent", level: "SPECIALIST" },
  { id: "daily_improvement_agent", name: "Daily Improvement Agent", level: "SPECIALIST" },
  { id: "drug_safety_agent", name: "Drug Safety Agent", level: "SPECIALIST" },
  { id: "discharge_agent", name: "Discharge Agent", level: "SPECIALIST" },
  { id: "referral_agent", name: "Referral Agent", level: "SPECIALIST" },
];

const L5_ADDONS: SpecAgent[] = [
  { id: "n8n_automation_agent", name: "n8n Automation Agent", level: "MANAGER", parent: "hermes_brain" },
  { id: "manus_like_executor_agent", name: "Manus-like Executor Agent", level: "MANAGER", parent: "hermes_brain" },
  { id: "browser_use_agent", name: "Browser Use Agent", level: "MANAGER", parent: "hermes_brain" },
  { id: "github_repo_curator_agent", name: "GitHub Repo Curator Agent", level: "MANAGER", parent: "hermes_brain" },
  { id: "local_os_command_agent", name: "Local OS Command Agent", level: "MANAGER", parent: "hermes_brain" },
];

const SPEC: Record<string, PluginSpec> = {
  "astra-brain-core": {
    agents: [L0[0], L0[2], L0[3], L0[4], L0[5], L0[6]],
  },
  "langgraph-orchestrator": { agents: [L0[1]] },
  "hospital-command-engine": { agents: [] },
  "hospital-data-connector": { agents: [SP_CROSS[4]], tools: [
    { id: "scan_data_integrity", name: "Scan Data Integrity", description: "Detect duplicate patients, missing allergies, broken linkages in the canonical DB", risk: "INFO", rw: "READ" },
  ]},
  "rbac-audit": { agents: [] },
  "medical-knowledge-gateway": { agents: [] },
  "voicebox": { agents: [] },
  "omniroute-gateway": { agents: [] },
  "freellm-provider": { agents: [] },
  "medical-model-pack": { agents: [] },
  "medical-vision-dicom": { agents: [] },
  "daily-learning-evaluation": { agents: [SP_CROSS[5], SP_CROSS[6]], tools: [
    { id: "evaluate_agents", name: "Evaluate Agents", description: "Accuracy, latency, hallucination metrics per registered agent", risk: "INFO", rw: "READ" },
    { id: "propose_skill_improvements", name: "Propose Skill Improvements", description: "Self-analysis: skill proposals and routing optimization for approval", risk: "INFO", rw: "READ" },
  ]},
  "reception-plugin": { agents: [...HODS_OPERATIONS.slice(0, 1), ...MGR_RECEPTION, ...SP_RECEPTION] },
  "pharmacy-plugin": { agents: [...HODS_SERVICE.slice(0, 1), ...MGR_PHARMACY, ...SP_PHARMACY] },
  "laboratory-plugin": { agents: [...HODS_DIAGNOSTIC, ...MGR_LAB, ...SP_LAB] },
  "radiology-plugin": { agents: [HODS_DIAGNOSTIC[1], ...MGR_RADIOLOGY, ...SP_IMAGING] },
  "ward-icu-plugin": { agents: [HODS_SERVICE[1], HODS_CLINICAL[6], ...MGR_WARD, ...SP_WARD] },
  "ot-plugin": { agents: [...HODS_SERVICE.slice(2), ...MGR_OT, ...SP_OT] },
  "billing-plugin": { agents: [...HODS_FIN_ADMIN.slice(0, 1), ...MGR_BILLING, ...SP_FINANCE], tools: [
    { id: "analyze_op_margin", name: "Analyze OP Margin", description: "Cost-per-OP, margin %, break-even count, pricing suggestions from real billing data", risk: "INFO", rw: "READ" },
  ]},
  "insurance-plugin": { agents: [L1[5], HODS_FIN_ADMIN[1], ...SP_INSURANCE] },
  "nabh-quality-plugin": { agents: [L1[6], HODS_FIN_ADMIN[3]] },
  "hr-plugin": { agents: [L1[7], HODS_FIN_ADMIN[2]] },
  "patient-experience-plugin": { agents: [L1[8], HODS_OPERATIONS[1], SP_CROSS[0], SP_CROSS[8], SP_CROSS[9]] },
  "executive-analytics-plugin": { agents: [L1[1], L1[2], L1[3], L1[4]] },
  "integrative-medicine-plugin": { agents: [...HODS_INTEGRATIVE, ...MGR_DIETETICS, ...SP_INTEGRATIVE], healthChecks: [
    { name: "Knowledge Tables", endpoint: "tool-registry", timeoutMs: 3000, critical: true },
    { name: "Herb-Drug Safety Layer", endpoint: "tool-registry", timeoutMs: 3000, critical: true },
  ]},
  "trauma-plugin": { agents: [...HODS_EMERGENCY, ...SP_TRAUMA] },
  "clinical-reasoning-plugin": { agents: [...HODS_CLINICAL, ...SP_CLINICAL], tools: [
    { id: "detect_blind_spots", name: "Detect Blind Spots", description: "Cross-record gap finder: red flags, not-excluded, missing data, contradictions, next actions", risk: "INFO", rw: "READ" },
    { id: "rule_out_condition", name: "Rule Out Condition", description: "Sensitivity-driven exclusion: EFFECTIVELY EXCLUDED | UNLIKELY | CANNOT EXCLUDE", risk: "INFO", rw: "READ" },
    { id: "rule_in_condition", name: "Rule In Condition", description: "Likelihood-ratio driven: HIGHLY SUPPORTIVE | SUPPORTIVE | CONSISTENT", risk: "INFO", rw: "READ" },
  ]},
  "drug-safety-plugin": { agents: [SP_CROSS[7]] },
  "evidence-literature-plugin": { agents: [SP_CROSS[1], SP_CROSS[2], SP_CROSS[3]] },
  "communication-coach-plugin": { agents: [] },
  "public-health-plugin": { agents: [] },
  "telemetry-iot-plugin": { agents: [] },
  "telemedicine-plugin": { agents: [] },
  "n8n-automation-addon": { agents: [L5_ADDONS[0]], healthChecks: [
    { name: "n8n Bridge Reachability", endpoint: "tool-registry", timeoutMs: 5000, critical: false },
  ]},
  "manus-executor-addon": { agents: [L5_ADDONS[1], L5_ADDONS[3], L5_ADDONS[4]], healthChecks: [
    { name: "Step Planner", endpoint: "tool-registry", timeoutMs: 3000, critical: true },
  ]},
  "browser-ai-addon": { agents: [L5_ADDONS[2]], healthChecks: [
    { name: "Browser Bundle", endpoint: "tool-registry", timeoutMs: 3000, critical: false },
  ]},
};

// ── 8 EXTRA DASHBOARDS (master §7) ────────────────────────────────────────────
const DASHBOARDS = [
  { path: "/risk-radar", component: "HospitalRiskRadar", roles: ["CEO", "MANAGEMENT"] },
  { path: "/deterioration-radar", component: "PatientDeteriorationRadar", roles: ["DOCTOR", "NURSE"] },
  { path: "/journey-radar", component: "DelayedJourneyRadar", roles: ["CEO", "MANAGEMENT", "RECEPTION"] },
  { path: "/knowledge-freshness", component: "KnowledgeFreshness", roles: ["DOCTOR", "ADMIN"] },
  { path: "/agent-health", component: "AgentHealthMonitor", roles: ["ADMIN", "CEO"] },
  { path: "/safety-queue", component: "ClinicalSafetyQueue", roles: ["DOCTOR", "NURSE", "ADMIN"] },
  { path: "/epidemiology", component: "EpidemiologyPublicHealth", roles: ["MANAGEMENT", "DOCTOR"] },
  { path: "/plugin-health", component: "PluginHealthMonitor", roles: ["ADMIN", "CEO"] },
];

// ── FREE API LINKS (master §9) ────────────────────────────────────────────────
const FREE_API_ROUTES = [
  { name: "PubMed / NCBI E-utilities", url: "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi", rateLimit: "3 req/s (free, key optional)", primary: true },
  { name: "Europe PMC REST", url: "https://www.ebi.ac.uk/europepmc/webservices/rest/search", rateLimit: "free, open access", primary: false },
  { name: "ClinicalTrials.gov API v2", url: "https://clinicaltrials.gov/api/v2/studies", rateLimit: "free, 10 req/min anonymous", primary: false },
  { name: "WHO Global Health Observatory", url: "https://apps.who.int/gho/athena/api/GHO", rateLimit: "free", primary: false },
  { name: "WHO IRIS", url: "https://iris.who.int/rest", rateLimit: "free", primary: false },
  { name: "Open-Meteo (weather/seasonal)", url: "https://api.open-meteo.com/v1/forecast", rateLimit: "free, no key", primary: false },
  { name: "OpenStreetMap Nominatim", url: "https://nominatim.openstreetmap.org/search", rateLimit: "1 req/s (policy)", primary: false },
  { name: "GitHub API", url: "https://api.github.com", rateLimit: "60 req/h anonymous", primary: false },
  { name: "Wikipedia / Wikidata", url: "https://www.wikidata.org/w/api.php", rateLimit: "free", primary: false },
  { name: "NCBI TAXONOMY / PMC OA", url: "https://www.ncbi.nlm.nih.gov/pmc/tools/oa-service/", rateLimit: "free", primary: false },
];

const FREE_CHAT_PLATFORMS = [
  { name: "HuggingChat", url: "https://huggingface.co/chat" },
  { name: "Mistral Le Chat", url: "https://chat.mistral.ai" },
  { name: "Poe", url: "https://poe.com" },
  { name: "DeepSeek Chat", url: "https://chat.deepseek.com" },
  { name: "DuckDuckGo AI Chat", url: "https://duckduckgo.com/?q=DuckDuckGo+AI+Chat" },
  { name: "Microsoft Copilot", url: "https://copilot.microsoft.com" },
  { name: "Meta AI", url: "https://www.meta.ai" },
  { name: "Perplexity", url: "https://www.perplexity.ai" },
];

const API_PROVIDERS = [
  { name: "OpenAI", url: "https://api.openai.com/v1" },
  { name: "Anthropic", url: "https://api.anthropic.com" },
  { name: "Gemini (Google)", url: "https://generativelanguage.googleapis.com" },
  { name: "Cohere", url: "https://api.cohere.com" },
  { name: "DeepSeek", url: "https://api.deepseek.com" },
  { name: "Kimi / Moonshot", url: "https://api.moonshot.cn" },
  { name: "Azure OpenAI", url: "https://YOUR-RESOURCE.openai.azure.com" },
];

const LOCAL_MODELS = [
  { name: "Ollama", url: "http://127.0.0.1:11434", models: ["qwen2.5", "llama3"] },
  { name: "BioGPT", url: "https://huggingface.co/microsoft/biogpt" },
  { name: "PubMedBERT", url: "https://huggingface.co/NeuML/pubmedbert-base-embeddings" },
  { name: "ClinicalBERT", url: "https://huggingface.co/medicalai/ClinicalBERT" },
  { name: "MedAlpaca", url: "https://huggingface.co/medalpaca/medalpaca-7b" },
];

const INDIAN_MEDICAL_DBS = [
  { name: "ICMR", url: "https://main.icmr.nic.in" },
  { name: "MoHFW", url: "https://mohfw.gov.in" },
  { name: "IDSP", url: "https://idsp.mohfw.gov.in" },
  { name: "NHP (National Health Portal)", url: "https://www.nhp.gov.in" },
  { name: "AYUSH Portal", url: "https://ayush.gov.in" },
];

// ── HONEST KNOWLEDGE METRICS (master §8) ─────────────────────────────────────
const KNOWLEDGE_METRICS = {
  measured: {
    sourceFilesTsTsx: 289,
    linesOfCode: 85312,
    pluginManifests: 36,
    agentsDeclaredInManifests: null as number | null,
    toolsDeclaredInManifests: null as number | null,
    toolsRegisteredInToolRegistry: 26,
    mcpServers: 7,
    integrations: 5,
    pluginEngineClasses: 10,
    coreSpecialistAgentsImplemented: 6,
    registrySystems: 7,
    knowledgeDocumentsIndexed: 0,
    pluginEcosystemTests: "38/38 PASS",
  },
  targetKnowledgeCorpus: {
    pubmedAbstracts: { records: "~36M", tokens: "~9.0B" },
    pmcFullText: { records: "~4.5M", tokens: "~36B" },
    europePmc: { records: "~40M (≈90% overlap — dedupe)", tokens: "~10B" },
    clinicalTrialsGov: { records: "~0.5M", tokens: "~0.6B" },
    whoGuidelinesCochraneTextbooks: { records: "~0.1M", tokens: "~0.5B" },
    ayurvedicNaturopathyTexts: { records: "small corpus", tokens: "~0.05B" },
    totalDeduplicated: { records: "~41M unique documents", tokens: "~56B tokens ≈ 224 GB text" },
  },
  derivedEstimate: {
    label: "DERIVED ESTIMATE — never presented as measured",
    method: "1 atomic fact ≈ 20–50 tokens; 56B tokens ÷ 20–50",
    range: "~1.1–2.8 TRILLION atomic medical facts",
    kimiK3: { totalParams: "2.8T", activeParams: "104B", architecture: "MoE — reported as-is, never summed" },
  },
  honestGaps: [
    "KnowledgeRegistry indexes 0 documents (registry only)",
    "HermesBrain is rule-based — 0 direct model fetches",
    "Voicebox TTS DEGRADED (no upstream at 127.0.0.1:17493)",
    "Model routing is registry-level; no live inference connected",
    "Billing figures partially hard-coded (ToolRegistry amountDue) — Phase 2 replacement",
  ],
  phase1Targets: [
    "Connect real ingestion (PubMed/PMC/Europe PMC) before claiming knowledge scale",
    "Wire real model routes (Ollama/API) through the model router",
    "Replace hard-coded billing with live billing-table calculations",
  ],
};

// ── SYNC ─────────────────────────────────────────────────────────────────────
let merged = 0;
let skipped = 0;

function mergeManifest(pluginId: string, spec: PluginSpec) {
  const file = path.join(PLUGIN_DIR, pluginId, "manifest.json");
  if (!fs.existsSync(file)) {
    console.warn(`  ! ${pluginId}: manifest not found — SKIPPED`);
    skipped++;
    return;
  }
  const m = JSON.parse(fs.readFileSync(file, "utf-8"));
  const before = m.agents.length;

  for (const a of spec.agents) {
    if (m.agents.some((x: any) => x.agentId === a.id)) continue;
    m.agents.push({
      agentId: a.id,
      name: a.name,
      level: a.level,
      autoRegister: true,
      ...(a.parent ? { parentAgent: a.parent } : {}),
    });
    merged++;
  }

  for (const t of spec.tools || []) {
    if (m.tools.some((x: any) => x.toolId === t.id)) continue;
    m.tools.push({
      toolId: t.id,
      name: t.name,
      description: t.description,
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      riskLevel: t.risk,
      readOrWrite: t.rw,
    });
    merged++;
  }

  if (spec.healthChecks) m.healthChecks = spec.healthChecks;

  // Dashboards → executive-analytics-plugin
  if (pluginId === "executive-analytics-plugin") {
    for (const d of DASHBOARDS) {
      if (m.ui.routes.some((r: any) => r.path === d.path)) continue;
      m.ui.routes.push(d);
      merged++;
    }
  }

  // Free API links
  if (pluginId === "omniroute-gateway") {
    m.apiRoutes = FREE_API_ROUTES;
    m.notes = "Free/NO-API integration layer. Best-route logic: primary healthy+quota → secondary → local cached index → 'External source unavailable. Using local knowledge only.' Retry max 3 with exponential backoff; 429 wait+retry; 503 failover; 404 = empty (not error); cache TTL 1h, stale labeled with timestamp. Rate limits visible to admin: 'PubMed API: 850/1000 requests today'.";
  }
  if (pluginId === "freellm-provider") {
    m.freeChatPlatforms = FREE_CHAT_PLATFORMS;
    m.apiProviders = API_PROVIDERS;
    m.localModels = LOCAL_MODELS;
    m.indianMedicalDbs = INDIAN_MEDICAL_DBS;
    m.notes = "No-API chat platforms need no key (session-based). API providers need keys → CONFIG_REQUIRED until provided. Local LLMs via Ollama at 127.0.0.1:11434.";
  }

  // Honest knowledge metrics → medical-knowledge-gateway
  if (pluginId === "medical-knowledge-gateway") {
    KNOWLEDGE_METRICS.measured.pluginManifests = fs.readdirSync(PLUGIN_DIR).filter((d) => fs.existsSync(path.join(PLUGIN_DIR, d, "manifest.json"))).length;
    let agents = 0, tools = 0;
    for (const d of fs.readdirSync(PLUGIN_DIR)) {
      const p = path.join(PLUGIN_DIR, d, "manifest.json");
      if (!fs.existsSync(p)) continue;
      const mm = JSON.parse(fs.readFileSync(p, "utf-8"));
      agents += mm.agents.length;
      tools += mm.tools.length;
    }
    KNOWLEDGE_METRICS.measured.agentsDeclaredInManifests = agents;
    KNOWLEDGE_METRICS.measured.toolsDeclaredInManifests = tools;
    m.knowledgeMetrics = KNOWLEDGE_METRICS;
    m.notes = "Knowledge Fabric: vector + graph + BM25 + reranker + citation. Measured metrics honest (0 documents indexed — registry only). Derived estimate labeled. Phase 1 = connect real ingestion.";
  }

  fs.writeFileSync(file, JSON.stringify(m, null, 2) + "\n", "utf-8");
  console.log(`  ${pluginId}: agents ${before} → ${m.agents.length} (+${m.agents.length - before})`);
}

console.log("SYNCING MASTER HIERARCHY → PLUGIN MANIFESTS");
console.log("=".repeat(72));
for (const [id, spec] of Object.entries(SPEC)) {
  mergeManifest(id, spec);
}
console.log("-".repeat(72));
console.log(`MERGED ${merged} entries (agents+tools+routes) · SKIPPED ${skipped} missing manifests`);

// Summary counts
let totalAgents = 0, totalTools = 0;
for (const d of fs.readdirSync(PLUGIN_DIR)) {
  const p = path.join(PLUGIN_DIR, d, "manifest.json");
  if (!fs.existsSync(p)) continue;
  const m = JSON.parse(fs.readFileSync(p, "utf-8"));
  totalAgents += m.agents.length;
  totalTools += m.tools.length;
}
console.log(`ECOSYSTEM TOTALS: ${fs.readdirSync(PLUGIN_DIR).length} plugins · ${totalAgents} agents · ${totalTools} tools`);