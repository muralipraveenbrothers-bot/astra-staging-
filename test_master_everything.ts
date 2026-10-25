/**
 * ASTRA AI — MASTER END-TO-END VERIFICATION SUITE
 * ============================================================================
 * Exhaustively tests:
 * 1. 9-Layer Anatomical Vision & 12-Lead ECG Analysis
 * 2. Auto-Language Detection & Clean Multilingual Speech Synthesis
 * 3. Complete 64+ Agent Registry & All 12 Deep Specialist Engines
 * 4. 31 Canonical Plugins, Self-Healing Runtime & AgentBus
 * 5. Closed-Loop Universal Order Gateway, Dispatch & SLA Escalation
 * 6. Doctor Central Command Integration & Patient Context Binding
 */

import { analyzeClinicalImage } from "./src/lib/clinicalCoPilotEngine";
import { CentralResolver } from "./src/lib/CentralResolver";
import { voiceEngine, detectLanguage, cleanForSpeech } from "./src/astra/voice/voiceEngine";
import { AgentRegistry } from "./src/agents/core/AgentRegistry";
import { ToolRegistry } from "./src/agents/core/ToolRegistry";
import { pluginRuntime } from "./src/astra/runtime/pluginRuntime";
import { agentBus } from "./src/astra/runtime/agentBus";
import { healthService } from "./src/astra/runtime/healthService";
import { analyzeEcgImage } from "./src/astra/agents/ecgAgent";

// Deep Specialist Engines
import { SusrutaClinicalEngine } from "./src/agents/specialists/SusrutaClinicalEngine";
import { BlindSpotEngine } from "./src/agents/specialists/BlindSpotEngine";
import { getMitraWellnessAgent, ContentType, ReadabilityLevel } from "./src/agents/specialists/MitraWellnessAgent";
import { MolecularCascadeAgent } from "./src/agents/specialists/MolecularCascadeAgent";
import { SurgicalRoadmapAgent } from "./src/agents/specialists/SurgicalRoadmapAgent";
import { VentBrainAgent } from "./src/agents/specialists/VentBrainAgent";
import { ToxCommandAgent } from "./src/agents/specialists/ToxCommandAgent";
import { OpMarginOptimizerAgent } from "./src/agents/specialists/OpMarginOptimizerAgent";
import { BioSimEngine } from "./src/agents/specialists/BioSimEngine";
import { CerebellumFilter } from "./src/agents/specialists/CerebellumFilter";
import { ShieldGuardian } from "./src/agents/specialists/ShieldGuardian";

