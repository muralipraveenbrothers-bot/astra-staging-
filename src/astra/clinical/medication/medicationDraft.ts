/**
 * Medication draft confirmation.
 * A draft is sent only after a doctor confirms it and an R5-01 approval of kind "medication" matches the patient.
 * The event name is the R5-05 canonical order event.
 */
import { canAuthorizeClinicalAction } from "../../saarathi/command/clinicalAuthority";
import { astraEventBus, type AstraEventEnvelope } from "../../events/astraEventBus";
import { ORDER_EVENTS } from "../workflow/orderEvents";
import { apiFetch, authHeaders } from "../../../services/apiFetch";
import { clearBuyAlerts } from "./stockCheck";
import type { ApprovalLink, DraftMedicationItem, MedicationDraft, MedicationFinding, OverrideRecord } from "./types";

export const MEDICATION_DRAFT_CONFIRMED_EVENT = ORDER_EVENTS.MEDICATION_DRAFT_CONFIRMED;

const DRAFT_KEY = "astra.medicationDraft.v1";
const OVERRIDE_KEY = "astra.medicationOverrideAudit.v1";
const OVERRIDE_QUEUE_KEY = "astra.medicationOverrideAudit.queue.v1";

const drafts: MedicationDraft[] = [];
const overrides: OverrideRecord[] = [];
let hydrated = false;

function browserStore(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function persistDraftState(): void {
  const store = browserStore();
  if (!store) return;
  try {
    store.setItem(DRAFT_KEY, JSON.stringify(drafts));
    store.setItem(OVERRIDE_KEY, JSON.stringify(overrides));
  } catch {
    // The in-memory draft still stands if the browser refuses storage.
  }
}

interface QueuedOverride {
  entry: OverrideRecord;
  finding: MedicationFinding;
}

function queuedOverrides(): QueuedOverride[] {
  const store = browserStore();
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(OVERRIDE_QUEUE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.entry && item.finding) : [];
  } catch {
    return [];
  }
}

function saveQueuedOverrides(entries: QueuedOverride[]): void {
  const store = browserStore();
  if (!store) return;
  try {
    if (entries.length) store.setItem(OVERRIDE_QUEUE_KEY, JSON.stringify(entries));
    else store.removeItem(OVERRIDE_QUEUE_KEY);
  } catch {
    // Offline fallback only; the in-memory audit still stands.
  }
}

/** Overrides waiting to reach the server decision log (offline fallback). */
export function pendingOverrideAuditQueue(): QueuedOverride[] {
  return queuedOverrides();
}

function hydrateDraftState(): void {
  if (hydrated) return;
  hydrated = true;
  const store = browserStore();
  if (!store) return;
  try {
    const rawDrafts = store.getItem(DRAFT_KEY);
    const parsedDrafts = rawDrafts ? JSON.parse(rawDrafts) : [];
    if (Array.isArray(parsedDrafts)) drafts.push(...parsedDrafts);
    const rawOverrides = store.getItem(OVERRIDE_KEY);
    const parsedOverrides = rawOverrides ? JSON.parse(rawOverrides) : [];
    if (Array.isArray(parsedOverrides)) overrides.push(...parsedOverrides);
  } catch {
    // Start empty rather than trust a damaged local record.
  }
}

function localId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function _resetMedicationDraftForTest(): void {
  drafts.length = 0;
  overrides.length = 0;
  hydrated = true;
  clearBuyAlerts();
  const store = browserStore();
  store?.removeItem(DRAFT_KEY);
  store?.removeItem(OVERRIDE_KEY);
  store?.removeItem(OVERRIDE_QUEUE_KEY);
}

export function listDrafts(): MedicationDraft[] {
  hydrateDraftState();
  return drafts.map((draft) => ({ ...draft, items: draft.items.map((item) => ({ ...item })) }));
}

export function saveDraft(draft: MedicationDraft): MedicationDraft {
  const index = drafts.findIndex((item) => item.id === draft.id);
  const copy: MedicationDraft = { ...draft, items: draft.items.map((item) => ({ ...item })) };
  if (index >= 0) drafts[index] = copy;
  else drafts.push(copy);
  persistDraftState();
  return copy;
}

