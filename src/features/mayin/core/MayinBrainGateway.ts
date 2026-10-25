/**
 * ASTRA 7D — DR. MAYIN BRAIN GATEWAY
 * ============================================================================
 * ONE central intelligence hub for all Dr. Mayin cognition.
 *
 * Architecture (spec §29-§35):
 *
 *   MayinBrainGateway
 *       ↓
 *   ┌────────────────┬───────────────────┐
 *   │                │                   │
 * LAYA             HERMES            LANGGRAPH
 *  (S1 reflex)     (S2 planner)     (workflow orchestration)
 *       │                │                   │
 *       └────────────────┼───────────────────┘
 *                        │
 *         Second Brain / Cognee / Memory
 *                        │
 *         Astra Clinical Tools + APIs
 *
 * ALL hospital facts flow through this gateway.
 * Voice providers render the final text — they do NOT access clinical data.
 */

import type { MayinContext } from "./MayinTypes";
import { resolveDashboard, findDashboardById, dashboardConfirmationMessage } from "./MayinDashboardRoutes";

// ---------------------------------------------------------------------------
// LAYA — System 1 reflex intelligence (spec §30)
// ---------------------------------------------------------------------------

export type LayaIntent =
  | "navigate"
  | "query_patient"
  | "query_labs"
  | "query_medication"
  | "query_radiology"
  | "query_vitals"
  | "clinical_analysis"
  | "pharmacy_check"
  | "pharmacy_dispatch"
  | "ward_status"
  | "billing_query"
  | "discharge_prepare"
  | "open_dashboard"
  | "close_dashboard"
  | "explain"
  | "compare"
  | "summarize"
  | "acknowledge"
  | "status_check"
  | "none";

export type LayaUrgency = "ROUTINE" | "EXPEDITED" | "URGENT" | "CRITICAL";

export type LayaRiskLevel = "READ" | "DRAFT" | "WRITE" | "RESTRICTED";

export interface LayaDecision {
  intent: LayaIntent;
  urgency: LayaUrgency;
  riskLevel: LayaRiskLevel;
  requiresConfirmation: boolean;
  targetDashboard?: string;
  patientGrounding?: {
    patientId?: string;
    encounterId?: string;
  };
  explanation: string;
}

// ---------------------------------------------------------------------------
// DASHBOARD TARGET RESOLUTION (uses the dashboard registry)
// ---------------------------------------------------------------------------

function resolveDashboardTarget(text: string, role: string): string | undefined {
  const match = resolveDashboard(text, role);
  return match?.id;
}

// ---------------------------------------------------------------------------
// LAYA CLASSIFY — fast reflex classification (spec §30)
// ---------------------------------------------------------------------------

