import { checkEgress } from "./egressAllowList";
import type { AstraActionEnvelope } from "./actionEnvelope";

export function envelopeEgressTargets(env: AstraActionEnvelope): string[] {
  const text = JSON.stringify(env.payload ?? {});
  return text.match(/https?:\/\/[^\s"',}]+/g) ?? [];
}

export function screenEnvelopePayload(env: AstraActionEnvelope): { clean: boolean; findings: Array<{ kind: string; detail: string }> } {
  const text = JSON.stringify(env.payload ?? {});
  const findings: Array<{ kind: string; detail: string }> = [];
  if (/ignore all previous|developer mode|system prompt/i.test(text)) findings.push({ kind: "PROMPT_INJECTION", detail: "prompt injection phrase" });
  if (/\bselect\b.+\bfrom\b|drop\s+table/i.test(text)) findings.push({ kind: "ARBITRARY_SQL", detail: "sql phrase" });
  if (/\brm\s+-rf\b|shutdown\s+\/s|powershell|cmd\.exe/i.test(text)) findings.push({ kind: "SHELL_ACCESS", detail: "shell phrase" });
  if (/password|secret|api[_-]?key|token/i.test(text)) findings.push({ kind: "CREDENTIAL_EXFILTRATION", detail: "credential phrase" });
  for (const target of envelopeEgressTargets(env)) {
    if (checkEgress(target).verdict !== "ALLOW") findings.push({ kind: "EGRESS_ESCAPE", detail: target });
  }
  return { clean: findings.length === 0, findings };
}
