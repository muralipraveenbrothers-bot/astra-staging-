/**
 * Generates the 9 Clinical SuperCore plugin manifests (CLINICAL-SUPERCORE-v3):
 * P0: shield-core-plugin, cerebellum-filter-plugin
 * P1: bio-sim-engine, pharmacogenomics-plugin
 * P3: hope-engine-plugin, surgical-intelligence-plugin, critical-care-suite-plugin,
 *     emergency-toxicology-plugin, trauma-intelligence-plugin
 * Idempotent. Run: npx tsx scripts/generate-clinical-supercore-plugins.ts
 */

import fs from "fs";
import path from "path";

const OUT = path.join(process.cwd(), "config", "plugins");

interface Manifest {
  pluginId: string;
  tier: string;
  category: string;
  name: string;
  version: string;
  description: string;
  license: string;
  provider: string;
  runtime: string;
  dependencies: { required: string[]; optional: string[] };
  services: { serviceId: string; type: string; endpoint: string; healthEndpoint: string }[];
  agents: { agentId: string; name: string; level: string; autoRegister: boolean; parentAgent: string }[];
  tools: {
    toolId: string;
    name: string;
    description: string;
    inputSchema: { type: string; properties: Record<string, unknown> };
    outputSchema: { type: string };
    riskLevel: string;
    readOrWrite: string;
  }[];
  models: unknown[];
  knowledge: { sourceId: string; type: string; accessScope: string; autoIndex: boolean }[];
  permissions: { role: string; claims: string[] }[];
  ui: { routes: { path: string; label: string; roles: string[] }[]; components: { name: string; slot: string }[]; icons: string[] };
  database: { migrations: unknown[]; seeds: unknown[] };
  events: { publishes: string[]; subscribes: string[] };
  healthChecks: { name: string; endpoint: string; timeoutMs: number; critical: boolean }[];
  configurationSchema: { properties: Record<string, unknown>; secrets: string[] };
  riskLevel: string;
  checksum: string;
  notes: string;
}

const HC = (name: string, endpoint: string, critical = true) => ({ name, endpoint, timeoutMs: 3000, critical });

function manifest(m: Manifest) {
  fs.mkdirSync(path.join(OUT, m.pluginId), { recursive: true });
  fs.writeFileSync(path.join(OUT, m.pluginId, "manifest.json"), JSON.stringify(m, null, 2) + "\n");
  console.log(`wrote ${m.pluginId} (${m.tier}) — ${m.agents.length} agents, ${m.tools.length} tools`);
}

const ag = (agentId: string, name: string, level: string, parentAgent: string) => ({ agentId, name, level, autoRegister: true, parentAgent });
const tl = (toolId: string, name: string, description: string, riskLevel = "INFO", readOrWrite = "READ") => ({
  toolId, name, description,
  inputSchema: { type: "object", properties: {} },
  outputSchema: { type: "object" },
  riskLevel, readOrWrite,
});

