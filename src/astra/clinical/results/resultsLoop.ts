/**
 * R5-06 closed-loop results core (pure, in-memory — mirrors the workflowGuard
 * convention). No result is missed:
 *  - uploading a report locks that version (revisions need a reason and create
 *    a new locked version),
 *  - the ordering doctor gets a "New investigation results received"
 *    notification with an unread flag and trend arrows vs the previous version,
 *  - deterministic critical values raise a Level-3 alert that can ONLY be
 *    closed by an explicit Acknowledge (doctor id + time are logged),
 *  - unacknowledged alerts escalate after a configurable timeout,
 *  - PDF/image-only reports cannot be checked numerically and are flagged for
 *    manual review instead of silently passing.
 * Re-analysis is never triggered from here — only by the doctor pressing the
 * button (R5-03 re-runs through the R5-01 gate).
 */
import {
  CRITICAL_ALERT_CONFIG,
  CRITICAL_VALUE_RULES,
  type CriticalAlertConfig,
  type CriticalValueRule,
} from "./criticalValueRules";

export type ResultDepartment = "laboratory" | "radiology";
export type TrendDirection = "up" | "down" | "same" | "new";

export interface StructuredResultValue {
  param: string;
  value: string;
  unit?: string;
}

export interface ReportVersion {
  id: string;
  reportId: string;
  version: number;
  patientUhid: string;
  patientName?: string;
  orderId?: string;
  testName: string;
  department: ResultDepartment;
  values: StructuredResultValue[];
  pdfOnly: boolean;
  impression?: string;
  /** Every version is locked the moment it is uploaded. */
  locked: true;
  lockedAt: string;
  revisionReason?: string;
  uploadedBy: string;
  uploadedByRole: string;
  uploadedAt: string;
}

export interface CriticalFinding {
  ruleId: string;
  analyte: string;
  value: number;
  threshold: number;
  unit: string;
  condition: "lessThan" | "greaterThan";
  message: string;
}

export interface CriticalCheckOutcome {
  possible: boolean;
  manualReviewRequired: boolean;
  findings: CriticalFinding[];
  note: string;
}

export interface CriticalAlertAck {
  doctorId: string;
  doctorName: string;
  at: string;
  atMs: number;
}

export type CriticalAlertSource = "laboratory" | "radiology" | "vitals";

export interface CriticalAlert {
  id: string;
  level: 3;
  levelLabel: string;
  patientUhid: string;
  patientName?: string;
  reportId: string;
  reportVersion: number;
  testName: string;
  /** Where the alert came from. Ward vitals (R5-07) reuse the same Level-3 loop. */
  source?: CriticalAlertSource;
  findings: CriticalFinding[];
  raisedAt: string;
  raisedAtMs: number;
  acknowledged?: CriticalAlertAck;
}

export interface CriticalAlertView extends CriticalAlert {
  escalated: boolean;
  escalationRepeats: number;
  escalationDueAtMs: number;
}

export interface ResultTrend {
  param: string;
  direction: TrendDirection;
  previous?: number;
  current?: number;
}

export interface ResultNotification {
  id: string;
  patientUhid: string;
  patientName?: string;
  title: string;
  detail: string;
  reportId: string;
  version: number;
  testName: string;
  trends: ResultTrend[];
  critical: boolean;
  alertId?: string;
  targetRole: "doctor";
  read: boolean;
  readAt?: string;
  createdAt: string;
  createdAtMs: number;
}

export interface ResultLogEntry {
  id: string;
  at: string;
  action:
    | "REPORT_UPLOADED"
    | "REPORT_VERSION_LOCKED"
    | "REPORT_REVISED"
    | "CRITICAL_VALUE_RAISED"
    | "CRITICAL_VALUE_ACKNOWLEDGED"
    | "MANUAL_REVIEW_REQUIRED"
    | "NOTIFICATION_READ";
  actorId: string;
  actorRole: string;
  patientUhid: string;
  reportId?: string;
  alertId?: string;
  details: string;
}

