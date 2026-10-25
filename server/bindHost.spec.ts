import { describe, expect, it } from "vitest";
import { resolveBindHost } from "./bindHost";

describe("API bind host", () => {
  it("defaults to loopback", () => {
    expect(resolveBindHost(undefined)).toBe("127.0.0.1");
    expect(resolveBindHost("   ")).toBe("127.0.0.1");
  });

  it("honors an explicit override", () => {
    expect(resolveBindHost("0.0.0.0")).toBe("0.0.0.0");
  });
});
