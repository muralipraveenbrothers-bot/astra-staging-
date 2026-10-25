/**
 * R5-03 doctor confirmation steps for the DDx matrix and investigation planner.
 *
 * - Nothing is ordered unless the doctor ticked it and pressed Confirm.
 * - Each ticked lab/radiology test gets its own R5-01 approval record on the
 *   server (suggestion -> doctor decision), then is dispatched through the
 *   existing order centre (/api/command/execute) carrying that approval id.
 * - A final diagnosis is only recorded through an explicit doctor action
 *   (approval gate kind "diagnosis"). There is no automatic path.
 */
import { apiFetch, authHeaders } from "@/services/apiFetch";
import { dispatchCpoeOrder, investigationOrderQuery } from "./cpoeDispatch";
import { ORDER_EVENTS } from "@/astra/clinical/workflow/orderEvents";
import type { ApprovalDecision } from "@/astra/approval/approvalGate";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface PlannerItemLike {
  id: string;
  name: string;
  orderCategory: "laboratory" | "radiology" | "clinical";
  group?: string;
  rationale?: string;
  movesDdxRowId?: string | null;
}

export interface DispatchedInvestigation {
  id: string;
  name: string;
  category: "laboratory" | "radiology";
  orderId: string;
  approvalDecisionId: string;
}

export interface ConfirmInvestigationsResult {
  ok: boolean;
  dispatched: DispatchedInvestigation[];
  skipped: string[];
  error?: string;
}

export type WorkflowPublisher = (input: {
  event: string;
  patientUhid: string;
  orderId?: string;
  department?: "laboratory" | "radiology";
  actorId: string;
  actorRole: string;
  device: string;
}) => Promise<unknown>;

async function readJson(response: Response): Promise<any> {
  return response.json().catch(() => ({}));
}

/** Records an AI suggestion and the doctor's approval on the server. Returns the approved decision id. */
export async function recordDoctorApproval(input: {
  suggestionId: string;
  patientId: string;
  kind: "investigation" | "diagnosis";
  source: string;
  payload: unknown;
  reason: string;
  fetcher?: Fetcher;
}): Promise<{ ok: true; decisionId: string } | { ok: false; error: string }> {
  const fetcher = input.fetcher ?? apiFetch;
  const suggestion = await fetcher("/api/clinical/approval/suggestion", {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify({
      suggestionId: input.suggestionId,
      patientId: input.patientId,
      kind: input.kind,
      source: input.source,
      payload: input.payload,
    }),
  });
  const suggestionBody = await readJson(suggestion);
  if (!suggestion.ok || suggestionBody?.ok === false) {
    return { ok: false, error: String(suggestionBody?.message || suggestionBody?.error || `Could not record the suggestion (HTTP ${suggestion.status}).`) };
  }
  const decision = await fetcher("/api/clinical/approval/decision", {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify({ suggestionId: input.suggestionId, decision: "APPROVE_CASE_ONLY", reason: input.reason }),
  });
  const decisionBody = await readJson(decision) as { ok?: boolean; decision?: ApprovalDecision; message?: string; error?: string };
  if (!decision.ok || decisionBody?.ok === false || !decisionBody?.decision?.decisionId) {
    return { ok: false, error: String(decisionBody?.message || decisionBody?.error || `Doctor approval was not recorded (HTTP ${decision.status}).`) };
  }
  if (decisionBody.decision.status !== "APPROVED") {
    return { ok: false, error: `Approval status is ${decisionBody.decision.status}.` };
  }
  return { ok: true, decisionId: decisionBody.decision.decisionId };
}

/**
 * Creates orders only for the ticked lab/radiology tests. Unticked tests are
 * never sent. Clinical-review items are skipped (they are not orders).
 */
