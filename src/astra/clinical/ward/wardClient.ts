/**
 * R5-07 browser client for the ward nursing safety API.
 * Server-authoritative: if the API cannot be reached the helpers fail closed
 * (ok:false / empty lists) and never invent tasks. Type-only imports from the
 * pure wardSafety core — no runtime coupling to server-only modules.
 */
import { apiFetch, authHeaders } from "@/services/apiFetch";
import type {
  DoseTask,
  SbarDraft,
  SbarHandover,
  UnitSummary,
  VitalsClassification,
  VitalsTrendStatus,
  WardEscalationEvent,
  WardSafetyLogEntry,
  WardVitalsInput,
} from "./wardSafety";
import type { CriticalAlertView } from "../results/resultsLoop";

async function readJson(response: Response): Promise<any> {
  return response.json().catch(() => ({}));
}

export interface WardBoardDose extends DoseTask {
  escalation: { overdue: boolean; repeats: number; escalated: boolean };
}

export interface WardBoardPatient {
  uhid: string;
  name?: string;
  bedNumber?: string;
  wardName?: string;
  diagnosis?: string;
  allergies: string[];
  scheduled: boolean;
  icuMode: boolean;
  vitalsIntervalMinutes: number | null;
  vitalsDueAtMs: number | null;
  vitalsDueInMs: number | null;
  vitalsOverdue: boolean;
  lastClassification: (VitalsClassification & { status: VitalsTrendStatus }) | null;
  readings: Array<WardVitalsInput & { id: string; recordedBy: string; at: string; atMs: number }>;
  doses: WardBoardDose[];
  pendingDoseCount: number;
  escalations: WardEscalationEvent[];
  openAlerts: CriticalAlertView[];
}

export interface WardBoard {
  ok: boolean;
  error?: string;
  nowMs?: number;
  shiftLabel?: string;
  nightMode?: boolean;
  patients: WardBoardPatient[];
  escalated: WardEscalationEvent[];
  log: WardSafetyLogEntry[];
}