export interface SubmitReportInput {
  patientUhid: string;
  patientName?: string;
  orderId?: string;
  testName: string;
  department: ResultDepartment;
  values?: StructuredResultValue[];
  pdfOnly?: boolean;
  impression?: string;
  uploadedBy: string;
  uploadedByRole: string;
  orderingDoctor?: string;
  at?: string;
}

export interface ReviseReportInput extends SubmitReportInput {
  reason: string;
}

export interface SubmitReportOutcome {
  ok: true;
  report: ReportVersion;
  reportId: string;
  version: number;
  trends: ResultTrend[];
  criticalCheck: CriticalCheckOutcome;
  alert?: CriticalAlertView;
  notification: ResultNotification;
  log: ResultLogEntry[];
}

export interface SubmitReportFailure {
  ok: false;
  error: string;
}

const reports = new Map<string, ReportVersion[]>();
const alerts: CriticalAlert[] = [];
const notifications: ResultNotification[] = [];
const resultsLog: ResultLogEntry[] = [];
let seq = 0;
let config: CriticalAlertConfig = { ...CRITICAL_ALERT_CONFIG };
let clockNow = (): number => Date.now();

/** Inject the clock for deterministic alert lifecycle tests. */
export function _setClockForTest(now?: () => number): void {
  clockNow = now ?? (() => Date.now());
}

export interface ResultsPersistenceState {
  reports: Array<[string, ReportVersion[]]>;
  alerts: CriticalAlert[];
  notifications: ResultNotification[];
  resultsLog: ResultLogEntry[];
}

export interface ResultsPersistence {
  append(kind: string, record: ResultsPersistenceState): void;
  load(): ResultsPersistenceState | null;
}

let persistence: ResultsPersistence | null = null;
let hydrating = false;

function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function pushLog(entry: Omit<ResultLogEntry, "id" | "at"> & { at?: string }): ResultLogEntry {
  const logged: ResultLogEntry = { id: nextId("rlog"), at: entry.at ?? new Date(clockNow()).toISOString(), ...entry };
  resultsLog.push(logged);
  return logged;
}

function snapshot(): ResultsPersistenceState {
  return {
    reports: [...reports.entries()].map(([key, versions]) => [key, versions.map((version) => ({ ...version, values: [...version.values] }))]),
    alerts: alerts.map((entry) => ({ ...entry, findings: [...entry.findings], acknowledged: entry.acknowledged ? { ...entry.acknowledged } : undefined })),
    notifications: notifications.map((entry) => ({ ...entry, trends: [...entry.trends] })),
    resultsLog: resultsLog.map((entry) => ({ ...entry })),
  };
}

function persist(kind: string): void {
  if (!hydrating) persistence?.append(kind, snapshot());
}

export function configureResultsPersistence(p: ResultsPersistence | null): void {
  persistence = p;
  if (!p) return;
  const loaded = p.load();
  if (!loaded) return;
  hydrating = true;
  reports.clear();
  alerts.length = 0;
  notifications.length = 0;
  resultsLog.length = 0;
  for (const [key, versions] of loaded.reports) reports.set(key, versions.map((version) => ({ ...version, values: [...version.values] })));
  alerts.push(...loaded.alerts.map((entry) => ({ ...entry, findings: [...entry.findings], acknowledged: entry.acknowledged ? { ...entry.acknowledged } : undefined })));
  notifications.push(...loaded.notifications.map((entry) => ({ ...entry, trends: [...entry.trends] })));
  resultsLog.push(...loaded.resultsLog.map((entry) => ({ ...entry })));
  hydrating = false;
}

export function _resetResultsForTest(): void {
  reports.clear();
  alerts.length = 0;
  notifications.length = 0;
  resultsLog.length = 0;
  seq = 0;
  config = { ...CRITICAL_ALERT_CONFIG };
  persistence = null;
  _setClockForTest();
}

export function _setCriticalAlertConfigForTest(patch: Partial<CriticalAlertConfig>): void {
  config = { ...config, ...patch };
}

export function criticalAlertConfig(): CriticalAlertConfig {
  return config;
}

