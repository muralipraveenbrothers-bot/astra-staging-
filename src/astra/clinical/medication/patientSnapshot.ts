/**
 * Pre-fills the medication draft's allergy and organ-function fields from the
 * R5-02 patient snapshot (the same patient record the clinical ingress reads)
 * and the patient's completed lab results. Values stay editable; nothing is
 * invented. A field is only filled when it is empty in the draft.
 */
import { apiFetch } from "../../../services/apiFetch";
import type { MedicationDraft } from "./types";

export interface MedicationSnapshotSource {
  allergies?: string[] | string | null;
  labs?: Record<string, string | number | null | undefined> | null;
}

export interface SnapshotLabOrder {
  item: string;
  result?: string | null;
  status?: string;
  completedAt?: string;
  orderedAt?: string;
}

export interface MedicationPrefill {
  allergiesText: string;
  egfrText: string;
  creatinineText: string;
  altText: string;
  astText: string;
}

type PrefillField = Exclude<keyof MedicationPrefill, "allergiesText">;

const LAB_KEYS: Record<PrefillField, { keys: string[]; pattern: RegExp }> = {
  egfrText: { keys: ["egfr", "estimatedgfr", "gfr"], pattern: /\be-?gfr\b|estimated\s+gfr/i },
  creatinineText: { keys: ["creatinine", "serumcreatinine", "screatinine", "cr"], pattern: /\bcreatinine\b|\bs\.?\s*cr\b/i },
  altText: { keys: ["alt", "sgpt"], pattern: /\balt\b|\bsgpt\b/i },
  astText: { keys: ["ast", "sgot"], pattern: /\bast\b|\bsgot\b/i },
};

function firstNumber(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return "";
  const match = value.match(/-?\d+(?:\.\d+)?/);
  return match ? match[0] : "";
}

function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function valueFromLabs(labs: MedicationSnapshotSource["labs"], field: PrefillField): string {
  if (!labs) return "";
  const wanted = LAB_KEYS[field].keys;
  for (const [key, value] of Object.entries(labs)) {
    if (wanted.includes(normaliseKey(key))) {
      const text = firstNumber(value);
      if (text) return text;
    }
  }
  return "";
}

/** Reads a number that follows the analyte name, e.g. "Creatinine 1.8 mg/dL; ALT 64 U/L". */
function valueFromResultText(text: string, field: PrefillField): string {
  const { pattern } = LAB_KEYS[field];
  const source = new RegExp(`(?:${pattern.source})\\s*[:=\\-]?\\s*(-?\\d+(?:\\.\\d+)?)`, "i");
  const match = text.match(source);
  return match ? match[1] : "";
}

function valueFromOrders(orders: readonly SnapshotLabOrder[], field: PrefillField): string {
  const completed = orders
    .filter((order) => order.result && (!order.status || order.status === "completed"))
    .sort((a, b) => String(b.completedAt ?? b.orderedAt ?? "").localeCompare(String(a.completedAt ?? a.orderedAt ?? "")));
  for (const order of completed) {
    const inResult = valueFromResultText(String(order.result), field);
    if (inResult) return inResult;
    if (LAB_KEYS[field].pattern.test(order.item)) {
      const bare = firstNumber(order.result);
      if (bare) return bare;
    }
  }
  return "";
}

export function prefillFromSnapshot(
  snapshot: MedicationSnapshotSource | null | undefined,
  labOrders: readonly SnapshotLabOrder[] = [],
): MedicationPrefill {
  const allergies = snapshot?.allergies;
  const allergiesText = Array.isArray(allergies)
    ? allergies.map((entry) => String(entry).trim()).filter(Boolean).join(", ")
    : typeof allergies === "string" ? allergies.trim() : "";
  const pick = (field: PrefillField) => valueFromLabs(snapshot?.labs, field) || valueFromOrders(labOrders, field);
  return {
    allergiesText,
    egfrText: pick("egfrText"),
    creatinineText: pick("creatinineText"),
    altText: pick("altText"),
    astText: pick("astText"),
  };
}

/** Fills only empty draft fields. Returns the same object when nothing changes. */
export function applyPrefill(draft: MedicationDraft, prefill: MedicationPrefill): MedicationDraft {
  const next = { ...draft };
  let changed = false;
  for (const key of Object.keys(prefill) as Array<keyof MedicationPrefill>) {
    if (!String(draft[key] ?? "").trim() && prefill[key]) {
      next[key] = prefill[key];
      changed = true;
    }
  }
  return changed ? next : draft;
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * Loads the patient record and completed lab orders from the local hospital
 * server. Returns null when the patient is unknown or the server is offline.
 */
export async function loadMedicationPrefill(patientId: string, fetcher: Fetcher = apiFetch): Promise<MedicationPrefill | null> {
  const id = patientId.trim();
  if (!id) return null;
  try {
    const patientResponse = await fetcher(`/api/hospital/patients/${encodeURIComponent(id)}`);
    if (!patientResponse.ok) return null;
    const patientBody = await patientResponse.json() as { patient?: MedicationSnapshotSource & { id?: string; uhid?: string } };
    const patient = patientBody.patient;
    if (!patient) return null;
    let orders: SnapshotLabOrder[] = [];
    try {
      const ordersResponse = await fetcher(`/api/hospital/orders?category=laboratory&patientId=${encodeURIComponent(patient.uhid || id)}`);
      if (ordersResponse.ok) {
        const ordersBody = await ordersResponse.json() as { orders?: SnapshotLabOrder[] };
        orders = Array.isArray(ordersBody.orders) ? ordersBody.orders : [];
      }
    } catch {
      orders = [];
    }
    return prefillFromSnapshot(patient, orders);
  } catch {
    return null;
  }
}
