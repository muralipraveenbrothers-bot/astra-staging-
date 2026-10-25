/**
 * ASTRA AI — UNIVERSAL INTENT RESOLVER (2.1)
 * ============================================================================
 * Central Intent Engine. Classifies doctor/staff input into canonical intents,
 * extracts entities, soundex/spoken terms, and computes deterministic tool routes.
 */

import { RiskLevel } from "./AgentDefinition";

export type UniversalIntent =
  | "IDENTITY"
  | "HOSPITAL_CENSUS"
  | "IP_LIST"
  | "OP_LIST"
  | "ICU_LIST"
  | "WARD_LIST"
  | "ADMISSION_LIST"
  | "DISCHARGE_LIST"
  | "PATIENT_SEARCH"
  | "PATIENT_OPEN"
  | "LAB_PENDING"
  | "LAB_ORDER"
  | "LAB_RESULT"
  | "LAB_CRITICAL"
  | "RADIOLOGY_PENDING"
  | "RADIOLOGY_ORDER"
  | "RADIOLOGY_REPORT"
  | "PHARMACY_PENDING"
  | "PHARMACY_DISPENSE"
  | "PHARMACY_STOCK"
  | "WARD_TASK"
  | "WARD_VITAL"
  | "WARD_TRANSFER"
  | "OT_LIST"
  | "OT_SCHEDULE"
  | "OT_STATUS"
  | "BILLING_PENDING"
  | "BILLING_STATUS"
  | "BILLING_SUMMARY"
  | "INSURANCE_STATUS"
  | "PMJAY_STATUS"
  | "CLAIM_STATUS"
  | "CREATE_TASK"
  | "ASSIGN_TASK"
  | "NOTIFICATION"
  | "PRESCRIPTION"
  | "DISCHARGE"
  | "REFERRAL"
  | "CLINICAL_QUESTION"
  | "DIAGNOSTIC_REASONING"
  | "PATHOPHYSIOLOGY"
  | "BLIND_SPOT_ANALYSIS"
  | "RULE_OUT"
  | "RULE_IN"
  | "INTEGRATIVE_MEDICINE"
  | "OP_MARGIN_ANALYSIS"
  | "SUSRUTA_ANALYSIS"
  | "HOPE_ENGINE"
  | "BIO_SIM_ANALYSIS"
  | "MOLECULAR_CASCADE"
  | "VENT_BRAIN"
  | "TOX_COMMAND"
  | "TRAUMA_TRIAGE"
  | "SURGICAL_ROADMAP"
  | "SHIELD_CHECK"
  | "SYNAPSE_SUMMARY"
  | "MEDICAL_EVIDENCE"
  | "GUIDELINE_SEARCH"
  | "PUBMED_SEARCH"
  | "IMAGE_ANALYSIS"
  | "IMAGE_COMPARE"
  | "IMAGE_ENHANCE"
  | "VOICE_COMMAND"
  | "SYSTEM_STATUS"
  | "NAVIGATION"
  | "UNKNOWN";

export interface ResolvedIntentOutput {
  rawRequest: string;
  normalizedRequest: string;
  intent: UniversalIntent;
  entities: {
    patientName?: string;
    uhid?: string;
    bedNumber?: string;
    labTests?: string[];
    radiologyModality?: string;
    bodyPart?: string;
    medications?: string[];
    taskTitle?: string;
    queryTopic?: string;
  };
  patientReference?: string;
  department: string;
  requestedOutput: "TABLE" | "CARD" | "REPORT" | "ACTION_CONFIRMATION" | "TEXT" | "AUDIO";
  confidence: number; // 0.0 - 1.0
  riskLevel: RiskLevel;
  requiredTools: string[];
  requiredAgents: string[];
  language: string;
}

