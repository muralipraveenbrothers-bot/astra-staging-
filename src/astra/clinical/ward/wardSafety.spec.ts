/**
 * R5-07 ward nursing safety — engine-level acceptance checks.
 * All time is passed explicitly (fake clock), so nothing depends on Date.now().
 */
import { beforeEach, describe, expect, it } from "vitest";
import { CRITICAL_ALERT_CONFIG } from "../results/criticalValueRules";
import {
  _resetResultsForTest,
  acknowledgeCriticalAlert,
  listCriticalAlerts,
  shouldSpeakAnnouncement,
} from "../results/resultsLoop";
import {
  _resetWardSafetyForTest,
  administerDoseTask,
  acknowledgeWardSbar,
  buildWardUnitSummary,
  classifyVitalsTrend,
  createWardSbarDraft,
  doseTimesForCount,
  escalatedWardTasks,
  holdDoseTask,
  NOT_DUE_ADMITTED_LATER_LABEL,
  listWardSafetyLog,
  marComplianceForDay,
  pendingDoseCount,
  pollWardEscalations,
  recordWardVitalsReading,
  refuseDoseTask,
  routineReminderAudible,
  scheduleDosesForPatient,
  setWardIcuMode,
  setWardVitalsInterval,
  shiftLabelFor,
  signWardSbar,
  startWardVitalsSchedule,
  updateWardSbarDraft,
  vitalsDueState,
  wardPatientState,
} from "./wardSafety";

const NURSE = { name: "Anjali Verma", role: "ward" };
const SURYA = { patientUhid: "UHID-SURYA", patientName: "Surya", bedNumber: "W-12", wardName: "General Ward" };
const FLUCLOX = { id: "ORD-FLX-1", drugName: "Inj. Flucloxacillin", dose: "1 g", route: "IV", frequency: "QID" };

function atDate(hours: number, minutes = 0): number {
  return new Date(2026, 8, 29, hours, minutes, 0, 0).getTime();
}

beforeEach(() => {
  _resetWardSafetyForTest();
  _resetResultsForTest();
});

describe("R5-07 dose schedule from confirmed orders", () => {
  it("QID order -> 4 timed dose tasks per day, and the ward cannot change the dose", () => {
    const outcome = scheduleDosesForPatient(SURYA, [FLUCLOX], atDate(7));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.created).toHaveLength(4);
    const times = outcome.created.map((task) => new Date(task.scheduledAtMs).getHours());
    expect(new Set(times)).toEqual(new Set([12, 18, 0, 6]));
    expect(outcome.created.every((task) => task.drugName === "Inj. Flucloxacillin" && task.dose === "1 g" && task.route === "IV")).toBe(true);
    expect(pendingDoseCount(SURYA.patientUhid)).toBe(4);
  });

  it("logging one dose emits DOSE_ADMINISTERED with nurse and time", () => {
    const outcome = scheduleDosesForPatient(SURYA, [FLUCLOX], atDate(7));
    if (!outcome.ok) throw new Error("schedule failed");
    const given = administerDoseTask(outcome.created[0].id, NURSE, atDate(12, 5));
    expect(given.ok).toBe(true);
    if (!given.ok) return;
    expect(given.task.status).toBe("GIVEN");
    expect(given.task.administeredBy).toBe("Anjali Verma");
    expect(given.log.kind).toBe("DOSE_ADMINISTERED");
    expect(given.log.details).toContain("Anjali Verma");
    expect(given.log.atMs).toBe(atDate(12, 5));
    const logged = listWardSafetyLog(SURYA.patientUhid).find((entry) => entry.kind === "DOSE_ADMINISTERED");
    expect(logged).toBeDefined();
    expect(pendingDoseCount(SURYA.patientUhid)).toBe(3);
  });

  it("hold and refuse both require a reason", () => {
    const outcome = scheduleDosesForPatient(SURYA, [FLUCLOX], atDate(7));
    if (!outcome.ok) throw new Error("schedule failed");
    const task = outcome.created[0];
    const noReason = holdDoseTask(task.id, NURSE, "  ", atDate(12, 5));
    expect(noReason.ok).toBe(false);
    const held = holdDoseTask(task.id, NURSE, "Patient vomiting — inform doctor.", atDate(12, 5));
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    expect(held.task.status).toBe("HELD");
    expect(held.task.reason).toContain("vomiting");
    const second = outcome.created[1];
    const refused = refuseDoseTask(second.id, NURSE, "Patient refused oral medication.", atDate(12, 6));
    expect(refused.ok).toBe(true);
    expect(pendingDoseCount(SURYA.patientUhid)).toBe(2);
  });

  it("PRN orders get no fixed timed tasks", () => {
    const outcome = scheduleDosesForPatient(SURYA, [{ id: "ORD-PRN", drugName: "Tab. Paracetamol", dose: "650 mg", route: "PO", frequency: "PRN" }], atDate(7));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.created).toHaveLength(0);
    expect(outcome.skipped).toBe(1);
  });
});