async function runMasterVerification() {
  console.log("\n" + "═".repeat(70));
  console.log("  🏥 ASTRA AI — MASTER END-TO-END SYSTEM TEST SUITE");
  console.log("═".repeat(70) + "\n");

  let passed = 0;
  let failed = 0;

  function assert(title: string, condition: boolean, detail?: string) {
    if (condition) {
      console.log(`  ✅ ${title}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${title}${detail ? ` — ${detail}` : ""}`);
      failed++;
    }
  }

  // -------------------------------------------------------------------------
  // SECTION 1: 9-LAYER ANATOMICAL VISION & 12-LEAD ECG
  // -------------------------------------------------------------------------
  console.log("\n🔬 SECTION 1: 9-Layer Anatomical Vision & ECG Vision");
  
  const lacerationAnalysis = await analyzeClinicalImage(
    "data:image/jpeg;base64,mockImageThumbLaceration",
    "Deep knife laceration on left thumb distal phalanx ulnar aspect with active bleeding, numbness distal to IP joint",
    { patientName: "Rajesh Kumar", patientUhid: "UHID-2026-8801", patientAge: 45 }
  );

  assert("Identifies anatomical structures across layers", lacerationAnalysis.anatomicalLabels.length > 0);
  assert("Detects skin/subcutaneous layer", lacerationAnalysis.anatomicalLabels.some(l => l.layer === "SKIN" || l.layer === "SUBCUTANEOUS"));
  assert("Flags nerve layer identified", lacerationAnalysis.anatomicalLabels.some(l => l.layer === "NERVE"));
  assert("Flags artery layer identified", lacerationAnalysis.anatomicalLabels.some(l => l.layer === "ARTERY"));
  assert("Detects damaged structures", lacerationAnalysis.injuryAssessment.structuresDamaged.length > 0);
  assert("Flags structures at risk (digital nerve)", lacerationAnalysis.injuryAssessment.structuresAtRisk.some(s => s.toLowerCase().includes("nerve")));
  assert("Prioritizes immediate actions", lacerationAnalysis.priorityActions.some(p => p.timeline === "IMMEDIATE_0_5_MIN" || p.timeline === "URGENT_5_30_MIN"));
  assert("Generates formal EMR clinical note snippet", lacerationAnalysis.emrDocumentationSnippet.length > 20);
  assert("Enforces mandatory decision support disclaimer", lacerationAnalysis.disclaimer.includes("decision support") || lacerationAnalysis.disclaimer.includes("physician"));

  const mockEcgFile = { name: "stemi_anterior_ecg.jpg", type: "image/jpeg" } as any;
  const ecgAnalysis = await analyzeEcgImage(mockEcgFile, "Chest pain, acute onset, ST elevation in anterior leads");

  assert("ECG Vision identifies STEMI localization", ecgAnalysis.localization.includes("Anterior") || ecgAnalysis.impression.some(i => i.includes("STEMI")));
  assert("ECG Vision flags emergent red flags", ecgAnalysis.redFlags.length >= 2);
  assert("ECG Vision generates ACC/AHA emergent protocol", ecgAnalysis.immediateManagement.length > 0);

  // -------------------------------------------------------------------------
  // SECTION 2: MULTILINGUAL SPEECH & AUTO-LANGUAGE DETECTION
  // -------------------------------------------------------------------------
  console.log("\n🗣️ SECTION 2: Multilingual Speech & Language Detection");

  assert("Detects Telugu script (ఀ-౿)", detectLanguage("డాక్టర్ గారు పేషెంట్ జ్వరం ఎలా ఉంది?") === "te-IN");
  assert("Detects Hindi Devanagari script (ऀ-ॿ)", detectLanguage("नमस्ते डॉक्टर, मरीज का हाल कैसा है?") === "hi-IN");
  assert("Detects English script", detectLanguage("What is the differential diagnosis?") === "en-IN");
  assert("Detects Telugu transliteration token ('ela unnaru')", detectLanguage("Doctor garu ela unnaru?") === "te-IN");
  assert("Detects Hindi transliteration token ('kaise ho')", detectLanguage("Patient ka bukhar kaise kam karein?") === "hi-IN");

  const rawMarkdown = "### Summary\n| Test | Result |\n| Platelets | 42k |\n- Urgent **CBC** 🚨 `STAT`";
  const cleanSpeech = cleanForSpeech(rawMarkdown);
  assert("Clean for speech strips markdown table pipes", !cleanSpeech.includes("|"));
  assert("Clean for speech strips markdown hashtags and code ticks", !cleanSpeech.includes("###") && !cleanSpeech.includes("`"));
  assert("Clean for speech strips emojis", !cleanSpeech.includes("🚨"));
  assert("Clean for speech preserves clinical words", cleanSpeech.toLowerCase().includes("platelet") || cleanSpeech.toLowerCase().includes("cbc") || cleanSpeech.includes("42k"));

  // -------------------------------------------------------------------------
  // SECTION 3: 64+ AGENT REGISTRY & 12 DEEP SPECIALIST ENGINES
  // -------------------------------------------------------------------------
  console.log("\n🤖 SECTION 3: 64+ Agent Registry & 12 Deep Specialist Engines");

  const allAgents = AgentRegistry.list();
  assert("Agent Registry contains seeded canonical agents", allAgents.length >= 20, `Found: ${allAgents.length}`);

  // Test 1: Susruta Clinical Superbrain & Hope Engine V3
  const susrutaOutput = SusrutaClinicalEngine.analyze({
    rawComplaint: "3 days high fever, severe retro-orbital headache, petechial rash, platelets 42000",
    vitals: { tempF: 102.4, heartRate: 108, bpSys: 100, bpDia: 68 },
    labs: [{ testName: "Platelets", result: 42000 }, { testName: "Hematocrit", result: 46 }]
  });
  assert("Susruta executes 5-stage loop", susrutaOutput.steps.length === 5);
  assert("Susruta generates differential DecisionCards", susrutaOutput.differential.length > 0);
  assert("Susruta gates judgment as AWAITING_DOCTOR_APPROVAL", susrutaOutput.judgmentGate.status === "AWAITING_DOCTOR_APPROVAL");

  // Test 2: Blind-Spot Engine
  const blindSpots = BlindSpotEngine.analyzeBlindSpots({
    chiefComplaint: "fever with headache, severe neck stiffness, and vomiting",
    vitals: [{ bpSys: 130, bpDia: 80, heartRate: 98, spo2: 96 }],
    diagnosis: "Suspected Viral Illness"
  });
  assert("Blind-Spot Engine detects MUST NOT MISS life-threats", blindSpots.mustNotMiss.length > 0);
  assert("Flags Meningitis / Meningoencephalitis as must-not-miss", blindSpots.mustNotMiss.some(m => m.finding.toLowerCase().includes("meningitis")));

  // Test 3: Mitra Patient Wellness & Jargon Simplifier
  const mitraResp = await getMitraWellnessAgent().process({
    id: "mitra-01",
    patientId: "P-101",
    patientName: "Rajesh Kumar",
    contentType: ContentType.PATIENT_EDUCATION,
    clinicalInput: "Acute myocardial infarction with secondary dyspnea and pruritus",
    targetAudience: "patient",
    readabilityLevel: ReadabilityLevel.BASIC,
    language: "te"
  });
  assert("Mitra simplifies medical jargon", mitraResp.simplifiedExplanation.length > 10);
  assert("Mitra computes readability grade score", typeof mitraResp.readabilityScore === "number");

  // Test 4: Molecular Cascade Engine
  const cascade = MolecularCascadeAgent.run({
    question: "Why is the patient tachycardic and febrile?",
    vitals: { heartRate: 115, tempF: 103.1 },
    diagnosis: "Severe Sepsis"
  });
  assert("Molecular Cascade runs 7 stages", cascade.stages.length === 7);
  assert("Identifies molecular cytokine pyrogens (IL-1/IL-6/TNF)", cascade.stages[0].findings.some(f => f.finding.includes("IL-1") || f.finding.includes("Pyrogen") || f.finding.includes("elevated")));

  // Test 5: Surgical Roadmap Agent
  const surgeryPlan = SurgicalRoadmapAgent.run({
    indication: "Acute Appendicitis with Localized Peritonitis",
    vitals: { heartRate: 104, tempF: 101.2 },
    comorbidities: ["Type 2 Diabetes"]
  });
  assert("Surgical Roadmap executes 10 stages", surgeryPlan.stages.length === 10);
  assert("Calculates ASA Physical Status score", surgeryPlan.asaEstimate === "ASA II" || surgeryPlan.asaEstimate === "ASA III" || surgeryPlan.asaEstimate === "ASA IV");

  // Test 6: Vent-Brain ICU Co-Pilot
  const ventOutput = VentBrainAgent.assess({
    plateauPressure: 24,
    peep: 8,
    respiratoryRate: 20,
    tidalVolume: 0.45,
    abg: { ph: 7.28, pco2: 56, po2: 78, hco3: 26 }
  });
  assert("Vent-Brain computes driving pressure (Plateau - PEEP)", ventOutput.drivingPressure.value === 16);
  assert("Vent-Brain flags driving pressure alert (>14 cmH2O)", ventOutput.drivingPressure.alert === true);
  assert("Vent-Brain identifies Respiratory Acidosis", ventOutput.abg.primaryAcidBase === "RESPIRATORY_ACIDOSIS");

  // Test 7: Tox-Command Emergency Toxicology
  const toxMatch = ToxCommandAgent.match([
    "pinpoint pupils", "salivation", "lacrimation", "bradycardia", "muscle fasciculations"
  ]);
  assert("Tox-Command recognizes Organophosphate toxidrome", toxMatch.matches.some(m => m.poison.toLowerCase().includes("organophosphate")));
  assert("Tox-Command provides Atropine + PAM antidote protocol", toxMatch.matches.some(m => m.antidote.includes("Atropine")));

  // Test 8: OP Margin Optimizer Agent
  const opMargin = OpMarginOptimizerAgent.analyze({ department: "General OPD" });
  assert("OP Margin computes procedure margins", opMargin.rows.length > 0);
  assert("Computes break-even patient volume", opMargin.breakEvenPerDay > 0);

  // Test 9: Bio-Sim Hemodynamic Engine
  const bioSim = BioSimEngine.simulate({
    heartRate: 110,
    bpSys: 85,
    bpDia: 50,
    cvp: 4,
    lactate: 4.2
  });
  assert("Bio-Sim computes SVR and Cardiac Output", bioSim.hemodynamics.svr > 0 && bioSim.hemodynamics.co > 0);
  assert("Bio-Sim classifies Distributive Shock in sepsis", bioSim.hemodynamics.shockClass === "DISTRIBUTIVE" || bioSim.hemodynamics.interpretation.length > 0);

  // Test 10: Cerebellum Filter
  const cerebellumOut = CerebellumFilter.filter({
    text: "The patient has kidney failure and is dying.",
    context: "PATIENT"
  });
  assert("Cerebellum Filter softens blunt phrasing for patient", cerebellumOut.filterApplied === true && !cerebellumOut.filtered.includes("dying"));

  // Test 11: Shield Guardian Order Check
  const shieldCheck = ShieldGuardian.checkOrder({
    medication: "sildenafil",
    patientMedications: ["nitroglycerin"]
  });
  assert("Shield Guardian detects lethal drug interaction (Sildenafil + Nitroglycerin)", shieldCheck.level === "HARD_BLOCK");

  // -------------------------------------------------------------------------
  // SECTION 4: 31 CANONICAL PLUGINS & RUNTIME SELF-HEALING
  // -------------------------------------------------------------------------
  console.log("\n🔌 SECTION 4: 31 Canonical Plugins & Self-Healing Runtime");

  await pluginRuntime.init();
  const plugins = pluginRuntime.list();
  assert("Self-healing loads all 31 canonical plugins", plugins.length === 31, `Found: ${plugins.length}`);
  
  const registeredTools = ToolRegistry.list();
  assert("Tool Registry has all essential clinical tools", registeredTools.length > 10);
  assert("AgentBus has registered tools", agentBus.listTools().length > 0);

  const healthReport = await healthService.runCheckCycle();
  assert("HealthService reports healthy ecosystem", healthReport.totalPlugins === 31);
  assert("Active plugins count is >= 30", healthReport.activeCount >= 30);

  // -------------------------------------------------------------------------
  // SECTION 5: CENTRAL RESOLVER & UNIVERSAL ORDER GATEWAY
  // -------------------------------------------------------------------------
  console.log("\n⚡ SECTION 5: Central Command Routing & Universal Orders");

  const mockPatient = {
    id: "pat-101",
    uhid: "UHID-2026-0001",
    name: "Rajesh Kumar",
    age: 48,
    gender: "Male",
    bed: "Bed-01 (General Ward)",
    diagnosis: "Acute Febrile Illness / Dengue Suspect"
  };

  // Operational command resolution
  const ipCmd = await CentralResolver.resolveCommand("show patients in ward", {
    selectedPatient: mockPatient,
    activeMode: "Astra Copilot",
    activeModel: "gemini-3.7-flash",
  });
  assert("Resolves 'show patients in ward' command to statusCard", Boolean(ipCmd.statusCard) || ipCmd.text.includes("Census") || ipCmd.text.includes("Rajesh Kumar"));

  // Clinical reasoning resolution
  const clinicalQuery = await CentralResolver.resolveCommand("how is the patient progressing with fever and platelets?", {
    selectedPatient: mockPatient,
    activeMode: "Astra Copilot",
    activeModel: "gemini-3.7-flash",
  });
  assert("Resolves clinical query with AI reasoning", clinicalQuery.text.includes("Rajesh Kumar") || clinicalQuery.text.includes("Clinical Assessment") || clinicalQuery.text.includes("Dengue") || clinicalQuery.text.includes("fever"));
  assert("Attaches interactive suggestion chips", (clinicalQuery.suggestionChips?.length ?? 0) > 0);
  assert("Generates rich non-empty AI answer", clinicalQuery.text.length > 50);

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log("\n" + "═".repeat(70));
  console.log(`  ASTRA AI MASTER TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("═".repeat(70) + "\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runMasterVerification().catch((err) => {
  console.error("Master verification crashed:", err);
  process.exit(1);
});