manifest({
  pluginId: "shield-core-plugin",
  tier: "P0",
  category: "SECURITY",
  name: "Shield Core (Guardian & Safety)",
  version: "1.0.0",
  description: "Orange Shield humble inquiry, Silent Whisper interactions, Hard Blocks with admin override, DPO anonymization mode, zero-loss stock watchdog, security self-defense.",
  license: "MIT", provider: "ASTRA", runtime: "nodejs",
  dependencies: { required: ["astra-brain-core", "rbac-audit"], optional: ["pharmacy-plugin"] },
  services: [{ serviceId: "shield-core", type: "clinical-safety", endpoint: "/api/shield/check", healthEndpoint: "/api/shield/health" }],
  agents: [
    ag("shield_guardian", "Shield Guardian (Clinical Watchdog)", "HOD", "hermes_brain"),
    ag("dpo_agent", "Data Protection Officer (DPO)", "MANAGER", "shield_guardian"),
    ag("zero_loss_auditor", "Zero Loss Auditor", "SPECIALIST", "shield_guardian"),
  ],
  tools: [
    tl("check_order_shield", "Check Order (Shield)", "SOP validation + humble inquiry / silent whisper / hard block on orders", "HIGH_RISK"),
    tl("check_vitals_shield", "Check Vitals (Watchdog)", "Threshold crossing detection on vital stream", "IMPORTANT"),
    tl("anonymize_export", "Anonymize Export (DPO)", "PII redaction before research export", "IMPORTANT"),
  ],
  models: [],
  knowledge: [{ sourceId: "sop_protocols", type: "protocols", accessScope: "hospital", autoIndex: false }],
  permissions: [
    { role: "DOCTOR", claims: ["safety:read", "safety:override"] },
    { role: "NURSE", claims: ["safety:read"] },
    { role: "MANAGEMENT", claims: ["safety:read"] },
    { role: "ADMIN", claims: ["safety:override", "shield:hardblock-override"] },
  ],
  ui: { routes: [], components: [{ name: "ShieldBadge", slot: "order-submit" }], icons: ["shield", "shield-alert"] },
  database: { migrations: [], seeds: [] },
  events: { publishes: ["shield.hardblock.triggered", "shield.inquiry.shown"], subscribes: ["order.created"] },
  healthChecks: [HC("Shield Ruleset", "tool-registry"), HC("RBAC Override Gates", "rbac-permissions")],
  configurationSchema: { properties: { hardBlockOverride: { type: "string", enum: ["admin-only"], default: "admin-only" } }, secrets: [] },
  riskLevel: "HIGH",
  checksum: "sha256:shield-core-plugin-1.0.0",
  notes: "HARD BLOCK requires admin override. Orange shield is silent — no public announcement. SOP validation: green = compliant, red = legal/clinical risk.",
});

manifest({
  pluginId: "cerebellum-filter-plugin",
  tier: "P0",
  category: "CORE",
  name: "Cerebellum Filter (Tone & Empathy)",
  version: "1.0.0",
  description: "Lightweight deterministic tone middleware: de-escalation, empathy injection, humanization. Facts NEVER changed. Patient-facing always ON.",
  license: "MIT", provider: "ASTRA", runtime: "nodejs",
  dependencies: { required: ["astra-brain-core"], optional: ["voicebox"] },
  services: [{ serviceId: "cerebellum-filter", type: "tone-filter", endpoint: "/api/cerebellum/filter", healthEndpoint: "/api/cerebellum/health" }],
  agents: [
    ag("cerebellum_balancer", "Cerebellum Balancer", "HOD", "hermes_brain"),
    ag("tone_analyzer", "Tone Analyzer", "MANAGER", "cerebellum_balancer"),
  ],
  tools: [tl("filter_tone", "Filter Tone (Cerebellum)", "Softens harsh phrasing; immutable core message", "INFO")],
  models: [], knowledge: [],
  permissions: [{ role: "DOCTOR", claims: ["cerebellum:toggle"] }],
  ui: { routes: [], components: [{ name: "CerebellumToggle", slot: "doctor-settings" }], icons: ["sparkles"] },
  database: { migrations: [], seeds: [] },
  events: { publishes: ["cerebellum.filtered"], subscribes: ["ai.output.raw"] },
  healthChecks: [HC("Tone Ruleset", "tool-registry")],
  configurationSchema: { properties: { doctorEmpathyDefault: { type: "string", enum: ["on", "off"], default: "off" } }, secrets: [] },
  riskLevel: "LOW",
  checksum: "sha256:cerebellum-filter-plugin-1.0.0",
  notes: "All patient-facing communication passes through Cerebellum and CANNOT be disabled. Doctor-facing is a toggle.",
});

