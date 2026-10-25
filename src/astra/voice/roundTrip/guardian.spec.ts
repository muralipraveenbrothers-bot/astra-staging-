/**
 * ASTRA AI — AstraVoiceGuardian.
 * =============================
 * The Guardian's core promise: an accepted turn ALWAYS ends with visible text,
 * and it never bypasses authentication, RBAC or the clinical-risk routing.
 */
import { describe, it, expect } from "vitest";
import {
  AstraVoiceGuardian,
  addressFor,
  classifyLocally,
  type AstraIdentity,
  type GuardianClassification,
  type GuardianDeps,
} from "./voiceGuardian";

const IDENTITY: AstraIdentity = {
  userId: "dr-murali",
  name: "Dr. Murali Praveen",
  role: "doctor",
  dashboards: ["doctor", "reception", "general"],
};

function guardianWith(overrides: Partial<GuardianDeps> = {}) {
  const calls = { respond: 0, clinical: 0 };
  const guardian = new AstraVoiceGuardian({
    requireAuthenticatedUser: () => IDENTITY,
    assertDashboardAccess: (identity, dashboard) =>
      identity.dashboards.includes(dashboard) ? { allowed: true } : { allowed: false },
    classify: (): GuardianClassification => ({ intent: "general", risk: "normal" }),
    respond: () => {
      calls.respond += 1;
      return { text: "Here is your answer." };
    },
    ...overrides,
  });
  return { guardian, calls };
}

/** Guardian for an identity that is permitted the given extra workspaces. */
function guardianAllowed(
  authorizeWorkspaces: AstraIdentity["dashboards"],
  overrides: Partial<GuardianDeps> = {}
) {
  return guardianWith({
    requireAuthenticatedUser: () => ({
      ...IDENTITY,
      dashboards: [...IDENTITY.dashboards, ...authorizeWorkspaces],
    }),
    ...overrides,
  });
}

