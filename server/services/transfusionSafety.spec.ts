import { describe, expect, it } from "vitest";
import { advanceTransfusion, createTransfusion } from "./transfusionSafety";

describe("transfusion safety state machine", () => {
  it("fails closed until consent, crossmatch and identity checks are present", () => {
    const row = createTransfusion({ patientUhid: "UHID-TX-1", product: "PRBC", units: 1, actor: "doctor" });
    expect(() => advanceTransfusion(row.id, "BEDSIDE_VERIFIED", "nurse", { crossmatched: true, identityVerified: true, consent: true })).toThrow(/INVALID_TRANSFUSION_TRANSITION/);
    advanceTransfusion(row.id, "CROSSMATCHED", "lab", { crossmatched: true });
    expect(() => advanceTransfusion(row.id, "CONSENTED", "doctor")).toThrow(/CONSENT_REQUIRED/);
    advanceTransfusion(row.id, "CONSENTED", "doctor", { consent: true });
    advanceTransfusion(row.id, "BEDSIDE_VERIFIED", "nurse", { identityVerified: true });
    expect(advanceTransfusion(row.id, "ADMINISTERING", "nurse").state).toBe("ADMINISTERING");
  });
});
