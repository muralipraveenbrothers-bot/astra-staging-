/**
 * ASTRA AI — CLINICAL REASONING API (/api/clinical)
 * ============================================================================
 * Unified clinical intelligence endpoint. Combines:
 *   1. HermesBrain.reason() — structured DDx, pathophysiology, blind spots
 *   2. Deterministic clinical calculators (CURB-65, GCS, eGFR, Wells, etc.)
 *   3. Investigation planner + management suggestions
 * Role: doctor/nurse. All calls audit-logged.
 */
import type { Express, Request } from "express";
import { HermesBrain } from "../../src/agents/core/HermesBrain";
import { UniversalVerifier } from "../../src/agents/core/UniversalVerifier";
import type { HospitalRole } from "../../src/agents/core/AgentDefinition";
import { bmi, bsa, curb65, gcs, egfr, anionGap, qsofa, type CalcResult } from "../services/clinicalCalculators";
import { runScientistAnalysis } from "../clinical/scientistAgent";
import { db } from "../db";
import type { UserSession } from "../types";
import { mcpRegistry } from "../mcp/mcpRegistry";
import { answerSource } from "../knowledge/memoryPolicy";
import { workOrderEngine } from "../services/workOrders";
import { listCriticalAlerts, listReportVersions, listResultNotifications, listResultsLog } from "../../src/astra/clinical/results/resultsLoop.js";
import { listWorkflowEvents } from "../../src/astra/clinical/workflow/workflowGuard.js";
import { recentClinicalTurns, rememberClinicalTurn } from "../clinical/conversationMemory";
import { ContentType, ReadabilityLevel, getMitraWellnessAgent } from "../../src/agents/specialists/MitraWellnessAgent";
import { checkMedication } from "../../src/astra/clinical/medication/checkMedication.js";
import { getPragnyaCoordinator } from "../../src/agents/specialists/PragnyaCoordinator";

// `authenticate` (server/rbac.ts) attaches `req.user`, but Express's Request
// type does not declare it, so the direct cast was TS2352. Route through
// `unknown` to make the assertion explicit. Durable fix would be one
// `declare global { namespace Express { interface Request { user?: UserSession } } }`.
function who(req: Request): UserSession { return (req as unknown as { user: UserSession }).user; }

function audit(u: UserSession, action: string, details: string) {
  db.logAudit({
    actorId: u.userId,
    actorName: u.name,
    actorRole: u.role,
    action,
    category: "clinical",
    status: "SUCCESS",
    details,
  });
}

function enrichPatientContext(input: unknown): Record<string, unknown> {
  const supplied = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const uhid = String(supplied.uhid ?? supplied.patientUhid ?? "").trim();
  if (!uhid) return supplied;
  const patient = db.getPatientById(uhid);
  if (!patient) return supplied;
  const now = Date.now();
  const latest = (values: unknown[], key: string): string | undefined => values.map((v) => (v && typeof v === "object" ? String((v as Record<string, unknown>)[key] ?? "") : "")).filter(Boolean).sort().at(-1);
  const vitals = patient.vitals ?? [];
  const workOrders = workOrderEngine.listOrders({ patientId: patient.uhid });
  const reports = listReportVersions(patient.uhid);
  const resultLog = listResultsLog(patient.uhid);
  const workflowEvents = listWorkflowEvents(patient.uhid);
  const freshness = (at?: string, maxAgeHours = 24) => ({ at: at ?? null, stale: !at || now - new Date(at).getTime() > maxAgeHours * 3600000 });
  return {
    ...supplied,
    patient,
    uhid: patient.uhid,
    livingCase: {
      vitals,
      workOrders,
      reports,
      resultLog,
      workflowEvents,
      criticalAlerts: listCriticalAlerts("all", patient.uhid),
      resultNotifications: listResultNotifications(patient.uhid, false),
      provenance: {
        patient: { source: "hospital-db", verified: true },
        vitals: { source: "hospital-db", count: vitals.length, ...freshness(latest(vitals, "recordedAt"), 6) },
        workOrders: { source: "work-order-engine", count: workOrders.length, ...freshness(latest(workOrders, "updatedAt"), 24) },
        reports: { source: "results-loop", count: reports.length, ...freshness(latest(reports, "uploadedAt"), 24 * 7) },
        workflowEvents: { source: "workflow-guard", count: workflowEvents.length, ...freshness(latest(workflowEvents, "at"), 24) },
        criticalAlerts: { source: "results-loop", count: listCriticalAlerts("all", patient.uhid).length, current: listCriticalAlerts("open", patient.uhid).length > 0 },
        missing: [vitals.length === 0 && "vitals", reports.length === 0 && "reports", workOrders.length === 0 && "workOrders"].filter(Boolean),
      },
    },
  };
}