manifest({
  pluginId: "bio-sim-engine",
  tier: "P1",
  category: "MEDICAL",
  name: "Bio-Sim Engine (Digital Twin)",
  version: "1.0.0",
  description: "Deterministic physics engine: SVR/CO/DO2 hemodynamics, Stewart acid-base, what-if cascade (fluid/norepinephrine/furosemide) with flash pulmonary edema warnings. NOT an LLM.",
  license: "MIT", provider: "ASTRA", runtime: "nodejs",
  dependencies: { required: ["astra-brain-core", "hospital-data-connector", "ward-icu-plugin"], optional: [] },
  services: [{ serviceId: "bio-sim", type: "physiology-simulator", endpoint: "/api/biosim", healthEndpoint: "/api/biosim/health" }],
  agents: [
    ag("biosim_simulator", "Bio-Sim Simulator", "HOD", "hermes_brain"),
    ag("hemodynamic_calculator", "Hemodynamic Calculator", "SPECIALIST", "biosim_simulator"),
    ag("acid_base_analyzer", "Acid-Base Analyzer (Stewart)", "SPECIALIST", "biosim_simulator"),
  ],
  tools: [
    tl("run_bio_sim", "Run Bio-Sim", "Hemodynamic simulation from vitals/labs", "INFO"),
    tl("what_if_cascade", "What-If Cascade", "Fluid / norepinephrine / furosemide projection with flash warnings", "IMPORTANT"),
  ],
  models: [], knowledge: [],
  permissions: [{ role: "DOCTOR", claims: ["biosim:read"] }],
  ui: { routes: [{ path: "/biosim", label: "Bio-Sim Viewer", roles: ["doctor", "ceo", "admin"] }], components: [], icons: ["activity", "wave"] },
  database: { migrations: [], seeds: [] },
  events: { publishes: ["biosim.simulated"], subscribes: ["vitals.updated"] },
  healthChecks: [HC("Bio-Sim Engine", "tool-registry"), HC("Vitals Feed", "db-connectivity")],
  configurationSchema: { properties: { svrReferenceLow: { type: "number", default: 800 } }, secrets: [] },
  riskLevel: "MEDIUM",
  checksum: "sha256:bio-sim-engine-1.0.0",
  notes: "All formulas documented in output.methods. What-If predictions are DERIVED ESTIMATES — clinical judgment required.",
});

manifest({
  pluginId: "pharmacogenomics-plugin",
  tier: "P1",
  category: "MEDICAL",
  name: "Pharmacogenomics (Genomics Base)",
  version: "1.0.0",
  description: "CYP2C19 / BRCA1 / drug-gene interaction knowledge base. Genomics card for Synapse. No profile → honest 'order pharmacogenomics' state.",
  license: "MIT", provider: "ASTRA", runtime: "nodejs",
  dependencies: { required: ["astra-brain-core", "medical-knowledge-gateway"], optional: [] },
  services: [{ serviceId: "pharmacogenomics", type: "genomics", endpoint: "/api/pharmacogenomics", healthEndpoint: "/api/pharmacogenomics/health" }],
  agents: [
    ag("genomics_card_agent", "Genomics Card Agent", "HOD", "hermes_brain"),
    ag("pharmacogenomics_checker", "Pharmacogenomics Checker", "SPECIALIST", "genomics_card_agent"),
  ],
  tools: [tl("check_drug_gene_interaction", "Check Drug-Gene Interaction", "CYP/BRCA genotype to drug efficacy alerts", "IMPORTANT")],
  models: [], knowledge: [{ sourceId: "pharmacogenomics_db", type: "genomics", accessScope: "hospital", autoIndex: false }],
  permissions: [{ role: "DOCTOR", claims: ["genomics:read"] }],
  ui: { routes: [], components: [], icons: ["dna"] },
  database: { migrations: [], seeds: [] },
  events: { publishes: ["genomics.card.updated"], subscribes: [] },
  healthChecks: [HC("Pharmacogenomics DB", "knowledge-registry")],
  configurationSchema: { properties: {}, secrets: ["genomics-service-key"] },
  riskLevel: "HIGH",
  checksum: "sha256:pharmacogenomics-plugin-1.0.0",
  notes: "No genetic profile → card shows 'No genetic profile — Click to order pharmacogenomics'. Never fabricate genotype.",
});

