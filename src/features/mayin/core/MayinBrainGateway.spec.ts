import { describe, it, expect } from "vitest";
import {
  MayinBrainGateway,
  getMayinBrainGateway,
  layaClassify,
  selectWorkflow,
} from "./MayinBrainGateway";
import {
  DASHBOARDS,
  resolveDashboard,
  findDashboardById,
  dashboardConfirmationMessage,
} from "./MayinDashboardRoutes";
import type { MayinContext } from "./MayinTypes";

const baseContext: MayinContext = {
  userId: "U-1",
  role: "DOCTOR",
  patientId: "P-1",
  encounterId: "E-1",
};

describe("MayinDashboardRoutes", () => {
  it("registers every dashboard with a route and keywords", () => {
    expect(DASHBOARDS.length).toBeGreaterThan(0);
    for (const d of DASHBOARDS) {
      expect(d.route.startsWith("/")).toBe(true);
      expect(d.keywords.length).toBeGreaterThan(0);
      expect(d.roles.length).toBeGreaterThan(0);
    }
  });

  it("resolves natural language commands to dashboards", () => {
    expect(resolveDashboard("open the laboratory dashboard", "DOCTOR")?.id).toBe("lab");
    expect(resolveDashboard("show pharmacy", "DOCTOR")?.id).toBe("pharmacy");
  });

  it("filters dashboards by role", () => {
    const match = resolveDashboard("go to reception registration", "BILLING");
    expect(match?.id).not.toBe("reception");
  });

  it("returns localized confirmation messages", () => {
    const lab = findDashboardById("lab")!;
    expect(dashboardConfirmationMessage(lab, "en")).toContain("laboratory");
    expect(dashboardConfirmationMessage(lab, "te")).toContain("తెరుస్తున్నాను");
    expect(dashboardConfirmationMessage(lab, "hi")).toContain("खोल");
  });
});

describe("layaClassify", () => {
  it("classifies navigation intent with a target dashboard", async () => {
    const decision = await layaClassify("open lab dashboard", baseContext);
    expect(decision.intent).toBe("navigate");
    expect(decision.targetDashboard).toBe("lab");
    expect(decision.requiresConfirmation).toBe(false);
  });

  it("marks pharmacy dispatch as WRITE requiring confirmation", async () => {
    const decision = await layaClassify("dispatch paracetamol 500mg to bed 12", baseContext);
    expect(decision.intent).toBe("pharmacy_dispatch");
    expect(decision.riskLevel).toBe("WRITE");
    expect(decision.requiresConfirmation).toBe(true);
  });

  it("grounds lab queries on the active patient", async () => {
    const decision = await layaClassify("show latest CBC results", baseContext);
    expect(decision.intent).toBe("query_labs");
    expect(decision.patientGrounding?.patientId).toBe("P-1");
    expect(decision.riskLevel).toBe("READ");
  });

  it("routes patient-grounded analysis to clinical_analysis", async () => {
    const decision = await layaClassify("assess this patient's condition", baseContext);
    expect(decision.intent).toBe("clinical_analysis");
  });
});

describe("MayinBrainGateway", () => {
  it("produces speakable speech with evidence metadata", async () => {
    const gateway = new MayinBrainGateway(baseContext);
    const response = await gateway.process({
      text: "show latest CBC results",
      context: baseContext,
      language: "en-IN",
    });
    expect(response.speech.length).toBeGreaterThan(0);
    expect(response.responseId).toBeTruthy();
    expect(response.dataSources?.length).toBeGreaterThan(0);
    expect(response.toolsUsed?.length).toBeGreaterThan(0);
    expect(response.actionTaken?.type).toBe("query");
  });

  it("returns a navigation action for dashboard commands", async () => {
    const gateway = new MayinBrainGateway(baseContext);
    const response = await gateway.process({
      text: "open radiology",
      context: baseContext,
      language: "en-IN",
    });
    expect(response.actionTaken?.type).toBe("navigation");
    expect(response.actionTaken?.details?.dashboard).toBe("radiology");
  });

  it("requires confirmation for pharmacy dispatch", async () => {
    const gateway = new MayinBrainGateway(baseContext);
    const response = await gateway.process({
      text: "dispatch insulin order",
      context: baseContext,
      language: "en-IN",
    });
    expect(response.actionTaken?.type).toBe("confirmation_required");
    expect(response.speech.toLowerCase()).toContain("confirm");
  });

  it("explains reasoning safely without chain-of-thought", async () => {
    const gateway = new MayinBrainGateway(baseContext);
    const response = await gateway.process({
      text: "show latest CBC results",
      context: baseContext,
      language: "en-IN",
    });
    const explanation = gateway.explainReasoning(response);
    expect(explanation).toContain("I checked");
    expect(explanation.toLowerCase()).not.toContain("chain of thought");
  });

  it("reuses one session singleton", () => {
    const a = getMayinBrainGateway(baseContext);
    const b = getMayinBrainGateway({ ...baseContext, patientId: "P-2" });
    expect(a).toBe(b);
    expect(a.getContext().patientId).toBe("P-2");
  });
});

describe("selectWorkflow", () => {
  it("maps intents to LangGraph workflows", () => {
    expect(
      selectWorkflow({
        intent: "clinical_analysis",
        urgency: "ROUTINE",
        riskLevel: "READ",
        requiresConfirmation: false,
        explanation: "",
      })
    ).toBe("patient_clinical_analysis");
    expect(
      selectWorkflow({
        intent: "acknowledge",
        urgency: "ROUTINE",
        riskLevel: "READ",
        requiresConfirmation: false,
        explanation: "",
      })
    ).toBe("none");
  });
});

