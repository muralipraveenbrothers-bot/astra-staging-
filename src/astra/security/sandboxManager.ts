import type { ExecutionClass } from "./executionClasses";
export function createSandbox(input: { executionClass: ExecutionClass; networkPolicy?: string; cpuLimit?: number; memoryMb?: number; ttlSeconds?: number; filesystemPolicy?: "EPHEMERAL" | "HOST"; credentials?: string[] }) {
  if (input.executionClass === "E1_REASONING") return { ok: false, errors: ["no sandbox needed"] };
  if (input.executionClass === "E5_ADMIN") return { ok: false, errors: ["human authorization required"] };
  if (input.credentials?.some((c) => /PASSWORD|SECRET|TOKEN|KEY/i.test(c))) return { ok: false, errors: ["long-lived credentials denied"] };
  if (input.executionClass === "E3_CODE" && input.networkPolicy === "FULL_ALLOWLIST") return { ok: false, errors: ["network policy wider than the class default"] };
  return { ok: true, sandbox: { sandboxId: `SBX-${Date.now()}`, status: "READY", hostAccess: "NONE", filesystemPolicy: input.filesystemPolicy ?? "EPHEMERAL" } };
}
