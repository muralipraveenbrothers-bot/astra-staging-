/**
 * ASTRA AI — Intelligence Extensions: Tests
 * ============================================================================
 * Covers MiniMind (astra-micro) config/adapter, Scientific Skill Registry,
 * ScientificSkillsWorker, Intelligence Router, PHI Guard, and Provenance.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { getMiniMindConfig } from "../../astra/intelligence_extensions/minimind/config";
import { routeIntelligence } from "../../astra/intelligence_extensions/routing/intelligenceRouter";
import { discoverSkills, listEnabledSkills } from "../../astra/intelligence_extensions/scientific_skills/registry";
import { ScientificSkillsWorker } from "../../astra/intelligence_extensions/scientific_skills/worker";
import { deidentifyForScientificQuery, isSafeForExternalApi } from "../../astra/intelligence_extensions/safety/phiGuard";
import { ProvenanceLedger } from "../../astra/intelligence_extensions/provenance/ledger";

describe("MiniMind config (astra-micro)", () => {
  it("defaults to disabled with safe fallbacks", () => {
    const c = getMiniMindConfig();
    expect(c.model).toBe("astra-micro");
    expect(c.ollamaBase).toBe("http://127.0.0.1:11434");
    expect(c.temperature).toBe(0.2);
    expect(typeof c.systemPrompt).toBe("string");
    expect(c.systemPrompt.length).toBeGreaterThan(0);
  });
});

describe("Intelligence Router (3-tier)", () => {
  it("routes high-risk clinical topics to HIGH_CLINICAL with escalation", () => {
    const r = routeIntelligence("What is the vasopressor dose for septic shock?");
    expect(r.tier).toBe("HIGH_CLINICAL");
    expect(r.escalate).toBe(true);
    expect(r.target).toBe("clinical-reasoning-pathway");
  });

  it("routes scientific queries to MEDIUM with skills", () => {
    const r = routeIntelligence("Find latest evidence for antibiotics in pancreatitis");
    expect(r.tier).toBe("MEDIUM");
    expect(r.scientificSkills.length).toBeGreaterThan(0);
  });

  it("routes simple operational commands to LOW", () => {
    const r = routeIntelligence("Open pharmacy");
    expect(r.tier).toBe("LOW");
    expect(r.target).toBe("astra-micro");
  });

  it("does not guess — unknown queries go to existing route, not astra-micro", () => {
    const r = routeIntelligence("asdfgh random unclear input");
    expect(r.target).not.toBe("astra-micro");
  });
});

describe("Scientific Skill Registry", () => {
  it("paper-lookup and database-lookup are enabled by default", () => {
    const enabled = listEnabledSkills().map((s) => s.name);
    expect(enabled).toContain("paper-lookup");
    expect(enabled).toContain("database-lookup");
  });

  it("discovers relevant skills by trigger", () => {
    const skills = discoverSkills("find latest papers about diabetes");
    expect(skills.some((s) => s.name === "paper-lookup")).toBe(true);
  });

  it("returns empty for unrelated queries", () => {
    expect(discoverSkills("order ceftriaxone for bed 4")).toHaveLength(0);
  });
});

describe("ScientificSkillsWorker", () => {
  it("runs a query and returns structured evidence + provenance", async () => {
    const w = new ScientificSkillsWorker();
    const res = await w.run({
      query: "Latest evidence for TXA in trauma",
      deidentifiedQuery: "Latest evidence for TXA in trauma",
      requestId: "test-1",
    });
    expect(res.ok).toBe(true);
    expect(res.skill).toBe("paper-lookup");
    expect(res.provenance.requestId).toBe("test-1");
    expect(res.provenance.doctorReviewRequired).toBe(true);
    expect(res.sources.length).toBeGreaterThan(0);
  });

  it("captures provenance in the ledger", () => {
    const ledger = new ProvenanceLedger();
    ledger.record({
      requestId: "p1", timestamp: new Date().toISOString(),
      originalQuery: "q", deidentifiedQuery: "q", selectedSkills: ["paper-lookup"],
      skillVersions: {}, databasesAccessed: ["pubmed"], searchQueries: ["q"],
      retrievedSources: [], retrievalTimestamps: [], modelUsed: "test", agentUsed: "test",
      doctorReviewRequired: true, phiRedactions: [],
    });
    expect(ledger.get("p1")).toBeDefined();
    expect(ledger.size).toBe(1);
  });
});

describe("PHI Guard", () => {
  it("redacts MRN and phone numbers", () => {
    const r = deidentifyForScientificQuery("Patient MRN 12345678 phone 9876543210 has CKD");
    expect(r.deidentified).toContain("[REDACTED_MRN]");
    expect(r.deidentified).toContain("[REDACTED_PHONE]");
    expect(r.redactedFields).toContain("mrn");
    expect(r.redactedFields).toContain("phone");
  });

  it("leaves clean scientific queries untouched", () => {
    const r = deidentifyForScientificQuery("adult patient with renal impairment");
    expect(r.deidentified).toBe("adult patient with renal impairment");
    expect(r.redactedFields).toHaveLength(0);
  });

  it("isSafeForExternalApi passes clean text", () => {
    expect(isSafeForExternalApi("evidence for antibiotics")).toBe(true);
  });
});