manifest({
  pluginId: "hope-engine-plugin",
  tier: "P3",
  category: "MEDICAL",
  name: "Hope Engine (V3 Deep Discovery)",
  version: "1.0.0",
  description: "Zebra hunting for null diagnosis after 48h or poor response: rare genetic errors, occult toxicity, masqueraders, literature-backed rescue treatments. ADVISORY ONLY.",
  license: "MIT", provider: "ASTRA", runtime: "nodejs",
  dependencies: { required: ["clinical-reasoning-plugin", "evidence-literature-plugin"], optional: ["medical-vision-dicom"] },
  services: [{ serviceId: "hope-engine", type: "deep-discovery", endpoint: "/api/hope-engine", healthEndpoint: "/api/hope-engine/health" }],
  agents: [
    ag("hope_engine", "Hope Engine (Deep Discovery)", "SPECIALIST", "clinical_reasoning_agent"),
    ag("phenotype_detective", "Phenotype Detective", "SPECIALIST", "hope_engine"),
    ag("silent_killer_scanner", "Silent Killer Scanner", "SPECIALIST", "hope_engine"),
  ],
  tools: [
    tl("run_hope_engine", "Run Hope Engine (V3)", "Lateral hypothesis generation across 4 investigation paths", "INFO"),
    tl("scan_occupation_toxicity", "Scan Occupation Toxicity", "Home address + occupation vs toxicology databases", "IMPORTANT"),
    tl("search_global_case", "Search Global Case", "PubMed + international registries mystery-case match", "INFO"),
  ],
  models: [], knowledge: [{ sourceId: "rare_disease_registries", type: "rare-disease", accessScope: "hospital", autoIndex: false }],
  permissions: [{ role: "DOCTOR", claims: ["hope:read"] }],
  ui: { routes: [{ path: "/hope", label: "Hope Engine V3", roles: ["doctor", "ceo"] }], components: [{ name: "HopeEngineView", slot: "clinical-mode" }], icons: ["sparkles", "lightbulb"] },
  database: { migrations: [], seeds: [] },
  events: { publishes: ["hope.discovery.suggested"], subscribes: ["diagnosis.updated"] },
  healthChecks: [HC("Evidence Literature", "external-pubmed"), HC("Rare Disease Registry", "knowledge-registry")],
  configurationSchema: { properties: { deepDiscoveryTriggerHours: { type: "number", default: 48 } }, secrets: [] },
  riskLevel: "MEDIUM",
  checksum: "sha256:hope-engine-plugin-1.0.0",
  notes: "PURPLE/GOLD UI when V3 active. ALL suggestions advisory. Human doctor has final authority.",
});

manifest({
  pluginId: "surgical-intelligence-plugin",
  tier: "P3",
  category: "HOSPITAL",
  name: "Surgical Intelligence",
  version: "1.0.0",
  description: "10-stage surgical roadmap: indication confirmation, differential exclusion, preop workup, risk stratification, planning, intraop danger zones, 3D rehearsal, postop, complication anticipation, follow-up.",
  license: "MIT", provider: "ASTRA", runtime: "nodejs",
  dependencies: { required: ["clinical-reasoning-plugin", "ot-plugin"], optional: ["medical-vision-dicom"] },
  services: [{ serviceId: "surgical-intelligence", type: "surgical-planning", endpoint: "/api/surgical-roadmap", healthEndpoint: "/api/surgical-roadmap/health" }],
  agents: [
    ag("surgical_roadmap_agent", "Surgical Roadmap Agent", "SPECIALIST", "surgical_hod"),
    ag("preop_optimizer", "Preop Optimizer", "SPECIALIST", "surgical_roadmap_agent"),
    ag("intraop_danger_zone_agent", "Intraop Danger Zone Agent", "SPECIALIST", "surgical_roadmap_agent"),
  ],
  tools: [tl("generate_surgical_roadmap", "Generate Surgical Roadmap", "10-stage pathway with failure-prevention flags", "IMPORTANT")],
  models: [], knowledge: [{ sourceId: "ao_principles", type: "surgery", accessScope: "hospital", autoIndex: false }],
  permissions: [{ role: "DOCTOR", claims: ["surgery:read"] }],
  ui: { routes: [], components: [], icons: ["scissors", "route"] },
  database: { migrations: [], seeds: [] },
  events: { publishes: ["surgery.roadmap.generated"], subscribes: ["ot.case.scheduled"] },
  healthChecks: [HC("OT Plugin", "tool-registry")],
  configurationSchema: { properties: {}, secrets: [] },
  riskLevel: "HIGH",
  checksum: "sha256:surgical-intelligence-plugin-1.0.0",
  notes: "Advisory. Surgeon decides. 3D holographic model only when DICOM service configured.",
});

