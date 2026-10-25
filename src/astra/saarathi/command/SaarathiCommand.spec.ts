import { describe, expect, it } from "vitest";
import { canIssueHospitalOrders, parseSaarathiCommand, stripSaarathiWakePrefix } from "./SaarathiCommand";

describe("Saarathi command authority", () => {
  it("lets only doctor and CEO place hospital orders", () => {
    expect(canIssueHospitalOrders("doctor")).toBe(true);
    expect(canIssueHospitalOrders("ceo")).toBe(true);
    expect(canIssueHospitalOrders("reception")).toBe(false);
    expect(canIssueHospitalOrders("pharmacy")).toBe(false);
  });

  it("wakes stop and navigate without a model", () => {
    expect(parseSaarathiCommand("stop", "doctor").kind).toBe("stop");
    const nav = parseSaarathiCommand("open pharmacy", "doctor");
    expect(nav.kind).toBe("navigate");
    expect(nav.actions[0]?.path).toBe("/pharmacy");
  });

  it("refuses orders from non-command roles", () => {
    const denied = parseSaarathiCommand("order CBC for bed 4", "reception");
    expect(denied.denied).toBe(true);
    expect(denied.actions).toEqual([]);
  });

  it("drafts doctor-assistant orders for doctor/CEO", () => {
    const order = parseSaarathiCommand("order CBC for bed 4", "doctor");
    expect(order.denied).toBeFalsy();
    expect(order.actions.some((a) => a.type === "hospital.command")).toBe(true);
  });

  it("keeps prescribing and investigations with the doctor when the caller is CEO", () => {
    const denied = parseSaarathiCommand("prescribe paracetamol and order CBC", "ceo");
    expect(denied.denied).toBe(true);
    expect(denied.actions).toEqual([]);
    const roster = parseSaarathiCommand("order the night roster for ICU staffing", "ceo");
    expect(roster.denied).toBeFalsy();
    expect(roster.actions.some((a) => a.type === "hospital.command")).toBe(true);
  });

  it("treats a named command as navigation, not a wake greeting", () => {
    const nav = parseSaarathiCommand("Saarathi, open pharmacy", "ward");
    expect(nav.kind).toBe("navigate");
    expect(nav.actions[0]?.path).toBe("/pharmacy");
  });

  it("understands Telugu show/open without ASCII word boundaries", () => {
    const nav = parseSaarathiCommand("వార్డ్ చూపించు", "ward");
    expect(nav.kind).toBe("navigate");
    expect(nav.actions[0]?.path).toBe("/ward");
  });

  it("stops on Telugu and Hindi stop words", () => {
    expect(parseSaarathiCommand("ఆపు", "reception").kind).toBe("stop");
    expect(parseSaarathiCommand("रुको", "pharmacy").kind).toBe("stop");
  });

  it("strips a leading Saarathi/Astra address for command parsing", () => {
    expect(stripSaarathiWakePrefix("Saarathi, open pharmacy")).toBe("open pharmacy");
    expect(stripSaarathiWakePrefix("Hey Jarvis go to ward")).toBe("go to ward");
    expect(stripSaarathiWakePrefix("Saarathi")).toBe("Saarathi");
  });
});
