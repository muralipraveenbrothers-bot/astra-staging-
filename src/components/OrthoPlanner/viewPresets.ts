export type PlannerView = "AP" | "PA" | "lateral" | "oblique" | "superior" | "inferior";

export interface ViewPreset {
  position: [number, number, number];
  target: [number, number, number];
}

export const VIEW_PRESETS: Record<PlannerView, ViewPreset> = {
  AP: { position: [0, 0, 5.8], target: [0, 0, 0] },
  PA: { position: [0, 0, -5.8], target: [0, 0, 0] },
  lateral: { position: [5.8, 0, 0], target: [0, 0, 0] },
  oblique: { position: [4, 2, 4], target: [0, 0, 0] },
  superior: { position: [0, 5.8, 0], target: [0, 0, 0] },
  inferior: { position: [0, -5.8, 0], target: [0, 0, 0] },
};

export function getViewPreset(view: PlannerView): ViewPreset {
  return VIEW_PRESETS[view] ?? VIEW_PRESETS.AP;
}
