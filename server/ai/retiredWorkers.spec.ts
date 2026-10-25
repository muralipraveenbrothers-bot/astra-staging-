import { describe, expect, it } from "vitest";
import { classifyWorker, WORKERS } from "./workerDispatch";
import { CANONICAL_SERVICES, RETIRED_SERVICE_IDS } from "../services/canonicalRegistry";

describe("retired worker handover", () => {
  it("routes all retired selections to the existing LangGraph executor", () => {
    for (const id of RETIRED_SERVICE_IDS) {
      expect(classifyWorker("Prepare a read-only task summary", id)).toBe("langgraph");
      expect(CANONICAL_SERVICES.some((service) => service.id === id)).toBe(false);
      expect(WORKERS.some((worker) => worker.id === id)).toBe(false);
    }
    expect(classifyWorker("Prepare an n8n automation summary")).toBe("langgraph");
  });
  it("keeps the active Laya and Astra services discoverable", () => {
    expect(CANONICAL_SERVICES.find((service) => service.id === "laya")?.healthUrl).toBe("http://127.0.0.1:8791/v1/health");
    expect(CANONICAL_SERVICES.some((service) => service.id === "astra")).toBe(true);
  });
});
