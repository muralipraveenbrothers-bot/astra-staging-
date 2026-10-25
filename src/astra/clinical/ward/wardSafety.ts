/**
 * R5-07 ward nursing safety core (pure, in-memory — mirrors the workflowGuard
 * and resultsLoop conventions). Everything here is deterministic rules; no LLM
 * decides anything clinical.
 *
 *  - Confirmed medication orders become timed dose tasks. The ward can only
 *    GIVE, HOLD (with a reason) or mark REFUSED — it can never change a dose.
 *  - Vitals come due on a per-patient timer (default 2 h, 2-4 h configurable,
 *    15 min in ICU mode). Each entry emits VITALS_UPDATED and feeds trend
 *    graphs (BP, pulse, SpO2, temperature, RR).
 *  - Trend classification is rules-based: Improving / Stable / Deteriorating
 *    with the reason. Deteriorating + an R5-02 threshold breach raises a
 *    Level-3 alert through the R5-06 closed loop (resultsLoop).
 *  - Missed tasks escalate: Level 2 (double beep + yellow highlight) the
 *    moment a task passes its due time, repeated every 15 min until done or
 *    held with a reason; after a configurable number of repeats it escalates
 *    to the charge nurse / doctor view. Every step is logged.
 *  - Night shift (22:00-06:00): routine reminders are logged silently; only
 *    Level-3 alerts still speak.
 *  - SBAR handover drafts at shift change, editable, signed by the outgoing
 *    nurse, acknowledged by the incoming nurse. Drafts never change orders.
 *  - Non-punitive wording throughout; no staff scoring.
 */
import { CLINICAL_INGRESS_THRESHOLDS } from "../clinicalIngressConfig";
import type { CriticalAlertConfig } from "../results/criticalValueRules";
import {
  raiseVitalsCriticalAlert,
  shouldSpeakAnnouncement,
  type CriticalAlertView,
  type CriticalFinding,
} from "../results/resultsLoop";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface WardSafetyConfig {
  vitalsIntervalMinutes: number;
  /** Per-patient configurable range (non-ICU). */
  vitalsIntervalRangeMinutes: { min: number; max: number };
  icuVitalsIntervalMinutes: number;
  night: { startHour: number; endHour: number };
  level2: {
    /** Repeat the double-beep reminder this often while a task stays overdue. */
    repeatMs: number;
    /** After this many repeats the task escalates to charge nurse / doctor. */
    escalateAfterRepeats: number;
  };
  /** Times (24h, local) used when a frequency has a fixed daily pattern. */
  doseScheduleTimes: {
    OD: string[];
    BD: string[];
    TDS: string[];
    QID: string[];
  };
}

export const WARD_SAFETY_CONFIG: WardSafetyConfig = {
  vitalsIntervalMinutes: 120,
  vitalsIntervalRangeMinutes: { min: 120, max: 240 },
  icuVitalsIntervalMinutes: 15,
  night: { startHour: 22, endHour: 6 },
  level2: { repeatMs: 15 * 60 * 1000, escalateAfterRepeats: 4 },
  doseScheduleTimes: {
    OD: ["08:00"],
    BD: ["08:00", "20:00"],
    TDS: ["08:00", "14:00", "20:00"],
    QID: ["06:00", "12:00", "18:00", "00:00"],
  },
};