manifest({
  pluginId: "critical-care-suite-plugin",
  tier: "P3",
  category: "HOSPITAL",
  name: "Critical Care Suite (Vent-Brain)",
  version: "1.0.0",
  description: "Vent-Brain co-pilot: driving-pressure safety, asynchrony detection, RSBI weaning predictor, ABG interpreter, sepsis EWS. Deterministic ICU tool.",
  license: "MIT", provider: "ASTRA", runtime: "nodejs",
  dependencies: { required: ["ward-icu-plugin", "bio-sim-engine"], optional: [] },
  services: [{ serviceId: "critical-care-suite", type: "icu-tools", endpoint: "/api/vent-brain", healthEndpoint: "/api/vent-brain/health" }],
  agents: [
    ag("vent_brain", "Vent-Brain (Ventilator Co-Pilot)", "SPECIALIST", "icu_hod"),
    ag("abg_interpreter", "ABG Interpreter", "SPECIALIST", "vent_brain"),
    ag("weaning_predictor", "Weaning Predictor (RSBI)", "SPECIALIST", "vent_brain"),
    ag("sepsis_ews_agent", "Sepsis EWS Agent", "SPECIALIST", "icu_hod"),
  ],
  tools: [
    tl("assess_ventilation", "Assess Ventilation", "Driving pressure + asynchrony + weaning readiness", "IMPORTANT"),
    tl("interpret_abg", "Interpret ABG", "Acid-base classification + ventilator adjustments", "IMPORTANT"),
    tl("calculate_rsbi", "Calculate RSBI", "Rapid Shallow Breathing Index for SBT readiness", "INFO"),
  ],
  models: [], knowledge: [],
  permissions: [{ role: "DOCTOR", claims: ["icu:read"] }, { role: "NURSE", claims: ["icu:read"] }],
  ui: { routes: [], components: [], icons: ["wind", "lungs"] },
  database: { migrations: [], seeds: [] },
  events: { publishes: ["icu.vent.assessed"], subscribes: ["vitals.updated"] },
  healthChecks: [HC("Vent-Brain Engine", "tool-registry"), HC("ICU Vitals", "db-connectivity")],
  configurationSchema: { properties: { drivingPressureAlert: { type: "number", default: 15 } }, secrets: [] },
  riskLevel: "HIGH",
  checksum: "sha256:critical-care-suite-plugin-1.0.0",
  notes: "Driving pressure > 15 cmH2O → red flash + suggest lower tidal volume (4-6 mL/kg PBW).",
});

