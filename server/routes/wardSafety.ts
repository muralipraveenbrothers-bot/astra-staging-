/**
 * R5-07 ward nursing safety API. Thin session/audit layer over the pure
 * wardSafety engine (src/astra/clinical/ward) — same shape as the R5-06
 * results routes: canonical R5-05 events (WARD_ADMINISTRATION_SCHEDULED,
 * DOSE_ADMINISTERED, VITALS_UPDATED), the JSON hospital store audit log and
 * the existing SSE hub. No second bus, no new persistence layer.
 */
import type { Express, Request, Response } from "express";
import {
  acknowledgeWardSbar,
  administerDoseTask,
  buildWardUnitSummary,
  createWardSbarDraft,
  doseEscalationStateFor,
  escalatedWardTasks,
  holdDoseTask,
  listWardEscalations,
  listWardSafetyLog,
  listWardSbar,
  listWardUnitSummaries,
  pendingDoseCount,
  pollWardEscalations,
  recordWardVitalsReading,
  refuseDoseTask,
  scheduleDosesForPatient,
  setWardIcuMode,
  setWardVitalsInterval,
  shiftLabelFor,
  signWardSbar,
  startWardVitalsSchedule,
  updateWardSbarDraft,
  vitalsDueState,
  wardPatientState,
  wardPatientStates,
  type DoseTask,
  type SbarDraft,
  type WardMedicationOrder,
  type WardPatientProfile,
} from "../../src/astra/clinical/ward/wardSafety.js";
import { ORDER_EVENTS } from "../../src/astra/clinical/workflow/orderEvents.js";
import { listWorkflowEvents, recordOrderEvent } from "../../src/astra/clinical/workflow/workflowGuard.js";
import { listCriticalAlerts } from "../../src/astra/clinical/results/resultsLoop.js";
import { db } from "../db";
import { realtimeHub } from "../events";
import { authenticate, requireRole } from "../rbac";

interface SessionUser {
  userId: string;
  name: string;
  role: string;
}

const WARD_ROLES = ["ward", "doctor", "admin"] as const;
const DOCTOR_ROLES = ["doctor", "admin"] as const;

function sessionUser(req: Request): SessionUser {
  return (req as any).user as SessionUser;
}

function deviceOf(req: Request): string {
  return String(req.get("x-device-id") || req.get("user-agent") || "server").slice(0, 120);
}

function audit(user: SessionUser, action: string, details: string, patientUhid: string, status: "SUCCESS" | "DENIED" = "SUCCESS"): void {
  db.logAudit({
    actorId: user.userId,
    actorName: user.name,
    actorRole: user.role,
    action,
    category: "ward",
    status,
    details,
    patientId: patientUhid ? db.getPatientById(patientUhid)?.id : undefined,
  });
}

function broadcast(type: string, payload: Record<string, unknown>, targetRoles: string[]): void {
  realtimeHub.broadcast({ type, targetRoles, payload });
}

function patientProfile(uhid: string): WardPatientProfile | undefined {
  const patient = db.getPatientById(uhid);
  if (!patient) return undefined;
  return {
    patientUhid: patient.uhid,
    patientName: patient.name,
    bedNumber: patient.bedNumber,
    wardName: patient.ward,
    diagnosis: patient.diagnosis,
    allergies: patient.allergies,
    registeredAt: patient.registeredAt,
    admittedAt: patient.registeredAt,
  };
}

/** Confirmed medication orders = dispensed pharmacy orders for this patient. */
function confirmedMedicationOrders(uhid: string): WardMedicationOrder[] {
  return db
    .getOrders("pharmacy")
    .filter((order) => (order.uhid === uhid || order.patientId === uhid) && (order.status === "dispensed" || order.status === "completed"))
    .map((order) => ({
      id: order.id,
      drugName: order.item,
      dose: order.dosageOrSpec ?? "",
      route: order.dosageOrSpec ? "" : "",
      frequency: order.frequency ?? "",
      orderStartAt: order.orderedAt,
      stat: order.priority === "stat",
    }));
}

/** Today's canonical WARD_ADMINISTRATION_SCHEDULED event already recorded? */
function administrationScheduledToday(uhid: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return listWorkflowEvents(uhid).some(
    (event) => event.event === ORDER_EVENTS.WARD_ADMINISTRATION_SCHEDULED && event.at.startsWith(today),
  );
}

