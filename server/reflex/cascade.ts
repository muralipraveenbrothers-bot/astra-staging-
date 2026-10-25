import { MICRO_ASTRA_TOOLS } from "./tools/catalog";
import { resolvedRisk, type RiskBand } from "./actionAuthority";

const BANNED = ["issue_refund", "sign_prescription", "delete_patient", "finalize_discharge", "alter_medication"];

export interface CascadeGatewayCall { tier: string; tools: string[]; localOnly?: boolean }
export interface CascadeInput {
  text: string;
  tier?: string;
  micro?: "yes" | "no" | "uncertain";
  action?: string;
  layaRisk?: number;
  dataClass?: string;
  gateway: (call: CascadeGatewayCall) => Promise<{ ok: boolean }>;
}

export async function runCascade(input: CascadeInput): Promise<{ tier: string; llmCalls: number; hops: string[]; tools: string[]; risk: RiskBand }> {
  const hops: string[] = [];
  const action = input.action ?? "queue_sort";
  const laya = input.layaRisk != null ? (input.layaRisk >= 4 ? "high" : input.layaRisk <= 1 ? "low" : "medium") : undefined;
  const risk = resolvedRisk(action, laya as RiskBand | undefined);
  let tier = input.tier ?? "T1";
  if (input.micro === "uncertain" && tier === "T2") tier = "T3";
  if (tier === "T0" || tier === "T1") return { tier, llmCalls: 0, hops: [tier], tools: [], risk };
  if (tier === "T5") return { tier: "T5", llmCalls: 0, hops: ["T5"], tools: [], risk };
  if (tier === "T2") {
    const tools = MICRO_ASTRA_TOOLS.filter((name) => !BANNED.includes(name));
    hops.push("T2");
    const result = await input.gateway({ tier: "T2", tools: [...tools], localOnly: true });
    if (result.ok) return { tier: "T2", llmCalls: 1, hops, tools: [...tools], risk };
    hops.push("T3");
    const localOnly = input.dataClass === "PHI";
    await input.gateway({ tier: "T3", tools: [], localOnly });
    return { tier: "T3", llmCalls: 2, hops, tools: [...tools], risk };
  }
  hops.push(tier);
  const localOnly = input.dataClass === "PHI";
  await input.gateway({ tier, tools: [], localOnly });
  return { tier, llmCalls: 1, hops, tools: [], risk };
}