manifest({
  pluginId: "emergency-toxicology-plugin",
  tier: "P3",
  category: "MEDICAL",
  name: "Emergency Toxicology (Tox-Command)",
  version: "1.0.0",
  description: "Toxidrome matcher, weight-based antidote calculator, Rumack-Matthew nomogram, snake bite / OP / heavy metal protocols.",
  license: "MIT", provider: "ASTRA", runtime: "nodejs",
  dependencies: { required: ["hospital-data-connector", "pharmacy-plugin"], optional: [] },
  services: [{ serviceId: "tox-command", type: "toxicology", endpoint: "/api/tox-command", healthEndpoint: "/api/tox-command/health" }],
  agents: [
    ag("tox_commander", "Tox-Commander", "HOD", "emergency_hod"),
    ag("antidote_calculator", "Antidote Calculator", "SPECIALIST", "tox_commander"),
    ag("toxidrome_matcher", "Toxidrome Matcher", "SPECIALIST", "tox_commander"),
  ],
  tools: [
    tl("match_toxidrome", "Match Toxidrome", "Symptom pattern → poisoning identification + antidote", "IMPORTANT"),
    tl("calculate_antidote_dose", "Calculate Antidote Dose", "Weight-based antidote dosing", "IMPORTANT"),
    tl("plot_nomogram", "Plot Nomogram", "Rumack-Matthew paracetamol nomogram", "IMPORTANT"),
  ],
  models: [], knowledge: [{ sourceId: "antidote_db", type: "toxicology", accessScope: "hospital", autoIndex: false }],
  permissions: [{ role: "DOCTOR", claims: ["tox:read"] }],
  ui: { routes: [], components: [], icons: ["flask-conical", "skull"] },
  database: { migrations: [], seeds: [] },
  events: { publishes: ["tox.protocol.activated"], subscribes: ["order.pharmacy.created"] },
  healthChecks: [HC("Antidote DB", "knowledge-registry"), HC("Pharmacy Inventory", "tool-registry")],
  configurationSchema: { properties: {}, secrets: [] },
  riskLevel: "HIGH",
  checksum: "sha256:emergency-toxicology-plugin-1.0.0",
  notes: "Antidote doses are DERIVED ESTIMATES — confirm against poison control before administration.",
});

manifest({
  pluginId: "trauma-intelligence-plugin",
  tier: "P3",
  category: "HOSPITAL",
  name: "Trauma Intelligence (Golden Hour)",
  version: "1.0.0",
  description: "RTT injury map, Vox-Trauma hands-free tagging, ISS auto-calculation, auto-MLC draft, crash protocols (Massive Transfusion / Code Stroke / RSI).",
  license: "MIT", provider: "ASTRA", runtime: "nodejs",
  dependencies: { required: ["trauma-plugin", "hospital-data-connector"], optional: [] },
  services: [{ serviceId: "trauma-intelligence", type: "trauma", endpoint: "/api/trauma-intelligence", healthEndpoint: "/api/trauma-intelligence/health" }],
  agents: [
    ag("rtt_mapper", "RTT Mapper", "SPECIALIST", "trauma_hod"),
    ag("vox_trauma", "Vox-Trauma (Voice Tagger)", "SPECIALIST", "rtt_mapper"),
    ag("auto_mlc_engine", "Auto-MLC Engine", "SPECIALIST", "rtt_mapper"),
    ag("golden_hour_coordinator", "Golden Hour Coordinator", "MANAGER", "trauma_hod"),
  ],
  tools: [
    tl("assess_trauma_iss", "Assess Trauma (ISS)", "Injury Severity Score from tagged injuries + crash protocols", "IMPORTANT"),
    tl("draft_mlc", "Draft MLC Report", "Medico-legal case draft from mapped injuries", "IMPORTANT"),
  ],
  models: [], knowledge: [],
  permissions: [{ role: "DOCTOR", claims: ["trauma:read"] }, { role: "MANAGEMENT", claims: ["trauma:read"] }],
  ui: { routes: [], components: [], icons: ["siren", "map-pin"] },
  database: { migrations: [], seeds: [] },
  events: { publishes: ["trauma.iss.calculated", "trauma.mlc.drafted"], subscribes: ["patient.emergency.registered"] },
  healthChecks: [HC("Trauma Plugin", "tool-registry")],
  configurationSchema: { properties: {}, secrets: [] },
  riskLevel: "HIGH",
  checksum: "sha256:trauma-intelligence-plugin-1.0.0",
  notes: "MLC draft requires medico-legal officer review. ISS is a DERIVED ESTIMATE pending imaging.",
});

console.log("done — 9 Clinical SuperCore manifests written");
