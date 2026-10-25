import { describe, expect, it } from "vitest";
import { HOTSPOTS } from "@/components/Doctor/HumanAnatomyDashboard";

function x(id: string): number {
  const hotspot = HOTSPOTS.find((candidate) => candidate.id === id);
  if (!hotspot) throw new Error(`Missing hotspot ${id}`);
  return hotspot.x;
}

describe("HumanAnatomyDashboard hotspot sides", () => {
  it("places cardiovascular hotspots on anatomical sides", () => {
    expect(x("hs-cardio-rca")).toBeLessThan(150);
    expect(x("hs-cardio-sa")).toBeLessThan(150);
    expect(x("hs-cardio-lcx")).toBeGreaterThan(150);
    expect(x("hs-cardio-lv")).toBeGreaterThan(150);
  });

  it("places digestive hotspots on anatomical sides", () => {
    expect(x("hs-dig-liver")).toBeLessThan(150);
    expect(x("hs-dig-gb")).toBeLessThan(150);
    expect(x("hs-dig-stomach")).toBeGreaterThan(150);
  });
});
