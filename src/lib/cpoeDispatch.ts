/**
 * CPOE order dispatch (Round 4 prompt 10).
 *
 * Honest contract: an order is reported as dispatched ONLY when the hospital
 * command server (POST /api/command/execute) answers 2xx with success:true AND
 * returns a real order id. Anything else (network error, 401/403/5xx,
 * success:false, missing id) is a failure and the caller must keep the order
 * as a draft. No client-side fabricated order ids, ever.
 */
import { apiFetch, authHeaders } from "@/services/apiFetch";

export type CpoeDispatchResult =
  | { ok: true; orderId: string; message?: string }
  | { ok: false; error: string };

export interface CpoeDraftLike {
  itemSummary?: string;
  items?: string[];
  patientUhid?: string;
  patientName?: string;
  patientId?: string;
}

/** Build the command-engine query for a draft. Prefers the UHID (unambiguous). */
export function draftOrderQuery(order: CpoeDraftLike): { query: string; contextPatientId?: string } | null {
  const items = order.items?.length ? order.items.join(" + ") : order.itemSummary?.trim();
  const patient = order.patientUhid?.trim() || order.patientId?.trim() || order.patientName?.trim();
  if (!items || !patient) return null;
  return { query: `Order ${items} for ${patient}`, contextPatientId: patient };
}

export async function dispatchCpoeOrder(
  query: string,
  contextPatientId?: string,
  fetcher: typeof apiFetch = apiFetch,
  approvalDecisionId?: string,
): Promise<CpoeDispatchResult> {
  let res: Response;
  try {
    res = await fetcher("/api/command/execute", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({
        query,
        confirmed: true,
        contextPatientId,
        ...(approvalDecisionId ? { isAiGenerated: true, source: "scientist", approvalDecisionId } : {}),
      }),
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Could not reach the hospital command server." };
  }
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    const fallback = res.status === 401 ? "Please log in again - the server rejected this session." : `Server rejected the order (HTTP ${res.status}).`;
    return { ok: false, error: data?.message || data?.error || fallback };
  }
  const orderId = data.data?.id || data.data?.orderId || data.order?.id || data.orderId;
  if (!orderId) return { ok: false, error: "Server did not return an order ID." };
  return { ok: true, orderId: String(orderId), message: data.message };
}

export function investigationOrderQuery(item: {
  name: string;
  orderCategory: "laboratory" | "radiology" | "clinical";
}, patientUhid: string): { query: string; contextPatientId: string } | null {
  if (!patientUhid || item.orderCategory === "clinical") return null;
  const prefix = item.orderCategory === "radiology" ? "Order radiology" : "Order";
  return { query: `${prefix} ${item.name} for ${patientUhid}`, contextPatientId: patientUhid };
}
