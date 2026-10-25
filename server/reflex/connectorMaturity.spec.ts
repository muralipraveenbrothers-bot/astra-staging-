import { beforeEach, describe, expect, it } from "vitest";
import { changeConnectorStage, writeAllowed, _resetConnectorsForTest } from "./connectorMaturity";

describe("connector maturity", () => {
  beforeEach(() => _resetConnectorsForTest());

  it("blocks WhatsApp sends until sandbox and rejects a stage change without a reason", () => {
    changeConnectorStage({ id: "whatsapp", stage: "SHADOW", role: "admin", reason: "shadow the connector first" });
    expect(writeAllowed("whatsapp", "sandbox").level).toBe("FORBIDDEN");
    changeConnectorStage({ id: "whatsapp", stage: "SANDBOX_WRITE", role: "admin", reason: "open the sandbox target only" });
    expect(writeAllowed("whatsapp", "sandbox").allowed).toBe(false);
    expect(writeAllowed("whatsapp", "sandbox").level).not.toBe("FORBIDDEN");
    expect(writeAllowed("whatsapp", "production").level).toBe("FORBIDDEN");
    expect(changeConnectorStage({ id: "whatsapp", stage: "FULL", role: "admin", reason: "no" }).ok).toBe(false);
  });
});
