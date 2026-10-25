import { matchStopUtterance, normalizeUtterance } from "../voice/safety/voiceSafety";

export type DashboardControlKind = "button" | "tab" | "chip";
export type DashboardSensitive = "medication" | "order" | "approval";

export interface DashboardControl {
  id: string;
  name: string;
  kind: DashboardControlKind;
  sensitive?: DashboardSensitive | null;
  x: number;
  y: number;
  w: number;
  h: number;
}

export function shouldBlockMouse(): false {
  return false;
}

export function controlAtPoint(controls: DashboardControl[], x: number, y: number): DashboardControl | null {
  return controls.find((control) => x >= control.x && y >= control.y && x <= control.x + control.w && y <= control.y + control.h) ?? null;
}

export function gestureSelect(input: {
  gesture: string;
  x: number;
  y: number;
  controls: DashboardControl[];
  viewerActive: boolean;
}): { ok: boolean; reason: string; controlId?: string } {
  if (input.viewerActive) return { ok: false, reason: "3d-viewer-owns-pointer" };
  if (input.gesture !== "pinch" && input.gesture !== "point") return { ok: false, reason: "not-a-select-gesture" };
  const hit = controlAtPoint(input.controls, input.x, input.y);
  if (!hit) return { ok: false, reason: "miss" };
  return { ok: true, reason: "selected", controlId: hit.id };
}

function bareConfirmation(norm: string): boolean {
  return /^(please\s+)?(approve|approved|approval|order|order it|place order|prescribe|prescribe it|give medication|confirm medication|confirm order|confirm approval|yes approve|yes order)\b/.test(norm);
}

export function voiceSelect(input: {
  text: string;
  controls: DashboardControl[];
  agentNames?: readonly string[];
}): { action: "stop" | "selected" | "refused" | "none"; controlId?: string; reason: string } {
  if (matchStopUtterance(input.text, input.agentNames)) return { action: "stop", reason: "stop-word" };
  const norm = normalizeUtterance(input.text);
  if (!norm) return { action: "none", reason: "empty" };
  const stripped = norm.replace(/^(open|show|select|go to|switch to)\s+/, "");
  const hit = input.controls.find((control) => {
    const name = normalizeUtterance(control.name);
    return Boolean(name) && (name === norm || name === stripped);
  });
  if (hit?.sensitive || (hit && bareConfirmation(norm)) || (!hit && bareConfirmation(norm))) {
    return { action: "refused", reason: "voice-cannot-confirm", controlId: hit?.id };
  }
  if (!hit) return { action: "none", reason: "no-match" };
  return { action: "selected", controlId: hit.id, reason: "spoken-name" };
}

type ControlElement = {
  getAttribute(name: string): string | null;
  getBoundingClientRect(): { left: number; top: number; width: number; height: number };
  click?: () => void;
};

export function readDashboardControls(doc: { querySelectorAll(selector: string): Iterable<ControlElement> }): DashboardControl[] {
  const controls: DashboardControl[] = [];
  for (const element of doc.querySelectorAll("[data-astra-control]")) {
    const id = element.getAttribute("data-astra-control") ?? "";
    const name = element.getAttribute("data-astra-name") ?? "";
    if (!id || !name) continue;
    const kind = element.getAttribute("data-astra-kind");
    const sensitive = element.getAttribute("data-astra-sensitive");
    const rect = element.getBoundingClientRect();
    controls.push({
      id,
      name,
      kind: kind === "tab" || kind === "chip" ? kind : "button",
      sensitive: sensitive === "medication" || sensitive === "order" || sensitive === "approval" ? sensitive : null,
      x: rect.left,
      y: rect.top,
      w: rect.width,
      h: rect.height,
    });
  }
  return controls;
}

export function activateDashboardControl(doc: { querySelector(selector: string): { click?: () => void } | null }, id: string): boolean {
  const selector = `[data-astra-control="${id.replace(/"/g, "")}"]`;
  const element = doc.querySelector(selector);
  if (!element?.click) return false;
  element.click();
  return true;
}