/** Night voice config for routine ward reminders (R5-07: 22:00-06:00). */
export const WARD_NIGHT_VOICE_CONFIG: CriticalAlertConfig = {
  level: 3,
  levelLabel: "Level 3",
  escalationTimeoutMs: 5 * 60 * 1000,
  escalationRepeatMs: 2 * 60 * 1000,
  voice: { overridesNightSuppression: true, nightStartHour: WARD_SAFETY_CONFIG.night.startHour, nightEndHour: WARD_SAFETY_CONFIG.night.endHour },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WardVitalsInput {
  hr: number;
  bpSystolic: number;
  bpDiastolic: number;
  temp: number;
  rr: number;
  spo2: number;
}

export type VitalsTrendStatus = "Improving" | "Stable" | "Deteriorating";

export interface VitalsClassification {
  status: VitalsTrendStatus;
  reason: string;
  at: string;
  atMs: number;
}

export interface WardVitalsReading extends WardVitalsInput {
  id: string;
  patientUhid: string;
  recordedBy: string;
  role: string;
  at: string;
  atMs: number;
}

export interface WardMedicationOrder {
  id: string;
  drugName: string;
  dose: string;
  route: string;
  frequency: string;
  orderStartAt?: string;
  stat?: boolean;
}

export type DoseTaskStatus = "SCHEDULED" | "GIVEN" | "HELD" | "REFUSED" | "not_due_admitted_later";
export const NOT_DUE_ADMITTED_LATER_LABEL = "Not due (admitted later)";

export interface DoseStatusChange {
  before: DoseTaskStatus;
  after: DoseTaskStatus;
  actor: string;
  role: string;
  at: string;
  reason?: string;
}

function recordDoseStatusChange(task: DoseTask, before: DoseTaskStatus, actor: { name: string; role: string }, atMs: number, reason?: string): void {
  task.statusHistory = [...(task.statusHistory ?? []), { before, after: task.status, actor: actor.name, role: actor.role, at: new Date(atMs).toISOString(), ...(reason ? { reason } : {}) }];
}

export interface DoseTask {
  id: string;
  patientUhid: string;
  patientName?: string;
  orderId?: string;
  drugName: string;
  dose: string;
  route: string;
  frequency: string;
  scheduledAt: string;
  scheduledAtMs: number;
  status: DoseTaskStatus;
  statusLabel?: string;
  /** R6-01 checkpoint trail: every status change with actor, time and reason. */
  statusHistory?: DoseStatusChange[];
  administeredBy?: string;
  administeredAt?: string;
  reason?: string;
}

export interface WardPatientState {
  patientUhid: string;
  patientName?: string;
  bedNumber?: string;
  wardName?: string;
  diagnosis?: string;
  allergies?: string[];
  admittedAt?: string;
  registeredAt?: string;
  icuMode: boolean;
  vitalsIntervalMinutes: number;
  vitalsDueAtMs?: number;
  lastClassification?: VitalsClassification;
  readings: WardVitalsReading[];
  doses: DoseTask[];
}

export interface WardEscalationState {
  overdue: boolean;
  overdueMs: number;
  /** 1 at the first repeat window, +1 per repeat window after that. */
  repeats: number;
  escalated: boolean;
  nextRepeatAtMs: number;
}

export interface WardEscalationEvent {
  id: string;
  patientUhid: string;
  patientName?: string;
  kind: "DOSE" | "VITALS";
  taskId: string;
  taskLabel: string;
  raisedAtMs: number;
  level: 2;
  lastRepeatMs: number;
  repeats: number;
  escalatedToCharge: boolean;
  resolvedAtMs?: number;
  resolvedBy?: string;
  resolvedAction?: string;
  /** R6-01: raised on boot for a task that fell due while AstraAPI was down. */
  firedLate?: boolean;
  /** Checkpoint trail. Nothing here is auto-rolled-back. */
  statusTrail?: Array<{ before: string; after: string; actor: string; role: string; at: string; reason?: string }>;
}

export type WardLogKind =
  | "DOSE_SCHEDULED"
  | "DOSE_ADMINISTERED"
  | "DOSE_HELD"
  | "DOSE_REFUSED"
  | "VITALS_UPDATED"
  | "WARD_CONFIG_CHANGED"
  | "LEVEL2_RAISED"
  | "LEVEL2_REPEAT"
  | "ESCALATED_TO_CHARGE"
  | "ESCALATION_RESOLVED"
  | "NIGHT_SUPPRESSED"
  | "SBAR_DRAFTED"
  | "SBAR_EDITED"
  | "SBAR_SIGNED"
  | "SBAR_ACKNOWLEDGED"
  | "UNIT_SUMMARY_CREATED";

export interface WardSafetyLogEntry {
  id: string;
  at: string;
  atMs: number;
  kind: WardLogKind;
  patientUhid: string;
  taskId?: string;
  details: string;
  /** false when the reminder was logged silently (night mode). */
  audible: boolean;
}

export interface SbarDraft {
  situation: string;
  background: string;
  assessment: string;
  recommendation: string;
}

export interface SbarEditRecord {
  at: string;
  by: string;
  role: string;
}

export interface SbarHandover {
  id: string;
  patientUhid: string;
  patientName?: string;
  shiftLabel: string;
  createdAt: string;
  createdAtMs: number;
  draft: SbarDraft;
  edits: SbarEditRecord[];
  signedBy?: string;
  signedAt?: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  statusTrail?: Array<{ before: string; after: string; actor: string; role: string; at: string; reason?: string }>;
}

export interface UnitSummarySection {
  order: 1 | 2 | 3;
  title: string;
  text: string;
}

export interface UnitSummary {
  id: string;
  shiftLabel: string;
  createdAt: string;
  createdAtMs: number;
  /** Always ordered: critical safety (1), tasks & stock (2), staff motivation (3). */
  sections: UnitSummarySection[];
  readSeconds: number;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const patients = new Map<string, WardPatientState>();
const escalations: WardEscalationEvent[] = [];
const sbarList: SbarHandover[] = [];
const summaries: UnitSummary[] = [];
const log: WardSafetyLogEntry[] = [];
let seq = 0;
let config: WardSafetyConfig = {
  ...WARD_SAFETY_CONFIG,
  doseScheduleTimes: { ...WARD_SAFETY_CONFIG.doseScheduleTimes },
};

export interface WardPersistenceState {
  patients: WardPatientState[];
  escalations: WardEscalationEvent[];
  sbarList: SbarHandover[];
  summaries: UnitSummary[];
  log: WardSafetyLogEntry[];
}

export interface WardPersistence {
  append(kind: string, record: WardPersistenceState): void;
  load(): WardPersistenceState | null;
}

let persistence: WardPersistence | null = null;
let hydrating = false;

function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function pushLog(entry: Omit<WardSafetyLogEntry, "id" | "at" | "atMs" | "audible"> & { atMs: number; audible?: boolean }): WardSafetyLogEntry {
  const audible = entry.audible ?? routineReminderAudible(entry.atMs);
  const logged: WardSafetyLogEntry = {
    id: nextId("wlog"),
    at: new Date(entry.atMs).toISOString(),
    atMs: entry.atMs,
    kind: entry.kind,
    patientUhid: entry.patientUhid,
    taskId: entry.taskId,
    details: entry.details,
    audible,
  };
  log.push(logged);
  return logged;
}

function clonePatientState(state: WardPatientState): WardPatientState {
  return {
    ...state,
    allergies: state.allergies ? [...state.allergies] : undefined,
    lastClassification: state.lastClassification ? { ...state.lastClassification } : undefined,
    readings: state.readings.map((entry) => ({ ...entry })),
    doses: state.doses.map((entry) => ({ ...entry, statusHistory: entry.statusHistory ? entry.statusHistory.map((change) => ({ ...change })) : undefined })),
  };
}

function snapshot(): WardPersistenceState {
  return {
    patients: [...patients.values()].map(clonePatientState),
    escalations: escalations.map((entry) => ({ ...entry })),
    sbarList: sbarList.map((entry) => ({ ...entry, draft: { ...entry.draft }, edits: entry.edits.map((edit) => ({ ...edit })) })),
    summaries: summaries.map((entry) => ({ ...entry, sections: entry.sections.map((section) => ({ ...section })) })),
    log: log.map((entry) => ({ ...entry })),
  };
}

function persist(kind: string): void {
  if (!hydrating) persistence?.append(kind, snapshot());
}

export function configureWardPersistence(p: WardPersistence | null): void {
  persistence = p;
  if (!p) return;
  const loaded = p.load();
  if (!loaded) return;
  hydrating = true;
  patients.clear();
  escalations.length = 0;
  sbarList.length = 0;
  summaries.length = 0;
  log.length = 0;
  for (const state of loaded.patients) patients.set(state.patientUhid, clonePatientState(state));
  escalations.push(...loaded.escalations.map((entry) => ({ ...entry })));
  sbarList.push(...loaded.sbarList.map((entry) => ({ ...entry, draft: { ...entry.draft }, edits: entry.edits.map((edit) => ({ ...edit })) })));
  summaries.push(...loaded.summaries.map((entry) => ({ ...entry, sections: entry.sections.map((section) => ({ ...section })) })));
  log.push(...loaded.log.map((entry) => ({ ...entry })));
  hydrating = false;
}

export function _resetWardSafetyForTest(): void {
  patients.clear();
  escalations.length = 0;
  sbarList.length = 0;
  summaries.length = 0;
  log.length = 0;
  seq = 0;
  config = { ...WARD_SAFETY_CONFIG, doseScheduleTimes: { ...WARD_SAFETY_CONFIG.doseScheduleTimes } };
  persistence = null;
}

export function _setWardSafetyConfigForTest(patch: Partial<WardSafetyConfig>): void {
  config = { ...config, ...patch, doseScheduleTimes: { ...config.doseScheduleTimes, ...(patch.doseScheduleTimes ?? {}) } };
}

export function wardSafetyConfig(): WardSafetyConfig {
  return config;
}

// ---------------------------------------------------------------------------
// Time helpers (all pure / explicit — fake-clock friendly)
// ---------------------------------------------------------------------------

export function routineReminderAudible(atMs: number): boolean {
  const hour = new Date(atMs).getHours();
  return shouldSpeakAnnouncement({ critical: false, hour }, WARD_NIGHT_VOICE_CONFIG);
}

/** Ward shifts: Night 22:00-06:00, Morning 06:00-14:00, Evening 14:00-22:00. */
export function shiftLabelFor(hour: number): string {
  if (hour >= 22 || hour < 6) return "Night";
  if (hour < 14) return "Morning";
  return "Evening";
}

function atLocalTime(dayAtMs: number, hhmm: string): number {
  const day = new Date(dayAtMs);
  const [hours, minutes] = hhmm.split(":").map(Number);
  const date = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, 0, 0);
  return date.getTime();
}

// ---------------------------------------------------------------------------
// Frequency -> timed doses (rules, never guessed)
// ---------------------------------------------------------------------------

export interface FrequencyDose {
  timesPerDay: number;
  times: string[];
}

/** Maps common order frequencies to doses/day. null = no fixed schedule (PRN/SOS). */
export function dosesPerDayFromFrequency(frequency: string): number | null {
  const f = frequency.toUpperCase();
  if (/\bQID\b/.test(f)) return 4;
  if (/\bTDS\b|\bTID\b/.test(f)) return 3;
  if (/\bBD\b|\bBID\b/.test(f)) return 2;
  if (/\bOD\b|\bSTAT\b|\bONCE\b|\bHS\b/.test(f)) return 1;
  const hourly = f.match(/\bQ\s*(\d+)\s*H\b/);
  if (hourly) {
    const every = Number(hourly[1]);
    if (every > 0 && 24 % every === 0) return 24 / every;
  }
  if (/\bPRN\b|\bSOS\b/.test(f)) return null;
  return null;
}

/** Times of day (24h) for a doses-per-day count; evenly spaced from 06:00. */
export function doseTimesForCount(timesPerDay: number): string[] {
  if (timesPerDay <= 0) return [];
  if (timesPerDay === 1) return config.doseScheduleTimes.OD;
  if (timesPerDay === 2) return config.doseScheduleTimes.BD;
  if (timesPerDay === 3) return config.doseScheduleTimes.TDS;
  if (timesPerDay === 4) return config.doseScheduleTimes.QID;
  const step = Math.round((24 * 60) / timesPerDay);
  const times: string[] = [];
  for (let i = 0; i < timesPerDay; i += 1) {
    const minutes = (6 * 60 + i * step) % (24 * 60);
    times.push(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
  }
  return times;
}

/** "00:00" belongs to the NEXT midnight (a QID regimen spans 06:00 -> 00:00). */
function timeToMsOnDay(dayAtMs: number, hhmm: string): number {
  const ms = atLocalTime(dayAtMs, hhmm);
  return hhmm === "00:00" ? ms + 24 * 60 * 60 * 1000 : ms;
}

// ---------------------------------------------------------------------------
// Patient registration / configuration
// ---------------------------------------------------------------------------

export interface WardPatientProfile {
  patientUhid: string;
  patientName?: string;
  bedNumber?: string;
  wardName?: string;
  diagnosis?: string;
  allergies?: string[];
  admittedAt?: string;
  registeredAt?: string;
}

export function ensureWardPatient(profile: WardPatientProfile): WardPatientState {
  const uhid = profile.patientUhid.trim();
  const existing = patients.get(uhid);
  if (existing) {
    existing.patientName = profile.patientName ?? existing.patientName;
    existing.bedNumber = profile.bedNumber ?? existing.bedNumber;
    existing.wardName = profile.wardName ?? existing.wardName;
    existing.diagnosis = profile.diagnosis ?? existing.diagnosis;
    existing.allergies = profile.allergies ?? existing.allergies;
    existing.admittedAt = profile.admittedAt ?? existing.admittedAt;
    existing.registeredAt = profile.registeredAt ?? existing.registeredAt;
    return existing;
  }
  const state: WardPatientState = {
    patientUhid: uhid,
    patientName: profile.patientName,
    bedNumber: profile.bedNumber,
    wardName: profile.wardName,
    diagnosis: profile.diagnosis,
    allergies: profile.allergies,
    admittedAt: profile.admittedAt,
    registeredAt: profile.registeredAt,
    icuMode: false,
    vitalsIntervalMinutes: config.vitalsIntervalMinutes,
    readings: [],
    doses: [],
  };
  patients.set(uhid, state);
  return state;
}

export function wardPatientState(uhid: string): WardPatientState | undefined {
  return patients.get(uhid.trim());
}

export function wardPatientStates(): WardPatientState[] {
  return [...patients.values()];
}

/** Starts (or restarts, if never started) the per-patient vitals timer. */
export function startWardVitalsSchedule(profile: WardPatientProfile, atMs: number = Date.now()): WardPatientState {
  const state = ensureWardPatient(profile);
  if (!state.vitalsDueAtMs) {
    state.vitalsDueAtMs = atMs + vitalsIntervalMinutesFor(state) * 60 * 1000;
    persist("vitals-timer-set");
  }
  return state;
}

export function setWardIcuMode(
  uhid: string,
  icu: boolean,
  actor: { name: string; role: string },
  atMs: number = Date.now(),
): { ok: true; state: WardPatientState } | { ok: false; error: string } {
  const state = wardPatientState(uhid);
  if (!state) return { ok: false, error: "PATIENT_NOT_SCHEDULED" };
  state.icuMode = icu;
  state.vitalsIntervalMinutes = icu ? config.icuVitalsIntervalMinutes : config.vitalsIntervalMinutes;
  state.vitalsDueAtMs = atMs + state.vitalsIntervalMinutes * 60 * 1000;
  pushLog({
    kind: "WARD_CONFIG_CHANGED",
    patientUhid: state.patientUhid,
    atMs,
    details: `${actor.name} (${actor.role}) set ${icu ? "ICU mode" : "ward mode"} — vitals every ${state.vitalsIntervalMinutes} min.`,
  });
  persist("ward-config-changed");
  return { ok: true, state };
}

export function setWardVitalsInterval(
  uhid: string,
  minutes: number,
  actor: { name: string; role: string },
  atMs: number = Date.now(),
): { ok: true; state: WardPatientState } | { ok: false; error: string } {
  const state = wardPatientState(uhid);
  if (!state) return { ok: false, error: "PATIENT_NOT_SCHEDULED" };
  if (state.icuMode) {
    return { ok: false, error: "ICU mode fixes the interval at 15 minutes." };
  }
  if (!Number.isFinite(minutes) || minutes < config.vitalsIntervalRangeMinutes.min || minutes > config.vitalsIntervalRangeMinutes.max) {
    return { ok: false, error: `Interval must be between ${config.vitalsIntervalRangeMinutes.min} and ${config.vitalsIntervalRangeMinutes.max} minutes.` };
  }
  state.vitalsIntervalMinutes = Math.round(minutes);
  state.vitalsDueAtMs = atMs + state.vitalsIntervalMinutes * 60 * 1000;
  pushLog({
    kind: "WARD_CONFIG_CHANGED",
    patientUhid: state.patientUhid,
    atMs,
    details: `${actor.name} (${actor.role}) set vitals interval to ${state.vitalsIntervalMinutes} min.`,
  });
  persist("vitals-timer-reset");
  return { ok: true, state };
}

// ---------------------------------------------------------------------------
// Dose schedule from confirmed orders
// ---------------------------------------------------------------------------

export function scheduleDosesForPatient(
  profile: WardPatientProfile,
  orders: readonly WardMedicationOrder[],
  dayAtMs: number = Date.now(),
): { ok: true; created: DoseTask[]; skipped: number } | { ok: false; error: string } {
  const state = ensureWardPatient(profile);
  const scheduleBuiltAt = dayAtMs;
  const admittedAtRaw = profile.admittedAt ?? profile.registeredAt;
  const admittedAtMs = admittedAtRaw ? Date.parse(admittedAtRaw) : NaN;
  if (!Number.isFinite(admittedAtMs)) {
    console.warn(`[wardSafety] Admission time missing for ${state.patientUhid}; dose slots keep existing behavior.`);
  }
  // Dedupe against every existing task (not a UTC day prefix, which misses IST
  // tasks when the schedule is rebuilt between 00:00 and 05:30 local).
  const alreadyScheduled = state.doses.map((task) => `${task.orderId ?? ""}::${task.drugName}::${task.scheduledAt}`);
  const created: DoseTask[] = [];
  let skipped = 0;
  for (const order of orders) {
    const perDay = dosesPerDayFromFrequency(order.frequency);
    if (perDay === null) {
      skipped += 1; // PRN/SOS has no fixed schedule
      continue;
    }
    const orderStartAtMs = order.orderStartAt ? Date.parse(order.orderStartAt) : NaN;
    const hasEffectiveStart = Number.isFinite(admittedAtMs) || Number.isFinite(orderStartAtMs);
    const effectiveStart = hasEffectiveStart
      ? Math.max(
        Number.isFinite(admittedAtMs) ? admittedAtMs : Number.NEGATIVE_INFINITY,
        Number.isFinite(orderStartAtMs) ? orderStartAtMs : scheduleBuiltAt,
      )
      : Number.NaN;
    const firstDay = new Date(effectiveStart);
    const isStat = order.stat === true || /\bSTAT\b|\bNOW\b/.test(order.frequency.toUpperCase());
    if (isStat && state.doses.some((task) => task.orderId === order.id)) {
      skipped += 1; // a stat order is one dose, never re-created on a schedule rebuild
      continue;
    }
    // A stat / "give now" dose is due when it was ordered, not at the OD 08:00 slot.
    const slots: Array<{ scheduledAtMs: number; label: string }> = isStat
      ? [{ scheduledAtMs: Number.isFinite(orderStartAtMs) ? orderStartAtMs : scheduleBuiltAt, label: "now (stat)" }]
      : doseTimesForCount(perDay).map((hhmm) => ({ scheduledAtMs: timeToMsOnDay(dayAtMs, hhmm), label: hhmm }));
    for (const { scheduledAtMs, label: hhmm } of slots) {
      const scheduledAt = new Date(scheduledAtMs).toISOString();
      const dedupeKey = `${order.id}::${order.drugName}::${scheduledAt}`;
      if (alreadyScheduled.includes(dedupeKey)) {
        skipped += 1;
        continue;
      }
      const isSameFirstDay = Number.isFinite(effectiveStart)
        && new Date(scheduledAtMs).getFullYear() === firstDay.getFullYear()
        && new Date(scheduledAtMs).getMonth() === firstDay.getMonth()
        && new Date(scheduledAtMs).getDate() === firstDay.getDate();
      const notDueAdmittedLater = !isStat && isSameFirstDay && scheduledAtMs < effectiveStart;
      const task: DoseTask = {
        id: nextId("dose"),
        patientUhid: state.patientUhid,
        patientName: state.patientName,
        orderId: order.id,
        drugName: order.drugName,
        dose: order.dose,
        route: order.route,
        frequency: order.frequency,
        scheduledAt,
        scheduledAtMs,
        status: notDueAdmittedLater ? "not_due_admitted_later" : "SCHEDULED",
        statusLabel: notDueAdmittedLater ? NOT_DUE_ADMITTED_LATER_LABEL : undefined,
      };
      state.doses.push(task);
      created.push(task);
      pushLog({
        kind: "DOSE_SCHEDULED",
        patientUhid: state.patientUhid,
        taskId: task.id,
        atMs: dayAtMs,
        details: `${order.drugName} ${order.dose} ${order.route} scheduled for ${hhmm}.`,
      });
    }
  }
  state.doses.sort((a, b) => a.scheduledAtMs - b.scheduledAtMs);
  if (created.length > 0) persist("dose-schedule-created");
  return { ok: true, created, skipped };
}

export function doseTasksFor(uhid: string): DoseTask[] {
  return [...(wardPatientState(uhid)?.doses ?? [])];
}

/** Pending (not yet given/held/refused) dose count — the ward badge counter. */
export function pendingDoseCount(uhid: string): number {
  return (wardPatientState(uhid)?.doses ?? []).filter((task) => task.status === "SCHEDULED").length;
}

/**
 * MAR compliance for one local calendar day. Slots marked not_due_admitted_later
 * are not due and are not missed: day-1 compliance is given/due among the rest.
 */
export function marComplianceForDay(uhid: string, dayMs: number): { given: number; due: number } {
  const doses = wardPatientState(uhid)?.doses ?? [];
  const day = new Date(dayMs);
  const slots = doses.filter((task) => {
    if (task.status === "not_due_admitted_later") return false;
    const at = new Date(task.scheduledAtMs);
    return at.getFullYear() === day.getFullYear() && at.getMonth() === day.getMonth() && at.getDate() === day.getDate();
  });
  return { given: slots.filter((task) => task.status === "GIVEN").length, due: slots.length };
}

// ---------------------------------------------------------------------------
// Dose execution (GIVE / HOLD / REFUSE) — the ward never changes a dose
// ---------------------------------------------------------------------------

function findDoseTask(taskId: string): DoseTask | undefined {
  for (const state of patients.values()) {
    const task = state.doses.find((candidate) => candidate.id === taskId);
    if (task) return task;
  }
  return undefined;
}

function noteEscalation(event: WardEscalationEvent, before: string, after: string, actor: string, role: string, atMs: number, reason?: string): void {
  event.statusTrail = [...(event.statusTrail ?? []), { before, after, actor, role, at: new Date(atMs).toISOString(), ...(reason ? { reason } : {}) }];
}

function resolveEscalationFor(taskId: string, atMs: number, by: string, action: string, role = "ward"): void {
  const open = escalations.find((entry) => entry.taskId === taskId && !entry.resolvedAtMs);
  if (!open) return;
  noteEscalation(open, open.escalatedToCharge ? "escalated" : "open", "resolved", by, role, atMs, action);
  open.resolvedAtMs = atMs;
  open.resolvedBy = by;
  open.resolvedAction = action;
  pushLog({
    kind: "ESCALATION_RESOLVED",
    patientUhid: open.patientUhid,
    taskId,
    atMs,
    details: `${open.taskLabel} resolved by ${by} (${action}). Repeats stopped.`,
  });
}

export function administerDoseTask(
  taskId: string,
  nurse: { name: string; role: string },
  atMs: number = Date.now(),
): { ok: true; task: DoseTask; log: WardSafetyLogEntry } | { ok: false; error: string } {
  const task = findDoseTask(taskId);
  if (!task) return { ok: false, error: "DOSE_TASK_NOT_FOUND" };
  if (task.status === "GIVEN") return { ok: false, error: "ALREADY_GIVEN" };
  const before = task.status;
  task.status = "GIVEN";
  task.statusLabel = undefined;
  recordDoseStatusChange(task, before, nurse, atMs);
  task.administeredBy = nurse.name;
  task.administeredAt = new Date(atMs).toISOString();
  task.reason = undefined;
  resolveEscalationFor(taskId, atMs, nurse.name, "given", nurse.role);
  const entry = pushLog({
    kind: "DOSE_ADMINISTERED",
    patientUhid: task.patientUhid,
    taskId,
    atMs,
    details: `${task.drugName} ${task.dose} ${task.route} given by ${nurse.name} (${nurse.role}) at ${new Date(atMs).toISOString()}.`,
  });
  persist("dose-given");
  return { ok: true, task: { ...task }, log: entry };
}

export function holdDoseTask(
  taskId: string,
  nurse: { name: string; role: string },
  reason: string,
  atMs: number = Date.now(),
): { ok: true; task: DoseTask; log: WardSafetyLogEntry } | { ok: false; error: string } {
  const task = findDoseTask(taskId);
  if (!task) return { ok: false, error: "DOSE_TASK_NOT_FOUND" };
  if (task.status === "GIVEN") return { ok: false, error: "ALREADY_GIVEN: a given dose cannot be changed to held." };
  if (!reason.trim()) return { ok: false, error: "A reason is required to hold a dose." };
  const before = task.status;
  task.status = "HELD";
  task.statusLabel = undefined;
  recordDoseStatusChange(task, before, nurse, atMs, reason.trim());
  task.reason = reason.trim();
  task.administeredBy = nurse.name;
  task.administeredAt = new Date(atMs).toISOString();
  resolveEscalationFor(taskId, atMs, nurse.name, "held", nurse.role);
  const entry = pushLog({
    kind: "DOSE_HELD",
    patientUhid: task.patientUhid,
    taskId,
    atMs,
    details: `${task.drugName} ${task.dose} ${task.route} held by ${nurse.name}: ${reason.trim()}.`,
  });
  persist("dose-held");
  return { ok: true, task: { ...task }, log: entry };
}

export function refuseDoseTask(
  taskId: string,
  nurse: { name: string; role: string },
  reason: string,
  atMs: number = Date.now(),
): { ok: true; task: DoseTask; log: WardSafetyLogEntry } | { ok: false; error: string } {
  const task = findDoseTask(taskId);
  if (!task) return { ok: false, error: "DOSE_TASK_NOT_FOUND" };
  if (task.status === "GIVEN") return { ok: false, error: "ALREADY_GIVEN: a given dose cannot be changed to refused." };
  if (!reason.trim()) return { ok: false, error: "A reason is required to record a refused dose." };
  const before = task.status;
  task.status = "REFUSED";
  task.statusLabel = undefined;
  recordDoseStatusChange(task, before, nurse, atMs, reason.trim());
  task.reason = reason.trim();
  task.administeredBy = nurse.name;
  task.administeredAt = new Date(atMs).toISOString();
  resolveEscalationFor(taskId, atMs, nurse.name, "refused", nurse.role);
  const entry = pushLog({
    kind: "DOSE_REFUSED",
    patientUhid: task.patientUhid,
    taskId,
    atMs,
    details: `${task.drugName} ${task.dose} ${task.route} refused — ${reason.trim()} (recorded by ${nurse.name}).`,
  });
  persist("dose-refused");
  return { ok: true, task: { ...task }, log: entry };
}

// ---------------------------------------------------------------------------
// Vitals: due timers, trends, classification, Level-3
// ---------------------------------------------------------------------------

export function vitalsIntervalMinutesFor(state: WardPatientState): number {
  return state.icuMode ? config.icuVitalsIntervalMinutes : state.vitalsIntervalMinutes;
}

export function vitalsDueState(uhid: string, nowMs: number = Date.now()): { dueAtMs?: number; overdue: boolean; dueInMs?: number; overdueMs?: number } {
  const state = wardPatientState(uhid);
  if (!state?.vitalsDueAtMs) return { overdue: false };
  const dueAtMs = state.vitalsDueAtMs;
  return {
    dueAtMs,
    overdue: nowMs > dueAtMs,
    dueInMs: Math.max(0, dueAtMs - nowMs),
    overdueMs: nowMs > dueAtMs ? nowMs - dueAtMs : undefined,
  };
}

/** R5-02 Risk Radar thresholds — single source of truth for the breach check. */
export function vitalsThresholdFindings(input: WardVitalsInput): CriticalFinding[] {
  const t = CLINICAL_INGRESS_THRESHOLDS;
  const findings: CriticalFinding[] = [];
  if (input.bpSystolic < t.high.systolicBpLessThan) {
    findings.push({
      ruleId: "sbp-low",
      analyte: "Systolic BP",
      value: input.bpSystolic,
      threshold: t.high.systolicBpLessThan,
      unit: "mmHg",
      condition: "lessThan",
      message: `Systolic BP ${input.bpSystolic} mmHg (below ${t.high.systolicBpLessThan}) — confirm with doctor.`,
    });
  }
  if (input.spo2 < t.high.spo2LessThan) {
    findings.push({
      ruleId: "spo2-low",
      analyte: "SpO2",
      value: input.spo2,
      threshold: t.high.spo2LessThan,
      unit: "%",
      condition: "lessThan",
      message: `SpO2 ${input.spo2}% (below ${t.high.spo2LessThan}%) — confirm with doctor.`,
    });
  }
  if (input.rr > t.high.respiratoryRateGreaterThan) {
    findings.push({
      ruleId: "rr-high",
      analyte: "Respiratory rate",
      value: input.rr,
      threshold: t.high.respiratoryRateGreaterThan,
      unit: "/min",
      condition: "greaterThan",
      message: `Respiratory rate ${input.rr}/min (above ${t.high.respiratoryRateGreaterThan}) — confirm with doctor.`,
    });
  }
  if (input.hr > t.borderline.heartRateGreaterThan) {
    findings.push({
      ruleId: "hr-high",
      analyte: "Pulse",
      value: input.hr,
      threshold: t.borderline.heartRateGreaterThan,
      unit: "bpm",
      condition: "greaterThan",
      message: `Pulse ${input.hr} bpm (above ${t.borderline.heartRateGreaterThan}) — confirm with doctor.`,
    });
  }
  if (input.temp > t.borderline.temperatureFGreaterThan) {
    findings.push({
      ruleId: "temp-high",
      analyte: "Temperature",
      value: input.temp,
      threshold: t.borderline.temperatureFGreaterThan,
      unit: "°F",
      condition: "greaterThan",
      message: `Temperature ${input.temp}°F (above ${t.borderline.temperatureFGreaterThan}) — confirm with doctor.`,
    });
  }
  return findings;
}

/**
 * Rules-based Improving / Stable / Deteriorating. Directional deltas plus
 * threshold crossings; two worsening signals (or a crossing of the R5-02 high
 * SBP/SpO2 line) mean Deteriorating. Never an LLM.
 */
export function classifyVitalsTrend(
  current: WardVitalsInput,
  previous: WardVitalsInput | undefined,
): { status: VitalsTrendStatus; reason: string } {
  if (!previous) {
    const emergencyBreach = current.bpSystolic < CLINICAL_INGRESS_THRESHOLDS.high.systolicBpLessThan || current.spo2 < CLINICAL_INGRESS_THRESHOLDS.high.spo2LessThan;
    return emergencyBreach
      ? { status: "Deteriorating", reason: "First reading already breaches the Risk Radar threshold." }
      : { status: "Stable", reason: "First recorded reading — no trend yet." };
  }
  const worsening: string[] = [];
  const improving: string[] = [];

  if (current.hr >= previous.hr + 10) worsening.push(`pulse ${previous.hr}→${current.hr}`);
  else if (current.hr <= previous.hr - 10) improving.push(`pulse ${previous.hr}→${current.hr}`);
  if (current.hr > CLINICAL_INGRESS_THRESHOLDS.borderline.heartRateGreaterThan && previous.hr <= CLINICAL_INGRESS_THRESHOLDS.borderline.heartRateGreaterThan) {
    if (!worsening.some((w) => w.startsWith("pulse"))) worsening.push(`pulse crossed ${CLINICAL_INGRESS_THRESHOLDS.borderline.heartRateGreaterThan} (now ${current.hr})`);
  }

  if (current.bpSystolic <= previous.bpSystolic - 20) worsening.push(`systolic BP ${previous.bpSystolic}→${current.bpSystolic}`);
  else if (current.bpSystolic >= previous.bpSystolic + 20) improving.push(`systolic BP ${previous.bpSystolic}→${current.bpSystolic}`);
  const sbpLine = CLINICAL_INGRESS_THRESHOLDS.high.systolicBpLessThan;
  if (current.bpSystolic < sbpLine && previous.bpSystolic >= sbpLine) {
    if (!worsening.some((w) => w.startsWith("systolic"))) worsening.push(`systolic BP fell below ${sbpLine} (now ${current.bpSystolic})`);
  }

  if (current.spo2 <= previous.spo2 - 3) worsening.push(`SpO2 ${previous.spo2}→${current.spo2}`);
  else if (current.spo2 >= previous.spo2 + 3) improving.push(`SpO2 ${previous.spo2}→${current.spo2}`);
  const spo2Line = CLINICAL_INGRESS_THRESHOLDS.high.spo2LessThan;
  if (current.spo2 < spo2Line && previous.spo2 >= spo2Line) {
    if (!worsening.some((w) => w.startsWith("SpO2"))) worsening.push(`SpO2 fell below ${spo2Line}% (now ${current.spo2})`);
  }

  if (current.rr >= previous.rr + 4) worsening.push(`respiratory rate ${previous.rr}→${current.rr}`);
  else if (current.rr <= previous.rr - 4) improving.push(`respiratory rate ${previous.rr}→${current.rr}`);

  if (current.temp >= previous.temp + 1) worsening.push(`temperature ${previous.temp}→${current.temp}`);
  else if (current.temp <= previous.temp - 1) improving.push(`temperature ${previous.temp}→${current.temp}`);

  if (worsening.length >= 2) return { status: "Deteriorating", reason: `${worsening.join("; ")}.` };
  if (improving.length >= 2 && worsening.length === 0) return { status: "Improving", reason: `${improving.join("; ")}.` };
  return { status: "Stable", reason: "No significant change across vitals." };
}

export interface RecordVitalsOutcome {
  ok: true;
  reading: WardVitalsReading;
  classification: VitalsClassification;
  thresholdFindings: CriticalFinding[];
  alert?: CriticalAlertView;
  log: WardSafetyLogEntry[];
}

export function recordWardVitalsReading(
  profile: WardPatientProfile,
  input: WardVitalsInput,
  recordedBy: string,
  role: string,
  atMs: number = Date.now(),
): RecordVitalsOutcome | { ok: false; error: string } {
  const state = ensureWardPatient(profile);
  const previous = state.readings[state.readings.length - 1];
  const reading: WardVitalsReading = {
    id: nextId("vit"),
    patientUhid: state.patientUhid,
    ...input,
    recordedBy: recordedBy.trim() || "Ward nurse",
    role: role.trim() || "ward",
    at: new Date(atMs).toISOString(),
    atMs,
  };
  state.readings.push(reading);

  const trend = classifyVitalsTrend(input, previous);
  const classification: VitalsClassification = { ...trend, at: reading.at, atMs };
  state.lastClassification = classification;

  // The next vitals check is due one interval from THIS reading.
  state.vitalsDueAtMs = atMs + vitalsIntervalMinutesFor(state) * 60 * 1000;

  // A recorded reading resolves any open missed-vitals escalation.
  const openVitalsEscalation = escalations.find((entry) => entry.patientUhid === state.patientUhid && entry.kind === "VITALS" && !entry.resolvedAtMs);
  if (openVitalsEscalation) {
    resolveEscalationFor(openVitalsEscalation.taskId, atMs, recordedBy, "vitals recorded", "ward");
  }

  const entries: WardSafetyLogEntry[] = [];
  entries.push(pushLog({
    kind: "VITALS_UPDATED",
    patientUhid: state.patientUhid,
    atMs,
    details: `Vitals recorded by ${reading.recordedBy}: BP ${input.bpSystolic}/${input.bpDiastolic}, HR ${input.hr}, SpO2 ${input.spo2}%, RR ${input.rr}, temp ${input.temp}°F — ${classification.status} (${classification.reason})`,
  }));

  const thresholdFindings = vitalsThresholdFindings(input);
  let alert: CriticalAlertView | undefined;
  if (classification.status === "Deteriorating" && thresholdFindings.length > 0) {
    alert = raiseVitalsCriticalAlert({
      patientUhid: state.patientUhid,
      patientName: state.patientName,
      findings: thresholdFindings,
      raisedBy: reading.recordedBy,
      raisedByRole: role,
      at: reading.at,
    });
    entries.push(pushLog({
      kind: "ESCALATED_TO_CHARGE",
      patientUhid: state.patientUhid,
      atMs,
      details: `Deteriorating + threshold breach — Level-3 alert ${alert.id} raised for the doctor.`,
    }));
  }

  persist("vitals-reading-recorded");
  return { ok: true, reading, classification, thresholdFindings, alert, log: entries };
}

// ---------------------------------------------------------------------------
// Missed-task escalation (Level 2 -> repeat -> charge nurse/doctor)
// ---------------------------------------------------------------------------

/**
 * Pure escalation math. repeats = 1 the moment the task passes its due time,
 * then +1 per repeat window (default 15 min). Escalated when repeats reach
 * the configured cap.
 */
export function escalationStateForDue(
  dueAtMs: number,
  resolved: boolean,
  nowMs: number,
  level2Config: { repeatMs: number; escalateAfterRepeats: number } = config.level2,
): WardEscalationState {
  if (resolved || nowMs <= dueAtMs) {
    return { overdue: false, overdueMs: 0, repeats: 0, escalated: false, nextRepeatAtMs: dueAtMs + level2Config.repeatMs };
  }
  const overdueMs = nowMs - dueAtMs;
  // 1 at the moment the task passes its due time, +1 per 15-min repeat window.
  const repeats = Math.floor(overdueMs / Math.max(1, level2Config.repeatMs)) + 1;
  return {
    overdue: true,
    overdueMs,
    repeats,
    escalated: repeats >= level2Config.escalateAfterRepeats,
    nextRepeatAtMs: dueAtMs + repeats * level2Config.repeatMs,
  };
}

export function doseEscalationStateFor(taskId: string, nowMs: number = Date.now()): WardEscalationState | undefined {
  const task = findDoseTask(taskId);
  if (!task) return undefined;
  return escalationStateForDue(task.scheduledAtMs, task.status !== "SCHEDULED", nowMs);
}

export function vitalsEscalationStateFor(uhid: string, nowMs: number = Date.now()): WardEscalationState | undefined {
  const state = wardPatientState(uhid);
  if (!state?.vitalsDueAtMs) return undefined;
  const open = escalations.find((entry) => entry.patientUhid === uhid && entry.kind === "VITALS" && !entry.resolvedAtMs);
  if (open) return escalationStateForDue(open.raisedAtMs, false, nowMs);
  return escalationStateForDue(state.vitalsDueAtMs, false, nowMs);
}

function findOpenEscalation(taskId: string, patientUhid: string, kind: "DOSE" | "VITALS"): WardEscalationEvent | undefined {
  return escalations.find((entry) => entry.taskId === taskId && entry.patientUhid === patientUhid && entry.kind === kind && !entry.resolvedAtMs);
}

/**
 * Tick the escalation clock. Returns what happened since the last tick so the
 * caller can beep / highlight / log. Pure with respect to nowMs.
 */
export function pollWardEscalations(
  nowMs: number = Date.now(),
  opts: { boot?: boolean } = {},
): { beeps: WardEscalationEvent[]; escalatedNow: WardEscalationEvent[]; entries: WardSafetyLogEntry[] } {
  const beeps: WardEscalationEvent[] = [];
  const escalatedNow: WardEscalationEvent[] = [];
  const entries: WardSafetyLogEntry[] = [];

  for (const state of patients.values()) {
    // Vitals timer
    if (state.vitalsDueAtMs) {
      const dueState = escalationStateForDue(state.vitalsDueAtMs, false, nowMs);
      if (dueState.overdue) {
        const existing = findOpenEscalation(`vitals-${state.patientUhid}`, state.patientUhid, "VITALS");
        if (!existing) {
          const event: WardEscalationEvent = {
            id: nextId("esc"),
            patientUhid: state.patientUhid,
            patientName: state.patientName,
            kind: "VITALS",
            taskId: `vitals-${state.patientUhid}`,
            taskLabel: `Vitals check for ${state.patientName ?? state.patientUhid}`,
            raisedAtMs: state.vitalsDueAtMs,
            level: 2,
            lastRepeatMs: nowMs,
            repeats: dueState.repeats,
            escalatedToCharge: false,
            ...(opts.boot ? { firedLate: true } : {}),
            statusTrail: [{ before: "due", after: "open", actor: "ward-timer", role: "system", at: new Date(nowMs).toISOString(), ...(opts.boot ? { reason: "Timer fell due while AstraAPI was down" } : {}) }],
          };
          escalations.push(event);
          entries.push(pushLog({
            kind: "LEVEL2_RAISED",
            patientUhid: state.patientUhid,
            taskId: event.taskId,
            atMs: nowMs,
            details: `Vitals check overdue — Level 2 raised.`,
          }));
          beeps.push(event);
        } else if (dueState.repeats > existing.repeats) {
          existing.repeats = dueState.repeats;
          existing.lastRepeatMs = nowMs;
          const escalated = dueState.repeats >= config.level2.escalateAfterRepeats;
          if (escalated && !existing.escalatedToCharge) {
            existing.escalatedToCharge = true;
            noteEscalation(existing, "open", "escalated", "ward-timer", "system", nowMs);
            escalatedNow.push(existing);
            entries.push(pushLog({
              kind: "ESCALATED_TO_CHARGE",
              patientUhid: state.patientUhid,
              taskId: existing.taskId,
              atMs: nowMs,
              details: `${existing.taskLabel} escalated to charge nurse / doctor after ${existing.repeats} repeats.`,
            }));
          } else {
            entries.push(pushLog({
              kind: "LEVEL2_REPEAT",
              patientUhid: state.patientUhid,
              taskId: existing.taskId,
              atMs: nowMs,
              details: `${existing.taskLabel} still overdue — repeat ${existing.repeats}.`,
            }));
          }
          beeps.push(existing);
        }
      }
    }

    // Dose tasks
    for (const task of state.doses) {
      if (task.status !== "SCHEDULED") continue;
      const dueState = escalationStateForDue(task.scheduledAtMs, false, nowMs);
      if (!dueState.overdue) continue;
      const existing = findOpenEscalation(task.id, state.patientUhid, "DOSE");
      if (!existing) {
        const event: WardEscalationEvent = {
          id: nextId("esc"),
          patientUhid: state.patientUhid,
          patientName: state.patientName,
          kind: "DOSE",
          taskId: task.id,
          taskLabel: `${task.drugName} ${task.dose} (${task.route})`,
          raisedAtMs: task.scheduledAtMs,
          level: 2,
          lastRepeatMs: nowMs,
          repeats: dueState.repeats,
          escalatedToCharge: false,
          ...(opts.boot ? { firedLate: true } : {}),
            statusTrail: [{ before: "due", after: "open", actor: "ward-timer", role: "system", at: new Date(nowMs).toISOString(), ...(opts.boot ? { reason: "Timer fell due while AstraAPI was down" } : {}) }],
        };
        escalations.push(event);
        entries.push(pushLog({
          kind: "LEVEL2_RAISED",
          patientUhid: state.patientUhid,
          taskId: task.id,
          atMs: nowMs,
          details: `${event.taskLabel} overdue — Level 2 raised.`,
        }));
        beeps.push(event);
      } else if (dueState.repeats > existing.repeats) {
        existing.repeats = dueState.repeats;
        existing.lastRepeatMs = nowMs;
        const escalated = dueState.repeats >= config.level2.escalateAfterRepeats;
        if (escalated && !existing.escalatedToCharge) {
          existing.escalatedToCharge = true;
            noteEscalation(existing, "open", "escalated", "ward-timer", "system", nowMs);
          escalatedNow.push(existing);
          entries.push(pushLog({
            kind: "ESCALATED_TO_CHARGE",
            patientUhid: state.patientUhid,
            taskId: existing.taskId,
            atMs: nowMs,
            details: `${existing.taskLabel} escalated to charge nurse / doctor after ${existing.repeats} repeats.`,
          }));
        } else {
          entries.push(pushLog({
            kind: "LEVEL2_REPEAT",
            patientUhid: state.patientUhid,
            taskId: existing.taskId,
            atMs: nowMs,
            details: `${existing.taskLabel} still overdue — repeat ${existing.repeats}.`,
          }));
        }
        beeps.push(existing);
      }
    }
  }

  if (entries.length > 0) persist("escalation-polled");
  return { beeps, escalatedNow, entries };
}

/** Charge nurse / doctor view: unresolved escalations that reached the cap. */
export function escalatedWardTasks(nowMs: number = Date.now()): WardEscalationEvent[] {
  void pollWardEscalations(nowMs);
  return escalations.filter((entry) => entry.escalatedToCharge && !entry.resolvedAtMs).map((entry) => ({ ...entry }));
}

export function listWardEscalations(uhid?: string): WardEscalationEvent[] {
  return escalations
    .filter((entry) => !uhid || entry.patientUhid === uhid)
    .map((entry) => ({ ...entry }));
}

// ---------------------------------------------------------------------------
// SBAR handover + unit summary
// ---------------------------------------------------------------------------

function pendingDoseTasks(state: WardPatientState, nowMs: number): DoseTask[] {
  return state.doses.filter((task) => task.status === "SCHEDULED");
}

function givenDoseCount(state: WardPatientState): number {
  return state.doses.filter((task) => task.status === "GIVEN").length;
}

function heldDoseCount(state: WardPatientState): number {
  return state.doses.filter((task) => task.status === "HELD").length;
}

export function createWardSbarDraft(
  uhid: string,
  input: { shiftLabel?: string; nowMs?: number; openAlertMessages?: string[] } = {},
): { ok: true; handover: SbarHandover } | { ok: false; error: string } {
  const state = wardPatientState(uhid);
  if (!state) return { ok: false, error: "PATIENT_NOT_SCHEDULED" };
  const nowMs = input.nowMs ?? Date.now();
  const hour = new Date(nowMs).getHours();
  const shiftLabel = input.shiftLabel?.trim() || shiftLabelFor(hour);
  const latest = state.readings[state.readings.length - 1];
  const classification = state.lastClassification;
  const pending = pendingDoseTasks(state, nowMs);
  const due = vitalsDueState(uhid, nowMs);
  const openEscalations = escalations.filter((entry) => entry.patientUhid === uhid && !entry.resolvedAtMs);
  const alertLines = (input.openAlertMessages ?? []).map((message) => `  - ${message}`);

  const situation = latest
    ? `${state.patientName ?? uhid} (${uhid}), ${state.bedNumber ?? state.wardName ?? "ward"} — ${classification?.status ?? "no trend"}. Latest vitals: BP ${latest.bpSystolic}/${latest.bpDiastolic} mmHg, pulse ${latest.hr}/min, SpO2 ${latest.spo2}%, RR ${latest.rr}/min, temp ${latest.temp}°F (recorded ${latest.at}).`
    : `${state.patientName ?? uhid} (${uhid}), ${state.bedNumber ?? state.wardName ?? "ward"} — no vitals recorded yet.`;

  const background = `In ${state.wardName ?? "ward"}${state.bedNumber ? ` (bed ${state.bedNumber})` : ""} — ${state.diagnosis ?? "Admitted patient"}${state.icuMode ? " (ICU mode)" : ""}. ${state.readings.length} vitals reading(s) this stay; ${state.doses.length} scheduled dose task(s): ${givenDoseCount(state)} given, ${heldDoseCount(state)} held.${state.allergies?.length ? ` Allergies: ${state.allergies.join(", ")}.` : ""}`;

  const assessmentParts: string[] = [];
  if (classification) assessmentParts.push(`Trend: ${classification.status} — ${classification.reason}`);
  if (alertLines.length) assessmentParts.push(`Open Level-3 alert(s):\n${alertLines.join("\n")}`);
  else assessmentParts.push("No open Level-3 critical alerts.");
  if (openEscalations.length) assessmentParts.push(`Missed-task escalations open: ${openEscalations.map((e) => e.taskLabel).join("; ")}.`);
  const assessment = assessmentParts.join(" ");

  const recommendationParts: string[] = [];
  if (pending.length) {
    recommendationParts.push(`Give or hold the pending doses: ${pending.map((task) => `${task.drugName} ${task.dose} at ${new Date(task.scheduledAtMs).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`).join("; ")}.`);
  }
  if (due.dueAtMs) {
    recommendationParts.push(due.overdue
      ? "Vitals check is OVERDUE — record vitals now."
      : `Next vitals due at ${new Date(due.dueAtMs).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.`);
  }
  if (openEscalations.some((e) => e.escalatedToCharge)) recommendationParts.push("Escalated tasks need charge nurse / doctor attention.");
  recommendationParts.push("Continue current doctor orders unchanged — the handover never changes orders.");
  const recommendation = recommendationParts.join(" ");

  const handover: SbarHandover = {
    id: nextId("sbar"),
    patientUhid: uhid,
    patientName: state.patientName,
    shiftLabel,
    createdAt: new Date(nowMs).toISOString(),
    createdAtMs: nowMs,
    draft: { situation, background, assessment, recommendation },
    edits: [],
    statusTrail: [{ before: "none", after: "draft", actor: "ward", role: "system", at: new Date(nowMs).toISOString() }],
  };
  sbarList.push(handover);
  pushLog({
    kind: "SBAR_DRAFTED",
    patientUhid: uhid,
    atMs: nowMs,
    details: `SBAR draft created for the ${shiftLabel} shift.`,
  });
  persist("sbar-created");
  return { ok: true, handover: { ...handover, draft: { ...handover.draft } } };
}

export function updateWardSbarDraft(
  handoverId: string,
  draft: SbarDraft,
  editor: { name: string; role: string },
  atMs: number = Date.now(),
): { ok: true; handover: SbarHandover } | { ok: false; error: string } {
  const handover = sbarList.find((entry) => entry.id === handoverId);
  if (!handover) return { ok: false, error: "SBAR_NOT_FOUND" };
  if (handover.signedBy) return { ok: false, error: "SBAR_SIGNED: edit before signing." };
  handover.draft = {
    situation: String(draft.situation ?? ""),
    background: String(draft.background ?? ""),
    assessment: String(draft.assessment ?? ""),
    recommendation: String(draft.recommendation ?? ""),
  };
  handover.edits.push({ at: new Date(atMs).toISOString(), by: editor.name, role: editor.role });
  pushLog({
    kind: "SBAR_EDITED",
    patientUhid: handover.patientUhid,
    atMs,
    details: `SBAR ${handover.id} edited by ${editor.name} (${editor.role}).`,
  });
  persist("sbar-amended");
  return { ok: true, handover: { ...handover } };
}

export function signWardSbar(
  handoverId: string,
  nurse: { name: string; role: string },
  atMs: number = Date.now(),
): { ok: true; handover: SbarHandover } | { ok: false; error: string } {
  const handover = sbarList.find((entry) => entry.id === handoverId);
  if (!handover) return { ok: false, error: "SBAR_NOT_FOUND" };
  if (handover.signedBy) return { ok: false, error: "SBAR_ALREADY_SIGNED" };
  handover.signedBy = nurse.name;
  handover.signedAt = new Date(atMs).toISOString();
  handover.statusTrail = [...(handover.statusTrail ?? []), { before: "draft", after: "signed", actor: nurse.name, role: nurse.role, at: handover.signedAt }];
  pushLog({
    kind: "SBAR_SIGNED",
    patientUhid: handover.patientUhid,
    atMs,
    details: `SBAR ${handover.id} signed by outgoing nurse ${nurse.name} (${nurse.role}).`,
  });
  persist("sbar-signed");
  return { ok: true, handover: { ...handover } };
}

export function acknowledgeWardSbar(
  handoverId: string,
  nurse: { name: string; role: string },
  atMs: number = Date.now(),
): { ok: true; handover: SbarHandover } | { ok: false; error: string } {
  const handover = sbarList.find((entry) => entry.id === handoverId);
  if (!handover) return { ok: false, error: "SBAR_NOT_FOUND" };
  if (!handover.signedBy) return { ok: false, error: "SBAR_NOT_SIGNED: the outgoing nurse must sign before acknowledgment." };
  if (handover.acknowledgedBy) return { ok: false, error: "SBAR_ALREADY_ACKNOWLEDGED" };
  handover.acknowledgedBy = nurse.name;
  handover.acknowledgedAt = new Date(atMs).toISOString();
  handover.statusTrail = [...(handover.statusTrail ?? []), { before: "signed", after: "acknowledged", actor: nurse.name, role: nurse.role, at: handover.acknowledgedAt }];
  pushLog({
    kind: "SBAR_ACKNOWLEDGED",
    patientUhid: handover.patientUhid,
    atMs,
    details: `SBAR ${handover.id} acknowledged by incoming nurse ${nurse.name} (${nurse.role}).`,
  });
  persist("sbar-acknowledged");
  return { ok: true, handover: { ...handover } };
}

export function listWardSbar(uhid?: string): SbarHandover[] {
  return sbarList
    .filter((entry) => !uhid || entry.patientUhid === uhid)
    .map((entry) => ({ ...entry, draft: { ...entry.draft }, edits: [...entry.edits] }));
}

/**
 * Unit summary, always in the mandated order: critical safety (1),
 * tasks & stock (2), staff motivation (3). A 60-second read.
 */
export function buildWardUnitSummary(input: {
  shiftLabel: string;
  nowMs?: number;
  criticalItems: string[];
  taskItems: string[];
  stockItems: string[];
}): UnitSummary {
  const nowMs = input.nowMs ?? Date.now();
  const critical = input.criticalItems.length ? input.criticalItems.join(" ") : "No open critical safety items this shift.";
  const tasks = input.taskItems.length ? input.taskItems.join(" ") : "No pending tasks or stock concerns.";
  const stock = input.stockItems.length ? ` Stock: ${input.stockItems.join(" ")}` : "";
  const motivation = [
    "Thank you to the team for clear, timely documentation — every logged dose and vitals entry keeps our patients safe.",
    "Reminder: handover notes are for safety, not for scoring. Keep them factual and kind.",
  ][Math.floor(nowMs / (1000 * 60 * 60 * 12)) % 2];
  const summary: UnitSummary = {
    id: nextId("usum"),
    shiftLabel: input.shiftLabel,
    createdAt: new Date(nowMs).toISOString(),
    createdAtMs: nowMs,
    sections: [
      { order: 1, title: "Critical safety first", text: critical },
      { order: 2, title: "Tasks & stock", text: `${tasks}${stock}` },
      { order: 3, title: "Staff motivation", text: motivation },
    ],
    readSeconds: 60,
  };
  summaries.push(summary);
  pushLog({
    kind: "UNIT_SUMMARY_CREATED",
    patientUhid: "",
    atMs: nowMs,
    details: `Unit summary created for the ${input.shiftLabel} shift (60-second read).`,
  });
  persist("unit-summary-created");
  return summary;
}

export function listWardUnitSummaries(): UnitSummary[] {
  return summaries.map((entry) => ({ ...entry, sections: [...entry.sections] }));
}

// ---------------------------------------------------------------------------
// Log
// ---------------------------------------------------------------------------

export function listWardSafetyLog(uhid?: string): WardSafetyLogEntry[] {
  return log
    .filter((entry) => !uhid || entry.patientUhid === uhid)
    .map((entry) => ({ ...entry }));
}
