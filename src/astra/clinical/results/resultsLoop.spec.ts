/**
 * R5-06 acceptance checks for the closed-loop results core:
 * locked report versions + revisions with a reason, doctor notification with
 * unread flag and trend arrows, deterministic critical values (Level-3 alert,
 * acknowledge-only closure with doctor id + time logged), escalation after a
 * configured timeout, PDF-only manual review, and voice line rules.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { CRITICAL_VALUE_RULES } from "./criticalValueRules";
import {
  _resetResultsForTest,
  _setCriticalAlertConfigForTest,
  acknowledgeCriticalAlert,
  criticalVoiceLine,
  escalationStateFor,
  evaluateCriticalValues,
  labVoiceLine,
  plateletUnitFactor,
  rulesForParam,
  latestReportFor,
  listCriticalAlerts,
  listReportVersions,
  listResultNotifications,
  listResultsLog,
  markResultNotificationRead,
  reviseReport,
  shouldSpeakAnnouncement,
  submitReport,
  trendAgainstPrevious,
  unreadResultCount,
} from "./resultsLoop";

const LAB_ACTOR = { uploadedBy: "lab-tech-1", uploadedByRole: "lab" };

function submitSuryaCbc(values: Array<{ param: string; value: string; unit?: string }>, at = "2026-09-29T10:00:00.000Z") {
  return submitReport({
    patientUhid: "UHID-SURYA",
    patientName: "Surya",
    orderId: "ORD-CBC-1",
    testName: "Complete Blood Picture (CBP)",
    department: "laboratory",
    values,
    orderingDoctor: "Dr. Murali Praveen",
    at,
    ...LAB_ACTOR,
  });
}

beforeEach(() => {
  _resetResultsForTest();
});

describe("R5-06 critical value rules (deterministic config)", () => {
  it("fires for the spec examples: Hb 6.5, K+ 6.2, platelets 15000, SBP 76", () => {
    const findings = evaluateCriticalValues([
      { param: "Hb", value: "6.5", unit: "g/dL" },
      { param: "Serum Potassium (K+)", value: "6.2", unit: "mmol/L" },
      { param: "Platelet Count", value: "15000", unit: "/uL" },
      { param: "SBP", value: "76", unit: "mmHg" },
    ]);
    expect(findings.map((f) => f.ruleId).sort()).toEqual(["hb-low", "platelets-low", "potassium-high", "sbp-low"]);
  });

  it("does NOT fire for normal values: K+ 5.0, Hb 10", () => {
    const findings = evaluateCriticalValues([
      { param: "Hb", value: "10", unit: "g/dL" },
      { param: "Potassium", value: "5.0", unit: "mmol/L" },
    ]);
    expect(findings).toEqual([]);
  });

  it("leaves random blood sugar as an inert doctor-set placeholder (example 420 does not fire)", () => {
    const rbs = CRITICAL_VALUE_RULES.find((rule) => rule.id === "rbs-high");
    expect(rbs?.threshold).toBeNull();
    expect(rbs?.confirmNote).toBe("confirm with doctor/lab");
    expect(evaluateCriticalValues([{ param: "RBS", value: "420", unit: "mg/dL" }])).toEqual([]);
  });

  it("marks every rule 'confirm with doctor/lab'", () => {
    for (const rule of CRITICAL_VALUE_RULES) expect(rule.confirmNote).toBe("confirm with doctor/lab");
  });

  it("ignores non-numeric entries instead of guessing", () => {
    expect(evaluateCriticalValues([{ param: "Hb", value: "POSITIVE" }])).toEqual([]);
  });
});

describe("R5-06 report upload -> notify ordering doctor, version locked", () => {
  it("locks version 1 and creates an unread doctor notification with trend arrows", () => {
    const outcome = submitSuryaCbc([{ param: "Hb", value: "10", unit: "g/dL" }]);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.report.locked).toBe(true);
    expect(outcome.version).toBe(1);
    expect(outcome.notification.title).toBe("New investigation results received");
    expect(outcome.notification.read).toBe(false);
    expect(outcome.notification.detail).toContain("Dr. Murali Praveen");
    expect(outcome.notification.trends).toEqual([{ param: "Hb", direction: "new", current: 10 }]);
    expect(unreadResultCount("UHID-SURYA")).toBe(1);
    expect(listResultsLog("UHID-SURYA").map((entry) => entry.action)).toContain("REPORT_VERSION_LOCKED");
  });

  it("refuses to edit a locked report and creates version 2 only with a reason", () => {
    const first = submitSuryaCbc([{ param: "Hb", value: "10", unit: "g/dL" }]);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const blocked = submitSuryaCbc([{ param: "Hb", value: "9", unit: "g/dL" }]);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toContain("REPORT_LOCKED");

    const noReason = reviseReport(first.reportId, {
      patientUhid: "UHID-SURYA",
      testName: "Complete Blood Picture (CBP)",
      department: "laboratory",
      values: [{ param: "Hb", value: "8", unit: "g/dL" }],
      reason: "  ",
      ...LAB_ACTOR,
    });
    expect(noReason.ok).toBe(false);

    const revised = reviseReport(first.reportId, {
      patientUhid: "UHID-SURYA",
      testName: "Complete Blood Picture (CBP)",
      department: "laboratory",
      values: [{ param: "Hb", value: "8", unit: "g/dL" }],
      reason: "Analyzer re-run after QC flag",
      ...LAB_ACTOR,
    });
    expect(revised.ok).toBe(true);
    if (!revised.ok) return;
    expect(revised.version).toBe(2);
    expect(revised.report.locked).toBe(true);
    expect(revised.report.revisionReason).toBe("Analyzer re-run after QC flag");

    const versions = listReportVersions("UHID-SURYA", "ORD-CBC-1");
    expect(versions).toHaveLength(2);
    expect(versions[0].locked).toBe(true);
    expect(versions[0].values[0].value).toBe("10"); // untouched original
    // Trend arrow vs previous value: 10 -> 8 is down.
    expect(revised.trends).toEqual([{ param: "Hb", direction: "down", previous: 10, current: 8 }]);
  });

  it("computes up/down/same trend arrows against the previous version", () => {
    const previous = [{ param: "Hb", value: "9.0" }, { param: "WBC", value: "11000" }, { param: "Dengue NS1", value: "Negative" }];
    const current = [{ param: "Hb", value: "10.2" }, { param: "WBC", value: "11000" }, { param: "Dengue NS1", value: "Positive" }];
    expect(trendAgainstPrevious(current, previous)).toEqual([
      { param: "Hb", direction: "up", previous: 9, current: 10.2 },
      { param: "WBC", direction: "same", previous: 11000, current: 11000 },
      { param: "Dengue NS1", direction: "new" },
    ]);
  });

  it("marks the notification read (unread badge clears)", () => {
    const outcome = submitSuryaCbc([{ param: "Hb", value: "10" }]);
    if (!outcome.ok) throw new Error("submit failed");
    expect(unreadResultCount("UHID-SURYA")).toBe(1);
    markResultNotificationRead(outcome.notification.id);
    expect(unreadResultCount("UHID-SURYA")).toBe(0);
    expect(listResultNotifications("UHID-SURYA", true)).toEqual([]);
  });
});

describe("R5-06 Level-3 critical alert behaviour", () => {
  it("raises a Level-3 alert for K+ 6.2 that only Acknowledge can close, logging doctor + time", () => {
    const outcome = submitSuryaCbc([
      { param: "Hb", value: "10", unit: "g/dL" },
      { param: "Serum K+", value: "6.2", unit: "mmol/L" },
    ]);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const alert = outcome.alert;
    expect(alert).toBeDefined();
    expect(alert?.level).toBe(3);
    expect(alert?.levelLabel).toBe("Level 3");
    expect(alert?.findings[0].ruleId).toBe("potassium-high");
    expect(alert?.acknowledged).toBeUndefined();
    expect(listCriticalAlerts("open", "UHID-SURYA")).toHaveLength(1);

    // No doctor id -> refused.
    const anonymous = acknowledgeCriticalAlert(alert!.id, { doctorId: " ", doctorName: "" });
    expect(anonymous.ok).toBe(false);
    expect(listCriticalAlerts("open", "UHID-SURYA")).toHaveLength(1);

    const ack = acknowledgeCriticalAlert(alert!.id, { doctorId: "DOC-MURALI", doctorName: "Dr. Murali Praveen", at: "2026-09-29T10:04:00.000Z" });
    expect(ack.ok).toBe(true);
    if (!ack.ok) return;
    expect(ack.alert.acknowledged).toEqual({
      doctorId: "DOC-MURALI",
      doctorName: "Dr. Murali Praveen",
      at: "2026-09-29T10:04:00.000Z",
      atMs: Date.parse("2026-09-29T10:04:00.000Z"),
    });
    expect(listCriticalAlerts("open", "UHID-SURYA")).toHaveLength(0);

    const ackLog = listResultsLog("UHID-SURYA").find((entry) => entry.action === "CRITICAL_VALUE_ACKNOWLEDGED");
    expect(ackLog?.actorId).toBe("DOC-MURALI");
    expect(ackLog?.at).toBe("2026-09-29T10:04:00.000Z");
    expect(ackLog?.details).toContain("Dr. Murali Praveen");

    // Acknowledging twice is refused — the log keeps the first doctor + time.
    const twice = acknowledgeCriticalAlert(alert!.id, { doctorId: "DOC-2", doctorName: "Other" });
    expect(twice.ok).toBe(false);
    if (!twice.ok) expect(twice.error).toBe("ALREADY_ACKNOWLEDGED");
  });

  it("raises for Hb 6.5 and stays silent for Hb 10 / K+ 5.0", () => {
    const critical = submitSuryaCbc([{ param: "Hemoglobin", value: "6.5", unit: "g/dL" }]);
    expect(critical.ok && critical.alert?.findings[0].ruleId).toBe("hb-low");

    _resetResultsForTest();
    const normal = submitSuryaCbc([
      { param: "Hemoglobin", value: "10", unit: "g/dL" },
      { param: "Potassium", value: "5.0", unit: "mmol/L" },
    ]);
    expect(normal.ok).toBe(true);
    if (!normal.ok) return;
    expect(normal.alert).toBeUndefined();
    expect(normal.criticalCheck.findings).toEqual([]);
    expect(listCriticalAlerts("open")).toEqual([]);
  });

  it("escalates an unacknowledged alert after the configured timeout (short-timeout test)", () => {
    _setCriticalAlertConfigForTest({ escalationTimeoutMs: 50, escalationRepeatMs: 25 });
    const outcome = submitSuryaCbc([{ param: "Potassium", value: "6.2", unit: "mmol/L" }], "2026-09-29T10:00:00.000Z");
    if (!outcome.ok || !outcome.alert) throw new Error("expected a critical alert");
    const raisedAtMs = Date.parse("2026-09-29T10:00:00.000Z");

    // Before the timeout: not escalated.
    expect(escalationStateFor(outcome.alert, raisedAtMs + 10).escalated).toBe(false);
    // After the timeout: escalated, and repeats keep counting while unacknowledged.
    const once = escalationStateFor(outcome.alert, raisedAtMs + 60);
    expect(once.escalated).toBe(true);
    expect(once.escalationRepeats).toBe(1);
    const twice = escalationStateFor(outcome.alert, raisedAtMs + 90);
    expect(twice.escalationRepeats).toBe(2);

    // The alert list reflects escalation for the HUD/admin view.
    const open = listCriticalAlerts("open", "UHID-SURYA", raisedAtMs + 90);
    expect(open[0].escalated).toBe(true);

    // Acknowledgment stops escalation.
    acknowledgeCriticalAlert(outcome.alert.id, { doctorId: "DOC-MURALI", doctorName: "Dr. Murali" });
    expect(escalationStateFor({ raisedAtMs, acknowledged: { doctorId: "d", doctorName: "d", at: "", atMs: 0 } }, raisedAtMs + 500).escalated).toBe(false);
    expect(listCriticalAlerts("open", "UHID-SURYA", raisedAtMs + 500)).toEqual([]);
  });
});

describe("R5-06 PDF/image-only reports", () => {
  it("flags manual review instead of silently passing", () => {
    const outcome = submitReport({
      patientUhid: "UHID-SURYA",
      patientName: "Surya",
      testName: "X-Ray Chest PA",
      department: "radiology",
      pdfOnly: true,
      impression: "Right lower zone consolidation.",
      ...LAB_ACTOR,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.report.pdfOnly).toBe(true);
    expect(outcome.criticalCheck.possible).toBe(false);
    expect(outcome.criticalCheck.manualReviewRequired).toBe(true);
    expect(outcome.criticalCheck.note).toBe("critical check not possible - manual review");
    expect(outcome.alert).toBeUndefined();
    expect(listResultsLog("UHID-SURYA").map((entry) => entry.action)).toContain("MANUAL_REVIEW_REQUIRED");
    // The ordering doctor is still notified — no result is missed.
    expect(outcome.notification.title).toBe("New investigation results received");
  });
});

describe("R5-06 voice lines", () => {
  it("critical alert speech is ONE sentence and overrides night-time suppression", () => {
    const line = criticalVoiceLine({
      patientName: "Surya",
      patientUhid: "UHID-SURYA",
      findings: [{ ruleId: "potassium-high", analyte: "Potassium (K+)", value: 6.2, threshold: 6, unit: "mmol/L", condition: "greaterThan", message: "" }],
    });
    expect(line).toBe("Critical Potassium (K+) of 6.2 mmol/L for Surya — doctor, please acknowledge now.");
    expect(line.split(/[.!?] /).length).toBe(1);
    // 23h is inside the quiet window; critical still speaks, routine does not.
    expect(shouldSpeakAnnouncement({ critical: true, hour: 23 })).toBe(true);
    expect(shouldSpeakAnnouncement({ critical: false, hour: 23 })).toBe(false);
    expect(shouldSpeakAnnouncement({ critical: false, hour: 10 })).toBe(true);
  });

  it("reuses the lab voice lines", () => {
    expect(labVoiceLine("test_received", { testName: "CBC" })).toBe("CBC test received. Priority: urgent.");
    expect(labVoiceLine("report_uploaded")).toBe("Report uploaded. Sent to doctor.");
  });
});

describe("R5-06 re-analysis is doctor-requested only", () => {
  it("never changes diagnosis state on upload — the loop only stores results and alerts", () => {
    const outcome = submitSuryaCbc([{ param: "Hb", value: "6.5", unit: "g/dL" }]);
    expect(outcome.ok).toBe(true);
    const actions = listResultsLog("UHID-SURYA").map((entry) => entry.action);
    expect(actions).not.toContain("DIAGNOSIS_CHANGED");
    expect(actions.every((action) => ["REPORT_UPLOADED", "REPORT_VERSION_LOCKED", "CRITICAL_VALUE_RAISED"].includes(action))).toBe(true);
    // The latest report is available for the doctor's [Re-analyze] button.
    expect(latestReportFor("UHID-SURYA")?.testName).toBe("Complete Blood Picture (CBP)");
  });
});

describe("R5-06 critical value matching avoids false positives", () => {
  it("matches Hb only as a whole token, never HbA1c or hepatitis B markers", () => {
    expect(rulesForParam("Hb").map((r) => r.id)).toEqual(["hb-low"]);
    expect(rulesForParam("Hemoglobin (Hb)").map((r) => r.id)).toEqual(["hb-low"]);
    expect(rulesForParam("HbA1c")).toEqual([]);
    expect(rulesForParam("Glycated Haemoglobin")).toEqual([]);
    expect(rulesForParam("HBsAg")).toEqual([]);
    expect(evaluateCriticalValues([{ param: "HbA1c", value: "6.5", unit: "%" }])).toEqual([]);
  });

  it("does not treat platelet indices (MPV/PDW) as a platelet count", () => {
    expect(rulesForParam("Platelets").map((r) => r.id)).toEqual(["platelets-low"]);
    expect(rulesForParam("Platelet Count (Automated)").map((r) => r.id)).toEqual(["platelets-low"]);
    expect(rulesForParam("Mean Platelet Volume (MPV)")).toEqual([]);
    expect(evaluateCriticalValues([{ param: "Mean Platelet Volume", value: "9.1", unit: "fL" }])).toEqual([]);
  });

  it("scales platelet counts entered in lakh or x10^3 before comparing", () => {
    expect(plateletUnitFactor("lakhs/cumm")).toBe(100_000);
    expect(plateletUnitFactor("x10^3/uL")).toBe(1_000);
    expect(plateletUnitFactor("10^9/L")).toBe(1_000);
    expect(plateletUnitFactor("/uL")).toBe(1);
    expect(evaluateCriticalValues([{ param: "Platelet Count", value: "1.5", unit: "lakhs/cumm" }])).toEqual([]);
    expect(evaluateCriticalValues([{ param: "Platelet Count", value: "150", unit: "x10^3/uL" }])).toEqual([]);
    expect(evaluateCriticalValues([{ param: "Platelet Count", value: "15", unit: "x10^3/uL" }]).map((f) => f.ruleId)).toEqual(["platelets-low"]);
    expect(evaluateCriticalValues([{ param: "Platelet Count", value: "15,000", unit: "/uL" }]).map((f) => f.ruleId)).toEqual(["platelets-low"]);
  });

  it("still matches potassium written as K+", () => {
    expect(rulesForParam("K+").map((r) => r.id)).toEqual(["potassium-high"]);
    expect(rulesForParam("Serum Potassium (K+)").map((r) => r.id)).toEqual(["potassium-high"]);
  });
});