export async function layaClassify(
  text: string,
  context: MayinContext
): Promise<LayaDecision> {
  const lower = text.toLowerCase();
  const role = context.role || "DOCTOR";

  // Clinical evidence tokens (lab values, latest results) mean the doctor is
  // asking a clinical question — "show latest CBC results" is NOT a navigate.
  const hasClinicalToken = /\b(cbc|hb|hba1c|esr|crp|result|results|test|tests|creatinine|troponin|glucose|latest|pending)\b/.test(lower);

  // Navigate commands → dashboard registry
  if (!hasClinicalToken && /\b(open|show|go\s+to|navigate|load|bring\s+up)\b/.test(lower)) {
    const dashboard = resolveDashboardTarget(lower, role);
    if (dashboard) {
      return {
        intent: "navigate",
        urgency: "ROUTINE",
        riskLevel: "READ",
        requiresConfirmation: false,
        targetDashboard: dashboard,
        explanation: `Opening ${dashboard}.`,
      };
    }
  }

  // Quick status checks (read-only → execute directly, no reasoning chain)
  if (/\b(status|how\s+is|stable|doing)\b/.test(lower) && context.patientId) {
    return {
      intent: "query_patient",
      urgency: "EXPEDITED",
      riskLevel: "READ",
      requiresConfirmation: false,
      patientGrounding: { patientId: context.patientId, encounterId: context.encounterId },
      explanation: "Checking patient status from live records.",
    };
  }

  // Lab queries
  if (/\b(lab|laboratory|test|tests|result|results|cbc|hemoglobin|hba1c|creatinine|troponin)\b/.test(lower)) {
    return {
      intent: "query_labs",
      urgency: "EXPEDITED",
      riskLevel: "READ",
      requiresConfirmation: false,
      patientGrounding: { patientId: context.patientId, encounterId: context.encounterId },
      explanation: /\bpending\b/.test(lower)
        ? "Querying pending lab results."
        : "Retrieving lab results.",
    };
  }

  // Pharmacy — dispatch is a WRITE action and always requires confirmation
  if (/\b(pharmacy|medicine|drug|medication|dispense|dispatch|order)\b/.test(lower)) {
    if (/\b(dispatched|given|sent|delivered)\b/.test(lower)) {
      return {
        intent: "pharmacy_check",
        urgency: "EXPEDITED",
        riskLevel: "READ",
        requiresConfirmation: false,
        patientGrounding: { patientId: context.patientId },
        explanation: "Checking pharmacy order status.",
      };
    }
    if (/\b(dispatch|send|order)\b/.test(lower)) {
      return {
        intent: "pharmacy_dispatch",
        urgency: "EXPEDITED",
        riskLevel: "WRITE",
        requiresConfirmation: true,
        patientGrounding: { patientId: context.patientId },
        explanation: "Drafting pharmacy order — requires confirmation before sending.",
      };
    }
  }

  // Radiology
  if (/\b(ct|mri|scan|x-?ray|radiology|imaging|ultrasound|usg)\b/.test(lower)) {
    return {
      intent: "query_radiology",
      urgency: "EXPEDITED",
      riskLevel: "READ",
      requiresConfirmation: false,
      patientGrounding: { patientId: context.patientId, encounterId: context.encounterId },
      explanation: "Retrieving radiology reports.",
    };
  }

  // Compare
  if (/\b(compare|versus|difference|trend|increase|decrease)\b/.test(lower)) {
    return {
      intent: "compare",
      urgency: "ROUTINE",
      riskLevel: "READ",
      requiresConfirmation: false,
      patientGrounding: { patientId: context.patientId, encounterId: context.encounterId },
      explanation: "Comparing current values with previous records.",
    };
  }

  // Explain a selection
  if (/\b(explain|what is|tell me about)\b/.test(lower)) {
    return {
      intent: "explain",
      urgency: "ROUTINE",
      riskLevel: "READ",
      requiresConfirmation: false,
      patientGrounding: { patientId: context.patientId, encounterId: context.encounterId },
      explanation: "Explaining the selected item.",
    };
  }

  // Acknowledge
  if (/^\s*(ok|okay|thanks|thank you|noted|acknowledge|yes|no)\b/i.test(text)) {
    return {
      intent: "acknowledge",
      urgency: "ROUTINE",
      riskLevel: "READ",
      requiresConfirmation: false,
      explanation: "Acknowledging.",
    };
  }

  // Clinical analysis (patient-grounded) → route to Hermes/LangGraph
  if (context.patientId) {
    return {
      intent: "clinical_analysis",
      urgency: "ROUTINE",
      riskLevel: "READ",
      requiresConfirmation: false,
      patientGrounding: { patientId: context.patientId, encounterId: context.encounterId },
      explanation: "Routing to clinical analysis workflow.",
    };
  }

  return {
    intent: "status_check",
    urgency: "ROUTINE",
    riskLevel: "READ",
    requiresConfirmation: false,
    targetDashboard: context.module,
    explanation: context.module
      ? `Checking pending items in ${context.module}.`
      : "Checking pending items.",
  };
}


// ---------------------------------------------------------------------------
// HERMES — System 2 planner (spec §31)
// ---------------------------------------------------------------------------

export interface HermesPlan {
  steps: string[];
  requiresTools: string[];
  evidenceSources: string[];
  estimatedComplexity: "LOW" | "MEDIUM" | "HIGH";
  explanation: string;
}

/**
 * HERMES — deep planner for complex tasks: multi-step patient analysis,
 * tool selection, evidence retrieval, and cross-department workflows.
 */
export async function hermesPlan(
  intent: LayaDecision,
  text: string,
  context: MayinContext
): Promise<HermesPlan> {
  const steps: string[] = [];
  const tools: string[] = [];
  const evidence: string[] = [];

  if (context.patientId) {
    steps.push("Resolve patient record");
    evidence.push("Astra patient database");
  }

  switch (intent.intent) {
    case "query_patient":
      steps.push("Fetch latest vitals", "Fetch active medications", "Fetch recent lab results");
      tools.push("patient_timeline_api", "vitals_api", "medication_api");
      evidence.push("Current vitals", "Medication list", "Latest lab report");
      break;
    case "query_labs":
      steps.push("Query lab database for patient", "Sort by date descending");
      if (/\bpending\b/.test(text.toLowerCase())) steps.push("Filter for pending tests");
      tools.push("lab_api");
      evidence.push("Laboratory information system");
      break;
    case "clinical_analysis":
      steps.push(
        "Retrieve patient timeline",
        "Collect recent labs",
        "Review current medications",
        "Check vital trends",
        "Review nursing observations",
        "Run relevant clinical workflow"
      );
      tools.push("patient_timeline_api", "lab_api", "medication_api", "vitals_api", "clinical_workflow_engine");
      evidence.push("Patient history", "Lab trends", "Medication list", "Vitals trend", "Clinical guidelines");
      break;
    case "compare":
      steps.push("Retrieve current values", "Retrieve previous values", "Calculate changes");
      tools.push("lab_api", "vitals_api", "calculation_engine");
      evidence.push("Current values", "Previous values", "Calculated differences");
      break;
    case "pharmacy_check":
      steps.push("Query pharmacy order system", "Retrieve order status");
      tools.push("pharmacy_api");
      evidence.push("Pharmacy order records");
      break;
    case "query_radiology":
      steps.push("Query radiology database", "Retrieve reports");
      tools.push("radiology_api", "dicom_api");
      evidence.push("Radiology information system", "PACS");
      break;
    default:
      steps.push("Process request through appropriate workflow");
      tools.push("astra_tool_bus");
      evidence.push("Astra integrated data sources");
  }

  return {
    steps,
    requiresTools: tools,
    evidenceSources: evidence,
    estimatedComplexity: steps.length > 5 ? "HIGH" : steps.length > 3 ? "MEDIUM" : "LOW",
    explanation: `I will check ${evidence.slice(0, 3).join(", ")}.`,
  };
}

