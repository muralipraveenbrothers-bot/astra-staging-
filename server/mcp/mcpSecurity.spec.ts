import { describe, expect, it } from "vitest";
import { gateMcpTool } from "./mcpSecurity";

describe("MCP fail-closed permission gate", () => {
  it("keeps deny-listed and critical tools denied even when approval is attempted", () => {
    const denied = gateMcpTool({ allowedRoles: ["doctor"], denyTools: ["delete_patient"] }, "doctor", "delete_patient", {});
    expect(denied.allowed).toBe(false);
    const critical = gateMcpTool({ allowedRoles: ["doctor"] }, "doctor", "drop_database", {});
    expect(critical.allowed).toBe(false);
  });
});
