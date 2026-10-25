/**
 * ASTRA Stable — Supervisor isolation invariants.
 * ==============================================
 * These tests are the executable form of the stability contract:
 *
 *   §29  optional service failure never changes Astra core status
 *   §29  one service failure never restarts another service
 *   §29  gesture failure cannot affect Astra API
 *   §7   no crash-looping (threshold -> cooldown -> isolation)
 *   §6   no blanket restarts, ever
 *
 * Every test runs against an injected probe + injected restart, so nothing here
 * touches PM2, the network or a real port.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { resetBreakers } from "../../ai/circuitBreaker";
import { AstraSupervisor } from "./supervisor";
import { restartViaPm2 } from "./healthProbe";
import { DEFAULT_RECOVERY_POLICY, type ProbeFn, type RecoveryPolicy } from "./types";

const POLICY: RecoveryPolicy = {
  ...DEFAULT_RECOVERY_POLICY,
  failureThreshold: 3,
  cooldownMs: 300_000,
  maxAttempts: 3,
  healthIntervalMs: 30_000,
  probeTimeoutMs: 10,
};

interface Harness {
  sup: AstraSupervisor;
  down: Set<string>;
  restarts: string[];
  advance(ms: number): void;
}

function harness(throwFor?: Set<string>): Harness {
  const down = new Set<string>();
  const restarts: string[] = [];
  const clock = { t: 1_000_000 };

  const probe: ProbeFn = async (service) => {
    if (throwFor?.has(service.id)) throw new Error("probe exploded");
    if (service.probe === "none") return { ok: true, detail: "not probed" };
    return down.has(service.id)
      ? { ok: false, detail: "simulated down" }
      : { ok: true, detail: "simulated up" };
  };

  const sup = new AstraSupervisor({
    policy: POLICY,
    probe,
    restart: (pm2Name: string) => {
      restarts.push(pm2Name);
    },
    now: () => clock.t,
  });

  return { sup, down, restarts, advance: (ms) => (clock.t += ms) };
}

beforeEach(() => {
  resetBreakers();
});

describe("Astra core never changes state because of an optional failure", () => {
  it("stays online when every ai + extension service is down", async () => {
    const { sup, down } = harness();
    // LiteLLM and RouteLLM are RETIRED — they are not definitions anymore, so
    // they are absent from this list on purpose.
    for (const id of [
      "freellmapi",
      "ollama",
      "omniroute",
      "voicebox",
      "openclaw",
      "openhands-ui",
      "openhands-api",
      "hermes",
      "agent-zero",
      "paperclip",
      "n8n",
    ]) {
      down.add(id);
    }

    for (let i = 0; i < 6; i += 1) await sup.tick();

    expect(sup.dependencyReport().status).toBe("online");
    expect(sup.capabilityReport().status).toBe("online");
    // Internally the truth is still visible (§28).
    expect(sup.dependencyReport().dependencies.voicebox).not.toBe("healthy");
  });

  it("reports a voice problem inside the voice capability, not as a global state", () => {
    const { sup } = harness();
    sup.reportCapability("voice", "Voice", "needs-attention", "reconnecting");
    sup.reportCapability("gesture", "Gesture", "needs-attention", "camera permission required");

    const report = sup.capabilityReport();
    expect(report.status).toBe("online");
    expect(report.capabilities.map((c) => c.state)).toEqual(["needs-attention", "needs-attention"]);
  });
});

describe("Failure containment — one service, one restart", () => {
  it("restarts only the failing service and never any other", async () => {
    const { sup, down, restarts } = harness();
    down.add("voicebox");

    for (let i = 0; i < 3; i += 1) await sup.tick();

    expect(restarts).toEqual(["Voicebox"]);
    expect(sup.dependencyReport().dependencies["astra-api"]).toBe("healthy");
  });

  it("plans at most one restart per tick even when many services fail", async () => {
    const { sup, down } = harness();
    down.add("voicebox");
    down.add("openclaw");

    for (let i = 0; i < 3; i += 1) await sup.tick();
    const result = await sup.tick();

    expect(result.plan.restart.length).toBeLessThanOrEqual(1);
  });

  it("never restarts a dependency that is not a supervised process", async () => {
    const { sup, down, restarts } = harness();
    down.add("ollama"); // no PM2 app in config/ports.json

    for (let i = 0; i < 4; i += 1) await sup.tick();

    expect(restarts).toEqual([]);
    const skipped = sup
      .recentEvents()
      .filter((e) => e.kind === "restart-skipped" && e.serviceId === "ollama");
    expect(skipped.some((e) => e.detail?.includes("not a supervised process"))).toBe(true);
  });
});

describe("Gesture is a browser capability, never a PM2 service", () => {
  it("is absent from the service registry and from the supervised list", () => {
    const { sup } = harness();
    expect(sup.definitions().some((d) => d.id === "gesture")).toBe(false);
    expect(sup.supervisedIds()).not.toContain("gesture");
  });

  it("cannot affect Astra API when the camera is unusable", async () => {
    const { sup } = harness();
    sup.reportCapability("gesture", "Gesture", "needs-attention", "camera unavailable");

    await sup.tick();

    expect(sup.dependencyReport().dependencies["astra-api"]).toBe("healthy");
    expect(sup.dependencyReport().status).toBe("online");
    expect(sup.recentEvents().some((e) => e.serviceId === "gesture")).toBe(false);
  });
});

describe("Crash-loop protection", () => {
  it("does not restart before the failure threshold is reached", async () => {
    const { sup, down, restarts } = harness();
    down.add("voicebox");

    await sup.tick();
    await sup.tick();
    expect(restarts).toEqual([]);

    await sup.tick();
    expect(restarts).toEqual(["Voicebox"]);
  });

  it("respects the restart cooldown for the same service", async () => {
    const { sup, down, restarts, advance } = harness();
    down.add("voicebox");

    for (let i = 0; i < 3; i += 1) await sup.tick();
    expect(restarts).toEqual(["Voicebox"]);

    // Still down and still failing, but inside the cooldown window.
    for (let i = 0; i < 4; i += 1) await sup.tick();
    expect(restarts).toEqual(["Voicebox"]);

    // Cooldown elapsed so one more scoped attempt is allowed.
    advance(POLICY.cooldownMs + 1);
    await sup.tick();
    expect(restarts).toEqual(["Voicebox", "Voicebox"]);
  });

  it("isolates a service after its restart budget instead of looping forever", async () => {
    const { sup, down, restarts, advance } = harness();
    down.add("voicebox");

    for (let cycle = 0; cycle < 5; cycle += 1) {
      for (let i = 0; i < 3; i += 1) await sup.tick();
      advance(POLICY.cooldownMs + 1);
    }

    expect(restarts.length).toBeLessThanOrEqual(POLICY.maxAttempts);
    const voicebox = sup.snapshot().find((s) => s.id === "voicebox");
    expect(voicebox?.state).toBe("isolated");
    // Isolation is local: the stack reports its own status, unchanged.
    expect(sup.dependencyReport().status).toBe("online");
  });

  it("contains a probe that throws instead of propagating it", async () => {
    const { sup } = harness(new Set(["hermes"]));

    const failed = await sup.checkAll();

    expect(failed).toContain("hermes");
    const hermes = sup.snapshot().find((s) => s.id === "hermes");
    expect(hermes?.lastError).toContain("probe exploded");
  });
});

describe("Blanket restart commands are refused", () => {
  it("rejects all, ALL, * and everything", () => {
    for (const target of ["all", "ALL", "*", "everything"]) {
      expect(() => restartViaPm2(target)).toThrow(/refusing blanket PM2 target/);
    }
  });
});

describe("Route groups give availability without global failure", () => {
  it("reports the llm route available while any single provider answers", async () => {
    const { sup, down } = harness();
    down.add("freellmapi");
    down.add("omniroute");
    // ollama deliberately left up.

    await sup.tick();

    expect(sup.dependencyReport().routes["llm-route"]).toBe("available");
    expect(sup.dependencyReport().status).toBe("online");
  });

  it("reports the route unavailable while Astra status is still online", async () => {
    const { sup, down } = harness();
    // routellm is still a real (on-demand) definition, so it must be down too;
    // litellm is retired and no longer a definition at all.
    for (const id of ["freellmapi", "routellm", "ollama", "omniroute"]) down.add(id);

    await sup.tick();

    expect(sup.dependencyReport().routes["llm-route"]).toBe("unavailable");
    expect(sup.dependencyReport().status).toBe("online");
  });

  it("excludes retired services from supervision and the llm route group", () => {
    const { sup } = harness();
    expect(sup.definitions().some((d) => d.id === "litellm")).toBe(false);
    expect(sup.supervisedIds()).not.toContain("litellm");
    expect(Object.keys(sup.dependencyReport().routes)).toContain("llm-route");
  });
});