export class UniversalIntentResolver {
  /**
   * Normalizes spoken variants, abbreviations, and common typographical errors.
   */
  public static normalize(text: string): string {
    let s = text.toLowerCase().trim().replace(/\s+/g, " ");

    // Spoken phonetic / phonetic transcription variants
    s = s.replace(/\bsee\s+bee\s+see\b/g, "cbc");
    s = s.replace(/\bsee\s+are\s+pee\b/g, "crp");
    s = s.replace(/\bkay\s+eff\s+tee\b/g, "kft");
    s = s.replace(/\bel\s+eff\s+tee\b/g, "lft");
    s = s.replace(/\bex\s+ray\b/g, "x-ray");
    s = s.replace(/\bxray\b/g, "x-ray");
    s = s.replace(/\bct\s+scan\b/g, "ct");
    s = s.replace(/\bultra\s*sound\b/g, "usg");

    // Common misspellings
    s = s.replace(/\bpatint\b/g, "patient");
    s = s.replace(/\binpt\b/g, "inpatient");
    s = s.replace(/\boutpt\b/g, "outpatient");
    s = s.replace(/\badmited\b/g, "admitted");

    return s;
  }

  /**
   * Resolves raw text into intent, entities, risk level, and required tools.
   */
  public static resolve(rawInput: string, hasImageData: boolean = false): ResolvedIntentOutput {
    const normalized = this.normalize(rawInput);
    const words = new Set(normalized.split(" "));

    // 1. IMAGE ANALYSIS
    if (hasImageData || /wound|lesion|fracture photo|image analysis|analyze image|x-ray image/i.test(normalized)) {
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "IMAGE_ANALYSIS",
        entities: { queryTopic: normalized },
        department: "RADIOLOGY",
        requestedOutput: "REPORT",
        confidence: 0.98,
        riskLevel: "INFO",
        requiredTools: ["analyzeImage", "compareImages"],
        requiredAgents: ["image_agent"],
        language: "en"
      };
    }

