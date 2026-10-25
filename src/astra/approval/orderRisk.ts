import fs from "fs";
import path from "path";

export type RiskTier = "STANDARD" | "HIGH" | "EMERGENCY";

export const REVIEWED_STANDARD_CODES = new Set<string>();

export function riskRank(tier: RiskTier): number {
  return tier === "STANDARD" ? 0 : tier === "HIGH" ? 1 : 2;
}

type EmergencyLookup = (id: string) => {
  exists: boolean;
  unexpired: boolean;
  namedDoctorValid: boolean;
  overdueTaskExists: boolean;
} | undefined;

function standardCodes(): Set<string> {
  const configured = process.env.ASTRA_ORDER_RISK_CONFIG_PATH
    ? path.resolve(process.env.ASTRA_ORDER_RISK_CONFIG_PATH)
    : path.resolve(process.cwd(), "config", "order-risk.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(configured, "utf8")) as { reviewedStandardCodes?: unknown };
    return new Set(Array.isArray(parsed.reviewedStandardCodes)
      ? parsed.reviewedStandardCodes.filter((code): code is string => typeof code === "string" && code.length > 0)
      : []);
  } catch {
    return REVIEWED_STANDARD_CODES;
  }
}

export function classifyOrderRisk(input: {
  order: Record<string, unknown>;
  serviceCode?: string;
  emergencyRecordId?: string;
  lookupEmergency?: EmergencyLookup;
}): RiskTier {
  if (input.emergencyRecordId) {
    const record = input.lookupEmergency?.(input.emergencyRecordId);
    if (record?.exists && record.unexpired && record.namedDoctorValid && record.overdueTaskExists) {
      return "EMERGENCY";
    }
    return "HIGH";
  }

  const code = input.serviceCode ?? (typeof input.order.serviceCode === "string" ? input.order.serviceCode : undefined);
  return code && standardCodes().has(code) ? "STANDARD" : "HIGH";
}

export function isOrderApprovalEnforced(): boolean {
  return /^(1|true|on|yes)$/i.test(process.env.ASTRA_ORDER_APPROVAL_ENFORCE ?? "");
}
