import { z } from "zod";
import { CATALOG } from "../tools/catalog";

export const HERMES_ALLOWED_BROWSER_HOSTS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
] as const;

const DATA_CLASSES = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "PHI", "HIGH-RISK CLINICAL"] as const;
const REASONING = ["none", "low", "medium", "high", "specialist"] as const;
const CONTEXT_SIZE = ["small", "medium", "large"] as const;
const TOOL_FAMILIES = [...new Set(CATALOG.map((tool) => tool.family))] as [string, ...string[]];

const secretOrProviderKey = /\b(provider|model|api[_-]?key|token|password|otp|secret)\b/i;

function containsForbiddenKey(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsForbiddenKey);
  return Object.entries(value as Record<string, unknown>).some(([key, child]) => secretOrProviderKey.test(key) || containsForbiddenKey(child));
}

function browserHostAllowed(raw: string): boolean {
  try {
    const url = new URL(raw);
    const origin = url.origin;
    return HERMES_ALLOWED_BROWSER_HOSTS.some((allowed) => allowed === origin);
  } catch {
    return false;
  }
}

export const planStepSchema = z.object({
  id: z.string().trim().min(1).max(80),
  intent: z.string().trim().min(1).max(500),
  toolFamily: z.enum(TOOL_FAMILIES).optional(),
  delegateTo: z.string().trim().min(1).max(80).optional(),
  requirements: z.object({
    reasoning: z.enum(REASONING),
    domain: z.string().trim().min(1).max(80),
    privacy: z.enum(DATA_CLASSES),
    contextSize: z.enum(CONTEXT_SIZE),
  }).strict(),
  browser: z.object({
    goalText: z.string().trim().min(1).max(500),
    allowedHosts: z.array(z.string().trim().min(1)).min(1).max(4),
  }).strict().optional(),
  needsApproval: z.boolean(),
  expectedObservation: z.string().trim().min(1).max(500),
}).strict().superRefine((step, ctx) => {
  for (const host of step.browser?.allowedHosts ?? []) {
    if (!browserHostAllowed(host)) {
      ctx.addIssue({ code: "custom", path: ["browser", "allowedHosts"], message: `host outside allow-list: ${host}` });
    }
  }
});

export const planSchema = z.object({
  goal: z.string().trim().min(1).max(1000),
  dataClass: z.enum(DATA_CLASSES),
  steps: z.array(planStepSchema).max(12),
  successCriteria: z.array(z.string().trim().min(1).max(300)).min(1).max(12),
  stopConditions: z.array(z.string().trim().min(1).max(300)).min(1).max(12),
}).strict().superRefine((plan, ctx) => {
  if (containsForbiddenKey(plan)) {
    ctx.addIssue({ code: "custom", message: "plans may not name providers, models, or secrets" });
  }
});

export type Plan = z.infer<typeof planSchema>;
export type PlanStep = z.infer<typeof planStepSchema>;

export function parsePlan(value: unknown): Plan {
  return planSchema.parse(value);
}

export function safeParsePlan(value: unknown): ReturnType<typeof planSchema.safeParse> {
  return planSchema.safeParse(value);
}
