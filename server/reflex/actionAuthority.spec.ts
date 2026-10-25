import { describe, expect, it } from "vitest";
import { authorize, resolvedRisk, toolLevelToAuthority } from "./actionAuthority";

describe("action authority", () => {
  it("never lets a receptionist or a confident AUTO doctor prescribe", () => {
    const receptionist = authorize({ action: "prescribe", role: "receptionist", mode: "AUTO", confidence: 0.99 });
    expect(["FORBIDDEN", "DOCTOR_ONLY"]).toContain(receptionist.level);
    expect(receptionist.allowed).toBe(false);
    const doctor = authorize({ action: "prescribe", role: "doctor", mode: "AUTO", confidence: 0.99 });
    expect(doctor.level).toBe("DOCTOR_ONLY");
    expect(doctor.allowed).toBe(false);
  });

  it("forbids sending PHI to omniroute and allows queue sort in AUTO", () => {
    expect(authorize({ action: "send_phi_to_provider", role: "system", dataClass: "PHI" }).level).toBe("FORBIDDEN");
    expect(authorize({ action: "queue_sort", role: "system", mode: "AUTO" })).toMatchObject({ level: "AUTO_ALLOWED", allowed: true });
  });

  it("does not let a low Laya risk lower delete_patient, and L7 stays forbidden", () => {
    expect(resolvedRisk("delete_patient", "low")).toBe("high");
    expect(toolLevelToAuthority("L7", "admin", "INTERNAL").level).toBe("FORBIDDEN");
  });
});
