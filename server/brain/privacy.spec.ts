import { describe, expect, it } from "vitest";
import { providerAllowed } from "./privacy";

describe("privacy alignment", () => {
  it("rejects cloud proxies for PHI and allows ollama", () => {
    expect(providerAllowed("PHI", "omniroute")).toBe(false);
    expect(providerAllowed("PHI", "freellmapi")).toBe(false);
    expect(providerAllowed("PHI", "ollama")).toBe(true);
    expect(providerAllowed("PUBLIC", "freellmapi")).toBe(true);
  });
});
