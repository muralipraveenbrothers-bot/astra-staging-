/**
 * Browser helper for the shared workflow guard.
 * The server is authoritative. If it cannot be reached, the local guard fails closed.
 */
import { recordOrderEvent, decideWorkflowAction, type WorkflowAction } from "./workflowGuard";
import type { WorkflowDepartment } from "./orderEvents";

export interface WorkflowExecuteResult {
  allowed: boolean;
  message: string;
  billLabel?: string;
  chip?: string;
}

function browserToken(): string {
  try {
    return typeof localStorage === "undefined" ? "" : localStorage.getItem("astra.serverToken") ?? "";
  } catch {
    return "";
  }
}

export async function executeWorkflowAction(input: {
  action: WorkflowAction;
  patientUhid: string;
  orderId?: string;
  department?: WorkflowDepartment;
  actorId: string;
  actorRole: string;
  device: string;
  adminPin?: string;
  adminReason?: string;
  billed?: boolean;
}): Promise<WorkflowExecuteResult> {
  const token = browserToken();
  if (token) {
    try {
      const response = await fetch("/api/workflow/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: input.action,
          patientUhid: input.patientUhid,
          orderId: input.orderId ?? "",
          department: input.department,
          adminPin: input.adminPin ?? "",
          adminReason: input.adminReason ?? "",
        }),
      });
      const body = await response.json().catch(() => ({} as Record<string, unknown>));
      if (response.ok || response.status === 403) {
        return {
          allowed: response.ok && body.allowed !== false,
          message: String(body.message ?? (response.ok ? "Allowed" : "Blocked by a workflow hard-stop.")),
          billLabel: typeof body.billLabel === "string" ? body.billLabel : undefined,
          chip: typeof body.chip === "string" ? body.chip : undefined,
        };
      }
    } catch {
      // The local guard below still refuses unpaid or unsigned work.
    }
  }
  const decision = decideWorkflowAction({
    action: input.action,
    actor: { id: input.actorId, role: input.actorRole, device: input.device },
    patientUhid: input.patientUhid,
    orderId: input.orderId,
    department: input.department,
    paid: false,
    prescriptionConfirmed: false,
    doctorAdmissionOrder: false,
    emergency: false,
    billed: input.billed ?? false,
  });
  return { allowed: decision.allowed, message: decision.message, billLabel: decision.billLabel, chip: decision.chip };
}

export async function publishWorkflowEvent(input: {
  event: string;
  patientUhid: string;
  orderId?: string;
  department?: WorkflowDepartment;
  actorId: string;
  actorRole: string;
  device: string;
}): Promise<void> {
  recordOrderEvent(input);
  const token = browserToken();
  if (!token) return;
  try {
    await fetch("/api/workflow/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    });
  } catch {
    // The local record still updates this workstation.
  }
}
