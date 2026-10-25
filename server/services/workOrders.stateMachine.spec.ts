import { describe, expect, it } from "vitest";
import { legalTargets, workOrderEngine } from "./workOrders";

describe("work-order transition contract", () => {
  it("allows escalation, delay and cancellation from every non-terminal state", () => {
    for (const state of ["DRAFT", "REQUESTED", "RELEASED", "ACKNOWLEDGED", "IN_PROGRESS", "FAILED", "ESCALATED"] as const) {
      expect(legalTargets(state)).toEqual(expect.arrayContaining(["DELAYED", "ESCALATED", "CANCELLED"]));
    }
    expect(legalTargets("CLOSED")).toEqual([]);
    expect(legalTargets("REJECTED")).toEqual([]);
  });

  it("rejects an illegal transition without mutating the order", () => {
    const order = workOrderEngine.listOrders().find((candidate) => !legalTargets(candidate.status).includes("IN_PROGRESS"));
    if (!order) return;
    const before = order.status;
    expect(() => workOrderEngine.startWork(order.id, "synthetic-test", "admin")).toThrow();
    expect(workOrderEngine.getOrder(order.id)?.status).toBe(before);
  });
});