describe("R5-07 missed-task escalation (fake clock)", () => {
  function scheduledTask(atMs: number) {
    const outcome = scheduleDosesForPatient(SURYA, [{ ...FLUCLOX, frequency: "OD" }], atDate(0, 0));
    if (!outcome.ok) throw new Error("schedule failed");
    return outcome.created[0]; // OD -> 08:00
  }

  it("15 min overdue -> Level 2; repeats every 15 min; escalates after the cap; giving stops the repeats", () => {
    const task = scheduledTask(atDate(0, 0));
    expect(new Date(task.scheduledAtMs).getHours()).toBe(8);

    // Not yet due: nothing.
    expect(pollWardEscalations(atDate(7, 50)).beeps).toHaveLength(0);

    // Passes due time -> Level 2 raised (double beep #1).
    const raised = pollWardEscalations(atDate(8, 10));
    expect(raised.beeps).toHaveLength(1);
    expect(raised.beeps[0].taskId).toBe(task.id);
    expect(raised.entries.some((entry) => entry.kind === "LEVEL2_RAISED")).toBe(true);

    // 15 min window -> repeat #2.
    const repeat1 = pollWardEscalations(atDate(8, 25));
    expect(repeat1.beeps).toHaveLength(1);
    expect(repeat1.beeps[0].repeats).toBe(2);
    expect(repeat1.entries.some((entry) => entry.kind === "LEVEL2_REPEAT")).toBe(true);

    // Repeats continue every 15 min.
    const repeat2 = pollWardEscalations(atDate(8, 40));
    expect(repeat2.beeps[0].repeats).toBe(3);

    // Configurable cap (4 repeats) -> escalate to charge nurse/doctor.
    const repeat3 = pollWardEscalations(atDate(8, 55));
    expect(repeat3.escalatedNow).toHaveLength(1);
    expect(repeat3.escalatedNow[0].escalatedToCharge).toBe(true);
    expect(repeat3.entries.some((entry) => entry.kind === "ESCALATED_TO_CHARGE")).toBe(true);
    expect(escalatedWardTasks(atDate(8, 56))).toHaveLength(1);

    // Marking it given stops the repeats and clears the escalation view.
    const given = administerDoseTask(task.id, NURSE, atDate(9, 0));
    expect(given.ok).toBe(true);
    expect(pollWardEscalations(atDate(9, 15)).beeps).toHaveLength(0);
    expect(escalatedWardTasks(atDate(9, 16))).toHaveLength(0);
    expect(listWardSafetyLog().some((entry) => entry.kind === "ESCALATION_RESOLVED")).toBe(true);
  });

  it("holding with a reason also stops the repeats", () => {
    const task = scheduledTask(atDate(0, 0));
    pollWardEscalations(atDate(8, 10));
    const held = holdDoseTask(task.id, NURSE, "Blood pressure too low — doctor informed.", atDate(8, 12));
    expect(held.ok).toBe(true);
    expect(pollWardEscalations(atDate(8, 40)).beeps).toHaveLength(0);
  });
});