function recordWardEvent(eventName: string, patientUhid: string, orderId: string | undefined, user: SessionUser, req: Request): boolean {
  const recorded = recordOrderEvent({
    event: eventName,
    department: "ward",
    patientUhid,
    orderId,
    actorId: user.userId,
    actorRole: user.role,
    device: deviceOf(req),
  });
  return recorded.ok;
}

function boardPatientView(uhid: string, nowMs: number) {
  const state = wardPatientState(uhid);
  const profile = patientProfile(uhid);
  const due = vitalsDueState(uhid, nowMs);
  const escalations = listWardEscalations(uhid).filter((entry) => !entry.resolvedAtMs);
  const openAlerts = listCriticalAlerts("open", uhid, nowMs);
  const doses: Array<DoseTask & { escalation: { overdue: boolean; repeats: number; escalated: boolean } }> = (state?.doses ?? []).map((task) => {
    const esc = doseEscalationStateFor(task.id, nowMs) ?? { overdue: false, repeats: 0, escalated: false };
    return { ...task, escalation: { overdue: esc.overdue, repeats: esc.repeats, escalated: esc.escalated } };
  });
  return {
    uhid,
    name: profile?.patientName ?? state?.patientName,
    bedNumber: profile?.bedNumber,
    wardName: profile?.wardName,
    diagnosis: profile?.diagnosis,
    allergies: profile?.allergies ?? [],
    scheduled: Boolean(state),
    icuMode: state?.icuMode ?? false,
    vitalsIntervalMinutes: state?.vitalsIntervalMinutes ?? null,
    vitalsDueAtMs: due.dueAtMs ?? null,
    vitalsDueInMs: due.dueInMs ?? null,
    vitalsOverdue: due.overdue,
    lastClassification: state?.lastClassification ?? null,
    readings: [...(state?.readings ?? [])].slice(-12),
    doses,
    pendingDoseCount: pendingDoseCount(uhid),
    escalations,
    openAlerts,
  };
}

