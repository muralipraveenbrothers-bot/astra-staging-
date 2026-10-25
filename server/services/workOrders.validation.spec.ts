import { describe, expect, it } from "vitest";
import { workOrderEngine } from "./workOrders";

describe("persisted work-order validation", () => {
  it("reports only contract issues without mutating persisted records", () => {
    const before = workOrderEngine.listOrders().map((order) => ({ id: order.id, status: order.status }));
    const issues = workOrderEngine.validatePersistedOrders();
    expect(Array.isArray(issues)).toBe(true);
    for (const issue of issues) {
      expect(issue.orderId).toBeTruthy();
      expect(issue.issues.length).toBeGreaterThan(0);
      expect(issue.issues.every((detail) => detail.includes("status") || detail.includes("missing"))).toBe(true);
    }
    expect(workOrderEngine.listOrders().map((order) => ({ id: order.id, status: order.status }))).toEqual(before);
  });
});
