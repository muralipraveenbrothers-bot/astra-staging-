import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { configureCaseStore, getCase } from "./caseState";
import { listBrainComponents } from "./components";
import { compileContext } from "./contextCompiler";
import { assignWork } from "./hermesCortex";
import { runAstraBrainFlow } from "./astraBrainFlow";
import { decidePackSync } from "./layaDecisionApi";
import { advanceClinicalCase, approveClinicalCase, openClinicalCase, recordOutcome } from "./langGraphMaster";
import { providerAllowed } from "./privacy";
import { govern } from "./resourceGovernor";
import { registerBrainRoutes } from "./routes";
import { assertNoSecretSink, capabilityReference, scrubSecrets } from "./secretVault";
import { buildDelegation } from "./specialists";
import { toolsForRole } from "./toolRegistry";
import { wrapExisting7D } from "./sevenDWrap";

const text = "55-year-old woman lower back pain radiating to the right lower limb";

afterEach(() => {
  configureCaseStore(null);
});

describe("Astra brain part 1", () => {
  it("does not diagnose the radicular example or order routine imaging", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "astra-brain-"));
    configureCaseStore(dir);
    const assignment = await assignWork({ text, role: "doctor", invoke7D: false });
    const body = JSON.stringify(assignment);
    expect(assignment.diagnosis).toBeNull();
    expect(body).not.toMatch(/\d+\s*%/);
    expect(body.toLowerCase()).not.toContain("disc prolapse");
    expect(assignment.delegation?.active).toEqual([
      "symptom_mapper",
      "red_flag",
      "anatomical_localizer",
      "age_context",
      "differential",
    ]);
    expect(assignment.delegation?.imaging.action).toBe("no-routine-order");
    expect(assignment.delegation?.differential.find((item) => item.group === "disc disease")?.compatibility).toBe("possible");
    expect(assignment.delegation?.differential.find((item) => item.group === "cauda equina / severe neural compression")?.compatibility).toBe("cannot safely exclude");
    expect(assignment.delegation?.reports.find((item) => item.id === "symptom_mapper")?.questions).toContain("bladder disturbance");
    expect(assignment.context.tools.some((tool) => tool.tool_id === "clinical.chart.read")).toBe(true);
    expect(assignment.context.tools.some((tool) => tool.tool_id === "clinical.order.propose")).toBe(false);
    expect(assignment.caseState?.ordersExecuted).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("refuses a firm Laya answer when confidence is low or the action is a clinical write", () => {
    const uncertain = decidePackSync("fever and backache for two days", "doctor", {
      urgency: {
        ok: true,
        task: "urgency_classification",
        latencyMs: 4,
        answers: { urgency: { probabilities: { routine: 0.3, soon: 0.3, urgent: 0.4 }, legend: { urgent: "urgent" } } },
      },
    });
    expect(uncertain.decisions.find((item) => item.task === "urgent")?.verdict).toBe("UNKNOWN");

    const write = decidePackSync("prescribe amoxicillin for this patient", "ceo");
    expect(write.decisions.find((item) => item.task === "human_approval")?.verdict).toBe("REQUIRES_HUMAN_REVIEW");

    const thin = decidePackSync("pain", "doctor");
    expect(thin.decisions.find((item) => item.task === "clinical")?.verdict).toBe("INSUFFICIENT_INFORMATION");

    const confirmed = decidePackSync("hello there friend", "doctor", {
      confirmation: { ok: true, task: "needs_human_confirmation", latencyMs: 2, answers: { confirmation_needed: { noul: 0.91 } } },
    });
    expect(confirmed.decisions.find((item) => item.task === "human_approval")?.verdict).toBe("YES");
    expect(confirmed.decisions.every((item) => item.calibratedForClinicalUse === false)).toBe(true);
  });

  it("stops the case graph for doctor review and keeps the file after the governor runs", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "astra-case-"));
    configureCaseStore(dir);
    let state = openClinicalCase(text, "doctor");
    for (let i = 0; i < 12; i += 1) {
      state = advanceClinicalCase(state.caseId);
      if (state.approval.status === "pending") break;
    }
    expect(state.approval.node).toBe("DOCTOR_REVIEW");
    expect(state.completed).toContain("PRESENTATION");
    expect(state.completed).toContain("EXISTING_RECORDS");
    expect(() => approveClinicalCase(state.caseId, "ceo", true)).toThrow(/doctor/i);
    state = approveClinicalCase(state.caseId, "doctor", true);
    expect(state.completed).toContain("DOCTOR_REVIEW");
    state = advanceClinicalCase(state.caseId);
    expect(state.approval.node).toBe("ORDERS_DOCUMENTATION");
    state = approveClinicalCase(state.caseId, "doctor", true);
    state = advanceClinicalCase(state.caseId);
    expect(state.completed).toContain("FOLLOW_UP");
    state = advanceClinicalCase(state.caseId);
    expect(state.stoppedAt).toBe("OUTCOME");
    state = recordOutcome(state.caseId, "doctor", "Reviewed in clinic. No emergency feature was found.");
    expect(state.completed).toContain("OUTCOME");
    expect(state.ordersExecuted).toBe(false);
    const report = govern("ECO");
    expect(report.casesDeleted).toBe(0);
    expect(getCase(state.caseId)?.outcomeNote).toContain("Reviewed in clinic");
    const onDisk = fs.readFileSync(path.join(dir, `${state.caseId}.json`), "utf8");
    expect(onDisk).toContain("OUTCOME");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("shows the CEO the census tool and withholds the prescribing tool", () => {
    const tools = toolsForRole("ceo", ["hospital_read", "clinical_write", "hospital_operations"]);
    expect(tools.map((tool) => tool.tool_id)).toContain("hospital.census");
    expect(tools.map((tool) => tool.tool_id)).not.toContain("clinical.order.propose");
    const compiled = compileContext({
      text: "show the night census",
      role: "reception",
      privacy: "INTERNAL",
      classes: ["hospital_read", "clinical_write", "voice"],
    });
    expect(compiled.tools.map((tool) => tool.tool_id)).toEqual(["voice.speak"]);
    expect(compiled.omittedToolCount).toBeGreaterThan(0);
  });

  it("keeps PHI off a general cloud provider and keeps secrets out of the answer", () => {
    expect(providerAllowed("PHI", "gemini")).toBe(false);
    expect(providerAllowed("PHI", "freellmapi")).toBe(false);
    expect(providerAllowed("PHI", "ollama")).toBe(true);
    expect(providerAllowed("HIGH-RISK CLINICAL", "openrouter")).toBe(false);
    const ref = capabilityReference("freellmapi.unified_api_key");
    expect(ref.ref).toBe("vault://freellmapi.unified_api_key");
    expect(JSON.stringify(ref)).not.toMatch(/freellmapi-[A-Za-z0-9]{6,}/);
    expect(scrubSecrets("use freellmapi-supersecret please")).toBe("use [redacted] please");
    expect(assertNoSecretSink("prompts").allowed).toBe(false);
    const plan = buildDelegation(text);
    expect(plan?.percentages).toBeNull();
  });

  it("lists Part 1 components with health and leaves later modules unstarted", async () => {
    const components = listBrainComponents();
    for (const component of components) {
      expect(component.health).toBeTruthy();
      expect(component.version).toBeTruthy();
      expect(component.status).toBeTruthy();
      expect(component.lastError).toBeNull();
    }
    expect(components.find((item) => item.id === "mechanism-graph")?.status).toBe("ready");
    expect(components.find((item) => item.id === "case-watcher")?.status).toBe("ready");
    expect(components.find((item) => item.id === "evolution-room")?.status).toBe("ready");
    expect(components.find((item) => item.id === "contact-brain")?.status).toBe("ready");
    expect(components.find((item) => item.id === "observatory")?.status).toBe("ready");
    expect(components.find((item) => item.id === "internal-browser-registry")?.status).toBe("existing");
    expect(typeof registerBrainRoutes).toBe("function");
    const wrapped = await wrapExisting7D("mild headache since morning", undefined, "en");
    expect(wrapped.engine).toBe("Astra7DClinicalEngine");
    expect(typeof wrapped.synthesis.spokenConciseSummary).toBe("string");
  });

  it("runs the wired brain flow with one correlation id and no hardcoded diagnosis", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "astra-brain-flow-"));
    configureCaseStore(dir);
    const flow = await runAstraBrainFlow({
      text,
      role: "doctor",
      correlationId: "test-brain-flow-001",
    });
    expect(flow.correlationId).toBe("test-brain-flow-001");
    expect(new Set(flow.trace.map((entry) => entry.correlationId))).toEqual(new Set(["test-brain-flow-001"]));
    expect(flow.trace.map((entry) => entry.stage)).toEqual(expect.arrayContaining([
      "SAFETY_IDENTITY",
      "LAYA",
      "CONTEXT_COMPILER",
      "LANGGRAPH",
      "HERMES",
      "SPECIALIST_DISPATCHER",
      "ASTRA_7D",
      "TOOL_REGISTRY",
      "FLIGHT_RECORDER",
    ]));
    expect(flow.assignment.decisions.needsHermes).toBe(true);
    expect(flow.assignment.sevenD?.invoked).toBe(true);
    expect(flow.assignment.delegation?.active).toContain("differential");
    expect(flow.finalState.missingInformation).toContain("bladder disturbance");
    expect(flow.assignment.diagnosis).toBeNull();
    expect(JSON.stringify(flow.assignment).toLowerCase()).not.toContain("disc prolapse");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
