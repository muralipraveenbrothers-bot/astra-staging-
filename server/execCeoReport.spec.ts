import { describe, expect, it } from "vitest";
import { execCeoAgent } from "../src/agents/executive/ExecCeoAgent";

describe("executive CEO live snapshot report", () => {
  it("summarizes operational data and raises accountable exceptions", async () => {
    const report = await execCeoAgent.generateReport({ query: "overview", domain: "operations" }, {
      orders: [{ department: "lab", status: "IN_PROGRESS", dueAt: "2020-01-01T00:00:00.000Z" }],
      bills: [{ totalAmount: 1000, paidAmount: 400 }],
      staff: [{ department: "lab", status: "active" }],
      alerts: [{ severity: "critical", status: "open" }],
    });
    expect(report.success).toBe(true);
    expect(report.data).not.toHaveProperty("status", "data_placeholder");
    expect((report.data as any).orders.overdue).toBe(1);
    expect(report.alerts).toHaveLength(3);
  });
});