export async function confirmTickedInvestigations(input: {
  plan: readonly PlannerItemLike[];
  tickedIds: Iterable<string>;
  patientUhid: string;
  actor?: { id?: string; role?: string };
  fetcher?: Fetcher;
  publish?: WorkflowPublisher;
  now?: () => number;
}): Promise<ConfirmInvestigationsResult> {
  const patientUhid = input.patientUhid.trim();
  if (!patientUhid) return { ok: false, dispatched: [], skipped: [], error: "No patient selected." };
  const ticked = new Set(input.tickedIds);
  const selected = input.plan.filter((item) => ticked.has(item.id));
  if (selected.length === 0) return { ok: false, dispatched: [], skipped: [], error: "Tick at least one investigation first." };
  const fetcher = input.fetcher ?? apiFetch;
  const now = input.now ?? Date.now;
  const dispatched: DispatchedInvestigation[] = [];
  const skipped: string[] = [];
  for (const item of selected) {
    const query = item.orderCategory === "clinical" ? null : investigationOrderQuery(item, patientUhid);
    if (!query || item.orderCategory === "clinical") {
      skipped.push(item.name);
      continue;
    }
    const approval = await recordDoctorApproval({
      suggestionId: `scientist-${patientUhid}-${item.id}-${now()}`,
      patientId: patientUhid,
      kind: "investigation",
      source: "scientist",
      payload: { investigation: { id: item.id, name: item.name, group: item.group, orderCategory: item.orderCategory, rationale: item.rationale, movesDdxRowId: item.movesDdxRowId ?? null } },
      reason: "Doctor ticked and confirmed this investigation.",
      fetcher,
    });
    if (!approval.ok) return { ok: false, dispatched, skipped, error: `${item.name}: ${approval.error}` };
    const result = await dispatchCpoeOrder(query.query, query.contextPatientId, fetcher as typeof apiFetch, approval.decisionId);
    if (!result.ok) return { ok: false, dispatched, skipped, error: `${item.name}: ${result.error}` };
    dispatched.push({ id: item.id, name: item.name, category: item.orderCategory, orderId: result.orderId, approvalDecisionId: approval.decisionId });
    if (input.publish) {
      try {
        await input.publish({
          event: ORDER_EVENTS.INVESTIGATION_ORDER_CREATED,
          patientUhid,
          orderId: result.orderId,
          department: item.orderCategory,
          actorId: input.actor?.id || "doctor",
          actorRole: input.actor?.role || "doctor",
          device: "diagnosis-cause-panel",
        });
      } catch {
        // The order exists; a missed status event does not undo it.
      }
    }
  }
  return { ok: true, dispatched, skipped };
}

/**
 * Records a final diagnosis ONLY as an explicit doctor action through the
 * approval gate (kind "diagnosis"). Non-doctor roles are refused before any
 * network call; the server also requires the doctor/admin role.
 */
export async function confirmDiagnosisByDoctor(input: {
  patientUhid: string;
  diagnosis: string;
  actorRole: string | undefined;
  doctorClicked: boolean;
  ddxRowId?: string;
  fetcher?: Fetcher;
  now?: () => number;
}): Promise<{ ok: true; decisionId: string } | { ok: false; error: string }> {
  if (!input.doctorClicked) return { ok: false, error: "A final diagnosis needs an explicit doctor action." };
  if ((input.actorRole ?? "").toLowerCase() !== "doctor") return { ok: false, error: "Only a doctor can confirm a final diagnosis." };
  const patientUhid = input.patientUhid.trim();
  const diagnosis = input.diagnosis.trim();
  if (!patientUhid) return { ok: false, error: "No patient selected." };
  if (!diagnosis) return { ok: false, error: "Enter or pick a diagnosis first." };
  const now = input.now ?? Date.now;
  return recordDoctorApproval({
    suggestionId: `diagnosis-${patientUhid}-${now()}`,
    patientId: patientUhid,
    kind: "diagnosis",
    source: "doctor-confirmed-diagnosis",
    payload: { diagnosis, ddxRowId: input.ddxRowId ?? null },
    reason: "Doctor confirmed the final diagnosis.",
    fetcher: input.fetcher,
  });
}
