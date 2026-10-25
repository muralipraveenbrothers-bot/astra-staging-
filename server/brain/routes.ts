/**
 * Visible Part 1 brain API. Session role is taken from the authenticated user.
 */
import type { Express, Request, Response } from "express";
import { authenticate } from "../rbac";
import type { UserSession } from "../types";

import { listBrainComponents } from "./components";
import { assignWork } from "./hermesCortex";
import { decidePackSync } from "./layaDecisionApi";
import { brainToolTrace, executeBrainTool } from "./toolRegistry";
import {
  advanceClinicalCase,
  approveClinicalCase,
  GraphAuthorityError,
  openClinicalCase,
  recordOutcome,
} from "./langGraphMaster";
import { govern } from "./resourceGovernor";
import { capabilityReference, environmentCapability } from "./secretVault";
import { explainCase, explainDocument } from "../../src/astra/brain/part2/explain";
import type { DocumentKind } from "../../src/astra/brain/part2/follow";
import { DOCUMENT_KINDS, watchCaseEvent } from "../../src/astra/brain/part2/follow";
import type { PathView } from "../../src/astra/brain/part2/mechanism";
import { getCase, saveCase } from "./caseState";
import { advanceEvaluation, classifyLearning, mayAutoApply, openEvaluation, proposeRevision, replayCases, seedSkills } from "../../src/astra/brain/part3/evolution";
import { parseCommand } from "../../src/astra/brain/part3/command";
import { surgicalRoadmap } from "../../src/astra/brain/part3/surgery";
import { compareRegions, costEstimate, expectedStay, safeSavings } from "../../src/astra/brain/part3/value";
import { externalAiRelease, parseBrowserCommand } from "../../src/astra/brain/part4/browser";
import { contactAction } from "../../src/astra/brain/part4/contacts";
import { runCoreCommand } from "../../src/astra/brain/part5/commands";
import { currentTrace, listTraceIds, reconstructTrace, recordBrowserAction, recordToolCall } from "../../src/astra/brain/part5/trace";
import { mem0Status } from "../../src/astra/brain/part5/memory";
import { memoryFabric, renderRecallForPrompt } from "../../src/astra/brain/part5/memoryFabric";
import { voiceboxHealth, voiceTranscripts } from "../../src/astra/brain/part5/voicePipeline";
import { reviewPatient } from "../../src/astra/brain/part5/review";
import { runAstraBrainFlow } from "./astraBrainFlow";
import { billLabelFor, statusChipForRole } from "../../src/astra/clinical/workflow/workflowGuard";

function userOf(req: Request): UserSession {
  return (req as Request & { user: UserSession }).user;
}

/** The correlation id the Flight Recorder is following for this request. */
function traceIdFrom(req: Request): string | undefined {
  const supplied = req.body?.correlationId ?? req.query?.correlationId;
  const id = typeof supplied === "string" ? supplied.trim() : "";
  return id || currentTrace()?.request_id || undefined;
}

function fail(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : "Brain request failed";
  if (/not found/i.test(message)) {
    res.status(404).json({ error: "CASE_NOT_FOUND", message });
    return;
  }
  if (error instanceof GraphAuthorityError && /doctor/i.test(message)) {
    res.status(403).json({ error: "AUTHORITY", message });
    return;
  }
  res.status(400).json({ error: "BRAIN_REQUEST", message });
}