describe("R5-07 vitals timers", () => {
  it("default 2 h; configurable 2-4 h; ICU mode 15 min", () => {
    const state = startWardVitalsSchedule(SURYA, atDate(10, 0));
    expect(vitalsDueState(SURYA.patientUhid, atDate(10, 0)).dueAtMs).toBe(atDate(12, 0));

    const changed = setWardVitalsInterval(SURYA.patientUhid, 180, NURSE, atDate(10, 0));
    expect(changed.ok).toBe(true);
    expect(vitalsDueState(SURYA.patientUhid, atDate(10, 0)).dueAtMs).toBe(atDate(13, 0));

    expect(setWardVitalsInterval(SURYA.patientUhid, 60, NURSE, atDate(10, 0)).ok).toBe(false);
    expect(setWardVitalsInterval(SURYA.patientUhid, 300, NURSE, atDate(10, 0)).ok).toBe(false);

    const icu = setWardIcuMode(SURYA.patientUhid, true, NURSE, atDate(10, 0));
    expect(icu.ok).toBe(true);
    expect(vitalsDueState(SURYA.patientUhid, atDate(10, 0)).dueAtMs).toBe(atDate(10, 15));
    expect(setWardVitalsInterval(SURYA.patientUhid, 240, NURSE, atDate(10, 0)).ok).toBe(false);
    void state;
  });

  it("recording vitals pushes the next due time one interval ahead", () => {
    startWardVitalsSchedule(SURYA, atDate(10, 0));
    const outcome = recordWardVitalsReading(SURYA, { hr: 84, bpSystolic: 124, bpDiastolic: 80, temp: 98.6, rr: 18, spo2: 98 }, "Anjali Verma", "ward", atDate(10, 0));
    expect(outcome.ok).toBe(true);
    expect(vitalsDueState(SURYA.patientUhid, atDate(10, 0)).dueAtMs).toBe(atDate(12, 0));
  });
});

describe("R5-07 status classification (rules, not LLM)", () => {
  function reading(hr: number, sbp: number) {
    return recordWardVitalsReading(SURYA, { hr, bpSystolic: sbp, bpDiastolic: sbp - 40, temp: 98.6, rr: 18, spo2: 96 }, "Anjali Verma", "ward");
  }

  it("HR 90 -> 105 -> 118 with SBP falling to 88 shows Deteriorating and raises a Level-3 alert that needs acknowledgment", () => {
    const first = reading(90, 120);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.classification.status).toBe("Stable"); // first reading, no trend

    const second = reading(105, 110);
    if (!second.ok) return;
    expect(second.classification.status).toBe("Stable");

    const third = reading(118, 88);
    if (!third.ok) return;
    expect(third.classification.status).toBe("Deteriorating");
    expect(third.classification.reason).toContain("pulse");
    expect(third.classification.reason).toContain("88");
    expect(third.thresholdFindings.map((f) => f.ruleId)).toEqual(expect.arrayContaining(["sbp-low", "hr-high"]));
    expect(third.alert).toBeDefined();

    const open = listCriticalAlerts("open", SURYA.patientUhid);
    expect(open).toHaveLength(1);
    expect(open[0].source).toBe("vitals");
    expect(open[0].acknowledged).toBeUndefined();

    // A new reading while the alert is open must not duplicate it.
    const fourth = reading(120, 86);
    if (!fourth.ok) return;
    expect(listCriticalAlerts("open", SURYA.patientUhid)).toHaveLength(1);

    // Only a doctor Acknowledge closes it.
    const ack = acknowledgeCriticalAlert(open[0].id, { doctorId: "dr-murali", doctorName: "Dr. Murali Praveen", role: "doctor" });
    expect(ack.ok).toBe(true);
    expect(listCriticalAlerts("open", SURYA.patientUhid)).toHaveLength(0);
    expect(listCriticalAlerts("acknowledged", SURYA.patientUhid)[0].acknowledged?.doctorId).toBe("dr-murali");
  });

  it("improving readings classify as Improving with the reason", () => {
    reading(118, 88);
    const better = recordWardVitalsReading(SURYA, { hr: 104, bpSystolic: 112, bpDiastolic: 72, temp: 98.2, rr: 16, spo2: 97 }, "Anjali Verma", "ward");
    expect(better.ok).toBe(true);
    if (!better.ok) return;
    expect(better.classification.status).toBe("Improving");
    expect(better.classification.reason).toContain("pulse");
  });

  it("classifyVitalsTrend is deterministic on the pure inputs", () => {
    expect(classifyVitalsTrend({ hr: 105, bpSystolic: 110, bpDiastolic: 70, temp: 98.6, rr: 18, spo2: 96 }, { hr: 90, bpSystolic: 120, bpDiastolic: 80, temp: 98.6, rr: 18, spo2: 97 }).status).toBe("Stable");
    expect(classifyVitalsTrend({ hr: 118, bpSystolic: 88, bpDiastolic: 55, temp: 98.6, rr: 18, spo2: 95 }, { hr: 105, bpSystolic: 110, bpDiastolic: 70, temp: 98.6, rr: 18, spo2: 96 }).status).toBe("Deteriorating");
  });
});

