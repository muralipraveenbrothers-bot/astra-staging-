import type { Express, Request, Response } from "express";
import { authenticate } from "../rbac";
import type { UserSession } from "../types";
import { db } from "../db";
import { astraOrchestrator } from "../orchestrator";
import { detectLanguage } from "../voice/langDetector";
import { toAstraLanguage, newTurnId, type AstraDashboard, type AstraRisk } from "../../src/astra/voice/roundTrip/contracts";
import { profileForWorkspace } from "../../src/astra/saarathi/prompt/VoicePolicyProfile";
import { compileSaarathiPrompt } from "../../src/astra/saarathi/prompt/PromptCompiler";
import { saarathiSessionMemory } from "../../src/astra/saarathi/memory/SessionMemory";
import { astraActionBroker } from "../../src/astra/saarathi/actions/AstraActionBroker";
import { mapGesture, sanitizeGesture } from "../../src/astra/saarathi/gesture/GesturePolicy";
import { parseSaarathiCommand } from "../../src/astra/saarathi/command/SaarathiCommand";
import { assessSaarathiAuthority } from "../../src/astra/saarathi/command/clinicalAuthority";
import { buildTurnBrainFrame } from "../brain/turnFrame";
import { voiceIntent } from "../../src/astra/brain/part5/voice";
import { beginTrace, markTrace, reconstructTrace, recordError, recordMemorySpan, recordSpan } from "../../src/astra/brain/part5/trace";
import { memoryFabric, renderRecallForPrompt } from "../../src/astra/brain/part5/memoryFabric";
import { astraEventBus } from "../../src/astra/events/astraEventBus";
import { runCoreCommand } from "../../src/astra/brain/part5/commands";
import { reviewPatient } from "../../src/astra/brain/part5/review";
import { isCallingAstra, buildAstraAcknowledgement } from "../../src/astra/voice/roundTrip/wakeDetection";
import { classifyLocalIntent } from "../../src/astra/saarathi/intent/LocalIntentBrain";
import { Astra7DClinicalEngine } from "../clinical/astra7dEngine";
import { decideBatch } from "../reflex/decisionFabric";
import { routeIntelligence } from "../../astra/intelligence_extensions/routing/intelligenceRouter";
import { getScientificSkillsWorker } from "../../astra/intelligence_extensions/scientific_skills/worker";


function layaLabel(answer?: { choice?: string; score?: number; legend?: Record<string, string>; probabilities?: Record<string, number> }): string | undefined {
  if (!answer) return undefined;
  if (answer.choice) return answer.choice;
  const probs = answer.probabilities;
  if (probs && answer.legend) {
    let bestKey = "";
    let best = -1;
    for (const [key, value] of Object.entries(probs)) {
      if (value > best) { best = value; bestKey = key; }
    }
    return answer.legend[bestKey];
  }
  if (typeof answer.score === "number" && answer.legend) return answer.legend[String(Math.round(answer.score))];
  return undefined;
}

