export type CredentialVerdict =
  | "MINTED"
  | "DENY_UNKNOWN_SKILL"
  | "DENY_SCOPE_ESCALATION"
  | "DENY_ACTOR_NOT_AUTHORIZED";

export interface ScopedCredential {
  token: string;
  scopes: string[];
  skill: string;
  actorId: string;
  expiresAt: string;
}

export const SKILL_CREDENTIAL_SCOPE_CATALOG: Record<string, string[]> = {
  "lab.result.read": ["READ_LAB_RESULT"],
  "lab.result.write": ["READ_LAB_RESULT", "WRITE_LAB_RESULT"],
  "lab.order.create": ["READ_PATIENT", "WRITE_LAB_ORDER"],
  "patient.summary.read": ["READ_PATIENT"],
  "pharmacy.dispense": ["DISPENSE_MEDICATION"],
  "evidence.search": ["EVIDENCE_SEARCH"],
};

const ROLE_SCOPES: Record<string, string[]> = {
  doctor: ["READ_PATIENT", "READ_LAB_RESULT", "WRITE_LAB_ORDER", "CREATE_MEDICATION_ORDER", "EVIDENCE_SEARCH"],
  admin: ["READ_PATIENT", "READ_LAB_RESULT", "WRITE_LAB_RESULT", "WRITE_LAB_ORDER", "DISPENSE_MEDICATION", "EVIDENCE_SEARCH"],
  lab: ["READ_LAB_RESULT", "WRITE_LAB_RESULT"],
  pharmacy: ["DISPENSE_MEDICATION"],
  pharmacist: ["DISPENSE_MEDICATION"],
  reception: ["READ_PATIENT"],
};

const issued = new Map<string, ScopedCredential>();

export function mintScopedCredential(input: {
  skill: string;
  requestedScopes: string[];
  actor: { userId: string; role: string };
  ttlSeconds?: number;
  now?: Date;
}): { verdict: CredentialVerdict; credential?: ScopedCredential; reasons: string[] } {
  const allowed = SKILL_CREDENTIAL_SCOPE_CATALOG[input.skill];
  if (!allowed) return { verdict: "DENY_UNKNOWN_SKILL", reasons: ["UNKNOWN_SKILL"] };
  const escalated = input.requestedScopes.filter((scope) => !allowed.includes(scope));
  if (escalated.length) return { verdict: "DENY_SCOPE_ESCALATION", reasons: escalated.map((s) => `SCOPE_ESCALATION:${s}`) };
  const held = ROLE_SCOPES[input.actor.role.toLowerCase()] ?? [];
  const missing = input.requestedScopes.filter((scope) => !held.includes(scope));
  if (missing.length) return { verdict: "DENY_ACTOR_NOT_AUTHORIZED", reasons: missing.map((s) => `RBAC_DENIED:${s}`) };
  const now = input.now ?? new Date();
  const credential: ScopedCredential = {
    token: `astra-cred-${input.actor.userId}-${Math.random().toString(36).slice(2)}`,
    scopes: [...input.requestedScopes],
    skill: input.skill,
    actorId: input.actor.userId,
    expiresAt: new Date(now.getTime() + (input.ttlSeconds ?? 300) * 1000).toISOString(),
  };
  issued.set(credential.token, credential);
  return { verdict: "MINTED", credential, reasons: [] };
}

export function redeemScopedCredential(token: string, requiredScope: string, now = new Date()):
  | { verdict: "REDEEMED"; credential: ScopedCredential }
  | { verdict: "DENY_UNKNOWN_TOKEN" | "DENY_EXPIRED" | "DENY_SCOPE_INSUFFICIENT"; reasons: string[] } {
  const credential = issued.get(token);
  if (!credential) return { verdict: "DENY_UNKNOWN_TOKEN", reasons: ["UNKNOWN_TOKEN"] };
  if (new Date(credential.expiresAt).getTime() <= now.getTime()) {
    issued.delete(token);
    return { verdict: "DENY_EXPIRED", reasons: ["EXPIRED"] };
  }
  if (!credential.scopes.includes(requiredScope)) return { verdict: "DENY_SCOPE_INSUFFICIENT", reasons: ["SCOPE_INSUFFICIENT"] };
  return { verdict: "REDEEMED", credential };
}

export function redactSecretsForModelContext<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => redactSecretsForModelContext(item)) as T;
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = /password|secret|token|api[_-]?key|admin[_-]?key/i.test(key)
      ? "[REDACTED_BY_CREDENTIAL_BROKER]"
      : redactSecretsForModelContext(inner);
  }
  return out as T;
}