// ---------------------------------------------------------------------------
// LANGGRAPH — Workflow orchestration (spec §32)
// ---------------------------------------------------------------------------

export type LangGraphWorkflow =
  | "patient_clinical_analysis"
  | "lab_interpretation"
  | "drug_review"
  | "discharge_preparation"
  | "pharmacy_order"
  | "reception_task"
  | "vitals_assessment"
  | "7d_clinical_analysis"
  | "none";

export interface LangGraphExecution {
  workflow: LangGraphWorkflow;
  status: "queued" | "running" | "completed" | "failed";
  result?: unknown;
  evidence?: string[];
  explanation?: string;
}

/** Map a Laya intent to the LangGraph workflow that should run. */
export function selectWorkflow(intent: LayaDecision): LangGraphWorkflow {
  switch (intent.intent) {
    case "clinical_analysis":
      return "patient_clinical_analysis";
    case "query_labs":
      return "lab_interpretation";
    case "pharmacy_dispatch":
      return "pharmacy_order";
    case "discharge_prepare":
      return "discharge_preparation";
    default:
      return "none";
  }
}


// ---------------------------------------------------------------------------
// MAYIN BRAIN GATEWAY — main class (spec §29)
// ---------------------------------------------------------------------------

export interface BrainRequest {
  text: string;
  context: MayinContext;
  /** BCP-47-ish tag, e.g. "en-IN", "te-IN", "hi-IN". */
  language: string;
}

export interface BrainResponse {
  /** Final text for the conversation controller to speak via the provider. */
  speech: string;
  responseId?: string;
  topic?: string;
  /** Which LangGraph workflow this turn maps to (if any). */
  workflow?: LangGraphWorkflow;
  completedSection?: string;
  remainingSections?: string[];
  /** Safe explainability — for "How did you get that?" answers. */
  dataSources?: string[];
  toolsUsed?: string[];
  evidenceUsed?: string[];
  calculations?: string[];
  uncertainties?: string[];
  actionTaken?: {
    type: "navigation" | "query" | "draft" | "confirmation_required";
    details?: Record<string, unknown>;
  };
}

/**
 * ONE hub for all Dr. Mayin cognition. LAYA classifies fast, HERMES plans
 * complex work, LANGGRAPH names the workflow. Voice providers only render the
 * final `speech` text — they never access clinical data or hospital facts.
 */
export class MayinBrainGateway {
  private context: MayinContext;

  constructor(context: MayinContext) {
    this.context = context;
  }

  updateContext(context: MayinContext): void {
    this.context = context;
  }

  getContext(): MayinContext {
    return this.context;
  }

  async process(request: BrainRequest): Promise<BrainResponse> {
    const { text } = request;
    const layaDecision = await layaClassify(text, this.context);

    let hermesPlanResult: HermesPlan | null = null;
    if (
      layaDecision.intent === "clinical_analysis" ||
      layaDecision.urgency === "URGENT" ||
      layaDecision.urgency === "CRITICAL"
    ) {
      hermesPlanResult = await hermesPlan(layaDecision, text, this.context);
    }

    const response = this.synthesizeResponse(layaDecision, hermesPlanResult);

    if (layaDecision.patientGrounding) {
      this.context = { ...this.context, ...layaDecision.patientGrounding };
    }
    return response;
  }


