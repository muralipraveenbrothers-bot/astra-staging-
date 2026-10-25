export type ExecutionClass = "E0_DETERMINISTIC" | "E1_REASONING" | "E3_CODE" | "E4_UNTRUSTED" | "E5_ADMIN";
export function classifyExecution(text: string | undefined): { executionClass: ExecutionClass; sandboxRequired: boolean; strongIsolation: boolean } {
  const t = (text ?? "").toLowerCase();
  let executionClass: ExecutionClass = "E4_UNTRUSTED";
  if (/\b(who is|show today|show)\b/.test(t)) executionClass = "E1_REASONING";
  if (/\b(run|script|python|code)\b/.test(t)) executionClass = "E3_CODE";
  if (/\bclone|unknown repo\b/.test(t)) executionClass = "E4_UNTRUSTED";
  if (/\bmigrate database|schema\b/.test(t)) executionClass = "E5_ADMIN";
  return { executionClass, sandboxRequired: ["E3_CODE", "E4_UNTRUSTED", "E5_ADMIN"].includes(executionClass), strongIsolation: executionClass === "E4_UNTRUSTED" };
}
export function requiresSandbox(executionClass: ExecutionClass): boolean {
  return ["E3_CODE", "E4_UNTRUSTED", "E5_ADMIN"].includes(executionClass);
}