describe("Guardian — never a silent stop", () => {
  it("answers a wake call without calling the model at all", async () => {
    const { guardian, calls } = guardianWith();
    const response = await guardian.handleTurn({
      userId: IDENTITY.userId,
      dashboard: "doctor",
      text: "Hi Saarathi",
    });
    expect(response.intent).toBe("social_acknowledgement");
    expect(response.text).toMatch(/Doctor/);
    expect(calls.respond).toBe(0);
  });

  it("returns honest text for an empty transcript instead of nothing", async () => {
    const { guardian } = guardianWith();
    const response = await guardian.handleTurn({
      userId: IDENTITY.userId,
      dashboard: "doctor",
      text: "   ",
    });
    expect(response.text.length).toBeGreaterThan(0);
    expect(response.intent).toBe("empty_transcript");
    expect(response.degraded).toBe("ROUTER_FAILED");
  });

  it("refuses honestly when the session is not authenticated", async () => {
    const { guardian } = guardianWith({ requireAuthenticatedUser: () => null });
    const response = await guardian.handleTurn({
      userId: "",
      dashboard: "doctor",
      text: "bed 4 CBC chupinchu",
    });
    expect(response.intent).toBe("unauthenticated");
    expect(response.text).toMatch(/authenticated/i);
  });

  it("obeys RBAC: the active workspace must be permitted", async () => {
    const { guardian, calls } = guardianWith({
      assertDashboardAccess: () => ({ allowed: false, reason: "Not your workspace." }),
    });
    const response = await guardian.handleTurn({
      userId: IDENTITY.userId,
      dashboard: "pharmacy",
      text: "pending orders chupinchu",
    });
    expect(response.intent).toBe("access_denied");
    expect(response.text).toContain("Not your workspace.");
    expect(calls.respond).toBe(0);
  });

  it("routes high clinical risk through the clinical path, not the generic one", async () => {
    const { guardian, calls } = guardianWith({
      classify: () => ({ intent: "clinical_urgent", risk: "high_clinical" }),
      clinicalRespond: () => {
        calls.clinical += 1;
        return { text: "Escalating to the clinical reasoning pipeline." };
      },
    });
    const response = await guardian.handleTurn({
      userId: IDENTITY.userId,
      dashboard: "doctor",
      text: "patient deteriorating, what do I do",
    });
    expect(response.risk).toBe("high_clinical");
    expect(calls.clinical).toBe(1);
    expect(calls.respond).toBe(0);
  });

  it("tells the user which stage failed when the model returns nothing", async () => {
    const { guardian } = guardianWith({ respond: () => ({ text: "   " }) });
    const response = await guardian.handleTurn({
      userId: IDENTITY.userId,
      dashboard: "reception",
      text: "register Ramesh 46 male",
    });
    expect(response.degraded).toBe("MODEL_FAILED");
    expect(response.text).toMatch(/couldn't complete/i);
    expect(response.text).toMatch(/[Nn]othing was changed/);
  });
});

describe("Guardian — failure honesty and normal answers", () => {
  it("tells the user when the reasoning step throws", async () => {
    const { guardian } = guardianAllowed(["lab"], {
      respond: () => {
        throw new Error("gateway 500");
      },
    });
    const response = await guardian.handleTurn({
      userId: IDENTITY.userId,
      dashboard: "lab",
      text: "which samples are pending",
    });
    expect(response.degraded).toBe("MODEL_FAILED");
    expect(response.text.length).toBeGreaterThan(0);
  });

  it("tells the user when the router itself fails", async () => {
    const { guardian } = guardianAllowed(["billing"], {
      classify: () => {
        throw new Error("router offline");
      },
    });
    const response = await guardian.handleTurn({
      userId: IDENTITY.userId,
      dashboard: "billing",
      text: "show today's pending payments",
    });
    expect(response.intent).toBe("router_failed");
    expect(response.text.length).toBeGreaterThan(0);
  });

  it("returns a complete response envelope for a normal turn", async () => {
    const { guardian } = guardianWith();
    const response = await guardian.handleTurn({
      userId: IDENTITY.userId,
      dashboard: "reception",
      text: "Ravi ki ortho appointment book cheyyi",
    });
    expect(response.turnId).toMatch(/^voice_turn_/);
    expect(response.dashboard).toBe("reception");
    expect(response.speak).toBe(true);
    expect(response.text).toBe("Here is your answer.");
    expect(response.degraded).toBeUndefined();
  });

  it("detects the language of the turn it answers", async () => {
    const { guardian } = guardianWith();
    const response = await guardian.handleTurn({
      userId: IDENTITY.userId,
      dashboard: "ward",
      text: "బెడ్ 2 latest vitals చూపించు",
    });
    expect(response.language).toBe("te");
  });

  it("honours an explicit speak=false without touching the text", async () => {
    const { guardian } = guardianWith();
    const response = await guardian.handleTurn({
      userId: IDENTITY.userId,
      dashboard: "billing",
      text: "pending payments",
      speak: false,
    });
    expect(response.speak).toBe(false);
    expect(response.text.length).toBeGreaterThan(0);
  });

  it("passes the ROLE/TASK/INSTRUCTIONS/DATA prompt to the brain", async () => {
    let seenSystem = "";
    const { guardian } = guardianWith({
      respond: (request) => {
        seenSystem = request.system;
        return { text: "ok" };
      },
    });
    await guardian.handleTurn({
      userId: IDENTITY.userId,
      dashboard: "doctor",
      text: "bed 4 patient latest Hb entha",
    });
    expect(seenSystem).toContain("CLINICAL COMMAND CENTRE");
    expect(seenSystem).toContain("[TASK]");
  });
});

describe("Guardian helpers", () => {
  it("addresses clinicians by professional title, never by assumed gender", () => {
    expect(addressFor(IDENTITY)).toBe("Doctor");
    expect(addressFor({ ...IDENTITY, role: "nurse", name: "Anjali Verma" })).toBe("Sister");
    expect(addressFor({ ...IDENTITY, role: "pharmacist", name: "Sana Iqbal" })).toBe("Pharmacist");
    // An unknown/ambiguous role falls back to the person's own name.
    expect(addressFor({ ...IDENTITY, role: "ward", name: "Anjali Verma" })).toBe("Anjali");
    expect(addressFor({ ...IDENTITY, role: "reception", name: "Meera Nair" })).toBe("Meera");
    expect(addressFor({ ...IDENTITY, role: "supervisor", name: "" })).toBe("");
  });

  it("classifies risk conservatively and honestly", () => {
    expect(classifyLocally("patient unconscious, code blue").risk).toBe("high_clinical");
    expect(classifyLocally("bed 4 CBC report chupinchu").risk).toBe("clinical");
    expect(classifyLocally("hi Astra, how are you?").risk).toBe("normal");
  });
});