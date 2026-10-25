/**
 * ASTRA Scientist agent — offline specs (LLM fully mocked).
 * ============================================================================
 * Four clinical vignettes + update loop + rules-only fallback + de-identifier.
 * No network, no data/ writes: the model gateway and the RAG vector store are
 * mocked at module load.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  failAll: false,
  llmText: "",
  captured: [] as Array<{ messages: Array<{ role: string; content: unknown }>; dataClass?: string }>,
}));

vi.mock("../ai/modelGateway", () => {
  class ModelGatewayError extends Error {
    code = "ALL_GATEWAYS_FAILED";
    requestId = "stub";
    status = 0;
  }
  return {
    ModelGatewayError,
    readModelGatewayEnv: () => ({
      baseUrl: "http://localhost:8080/v1",
      apiKey: undefined,
      defaultModel: "auto",
      localModel: "llama3.2:latest",
      localAllowlist: ["llama3.2:latest"],
      timeoutMs: 60000,
      maxRetries: 2,
      omniRouteBaseUrl: "http://localhost:20128/v1",
      omniRouteApiKey: undefined,
      ollamaBaseUrl: "http://localhost:11434",
    }),
    modelGatewayChat: vi.fn(async (req: { messages: Array<{ role: string; content: unknown }>; dataClass?: string; model?: string }) => {
      h.captured.push({ messages: req.messages, dataClass: req.dataClass });
      if (h.failAll) throw new ModelGatewayError("both gateways down");
      return {
        requestId: "stub",
        route: "ollama",
        model: req.model ?? "llama3.2:latest",
        status: 200,
        latencyMs: 5,
        attempts: 1,
        text: h.llmText,
        json: null,
        answeredBy: "ollama",
        dataClass: "HIGH_RISK_CLINICAL",
      };
    }),
  };
});

vi.mock("../rag/vectorStore", () => ({
  vectorStore: {
    search: vi.fn(() => [
      {
        id: "kb-acs-1",
        chunkIndex: 0,
        title: "Local playbook: acute chest pain protocol",
        source: "PM Brothers institutional playbook",
        text: "Chest pain with ST elevation: immediate ECG within 10 minutes, high-sensitivity troponin at 0/1/3 hours.",
        evidenceLevel: "A",
      },
    ]),
  },
}));

import {
  applyNewResult,
  deidentifyForRemote,
  runScientistAnalysis,
  sanitizeCaseInput,
  scrubIdentifiers,
  validateScientistDecisionSchema,
} from "./scientistAgent";

beforeEach(() => {
  h.failAll = false;
  h.llmText = "";
  h.captured.length = 0;
});

describe("Scientist agent — vignettes (offline, LLM down)", () => {
  it("58M crushing chest pain with ST elevation → ACS in can't-miss, ECG/troponin as discriminating tests", async () => {
    h.failAll = true;
    const a = await runScientistAnalysis({
      complaint: "Crushing retrosternal chest pain for 2 hours",
      history: "Diaphoresis, pain radiating to left arm",
      patient: { age: 58, sex: "male" },
      labs: { ECG: "ST elevation in leads II, III, aVF" },
      vitals: { BP: "100/60 mmHg", HR: 104 },
    });
    expect(a.mode).toBe("rules-only");
    const acs = a.hypotheses.find((x) => /coronary|acs/i.test(x.diagnosis));
    expect(acs).toBeTruthy();
    expect(acs?.tier).toBe("cant-miss");
    const topTests = a.tests.slice(0, 4).map((t) => t.name).join(" | ");
    expect(topTests).toMatch(/ECG/i);
    expect(topTests).toMatch(/Troponin/i);
    expect(a.safety.decisionSupportOnly).toBe(true);
    expect(a.safety.requiresDoctorConfirmation).toBe(true);
    expect(a.redFlags.some((f) => /ACS/i.test(f))).toBe(true);
  });

  it("34F fever + jaundice + RUQ pain → cholangitis can't-miss, hepatitis/malaria/leptospirosis expanded", async () => {
    h.failAll = true;
    const a = await runScientistAnalysis({
      complaint: "High grade fever with chills, jaundice and right upper quadrant pain for 2 days",
      patient: { age: 34, sex: "female" },
      labs: { "Total bilirubin": "4.8 mg/dL", WBC: "16200 /mm3" },
    });
    const cholangitis = a.hypotheses.find((x) => /cholangitis/i.test(x.diagnosis));
    expect(cholangitis?.tier).toBe("cant-miss");
    const expanded = a.hypotheses.filter((x) => x.tier === "expanded").map((x) => x.diagnosis.toLowerCase());
    expect(expanded.join(" ")).toMatch(/hepatitis/i);
    expect(expanded.join(" ")).toMatch(/malaria/i);
    expect(expanded.join(" ")).toMatch(/leptospirosis/i);
  });

  it("72F fall + hip pain + shortened externally rotated leg → neck-of-femur fracture with X-ray pelvis", async () => {
    h.failAll = true;
    const a = await runScientistAnalysis({
      complaint: "Fall at home, severe right hip pain, unable to bear weight, leg shortened and externally rotated",
      patient: { age: 72, sex: "female" },
      exam: "Right leg shortened and externally rotated; groin tenderness",
    });
    const nof = a.hypotheses.find((x) => /femur fracture|neck-of-femur/i.test(x.diagnosis));
    expect(nof).toBeTruthy();
    expect(nof?.tier).toBe("cant-miss");
    expect(a.tests.some((t) => /X-ray Pelvis/i.test(t.name))).toBe(true);
    expect(nof?.mechanism.molecular.join(" ")).toMatch(/fall/i);
  });

  it("25M fatigue with an unexplained finding → listed under unexplained", async () => {
    h.failAll = true;
    const a = await runScientistAnalysis({
      complaint: "Fatigue for 3 months",
      patient: { age: 25, sex: "male" },
      exam: "Pallor +. Urine dipstick shows hematuria 2+.",
      labs: { Hb: "10.2 g/dL" },
    });
    const anaemia = a.hypotheses.find((x) => /anaemia|anemia/i.test(x.diagnosis));
    const hypothyroid = a.hypotheses.find((x) => /hypothyroid/i.test(x.diagnosis));
    expect(anaemia).toBeTruthy();
    expect(hypothyroid).toBeTruthy();
    expect(a.unexplainedFindings.join(" ")).toMatch(/hematuria/i);
    expect(a.unexplainedFindings.join(" ")).not.toMatch(/pallor/i);
  });
});

describe("Scientist agent — update loop", () => {
  it("a new result re-ranks by likelihood ratio and explains what changed", async () => {
    h.failAll = true;
    const prior = await runScientistAnalysis({
      complaint: "Fever with jaundice and right upper quadrant pain for 2 days",
      patient: { age: 34, sex: "female" },
    });
    const cholangitisBefore = prior.hypotheses.find((x) => /cholangitis/i.test(x.diagnosis))!;
    const hepatitisBefore = prior.hypotheses.find((x) => /hepatitis/i.test(x.diagnosis))!;
    expect(cholangitisBefore.probability).toBeGreaterThan(hepatitisBefore.probability);

    const updated = applyNewResult(prior, { test: "USG Abdomen (biliary tree)", value: "dilated CBD with calculi" });
    const cholangitisAfter = updated.hypotheses.find((x) => /cholangitis/i.test(x.diagnosis))!;
    const hepatitisAfter = updated.hypotheses.find((x) => /hepatitis/i.test(x.diagnosis))!;

    expect(cholangitisAfter.probability).toBeGreaterThan(cholangitisBefore.probability);
    expect(hepatitisAfter.probability).toBeLessThan(hepatitisBefore.probability);
    const entry = updated.update?.entries.find((e) => /cholangitis/i.test(e.diagnosis));
    expect(entry?.basis).toBe("likelihood-ratio");
    expect(entry?.delta).toBeGreaterThan(0);
    expect(entry?.reason).toMatch(/dilated/i);
    expect(updated.revision).toBe(prior.revision + 1);
  });

  it("a discriminating result flips the ranking within a tier", async () => {
    h.failAll = true;
    const prior = await runScientistAnalysis({
      complaint: "Fever with jaundice and right upper quadrant pain for 2 days",
      patient: { age: 34, sex: "female" },
    });
    const before = prior.hypotheses.filter((x) => x.tier === "expanded").map((x) => x.diagnosis);
    // Before any result: hepatitis outranks leptospirosis.
    expect(before.findIndex((d) => /hepatitis/i.test(d))).toBeLessThan(before.findIndex((d) => /leptospir/i.test(d)));

    const updated = applyNewResult(prior, { test: "Leptospira IgM ELISA", value: "positive" });
    const expanded = updated.hypotheses.filter((x) => x.tier === "expanded");
    const rankOf = (name: RegExp) => expanded.findIndex((x) => name.test(x.diagnosis));
    expect(rankOf(/leptospir/i)).toBeLessThan(rankOf(/hepatitis/i));
    expect(rankOf(/hepatitis/i)).toBeLessThan(rankOf(/malaria/i));
    const lepto = updated.hypotheses.find((x) => /leptospir/i.test(x.diagnosis))!;
    expect(lepto.probability).toBeGreaterThan(0.5);
    expect(lepto.lastUpdate?.basis).toBe("likelihood-ratio");
  });

  it("an uninformative result barely moves probabilities", async () => {
    h.failAll = true;
    const prior = await runScientistAnalysis({
      complaint: "Fatigue for 3 months",
      patient: { age: 25, sex: "male" },
      labs: { Hb: "10.2 g/dL" },
    });
    const updated = applyNewResult(prior, { test: "X-ray Chest", value: "normal" });
    const anaemia = updated.hypotheses.find((x) => /anaemia|anemia/i.test(x.diagnosis))!;
    expect(anaemia.probability).toBeLessThan(prior.hypotheses.find((x) => /anaemia|anemia/i.test(x.diagnosis))!.probability);
  });
});

describe("Scientist agent — rules-only fallback and LLM augmentation", () => {
  it("returns tiers marked rules-only when every provider is down", async () => {
    h.failAll = true;
    const a = await runScientistAnalysis({
      complaint: "Crushing chest pain with ST elevation",
      patient: { age: 58, sex: "male" },
      labs: { ECG: "ST elevation" },
    });
    expect(a.mode).toBe("rules-only");
    expect(a.llm).toBeNull();
    expect(a.hypotheses.length).toBeGreaterThan(0);
    expect(a.safety.rulesRun).toBe(true);
  });

  it("merges LLM suggestions without ever removing can't-miss entries", async () => {
    h.llmText = JSON.stringify({
      hypotheses: [
        {
          diagnosis: "Aortic Dissection",
          tier: "most-likely",
          reasoning: "Tearing pain radiating to the back should keep dissection on the list.",
          supports: ["Radiation to back"],
          against: ["No pulse deficit documented"],
          rootCauseCategory: "vascular",
          anatomyFocus: "Aorta",
        },
      ],
      unexplained: ["Left arm numbness not explained by current differential"],
    });
    const a = await runScientistAnalysis({
      complaint: "Crushing chest pain with ST elevation",
      patient: { age: 58, sex: "male" },
      labs: { ECG: "ST elevation" },
    });
    expect(a.mode).toBe("llm-augmented");
    expect(a.llm?.answeredBy).toBe("ollama");
    const acs = a.hypotheses.find((x) => /coronary|acs/i.test(x.diagnosis));
    const dissection = a.hypotheses.find((x) => /dissection/i.test(x.diagnosis));
    expect(acs?.tier).toBe("cant-miss");
    expect(dissection?.source).toBe("llm");
    expect(a.unexplainedFindings.join(" ")).toMatch(/arm numbness/i);
  });
});

describe("Scientist agent — de-identification", () => {
  it("strips structured identifiers and bands the age", () => {
    const raw = {
      complaint: "Chest pain for 2 hours",
      history: "Referred by Dr. Rao. UHID-2026-8801 on file.",
      patient: { age: 58, sex: "male" },
      name: "Ramesh Kumar",
      uhid: "UHID-2026-8801",
      phone: "+91 98480 12345",
      address: "12-3-456, Ameerpet, Hyderabad",
      email: "ramesh@example.com",
    };
    const clean = sanitizeCaseInput(raw) as unknown as Record<string, unknown>;
    expect(clean).not.toHaveProperty("name");
    expect(clean).not.toHaveProperty("uhid");
    expect(clean).not.toHaveProperty("phone");
    expect(clean).not.toHaveProperty("address");
    expect(clean).not.toHaveProperty("email");

    const { text, ageBand } = deidentifyForRemote(raw);
    expect(ageBand).toBe("46-60y");
    expect(text).not.toMatch(/Ramesh|98480|12345|example\.com/);
    expect(text).not.toMatch(/UHID/i);
    expect(text).toMatch(/46-60/);
  });

  it("scrubs identifier-shaped strings from free text", () => {
    const out = scrubIdentifiers("Contact 9848012345 or mail ramesh@example.com; UHID-2026-8801");
    expect(out).not.toMatch(/9848012345/);
    expect(out).not.toMatch(/ramesh@example\.com/);
    expect(out).not.toMatch(/UHID-2026-8801/i);
    expect(out).toMatch(/REDACTED/);
  });

  it("never sends identifiable fields toward the gateway (network-log test)", async () => {
    h.llmText = JSON.stringify({ hypotheses: [], unexplained: [] });
    await runScientistAnalysis({
      complaint: "Fever with jaundice for 3 days",
      history: "Patient gave UHID-2026-8801 at the desk.",
      patient: { age: 34, sex: "female" },
      name: "Ananya Sharma",
      uhid: "UHID-2026-8802",
      phone: "9848012345",
    } as unknown as Parameters<typeof runScientistAnalysis>[0]);
    expect(h.captured.length).toBeGreaterThan(0);
    for (const call of h.captured) {
      const payload = JSON.stringify(call.messages);
      expect(payload).not.toMatch(/Ananya|Sharma|UHID|9848012345/);
      expect(payload).toMatch(/31-45/); // age banded
      expect(call.dataClass).toBe("HIGH_RISK_CLINICAL");
    }
  });
});

describe("Scientist agent - R5-03 DDx matrix and investigation planner", () => {
  it("Surya scenario keeps cellulitis, DVT and pinned necrotizing fasciitis with unchecked planner items", async () => {
    h.failAll = true;
    const a = await runScientistAnalysis({
      complaint: "65M cellulitis right leg with red swollen painful unilateral lower limb edema",
      history: "Diabetic, fever yesterday. No crepitus or bullae documented.",
      patient: { age: 65, sex: "male" },
    });

    const diagnoses = a.ddxMatrix.map((row) => row.diagnosis).join(" | ");
    expect(diagnoses).toMatch(/Cellulitis/i);
    expect(diagnoses).toMatch(/Deep Vein Thrombosis/i);
    const nec = a.ddxMatrix.find((row) => /Necrotizing/i.test(row.diagnosis));
    expect(nec?.pinnedRedFlag).toBe(true);
    expect(nec?.ruledOutByDoctor).toBe(false);

    for (const row of a.ddxMatrix) {
      expect(row.supports.length).toBeGreaterThan(0);
      expect(row.againstOrMissing.length).toBeGreaterThan(0);
      expect(row.definitiveRuleOutCriterion).not.toBe("");
      expect(row.estimateLabel).toBe("derived estimate");
    }

    expect(a.investigationPlanner.find((item) => item.name === "CBC with differential")?.checked).toBe(false);
    expect(a.investigationPlanner.find((item) => item.name === "CRP")?.rationale).toMatch(/Inflammatory/i);
    expect(a.investigationPlanner.find((item) => item.name === "Venous Doppler")?.orderCategory).toBe("radiology");
    expect(a.investigationPlanner.find((item) => item.name === "CBC with differential")?.orderCategory).toBe("laboratory");
    expect(a.schemaWarning).toBeNull();
  });

  it("schema validation rejects malformed matrix output so UI can show a safe fallback", () => {
    const warning = validateScientistDecisionSchema({
      ddxMatrix: [{ diagnosis: "Bad row", supports: [], againstOrMissing: [], definitiveRuleOutCriterion: "" } as any],
      investigationPlanner: [],
    });
    expect(warning).toMatch(/schema|incomplete/i);
  });

  it("safe interpretation summarizes result pattern without final diagnosis", async () => {
    h.failAll = true;
    const prior = await runScientistAnalysis({
      complaint: "65M cellulitis right leg with red swollen painful unilateral lower limb edema",
      patient: { age: 65, sex: "male" },
    });
    const updated = applyNewResult(prior, { test: "CRP", value: "Elevated CRP with normal WBC" });
    expect(updated.safeInterpretationLine).toMatch(/Pattern summary only/i);
    expect(updated.safeInterpretationLine).toMatch(/final diagnosis requires doctor confirmation/i);
  });
});

describe("Scientist agent - R5-03 no automatic diagnosis save", () => {
  it("neither the cause-finder nor its route writes a diagnosis to the patient record", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const agentSource = readFileSync(resolve(process.cwd(), "server/clinical/scientistAgent.ts"), "utf8");
    expect(agentSource).not.toMatch(/\bdb\.|updatePatient|recordSuggestion|decideApproval/);

    const routeSource = readFileSync(resolve(process.cwd(), "server/routes/clinical.ts"), "utf8");
    const start = routeSource.indexOf('"/api/clinical/scientist/analyze"');
    expect(start).toBeGreaterThan(-1);
    const next = routeSource.indexOf("app.", start + 10);
    const handler = routeSource.slice(start, next === -1 ? undefined : next);
    expect(handler).not.toMatch(/updatePatient|\.diagnosis\s*=|decideApproval|recordSuggestion/);
  });

  it("every analysis says it is decision support that needs doctor confirmation", async () => {
    h.failAll = true;
    const a = await runScientistAnalysis({
      complaint: "65M cellulitis right leg with red swollen painful unilateral lower limb edema",
      patient: { age: 65, sex: "male" },
    });
    expect(a.safety.decisionSupportOnly).toBe(true);
    expect(a.safety.requiresDoctorConfirmation).toBe(true);
    expect(a.investigationPlanner.every((item) => item.checked === false)).toBe(true);
  });
});
