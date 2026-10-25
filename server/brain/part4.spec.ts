import { describe, expect, it } from "vitest";
import { evidenceHit, externalAiRelease, healthWord, parseBrowserCommand, patientChange, SEARCH_ORDER } from "../../src/astra/brain/part4/browser";
import { contactAction } from "../../src/astra/brain/part4/contacts";

describe("Astra brain part 4", () => {
  it("reads Voicebox and the patient lab through an API before opening a page", () => {
    const whisper = parseBrowserCommand("Open Voicebox and tell me whether Whisper is loaded.");
    expect(whisper?.serviceId).toBe("voicebox");
    expect(whisper?.apiFirst).toBe(true);
    expect(whisper?.method).toBe("READ_API");
    const cbc = parseBrowserCommand("Open the latest CBC for this patient.");
    expect(cbc?.method).toBe("READ_API");
    expect(cbc?.method).not.toBe("SEARCH_WEB");
    expect(cbc?.modifiesHospitalRecord).toBe(false);
    const action = parseBrowserCommand("finalize discharge");
    expect(action?.mode).toBe("ACTION");
    expect(action?.needsApproval).toBe(true);
    expect(action?.modifiesHospitalRecord).toBe(false);
  });

  it("keeps external AI and external pages from writing the chart", () => {
    const chat = parseBrowserCommand("/browser open chatgpt");
    expect(chat?.external).toBe(true);
    expect(chat?.untrusted).toBe(true);
    expect(chat?.needsApproval).toBe(true);
    const blocked = externalAiRelease("review MRN 123456 for bed 4", false);
    expect(blocked.allowed).toBe(false);
    expect(blocked.label).toBe("UNVERIFIED EXTERNAL AI OUTPUT");
    const released = externalAiRelease("review MRN 123456 for bed 4", true);
    expect(released.redacted).not.toMatch(/123456/);
    expect(released.redacted).not.toMatch(/bed 4/i);
    const hit = evidenceHit({ source: "PubMed", title: "A paper", date: "2020", publication: "Journal", evidenceType: "trial", retrievedDate: "2026-09-25", relevance: "related", link: "https://example.test" });
    expect(hit.patientFact).toBe(false);
    expect(SEARCH_ORDER.at(-1)).toBe("External Web");
  });

  it("confirms a patient change and does not send a contact", () => {
    expect(patientChange({ name: "A", mrn: "MRN1", ageSex: "unknown", encounter: "current", wardBed: "unknown", doctor: "unknown" }, "MRN2").needsConfirm).toBe(true);
    expect(patientChange(null, "MRN2").needsConfirm).toBe(false);
    const audit = contactAction({ text: "call pharmacy", role: "doctor", who: "dr-a", related: "MRN1" });
    expect(audit.delivered).toBe(false);
    expect(audit.allowed).toBe(true);
    expect(audit.recipient).toBe("Pharmacy desk");
    const denied = contactAction({ text: "message ambulance", role: "reception", who: "desk" });
    expect(denied.allowed).toBe(false);
    expect(healthWord("live")).toBe("LIVE");
    expect(healthWord(undefined, true)).toBe("STARTING");
    expect(healthWord("offline")).toBe("OFFLINE");
  });
});
