import { describe, expect, it } from "vitest";
import { mcpReconnectDelay } from "./mcpConnectionManager";
import { formatMcpDisplayStatus, mcpRegistry } from "./mcpRegistry";

describe("MCP reconnect policy", () => {
  it("uses exponential retry delays with no more than one retry per 15 minutes", () => {
    expect(mcpReconnectDelay(1)).toBe(15 * 60 * 1000);
    expect(mcpReconnectDelay(2)).toBe(30 * 60 * 1000);
    expect(mcpReconnectDelay(3)).toBe(60 * 60 * 1000);
    expect(mcpReconnectDelay(100)).toBe(4 * 60 * 60 * 1000);
  });

  it("formats disabled reasons and configures the system BioMCP executable", () => {
    expect(formatMcpDisplayStatus("DISABLED", "blocked by Windows code integrity"))
      .toBe("disabled (blocked by Windows code integrity)");
    const biomcpConfig = mcpRegistry.getConfig("biomcp");
    expect(biomcpConfig?.status).toBe("enabled");
    expect(biomcpConfig?.command).toMatch(/Python312\/Scripts\/biomcp\.exe$/i);
    expect(biomcpConfig?.args).toEqual(["mcp"]);
    expect(formatMcpDisplayStatus("CONNECTED")).toBe("CONNECTED");
  });
});
