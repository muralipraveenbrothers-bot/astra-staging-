import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { classifyOrderRisk, isOrderApprovalEnforced } from "./orderRisk";

describe("order risk classifier", () => {
  let previousConfig: string | undefined;
  let previousFlag: string | undefined;
  let tempConfig: string;

  beforeEach(() => {
    previousConfig = process.env.ASTRA_ORDER_RISK_CONFIG_PATH;
    previousFlag = process.env.ASTRA_ORDER_APPROVAL_ENFORCE;
    tempConfig = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "astra-risk-")), "order-risk.json");
    fs.writeFileSync(tempConfig, JSON.stringify({ reviewedStandardCodes: ["SYNTH-STANDARD"] }));
    process.env.ASTRA_ORDER_RISK_CONFIG_PATH = tempConfig;
    delete process.env.ASTRA_ORDER_APPROVAL_ENFORCE;
  });

  afterEach(() => {
    if (previousConfig === undefined) delete process.env.ASTRA_ORDER_RISK_CONFIG_PATH;
    else process.env.ASTRA_ORDER_RISK_CONFIG_PATH = previousConfig;
    if (previousFlag === undefined) delete process.env.ASTRA_ORDER_APPROVAL_ENFORCE;
    else process.env.ASTRA_ORDER_APPROVAL_ENFORCE = previousFlag;
    fs.rmSync(path.dirname(tempConfig), { recursive: true, force: true });
  });

  it("classifies unknown and missing codes as HIGH", () => {
    expect(classifyOrderRisk({ order: {}, serviceCode: "SYNTH-UNKNOWN" })).toBe("HIGH");
    expect(classifyOrderRisk({ order: {} })).toBe("HIGH");
  });

  it("classifies only the configured reviewed code as STANDARD", () => {
    expect(classifyOrderRisk({ order: {}, serviceCode: "SYNTH-STANDARD" })).toBe("STANDARD");
  });

  it("fails closed for an emergency without a lookup", () => {
    expect(classifyOrderRisk({ order: {}, emergencyRecordId: "synthetic-emergency" })).toBe("HIGH");
  });

  it("returns EMERGENCY only for a fully validated injected record", () => {
    expect(classifyOrderRisk({
      order: {},
      emergencyRecordId: "synthetic-emergency",
      lookupEmergency: () => ({ exists: true, unexpired: true, namedDoctorValid: true, overdueTaskExists: true }),
    })).toBe("EMERGENCY");
  });

  it("defaults approval enforcement to OFF", () => {
    expect(isOrderApprovalEnforced()).toBe(false);
  });
});