    // 2. IDENTITY
    if (/who are you|what is your name|identify yourself|who r u/i.test(normalized)) {
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "IDENTITY",
        entities: {},
        department: "EXECUTIVE",
        requestedOutput: "CARD",
        confidence: 1.0,
        riskLevel: "INFO",
        requiredTools: [],
        requiredAgents: ["hospital_query_agent"],
        language: "en"
      };
    }

    // 3. HOSPITAL CENSUS
    if (
      /how many patients|hospital census|total patients|bed occupancy|how many in hospital|patient count/i.test(
        normalized
      )
    ) {
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "HOSPITAL_CENSUS",
        entities: {},
        department: "EXECUTIVE",
        requestedOutput: "CARD",
        confidence: 0.99,
        riskLevel: "INFO",
        requiredTools: ["getHospitalCensus"],
        requiredAgents: ["hospital_query_agent"],
        language: "en"
      };
    }

    // 4. IP LIST (Order-independent parsing: "show ip list", "list of ip patients", "ip patient list", "show admitted patients")
    if (
      /show ip list|list ip|ip list|ip patient|list of ip|admitted patients|show admitted|show inpatients|inpatient list/i.test(
        normalized
      )
    ) {
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "IP_LIST",
        entities: {},
        department: "WARD",
        requestedOutput: "TABLE",
        confidence: 0.99,
        riskLevel: "INFO",
        requiredTools: ["getIPPatients"],
        requiredAgents: ["hospital_query_agent"],
        language: "en"
      };
    }

    // 5. OP LIST (Order-independent parsing: "show op list", "list of op patients", "op patient list")
    if (/show op list|list op|op list|op patient|list of op|outpatient list|today's opd|opd list/i.test(normalized)) {
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "OP_LIST",
        entities: {},
        department: "RECEPTION",
        requestedOutput: "TABLE",
        confidence: 0.99,
        riskLevel: "INFO",
        requiredTools: ["getOPPatients"],
        requiredAgents: ["hospital_query_agent"],
        language: "en"
      };
    }

    // 6. ICU LIST
    if (/icu patient|show icu|list icu|patients in icu|icu census/i.test(normalized)) {
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "ICU_LIST",
        entities: {},
        department: "ICU",
        requestedOutput: "TABLE",
        confidence: 0.98,
        riskLevel: "INFO",
        requiredTools: ["getICUPatients"],
        requiredAgents: ["hospital_query_agent"],
        language: "en"
      };
    }

    // 7. LAB PENDING / QUEUE
    if (/pending lab|lab queue|show lab queue|pending lab tests|lab worklist/i.test(normalized)) {
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "LAB_PENDING",
        entities: {},
        department: "LABORATORY",
        requestedOutput: "TABLE",
        confidence: 0.98,
        riskLevel: "INFO",
        requiredTools: ["getLabQueue"],
        requiredAgents: ["hospital_query_agent"],
        language: "en"
      };
    }

    // 8. RADIOLOGY PENDING / QUEUE
    if (/pending radiology|radiology queue|pending scans|radiology worklist/i.test(normalized)) {
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "RADIOLOGY_PENDING",
        entities: {},
        department: "RADIOLOGY",
        requestedOutput: "TABLE",
        confidence: 0.98,
        riskLevel: "INFO",
        requiredTools: ["getRadiologyQueue"],
        requiredAgents: ["hospital_query_agent"],
        language: "en"
      };
    }

    // 9. PHARMACY PENDING / QUEUE
    if (/pending pharmacy|pharmacy queue|pending prescriptions|dispense queue/i.test(normalized)) {
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "PHARMACY_PENDING",
        entities: {},
        department: "PHARMACY",
        requestedOutput: "TABLE",
        confidence: 0.98,
        riskLevel: "INFO",
        requiredTools: ["getPharmacyQueue"],
        requiredAgents: ["hospital_query_agent"],
        language: "en"
      };
    }

    // 10. OT STATUS / SCHEDULE
    if (/today'?s ot|ot status|ot schedule|operation theater status|running surgeries/i.test(normalized)) {
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "OT_STATUS",
        entities: {},
        department: "OT",
        requestedOutput: "TABLE",
        confidence: 0.98,
        riskLevel: "INFO",
        requiredTools: ["getOTStatus"],
        requiredAgents: ["hospital_query_agent"],
        language: "en"
      };
    }

    // 11. BILLING PENDING / SUMMARY
    if (/billing summary|pending discharge bills|billing status|today'?s revenue|collections today/i.test(normalized)) {
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "BILLING_SUMMARY",
        entities: {},
        department: "BILLING",
        requestedOutput: "CARD",
        confidence: 0.98,
        riskLevel: "INFO",
        requiredTools: ["getBillingSummary"],
        requiredAgents: ["hospital_query_agent"],
        language: "en"
      };
    }

    // 12. MULTI-LAB ORDER OR SINGLE LAB ORDER
    // e.g. "order cbc for rajesh", "order cbc, crp and creatinine for rajesh"
    if (/order\s+(.+?)\s+for\s+([A-Za-z\s]+)/i.test(normalized) || /order\s+cbc|order\s+crp/i.test(normalized)) {
      const match = normalized.match(/order\s+(.+?)\s+for\s+([A-Za-z\s]+)/i);
      const targetName = match ? match[2].trim() : undefined;
      const testClause = match ? match[1].trim() : normalized;

      // Extract individual tests
      const labTests: string[] = [];
      if (/cbc/i.test(testClause)) labTests.push("CBC (Complete Blood Count)");
      if (/crp/i.test(testClause)) labTests.push("C-Reactive Protein (CRP)");
      if (/creatinine/i.test(testClause)) labTests.push("Serum Creatinine");
      if (/lft/i.test(testClause)) labTests.push("Liver Function Test (LFT)");
      if (/kft/i.test(testClause)) labTests.push("Kidney Function Test (KFT)");

      // Check if it's radiology instead
      if (/chest\s+x-ray|x-ray|usg|ct\s+scan|mri/i.test(testClause)) {
        return {
          rawRequest: rawInput,
          normalizedRequest: normalized,
          intent: "RADIOLOGY_ORDER",
          entities: {
            patientName: targetName,
            radiologyModality: /x-ray/i.test(testClause) ? "X-Ray" : /ct/i.test(testClause) ? "CT Scan" : "USG",
            bodyPart: /chest/i.test(testClause) ? "Chest" : "Abdomen"
          },
          patientReference: targetName,
          department: "RADIOLOGY",
          requestedOutput: "ACTION_CONFIRMATION",
          confidence: 0.95,
          riskLevel: "IMPORTANT",
          requiredTools: ["createRadiologyOrder"],
          requiredAgents: ["command_agent"],
          language: "en"
        };
      }

      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "LAB_ORDER",
        entities: {
          patientName: targetName,
          labTests: labTests.length > 0 ? labTests : [testClause]
        },
        patientReference: targetName,
        department: "LABORATORY",
        requestedOutput: "ACTION_CONFIRMATION",
        confidence: 0.96,
        riskLevel: "IMPORTANT",
        requiredTools: ["createLabOrder"],
        requiredAgents: ["command_agent"],
        language: "en"
      };
    }

    // 13. REPEAT LAB ORDER (e.g. "repeat cbc")
    if (/repeat\s+(cbc|crp|kft|lft|creatinine|lab)/i.test(normalized)) {
      const match = normalized.match(/repeat\s+([a-z]+)/i);
      const test = match ? match[1].toUpperCase() : "CBC";
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "LAB_ORDER",
        entities: { labTests: [test] },
        department: "LABORATORY",
        requestedOutput: "ACTION_CONFIRMATION",
        confidence: 0.95,
        riskLevel: "IMPORTANT",
        requiredTools: ["createLabOrder"],
        requiredAgents: ["command_agent"],
        language: "en"
      };
    }

    // 14. SHOW LAB RESULT (e.g. "show his cbc", "rajesh cbc result")
    if (/show\s+(his|her|this)?\s*cbc|cbc\s+result|show\s+lab\s+result/i.test(normalized)) {
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "LAB_RESULT",
        entities: { labTests: ["CBC"] },
        department: "LABORATORY",
        requestedOutput: "CARD",
        confidence: 0.96,
        riskLevel: "INFO",
        requiredTools: ["getLabResult"],
        requiredAgents: ["patient_context_agent"],
        language: "en"
      };
    }

    // 15. OPEN PATIENT (e.g. "open Rajesh", "open patient UHID-2026-8801")
    if (/open\s+([A-Za-z\s]+|uhid-\d+|p\d+)/i.test(normalized) && !/cbc|x-ray|order/i.test(normalized)) {
      const match = normalized.match(/open\s+(patient\s+)?([A-Za-z\s\d-]+)/i);
      const target = match ? match[2].trim() : "Rajesh";
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "PATIENT_OPEN",
        entities: { patientName: target },
        patientReference: target,
        department: "CLINICAL",
        requestedOutput: "CARD",
        confidence: 0.97,
        riskLevel: "INFO",
        requiredTools: ["getPatient", "getPatientTimeline"],
        requiredAgents: ["patient_context_agent"],
        language: "en"
      };
    }

    // 16. WHAT CHANGED (DELTA)
    if (/what changed|delta timeline|timeline of|recent updates/i.test(normalized)) {
      const match = normalized.match(/what changed\s+(in|for)?\s*([A-Za-z\s]+)?/i);
      const target = match && match[2] ? match[2].trim() : undefined;
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "WARD_VITAL",
        entities: { patientName: target },
        patientReference: target,
        department: "CLINICAL",
        requestedOutput: "CARD",
        confidence: 0.94,
        riskLevel: "INFO",
        requiredTools: ["getPatientTimeline"],
        requiredAgents: ["patient_context_agent"],
        language: "en"
      };
    }

    // 17. CREATE NURSING TASK
    if (/create\s+(nursing\s+)?task\s+(for\s+)?([A-Za-z\s\d]+)?/i.test(normalized)) {
      const match = normalized.match(/task\s+(for\s+)?([A-Za-z\s\d]+)/i);
      const target = match ? match[2].trim() : "Rajesh";
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "CREATE_TASK",
        entities: {
          patientName: target,
          taskTitle: `Nursing Task for ${target}`
        },
        patientReference: target,
        department: "NURSING",
        requestedOutput: "ACTION_CONFIRMATION",
        confidence: 0.95,
        riskLevel: "REVERSIBLE",
        requiredTools: ["createTask"],
        requiredAgents: ["command_agent"],
        language: "en"
      };
    }

    // 18. PUBMED / EVIDENCE / GUIDELINE SEARCH
    if (/pubmed|guideline|evidence|research paper|literature search/i.test(normalized)) {
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "PUBMED_SEARCH",
        entities: { queryTopic: normalized },
        department: "RESEARCH",
        requestedOutput: "REPORT",
        confidence: 0.97,
        riskLevel: "INFO",
        requiredTools: ["searchPubMed", "retrieveGuideline"],
        requiredAgents: ["evidence_agent"],
        language: "en"
      };
    }

    // 19. CLINICAL REASONING / DIFFERENTIAL DIAGNOSIS
    if (
      /differential|pathophysiology|diagnosis of|clinical reasoning|fever workup|why is patient deteriorating/i.test(
        normalized
      )
    ) {
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "DIAGNOSTIC_REASONING",
        entities: { queryTopic: normalized },
        department: "CLINICAL",
        requestedOutput: "REPORT",
        confidence: 0.96,
        riskLevel: "INFO",
        requiredTools: ["searchMedicalKnowledge", "retrieveGuideline"],
        requiredAgents: ["clinical_reasoning_agent", "hermes_brain"],
        language: "en"
      };
    }

    // 19A. BLIND SPOT ANALYSIS (e.g. "find blind spots in Rajesh", "blind spot analysis")
    if (/blind spot|blindspot|safety gap|what am i missing|missed something|full safety check/i.test(normalized)) {
      const nameMatch = normalized.match(/in\s+([a-z\s]+)$/i);
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "BLIND_SPOT_ANALYSIS",
        entities: { patientName: nameMatch ? nameMatch[1].trim() : undefined },
        patientReference: nameMatch ? nameMatch[1].trim() : undefined,
        department: "CLINICAL",
        requestedOutput: "REPORT",
        confidence: 0.97,
        riskLevel: "INFO",
        requiredTools: ["detectBlindSpots"],
        requiredAgents: ["clinical_blind_spot_agent"],
        language: "en"
      };
    }

    // 19B. RULE IN / RULE OUT (e.g. "rule out PE in Rajesh", "rule in dengue")
    const ruleOutMatch = normalized.match(/rule\s+out\s+(.+?)(?:\s+(?:in|for)\s+([a-z0-9\s-]+))?$/i);
    if (/rule\s+out\s+/i.test(normalized) && ruleOutMatch) {
      const condition = ruleOutMatch[1].trim().replace(/\s+(?:in|for)\s+[a-z0-9\s-]+$/i, "");
      const patient = ruleOutMatch[2] ? ruleOutMatch[2].trim() : undefined;
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "RULE_OUT",
        entities: { queryTopic: condition, patientName: patient },
        patientReference: patient,
        department: "CLINICAL",
        requestedOutput: "REPORT",
        confidence: 0.95,
        riskLevel: "INFO",
        requiredTools: ["ruleOutCondition"],
        requiredAgents: ["rule_out_agent"],
        language: "en"
      };
    }
    const ruleInMatch = normalized.match(/rule\s+in\s+(.+?)(?:\s+(?:in|for)\s+([a-z0-9\s-]+))?$/i);
    if (/rule\s+in\s+/i.test(normalized) && ruleInMatch) {
      const condition = ruleInMatch[1].trim().replace(/\s+(?:in|for)\s+[a-z0-9\s-]+$/i, "");
      const patient = ruleInMatch[2] ? ruleInMatch[2].trim() : undefined;
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "RULE_IN",
        entities: { queryTopic: condition, patientName: patient },
        patientReference: patient,
        department: "CLINICAL",
        requestedOutput: "REPORT",
        confidence: 0.94,
        riskLevel: "INFO",
        requiredTools: ["ruleInCondition"],
        requiredAgents: ["rule_in_agent"],
        language: "en"
      };
    }

    // 19C. INTEGRATIVE MEDICINE (prakriti / diet / herb-drug / ritucharya / naturopathy)
    if (/prakriti|ayurved|diet chart|diet for|local diet|diet plan|meal plan|food chart|ritucharya|seasonal regimen|naturopath|hydrotherapy|ashwagandha|turmeric|tulsi|herb|food.*timing|interaction of/i.test(normalized)) {
      const nameMatch = normalized.match(/(?:for|of)\s+([a-z\s]+?)(?:\s+with|\s+and|$)/i);
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "INTEGRATIVE_MEDICINE",
        entities: {
          queryTopic: normalized,
          patientName: nameMatch ? nameMatch[1].trim() : undefined
        },
        patientReference: nameMatch ? nameMatch[1].trim() : undefined,
        department: "CLINICAL",
        requestedOutput: "REPORT",
        confidence: 0.94,
        riskLevel: "INFO",
        requiredTools: ["analyzePrakriti", "generateDietChart", "checkHerbDrugInteraction", "suggestRitucharya"],
        requiredAgents: ["integrative_medicine_agent", "ayurveda_hod", "dietetics_hod"],
        language: "en"
      };
    }

    // 19D. OP MARGIN / BREAK-EVEN ANALYSIS
    if (/op margin|break.even|margin analysis|cost per op|procedure cost|profit margin|margin for/i.test(normalized)) {
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "OP_MARGIN_ANALYSIS",
        entities: { queryTopic: normalized },
        department: "FINANCE",
        requestedOutput: "REPORT",
        confidence: 0.96,
        riskLevel: "INFO",
        requiredTools: ["analyzeOpMargin"],
        requiredAgents: ["op_margin_optimizer_agent"],
        language: "en"
      };
    }

    // 19E. SUSRUTA CLINICAL ANALYSIS (5-step clinical superbrain)
    if (/susruta|clinical superbrain|deep clinical|clinical analysis of|5-step|five step clinical|full clinical reasoning|clinical master analysis/i.test(normalized)) {
      const nameMatch = normalized.match(/(?:of|for|on)\s+([a-z\s]+?)(?:\?|$)/i);
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "SUSRUTA_ANALYSIS",
        entities: { patientName: nameMatch ? nameMatch[1].trim() : undefined },
        patientReference: nameMatch ? nameMatch[1].trim() : undefined,
        department: "CLINICAL",
        requestedOutput: "REPORT",
        confidence: 0.97,
        riskLevel: "INFO",
        requiredTools: ["susrutaAnalyze"],
        requiredAgents: ["susruta_clinical_superbrain"],
        language: "en"
      };
    }

    // 19F. HOPE ENGINE V3 (deep discovery — zebra hunt)
    if (/deep discovery|hope engine|hope mode|zebra hunt|rare disease hunt|mystery case|why (?:is|are|does).*no diagnosis|no diagnosis (?:yet|still)|unresolved diagnosis|what am i not thinking of/i.test(normalized)) {
      const nameMatch = normalized.match(/(?:of|for|on)\s+([a-z\s]+?)(?:\?|$)/i);
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "HOPE_ENGINE",
        entities: { patientName: nameMatch ? nameMatch[1].trim() : undefined },
        patientReference: nameMatch ? nameMatch[1].trim() : undefined,
        department: "CLINICAL",
        requestedOutput: "REPORT",
        confidence: 0.96,
        riskLevel: "INFO",
        requiredTools: ["hopeEngineInvestigate"],
        requiredAgents: ["hope_engine_v3"],
        language: "en"
      };
    }

    // 19G. BIO-SIM ANALYSIS (hemodynamic digital twin simulation)
    if (/biosim|bio.sim|digital twin sim|hemodynamic|cardiac output|svr|systemic vascular|shock (?:pattern|type|class)|what.if (?:fluid|bolus|dopamine|noradrenaline|norepinephrine|lasix|furosemide|oxygen)/i.test(normalized)) {
      const nameMatch = normalized.match(/(?:of|for|on)\s+([a-z\s]+?)(?:\?|$)/i);
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "BIO_SIM_ANALYSIS",
        entities: { patientName: nameMatch ? nameMatch[1].trim() : undefined },
        patientReference: nameMatch ? nameMatch[1].trim() : undefined,
        department: "CLINICAL",
        requestedOutput: "REPORT",
        confidence: 0.95,
        riskLevel: "INFO",
        requiredTools: ["biosimSimulate"],
        requiredAgents: ["biosim_simulator"],
        language: "en"
      };
    }

    // 19H. MOLECULAR CASCADE (7-stage pathophysiology)
    if (/molecular cascade|why (?:is|are) this patient|pathophysiology of|molecular level|7.stage|cascade analysis|mechanism of (?:the )?(?:symptom|finding)/i.test(normalized)) {
      const nameMatch = normalized.match(/(?:of|for|on)\s+([a-z\s]+?)(?:\?|$)/i);
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "MOLECULAR_CASCADE",
        entities: { patientName: nameMatch ? nameMatch[1].trim() : undefined },
        patientReference: nameMatch ? nameMatch[1].trim() : undefined,
        department: "CLINICAL",
        requestedOutput: "REPORT",
        confidence: 0.94,
        riskLevel: "INFO",
        requiredTools: ["molecularCascadeTrace"],
        requiredAgents: ["molecular_cascade_agent"],
        language: "en"
      };
    }

    // 19I. VENT-BRAIN (ventilator / ABG intelligence)
    if (/ventilat|vent brain|abg|arterial blood gas|weaning|rsbi|driving pressure|p\.?a?o?2|pac?o2|pco2|p a o 2/i.test(normalized)) {
      const nameMatch = normalized.match(/(?:of|for|on)\s+([a-z\s]+?)(?:\?|$)/i);
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "VENT_BRAIN",
        entities: { patientName: nameMatch ? nameMatch[1].trim() : undefined },
        patientReference: nameMatch ? nameMatch[1].trim() : undefined,
        department: "CLINICAL",
        requestedOutput: "REPORT",
        confidence: 0.95,
        riskLevel: "INFO",
        requiredTools: ["ventBrainAnalyze"],
        requiredAgents: ["vent_brain"],
        language: "en"
      };
    }

    // 19J. TOX-COMMAND (toxicology / toxidrome / antidote)
    if (/tox(?:icology|idrome|ic)|poisoning|poisoned|overdose|antidote|organophosphate|opioid toxicity|naloxone|paracetamol (?:overdose|toxicity)|salicylate|methanol|snake bite|scorpion|heavy metal/i.test(normalized)) {
      const nameMatch = normalized.match(/(?:of|for|on)\s+([a-z\s]+?)(?:\?|$)/i);
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "TOX_COMMAND",
        entities: { patientName: nameMatch ? nameMatch[1].trim() : undefined },
        patientReference: nameMatch ? nameMatch[1].trim() : undefined,
        department: "CLINICAL",
        requestedOutput: "REPORT",
        confidence: 0.96,
        riskLevel: "INFO",
        requiredTools: ["toxCommandAnalyze"],
        requiredAgents: ["tox_commander"],
        language: "en"
      };
    }

    // 19K. TRAUMA INTELLIGENCE (ISS / MLC / crash protocols)
    if (/trauma|iss score|injury severity|mlc|medicolegal|blood bank alert|crash protocol|code stroke|golden hour|massive transfusion|rsi|road traffic/i.test(normalized)) {
      const nameMatch = normalized.match(/(?:of|for|on)\s+([a-z\s]+?)(?:\?|$)/i);
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "TRAUMA_TRIAGE",
        entities: { patientName: nameMatch ? nameMatch[1].trim() : undefined },
        patientReference: nameMatch ? nameMatch[1].trim() : undefined,
        department: "CLINICAL",
        requestedOutput: "REPORT",
        confidence: 0.96,
        riskLevel: "INFO",
        requiredTools: ["traumaIntelligenceAssess"],
        requiredAgents: ["trauma_intelligence_coordinator"],
        language: "en"
      };
    }

    // 19L. SURGICAL ROADMAP (10-stage operative plan)
    if (/surgical roadmap|surgery plan|operative plan|preop(?:erative)? plan|10.stage|surgical readiness|stage (?:1|one).*10|operation plan/i.test(normalized)) {
      const nameMatch = normalized.match(/(?:of|for|on)\s+([a-z\s]+?)(?:\?|$)/i);
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "SURGICAL_ROADMAP",
        entities: { patientName: nameMatch ? nameMatch[1].trim() : undefined },
        patientReference: nameMatch ? nameMatch[1].trim() : undefined,
        department: "CLINICAL",
        requestedOutput: "REPORT",
        confidence: 0.95,
        riskLevel: "INFO",
        requiredTools: ["surgicalRoadmapPlan"],
        requiredAgents: ["surgical_roadmap_agent"],
        language: "en"
      };
    }

    // 19M. SHIELD CHECK (order safety screening)
    if (/shield|sop check|is this (?:order|dose|drug) (?:safe|ok)|dose (?:ok|safe|fine)|hard block|block this|check this order/i.test(normalized)) {
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "SHIELD_CHECK",
        entities: { queryTopic: normalized },
        department: "CLINICAL",
        requestedOutput: "TEXT",
        confidence: 0.94,
        riskLevel: "INFO",
        requiredTools: ["shieldCheckOrder"],
        requiredAgents: ["shield_guardian"],
        language: "en"
      };
    }

    // 19N. SYNAPSE SUMMARY (patient 360 grid)
    if (/synapse|patient 360|360 summary|patient summary grid|all about (?:this )?patient|synapse view/i.test(normalized)) {
      const nameMatch = normalized.match(/(?:of|for|on)\s+([a-z\s]+?)(?:\?|$)/i);
      return {
        rawRequest: rawInput,
        normalizedRequest: normalized,
        intent: "SYNAPSE_SUMMARY",
        entities: { patientName: nameMatch ? nameMatch[1].trim() : undefined },
        patientReference: nameMatch ? nameMatch[1].trim() : undefined,
        department: "CLINICAL",
        requestedOutput: "REPORT",
        confidence: 0.95,
        riskLevel: "INFO",
        requiredTools: ["synapseAggregate"],
        requiredAgents: ["synapse_coordinator"],
        language: "en"
      };
    }

    // 20. DEFAULT / FALLBACK
    return {
      rawRequest: rawInput,
      normalizedRequest: normalized,
      intent: "CLINICAL_QUESTION",
      entities: { queryTopic: normalized },
      department: "CLINICAL",
      requestedOutput: "TEXT",
      confidence: 0.75,
      riskLevel: "INFO",
      requiredTools: ["searchMedicalKnowledge"],
      requiredAgents: ["hermes_brain"],
      language: "en"
    };
  }
}