/** Parses "6.2", "1,50,000", "Hb 6.5 g/dL" -> number; null when not numeric. */
export function parseNumericValue(raw: string): number | null {
  const match = raw.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeParam(param: string): string {
  return param.trim().toLowerCase();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word/token match: "hb" matches "Hb" / "Hemoglobin (Hb)" but not "HbA1c". */
function matchesToken(normalized: string, name: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(name)}(?![a-z0-9])`).test(normalized);
}

export function rulesForParam(param: string, rules: readonly CriticalValueRule[] = CRITICAL_VALUE_RULES): CriticalValueRule[] {
  const normalized = normalizeParam(param);
  return rules.filter(
    (rule) =>
      rule.matchNames.some((name) => matchesToken(normalized, name)) &&
      !(rule.excludeNames ?? []).some((name) => normalized.includes(name)),
  );
}

/**
 * Platelet counts are compared in /uL. When the entered unit says lakh or
 * x10^3 (10^3/uL, K/uL, 10^9/L) the value is scaled first, so "1.5 lakh" or
 * "150 x10^3/uL" is never read as 150 /uL. No unit => compared as /uL (errs
 * towards alerting; the doctor confirms).
 */
export function plateletUnitFactor(unit: string | undefined): number {
  const u = (unit ?? "").toLowerCase().replace(/\s+/g, "");
  if (!u) return 1;
  if (u.includes("lakh") || u.includes("lac")) return 100_000;
  if (/10\^?9\/l|10⁹\/l|10\*9\/l/.test(u)) return 1_000;
  if (/10\^?3|10³|10\*3|thou|k\/(u|µ|mc|c)/.test(u) || u.startsWith("k/")) return 1_000;
  return 1;
}

function comparableValue(rule: CriticalValueRule, numeric: number, unit: string | undefined): number {
  return rule.id === "platelets-low" ? numeric * plateletUnitFactor(unit) : numeric;
}

/** Deterministic critical-value evaluation of structured entries. */
export function evaluateCriticalValues(
  values: readonly StructuredResultValue[],
  rules: readonly CriticalValueRule[] = CRITICAL_VALUE_RULES,
): CriticalFinding[] {
  const findings: CriticalFinding[] = [];
  for (const entry of values) {
    const numeric = parseNumericValue(entry.value);
    if (numeric === null) continue;
    for (const rule of rulesForParam(entry.param, rules)) {
      if (rule.threshold === null) continue; // doctor-set placeholder — inert
      const comparable = comparableValue(rule, numeric, entry.unit);
      const breached = rule.condition === "lessThan" ? comparable < rule.threshold : comparable > rule.threshold;
      if (!breached) continue;
      findings.push({
        ruleId: rule.id,
        analyte: rule.analyte,
        value: numeric,
        threshold: rule.threshold,
        unit: entry.unit?.trim() || rule.unit,
        condition: rule.condition,
        message: `${rule.analyte} ${numeric} ${entry.unit?.trim() || rule.unit} (${rule.condition === "lessThan" ? "below" : "above"} critical ${rule.threshold}) — ${rule.confirmNote}`,
      });
    }
  }
  return findings;
}

/** Trend arrows vs the previous locked version, matched by parameter name. */
export function trendAgainstPrevious(
  current: readonly StructuredResultValue[],
  previous: readonly StructuredResultValue[] | undefined,
): ResultTrend[] {
  return current.map((entry) => {
    const currentNumeric = parseNumericValue(entry.value);
    const prior = previous?.find((p) => normalizeParam(p.param) === normalizeParam(entry.param));
    const previousNumeric = prior ? parseNumericValue(prior.value) : null;
    if (currentNumeric === null || previousNumeric === null) {
      return { param: entry.param, direction: "new" as TrendDirection, current: currentNumeric ?? undefined, previous: previousNumeric ?? undefined };
    }
    const direction: TrendDirection = currentNumeric > previousNumeric ? "up" : currentNumeric < previousNumeric ? "down" : "same";
    return { param: entry.param, direction, previous: previousNumeric, current: currentNumeric };
  });
}

export const TREND_ARROWS: Record<TrendDirection, string> = { up: "↑", down: "↓", same: "→", new: "•" };

function reportKey(patientUhid: string, orderId: string | undefined, testName: string): string {
  return `${patientUhid}::${orderId?.trim() || normalizeParam(testName)}`;
}

function findReportVersions(patientUhid: string, orderId?: string, testName?: string): ReportVersion[] | undefined {
  if (testName !== undefined || orderId !== undefined) {
    return reports.get(reportKey(patientUhid, orderId, testName ?? ""));
  }
  return undefined;
}

export function listReportVersions(patientUhid: string, orderId?: string, testName?: string): ReportVersion[] {
  return [...(findReportVersions(patientUhid, orderId, testName) ?? [])];
}

export function latestReportFor(patientUhid: string): ReportVersion | undefined {
  let latest: ReportVersion | undefined;
  for (const versions of reports.values()) {
    for (const version of versions) {
      if (version.patientUhid !== patientUhid) continue;
      if (!latest || version.version > latest.version || (version.version === latest.version && version.uploadedAt > latest.uploadedAt)) {
        latest = version;
      }
    }
  }
  return latest ? { ...latest } : undefined;
}

export function listAllReports(): ReportVersion[] {
  return [...reports.values()].flat().map((version) => ({ ...version }));
}

/**
 * Upload a report. The first upload creates locked version 1; uploading again
 * for the same order/test is a revision and REQUIRES a reason (the earlier
 * version stays locked and untouched).
 */
export function submitReport(input: SubmitReportInput): SubmitReportOutcome | SubmitReportFailure {
  const patientUhid = input.patientUhid.trim();
  if (!patientUhid) return { ok: false, error: "A patient UHID is required." };
  const testName = input.testName.trim();
  if (!testName) return { ok: false, error: "A test/report name is required." };
  if (!input.uploadedBy.trim() || !input.uploadedByRole.trim()) return { ok: false, error: "Uploader and role are required." };

  const pdfOnly = input.pdfOnly === true || (input.values ?? []).length === 0;
  const at = input.at ?? new Date(clockNow()).toISOString();
  const existing = findReportVersions(patientUhid, input.orderId, testName);
  if (existing && existing.length > 0) {
    return { ok: false, error: "REPORT_LOCKED: this report version is locked. Use revise with a reason to create a new version." };
  }

  const reportId = nextId("rep");
  const version: ReportVersion = {
    id: nextId("rv"),
    reportId,
    version: 1,
    patientUhid,
    patientName: input.patientName,
    orderId: input.orderId?.trim() || undefined,
    testName,
    department: input.department,
    values: [...(input.values ?? [])],
    pdfOnly,
    impression: input.impression,
    locked: true,
    lockedAt: at,
    uploadedBy: input.uploadedBy.trim(),
    uploadedByRole: input.uploadedByRole.trim(),
    uploadedAt: at,
  };
  reports.set(reportKey(patientUhid, input.orderId, testName), [version]);
  return finalizeUpload(version, undefined, input.orderingDoctor, at);
}

/** A locked report is never edited — a revision creates a new locked version and needs a reason. */
export function reviseReport(reportId: string, input: ReviseReportInput): SubmitReportOutcome | SubmitReportFailure {
  const reason = input.reason.trim();
  if (!reason) return { ok: false, error: "A reason is required to revise a locked report." };
  const versions = [...reports.values()].find((list) => list.some((entry) => entry.reportId === reportId));
  if (!versions || versions.length === 0) return { ok: false, error: "REPORT_NOT_FOUND" };
  const latest = versions[versions.length - 1];
  const at = input.at ?? new Date(clockNow()).toISOString();
  const revised: ReportVersion = {
    id: nextId("rv"),
    reportId: latest.reportId,
    version: latest.version + 1,
    patientUhid: latest.patientUhid,
    patientName: input.patientName ?? latest.patientName,
    orderId: input.orderId?.trim() || latest.orderId,
    testName: input.testName.trim() || latest.testName,
    department: input.department,
    values: [...(input.values ?? [])],
    pdfOnly: input.pdfOnly === true || (input.values ?? []).length === 0,
    impression: input.impression ?? latest.impression,
    locked: true,
    lockedAt: at,
    revisionReason: reason,
    uploadedBy: input.uploadedBy.trim(),
    uploadedByRole: input.uploadedByRole.trim(),
    uploadedAt: at,
  };
  versions.push(revised);
  return finalizeUpload(revised, latest.values, input.orderingDoctor, at, reason);
}

function finalizeUpload(
  version: ReportVersion,
  previousValues: readonly StructuredResultValue[] | undefined,
  orderingDoctor: string | undefined,
  at: string,
  revisionReason?: string,
): SubmitReportOutcome {
  const log: ResultLogEntry[] = [];
  log.push(pushLog({
    action: revisionReason ? "REPORT_REVISED" : "REPORT_UPLOADED",
    actorId: version.uploadedBy,
    actorRole: version.uploadedByRole,
    patientUhid: version.patientUhid,
    reportId: version.reportId,
    details: `${version.testName} v${version.version}${revisionReason ? ` revised: ${revisionReason}` : " uploaded"} (${version.department})`,
    at,
  }));
  log.push(pushLog({
    action: "REPORT_VERSION_LOCKED",
    actorId: version.uploadedBy,
    actorRole: version.uploadedByRole,
    patientUhid: version.patientUhid,
    reportId: version.reportId,
    details: `Version ${version.version} locked at ${at}. Later edits create a new version with a reason.`,
    at,
  }));

  const trends = version.pdfOnly ? [] : trendAgainstPrevious(version.values, previousValues);

  // Structured values first. PDF/image-only reports cannot be checked
  // numerically — say so instead of silently passing.
  let criticalCheck: CriticalCheckOutcome;
  if (version.pdfOnly) {
    criticalCheck = {
      possible: false,
      manualReviewRequired: true,
      findings: [],
      note: "critical check not possible - manual review",
    };
    log.push(pushLog({
      action: "MANUAL_REVIEW_REQUIRED",
      actorId: version.uploadedBy,
      actorRole: version.uploadedByRole,
      patientUhid: version.patientUhid,
      reportId: version.reportId,
      details: `${version.testName} v${version.version} is PDF/image-only — ${criticalCheck.note}.`,
      at,
    }));
  } else {
    const findings = evaluateCriticalValues(version.values);
    criticalCheck = { possible: true, manualReviewRequired: false, findings, note: findings.length ? "" : "No critical value rule breached." };
  }

  let alert: CriticalAlertView | undefined;
  if (criticalCheck.findings.length > 0) {
    const raised: CriticalAlert = {
      id: nextId("crit"),
      level: config.level,
      levelLabel: config.levelLabel,
      patientUhid: version.patientUhid,
      patientName: version.patientName,
      reportId: version.reportId,
      reportVersion: version.version,
      testName: version.testName,
      findings: criticalCheck.findings,
      raisedAt: at,
      raisedAtMs: Date.parse(at),
    };
    alerts.push(raised);
    alert = toAlertView(raised, Date.parse(at));
    log.push(pushLog({
      action: "CRITICAL_VALUE_RAISED",
      actorId: version.uploadedBy,
      actorRole: version.uploadedByRole,
      patientUhid: version.patientUhid,
      reportId: version.reportId,
      alertId: raised.id,
      details: criticalCheck.findings.map((f) => f.message).join("; "),
      at,
    }));
  }

  const who = version.patientName ? `${version.patientName} (${version.patientUhid})` : version.patientUhid;
  const notification: ResultNotification = {
    id: nextId("rntf"),
    patientUhid: version.patientUhid,
    patientName: version.patientName,
    title: "New investigation results received",
    detail: `${version.testName} v${version.version} for ${who}${orderingDoctor ? ` — ordering doctor: ${orderingDoctor}` : ""}.${alert ? " CRITICAL VALUE — acknowledge required." : ""}`,
    reportId: version.reportId,
    version: version.version,
    testName: version.testName,
    trends,
    critical: Boolean(alert),
    alertId: alert?.id,
    targetRole: "doctor",
    read: false,
    createdAt: at,
    createdAtMs: Date.parse(at),
  };
  notifications.push(notification);
  persist(revisionReason ? "report-revised" : "report-submitted");

  return {
    ok: true,
    report: { ...version },
    reportId: version.reportId,
    version: version.version,
    trends,
    criticalCheck,
    alert,
    notification: { ...notification },
    log,
  };
}

export function toAlertView(alert: CriticalAlert, nowMs: number = clockNow()): CriticalAlertView {
  const state = escalationStateFor(alert, nowMs, config);
  return { ...alert, ...state };
}

/** Pure escalation timing — an unacknowledged alert escalates after the configured timeout. */
export function escalationStateFor(
  alert: Pick<CriticalAlert, "raisedAtMs" | "acknowledged">,
  nowMs: number,
  alertConfig: CriticalAlertConfig = config,
): { escalated: boolean; escalationRepeats: number; escalationDueAtMs: number } {
  const dueAt = alert.raisedAtMs + alertConfig.escalationTimeoutMs;
  if (alert.acknowledged || nowMs < dueAt) {
    return { escalated: false, escalationRepeats: 0, escalationDueAtMs: dueAt };
  }
  const overdue = nowMs - dueAt;
  const repeats = 1 + Math.floor(overdue / Math.max(1, alertConfig.escalationRepeatMs));
  return { escalated: true, escalationRepeats: repeats, escalationDueAtMs: dueAt };
}

export function listCriticalAlerts(filter: "open" | "acknowledged" | "all" = "all", patientUhid?: string, nowMs: number = clockNow()): CriticalAlertView[] {
  return alerts
    .filter((alert) => {
      if (patientUhid && alert.patientUhid !== patientUhid) return false;
      if (filter === "open") return !alert.acknowledged;
      if (filter === "acknowledged") return Boolean(alert.acknowledged);
      return true;
    })
    .map((alert) => toAlertView(alert, nowMs));
}

export function getCriticalAlert(alertId: string): CriticalAlertView | undefined {
  const alert = alerts.find((entry) => entry.id === alertId);
  return alert ? toAlertView(alert) : undefined;
}

/**
 * The ONLY way to close a Level-3 alert. Records doctor id + time and logs it.
 * There is deliberately no dismiss/close function.
 */
export function acknowledgeCriticalAlert(
  alertId: string,
  actor: { doctorId: string; doctorName: string; role?: string; at?: string },
): { ok: true; alert: CriticalAlertView; log: ResultLogEntry } | { ok: false; error: string } {
  const alert = alerts.find((entry) => entry.id === alertId);
  if (!alert) return { ok: false, error: "ALERT_NOT_FOUND" };
  if (alert.acknowledged) return { ok: false, error: "ALREADY_ACKNOWLEDGED" };
  const doctorId = actor.doctorId.trim();
  if (!doctorId) return { ok: false, error: "A doctor id is required to acknowledge." };
  const at = actor.at ?? new Date(clockNow()).toISOString();
  alert.acknowledged = { doctorId, doctorName: actor.doctorName.trim() || doctorId, at, atMs: Date.parse(at) };
  const log = pushLog({
    action: "CRITICAL_VALUE_ACKNOWLEDGED",
    actorId: doctorId,
    actorRole: actor.role ?? "doctor",
    patientUhid: alert.patientUhid,
    reportId: alert.reportId,
    alertId: alert.id,
    details: `Acknowledged by ${alert.acknowledged.doctorName} (${doctorId}) at ${at}. Findings: ${alert.findings.map((f) => f.message).join("; ")}`,
    at,
  });
  persist("critical-alert-acknowledged");
  return { ok: true, alert: toAlertView(alert), log };
}

export function listResultNotifications(patientUhid?: string, unreadOnly = false): ResultNotification[] {
  return notifications
    .filter((entry) => (!patientUhid || entry.patientUhid === patientUhid) && (!unreadOnly || !entry.read))
    .map((entry) => ({ ...entry }));
}

export function unreadResultCount(patientUhid: string): number {
  return notifications.filter((entry) => entry.patientUhid === patientUhid && !entry.read).length;
}

export function markResultNotificationRead(notificationId: string, at: string = new Date(clockNow()).toISOString()): ResultNotification | undefined {
  const entry = notifications.find((candidate) => candidate.id === notificationId);
  if (!entry) return undefined;
  entry.read = true;
  entry.readAt = at;
  pushLog({ action: "NOTIFICATION_READ", actorId: "doctor", actorRole: "doctor", patientUhid: entry.patientUhid, reportId: entry.reportId, details: `Result notification ${entry.id} marked read.` });
  persist("notification-read");
  return { ...entry };
}

export function listResultsLog(patientUhid?: string): ResultLogEntry[] {
  return resultsLog.filter((entry) => !patientUhid || entry.patientUhid === patientUhid).map((entry) => ({ ...entry }));
}

/**
 * R5-07 ward vitals alerts reuse the SAME Level-3 loop: same store, same
 * acknowledgment (doctor id + time), same escalation and night-override voice.
 * Only the source differs. One alert at a time per patient — an unacknowledged
 * vitals alert is not duplicated on the next reading.
 */
export function raiseVitalsCriticalAlert(input: {
  patientUhid: string;
  patientName?: string;
  findings: CriticalFinding[];
  raisedBy?: string;
  raisedByRole?: string;
  at?: string;
}): CriticalAlertView {
  const existing = alerts.find(
    (entry) => entry.patientUhid === input.patientUhid && entry.source === "vitals" && !entry.acknowledged,
  );
  if (existing) return toAlertView(existing, input.at ? Date.parse(input.at) : clockNow());
  const at = input.at ?? new Date(clockNow()).toISOString();
  const raised: CriticalAlert = {
    id: nextId("crit"),
    level: config.level,
    levelLabel: config.levelLabel,
    patientUhid: input.patientUhid,
    patientName: input.patientName,
    reportId: nextId("wardvitals"),
    reportVersion: 1,
    testName: "Ward vitals",
    source: "vitals",
    findings: input.findings,
    raisedAt: at,
    raisedAtMs: Date.parse(at),
  };
  alerts.push(raised);
  pushLog({
    action: "CRITICAL_VALUE_RAISED",
    actorId: input.raisedBy ?? "ward",
    actorRole: input.raisedByRole ?? "ward",
    patientUhid: input.patientUhid,
    reportId: raised.reportId,
    alertId: raised.id,
    details: input.findings.map((f) => f.message).join("; "),
    at,
  });
  persist("vitals-critical-alert-raised");
  return toAlertView(raised, Date.parse(at));
}

/** One sentence — spoken for Level-3 alerts; overrides night-time suppression. */
export function criticalVoiceLine(alert: Pick<CriticalAlert, "patientName" | "patientUhid" | "findings">): string {
  const who = alert.patientName || alert.patientUhid;
  const first = alert.findings[0];
  const extra = alert.findings.length > 1 ? ` and ${alert.findings.length - 1} more` : "";
  return first
    ? `Critical ${first.analyte} of ${first.value} ${first.unit} for ${who}${extra} — doctor, please acknowledge now.`
    : `Critical result for ${who} — doctor, please acknowledge now.`;
}

/**
 * Non-critical announcements may be suppressed at night; critical alerts ALWAYS
 * speak (config.voice.overridesNightSuppression).
 */
export function shouldSpeakAnnouncement(input: { critical: boolean; hour: number }, alertConfig: CriticalAlertConfig = config): boolean {
  if (input.critical) return alertConfig.voice.overridesNightSuppression;
  const { nightStartHour, nightEndHour } = alertConfig.voice;
  const night = nightStartHour <= nightEndHour
    ? input.hour >= nightStartHour && input.hour < nightEndHour
    : input.hour >= nightStartHour || input.hour < nightEndHour;
  return !night;
}

/** Optional lab voice lines (reuse the existing voice layer). */
export function labVoiceLine(kind: "test_received" | "report_uploaded", options?: { testName?: string; priority?: string }): string {
  if (kind === "test_received") return `${options?.testName ?? "CBC"} test received. Priority: ${options?.priority ?? "urgent"}.`;
  return "Report uploaded. Sent to doctor.";
}