describe("R5-07 night shift voice control", () => {
  it("routine reminders are silent at 23:00 but still logged; Level-3 at 23:00 still sounds", () => {
    expect(routineReminderAudible(atDate(23, 0))).toBe(false);
    expect(routineReminderAudible(atDate(10, 0))).toBe(true);
    expect(shouldSpeakAnnouncement({ critical: true, hour: 23 }, CRITICAL_ALERT_CONFIG)).toBe(true);
    expect(shouldSpeakAnnouncement({ critical: false, hour: 23 }, CRITICAL_ALERT_CONFIG)).toBe(false);
  });

  it("a missed dose at 23:00 raises Level 2 but the log marks it silent (night mode)", () => {
    // OD task due 08:00 is long overdue at 23:00 — first detection happens then.
    const outcome = scheduleDosesForPatient(SURYA, [{ ...FLUCLOX, frequency: "OD" }], atDate(0, 0));
    if (!outcome.ok) throw new Error("schedule failed");
    const poll = pollWardEscalations(atDate(23, 0));
    expect(poll.beeps).toHaveLength(1);
    const raisedEntry = poll.entries.find((entry) => entry.kind === "LEVEL2_RAISED");
    expect(raisedEntry?.audible).toBe(false);
    expect(listWardSafetyLog().some((entry) => entry.kind === "LEVEL2_RAISED" && entry.audible === false)).toBe(true);
  });
});

describe("R5-07 SBAR handover", () => {
  function preparePatient(nowMs: number) {
    startWardVitalsSchedule(SURYA, nowMs);
    const vitals = recordWardVitalsReading(SURYA, { hr: 84, bpSystolic: 124, bpDiastolic: 80, temp: 98.6, rr: 18, spo2: 98 }, "Anjali Verma", "ward", nowMs);
    const doses = scheduleDosesForPatient(SURYA, [{ ...FLUCLOX, frequency: "TDS" }], nowMs);
    return { vitals, doses };
  }

  it("draft is created at shift change, editable, signed by outgoing and acknowledged by incoming", () => {
    const nowMs = atDate(7, 0); // Morning shift starts
    preparePatient(nowMs);
    const draft = createWardSbarDraft(SURYA.patientUhid, { nowMs });
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    const handover = draft.handover;
    expect(handover.shiftLabel).toBe("Morning");
    expect(handover.draft.situation).toContain("Surya");
    expect(handover.draft.background).toContain("General Ward");
    expect(handover.draft.assessment).toContain("Stable");
    expect(handover.draft.recommendation).toContain("never changes orders");

    const edited = updateWardSbarDraft(handover.id, { ...handover.draft, situation: "EDITED situation line." }, NURSE, atDate(7, 10));
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    expect(edited.handover.edits).toHaveLength(1);

    const signed = signWardSbar(handover.id, NURSE, atDate(7, 15));
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;
    expect(signed.handover.signedBy).toBe("Anjali Verma");
    expect(signWardSbar(handover.id, NURSE, atDate(7, 16)).ok).toBe(false);
    expect(updateWardSbarDraft(handover.id, { ...handover.draft }, NURSE, atDate(7, 17)).ok).toBe(false);

    const acked = acknowledgeWardSbar(handover.id, { name: "Divya Menon", role: "ward" }, atDate(7, 20));
    expect(acked.ok).toBe(true);
    if (!acked.ok) return;
    expect(acked.handover.acknowledgedBy).toBe("Divya Menon");
  });

  it("acknowledgment requires an outgoing signature first", () => {
    preparePatient(atDate(7, 0));
    const draft = createWardSbarDraft(SURYA.patientUhid, { nowMs: atDate(7, 0) });
    if (!draft.ok) throw new Error("draft failed");
    const ack = acknowledgeWardSbar(draft.handover.id, NURSE, atDate(7, 5));
    expect(ack.ok).toBe(false);
  });

  it("unit summary is ordered: critical safety, tasks & stock, staff motivation — 60-second read", () => {
    const summary = buildWardUnitSummary({
      shiftLabel: "Night",
      nowMs: atDate(23, 0),
      criticalItems: ["Surya: Systolic BP 88 mmHg — unacknowledged."],
      taskItems: ["2 pending doses."],
      stockItems: ["Inj. Paracetamol 100ml IV low (12 left)."],
    });
    expect(summary.sections.map((section) => section.order)).toEqual([1, 2, 3]);
    expect(summary.sections[0].title).toContain("Critical safety");
    expect(summary.sections[1].title).toContain("Tasks");
    expect(summary.sections[2].title).toContain("motivation");
    expect(summary.sections[0].text).toContain("Surya");
    expect(summary.sections[1].text).toContain("2 pending doses");
    expect(summary.sections[1].text).toContain("12 left");
    expect(summary.readSeconds).toBe(60);
  });

  it("shift labels follow the ward rotation (Night 22-06, Morning 06-14, Evening 14-22)", () => {
    expect(shiftLabelFor(23)).toBe("Night");
    expect(shiftLabelFor(5)).toBe("Night");
    expect(shiftLabelFor(7)).toBe("Morning");
    expect(shiftLabelFor(13)).toBe("Morning");
    expect(shiftLabelFor(15)).toBe("Evening");
    expect(shiftLabelFor(21)).toBe("Evening");
  });
});