function interpretClinicalTurn(query: string, hasPatient: boolean): { language: "English" | "Telugu" | "Hindi" | "Mixed"; intent: string; responseMode: "FAST" | "SMART" | "DEEP"; evidenceSufficiency: "PATIENT_CONTEXT" | "QUESTION_ONLY" | "INSUFFICIENT" } {
  const telugu = /[\u0C00-\u0C7F]/.test(query);
  const hindi = /[\u0900-\u097F]/.test(query);
  const language = telugu && hindi ? "Mixed" : telugu ? "Telugu" : hindi ? "Hindi" : "English";
  const lower = query.toLowerCase();
  const intent = /why|cause|differential|pathophysi|mechanism|management|treatment|diagnos/.test(lower) ? "CLINICAL_REASONING" : /latest|trend|result|lab|vital/.test(lower) ? "PATIENT_DATA_REVIEW" : "CLINICAL_QUESTION";
  const responseMode = query.length > 320 || /compare|deep|comprehensive|all possibilities/.test(lower) ? "DEEP" : hasPatient || intent === "CLINICAL_REASONING" ? "SMART" : "FAST";
  const evidenceSufficiency = hasPatient ? "PATIENT_CONTEXT" : query.length >= 12 ? "QUESTION_ONLY" : "INSUFFICIENT";
  return { language, intent, responseMode, evidenceSufficiency };
}

const ROLE_TO_HOSPITAL_ROLE: Record<string, HospitalRole> = {
  doctor: "DOCTOR",
  nurse: "NURSE",
  reception: "RECEPTION",
  pharmacist: "PHARMACIST",
  lab: "LAB_TECH",
  radiology: "RADIOLOGIST",
  ot: "OT_STAFF",
  billing: "BILLING",
  insurance: "INSURANCE",
  ceo: "CEO",
  admin: "ADMIN",
  management: "MANAGEMENT",
};

