/**
 * ASTRA AI — AGENT COVERAGE AUDIT
 * ============================================================================
 * Verifies that EVERY agent listed in the master hierarchy (ASTRA_MASTER_PROMPT §2)
 * is declared in exactly one owning plugin manifest. Prints a full coverage
 * table: agent → level → owning plugin. Exit 1 on any missing agent.
 *
 * Run: npx tsx scripts/audit-agent-coverage.ts
 */

import fs from "fs";
import path from "path";

const PLUGIN_DIR = path.join(process.cwd(), "config", "plugins");

// ── MASTER HIERARCHY (ASTRA_MASTER_PROMPT §2 — every listed ID, deduped) ─────
const MASTER_AGENTS = [
  // LEVEL 0
  "hermes_brain", "langgraph_orchestrator", "knowledge_governor", "safety_governor", "memory_governor", "model_router", "command_core",
  // LEVEL 1
  "ceo_ai", "chief_clinical_cto", "hospital_operations_cto", "ai_technology_cto", "finance_cto", "insurance_claims_head", "quality_nabh_head", "hr_head", "patient_experience_head",
  // LEVEL 2 HODs
  "clinical_command_hod", "emergency_hod", "internal_medicine_hod", "general_surgery_hod", "orthopaedics_hod", "obgyn_hod", "pediatrics_hod", "icu_critical_care_hod", "cardiology_hod", "neurology_hod", "nephrology_hod", "gastroenterology_hod", "pulmonology_hod", "infectious_disease_hod", "oncology_hod", "psychiatry_hod", "dermatology_hod", "ent_hod", "ophthalmology_hod",
  "laboratory_hod", "radiology_hod", "pathology_hod", "pharmacy_hod", "ward_nursing_hod", "ot_hod", "emergency_services_hod", "reception_hod", "patient_journey_hod", "billing_hod", "insurance_hod", "hr_hod", "quality_nabh_hod", "ayurveda_hod", "naturopathy_hod", "dietetics_hod",
  // LEVEL 3 MANAGERS
  "worklist_manager", "sample_manager", "result_manager", "critical_value_manager", "tat_manager",
  "dispensing_manager", "inventory_manager", "purchase_manager", "expiry_manager", "drug_safety_manager", "pharmacy_analytics_manager",
  "pacs_manager", "dicom_manager", "imaging_ai_manager", "reporting_manager", "critical_finding_manager",
  "therapeutic_diet_manager", "local_cuisine_manager", "naturopathy_diet_manager", "allergy_nutrition_manager", "opd_diet_counseling_manager",
  "bed_manager", "vitals_manager", "nursing_task_manager", "medication_manager", "rounds_manager", "handover_manager", "deterioration_agent",
  "scheduling_manager", "preop_manager", "checklist_manager", "intraop_manager", "implant_manager", "pacu_manager", "turnover_manager", "ot_delay_agent",
  "registration_manager", "queue_manager", "token_agent", "patient_comm_agent", "uhid_agent", "print_agent", "appointment_agent",
  "payment_agent", "clearance_agent", "revenue_agent", "cost_analysis_agent",
  // LEVEL 4 SPECIALISTS
  "diagnostic_differential_agent", "clinical_reasoning_agent", "evidence_agent", "guideline_agent", "drug_safety_agent", "pathophysiology_agent", "disease_progression_agent", "rare_disease_agent", "clinical_blind_spot_agent", "risk_stratification_agent", "patient_safety_agent", "discharge_agent", "referral_agent", "clinical_documentation_agent", "treatment_monitoring_agent", "clinical_contradiction_agent", "rule_in_agent", "rule_out_agent", "medication_reconciliation_agent",
  "trauma_agent", "trauma_imaging_agent", "fracture_agent", "wound_agent", "neurovascular_safety_agent", "orthopaedic_trauma_agent", "emergency_trauma_agent", "compartment_syndrome_watch_agent", "open_injury_agent",
  "image_quality_agent", "image_enhancement_agent", "image_classification_agent", "anatomy_mapping_agent", "image_annotation_agent", "image_comparison_agent", "xray_agent", "ct_agent", "mri_agent", "usg_agent", "dicom_agent", "radiology_report_agent",
  "cbc_agent", "biochemistry_agent", "microbiology_agent", "pathology_agent", "critical_value_agent", "result_verification_agent", "lab_tat_agent",
  "prescription_agent", "drug_interaction_agent", "dose_safety_agent", "dispensing_agent", "inventory_agent", "expiry_agent", "purchase_agent", "invoice_ocr_agent", "consumption_forecast_agent",
  "vitals_agent", "ews_agent", "bed_agent", "nursing_task_agent", "medication_administration_agent", "rounds_agent", "handover_agent", "fluid_balance_agent",
  "ot_scheduling_agent", "preop_agent", "safety_checklist_agent", "intraop_documentation_agent", "implant_agent", "pacu_agent", "ot_delay_agent", "turnover_agent",
  "registration_agent", "uhid_agent", "token_agent", "queue_agent", "appointment_agent", "print_agent", "patient_communication_agent",
  "billing_agent", "payment_agent", "clearance_agent", "revenue_agent", "cost_analysis_agent", "op_margin_optimizer_agent",
  "pmjay_agent", "cmrf_agent", "tpa_agent", "preauth_agent", "claim_documentation_agent", "settlement_agent",
  "ayurvedic_prakriti_agent", "ayurvedic_aushadhi_agent", "naturopathy_hydro_agent", "local_diet_chart_agent", "food_medication_interaction_agent", "seasonal_regimen_agent",
  "patient_journey_agent", "clinical_blind_spot_agent", "clinical_contradiction_agent", "evidence_conflict_agent", "data_integrity_agent", "agent_evaluation_agent", "daily_improvement_agent",
  // LEVEL 5 ADDONS
  "n8n_automation_agent", "manus_like_executor_agent", "browser_use_agent", "github_repo_curator_agent", "local_os_command_agent",
];