export async function fetchWardBoard(): Promise<WardBoard> {
  try {
    const response = await apiFetch("/api/ward/board");
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}`, patients: [], escalated: [], log: [] };
    const body = await readJson(response);
    return {
      ok: true,
      nowMs: body.nowMs,
      shiftLabel: body.shiftLabel,
      nightMode: body.nightMode,
      patients: Array.isArray(body.patients) ? (body.patients as WardBoardPatient[]) : [],
      escalated: Array.isArray(body.escalated) ? (body.escalated as WardEscalationEvent[]) : [],
      log: Array.isArray(body.log) ? (body.log as WardSafetyLogEntry[]) : [],
    };
  } catch (error) {
    return { ok: false, error: `Ward API unreachable (${String(error)})`, patients: [], escalated: [], log: [] };
  }
}

export async function buildWardSchedule(patientUhid: string): Promise<{ ok: boolean; error?: string; created?: number }> {
  try {
    const response = await apiFetch("/api/ward/schedule", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ patientUhid }),
    });
    const body = await readJson(response);
    if (!response.ok || body?.ok === false) return { ok: false, error: String(body?.error ?? `HTTP ${response.status}`) };
    return { ok: true, created: Array.isArray(body?.created) ? body.created.length : 0 };
  } catch (error) {
    return { ok: false, error: `Ward API unreachable (${String(error)})` };
  }
}

export async function executeWardDose(taskId: string, action: "given" | "held" | "refused", reason = ""): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await apiFetch(`/api/ward/doses/${encodeURIComponent(taskId)}`, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ action, reason }),
    });
    const body = await readJson(response);
    if (!response.ok || body?.ok === false) return { ok: false, error: String(body?.error ?? `HTTP ${response.status}`) };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: `Ward API unreachable (${String(error)})` };
  }
}

export async function recordWardVitals(payload: { patientUhid: string } & WardVitalsInput): Promise<{
  ok: boolean;
  error?: string;
  classification?: VitalsClassification;
  alert?: CriticalAlertView;
}> {
  try {
    const response = await apiFetch("/api/ward/vitals", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify(payload),
    });
    const body = await readJson(response);
    if (!response.ok || body?.ok === false) return { ok: false, error: String(body?.error ?? `HTTP ${response.status}`) };
    return { ok: true, classification: body.classification, alert: body.alert };
  } catch (error) {
    return { ok: false, error: `Ward API unreachable (${String(error)})` };
  }
}

export async function setWardPatientConfig(patientUhid: string, patch: { icuMode?: boolean; vitalsIntervalMinutes?: number }): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await apiFetch("/api/ward/config", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ patientUhid, ...patch }),
    });
    const body = await readJson(response);
    if (!response.ok || body?.ok === false) return { ok: false, error: String(body?.error ?? `HTTP ${response.status}`) };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: `Ward API unreachable (${String(error)})` };
  }
}

export async function createWardSbarDraft(patientUhid: string): Promise<{ ok: boolean; error?: string; handover?: SbarHandover }> {
  try {
    const response = await apiFetch("/api/ward/sbar/draft", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ patientUhid }),
    });
    const body = await readJson(response);
    if (!response.ok || body?.ok === false) return { ok: false, error: String(body?.error ?? `HTTP ${response.status}`) };
    return { ok: true, handover: body.handover };
  } catch (error) {
    return { ok: false, error: `Ward API unreachable (${String(error)})` };
  }
}

export async function saveWardSbarDraft(handoverId: string, draft: SbarDraft): Promise<{ ok: boolean; error?: string; handover?: SbarHandover }> {
  try {
    const response = await apiFetch(`/api/ward/sbar/${encodeURIComponent(handoverId)}`, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ draft }),
    });
    const body = await readJson(response);
    if (!response.ok || body?.ok === false) return { ok: false, error: String(body?.error ?? `HTTP ${response.status}`) };
    return { ok: true, handover: body.handover };
  } catch (error) {
    return { ok: false, error: `Ward API unreachable (${String(error)})` };
  }
}

export async function signWardSbar(handoverId: string): Promise<{ ok: boolean; error?: string; handover?: SbarHandover }> {
  try {
    const response = await apiFetch(`/api/ward/sbar/${encodeURIComponent(handoverId)}/sign`, { method: "POST", headers: authHeaders(true), body: JSON.stringify({}) });
    const body = await readJson(response);
    if (!response.ok || body?.ok === false) return { ok: false, error: String(body?.error ?? `HTTP ${response.status}`) };
    return { ok: true, handover: body.handover };
  } catch (error) {
    return { ok: false, error: `Ward API unreachable (${String(error)})` };
  }
}

export async function acknowledgeWardSbar(handoverId: string): Promise<{ ok: boolean; error?: string; handover?: SbarHandover }> {
  try {
    const response = await apiFetch(`/api/ward/sbar/${encodeURIComponent(handoverId)}/acknowledge`, { method: "POST", headers: authHeaders(true), body: JSON.stringify({}) });
    const body = await readJson(response);
    if (!response.ok || body?.ok === false) return { ok: false, error: String(body?.error ?? `HTTP ${response.status}`) };
    return { ok: true, handover: body.handover };
  } catch (error) {
    return { ok: false, error: `Ward API unreachable (${String(error)})` };
  }
}

export interface WardSbarState {
  ok: boolean;
  error?: string;
  shiftLabel?: string;
  handovers: SbarHandover[];
  summaries: UnitSummary[];
}

export async function fetchWardSbar(): Promise<WardSbarState> {
  try {
    const response = await apiFetch("/api/ward/sbar");
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}`, handovers: [], summaries: [] };
    const body = await readJson(response);
    return {
      ok: true,
      shiftLabel: body.shiftLabel,
      handovers: Array.isArray(body.handovers) ? (body.handovers as SbarHandover[]) : [],
      summaries: Array.isArray(body.summaries) ? (body.summaries as UnitSummary[]) : [],
    };
  } catch (error) {
    return { ok: false, error: `Ward API unreachable (${String(error)})`, handovers: [], summaries: [] };
  }
}

export async function createWardUnitSummary(): Promise<{ ok: boolean; error?: string; summary?: UnitSummary }> {
  try {
    const response = await apiFetch("/api/ward/sbar/summary", { method: "POST", headers: authHeaders(true), body: JSON.stringify({}) });
    const body = await readJson(response);
    if (!response.ok || body?.ok === false) return { ok: false, error: String(body?.error ?? `HTTP ${response.status}`) };
    return { ok: true, summary: body.summary };
  } catch (error) {
    return { ok: false, error: `Ward API unreachable (${String(error)})` };
  }
}