describe("R5-07 dose times", () => {
  it("doseTimesForCount follows the configured daily patterns", () => {
    expect(doseTimesForCount(1)).toEqual(["08:00"]);
    expect(doseTimesForCount(2)).toEqual(["08:00", "20:00"]);
    expect(doseTimesForCount(3)).toEqual(["08:00", "14:00", "20:00"]);
    expect(doseTimesForCount(4)).toEqual(["06:00", "12:00", "18:00", "00:00"]);
    expect(doseTimesForCount(6)).toHaveLength(6);
  });
});

describe("R5-07 review fixes", () => {
  it("rebuilding the schedule never duplicates tasks (including between 00:00 and 05:30 local)", () => {
    const first = scheduleDosesForPatient(SURYA, [FLUCLOX], atDate(3));
    const second = scheduleDosesForPatient(SURYA, [FLUCLOX], atDate(3, 30));
    const third = scheduleDosesForPatient(SURYA, [FLUCLOX], atDate(9));
    expect(first.ok && first.created).toHaveLength(4);
    expect(second.ok && second.created).toHaveLength(0);
    expect(third.ok && third.created).toHaveLength(0);
    expect(pendingDoseCount(SURYA.patientUhid)).toBe(4);
  });

  it("a dose already recorded as given cannot be re-labelled held or refused", () => {
    const outcome = scheduleDosesForPatient(SURYA, [FLUCLOX], atDate(7));
    if (!outcome.ok) throw new Error("schedule failed");
    const taskId = outcome.created[0].id;
    expect(administerDoseTask(taskId, NURSE, atDate(12, 5)).ok).toBe(true);
    const held = holdDoseTask(taskId, NURSE, "BP low", atDate(12, 10));
    const refused = refuseDoseTask(taskId, NURSE, "Patient refused", atDate(12, 10));
    expect(held.ok).toBe(false);
    expect(refused.ok).toBe(false);
  });
});