export function loadOrCreateDraft(patientId: string, patientName = ""): MedicationDraft {
  hydrateDraftState();
  const existing = drafts.find((draft) => draft.patientId === patientId && draft.status === "editing");
  if (existing) return { ...existing, items: existing.items.map((item) => ({ ...item })) };
  const created: MedicationDraft = {
    id: localId("draft"),
    patientId,
    patientName,
    items: [],
    allergiesText: "",
    currentMedicationsText: "",
    egfrText: "",
    creatinineText: "",
    altText: "",
    astText: "",
    status: "editing",
  };
  drafts.push(created);
  persistDraftState();
  return { ...created, items: [] };
}

export function getOverrideAudit(): OverrideRecord[] {
  hydrateDraftState();
  return overrides.map((entry) => ({ ...entry }));
}

export function recordOverride(input: {
  patientId?: string;
  itemId: string;
  ruleId: string;
  doctorId: string;
  reason: string;
  drug: string;
  dose: string;
  overrideAllowed: boolean;
  at?: string;
}): { ok: true; entry: OverrideRecord } | { ok: false; reason: string } {
  if (!input.overrideAllowed) {
    return { ok: false, reason: "This rule does not allow an override. Edit the medication." };
  }
  if (!input.doctorId.trim()) return { ok: false, reason: "A doctor id is required." };
  if (!input.reason.trim()) return { ok: false, reason: "An override needs a reason." };
  const entry: OverrideRecord = {
    id: localId("override"),
    patientId: input.patientId,
    itemId: input.itemId,
    ruleId: input.ruleId,
    doctorId: input.doctorId,
    reason: input.reason.trim(),
    drug: input.drug,
    dose: input.dose,
    at: input.at ?? new Date().toISOString(),
  };
  overrides.push(entry);
  persistDraftState();
  return { ok: true, entry };
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * Writes one medication-safety override into the R5-01 AI decision log
 * (POST /api/clinical/approval/suggestion, hash-chained on the server).
 * The server takes the actor from the login session. Returns false when the
 * server cannot be reached or refuses, so the caller can queue it offline.
 */
export async function sendOverrideAuditToServer(
  entry: OverrideRecord,
  finding: MedicationFinding,
  fetcher: Fetcher = apiFetch,
): Promise<boolean> {
  if (!entry.patientId) return false;
  try {
    const response = await fetcher("/api/clinical/approval/suggestion", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({
        suggestionId: `med-override-${entry.id}`,
        patientId: entry.patientId,
        kind: "medication",
        source: "medication-safety-override",
        payload: {
          type: "MEDICATION_SAFETY_OVERRIDE",
          overrideId: entry.id,
          itemId: entry.itemId,
          ruleId: entry.ruleId,
          severity: finding.severity,
          message: finding.message,
          doctorId: entry.doctorId,
          reason: entry.reason,
          drug: entry.drug,
          dose: entry.dose,
          at: entry.at,
        },
      }),
    });
    if (!response.ok) return false;
    const body = await response.json().catch(() => null) as { ok?: boolean } | null;
    return body?.ok !== false;
  } catch {
    return false;
  }
}

/** Retries queued overrides. Returns how many reached the server. */
export async function flushOverrideAuditQueue(fetcher: Fetcher = apiFetch): Promise<number> {
  const queue = queuedOverrides();
  if (!queue.length) return 0;
  const remaining: QueuedOverride[] = [];
  let sent = 0;
  for (const item of queue) {
    if (await sendOverrideAuditToServer(item.entry, item.finding, fetcher)) sent += 1;
    else remaining.push(item);
  }
  saveQueuedOverrides(remaining);
  return sent;
}

/**
 * Records the override locally (so the draft knows the red finding was
 * overridden) and sends it to the server decision log. If the server is not
 * reachable the entry goes to a localStorage queue and is retried later.
 */
export async function recordOverrideWithServerAudit(input: Parameters<typeof recordOverride>[0] & {
  finding: MedicationFinding;
  fetcher?: Fetcher;
}): Promise<ReturnType<typeof recordOverride> & { serverLogged?: boolean }> {
  const { finding, fetcher, ...overrideInput } = input;
  const result = recordOverride(overrideInput);
  if (!result.ok) return result;
  await flushOverrideAuditQueue(fetcher ?? apiFetch);
  const serverLogged = await sendOverrideAuditToServer(result.entry, finding, fetcher ?? apiFetch);
  if (!serverLogged) saveQueuedOverrides([...queuedOverrides(), { entry: result.entry, finding }]);
  return { ...result, serverLogged };
}

