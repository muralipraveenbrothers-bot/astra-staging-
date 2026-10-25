/**
 * R5-07 ward nursing safety board.
 * Server-authoritative: all decisions happen in the wardSafety engine behind
 * /api/ward/*. This component only renders, beeps (Level 2 double beep) and
 * calls the API. Night mode (22:00-06:00) suppresses routine sounds — the
 * reminders are logged silently on screen instead; Level-3 alerts still sound
 * through the existing R5-06 CriticalAlertBanner. Non-punitive wording only.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, BellRing, ClipboardCheck, Clock, HeartPulse, Moon, Pill, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { hospitalAudio } from "@/utils/audioAlerts";
import {
  acknowledgeWardSbar,
  buildWardSchedule,
  createWardSbarDraft,
  createWardUnitSummary,
  executeWardDose,
  fetchWardBoard,
  fetchWardSbar,
  recordWardVitals,
  saveWardSbarDraft,
  setWardPatientConfig,
  signWardSbar,
  type WardBoard,
  type WardBoardPatient,
  type WardSbarState,
} from "@/astra/clinical/ward/wardClient";
import type { SbarHandover } from "@/astra/clinical/ward/wardSafety";

const POLL_MS = 5000;
const UPCOMING_WINDOW_MS = 30 * 60 * 1000;

interface ScreenLogEntry {
  atMs: number;
  text: string;
  suppressed: boolean;
}

function localTime(atMs: number): string {
  return new Date(atMs).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function Sparkline({ values, color, label }: { values: number[]; color: string; label: string }) {
  if (values.length < 2) {
    return (
      <div className="flex items-center justify-between text-[10px] text-slate-500">
        <span>{label}</span>
        <span className="font-mono">{values[0] ?? "—"}</span>
      </div>
    );
  }
  const w = 64;
  const h = 18;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(h - 3 - ((v - min) / span) * (h - 6)).toFixed(1)}`)
    .join(" ");
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-11 shrink-0 text-[10px] text-slate-400">{label}</span>
      <svg width={w} height={h} className="shrink-0 overflow-visible">
        <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <span className="font-mono text-[10px] text-slate-300">{values[values.length - 1]}</span>
    </div>
  );
}

function classificationChip(patient: WardBoardPatient) {
  const status = patient.lastClassification?.status;
  if (!status) return <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-400">No trend yet</span>;
  if (status === "Deteriorating") return <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300 border border-rose-500/40">Deteriorating</span>;
  if (status === "Improving") return <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/40">Improving</span>;
  return <span className="rounded-full bg-slate-700/40 px-2 py-0.5 text-[10px] font-bold text-slate-300 border border-slate-600/50">Stable</span>;
}

const EMPTY_VITALS = { hr: "", bpSystolic: "", bpDiastolic: "", temp: "", rr: "", spo2: "" };

function WardPatientCard({
  patient,
  accountRole,
  onAction,
  nightMode,
}: {
  patient: WardBoardPatient;
  accountRole: string;
  onAction: (label: string) => void;
  nightMode: boolean;
}) {
  const [busy, setBusy] = useState("");
  const [holdFor, setHoldFor] = useState<string | null>(null); // taskId being held
  const [refuseFor, setRefuseFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [vitals, setVitals] = useState<Record<string, string>>({ ...EMPTY_VITALS });
  const [editingSbar, setEditingSbar] = useState<SbarHandover | null>(null);

  const canAct = ["ward", "doctor", "admin"].includes(accountRole.toLowerCase());

  async function runDose(taskId: string, action: "given" | "held" | "refused", reasonText = "") {
    setBusy(taskId);
    const result = await executeWardDose(taskId, action, reasonText);
    setBusy("");
    if (!result.ok) {
      toast.error(`Dose ${action} failed`, { description: result.error });
      return;
    }
    toast.success(`Dose ${action} logged`);
    setHoldFor(null);
    setRefuseFor(null);
    setReason("");
    onAction(`${action} logged for ${patient.name ?? patient.uhid}`);
  }

  async function submitVitals() {
    const values = {
      hr: Number(vitals.hr),
      bpSystolic: Number(vitals.bpSystolic),
      bpDiastolic: Number(vitals.bpDiastolic),
      temp: Number(vitals.temp),
      rr: Number(vitals.rr),
      spo2: Number(vitals.spo2),
    };
    if (Object.values(values).some((v) => !Number.isFinite(v))) {
      toast.error("Complete all vitals fields with numbers.");
      return;
    }
    setBusy("vitals");
    const result = await recordWardVitals({ patientUhid: patient.uhid, ...values });
    setBusy("");
    if (!result.ok) {
      toast.error("Vitals not recorded", { description: result.error });
      return;
    }
    toast.success(`Vitals recorded — ${result.classification?.status ?? ""}`, {
      description: result.alert ? "Level-3 critical alert raised for the doctor." : result.classification?.reason,
    });
    setVitals({ ...EMPTY_VITALS });
    onAction(`Vitals recorded for ${patient.name ?? patient.uhid} (${result.classification?.status ?? "Stable"}${nightMode ? " — night mode: logged silently" : ""})`);
    // Level-3 critical alerts always sound - night mode only silences routine reminders.
    if (result.alert) hospitalAudio.playCriticalAlertSound();
  }

  async function draftSbar() {
    setBusy("sbar");
    const result = await createWardSbarDraft(patient.uhid);
    setBusy("");
    if (!result.ok || !result.handover) {
      toast.error("SBAR draft failed", { description: result.error });
      return;
    }
    setEditingSbar(result.handover);
    onAction(`SBAR draft created for ${patient.name ?? patient.uhid}`);
  }

  async function saveSbar() {
    if (!editingSbar) return;
    setBusy("sbar-save");
    const result = await saveWardSbarDraft(editingSbar.id, editingSbar.draft);
    setBusy("");
    if (!result.ok || !result.handover) {
      toast.error("SBAR save failed", { description: result.error });
      return;
    }
    setEditingSbar(result.handover);
    onAction(`SBAR edited for ${patient.name ?? patient.uhid}`);
  }

  async function signSbar() {
    if (!editingSbar) return;
    setBusy("sbar-sign");
    const result = await signWardSbar(editingSbar.id);
    setBusy("");
    if (!result.ok || !result.handover) {
      toast.error("SBAR sign failed", { description: result.error });
      return;
    }
    setEditingSbar(result.handover);
    onAction(`SBAR signed by outgoing nurse for ${patient.name ?? patient.uhid}`);
  }

  async function ackSbar() {
    if (!editingSbar) return;
    setBusy("sbar-ack");
    const result = await acknowledgeWardSbar(editingSbar.id);
    setBusy("");
    if (!result.ok || !result.handover) {
      toast.error("SBAR acknowledgment failed", { description: result.error });
      return;
    }
    setEditingSbar(result.handover);
    onAction(`SBAR acknowledged by incoming nurse for ${patient.name ?? patient.uhid}`);
  }

  async function toggleIcu() {
    const result = await setWardPatientConfig(patient.uhid, { icuMode: !patient.icuMode });
    if (!result.ok) toast.error("ICU mode change failed", { description: result.error });
    else {
      toast.success(patient.icuMode ? "ICU mode off — vitals every 2 h." : "ICU mode on — vitals every 15 min.");
      onAction(`ICU mode ${!patient.icuMode ? "ON (15 min vitals)" : "OFF (2 h vitals)"} for ${patient.name ?? patient.uhid}`);
    }
  }

  async function changeInterval(minutes: number) {
    const result = await setWardPatientConfig(patient.uhid, { vitalsIntervalMinutes: minutes });
    if (!result.ok) toast.error("Interval change failed", { description: result.error });
    else onAction(`Vitals interval set to ${minutes} min for ${patient.name ?? patient.uhid}`);
  }

  const dueInMin = patient.vitalsDueInMs != null ? Math.round(patient.vitalsDueInMs / 60000) : null;
  const latest = patient.readings[patient.readings.length - 1];

  return (
    <div className={`rounded-2xl border bg-slate-900 p-4 ${patient.openAlerts.length ? "border-rose-500/60" : "border-slate-800"}`}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-cyan-400">{patient.bedNumber ?? patient.uhid}</span>
          <h3 className="text-sm font-extrabold text-white">{patient.name ?? patient.uhid}</h3>
          {patient.icuMode && <span className="rounded bg-cyan-600/20 px-1.5 py-0.5 text-[10px] font-bold text-cyan-300">ICU</span>}
          {classificationChip(patient)}
        </div>
        <div className="flex items-center gap-2">
          {patient.pendingDoseCount > 0 && (
            <span title="Pending doses" className="rounded-full bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[11px] font-black text-amber-300">
              <Pill className="mr-1 inline h-3 w-3" />
              {patient.pendingDoseCount} dose{patient.pendingDoseCount === 1 ? "" : "s"} pending
            </span>
          )}
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
              patient.vitalsOverdue ? "bg-rose-500/20 border border-rose-500/50 text-rose-300" : "bg-slate-800 text-slate-300"
            }`}
          >
            <Clock className="mr-1 inline h-3 w-3" />
            {patient.vitalsOverdue ? "Vitals OVERDUE" : dueInMin === null ? "Vitals not scheduled" : `Vitals due in ${dueInMin} min`}
          </span>
          {!patient.scheduled && (
            <button
              onClick={() => void buildWardSchedule(patient.uhid).then((r) => {
                if (!r.ok) toast.error("Schedule failed", { description: r.error });
                else {
                  toast.success(`${r.created ?? 0} dose task(s) scheduled`);
                  onAction(`Schedule built for ${patient.name ?? patient.uhid}`);
                }
              })}
              className="rounded-lg bg-cyan-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-cyan-500"
            >
              Build today's schedule
            </button>
          )}
        </div>
      </div>

      {patient.lastClassification && (
        <p className="mt-1 text-[11px] text-slate-400">
          {patient.lastClassification.status}: {patient.lastClassification.reason}
        </p>
      )}
      {patient.openAlerts.length > 0 && (
        <div className="mt-2 rounded-lg border border-rose-500/40 bg-rose-950/50 px-2 py-1.5 text-[11px] text-rose-200">
          <AlertTriangle className="mr-1 inline h-3 w-3" />
          {patient.openAlerts.length} open Level-3 alert(s) — doctor acknowledgment required.
        </div>
      )}

      {/* Trend sparklines */}
      {latest && (
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl border border-slate-800 bg-slate-950 p-2">
          <Sparkline label="Pulse" color="#f472b6" values={patient.readings.map((r) => r.hr)} />
          <Sparkline label="SBP" color="#60a5fa" values={patient.readings.map((r) => r.bpSystolic)} />
          <Sparkline label="SpO2" color="#34d399" values={patient.readings.map((r) => r.spo2)} />
          <Sparkline label="Temp" color="#fbbf24" values={patient.readings.map((r) => r.temp)} />
          <Sparkline label="RR" color="#a78bfa" values={patient.readings.map((r) => r.rr)} />
        </div>
      )}

      {/* Vitals entry */}
      <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950 p-2">
        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          <HeartPulse className="h-3 w-3" /> Record vitals (emits VITALS_UPDATED)
        </div>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
          {([["hr", "Pulse"], ["bpSystolic", "SBP"], ["bpDiastolic", "DBP"], ["temp", "Temp°F"], ["rr", "RR"], ["spo2", "SpO2%"]] as const).map(([key, label]) => (
            <label key={key} className="text-[10px] text-slate-500">
              {label}
              <input
                type="number"
                value={vitals[key]}
                onChange={(event) => setVitals((prev) => ({ ...prev, [key]: event.target.value }))}
                className="mt-0.5 w-full rounded-md border border-slate-700 bg-slate-900 px-1.5 py-1 text-[11px] text-white"
              />
            </label>
          ))}
        </div>
        <button
          disabled={busy === "vitals" || !canAct}
          onClick={() => void submitVitals()}
          className="mt-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy === "vitals" ? "Recording…" : "Record vitals"}
        </button>
      </div>

      {/* Dose tasks */}
      <div className="mt-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <Pill className="h-3 w-3" /> Dose schedule (from doctor orders — dose cannot be changed here)
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            {patient.icuMode ? (
              <span className="text-cyan-400">ICU: vitals every 15 min</span>
            ) : (
              <select
                value={patient.vitalsIntervalMinutes ?? 120}
                onChange={(event) => void changeInterval(Number(event.target.value))}
                className="rounded-md border border-slate-700 bg-slate-900 px-1 py-0.5 text-[10px] text-slate-300"
              >
                {[120, 180, 240].map((m) => (
                  <option key={m} value={m}>Vitals every {m / 60} h</option>
                ))}
              </select>
            )}
            <button onClick={() => void toggleIcu()} className="rounded-md border border-cyan-700 bg-cyan-950 px-2 py-0.5 text-[10px] font-bold text-cyan-300 hover:bg-cyan-900">
              {patient.icuMode ? "ICU off" : "ICU mode"}
            </button>
          </div>
        </div>
        {patient.doses.length === 0 ? (
          <p className="mt-1.5 text-[11px] text-slate-500">No dose tasks. Build the schedule from confirmed medication orders.</p>
        ) : (
          <div className="mt-1.5 space-y-1">
            {patient.doses.map((task) => {
              const rowHighlight = task.escalation.overdue ? "border border-amber-500/50 bg-amber-500/10" : "border border-slate-800 bg-slate-950";
              return (
                <div key={task.id} className={`rounded-lg p-1.5 text-[11px] ${rowHighlight}`}>
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-200">{localTime(task.scheduledAtMs)}</span>
                      <span className="text-slate-300">
                        {task.drugName} {task.dose} {task.route}
                      </span>
                      <span className="text-[10px] text-slate-500">({task.frequency})</span>
                      {task.escalation.overdue && (
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                          OVERDUE · Level 2 · repeat {task.escalation.repeats}
                          {task.escalation.escalated ? " · ESCALATED to charge nurse/doctor" : ""}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {task.status === "SCHEDULED" ? (
                        <>
                          <button
                            disabled={busy === task.id || !canAct}
                            onClick={() => void runDose(task.id, "given")}
                            className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                          >
                            Give
                          </button>
                          <button
                            disabled={busy === task.id || !canAct}
                            onClick={() => { setHoldFor(task.id); setRefuseFor(null); setReason(""); }}
                            className="rounded bg-slate-700 px-2 py-0.5 text-[10px] font-bold text-slate-200 hover:bg-slate-600"
                          >
                            Hold
                          </button>
                          <button
                            disabled={busy === task.id || !canAct}
                            onClick={() => { setRefuseFor(task.id); setHoldFor(null); setReason(""); }}
                            className="rounded bg-slate-700 px-2 py-0.5 text-[10px] font-bold text-slate-200 hover:bg-slate-600"
                          >
                            Refused
                          </button>
                        </>
                      ) : (
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${task.status === "GIVEN" ? "bg-emerald-500/20 text-emerald-300" : task.status === "not_due_admitted_later" ? "bg-slate-500/40 text-slate-200" : "bg-slate-700/60 text-slate-300"}`}>
                          {task.statusLabel ?? task.status}
                          {task.administeredBy ? ` · ${task.administeredBy} · ${task.administeredAt ? localTime(Date.parse(task.administeredAt)) : ""}` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  {(holdFor === task.id || refuseFor === task.id) && (
                    <div className="mt-1 flex items-center gap-1">
                      <input
                        autoFocus
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder={holdFor === task.id ? "Reason for holding (required)" : "Reason for refusal (required)"}
                        className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-white"
                      />
                      <button
                        disabled={!reason.trim() || busy === task.id}
                        onClick={() => void runDose(task.id, holdFor === task.id ? "held" : "refused", reason)}
                        className="rounded bg-amber-600 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50"
                      >
                        Confirm
                      </button>
                      <button onClick={() => { setHoldFor(null); setRefuseFor(null); }} className="rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-300">
                        Cancel
                      </button>
                    </div>
                  )}
                  {task.reason && <p className="mt-0.5 text-[10px] text-slate-500">Reason: {task.reason}</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SBAR */}
      <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950 p-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            <ClipboardCheck className="h-3 w-3" /> SBAR handover
          </div>
          <button
            disabled={busy === "sbar" || !patient.scheduled}
            onClick={() => void draftSbar()}
            className="rounded bg-violet-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {busy === "sbar" ? "Drafting…" : "Create shift draft"}
          </button>
        </div>
        {editingSbar ? (
          <div className="mt-1.5 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
              <span className="rounded bg-violet-500/20 px-1.5 py-0.5 font-bold text-violet-300">{editingSbar.shiftLabel} shift</span>
              {editingSbar.signedBy ? (
                <span className="text-emerald-300">Signed: {editingSbar.signedBy} · {editingSbar.signedAt ? localTime(Date.parse(editingSbar.signedAt)) : ""}</span>
              ) : (
                <span className="text-amber-300">Draft — editable until signed</span>
              )}
              {editingSbar.acknowledgedBy && <span className="text-cyan-300">Acknowledged: {editingSbar.acknowledgedBy} · {editingSbar.acknowledgedAt ? localTime(Date.parse(editingSbar.acknowledgedAt)) : ""}</span>}
            </div>
            {(["situation", "background", "assessment", "recommendation"] as const).map((field) => (
              <label key={field} className="block">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{field}</span>
                <textarea
                  value={editingSbar.draft[field]}
                  disabled={Boolean(editingSbar.signedBy)}
                  onChange={(event) => setEditingSbar({ ...editingSbar, draft: { ...editingSbar.draft, [field]: event.target.value } })}
                  rows={2}
                  className="mt-0.5 w-full rounded-md border border-slate-700 bg-slate-900 p-1.5 text-[11px] text-slate-200 disabled:opacity-60"
                />
              </label>
            ))}
            <p className="text-[10px] text-slate-500">The draft never changes orders — it only summarises them.</p>
            <div className="flex flex-wrap gap-1.5">
              {!editingSbar.signedBy && (
                <button disabled={busy === "sbar-save"} onClick={() => void saveSbar()} className="rounded bg-slate-700 px-2 py-1 text-[10px] font-bold text-white hover:bg-slate-600 disabled:opacity-50">
                  {busy === "sbar-save" ? "Saving…" : "Save edits"}
                </button>
              )}
              {!editingSbar.signedBy && (
                <button disabled={busy === "sbar-sign"} onClick={() => void signSbar()} className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-500 disabled:opacity-50">
                  {busy === "sbar-sign" ? "Signing…" : "Sign (outgoing nurse)"}
                </button>
              )}
              {editingSbar.signedBy && !editingSbar.acknowledgedBy && (
                <button disabled={busy === "sbar-ack"} onClick={() => void ackSbar()} className="rounded bg-cyan-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-cyan-500 disabled:opacity-50">
                  {busy === "sbar-ack" ? "Recording…" : "Acknowledge (incoming nurse)"}
                </button>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-1 text-[11px] text-slate-500">Create a draft at shift change; outgoing nurse signs, incoming nurse acknowledges.</p>
        )}
      </div>
    </div>
  );
}

export function WardSafetyBoard() {
  const { account } = useAuth();
  const [board, setBoard] = useState<WardBoard | null>(null);
  const [error, setError] = useState("");
  const [sbar, setSbar] = useState<WardSbarState | null>(null);
  const [screenLog, setScreenLog] = useState<ScreenLogEntry[]>([]);
  const beepedRef = useRef<Map<string, number>>(new Map());
  const remindedRef = useRef<Set<string>>(new Set());
  const [summaryBusy, setSummaryBusy] = useState(false);

  const appendLog = useCallback((text: string, suppressed: boolean) => {
    setScreenLog((prev) => [{ atMs: Date.now(), text, suppressed }, ...prev].slice(0, 30));
  }, []);

  const refresh = useCallback(async () => {
    const [nextBoard, nextSbar] = await Promise.all([fetchWardBoard(), fetchWardSbar()]);
    if (!nextBoard.ok) {
      setError(nextBoard.error ?? "Ward API unreachable");
      return;
    }
    setError("");
    setBoard(nextBoard);
    setSbar(nextSbar);
    const nowMs = nextBoard.nowMs ?? Date.now();
    const nightMode = nextBoard.nightMode ?? false;

    for (const patient of nextBoard.patients) {
      for (const escalation of patient.escalations) {
        const previous = beepedRef.current.get(escalation.id) ?? 0;
        if (escalation.repeats > previous) {
          beepedRef.current.set(escalation.id, escalation.repeats);
          const suppressed = nightMode;
          if (!suppressed) hospitalAudio.playCriticalAlertSound(); // Level-2 double beep
          appendLog(`Level 2: ${escalation.taskLabel} — repeat ${escalation.repeats}${suppressed ? " (night mode: logged silently)" : ""}`, suppressed);
        }
      }
      if (patient.vitalsDueAtMs && patient.vitalsDueAtMs > nowMs && patient.vitalsDueAtMs - nowMs <= UPCOMING_WINDOW_MS) {
        const key = `${patient.uhid}:vitals:${patient.vitalsDueAtMs}`;
        if (!remindedRef.current.has(key)) {
          remindedRef.current.add(key);
          const suppressed = nightMode;
          if (!suppressed) hospitalAudio.playSuccessChime();
          appendLog(`Routine reminder: vitals due for ${patient.name ?? patient.uhid} at ${localTime(patient.vitalsDueAtMs)}${suppressed ? " (night mode: logged silently)" : ""}`, suppressed);
        }
      }
    }
  }, [appendLog]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  async function generateUnitSummary() {
    setSummaryBusy(true);
    const result = await createWardUnitSummary();
    setSummaryBusy(false);
    if (!result.ok) {
      toast.error("Unit summary failed", { description: result.error });
      return;
    }
    toast.success("Unit summary created (60-second read)");
    appendLog(`Unit summary created for the ${result.summary?.shiftLabel ?? "current"} shift`, false);
    void refresh();
  }

  const isWardStaff = ["ward", "doctor", "admin"].includes((account?.role ?? "").toLowerCase());
  const nightMode = board?.nightMode ?? false;

  if (!isWardStaff) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-xs text-slate-400">
        The ward safety board is for ward staff, doctors and administrators.
      </div>
    );
  }

  return (
    <section className="space-y-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-800 bg-slate-900 p-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <h2 className="text-sm font-black text-white">Ward Nursing Safety Board</h2>
          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300">{board?.shiftLabel ?? "—"} shift</span>
          {nightMode && (
            <span className="flex items-center gap-1 rounded-full bg-indigo-500/20 border border-indigo-500/40 px-2 py-0.5 text-[10px] font-bold text-indigo-300">
              <Moon className="h-3 w-3" /> Night mode 22:00–06:00 — routine reminders logged silently; Level-3 still sounds
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {board && board.escalated.length > 0 && (
            <span className="rounded-full bg-rose-500/20 border border-rose-500/50 px-2 py-0.5 text-[10px] font-black text-rose-300">
              {board.escalated.length} task(s) escalated to charge nurse/doctor
            </span>
          )}
          <button
            disabled={summaryBusy}
            onClick={() => void generateUnitSummary()}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {summaryBusy ? "Creating…" : "Create unit summary (60s read)"}
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-500/50 bg-rose-950/50 px-3 py-2 text-xs text-rose-200">{error}</div>}

      {/* Unit summary */}
      {sbar && sbar.summaries.length > 0 && (
        <div className="rounded-2xl border border-violet-400/20 bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black text-violet-300">Unit handover summary — {sbar.summaries[0].shiftLabel} shift</h3>
            <span className="text-[10px] text-slate-500">{sbar.summaries[0].readSeconds}-second read</span>
          </div>
          <div className="mt-2 space-y-2">
            {sbar.summaries[0].sections.map((section) => (
              <div key={section.order} className="rounded-xl border border-slate-800 bg-slate-950 p-2">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  {section.order}. {section.title}
                </div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-300">{section.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Escalated tasks (charge nurse / doctor view) */}
      {board && board.escalated.length > 0 && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-950/30 p-3">
          <div className="flex items-center gap-1 text-[11px] font-black uppercase tracking-wider text-rose-300">
            <AlertTriangle className="h-3.5 w-3.5" /> Escalated to charge nurse / doctor
          </div>
          {board.escalated.map((entry) => (
            <div key={entry.id} className="mt-1 text-[11px] text-rose-100">
              {entry.taskLabel} — {entry.patientName ?? entry.patientUhid} · {entry.repeats} repeats · raised {localTime(entry.raisedAtMs)}
            </div>
          ))}
        </div>
      )}

      {/* Patient cards */}
      {board && board.patients.length === 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 text-xs text-slate-400">
          No admitted patients. Admit a patient first — the ward board then builds the dose schedule from confirmed medication orders.
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {board?.patients.map((patient) => (
          <WardPatientCard
            key={patient.uhid}
            patient={patient}
            accountRole={account?.role ?? ""}
            nightMode={nightMode}
            onAction={(text) => appendLog(text, false)}
          />
        ))}
      </div>

      {/* On-screen log */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3">
        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          <BellRing className="h-3 w-3" /> Ward safety log (night reminders are logged silently here)
        </div>
        <div className="mt-1.5 max-h-44 space-y-0.5 overflow-auto">
          {screenLog.length === 0 && board?.log.length === 0 && <p className="text-[11px] text-slate-600">Nothing logged yet this session.</p>}
          {screenLog.map((entry, index) => (
            <div key={`local-${entry.atMs}-${index}`} className={`text-[11px] ${entry.suppressed ? "text-indigo-300" : "text-slate-300"}`}>
              <span className="font-mono text-slate-500">{localTime(entry.atMs)}</span> {entry.text}
            </div>
          ))}
          {board?.log.slice(0, 14).map((entry) => (
            <div key={entry.id} className={`text-[11px] ${entry.audible === false ? "text-indigo-300" : "text-slate-400"}`}>
              <span className="font-mono text-slate-600">{localTime(entry.atMs)}</span> {entry.details}
              {entry.audible === false ? " (night mode: silent, logged)" : ""}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
