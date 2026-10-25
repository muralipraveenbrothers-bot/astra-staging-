const revoked = new Set<string>();
const ROLE_PERMS: Record<string, string[]> = {
  doctor: ["READ_PATIENT", "READ_LAB_RESULT", "CREATE_MEDICATION_ORDER"],
  reception: ["READ_PATIENT"],
  lab: ["READ_LAB_RESULT"],
};

export function issueCapsule(input: {
  issuedBy: { userId: string; role: string };
  patientBinding: { patientId: string };
  permissions: string[];
  activeWork: Record<string, unknown>;
  audience: string;
  ttlMinutes?: number;
  now?: Date;
}) {
  const held = ROLE_PERMS[input.issuedBy.role] ?? [];
  const missing = input.permissions.filter((p) => !held.includes(p));
  if (missing.length) return { ok: false, errors: [`PERMISSION_ESCALATION: ${missing.join(",")}`] };
  const now = input.now ?? new Date();
  return {
    ok: true,
    capsule: {
      capsuleId: `CAP-${Math.random().toString(36).slice(2)}`,
      ...input,
      issuedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + (input.ttlMinutes ?? 15) * 60_000).toISOString(),
    },
  };
}

export function openCapsule(capsule: ReturnType<typeof issueCapsule>["capsule"] | undefined, opener: { userId: string; role: string; patientId: string; now?: Date }) {
  if (!capsule) return { ok: false, errors: ["missing capsule"] };
  if (revoked.has(capsule.capsuleId)) return { ok: false, errors: ["revoked capsule"] };
  if (capsule.patientBinding.patientId !== opener.patientId) return { ok: false, errors: ["WRONG_PATIENT"] };
  if (new Date(capsule.expiresAt).getTime() <= (opener.now ?? new Date()).getTime()) return { ok: false, errors: ["expired capsule"] };
  const held = ROLE_PERMS[opener.role] ?? [];
  if (capsule.permissions.some((p) => !held.includes(p))) return { ok: false, errors: ["PERMISSION_DENIED"] };
  return { ok: true, capsule };
}

export function revokeCapsule(capsuleId: string): void {
  revoked.add(capsuleId);
}