export function registerBrainRoutes(app: Express): void {
  app.get("/api/brain/components", authenticate, (_req, res) => {
    res.json({ ok: true, components: listBrainComponents() });
  });

  app.get("/api/brain/resources", authenticate, (_req, res) => {
    res.json({ ok: true, governor: govern() });
  });

  app.post("/api/brain/resources/mode", authenticate, (req, res) => {
    const requested = String(req.body?.mode ?? "");
    if (!["ECO", "NORMAL", "PERFORMANCE", "CLINICAL_PRIORITY"].includes(requested)) {
      return void res.status(400).json({ error: "BAD_MODE" });
    }
    res.json({ ok: true, governor: govern(requested as "ECO" | "NORMAL" | "PERFORMANCE" | "CLINICAL_PRIORITY") });
  });

  app.get("/api/brain/secrets/capability", authenticate, (req, res) => {
    const id = String(req.query.id ?? "freellmapi.unified_api_key");
    res.json({
      ok: true,
      capability: capabilityReference(id),
      gateway: environmentCapability("FREELLMAPI_API_KEY"),
    });
  });

  app.post("/api/brain/tools/run", authenticate, async (req, res) => {
    const user = userOf(req);
    const correlationId = traceIdFrom(req);
    const started = Date.now();
    const toolId = String(req.body?.toolId ?? "");
    const result = await executeBrainTool(toolId, user.role, req.body?.input ?? {});
    recordToolCall({
      toolId,
      latencyMs: Date.now() - started,
      ok: result.ok,
      detail: result.ok ? "Brain tool executed by the registry." : "Registry refused the tool for this role.",
      correlationId,
    });
    res.status(result.ok ? 200 : 403).json(result);
  });

  app.post("/api/brain/decide", authenticate, (req, res) => {
    const user = userOf(req);
    const text = String(req.body?.text ?? "");
    res.json({ ok: true, pack: decidePackSync(text, user.role) });
  });

  app.post("/api/brain/assign", authenticate, async (req, res) => {
    try {
      const user = userOf(req);
      const text = String(req.body?.text ?? "");
      const assignment = await assignWork({
        text,
        role: user.role,
        invoke7D: req.body?.invoke7D === true,
        language: typeof req.body?.language === "string" ? req.body.language : "en",
        openCase: req.body?.openCase !== false,
      });
      res.json({ ok: true, assignment });
    } catch (error) {
      fail(res, error);
    }
  });

  app.post("/api/brain/flow", authenticate, async (req, res) => {
    try {
      const user = userOf(req);
      const text = String(req.body?.text ?? "");
      const flow = await runAstraBrainFlow({
        text,
        role: user.role,
        patientContext: req.body?.patientContext,
        language: typeof req.body?.language === "string" ? req.body.language : "en",
        correlationId: typeof req.body?.correlationId === "string" ? req.body.correlationId : undefined,
        executeReadTools: req.body?.executeReadTools === true,
      });
      const context = req.body?.patientContext as { uhid?: string; patientUhid?: string } | undefined;
      const uhid = String(context?.uhid ?? context?.patientUhid ?? "");
      res.json({
        ok: true,
        flow,
        workflow: {
          viewAllowed: true,
          reasonAllowed: true,
          chip: uhid ? statusChipForRole(uhid, user.role) : "",
          billLabel: uhid ? billLabelFor(uhid) : undefined,
        },
      });
    } catch (error) {
      fail(res, error);
    }
  });

  app.post("/api/brain/cases", authenticate, (req, res) => {
    try {
      const user = userOf(req);
      const text = String(req.body?.text ?? "").trim();
      if (!text) return void res.status(400).json({ error: "MISSING_TEXT" });
      res.json({ ok: true, case: openClinicalCase(text, user.role) });
    } catch (error) {
      fail(res, error);
    }
  });

  app.get("/api/brain/cases/:id", authenticate, (req, res) => {
    const found = getCase(String(req.params.id));
    if (!found) return void res.status(404).json({ error: "CASE_NOT_FOUND" });
    res.json({ ok: true, case: found });
  });

  app.post("/api/brain/cases/:id/advance", authenticate, (req, res) => {
    try {
      res.json({ ok: true, case: advanceClinicalCase(String(req.params.id)) });
    } catch (error) {
      fail(res, error);
    }
  });

  app.post("/api/brain/cases/:id/approve", authenticate, (req, res) => {
    try {
      const user = userOf(req);
      res.json({
        ok: true,
        case: approveClinicalCase(String(req.params.id), user.role, req.body?.approved !== false),
      });
    } catch (error) {
      fail(res, error);
    }
  });

  app.post("/api/brain/cases/:id/outcome", authenticate, (req, res) => {
    try {
      const user = userOf(req);
      res.json({ ok: true, case: recordOutcome(String(req.params.id), user.role, String(req.body?.note ?? "")) });
    } catch (error) {
      fail(res, error);
    }
  });

  app.post("/api/brain/explain", authenticate, (req, res) => {
    const text = String(req.body?.text ?? "");
    const view = req.body?.view as PathView | undefined;
    res.json({ ok: true, explanation: explainCase({ text, facts: req.body?.facts, view }) });
  });

  app.post("/api/brain/documents", authenticate, (req, res) => {
    const kind = String(req.body?.kind ?? "") as DocumentKind;
    if (!(DOCUMENT_KINDS as readonly string[]).includes(kind)) {
      return void res.status(400).json({ error: "BAD_DOCUMENT" });
    }
    res.json({ ok: true, document: explainDocument(kind, req.body?.facts ?? {}) });
  });

  app.post("/api/brain/watch", authenticate, (req, res) => {
    const event = String(req.body?.event ?? "");
    const previous = typeof req.body?.previous === "string" ? req.body.previous : undefined;
    const decision = watchCaseEvent(event, previous);
    const caseId = typeof req.body?.caseId === "string" ? req.body.caseId : "";
    const existing = caseId ? getCase(caseId) : null;
    if (existing) {
      existing.materiallyChanged = decision.material || existing.materiallyChanged;
      existing.watcherLog = [...(existing.watcherLog ?? []), {
        at: new Date().toISOString(),
        event,
        material: decision.material,
        action: decision.action,
      }];
      saveCase(existing);
    }
    res.json({ ok: true, decision, case: existing });
  });

  app.get("/api/brain/evolution", authenticate, (_req, res) => {
    const skills = seedSkills();
    res.json({ ok: true, skills, autoApplyNavigation: mayAutoApply("navigation"), autoApplyDosing: mayAutoApply("drug dosing logic") });
  });

  app.post("/api/brain/evolution/draft", authenticate, (req, res) => {
    const family = String(req.body?.family ?? "discharge-summary");
    const next = proposeRevision(seedSkills(), family, String(req.body?.body ?? "Draft."), "clinical", String(req.body?.reason ?? "Proposed revision."));
    const evaluation = openEvaluation(next.draft, "discharge-summary-v4");
    res.json({ ok: true, skills: next.skills, evaluation: advanceEvaluation(evaluation, typeof req.body?.reviewer === "string" ? req.body.reviewer : undefined) });
  });

  app.post("/api/brain/replay", authenticate, (req, res) => {
    const cases = Array.isArray(req.body?.cases) ? req.body.cases : [];
    res.json({ ok: true, report: replayCases(cases) });
  });

  app.post("/api/brain/learning", authenticate, (req, res) => {
    res.json({ ok: true, candidate: classifyLearning(String(req.body?.note ?? "")) });
  });

  app.post("/api/brain/surgery/roadmap", authenticate, (req, res) => {
    res.json({ ok: true, roadmap: surgicalRoadmap({ procedure: String(req.body?.procedure ?? "") }) });
  });

  app.post("/api/brain/value", authenticate, (req, res) => {
    res.json({
      ok: true,
      stay: expectedStay({ icu: req.body?.icu === true, infection: req.body?.infection === true }),
      cost: costEstimate(),
      comparison: compareRegions(Array.isArray(req.body?.prices) ? req.body.prices : [], String(req.body?.item ?? "")),
      savings: safeSavings(String(req.body?.text ?? "")),
    });
  });

  app.post("/api/brain/browser", authenticate, (req, res) => {
    const text = String(req.body?.text ?? "");
    const correlationId = traceIdFrom(req);
    const started = Date.now();
    const command = parseBrowserCommand(text);
    const external = externalAiRelease(text, req.body?.approved === true);
    recordBrowserAction({
      action: command?.action ?? "browser command",
      latencyMs: Date.now() - started,
      ok: command !== null,
      apiFirst: command?.apiFirst,
      correlationId,
    });
    res.json({ ok: true, command, external });
  });

  app.post("/api/brain/contact", authenticate, (req, res) => {
    const user = userOf(req);
    res.json({
      ok: true,
      audit: contactAction({ text: String(req.body?.text ?? ""), role: user.role, who: user.userId, related: String(req.body?.related ?? "") }),
    });
  });

  app.get("/api/brain/trace", authenticate, (req, res) => {
    const requested = typeof req.query.correlationId === "string" ? req.query.correlationId.trim() : "";
    res.json({
      ok: true,
      correlationId: currentTrace()?.request_id ?? null,
      trace: currentTrace(),
      reconstruction: requested ? reconstructTrace(requested) : null,
      traceIds: listTraceIds(),
      brainToolTrace: brainToolTrace(),
      mem0: mem0Status(),
    });
  });

  app.get("/api/brain/trace/:correlationId", authenticate, (req, res) => {
    const reconstruction = reconstructTrace(String(req.params.correlationId));
    res.status(reconstruction.found ? 200 : 404).json({ ok: reconstruction.found, reconstruction });
  });

  app.get("/api/brain/voice/health", authenticate, async (_req, res) => {
    res.json({ ok: true, voicebox: await voiceboxHealth() });
  });

  app.get("/api/brain/voice/transcripts", authenticate, (_req, res) => {
    const transcripts = voiceTranscripts();
    res.json({
      ok: true,
      count: transcripts.length,
      transcripts,
      privacy:
        "Authenticated staff view only. Raw and refined text are kept as a pair; flight-recorder events carry transcript lengths, never transcript text.",
    });
  });

  app.post("/api/brain/memory", authenticate, (req, res) => {
    const user = userOf(req);
    const text = String(req.body?.text ?? "");
    const patientId = typeof req.body?.patientId === "string" ? req.body.patientId : null;
    const gates = memoryFabric.gates(text);
    if (req.body?.recall === true) {
      const recall = memoryFabric.recall({ text, patientId, limit: 5 });
      return void res.json({
        ok: true,
        memories: recall.records,
        recall,
        prompt: renderRecallForPrompt(recall),
        gates,
        fabric: memoryFabric.status(),
        mem0: mem0Status(),
      });
    }
    const saved = memoryFabric.store({
      source_id: "doctor",
      source_type: "CLINICIAN ASSESSMENT",
      patient_id: patientId,
      encounter_id: null,
      user_id: user.userId,
      agent_id: null,
      run_id: null,
      department: null,
      memory_class: "doctor_assessment",
      sensitivity: "PHI",
      workflow_version: "clinical-case-v1",
      text,
      scope: "patient",
      expires_at: gates.expiry.expiresAt,
    });
    res.status(saved.ok ? 200 : 400).json({
      ok: saved.ok,
      reason: saved.reason,
      memory_id: saved.memory_id,
      scope: saved.scope,
      gates,
    });
  });

  app.post("/api/brain/review", authenticate, (req, res) => {
    res.json({ ok: true, review: reviewPatient(String(req.body?.text ?? ""), req.body?.facts ?? {}) });
  });

  app.post("/api/brain/core-command", authenticate, (req, res) => {
    res.json({ ok: true, command: runCoreCommand(String(req.body?.text ?? "")) });
  });

  app.post("/api/brain/command", authenticate, (req, res) => {
    const user = userOf(req);
    const mode = user.role === "ceo" ? "CEO" : user.role === "admin" ? "ADMIN" : user.role === "doctor" ? "DOCTOR" : user.role === "ward" ? "NURSING" : "DEPARTMENT";
    res.json({ ok: true, command: parseCommand(String(req.body?.text ?? ""), mode) });
  });
}