function firstSpokenSentences(text: string): string {
  const clean = text.replace(/[*_`#>]/g, " ").replace(/\s+/g, " ").trim();
  const parts = clean.split(/(?<=[.!?।])\s+/).filter(Boolean);
  const spoken = (parts.slice(0, 2).join(" ") || clean).trim();
  return spoken.length <= 320 ? spoken : `${spoken.slice(0, 317).replace(/\s+\S*$/, "").trim()}.`;
}

// ─── DR MAYIN — workspace constants ─────────────────────────────────────────
const WORKSPACES = new Set<AstraDashboard>(["general","reception","doctor","pharmacy","lab","radiology","billing","ward","ot"]);
const WORKSPACE_ALIAS: Record<string, AstraDashboard> = {
  clinical: "doctor", emr: "doctor", "command-os": "doctor", supercore: "doctor", copilot: "doctor",
  nursing: "ward", finance: "billing", accounts: "billing", insurance: "billing",
  radiotech: "radiology", imaging: "radiology", laboratory: "lab",
};
const CLINICAL = /diagnos|dose|potassium|hemoglobin|lab result|treatment|prescri|surgery|critical|deteriorat|chest pain|not breathing/i;
const HIGH = /not breathing|unconscious|cardiac arrest|code blue|suicid|severe bleeding|death|mlc|consent/i;
const enabled = () => process.env.ASTRA_SAARATHI_ENABLED !== "false";
const gesturesEnabled = () => process.env.ASTRA_SAARATHI_GESTURES !== "false";

function riskFor(text: string): AstraRisk { return HIGH.test(text) ? "high_clinical" : CLINICAL.test(text) ? "clinical" : "normal"; }
function workspaceOf(value: unknown): AstraDashboard {
  const raw = String(value ?? "general").toLowerCase();
  if (WORKSPACES.has(raw as AstraDashboard)) return raw as AstraDashboard;
  return WORKSPACE_ALIAS[raw] ?? "general";
}
function actor(req: Request) { return (req as any).user as UserSession; }

function turnBrain(text: string, role: string, runtime?: Parameters<typeof buildTurnBrainFrame>[0]["runtime"], voice = false) {
  try {
    return buildTurnBrainFrame({ text, role, runtime, voice });
  } catch (error) {
    return { status: "unavailable", lastError: error instanceof Error ? error.message : "brain frame failed" };
  }
}

/**
 * Dr Mayin deterministic workspace fallback — produced when ALL LLM providers fail
 * or return empty. Never says "Astra returned an empty answer". Uses live DB data.
 */
function drMayinFallback(workspace: AstraDashboard, language: string): string {
  try {
    const patients = db.getPatients();
    const beds = db.getBeds();
    const op = patients.filter(p => p.admissionStatus === "outpatient").length;
    const ip = patients.filter(p => p.admissionStatus === "inpatient").length;
    const occupied = beds.filter(b => b.status === "occupied").length;
    const base = `Hospital: ${patients.length} patients (OP ${op}, IP ${ip}). Beds occupied ${occupied}/${beds.length}.`;
    const wsNote: Partial<Record<AstraDashboard, string>> = {
      reception: "Reception queue and patient registration are operational.",
      pharmacy: "Pharmacy dispensary and stock functions are operational.",
      lab: "Lab order processing and result retrieval are operational.",
      radiology: "Radiology imaging and report systems are operational.",
      billing: "Billing and claims processing are operational.",
      ward: "Ward management and nursing controls are operational.",
      ot: "OT scheduling and surgical controls are operational.",
      doctor: "Doctor EMR and clinical copilot are operational.",
    };
    const note = wsNote[workspace] ?? "All hospital command controls are operational.";
    if (language === "te") return `\u0c21\u0c3e\u0c15\u0c4d\u0c1f\u0c30\u0c4d \u0c2e\u0c2f\u0c3f\u0c28\u0c4d \u0c07\u0c15\u0c4d\u0c15\u0c21\u0c47 \u0c09\u0c28\u0c4d\u0c28\u0c3e\u0c28\u0c41. ${base} ${note}`;
    if (language === "hi") return `\u0921\u0949\u0915\u094d\u091f\u0930 \u092e\u092f\u093f\u0928 \u092f\u0939\u093e\u0901 \u0939\u0948\u0902\u0964 ${base} ${note}`;
    return `Dr. Mayin standing by. ${base} ${note}`;
  } catch {
    return "Dr. Mayin is standing by. Hospital controls and local commands are fully operational.";
  }
}

export function registerSaarathiRoutes(app: Express) {
  // ─── Health ───────────────────────────────────────────────────────────────
  app.get("/api/saarathi/health", authenticate, async (_req: Request, res: Response) => {
    let voicebox = false;
    const base = process.env.VOICEBOX_BASE_URL || "http://127.0.0.1:17493";
    try { const r = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1800) }); voicebox = r.ok; } catch { /* optional */ }
    res.json({
      ok: enabled(), name: "DR_MAYIN",
      role: "unified AI orchestrator — Saarathi · Sanjeevani · Jarvis · Astra voice",
      primaryBrain: "ASTRA",
      components: {
        core: enabled() ? "HEALTHY" : "DISABLED",
        actionBroker: "HEALTHY",
        localIntentBrain: "HEALTHY",
        memoryAdapter: process.env.ASTRA_SAARATHI_MEMORY === "false" ? "DISABLED" : "HEALTHY",
        voicebox: voicebox ? "HEALTHY" : "OFFLINE",
        gestureBridge: gesturesEnabled() ? "ENABLED" : "DISABLED",
      },
    });
  });

  // ─── Turn handler ─────────────────────────────────────────────────────────
  app.post("/api/saarathi/turn", authenticate, async (req: Request, res: Response) => {
    if (!enabled()) return void res.status(503).json({ error: "SAARATHI_DISABLED" });
    const user = actor(req);
    const text = String(req.body?.message ?? req.body?.text ?? "").trim();
    if (!text) return void res.status(400).json({ error: "MISSING_TEXT" });

    const workspace = workspaceOf(req.body?.workspace ?? req.body?.dashboardRole);
    const detected = detectLanguage(text, String(req.body?.language ?? "en-IN"));
    const language = toAstraLanguage(detected.lang);
    const risk = riskFor(text);
    const turnId = newTurnId("mayin");
    const trace = beginTrace(turnId);
    markTrace("Voicebox");
    markTrace("Laya");
    recordSpan({
      kind: "request",
      name: "saarathi turn",
      latencyMs: 0,
      ok: true,
      detail: `Workspace ${workspace}; role ${user.role}; source ${String(req.body?.source ?? "text")}.`,
      correlationId: trace.request_id,
    });
    const patientId = String(req.body?.patientId ?? req.body?.uhid ?? "").trim();
    // ── Memory Fabric: Laya gates → scoped recall → structured Astra store ──
    const memoryStarted = Date.now();
    const gates = memoryFabric.gates(text);
    const recall = memoryFabric.recall({ text, patientId: patientId || null, limit: 5 });
    recordMemorySpan({
      operation: "gate",
      detail: gates.explanation,
      latencyMs: Date.now() - memoryStarted,
      ok: true,
      correlationId: trace.request_id,
    });
    recordMemorySpan({
      operation: "recall",
      detail: `${recall.explanation}${recall.blocked ? ` Blocked: ${recall.blocked}` : ""}`,
      latencyMs: Math.max(0, Date.now() - memoryStarted),
      ok: true,
      count: recall.records.length,
      correlationId: trace.request_id,
    });
    await astraEventBus.publish({
      correlationId: trace.request_id,
      source: "saarathi-turn",
      target: "memory-fabric",
      eventType: "astra.memory.recall",
      actorId: user.userId,
      actorRole: user.role,
      privacyClass: patientId ? "PHI" : "INTERNAL",
      riskClass: risk === "high_clinical" ? "R3" : "R0",
      patientRef: patientId || undefined,
      payload: {
        scope: recall.exactPatientScope ? "patient" : "non-patient",
        recalled: recall.records.length,
        blocked: recall.blocked,
        semanticUsed: false,
        gates: gates.explanation,
      },
    });
    if (patientId && gates.shouldStore !== "NO" && /\b(pain|fever|patient|creatinine|symptom)\b/i.test(text)) {
      const saved = memoryFabric.store({
        source_id: turnId,
        source_type: "PATIENT-REPORTED INFORMATION",
        patient_id: patientId,
        encounter_id: null,
        user_id: user.userId,
        agent_id: null,
        run_id: trace.request_id,
        department: workspace,
        memory_class: "patient_reported",
        sensitivity: "PHI",
        workflow_version: "clinical-case-v1",
        scope: "patient",
        expires_at: gates.expiry.expiresAt,
        text: text.slice(0, 500),
        verification_state: "unverified",
      });
      recordMemorySpan({
        operation: "store",
        detail: saved.ok
          ? `${saved.memory_id ?? "record"} stored in scope ${saved.scope}; expiry ${gates.expiry.source}.`
          : saved.reason,
        latencyMs: 0,
        ok: saved.ok,
        correlationId: trace.request_id,
      });
    }
    const intent = voiceIntent(text);
    if (intent === "NOT ADDRESSED TO ASTRA") {
      return void res.json({
        turnId, requestId: trace.request_id, text: "", speechText: "", silent: true, intent, language, workspace, risk,
      });
    }
    const profile = profileForWorkspace(workspace);
    const policy = compileSaarathiPrompt(profile, { role: user.role, language });

    // ── 1. Wake word — Dr Mayin always answers ──────────────────────────────
    if (isCallingAstra(text)) {
      const spoken = buildAstraAcknowledgement(language, {
        address: /\bdoctor\b/i.test(user.role) ? "Doctor" : user.name?.split(/\s+/)[0],
        seed: turnId.length,
      });
      return void res.json({
        turnId, text: spoken, speechText: spoken, language, workspace, risk: "normal",
        status: "completed", actions: [{ type: "voice.wake" }],
        provenance: ["Dr Mayin wake"], audit: { actorId: user.userId, workspace, at: new Date().toISOString() },
      });
    }

    // A full review or a slash alias is answered by the brain without a second manual route.
    const reviewRequest = /\breview (this |the )?patient\b/i.test(text);
    const slash = text.trim().startsWith("/");
    if (reviewRequest || slash) {
      if (reviewRequest && user.role !== "doctor") {
        const spoken = "A doctor reviews the patient. I have not made a diagnosis or placed an order.";
        return void res.json({
          turnId, requestId: trace.request_id, text: spoken, speechText: spoken, language, workspace, risk,
          status: "completed", actions: [], provenance: ["Astra review gate"],
        });
      }
      const review = reviewRequest ? reviewPatient(text, { presentation: text, admitted: /\badmitted\b/i.test(text) }) : null;
      const command = runCoreCommand(text);
      const spoken = review && review.kind === "clinical-review"
        ? "Decision-support view is ready. Missing questions and red flags are listed. I have not made a diagnosis or placed an order."
        : command.reply;
      return void res.json({
        turnId, requestId: trace.request_id, text: spoken, speechText: spoken, language, workspace, risk,
        status: "completed", actions: [], review, command, provenance: ["Astra brain review"],
        audit: { actorId: user.userId, workspace, at: new Date().toISOString() },
      });
    }

    // ── 2. Local Intent Brain — zero-network deterministic answers ───────────
    const localCtx = {
      workspace,
      role: user.role,
      language,
      dashboardLabel: profile.workspace ?? workspace,
      userName: user.name,
    };
    const localIntent = classifyLocalIntent(text, localCtx);
    if (localIntent && localIntent.confidence >= 0.85) {
      const actions: Array<{ type: string; path?: string }> = [];
      if (localIntent.intent === "OPEN_DASHBOARD" && localIntent.entities.dashboard) {
        actions.push({ type: "ui.navigate", path: `/${localIntent.entities.dashboard}` });
      }
      if (localIntent.intent === "STOP") actions.push({ type: "voice.stop" });
      db.logAudit({
        actorId: user.userId, actorName: user.name, actorRole: user.role,
        action: "MAYIN_LOCAL_INTENT", category: "operations", status: "SUCCESS",
        details: `workspace=${workspace}; intent=${localIntent.intent}; confidence=${localIntent.confidence}`,
      });
      return void res.json({
        turnId, text: localIntent.reply, speechText: localIntent.reply, language, workspace, risk: "normal",
        status: "completed", actions,
        provenance: ["Dr Mayin local intent brain"],
        audit: { actorId: user.userId, workspace, at: new Date().toISOString() },
      });
    }

    // ── 3. Command interpreter (stop / navigate / order) ────────────────────
    const command = parseSaarathiCommand(text, user.role);
    if (command.kind === "stop" || command.kind === "navigate" || command.kind === "order") {
      db.logAudit({
        actorId: user.userId, actorName: user.name, actorRole: user.role,
        action: "MAYIN_COMMAND", category: command.kind === "order" ? "clinical" : "operations",
        status: command.denied ? "DENIED" : "SUCCESS",
        details: `workspace=${workspace}; kind=${command.kind}; denied=${!!command.denied}`,
      });
      return void res.json({
        turnId, text: command.spoken, speechText: command.spoken, language, workspace, risk,
        status: "completed", actions: command.actions,
        brain: turnBrain(text, user.role),
        provenance: ["Dr Mayin command interpreter"],
        audit: { actorId: user.userId, workspace, at: new Date().toISOString() },
      });
    }

    // ── 4. Astra orchestrator (LLM chain) — with Dr Mayin fallback ──────────
    try {
      const memoryKey = `${user.userId}:${workspace}`;
      const history = process.env.ASTRA_SAARATHI_MEMORY === "false" ? [] : saarathiSessionMemory.read(memoryKey);
      const voiceTurn = String(req.body?.source ?? "") === "voice";
      const authority = assessSaarathiAuthority(user.role, text);
      const safetyDenied = authority.safetyDenied;
      const layaStarted = Date.now();
      const layaBatch = await decideBatch({
        schemaIds: ["urgency_classification", "department_routing", "intent_routing", "needs_human_confirmation"],
        input: text,
        timeoutMs: 8000,
      });
      const asGate = (task: string) => {
        const row = layaBatch.find((item) => item.schemaId === task);
        const latencyMs = row?.trace.latencyMs ?? (Date.now() - layaStarted);
        if (!row || row.source === "abstain") return { ok: false, task, error: "Laya did not answer", latencyMs };
        return {
          ok: true,
          task,
          answers: { [task]: { choice: row.answer, score: row.confidence, probabilities: row.scores } },
          model: row.trace.checkpoint,
          latencyMs,
          source: row.source,
        };
      };
      const urgencyDecision = asGate("urgency_classification");
      const departmentDecision = asGate("department_routing");
      const intentDecision = asGate("intent_routing");
      const confirmDecision = asGate("needs_human_confirmation");
      recordSpan({
        kind: "laya",
        name: "Laya decision gates",
        latencyMs: Date.now() - layaStarted,
        ok: urgencyDecision.ok || departmentDecision.ok,
        detail: `source=${layaBatch[0]?.source ?? "abstain"}; ${[urgencyDecision, departmentDecision, intentDecision, confirmDecision].filter((gate) => gate.ok).length}/4 gate(s) from one batch; local fallback used where they did not.`,
        correlationId: trace.request_id,
      });
      const modelStarted = Date.now();
      const result = await astraOrchestrator.handle({
        query: text, user, language,
        mode: workspace === "reception" ? "receptionist" : workspace === "doctor" ? "clinical_copilot" : "doctor",
        clinical: risk !== "normal",
        patientContext: req.body?.patientContext,
        voice: voiceTurn,
        memory: [policy, renderRecallForPrompt(recall), ...history.slice(-4).map(x => `User: ${x.userText}\nDr Mayin: ${x.assistantText}`)].join("\n\n"),
      });
      recordSpan({
        kind: "model",
        name: "Astra orchestrator",
        latencyMs: Date.now() - modelStarted,
        ok: Boolean((result.text ?? "").trim()),
        model: result.provider,
        detail: `${result.provider}: ${(result.text ?? "").trim().length} char(s); tokens were not reported by the gateway.`,
        correlationId: trace.request_id,
      });

      // ── ASTRA 7D CLINICAL INTELLIGENCE & CONVERSATIONAL SYNTHESIS ─────────
      let responseText = (result.text ?? "").trim();
      const intel = routeIntelligence(text);
      const triage = Astra7DClinicalEngine.layaSystem1Triage(text);
      const urgencyLabel = layaLabel(urgencyDecision.answers?.urgency);
      const urgencyChoice = urgencyLabel === "immediately life-threatening" ? "emergency"
        : urgencyLabel === "urgent" || urgencyLabel === "soon" ? "urgent"
        : urgencyLabel === "routine" ? "routine"
        : undefined;
      if (urgencyDecision.ok && urgencyChoice) {
        triage.urgency = urgencyChoice;
        triage.redFlag = urgencyChoice === "emergency";
        triage.confidence = urgencyDecision.answers?.urgency?.probabilities
          ? Math.max(...Object.values(urgencyDecision.answers.urgency.probabilities))
          : triage.confidence;
      }
      const departmentChoice = departmentDecision.answers?.department?.choice ?? layaLabel(departmentDecision.answers?.department);
      if (departmentDecision.ok && departmentChoice) triage.department = departmentChoice;
      const layaRuntime = urgencyDecision.ok || departmentDecision.ok;
      const clinicalTurn = intel.escalate || triage.redFlag || triage.urgency !== "routine"
        || /symptom|diagnos|manag|treat|fever|pain|patient|discharge|drug|lab/i.test(text);
      let d7Data: any = null;
      if (clinicalTurn) {
        const d7Started = Date.now();
        d7Data = await Astra7DClinicalEngine.synthesize7D(text, req.body?.patientContext, language);
        recordSpan({
          kind: "sevenD",
          name: "Astra 7D synthesis",
          latencyMs: Date.now() - d7Started,
          ok: Boolean(d7Data),
          detail: d7Data ? "D1-D7 structured state returned." : "7D returned nothing; no state was invented.",
          correlationId: trace.request_id,
        });
      } else {
        recordSpan({
          kind: "sevenD",
          name: "Astra 7D synthesis",
          latencyMs: 0,
          ok: true,
          detail: "Skipped: this turn did not need the 7D engine.",
          correlationId: trace.request_id,
        });
      }
      if (!responseText) {
        responseText = d7Data?.spokenConciseSummary
          || await Astra7DClinicalEngine.answerConversational(text, language, workspace);
      }
      let scientist: { skill?: string; ok?: boolean } | null = null;
      if (intel.scientificSkills.length > 0) {
        const scientistStarted = Date.now();
        try {
          const ran = await getScientificSkillsWorker().run({
            query: text,
            deidentifiedQuery: text.replace(/\b(?:UHID|MRN|bed)\s*[-:]?\s*\d+\b/gi, "[id]"),
            allowedSkills: intel.scientificSkills,
            privacyMode: true,
            provenanceRequired: true,
            requestId: turnId,
          });
          scientist = { skill: ran.skill, ok: ran.ok };
          recordSpan({
            kind: "tool",
            name: `scientist:${ran.skill}`,
            latencyMs: Date.now() - scientistStarted,
            ok: ran.ok === true,
            detail: "Scientific skills worker ran on a de-identified query.",
            correlationId: trace.request_id,
          });
        } catch {
          scientist = null;
          recordSpan({
            kind: "tool",
            name: "scientific skills worker",
            latencyMs: Date.now() - scientistStarted,
            ok: false,
            detail: "Worker was not reachable; nothing was substituted for it.",
            correlationId: trace.request_id,
          });
        }
      }

      const speechText = voiceTurn ? firstSpokenSentences(responseText) : responseText;
      const confirmNoul = confirmDecision.answers?.confirmation_needed?.noul ?? 0;
      const decision = {
        requestId: turnId,
        source: layaRuntime ? "laya" : "deterministic",
        intent: intentDecision.answers?.intent?.choice ?? null,
        department: triage.department,
        urgency: triage.urgency,
        confidence: Number(triage.confidence.toFixed(3)),
        scoreMeaning: "routing_confidence_not_clinical_probability",
        calibratedForClinicalUse: false,
        humanApprovalRequired: safetyDenied || authority.clinical || confirmNoul >= 0.75 || triage.redFlag,
        safetyDenied,
        route: intel.target,
      };
      const output = {
        turnId, text: responseText, speechText, language, workspace, risk,
        status: risk === "high_clinical" || triage.redFlag ? "escalated" : "completed",
        actions: [],
        d7: d7Data,
        decision,
        memory: {
          scope: recall.exactPatientScope ? "exact patient scope" : "non-patient scope",
          recalled: recall.records.length,
          blocked: recall.blocked,
          semanticUsed: false,
          structuredOutranksSemantic: true,
          gates,
          prompt: renderRecallForPrompt(recall),
        },
        flightRecorder: reconstructTrace(trace.request_id),
        laya: triage,
        intelligence: { tier: intel.tier, target: intel.target, skills: intel.scientificSkills },
        scientist,
        brain: turnBrain(text, user.role, {
          urgency: urgencyDecision,
          department: departmentDecision,
          intent: intentDecision,
          confirmation: confirmDecision,
        }, voiceTurn),
        provenance: [
          "Dr Mayin",
          `provider: ${result.provider}`,
          layaRuntime ? `laya-runtime: ${triage.urgency}/${triage.department}` : `laya-local: ${triage.urgency}/${triage.department}`,
          `route: ${intel.target}`,
          ...(scientist?.skill ? [`scientist: ${scientist.skill}`] : []),
          ...(d7Data ? ["7d: symptom-to-management"] : []),
          ...result.providerUsed,
        ],
        audit: { actorId: user.userId, workspace, at: new Date().toISOString() },
      };
      if (process.env.ASTRA_SAARATHI_MEMORY !== "false") {
        saarathiSessionMemory.append(memoryKey, { turnId, userText: text, assistantText: responseText, at: new Date().toISOString() });
      }
      db.logAudit({
        actorId: user.userId, actorName: user.name, actorRole: user.role,
        action: "MAYIN_TURN", category: risk === "normal" ? "operations" : "clinical", status: "SUCCESS",
        details: `workspace=${workspace}; source=${String(req.body?.source ?? "text")}; risk=${risk}; provider=${result.provider}`,
      });
      await astraEventBus.publish({
        correlationId: trace.request_id,
        source: "saarathi-turn",
        target: "astra-brain",
        eventType: "astra.turn.completed",
        actorId: user.userId,
        actorRole: user.role,
        privacyClass: patientId ? "PHI" : "INTERNAL",
        riskClass: triage.redFlag ? "R4" : risk === "high_clinical" ? "R3" : "R1",
        patientRef: patientId || undefined,
        payload: {
          turnId,
          intent,
          provider: result.provider,
          responseChars: responseText.length,
          voice: voiceTurn,
          spans: reconstructTrace(trace.request_id).steps.length,
          approvalRequired: decision.humanApprovalRequired,
        },
      });
      res.json(output);
    } catch (error) {
      recordError({
        name: "saarathi turn",
        message: error instanceof Error ? error.message.slice(0, 160) : "unknown failure",
        correlationId: trace.request_id,
      });
      // Graceful conversational recovery via 7D engine
      const fallback = await Astra7DClinicalEngine.answerConversational(text, language, workspace);
      res.json({
        turnId, text: fallback, speechText: fallback, language, workspace, risk,
        status: "completed", actions: [],
        provenance: ["Dr Mayin 7D conversational recovery"],
        audit: { actorId: user.userId, workspace, at: new Date().toISOString() },
        flightRecorder: reconstructTrace(trace.request_id),
        _diagnostics: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  });

  // ─── Sidecar routes (actions, gesture, context, memory) ─────────────────
  app.post("/api/saarathi/actions", authenticate, async (req: Request, res: Response) => {
    try {
      const user = actor(req);
      const result = await astraActionBroker.execute(
        { userId: user.userId, name: user.name, role: user.role },
        { tool: String(req.body?.tool ?? ""), args: req.body?.args, confirmed: req.body?.confirmed === true, source: String(req.body?.source ?? "text") }
      );
      res.json(result);
    } catch (error) { res.status(403).json({ error: "ACTION_DENIED", message: error instanceof Error ? error.message : String(error) }); }
  });

  app.post("/api/saarathi/gesture", authenticate, (req: Request, res: Response) => {
    if (!gesturesEnabled()) return void res.status(503).json({ error: "GESTURES_DISABLED", message: "Gesture mode is disabled by ASTRA_SAARATHI_GESTURES=false." });
    const state = sanitizeGesture(req.body);
    if (!state) return void res.status(400).json({ error: "INVALID_GESTURE" });
    res.json({ ok: true, state, action: mapGesture(state) });
  });

  app.get("/api/saarathi/context", authenticate, (req: Request, res: Response) => {
    const user = actor(req);
    const workspace = workspaceOf(req.query.workspace);
    res.json({ identity: { userId: user.userId, name: user.name, role: user.role }, workspace, profile: profileForWorkspace(workspace) });
  });

  app.get("/api/saarathi/memory", authenticate, (req: Request, res: Response) => {
    const user = actor(req);
    const workspace = workspaceOf(req.query.workspace);
    res.json({ workspace, entries: saarathiSessionMemory.read(`${user.userId}:${workspace}`) });
  });
}