export function registerClinicalRoutes(app: Express): void {
  app.get("/api/clinical/skills", (req, res) => {
    const role = String((req as any).user?.role ?? "anonymous");
    if (!["doctor", "ceo", "admin", "nurse", "ward"].includes(role)) return res.status(403).json({ ok: false, error: "CLINICAL_SKILL_CATALOG_RESTRICTED" });
    res.json({ ok: true, skills: [
      ["diagnostic-differential", "HermesBrain + scientistAgent"], ["pathophysiology", "scientistAgent"], ["investigation-planning", "scientistAgent investigation matrix"], ["laboratory-results", "resultsLoop + reassessment"], ["radiology-workflow", "radiology work orders + resultsLoop"], ["medication-safety", "/api/clinical/medication/check"], ["medication-administration", "wardSafety dose state machine"], ["emergency-triage", "Saarathi/triage + critical alerts"], ["icu-deterioration", "wardSafety vitals/escalation"], ["surgical-decision-support", "surgical roadmap"], ["anatomy-procedure-planning", "3D anatomy + ortho planner"], ["perioperative-monitoring", "OT/ward handoff"], ["transfusion-safety", "Command Center transfusion checklist"], ["clinical-trajectory", "living patient case + timeline"], ["discharge-follow-up", "discharge readiness + Mitra"], ["documentation-audit", "reports + workflow + audit ledger"],
    ].map(([id, handler]) => ({ id, handler, status: "integrated", decisionSupportOnly: true, doctorConfirmationRequired: true })) });
  });
  // Run calculators
  app.post("/api/clinical/calculate/:id", (req, res) => {
    const u = who(req);
    try {
      const { id } = req.params; const p = req.body ?? {};
      let r: CalcResult;
      switch (id) {
        case "bmi": r = bmi(p.weightKg, p.heightCm); break;
        case "bsa": r = bsa(p.weightKg, p.heightCm); break;
        case "curb65": r = curb65(!!p.confusion, p.bunMm, p.respRate, p.sbp, p.dbp, p.age); break;
        case "gcs": r = gcs(p.eye, p.verbal, p.motor); break;
        case "egfr": r = egfr(p.creatinine, p.age, p.sex); break;
        case "anionGap": r = anionGap(p.sodium, p.chloride, p.hco3); break;
        case "qsofa": r = qsofa(p.respRate, p.sbp, p.gcs); break;
        default: return res.status(404).json({ error: "UNKNOWN_CALCULATOR", id });
      }
      audit(u, `clinical.calculate:${id}`, `${r.name}=${r.value}`);
      res.json({ ok: true, result: r });
    } catch (e) { res.status(400).json({ error: e instanceof Error ? e.message : String(e) }); }
  });

  // List available calculators
  app.get("/api/clinical/calculators", (_req, res) => {
    res.json({ calculators: [
      { id: "bmi", name: "BMI", inputs: ["weightKg", "heightCm"] },
      { id: "bsa", name: "BSA (Mosteller)", inputs: ["weightKg", "heightCm"] },
      { id: "curb65", name: "CURB-65", inputs: ["confusion","bunMm","respRate","sbp","dbp","age"] },
      { id: "gcs", name: "Glasgow Coma Scale", inputs: ["eye","verbal","motor"] },
      { id: "egfr", name: "eGFR (CKD-EPI 2021)", inputs: ["creatinine","age","sex"] },
      { id: "anionGap", name: "Anion Gap", inputs: ["sodium","chloride","hco3"] },
      { id: "qsofa", name: "qSOFA (Sepsis)", inputs: ["respRate","sbp","gcs"] },
    ]});
  });

  // Full clinical reasoning (DDx + pathophysiology + blind spots)
  app.post("/api/clinical/reason", async (req, res) => {
    const u = who(req);
    try {
      const { query, patientContext } = req.body ?? {};
      if (!query || typeof query !== "string") return res.status(400).json({ error: "MISSING_QUERY" });
      const enrichedContext = enrichPatientContext(patientContext);
      const memoryKey = `${u.userId}:${String(enrichedContext.uhid ?? "general")}`;
      const priorTurns = recentClinicalTurns(memoryKey);
      const memoryContext = priorTurns.length ? { recentClinicalTurns: priorTurns } : {};
      const reasoningContext = { ...enrichedContext, ...memoryContext };
      const reasoning = await HermesBrain.reason(query, reasoningContext);
      const sourceSelection = answerSource(query);
      const interpretation = interpretClinicalTurn(query, Boolean(enrichedContext.livingCase));
      const memory = rememberClinicalTurn(memoryKey, { at: new Date().toISOString(), query, intent: interpretation.intent, responseMode: interpretation.responseMode, summary: reasoning.understanding });
      const livingCase = enrichedContext.livingCase as Record<string, any> | undefined;
      const provenance = livingCase?.provenance as Record<string, any> | undefined;
      const staleSources = Object.entries(provenance ?? {}).filter(([, value]) => value && typeof value === "object" && value.stale).map(([key]) => key);
      const missingSources = Array.isArray(provenance?.missing) ? provenance.missing : [];
      const criticalAlerts = Array.isArray(livingCase?.criticalAlerts) ? livingCase.criticalAlerts : [];
      const openCriticalAlerts = criticalAlerts.filter((alert: any) => !alert.acknowledged && !alert.acknowledgedAt);
      const safety = {
        decisionSupportOnly: true,
        doctorConfirmationRequired: true,
        staleSources,
        missingSources,
        openCriticalAlertCount: openCriticalAlerts.length,
        warnings: [
          ...missingSources.map((source: string) => `Missing ${source} data; do not treat its absence as a negative finding.`),
          ...staleSources.map((source) => `${source} data may be stale; confirm the current bedside state.`),
          ...(openCriticalAlerts.length ? [`${openCriticalAlerts.length} critical alert(s) remain unacknowledged.`] : []),
        ],
      };
      const mcp = mcpRegistry.listAll().map((s: { id: string; name: string; status: string; tools: Array<{ name: string }> }) => ({
        id: s.id,
        name: s.name,
        status: s.status,
        tools: s.tools.map((t) => t.name),
      }));
      audit(u, "clinical.reason", `DDx likely: ${(reasoning.differential?.likely ?? []).join(", ")}`);
      res.json({
        ok: true,
        reasoning,
        safety,
        sourcePlan: {
          ...sourceSelection,
          ragRequired: sourceSelection.store === "E",
          patientTruthRequired: sourceSelection.store === "G",
          externalTools: "not auto-executed; explicit approval required",
        },
        interpretation,
        evidence: {
          citations: Array.isArray((reasoning as any).citations) ? (reasoning as any).citations : [],
          citationCount: Array.isArray((reasoning as any).citations) ? (reasoning as any).citations.length : 0,
          sourcePolicy: sourceSelection,
          sufficiency: interpretation.evidenceSufficiency,
          livePatientFactsMustComeFrom: "patient_context",
          externalResearch: "not claimed unless a governed source is attached",
        },
        context: { uhid: enrichedContext.uhid ?? null, livingCaseIncluded: Boolean(enrichedContext.livingCase), memoryTurns: memory.length, memoryPolicy: "bounded recent turns; non-diagnostic continuity only" },
        mcp: {
          servers: mcp,
          note: "MCP tools are listed only. They are never auto-executed from this endpoint — call /api/mcp with approval.",
        },
      });
    } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
  });

  // Patient/family communication: deterministic, plain-language output only; clinician review remains required.
  app.post("/api/clinical/communication", async (req, res) => {
    const u = who(req);
    try {
      const body = req.body ?? {};
      if (!body.patientName || !body.clinicalInput) return res.status(400).json({ error: "MISSING_PATIENT_OR_CLINICAL_INPUT" });
      const contentType = Object.values(ContentType).includes(body.contentType) ? body.contentType : ContentType.PATIENT_EDUCATION;
      const audience = ["patient", "family", "caregiver"].includes(body.targetAudience) ? body.targetAudience : "patient";
      if (audience !== "patient" && body.familyAuthorized !== true) return res.status(403).json({ ok: false, error: "FAMILY_AUTHORIZATION_REQUIRED", message: "Family/caregiver communication requires documented patient authorization or authorized representative consent." });
      const readabilityLevel = Object.values(ReadabilityLevel).includes(body.readabilityLevel) ? body.readabilityLevel : ReadabilityLevel.BASIC;
      const response = await getMitraWellnessAgent().process({ id: `mitra-${Date.now()}`, patientId: String(body.patientId ?? "unknown"), patientName: String(body.patientName), contentType, clinicalInput: String(body.clinicalInput), targetAudience: audience, readabilityLevel, language: String(body.language ?? "en") });
      audit(u, "clinical.communication", `type=${contentType}; audience=${audience}; patient=${String(body.patientName).slice(0, 80)}`);
      res.json({ ok: true, response, safety: { reviewRequired: true, decisionSupportOnly: true, familyAuthorization: audience === "patient" ? "not_required" : "provided", no_autonomous_diagnosis_or_treatment: true } });
    } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
  });
  app.post("/api/clinical/pragnya/route", async (req, res) => {
    const u = who(req);
    const query = String(req.body?.query ?? "").trim();
    if (!query) return res.status(400).json({ ok: false, error: "QUERY_REQUIRED" });
    const coordinator = getPragnyaCoordinator();
    const response = await coordinator.routeRequest({ id: `pragnya-${Date.now()}`, query, userId: u.userId, role: u.role, patientId: req.body?.patientId ? String(req.body.patientId) : undefined, context: { sessionHistory: [], activeAlerts: [] }, priority: req.body?.priority === "emergency" ? "emergency" : req.body?.priority === "urgent" ? "urgent" : "routine", timestamp: new Date() });
    audit(u, "clinical.pragnya.route", `target=${response.routing.primaryTarget}; patient=${String(req.body?.patientId ?? "none")}`);
    res.json({ ok: true, response, safety: "Routing and safety metadata only; no order, prescription, or patient mutation is executed by this endpoint." });
  });

  app.post("/api/clinical/medication/check", (req, res) => {
    try {
      const draft = req.body?.draft;
      const patientContext = req.body?.patientContext;
      if (!draft?.drug || !patientContext?.patientId) return res.status(400).json({ ok: false, error: "DRAFT_AND_PATIENT_CONTEXT_REQUIRED" });
      const findings = checkMedication(draft, patientContext);
      res.json({ ok: true, findings, safety: { reviewRequired: true, doctorOrPharmacistMustApprove: true, medicationNotAdded: true } });
    } catch (e) { res.status(400).json({ ok: false, error: e instanceof Error ? e.message : String(e) }); }
  });

  // Scientist agent — interactive diagnosis + cause-finder (decision support only)
  app.post("/api/clinical/scientist/analyze", async (req, res) => {
    const u = who(req);
    try {
      const { caseData, prior, newResult } = req.body ?? {};
      const analysis = await runScientistAnalysis(caseData, { prior, newResult });
      const verification = UniversalVerifier.verify({
        originalQuery: analysis.problemRepresentation,
        normalizedIntent: "CLINICAL_QUESTION",
        patientAuthorized: true,
        userRole: ROLE_TO_HOSPITAL_ROLE[u.role] ?? "DOCTOR",
        toolsInvoked: ["scientist.analyze"],
        rawOutputText: analysis.spokenSummary,
        isActionCompleted: true,
        isEvidenceCitationsPresent: analysis.evidence.length > 0,
      });
      audit(
        u,
        "clinical.scientist.analyze",
        `mode=${analysis.mode}; top=${analysis.hypotheses[0]?.diagnosis ?? "none"}; redFlags=${analysis.redFlags.length}; redFlagNames=${analysis.redFlags.join("|").slice(0, 200)}`
      );
      res.json({ ok: true, analysis, verification, decisionSupportOnly: true, doctorConfirmationRequired: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const status = message.startsWith("MISSING_") ? 400 : 500;
      res.status(status).json({ error: message });
    }
  });
}