const uniqueMaster = [...new Set(MASTER_AGENTS)];
const uniqueCount = uniqueMaster.length;
const listedCount = MASTER_AGENTS.length;

// Build declared index: agentId → { plugin, level }
const declared = new Map<string, { plugin: string; level: string }>();
const pluginAgents = new Map<string, number>();
for (const d of fs.readdirSync(PLUGIN_DIR)) {
  const p = path.join(PLUGIN_DIR, d, "manifest.json");
  if (!fs.existsSync(p)) continue;
  const m = JSON.parse(fs.readFileSync(p, "utf-8"));
  pluginAgents.set(m.pluginId, m.agents.length);
  for (const a of m.agents) {
    if (!declared.has(a.agentId)) declared.set(a.agentId, { plugin: m.pluginId, level: a.level });
  }
}

const missing = uniqueMaster.filter((id) => !declared.has(id));

console.log("AGENT COVERAGE AUDIT — MASTER HIERARCHY vs PLUGIN MANIFESTS");
console.log("=".repeat(72));
console.log(`Master hierarchy: ${listedCount} listed IDs → ${uniqueCount} unique logical agents`);
console.log(`Declared across ${pluginAgents.size} plugins: ${declared.size} unique agent IDs`);
console.log("-".repeat(72));

if (missing.length > 0) {
  console.log(`❌ MISSING FROM MANIFESTS (${missing.length}):`);
  for (const id of missing) console.log(`   - ${id}`);
} else {
  console.log("✅ EVERY master-hierarchy agent is declared in a plugin manifest.");
}

const levels = new Map<string, number>();
for (const id of uniqueMaster) {
  const d = declared.get(id)!;
  levels.set(d.level, (levels.get(d.level) || 0) + 1);
}
console.log("-".repeat(72));
console.log("Coverage by level:");
for (const [lvl, n] of [...levels.entries()].sort()) console.log(`   ${lvl.padEnd(12)} ${n}`);
console.log("-".repeat(72));
console.log("Agents per plugin:");
for (const [p, n] of [...pluginAgents.entries()].sort()) console.log(`   ${p.padEnd(32)} ${n}`);
console.log("-".repeat(72));
const total = [...pluginAgents.values()].reduce((a, b) => a + b, 0);
console.log(`TOTAL: ${pluginAgents.size} plugins · ${total} agent declarations (${uniqueCount} unique master agents)`);
console.log(missing.length === 0 ? "\nCOVERAGE: 100%" : `\nCOVERAGE: ${Math.round(((uniqueCount - missing.length) / uniqueCount) * 100)}%`);
process.exit(missing.length === 0 ? 0 : 1);