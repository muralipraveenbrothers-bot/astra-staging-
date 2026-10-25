/**
 * R5-06 browser client for the closed-loop results API.
 * Server-authoritative: if the API cannot be reached the helpers fail closed
 * (ok:false / empty lists) and never invent results. Type-only imports from
 * the pure results core — no runtime coupling to any node-only module.
 */
import { apiFetch, authHeaders } from "@/services/apiFetch";
import type {
  CriticalAlertView,
  CriticalCheckOutcome,
  ReportVersion,
  ResultNotification,
  ResultTrend,
} from "./resultsLoop";

async function readJson(response: Response): Promise<any> {
  return response.json().catch(() => ({}));
}

export interface SubmitReportPayload {
  patientUhid: string;
  patientName?: string;
  orderId?: string;
  testName: string;
  department: "laboratory" | "radiology";
  values?: Array<{ param: string; value: string; unit?: string }>;
  pdfOnly?: boolean;
  impression?: string;
  orderingDoctor?: string;
}

export interface SubmitReportResult {
  ok: boolean;
  error?: string;
  report?: ReportVersion;
  reportId?: string;
  version?: number;
  trends?: ResultTrend[];
  criticalCheck?: CriticalCheckOutcome;
  alert?: CriticalAlertView;
  notification?: ResultNotification;
}

export async function submitResultReport(payload: SubmitReportPayload): Promise<SubmitReportResult> {
  try {
    const response = await apiFetch("/api/clinical/results/report", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify(payload),
    });
    const body = await readJson(response);
    if (!response.ok || body?.ok === false) {
      return { ok: false, error: String(body?.error ?? `HTTP ${response.status}`) };
    }
    return { ok: true, ...body };
  } catch (error) {
    return { ok: false, error: `Results API unreachable (${String(error)})` };
  }
}

export async function reviseResultReport(reportId: string, payload: SubmitReportPayload & { reason: string }): Promise<SubmitReportResult> {
  try {
    const response = await apiFetch(`/api/clinical/results/report/${encodeURIComponent(reportId)}/revise`, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify(payload),
    });
    const body = await readJson(response);
    if (!response.ok || body?.ok === false) {
      return { ok: false, error: String(body?.error ?? `HTTP ${response.status}`) };
    }
    return { ok: true, ...body };
  } catch (error) {
    return { ok: false, error: `Results API unreachable (${String(error)})` };
  }
}

export async function listOpenCriticalAlerts(): Promise<CriticalAlertView[]> {
  try {
    const response = await apiFetch("/api/clinical/results/alerts?status=open");
    if (!response.ok) return [];
    const body = await readJson(response);
    return Array.isArray(body?.alerts) ? (body.alerts as CriticalAlertView[]) : [];
  } catch {
    return [];
  }
}

export async function acknowledgeCriticalAlert(alertId: string): Promise<{ ok: boolean; error?: string; alert?: CriticalAlertView }> {
  try {
    const response = await apiFetch(`/api/clinical/results/alerts/${encodeURIComponent(alertId)}/acknowledge`, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({}),
    });
    const body = await readJson(response);
    if (!response.ok || body?.ok === false) {
      return { ok: false, error: String(body?.error ?? `HTTP ${response.status}`) };
    }
    return { ok: true, alert: body.alert };
  } catch (error) {
    return { ok: false, error: `Results API unreachable (${String(error)})` };
  }
}

export async function listUnreadResultNotifications(): Promise<ResultNotification[]> {
  try {
    const response = await apiFetch("/api/clinical/results/notifications?unread=1");
    if (!response.ok) return [];
    const body = await readJson(response);
    return Array.isArray(body?.notifications) ? (body.notifications as ResultNotification[]) : [];
  } catch {
    return [];
  }
}

export async function markResultNotificationRead(notificationId: string): Promise<boolean> {
  try {
    const response = await apiFetch(`/api/clinical/results/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({}),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function latestResultReport(patientUhid: string): Promise<ReportVersion | null> {
  try {
    const response = await apiFetch(`/api/clinical/results/reports?uhid=${encodeURIComponent(patientUhid)}`);
    if (!response.ok) return null;
    const body = await readJson(response);
    return (body?.latest as ReportVersion | null) ?? null;
  } catch {
    return null;
  }
}
