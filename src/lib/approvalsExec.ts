// Executes the side effect of an approved request (called once, at decision
// time, from the approvals inbox). Payloads are JSON produced at request time.

import type { ApprovalRequest, Bill, DischargeRecord, PharmacyPurchase } from "./types";

export interface ExecApi {
  addPurchases: (rows: Omit<PharmacyPurchase, "id" | "postedAt">[]) => void;
  addBill: (b: Omit<Bill, "id" | "receiptNo">) => Bill;
  markDischarged: (d: DischargeRecord) => void;
}

export function executeApproval(a: ApprovalRequest, api: ExecApi): string {
  try {
    const p = a.payload ? (JSON.parse(a.payload) as Record<string, never>) : {};
    switch (a.kind) {
      case "purchase": {
        const rows = (p as unknown as { rows: Omit<PharmacyPurchase, "id" | "postedAt">[] }).rows ?? [];
        api.addPurchases(rows);
        return `Purchase register posted — ${rows.length} line(s).`;
      }
      case "refund": {
        const { bill } = p as unknown as { bill: Omit<Bill, "id" | "receiptNo"> };
        const posted = api.addBill(bill);
        return `Reversal posted as ${posted.receiptNo}.`;
      }
      case "discharge": {
        const { discharge } = p as unknown as { discharge: DischargeRecord };
        api.markDischarged(discharge);
        return `${discharge.patientId} marked discharged — bed freed.`;
      }
      default:
        return "Decision logged — no automated side effect for this kind.";
    }
  } catch {
    return "Decision logged (payload execution failed — handle manually).";
  }
}
