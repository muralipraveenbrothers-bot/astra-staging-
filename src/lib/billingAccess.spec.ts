import { describe, expect, it } from "vitest";
import { billingCommandError } from "../components/Intelligence/BillingDashboard";
import { ROLE_NAV, visibleNavForRole } from "./auth";

describe("billing access presentation", () => {
  it("maps a billing 403 to a role-safe message", () => {
    expect(billingCommandError(403, "Billing command HTTP 403")).toBe("You don't have access to Billing with your role");
    expect(billingCommandError(500, "Billing command HTTP 500")).toBe("Billing command HTTP 500");
  });
  it("filters navigation entries through the existing role map", () => {
    const lab = visibleNavForRole("lab", [...ROLE_NAV.lab, { label: "Billing", path: "/billing", icon: "FileText" }]);
    expect(lab.every((item) => item.path !== "/billing")).toBe(true);
    expect(lab.some((item) => item.path === "/lab")).toBe(true);
  });
});
