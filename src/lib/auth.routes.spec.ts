/**
 * ROLE_NAV and ROLE_HOME_URL must stay inside canAccessRoute.
 * A sidebar link that RBAC rejects opens "Access Restricted" instead of the page.
 */
import { describe, expect, it } from "vitest";
import { canAccessRoute, ROLE_HOME_URL, ROLE_NAV, type Role } from "./auth";

const roles = Object.keys(ROLE_NAV) as Role[];

describe("RBAC agrees with navigation", () => {
  it("allows every ROLE_NAV link for that role", () => {
    for (const role of roles) {
      for (const item of ROLE_NAV[role]) {
        expect(canAccessRoute(role, item.path), `${role} → ${item.label} (${item.path})`).toBe(true);
      }
    }
  });

  it("allows every ROLE_HOME_URL", () => {
    for (const role of Object.keys(ROLE_HOME_URL) as Role[]) {
      expect(canAccessRoute(role, ROLE_HOME_URL[role]), `${role} home ${ROLE_HOME_URL[role]}`).toBe(true);
    }
  });
});
