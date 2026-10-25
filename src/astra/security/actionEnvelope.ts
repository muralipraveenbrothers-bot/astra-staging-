export interface AstraActionEnvelope {
  actor: { userId: string; name?: string; role: string };
  skill: string;
  payload: Record<string, unknown>;
  patientContext?: { patientId?: string } | null;
  contextVersion: number;
  idempotencyKey: string;
  correlationId: string;
}

export function buildActionEnvelope(input: AstraActionEnvelope): AstraActionEnvelope {
  return { ...input, payload: input.payload ?? {} };
}

export function validateActionEnvelope(env: unknown): { ok: boolean; errors: string[] } {
  const e = env as Partial<AstraActionEnvelope> | null;
  const errors: string[] = [];
  if (!e || typeof e !== "object") return { ok: false, errors: ["envelope required"] };
  if (!e.correlationId) errors.push("correlationId required");
  if (!e.idempotencyKey) errors.push("idempotencyKey required");
  if (!e.actor?.userId) errors.push("actor.userId required");
  if (!e.actor?.role) errors.push("actor.role required");
  if (!e.skill) errors.push("skill required");
  return { ok: errors.length === 0, errors };
}
