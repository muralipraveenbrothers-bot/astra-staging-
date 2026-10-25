import type { Express, Request, Response } from "express";
import { db } from "../db";
import { authenticate, requireRole } from "../rbac";
import { clearClinicalMemoryForUser } from "../clinical/conversationMemory";
import { clearAvatarVoiceContext } from "../ws/avatarGateway";
import { sanjeevaniSecondBrainBridge } from "../../src/astra/sanjeevani/SanjeevaniSecondBrainBridge";
import { clearDecisionRequestCache } from "../reflex/decisionFabric";
import { PhiJanitor } from "../patient/phiJanitor";
import type { UserSession } from "../types";
function user(req: Request): UserSession { return (req as Request & { user: UserSession }).user; }
const janitor = new PhiJanitor({ clearConversationMemory: clearClinicalMemoryForUser, clearAvatarVoiceContext, clearSecondBrainContext: (id) => sanjeevaniSecondBrainBridge.clearPatientContext(id), clearRequestCaches: clearDecisionRequestCache }, (event) => { db.logAudit({ actorId: "phi-janitor", actorName: "PHI Janitor", actorRole: "system", action: event.action, category: "security", status: event.status, details: JSON.stringify(event.details) }); });
export function registerPatientContextRoutes(app: Express): void { app.post("/api/patient-context/switch", authenticate, requireRole(["doctor", "ward", "lab", "radiology", "admin"]), (req: Request, res: Response) => { const u = user(req); const patientId = typeof req.body?.patientId === "string" ? req.body.patientId.trim() : ""; const expected = typeof req.body?.expectedCurrentPatientId === "string" ? req.body.expectedCurrentPatientId.trim() : null; if (!patientId) return void res.status(400).json({ ok: false, error: "AMBIGUOUS_PATIENT_CONTEXT" }); if (!db.getPatientById(patientId)) return void res.status(404).json({ ok: false, error: "PATIENT_NOT_FOUND" }); const outcome = janitor.requestSwitch({ userId: u.userId, patientId, expectedCurrentPatientId: expected }); if (!outcome.ok) return void res.status(outcome.reason === "PHI_JANITOR_DISABLED" ? 403 : 409).json({ ok: false, error: outcome.reason }); res.json({ ok: true, changed: outcome.changed, contextVersion: outcome.contextVersion }); }); }
