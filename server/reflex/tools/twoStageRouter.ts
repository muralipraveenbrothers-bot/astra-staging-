import { authorize } from "../actionAuthority";
import { CATALOG, type CatalogTool } from "./catalog";

export interface StageDecision {
  answer: string;
  abstained?: boolean;
  confidence?: number;
  margin?: number;
}

export interface TwoStageInput {
  dataClass: string;
  role: string;
  provider?: string;
  decide: (schemaId: string) => Promise<StageDecision>;
  complete: (prompt: string) => Promise<string>;
}

const CLOUD = new Set(["omniroute", "freellmapi", "gemini", "openai"]);

export async function routeTwoStage(input: TwoStageInput): Promise<{
  status: "ASK_HUMAN" | "SUGGEST" | "APPROVAL" | "REJECTED" | "EXECUTED";
  llmCalls: number;
  prompt?: string;
  tools: string[];
}> {
  const family = await input.decide("router.tool_family");
  const low = family.abstained || family.answer === "unknown" || family.answer === "human_review" || family.answer === "none" || (family.confidence ?? 1) < 0.65;
  if (low) return { status: "ASK_HUMAN", llmCalls: 0, tools: [] };
  const picked = await input.decide("router.tool_pick");
  const pool = CATALOG.filter((tool) => tool.family === family.answer);
  const chosen: CatalogTool[] = [];
  const named = pool.find((tool) => tool.name === picked.answer);
  if (named) chosen.push(named);
  for (const tool of pool) {
    if (chosen.length >= 3) break;
    if (!chosen.includes(tool)) chosen.push(tool);
  }
  const specs = chosen.slice(0, 3);
  if ((picked.abstained || picked.answer === "unknown") && !named) return { status: "ASK_HUMAN", llmCalls: 0, tools: [] };
  if (input.dataClass === "PHI" && input.provider && CLOUD.has(input.provider)) {
    return { status: "REJECTED", llmCalls: 0, tools: specs.map((tool) => tool.name) };
  }
  const prompt = "tools:\n" + specs.map((tool) => tool.name + ": " + tool.description).join("\n");
  const raw = await input.complete(prompt);
  let args: Record<string, unknown> = {};
  try { args = JSON.parse(raw); } catch { return { status: "REJECTED", llmCalls: 1, prompt, tools: specs.map((tool) => tool.name) }; }
  if (args.valid === false) return { status: "REJECTED", llmCalls: 1, prompt, tools: specs.map((tool) => tool.name) };
  const tool = specs[0];
  const auth = authorize({ action: tool.authorityAction, role: input.role, dataClass: input.dataClass, mode: "SHADOW" });
  if (tool.clinical || auth.level === "DOCTOR_ONLY" || auth.level === "APPROVAL_REQUIRED") {
    return { status: "APPROVAL", llmCalls: 1, prompt, tools: specs.map((item) => item.name) };
  }
  if (!auth.allowed) return { status: "SUGGEST", llmCalls: 1, prompt, tools: specs.map((item) => item.name) };
  return { status: "EXECUTED", llmCalls: 1, prompt, tools: specs.map((item) => item.name) };
}
