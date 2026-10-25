import { describe, expect, it } from "vitest";
import { buildMorningBrief } from "./morningBrief";

describe("morning brief", () => {
  it("filters to the doctor's patients, shows admins system health, and invents nothing", () => {
    const rows = [
      { section: "census", text: "SYNTHETIC ward A census", href: "/patients/a", doctorId: "doc-1" },
      { section: "census", text: "SYNTHETIC ward B census", href: "/patients/b", doctorId: "doc-2" },
    ];
    const doctor = buildMorningBrief({ role: "doctor", userId: "doc-1", rows, systemHealth: "HEALTHY" });
    expect(doctor.census).toEqual([rows[0]]);
    expect(doctor.systemHealth).toBeUndefined();
    expect(doctor.labs).toBe("none");
    const admin = buildMorningBrief({ role: "admin", userId: "admin", rows: [], systemHealth: "DEGRADED" });
    expect(admin.systemHealth).toBe("DEGRADED");
    expect(admin.census).toBe("none");
    expect(JSON.stringify(doctor).toLowerCase()).not.toMatch(/recommend|prescrib|diagnosis is/);
  });
});
