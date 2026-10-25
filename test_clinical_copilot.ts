/**
 * ASTRA CLINICAL CO-PILOT — TEST SUITE
 * ============================================================================
 * Verifies the structured medical image analysis engine:
 *   1. analyzeClinicalImage produces complete structured output
 *   2. Trauma image analysis detects injuries layer-by-layer
 *   3. Surgical image analysis identifies surgical field structures
 *   4. Clinical image category detection works
 *   5. Agent registry has clinical_copilot_agent registered
 *   6. Tool registry has analyzeClinicalImage registered
 */

import { analyzeClinicalImage, ClinicalCoPilotOutput } from "./src/lib/clinicalCoPilotEngine";
import { AgentRegistry } from "./src/agents/core/AgentRegistry";
import { ToolRegistry } from "./src/agents/core/ToolRegistry";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, details?: string) {
    if (condition) {
        passed++;
        console.log(`  ✅ ${name}`);
    } else {
        failed++;
        console.log(`  ❌ ${name}${details ? ` — ${details}` : ""}`);
    }
}

async function runTests() {
    console.log("\n══════════════════════════════════════════════════════");
    console.log("  ASTRA CLINICAL CO-PILOT TEST SUITE");
    console.log("══════════════════════════════════════════════════════\n");

    // -----------------------------------------------------------------------
    // TEST 1: Basic analysis produces complete structured output
    // -----------------------------------------------------------------------
    console.log("\n📋 TEST 1: Basic Clinical Image Analysis");
    const basic = await analyzeClinicalImage(
        "test-image-data",
        "Analyze this bleeding thumb laceration on the left hand, distal volar aspect",
        { patientName: "Rajesh Kumar", patientUhid: "UHID-2026-8801", patientAge: 45 }
    );

    check("Output has region.bodyPart", basic.region.bodyPart.length > 0, basic.region.bodyPart);
    check("Output has region.side", basic.region.side === "LEFT", `Got ${basic.region.side}`);
    check("Output has anatomical labels", basic.anatomicalLabels.length > 0, `Got ${basic.anatomicalLabels.length}`);
    check("Output has 9 layer categories", basic.anatomicalLabels.length >= 8, `Got ${basic.anatomicalLabels.length}`);
    check("Skin layer identified", basic.anatomicalLabels.some(s => s.layer === "SKIN"));
    check("Nerve layer identified", basic.anatomicalLabels.some(s => s.layer === "NERVE"));
    check("Artery layer identified", basic.anatomicalLabels.some(s => s.layer === "ARTERY"));
    check("Bone layer identified", basic.anatomicalLabels.some(s => s.layer === "BONE_JOINT"));
    check("Injury assessment present", basic.injuryAssessment.primaryInjury.length > 0);
    check("Structures damaged identified", basic.injuryAssessment.structuresDamaged.length > 0);
    check("Structures at risk identified", basic.injuryAssessment.structuresAtRisk.length > 0);
    check("Priority actions present", basic.priorityActions.length >= 4, `Got ${basic.priorityActions.length}`);
    check("Red flags present", basic.redFlags.length > 0);
    check("Suggested next steps present", basic.suggestedNextSteps.length > 0);
    check("EMR snippet generated", basic.emrDocumentationSnippet.includes("CLINICAL CO-PILOT"));
    check("Disclaimer present", basic.disclaimer.includes("clinical decision support"));
    check("Image category detected", basic.imageCategory === "TRAUMA_PHOTOGRAPH", basic.imageCategory);

    // -----------------------------------------------------------------------
    // TEST 2: Trauma detection — Thumb laceration with bleeding
    // -----------------------------------------------------------------------
    console.log("\n📋 TEST 2: Trauma Detection — Thumb Laceration");
    const trauma = await analyzeClinicalImage(
        "test-image-data",
        "Left thumb distal phalanx ulnar aspect laceration with active bleeding, possible nerve involvement",
        { patientName: "Test Patient", patientUhid: "UHID-TEST-1", patientAge: 34 }
    );

    check("Trauma detected in damaged structures", trauma.injuryAssessment.structuresDamaged.some(s => s.includes("laceration") || s.includes("Skin")));
    check("Bleeding flagged", trauma.injuryAssessment.structuresDamaged.some(s => s.includes("bleeding") || s.includes("vessel")));
    check("Nerve at risk flagged", trauma.injuryAssessment.structuresAtRisk.some(s => s.includes("Nerve") || s.includes("nerve")));
    check("Immediate action present", trauma.priorityActions.some(a => a.timeline === "IMMEDIATE_0_5_MIN"));
    check("Red flags include nerve", trauma.redFlags.some(r => r.includes("Nerve")));

    // -----------------------------------------------------------------------
    // TEST 3: Surgical field analysis
    // -----------------------------------------------------------------------
    console.log("\n📋 TEST 3: Surgical Field Analysis");
    const surgical = await analyzeClinicalImage(
        "test-image-data",
        "Intraoperative field showing surgical incision site with exposed structures",
        { procedureName: "Open Reduction Internal Fixation (ORIF) Right Hand" }
    );

    check("Surgical category detected", surgical.imageCategory === "SURGICAL_FIELD", surgical.imageCategory);
    check("Surgical primary injury", surgical.injuryAssessment.primaryInjury.includes("Surgical"));
    check("Surgical actions present", surgical.priorityActions.length > 0);
    check("No trauma red flags for pure surgical", surgical.redFlags.some(r => r.includes("No life")));

    // -----------------------------------------------------------------------
    // TEST 4: Radiograph analysis
    // -----------------------------------------------------------------------
    console.log("\n📋 TEST 4: Radiograph Analysis");
    const xray = await analyzeClinicalImage(
        "test-image-data",
        "Chest X-ray PA view for evaluation",
        { procedureName: "Chest PA View" }
    );

    check("Radiograph category detected", xray.imageCategory === "RADIOGRAPH", xray.imageCategory);
    check("Chest region detected", xray.region.bodyPart.includes("Chest") || xray.region.bodyPart.includes("Thorax"), xray.region.bodyPart);

    // -----------------------------------------------------------------------
    // TEST 5: Pediatric flagging
    // -----------------------------------------------------------------------
    console.log("\n📋 TEST 5: Pediatric Flagging");
    const pediatric = await analyzeClinicalImage(
        "test-image-data",
        "Finger laceration",
        { patientAge: 8 }
    );

    check("Pediatric flag raised", pediatric.pediatricFlag === true);
    check("Pediatric note present", pediatric.pediatricNote !== undefined);

    const adult = await analyzeClinicalImage(
        "test-image-data",
        "Finger laceration",
        { patientAge: 45 }
    );

    check("Adult no pediatric flag", adult.pediatricFlag === false);

    // -----------------------------------------------------------------------
    // TEST 6: Low quality image handling
    // -----------------------------------------------------------------------
    console.log("\n📋 TEST 6: Low Quality Image Handling");
    const lowQuality = await analyzeClinicalImage(
        "test-image-data",
        "Blurry, poorly lit wound with blood obscuring the field",
        { patientAge: 30 }
    );

    check("Confidence reduced for low quality", lowQuality.imageQuality.confidence === "MEDIUM", lowQuality.imageQuality.confidence);
    check("Limitations stated for enhancement", lowQuality.imageQuality.limitations.length > 0);
    check("Enhancements applied for blood", lowQuality.imageQuality.enhancementsApplied.some(e => e.includes("blood") || e.includes("Red-channel")));

    // -----------------------------------------------------------------------
    // TEST 7: Agent Registry Integration
    // -----------------------------------------------------------------------
    console.log("\n📋 TEST 7: Agent Registry Integration");
    const copilotAgent = AgentRegistry.get("clinical_copilot_agent");
    check("Clinical Co-Pilot agent registered", copilotAgent !== undefined);
    check("Agent level is SPECIALIST", copilotAgent?.level === "SPECIALIST");
    check("Agent status is ACTIVE", copilotAgent?.status === "ACTIVE");
    check("Agent capabilities include clinical tool", copilotAgent?.capabilitySchema.toolIds.includes("analyzeClinicalImage"));
    check("Agent has safety constraints", copilotAgent?.constraints.length === 4, `Got ${copilotAgent?.constraints.length}`);

    // -----------------------------------------------------------------------
    // TEST 8: Tool Registry Integration
    // -----------------------------------------------------------------------
    console.log("\n📋 TEST 8: Tool Registry Integration");
    const copilotTool = ToolRegistry.get("analyzeClinicalImage");
    check("analyzeClinicalImage tool registered", copilotTool !== undefined);
    check("Tool is READ type", copilotTool?.readOrWrite === "READ");
    check("Tool health is HEALTHY", copilotTool?.healthStatus === "HEALTHY");
    check("Tool requires image analysis permission", copilotTool?.requiredPermissions.includes("ai:image_analysis"));

    // Execute the tool
    const toolResult = await ToolRegistry.execute("analyzeClinicalImage", {
        imageData: "test-image",
        query: "Right thumb distal laceration with bleeding",
        patientName: "Test Patient",
        patientUhid: "UHID-TEST-2",
        patientAge: 28,
    });
    check("Tool execution returns region", toolResult.region?.bodyPart === "Thumb", toolResult.region?.bodyPart);
    check("Tool execution returns injury", Boolean(toolResult.injuryAssessment?.primaryInjury.includes("Thumb")));
    check("Tool execution returns EMR snippet", Boolean(toolResult.emrDocumentationSnippet?.includes("CLINICAL CO-PILOT")));

    // -----------------------------------------------------------------------
    // TEST 9: ImageAgent delegation
    // -----------------------------------------------------------------------
    console.log("\n📋 TEST 9: ImageAgent Clinical Delegation");
    const { ImageAgent } = await import("./src/agents/specialists/ImageAgent");
    const delegatedResult = await ImageAgent.execute(
        "test-image-data",
        "Bleeding thumb laceration on left hand — assess injury depth and nerve involvement",
        undefined
    );
    check("ImageAgent delegates to Clinical Co-Pilot", delegatedResult.agentId === "clinical_copilot_agent");
    check("Delegated result has analysis", Boolean(delegatedResult.analysis?.region?.bodyPart === "Thumb"));

    // -----------------------------------------------------------------------
    // TEST 10: Clinical Co-Pilot Intent Classification & Robustness
    // -----------------------------------------------------------------------
    console.log("\n📋 TEST 10: Clinical Co-Pilot Intent Classification & Auto-Correction");
    const { classifyAstraIntent, normalizeQueryString } = await import("./src/components/CommandCenter/commandParser");

    // General conversation & greetings
    check("Greeting 'hi' is GENERAL_CONVERSATION", classifyAstraIntent("hi") === "GENERAL_CONVERSATION");
    check("Greeting 'hello' is GENERAL_CONVERSATION", classifyAstraIntent("hello") === "GENERAL_CONVERSATION");
    check("Greeting 'good morning' is GENERAL_CONVERSATION", classifyAstraIntent("good morning") === "GENERAL_CONVERSATION");

    // Auto-correct spelling mistakes
    check("Auto-correct 'iplsit' -> IP_LIST", classifyAstraIntent("iplsit") === "IP_LIST");
    check("Auto-correct 'oplsit' -> OP_LIST", classifyAstraIntent("oplsit") === "OP_LIST");
    check("Auto-correct 'bililng' -> BILLING_SUMMARY", classifyAstraIntent("bililng") === "BILLING_SUMMARY");
    check("Auto-correct 'cenuss' -> IP_LIST", classifyAstraIntent("cenuss") === "IP_LIST");

    // Shorthands
    check("Shorthand 'ip list' -> IP_LIST", classifyAstraIntent("ip list") === "IP_LIST");
    check("Shorthand 'op list' -> OP_LIST", classifyAstraIntent("op list") === "OP_LIST");
    check("Shorthand 'ot' -> OT_STATUS", classifyAstraIntent("ot") === "OT_STATUS");
    check("Shorthand 'ddx' -> DIFFERENTIAL_DIAGNOSIS", classifyAstraIntent("ddx") === "DIFFERENTIAL_DIAGNOSIS");

    // Natural language mapping
    check("Natural language 'show patients in ward' -> IP_LIST", classifyAstraIntent("show patients in ward") === "IP_LIST");
    check("Natural language 'show opd queue' -> OP_LIST", classifyAstraIntent("show opd queue") === "OP_LIST");
    check("Natural language 'order cbc' -> LAB_ORDER", classifyAstraIntent("order cbc") === "LAB_ORDER");

    // -----------------------------------------------------------------------
    // TEST 11: CentralResolver Execution & Active Context Binding
    // -----------------------------------------------------------------------
    console.log("\n📋 TEST 11: CentralResolver Execution & Context Binding");
    const { CentralResolver } = await import("./src/lib/CentralResolver");

    const mockPatient: any = {
        name: "Rajesh Kumar",
        uhid: "UHID-2026-8801",
        bedNumber: "Bed-01",
        diagnosis: "Dengue Viral Fever",
        complaints: "High grade fever for 3 days",
        vitals: { bp: "130/85", hr: 94, temp: 101.4, spo2: 97, rr: 20 },
    };

    // Casual Greeting test
    const greetingRes = await CentralResolver.resolveCommand("hi", {
        selectedPatient: mockPatient,
        activeMode: "Astra Copilot",
        activeModel: "gemini-3.7-flash",
    });
    check("Greeting response contains Dr. Murali", greetingRes.text.includes("Dr. Murali"));
    check("Greeting response binds active patient", greetingRes.text.includes("Rajesh Kumar"));
    check("Greeting response lists operations", greetingRes.text.includes("IP_LIST"));

    // IP_LIST Command Execution
    const ipRes = await CentralResolver.resolveCommand("show patients in ward", {
        selectedPatient: mockPatient,
        activeMode: "Astra Copilot",
        activeModel: "gemini-3.7-flash",
    });
    check("IP_LIST execution succeeds", ipRes.text.includes("Hospital Census") || ipRes.text.includes("Rajesh Kumar"));
    check("IP_LIST has status card", Boolean(ipRes.statusCard));

    // OP_LIST Command Execution
    const opRes = await CentralResolver.resolveCommand("op list", {
        selectedPatient: mockPatient,
        activeMode: "Astra Copilot",
        activeModel: "gemini-3.7-flash",
    });
    check("OP_LIST execution succeeds", opRes.text.includes("Out-Patient"));

    // -----------------------------------------------------------------------
    // TEST 12: Universal AI Brain Routing & Suggestion Chips (Fix 1)
    // -----------------------------------------------------------------------
    console.log("\n📋 TEST 12: Universal AI Brain Routing & Suggestion Chips");
    const aiBrainRes = await CentralResolver.resolveCommand("how is the patient progressing with fever?", {
        selectedPatient: mockPatient,
        activeMode: "Astra Copilot",
        activeModel: "gemini-3.7-flash",
    });
    check("AI brain resolves conversational query naturally", !aiBrainRes.text.includes("Did you mean IP_LIST, OP_LIST"));
    check("AI brain response contains clinical assessment", aiBrainRes.text.includes("Clinical Assessment") || aiBrainRes.text.includes("Rajesh Kumar") || aiBrainRes.text.includes("Dengue"));
    check("AI brain attaches suggestion chips so conversation never dead-ends", Array.isArray(aiBrainRes.suggestionChips) && aiBrainRes.suggestionChips.length > 0);

    // -----------------------------------------------------------------------
    // TEST 13: Auto-Language Detection & Voice Speech Synthesis (Fix 2 & 3)
    // -----------------------------------------------------------------------
    console.log("\n📋 TEST 13: Auto-Language Detection & Speech Synthesis Engine");
    const { detectLanguage, cleanForSpeech, voiceEngine } = await import("./src/astra/voice/voiceEngine");

    // Script detection
    check("Detect Telugu script -> te-IN", detectLanguage("ఈ పేషెంట్‌కి డెంగ్యూ ఫీవర్ ప్రోటోకాల్ చెప్పండి") === "te-IN");
    check("Detect Devanagari script -> hi-IN", detectLanguage("मरीज को बुखार है, क्या दवा दें?") === "hi-IN");
    check("Detect English -> en-IN", detectLanguage("What is the differential diagnosis?") === "en-IN");

    // Latin transliteration token heuristics
    check("Detect Telugu transliteration ('ela unnaru')", detectLanguage("Doctor garu ela unnaru?") === "te-IN");
    check("Detect Hindi transliteration ('kaise ho')", detectLanguage("Patient ka bukhar kaise kam karein?") === "hi-IN");

    // Telugu clinical routing test
    const teluguRes = await CentralResolver.resolveCommand("డాక్టర్ గారు పేషెంట్ జ్వరం ఎలా ఉంది?", {
        selectedPatient: mockPatient,
    });
    check("Telugu query returns Telugu clinical reply", teluguRes.text.includes("నమస్కారం") || teluguRes.text.includes("క్లినికల్") || teluguRes.detectedLanguage === "te-IN");

    // Hindi clinical routing test
    const hindiRes = await CentralResolver.resolveCommand("नमस्ते डॉक्टर, मरीज का हाल कैसा है?", {
        selectedPatient: mockPatient,
    });
    check("Hindi query returns Hindi clinical reply", hindiRes.text.includes("नमस्ते") || hindiRes.text.includes("मरीज") || hindiRes.detectedLanguage === "hi-IN");

    // Clean for speech test (removes markdown tables, code blocks, emojis)
    const rawMarkdown = "### Patient Summary\n| Test | Result |\n| CBC | 68k |\n- Platelet count is **low** 🚨 `CBC STAT`";
    const cleanedSpeech = cleanForSpeech(rawMarkdown);
    check("Clean for speech strips markdown tables & symbols", !cleanedSpeech.includes("|") && !cleanedSpeech.includes("###") && !cleanedSpeech.includes("`") && !cleanedSpeech.includes("🚨"));
    check("Clean for speech preserves clinical words", cleanedSpeech.includes("Patient Summary") && cleanedSpeech.includes("Platelet count is low"));

    // -----------------------------------------------------------------------
    // SUMMARY
    // -----------------------------------------------------------------------
    console.log("\n══════════════════════════════════════════════════════");
    console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
    console.log("══════════════════════════════════════════════════════\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch((err) => {
    console.error("Test suite crashed:", err);
    process.exit(1);
});