  private synthesizeResponse(
    laya: LayaDecision,
    hermesPlanResult: HermesPlan | null
  ): BrainResponse {
    const responseId = `R-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const dataSources: string[] = [];
    const toolsUsed: string[] = [];
    let speech = "";
    let completedSection = "initial_response";
    let remainingSections: string[] = [];

    switch (laya.intent) {
      case "navigate": {
        const dashboard = laya.targetDashboard
          ? findDashboardById(laya.targetDashboard)
          : undefined;
        speech = dashboard
          ? dashboardConfirmationMessage(dashboard, "en")
          : "Navigating now.";
        dataSources.push("Astra dashboard registry");
        toolsUsed.push("dashboard_navigation");
        break;
      }
      case "query_patient":
        speech = "Let me check the patient records.";
        dataSources.push("Patient EMR", "Vitals database", "Lab system");
        toolsUsed.push("patient_api", "vitals_api", "lab_api");
        break;
      case "query_labs":
        speech = "Checking the laboratory results now.";
        dataSources.push("Laboratory Information System");
        toolsUsed.push("lab_api");
        break;
      case "clinical_analysis":
        if (hermesPlanResult) {
          speech = hermesPlanResult.explanation;
          dataSources.push(...hermesPlanResult.evidenceSources);
          toolsUsed.push(...hermesPlanResult.requiresTools);
          completedSection = "analysis_plan";
          remainingSections = hermesPlanResult.steps.slice(1);
        } else {
          speech = "I'm analyzing this patient now.";
          dataSources.push("Patient records");
          toolsUsed.push("clinical_analysis_engine");
        }
        break;
      case "compare":
        speech = "Let me compare these values.";
        dataSources.push("Current records", "Previous records");
        toolsUsed.push("lab_api", "comparison_engine");
        break;
      case "explain":
        if (this.context.selectedLabId) {
          speech = "Let me explain this lab result.";
          dataSources.push("Lab report", "Reference ranges", "Clinical guidelines");
          toolsUsed.push("lab_interpretation");
        } else if (this.context.selectedAnatomyNode) {
          speech = "Let me explain this anatomical structure.";
          dataSources.push("Anatomical reference");
          toolsUsed.push("anatomy_knowledge_base");
        } else {
          speech = "Let me explain that for you.";
          dataSources.push("Knowledge base");
          toolsUsed.push("knowledge_retrieval");
        }
        break;
      case "pharmacy_check":
        speech = "Checking pharmacy order status.";
        dataSources.push("Pharmacy order system");
        toolsUsed.push("pharmacy_api");
        break;
      case "pharmacy_dispatch":
        speech = "I have drafted the pharmacy order. Please confirm to send it.";
        dataSources.push("Pharmacy order system");
        toolsUsed.push("pharmacy_api");
        break;
      case "status_check": {
        const module = laya.targetDashboard || "the current section";
        speech = `Checking pending items in ${module}.`;
        dataSources.push("Active dashboard");
        toolsUsed.push("dashboard_api");
        break;
      }
      case "acknowledge":
        speech = "Understood.";
        break;
      default:
        speech = "I'm working on that now.";
        dataSources.push("Astra integrated systems");
        toolsUsed.push("astra_tool_bus");
    }

    return {
      speech,
      responseId,
      topic: laya.intent,
      workflow: selectWorkflow(laya),
      completedSection,
      remainingSections: remainingSections.length > 0 ? remainingSections : undefined,
      dataSources: dataSources.length > 0 ? dataSources : undefined,
      toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
      actionTaken:
        laya.intent === "navigate" && laya.targetDashboard
          ? { type: "navigation", details: { dashboard: laya.targetDashboard } }
          : laya.requiresConfirmation && laya.riskLevel === "WRITE"
            ? { type: "confirmation_required" }
            : { type: "query" },
    };
  }

  /**
   * Safe explainability for "How did you get that?" — shows data/tools/evidence
   * in clinical language. NEVER exposes hidden chain-of-thought (spec §28).
   */
  explainReasoning(response: BrainResponse): string {
    const parts: string[] = [];
    if (response.dataSources?.length) {
      parts.push(`I checked ${response.dataSources.join(", ")}.`);
    }
    if (response.toolsUsed?.length) {
      parts.push(`I used ${response.toolsUsed.join(", ")}.`);
    }
    if (response.calculations?.length) {
      parts.push(`Calculations: ${response.calculations.join(", ")}.`);
    }
    if (response.uncertainties?.length) {
      parts.push(
        `Uncertain about ${response.uncertainties.join("; ")} — I will not speculate without that information.`
      );
    }
    return parts.length > 0
      ? parts.join(" ")
      : "I processed your request through Astra's clinical systems.";
  }
}

let brainGatewaySingleton: MayinBrainGateway | null = null;

/** One gateway per session; context is refreshed on every call. */
export function getMayinBrainGateway(context: MayinContext): MayinBrainGateway {
  if (!brainGatewaySingleton) {
    brainGatewaySingleton = new MayinBrainGateway(context);
  } else {
    brainGatewaySingleton.updateContext(context);
  }
  return brainGatewaySingleton;
}

