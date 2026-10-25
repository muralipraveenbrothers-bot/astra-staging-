import { describe, expect, it } from "vitest";
import { dashboardFromRoute } from "./useAstraVoiceTurn";

describe("dashboardFromRoute — Saarathi workspace from live hash", () => {
  it("maps clinical and department dashboards", () => {
    expect(dashboardFromRoute("/doctor")).toBe("doctor");
    expect(dashboardFromRoute("/command-os")).toBe("doctor");
    expect(dashboardFromRoute("/emr")).toBe("doctor");
    expect(dashboardFromRoute("/supercore")).toBe("doctor");
    expect(dashboardFromRoute("/ortho-planner")).toBe("doctor");
    expect(dashboardFromRoute("/reception")).toBe("reception");
    expect(dashboardFromRoute("/pharmacy")).toBe("pharmacy");
    expect(dashboardFromRoute("/lab")).toBe("lab");
    expect(dashboardFromRoute("/radiology")).toBe("radiology");
    expect(dashboardFromRoute("/billing")).toBe("billing");
    expect(dashboardFromRoute("/finance")).toBe("billing");
    expect(dashboardFromRoute("/ward")).toBe("ward");
    expect(dashboardFromRoute("/nursing")).toBe("ward");
    expect(dashboardFromRoute("/ot")).toBe("ot");
  });

  it("falls back to general for plugin/internal/ceo shells", () => {
    expect(dashboardFromRoute("/plugins")).toBe("general");
    expect(dashboardFromRoute("/browser")).toBe("general");
    expect(dashboardFromRoute("/ceo")).toBe("general");
  });
});