export function registerWardSafetyRoutes(app: Express): void {
  // 1. The ward board: patients, dose tasks, vitals timers, escalations, alerts.
  app.get("/api/ward/board", authenticate, requireRole([...WARD_ROLES]), (req: Request, res: Response) => {
    const nowMs = Date.now();
    pollWardEscalations(nowMs);
    const hour = new Date(nowMs).getHours();
    const nightMode = hour >= 22 || hour < 6;
    const inpatients = db.getPatients().filter((patient) => patient.admissionStatus === "inpatient" || patient.admissionStatus === "emergency");
    const scheduledUhidSet = new Set(wardPatientStates().map((state) => state.patientUhid));
    const uhidSet = new Set<string>([...inpatients.map((patient) => patient.uhid), ...scheduledUhidSet]);
    res.json({
      ok: true,
      nowMs,
      now: new Date(nowMs).toISOString(),
      shiftLabel: shiftLabelFor(hour),
      nightMode,
      patients: [...uhidSet].map((uhid) => boardPatientView(uhid, nowMs)),
      escalated: escalatedWardTasks(nowMs),
      log: listWardSafetyLog().slice(-40).reverse(),
    });
  });

  // 2. Build today's dose schedule from confirmed orders + start the vitals timer.
  app.post("/api/ward/schedule", authenticate, requireRole([...WARD_ROLES]), (req: Request, res: Response) => {
    const user = sessionUser(req);
    const uhid = String(req.body?.patientUhid ?? "").trim();
    const patient = db.getPatientById(uhid);
    if (!patient) return void res.status(404).json({ ok: false, error: "PATIENT_NOT_FOUND" });
    if (patient.admissionStatus !== "inpatient" && patient.admissionStatus !== "emergency") {
      return void res.status(400).json({ ok: false, error: "PATIENT_NOT_ADMITTED: only admitted patients have a ward schedule." });
    }
    const nowMs = Date.now();
    const profile = patientProfile(uhid)!;
    startWardVitalsSchedule(profile, nowMs);
    const outcome = scheduleDosesForPatient(profile, confirmedMedicationOrders(uhid), nowMs);
    if (!outcome.ok) return void res.status(400).json(outcome);
    if (outcome.created.length > 0 && !administrationScheduledToday(uhid)) {
      recordWardEvent(ORDER_EVENTS.WARD_ADMINISTRATION_SCHEDULED, uhid, undefined, user, req);
    }
    audit(user, "WARD_SCHEDULE_BUILT", `${outcome.created.length} dose task(s) scheduled for ${uhid}${outcome.skipped ? ` (${outcome.skipped} skipped)` : ""}.`, uhid);
    broadcast("WARD_BOARD_UPDATED", { patientUhid: uhid, kind: "schedule-built", created: outcome.created.length }, [...WARD_ROLES]);
    res.json({ ok: true, created: outcome.created, skipped: outcome.skipped, patient: boardPatientView(uhid, nowMs) });
  });

  // 3. Dose execution: GIVE / HOLD (reason) / REFUSE (reason). Never changes the dose.
  app.post("/api/ward/doses/:taskId", authenticate, requireRole([...WARD_ROLES]), (req: Request<{ taskId: string }>, res: Response) => {
    const user = sessionUser(req);
    const action = String(req.body?.action ?? "");
    const reason = req.body?.reason ? String(req.body.reason) : "";
    const nowMs = Date.now();
    const nurse = { name: user.name, role: user.role };
    const outcome =
      action === "given" ? administerDoseTask(req.params.taskId, nurse, nowMs)
      : action === "held" ? holdDoseTask(req.params.taskId, nurse, reason, nowMs)
      : action === "refused" ? refuseDoseTask(req.params.taskId, nurse, reason, nowMs)
      : { ok: false as const, error: "Action must be given, held or refused." };
    if (!outcome.ok) {
      audit(user, "WARD_DOSE_DENIED", `${action} denied: ${outcome.error}`, "", "DENIED");
      return void res.status(400).json({ ok: false, error: outcome.error });
    }
    const task = outcome.task;
    if (action === "given") recordWardEvent(ORDER_EVENTS.DOSE_ADMINISTERED, task.patientUhid, task.orderId, user, req);
    audit(user, `WARD_DOSE_${action.toUpperCase()}`, `${task.drugName} ${task.dose} ${task.route} ${action} by ${user.name}.${task.reason ? ` Reason: ${task.reason}` : ""}`, task.patientUhid);
    broadcast("WARD_TASK_LOGGED", { kind: `DOSE_${action.toUpperCase()}`, task, by: user.name, at: task.administeredAt }, [...WARD_ROLES, ...DOCTOR_ROLES]);
    res.json({ ok: true, task, log: outcome.log });
  });

  // 4. Vitals entry -> VITALS_UPDATED + trend classification + Level-3 when needed.
  app.post("/api/ward/vitals", authenticate, requireRole([...WARD_ROLES]), (req: Request, res: Response) => {
    const user = sessionUser(req);
    const uhid = String(req.body?.patientUhid ?? "").trim();
    const profile = patientProfile(uhid);
    if (!profile) return void res.status(404).json({ ok: false, error: "PATIENT_NOT_FOUND" });
    const numbers = ["hr", "bpSystolic", "bpDiastolic", "temp", "rr", "spo2"];
    for (const key of numbers) {
      if (typeof req.body?.[key] !== "number" || !Number.isFinite(req.body[key])) {
        return void res.status(400).json({ ok: false, error: `NUMERIC_REQUIRED: ${key}` });
      }
    }
    const outcome = recordWardVitalsReading(
      profile,
      {
        hr: req.body.hr,
        bpSystolic: req.body.bpSystolic,
        bpDiastolic: req.body.bpDiastolic,
        temp: req.body.temp,
        rr: req.body.rr,
        spo2: req.body.spo2,
      },
      user.name,
      user.role,
      Date.now(),
    );
    if (!outcome.ok) return void res.status(400).json(outcome);

    recordWardEvent(ORDER_EVENTS.VITALS_UPDATED, uhid, undefined, user, req);

    // Keep the JSON hospital store consistent with the ward record.
    const patient = db.getPatientById(uhid);
    if (patient) {
      db.updatePatient(patient.id, {
        vitals: [
          ...(patient.vitals ?? []),
          {
            spo2: outcome.reading.spo2,
            heartRate: outcome.reading.hr,
            bpSys: outcome.reading.bpSystolic,
            bpDia: outcome.reading.bpDiastolic,
            tempF: outcome.reading.temp,
            respRate: outcome.reading.rr,
            recordedAt: outcome.reading.at,
          },
        ],
      });
    }

    audit(
      user,
      "WARD_VITALS_RECORDED",
      `${outcome.classification.status} — ${outcome.classification.reason}. BP ${req.body.bpSystolic}/${req.body.bpDiastolic}, HR ${req.body.hr}, SpO2 ${req.body.spo2}.`,
      uhid,
    );
    broadcast("WARD_VITALS_UPDATED", { patientUhid: uhid, classification: outcome.classification, reading: outcome.reading }, [...WARD_ROLES, ...DOCTOR_ROLES]);
    if (outcome.alert) {
      broadcast("CRITICAL_ALERT", { alert: outcome.alert, level: 3, levelLabel: outcome.alert.levelLabel }, [...DOCTOR_ROLES]);
      audit(user, "CRITICAL_VALUE_RAISED", `Ward vitals Level-3 alert ${outcome.alert.id}: ${outcome.alert.findings.map((f) => f.message).join("; ")}`, uhid);
    }
    res.json({ ok: true, reading: outcome.reading, classification: outcome.classification, thresholdFindings: outcome.thresholdFindings, alert: outcome.alert });
  });

  // 5. Per-patient timers: ICU mode (15 min) or a 2-4 h interval.
  app.post("/api/ward/config", authenticate, requireRole([...WARD_ROLES]), (req: Request, res: Response) => {
    const user = sessionUser(req);
    const uhid = String(req.body?.patientUhid ?? "").trim();
    const state = wardPatientState(uhid);
    if (!state) return void res.status(404).json({ ok: false, error: "PATIENT_NOT_SCHEDULED: build the schedule first." });
    if (req.body?.icuMode !== undefined) {
      const outcome = setWardIcuMode(uhid, req.body.icuMode === true, { name: user.name, role: user.role });
      if (!outcome.ok) return void res.status(400).json(outcome);
      audit(user, "WARD_CONFIG", `ICU mode ${outcome.state.icuMode ? "ON" : "OFF"} — vitals every ${outcome.state.vitalsIntervalMinutes} min.`, uhid);
      return void res.json({ ok: true, patient: boardPatientView(uhid, Date.now()) });
    }
    if (req.body?.vitalsIntervalMinutes !== undefined) {
      const outcome = setWardVitalsInterval(uhid, Number(req.body.vitalsIntervalMinutes), { name: user.name, role: user.role });
      if (!outcome.ok) return void res.status(400).json(outcome);
      audit(user, "WARD_CONFIG", `Vitals interval set to ${outcome.state.vitalsIntervalMinutes} min.`, uhid);
      return void res.json({ ok: true, patient: boardPatientView(uhid, Date.now()) });
    }
    res.status(400).json({ ok: false, error: "Provide icuMode or vitalsIntervalMinutes." });
  });

  // 6. Missed-task escalations — charge nurse / doctor view.
  app.get("/api/ward/escalations", authenticate, requireRole([...WARD_ROLES, ...DOCTOR_ROLES]), (_req: Request, res: Response) => {
    const nowMs = Date.now();
    res.json({ ok: true, escalations: escalatedWardTasks(nowMs), all: listWardEscalations().filter((entry) => !entry.resolvedAtMs) });
  });

  // 7. SBAR handover: draft (rules), edit, outgoing sign, incoming acknowledge.
  app.get("/api/ward/sbar", authenticate, requireRole([...WARD_ROLES, ...DOCTOR_ROLES]), (req: Request, res: Response) => {
    const uhid = req.query.uhid ? String(req.query.uhid) : undefined;
    const nowMs = Date.now();
    res.json({
      ok: true,
      shiftLabel: shiftLabelFor(new Date(nowMs).getHours()),
      handovers: listWardSbar(uhid),
      summaries: listWardUnitSummaries().slice(-4).reverse(),
    });
  });

  app.post("/api/ward/sbar/draft", authenticate, requireRole([...WARD_ROLES]), (req: Request, res: Response) => {
    const user = sessionUser(req);
    const uhid = String(req.body?.patientUhid ?? "").trim();
    const state = wardPatientState(uhid);
    if (!state) return void res.status(404).json({ ok: false, error: "PATIENT_NOT_SCHEDULED: build the schedule first." });
    const openAlertMessages = listCriticalAlerts("open", uhid).map((alert) => alert.findings.map((f) => f.message).join("; "));
    const outcome = createWardSbarDraft(uhid, { shiftLabel: req.body?.shiftLabel ? String(req.body.shiftLabel) : undefined, openAlertMessages });
    if (!outcome.ok) return void res.status(400).json(outcome);
    audit(user, "WARD_SBAR_DRAFTED", `SBAR draft created for ${uhid} (${outcome.handover.shiftLabel} shift).`, uhid);
    res.json({ ok: true, handover: outcome.handover });
  });

  // 8. Unit summary (registered BEFORE /sbar/:id so "summary" is not captured as an SBAR id) — ordered critical safety, tasks & stock, staff motivation.
  app.post("/api/ward/sbar/summary", authenticate, requireRole([...WARD_ROLES]), (req: Request, res: Response) => {
    const user = sessionUser(req);
    const nowMs = Date.now();
    const shiftLabel = req.body?.shiftLabel ? String(req.body.shiftLabel) : shiftLabelFor(new Date(nowMs).getHours());
    const openAlerts = listCriticalAlerts("open");
    const criticalItems = openAlerts.map(
      (alert) => `${alert.patientName ?? alert.patientUhid}: ${alert.findings.map((f) => f.message).join("; ")}${alert.acknowledged ? "" : " (unacknowledged)"}.`,
    );
    const escalated = escalatedWardTasks(nowMs).map((entry) => `${entry.taskLabel} (${entry.patientName ?? entry.patientUhid}) escalated to charge nurse.`);
    const states = wardPatientStates();
    const pendingDoses = states.reduce((sum, state) => sum + pendingDoseCount(state.patientUhid), 0);
    const overdueVitals = states.filter((state) => vitalsDueState(state.patientUhid, nowMs).overdue).map((state) => state.patientName ?? state.patientUhid);
    const heldDoses = states.reduce((sum, state) => sum + state.doses.filter((task) => task.status === "HELD").length, 0);
    const taskItems = [
      pendingDoses ? `${pendingDoses} pending dose(s) across the ward.` : "",
      overdueVitals.length ? `Vitals overdue: ${overdueVitals.join(", ")}.` : "",
      heldDoses ? `${heldDoses} held dose(s) need doctor review.` : "",
    ].filter(Boolean);
    const lowStock = db
      .getPharmacyInventory()
      .filter((item) => item.stock <= item.reorderLevel)
      .slice(0, 3)
      .map((item) => `${item.name} (${item.stock} left)`);
    const summary = buildWardUnitSummary({
      shiftLabel,
      nowMs,
      criticalItems: [...criticalItems, ...escalated],
      taskItems,
      stockItems: lowStock,
    });
    audit(user, "WARD_UNIT_SUMMARY", `Unit summary created for the ${shiftLabel} shift.`, "");
    res.json({ ok: true, summary });
  });

  app.post("/api/ward/sbar/:id", authenticate, requireRole([...WARD_ROLES]), (req: Request<{ id: string }>, res: Response) => {
    const user = sessionUser(req);
    const draft: SbarDraft = {
      situation: String(req.body?.draft?.situation ?? ""),
      background: String(req.body?.draft?.background ?? ""),
      assessment: String(req.body?.draft?.assessment ?? ""),
      recommendation: String(req.body?.draft?.recommendation ?? ""),
    };
    const outcome = updateWardSbarDraft(req.params.id, draft, { name: user.name, role: user.role });
    if (!outcome.ok) return void res.status(400).json(outcome);
    audit(user, "WARD_SBAR_EDITED", `SBAR ${req.params.id} edited by ${user.name}.`, outcome.handover.patientUhid);
    res.json({ ok: true, handover: outcome.handover });
  });

  app.post("/api/ward/sbar/:id/sign", authenticate, requireRole([...WARD_ROLES]), (req: Request<{ id: string }>, res: Response) => {
    const user = sessionUser(req);
    const outcome = signWardSbar(req.params.id, { name: user.name, role: user.role });
    if (!outcome.ok) return void res.status(400).json(outcome);
    audit(user, "WARD_SBAR_SIGNED", `SBAR ${req.params.id} signed by outgoing nurse ${user.name} at ${outcome.handover.signedAt}.`, outcome.handover.patientUhid);
    res.json({ ok: true, handover: outcome.handover });
  });

  app.post("/api/ward/sbar/:id/acknowledge", authenticate, requireRole([...WARD_ROLES]), (req: Request<{ id: string }>, res: Response) => {
    const user = sessionUser(req);
    const outcome = acknowledgeWardSbar(req.params.id, { name: user.name, role: user.role });
    if (!outcome.ok) return void res.status(400).json(outcome);
    audit(user, "WARD_SBAR_ACKNOWLEDGED", `SBAR ${req.params.id} acknowledged by incoming nurse ${user.name} at ${outcome.handover.acknowledgedAt}.`, outcome.handover.patientUhid);
    res.json({ ok: true, handover: outcome.handover });
  });

  // 9. Ward safety log (audit trail for the shift).
  app.get("/api/ward/log", authenticate, requireRole([...WARD_ROLES, ...DOCTOR_ROLES]), (req: Request, res: Response) => {
    const uhid = req.query.uhid ? String(req.query.uhid) : undefined;
    res.json({ ok: true, log: listWardSafetyLog(uhid).slice(-60).reverse() });
  });
}