describe("R6-01 admission-time dose scheduling", () => {
  const ADMITTED_LATE = {
    ...SURYA,
    patientUhid: "UHID-SYNTH-LATE",
    admittedAt: new Date(2026, 8, 29, 14, 30, 0, 0).toISOString(),
  };

  it("marks first-day slots before admission as not due, and excludes them from overdue and pending counts", () => {
    const outcome = scheduleDosesForPatient(ADMITTED_LATE, [{ ...FLUCLOX, frequency: "TDS" }], atDate(14, 30));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.created.map((task) => task.status)).toEqual(["not_due_admitted_later", "not_due_admitted_later", "SCHEDULED"]);
    expect(outcome.created.slice(0, 2).every((task) => task.statusLabel === NOT_DUE_ADMITTED_LATER_LABEL)).toBe(true);
    expect(pendingDoseCount(ADMITTED_LATE.patientUhid)).toBe(1);
    expect(marComplianceForDay(ADMITTED_LATE.patientUhid, atDate(21, 0))).toEqual({ given: 0, due: 1 });
    expect(pollWardEscalations(atDate(21, 0)).beeps.map((event) => event.taskId)).toEqual([outcome.created[2].id]);
  });

  it("order start time later than admission controls the first-day effective start", () => {
    const profile = { ...SURYA, patientUhid: "UHID-SYNTH-ORDER-START", admittedAt: new Date(2026, 8, 29, 10, 0).toISOString() };
    const outcome = scheduleDosesForPatient(profile, [{ ...FLUCLOX, frequency: "TDS", orderStartAt: new Date(2026, 8, 29, 16, 0).toISOString() }], atDate(16, 0));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.created.map((task) => task.status)).toEqual(["not_due_admitted_later", "not_due_admitted_later", "SCHEDULED"]);
  });

  it("stat doses are never marked not-due by the admission-time rule", () => {
    const outcome = scheduleDosesForPatient(ADMITTED_LATE, [{ ...FLUCLOX, frequency: "STAT", stat: true }], atDate(15, 0));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.created).toHaveLength(1);
    expect(outcome.created[0].status).toBe("SCHEDULED");
  });

  it("the not-due status is ordinary state and survives clone/read paths", () => {
    const outcome = scheduleDosesForPatient(ADMITTED_LATE, [{ ...FLUCLOX, frequency: "TDS" }], atDate(14, 30));
    expect(outcome.ok).toBe(true);
    const statuses = wardPatientState(ADMITTED_LATE.patientUhid)?.doses.map((task) => task.status);
    expect(statuses).toEqual(["not_due_admitted_later", "not_due_admitted_later", "SCHEDULED"]);
  });
});

describe("R6-01 review: stat timing and day 2", () => {
  const LATE = { ...SURYA, patientUhid: "UHID-SYNTH-LATE-2", admittedAt: new Date(2026, 8, 29, 14, 30, 0, 0).toISOString() };

  it("a stat dose ordered at 15:00 is due at 15:00 (not overdue from 08:00) and is not re-created on rebuild", () => {
    const orderedAt = new Date(2026, 8, 29, 15, 0).toISOString();
    const stat = { ...FLUCLOX, id: "ORD-SYNTH-STAT", frequency: "STAT", stat: true, orderStartAt: orderedAt };
    const outcome = scheduleDosesForPatient(LATE, [stat], atDate(15, 0));
    if (!outcome.ok) throw new Error("schedule failed");
    expect(outcome.created).toHaveLength(1);
    expect(outcome.created[0].scheduledAtMs).toBe(Date.parse(orderedAt));
    expect(outcome.created[0].status).toBe("SCHEDULED");
    expect(pollWardEscalations(atDate(15, 0)).beeps).toHaveLength(0);
    const rebuilt = scheduleDosesForPatient(LATE, [stat], atDate(18, 0));
    expect(rebuilt.ok && rebuilt.created).toHaveLength(0);
  });

  it("next day, the 08:00 dose is due and goes overdue normally", () => {
    scheduleDosesForPatient(LATE, [{ ...FLUCLOX, frequency: "TDS" }], atDate(14, 30));
    const nextDay = new Date(2026, 8, 30, 7, 0).getTime();
    const day2 = scheduleDosesForPatient(LATE, [{ ...FLUCLOX, frequency: "TDS" }], nextDay);
    if (!day2.ok) throw new Error("schedule failed");
    expect(day2.created.map((task) => task.status)).toEqual(["SCHEDULED", "SCHEDULED", "SCHEDULED"]);
    const eightAm = day2.created.find((task) => new Date(task.scheduledAtMs).getHours() === 8)!;
    const beeps = pollWardEscalations(new Date(2026, 8, 30, 8, 20).getTime()).beeps.map((event) => event.taskId);
    expect(beeps).toContain(eightAm.id);
  });
});
