import crypto from "node:crypto";

export interface PhiJanitorStores {
  clearConversationMemory(userId: string): number | void;
  clearAvatarVoiceContext(userId: string): number | void;
  clearSecondBrainContext(userId: string): number | void;
  clearRequestCaches(): number | void;
}
export interface PatientContextState { patientId: string; version: number }
export type PatientContextSwitchResult = { ok: true; changed: boolean; contextVersion: number } | { ok: false; reason: "PHI_JANITOR_DISABLED" | "AMBIGUOUS_PATIENT_CONTEXT" | "STALE_PATIENT_CONTEXT" | "PATIENT_CONTEXT_CLEAR_FAILED" };
export interface PhiJanitorAudit { (event: { action: string; status: "SUCCESS" | "DENIED" | "FAILED"; details: Record<string, unknown> }): void }

const processSalt = crypto.randomBytes(32).toString("hex");
const enabled = () => process.env.ASTRA_PHI_JANITOR === "true";
const hash = (id: string) => crypto.createHash("sha256").update(`${process.env.ASTRA_PHI_JANITOR_SALT?.trim() || processSalt}:${id}`).digest("hex");

/** Server-owned active patient context; switching is only valid through this method. */
export class PhiJanitor {
  private readonly active = new Map<string, PatientContextState>();
  constructor(private readonly stores: PhiJanitorStores, private readonly audit: PhiJanitorAudit) {}
  getActive(userId: string): PatientContextState | undefined { const v = this.active.get(userId); return v ? { ...v } : undefined; }
  requestSwitch(input: { userId: string; patientId: string; expectedCurrentPatientId?: string | null }): PatientContextSwitchResult {
    if (!enabled()) return { ok: false, reason: "PHI_JANITOR_DISABLED" };
    const patientId = input.patientId.trim();
    if (!patientId) { this.audit({ action: "PHI_CONTEXT_SWITCH", status: "DENIED", details: { reason: "AMBIGUOUS_PATIENT_CONTEXT" } }); return { ok: false, reason: "AMBIGUOUS_PATIENT_CONTEXT" }; }
    const prior = this.active.get(input.userId);
    const expected = input.expectedCurrentPatientId?.trim() || undefined;
    if ((prior?.patientId ?? undefined) !== expected) { this.audit({ action: "PHI_CONTEXT_SWITCH", status: "DENIED", details: { reason: "STALE_PATIENT_CONTEXT", requestedPatientHash: hash(patientId) } }); return { ok: false, reason: "STALE_PATIENT_CONTEXT" }; }
    if (prior?.patientId === patientId) { this.audit({ action: "PHI_CONTEXT_SWITCH", status: "SUCCESS", details: { outcome: "NOOP", patientHash: hash(patientId) } }); return { ok: true, changed: false, contextVersion: prior.version }; }
    try { this.stores.clearConversationMemory(input.userId); this.stores.clearAvatarVoiceContext(input.userId); this.stores.clearSecondBrainContext(input.userId); this.stores.clearRequestCaches(); }
    catch { this.audit({ action: "PHI_CONTEXT_SWITCH", status: "FAILED", details: { reason: "PATIENT_CONTEXT_CLEAR_FAILED", requestedPatientHash: hash(patientId) } }); return { ok: false, reason: "PATIENT_CONTEXT_CLEAR_FAILED" }; }
    const next = { patientId, version: (prior?.version ?? 0) + 1 }; this.active.set(input.userId, next);
    this.audit({ action: "PHI_CONTEXT_SWITCH", status: "SUCCESS", details: { outcome: "FLUSHED", previousPatientHash: prior ? hash(prior.patientId) : null, patientHash: hash(patientId), contextVersion: next.version } });
    return { ok: true, changed: true, contextVersion: next.version };
  }
}
