export type TransfusionState = "REQUESTED" | "CROSSMATCHED" | "CONSENTED" | "BEDSIDE_VERIFIED" | "ADMINISTERING" | "COMPLETED" | "HELD";
export interface TransfusionChecklist { id: string; patientUhid: string; product: string; units: number; state: TransfusionState; consent: boolean; crossmatched: boolean; identityVerified: boolean; observations: Array<{ at: string; event: string; actor: string; note?: string }> }

const records = new Map<string, TransfusionChecklist>();
const allowed: Record<TransfusionState, TransfusionState[]> = { REQUESTED: ["CROSSMATCHED", "HELD"], CROSSMATCHED: ["CONSENTED", "HELD"], CONSENTED: ["BEDSIDE_VERIFIED", "HELD"], BEDSIDE_VERIFIED: ["ADMINISTERING", "HELD"], ADMINISTERING: ["COMPLETED", "HELD"], COMPLETED: [], HELD: ["REQUESTED"] };

export function createTransfusion(input: { patientUhid: string; product: string; units: number; actor: string }): TransfusionChecklist {
  if (!input.patientUhid || !input.product || !Number.isInteger(input.units) || input.units < 1) throw new Error("INVALID_TRANSFUSION_REQUEST");
  const id = `TX-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const row: TransfusionChecklist = { id, patientUhid: input.patientUhid, product: input.product, units: input.units, state: "REQUESTED", consent: false, crossmatched: false, identityVerified: false, observations: [{ at: new Date().toISOString(), event: "REQUESTED", actor: input.actor }] };
  records.set(id, row); return row;
}

export function advanceTransfusion(id: string, next: TransfusionState, actor: string, checks: Partial<Pick<TransfusionChecklist, "consent" | "crossmatched" | "identityVerified">> = {}): TransfusionChecklist {
  const row = records.get(id); if (!row) throw new Error("TRANSFUSION_NOT_FOUND");
  if (!allowed[row.state].includes(next)) throw new Error(`INVALID_TRANSFUSION_TRANSITION:${row.state}->${next}`);
  Object.assign(row, checks);
  if (next === "CONSENTED" && !row.consent) throw new Error("CONSENT_REQUIRED");
  if (next === "BEDSIDE_VERIFIED" && (!row.crossmatched || !row.identityVerified)) throw new Error("CROSSMATCH_AND_IDENTITY_REQUIRED");
  if (next === "ADMINISTERING" && row.state !== "BEDSIDE_VERIFIED") throw new Error("BEDSIDE_VERIFICATION_REQUIRED");
  row.state = next; row.observations.push({ at: new Date().toISOString(), event: next, actor }); return row;
}

export function getTransfusion(id: string): TransfusionChecklist | undefined { return records.get(id); }
export function listTransfusions(patientUhid?: string): TransfusionChecklist[] { return [...records.values()].filter((row) => !patientUhid || row.patientUhid === patientUhid); }