export function unresolvedRedFindings(
  item: Pick<DraftMedicationItem, "id" | "drug" | "dose">,
  findings: readonly MedicationFinding[],
  audit: readonly OverrideRecord[],
): MedicationFinding[] {
  return findings.filter((finding) => {
    if (finding.severity !== "red") return false;
    if (!finding.overrideAllowed) return true;
    return !audit.some((entry) =>
      entry.itemId === item.id
      && entry.ruleId === finding.ruleId
      && entry.drug === item.drug
      && entry.dose === item.dose
      && entry.reason.trim().length > 0,
    );
  });
}

export interface ConfirmResultOk {
  ok: true;
  event: typeof MEDICATION_DRAFT_CONFIRMED_EVENT;
  draft: MedicationDraft;
  withheld: DraftMedicationItem[];
}

export interface ConfirmResultBlocked {
  ok: false;
  reason: string;
}

export function confirmMedicationDraft(input: {
  draft: MedicationDraft;
  actorId: string;
  actorRole: string;
  findingsByItemId: Record<string, MedicationFinding[]>;
  overrides: readonly OverrideRecord[];
  approval: ApprovalLink;
  now?: string;
}): ConfirmResultOk | ConfirmResultBlocked {
  if (!canAuthorizeClinicalAction(input.actorRole)) {
    return { ok: false, reason: "A doctor confirms medication drafts." };
  }
  if (!input.actorId.trim()) return { ok: false, reason: "A doctor id is required." };
  if (input.draft.status === "confirmed") return { ok: false, reason: "This draft is already confirmed." };

  const selected = input.draft.items.filter((item) => item.selected && item.drug.trim());
  if (!selected.length) {
    return { ok: false, reason: "Nothing is selected. Tick a medication before confirming." };
  }
  for (const item of selected) {
    if (!item.dose.trim() || !item.route.trim() || !item.frequency.trim() || !item.duration.trim()) {
      return { ok: false, reason: "Each selected medication needs a dose, route, frequency, and duration." };
    }
    const blocking = unresolvedRedFindings(item, input.findingsByItemId[item.id] ?? [], input.overrides);
    if (blocking.length) return { ok: false, reason: blocking[0].message };
  }
  if (!input.approval.approved || input.approval.kind !== "medication" || input.approval.patientId !== input.draft.patientId || !input.approval.decisionId) {
    return { ok: false, reason: "This draft is not linked to an approved Doctor Approval Gate decision for this patient." };
  }

  const withheld = input.draft.items.filter((item) => !selected.some((chosen) => chosen.id === item.id));
  const confirmed: MedicationDraft = {
    ...input.draft,
    items: selected.map((item) => ({ ...item })),
    status: "confirmed",
    approvalDecisionId: input.approval.decisionId,
    confirmedAt: input.now ?? new Date().toISOString(),
    confirmedBy: input.actorId,
    event: MEDICATION_DRAFT_CONFIRMED_EVENT,
  };
  saveDraft(confirmed);
  return { ok: true, event: MEDICATION_DRAFT_CONFIRMED_EVENT, draft: confirmed, withheld };
}

export function medicationDraftEvent(draft: MedicationDraft, actorId: string, actorRole: string): Partial<AstraEventEnvelope> {
  return {
    source: "medication-draft",
    target: "pharmacy",
    eventType: MEDICATION_DRAFT_CONFIRMED_EVENT,
    patientRef: draft.patientId,
    actorId,
    actorRole,
    privacyClass: "PHI",
    riskClass: "R3",
    schemaVersion: "1.0",
    payload: {
      draftId: draft.id,
      approvalDecisionId: draft.approvalDecisionId ?? "",
      itemCount: draft.items.length,
      event: MEDICATION_DRAFT_CONFIRMED_EVENT,
    },
  };
}

export async function publishMedicationDraftConfirmed(draft: MedicationDraft, actorId: string, actorRole: string): Promise<AstraEventEnvelope> {
  return astraEventBus.publish(medicationDraftEvent(draft, actorId, actorRole));
}
