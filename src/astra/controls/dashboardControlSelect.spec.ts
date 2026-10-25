import { describe, expect, it } from "vitest";
import { gestureSelect, shouldBlockMouse, voiceSelect, type DashboardControl } from "./dashboardControlSelect";

const tab: DashboardControl = { id: "map360", name: "360 map", kind: "tab", x: 0, y: 0, w: 40, h: 20 };
const approve: DashboardControl = { id: "approve", name: "Approve", kind: "button", sensitive: "approval", x: 50, y: 0, w: 40, h: 20 };

describe("dashboard control selection", () => {
  it("lets pinch or point select a control and never blocks the mouse", () => {
    expect(shouldBlockMouse()).toBe(false);
    expect(gestureSelect({ gesture: "pinch", x: 10, y: 10, controls: [tab, approve], viewerActive: false }).controlId).toBe("map360");
    expect(gestureSelect({ gesture: "point", x: 60, y: 10, controls: [tab, approve], viewerActive: false }).controlId).toBe("approve");
    expect(gestureSelect({ gesture: "pinch", x: 10, y: 10, controls: [tab], viewerActive: true }).reason).toBe("3d-viewer-owns-pointer");
    expect(gestureSelect({ gesture: "fist", x: 10, y: 10, controls: [tab], viewerActive: false }).ok).toBe(false);
  });

  it("selects a spoken tab name, refuses approval, and still honours stop words", () => {
    expect(voiceSelect({ text: "360 map", controls: [tab, approve] })).toEqual({ action: "selected", controlId: "map360", reason: "spoken-name" });
    expect(voiceSelect({ text: "open 360 map", controls: [tab, approve] }).action).toBe("selected");
    expect(voiceSelect({ text: "approve", controls: [tab, approve] }).action).toBe("refused");
    expect(voiceSelect({ text: "Approve", controls: [tab, approve] }).reason).toBe("voice-cannot-confirm");
    expect(voiceSelect({ text: "order amoxicillin", controls: [tab] }).action).toBe("refused");
    expect(voiceSelect({ text: "stop", controls: [approve] })).toEqual({ action: "stop", reason: "stop-word" });
    expect(voiceSelect({ text: "aapu", controls: [tab] }).action).toBe("stop");
    expect(voiceSelect({ text: "stop the bleeding", controls: [tab] }).action).toBe("none");
    expect(voiceSelect({ text: "hello doctor", controls: [tab, approve] })).toEqual({ action: "none", reason: "no-match" });
    expect(voiceSelect({ text: "what is the ward status", controls: [tab, approve] }).action).toBe("none");
  });
});
