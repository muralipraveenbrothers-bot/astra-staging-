// ASTRA OrthoPlanner Command Toolset
import type { OrthoPlan, PlannerLandmark, PlannerMeasurement, SlicerStatus } from "../types/orthoPlanner";
import { apiFetch, authHeaders } from "@/services/apiFetch";

export interface OrthoToolResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

// In-memory plan store (session only)
let currentPlan: OrthoPlan | null = null;

export function openOrthoPlanner(): OrthoToolResult {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("astra:navigate", { detail: { destination: "ortho_planner" } }));
  }
  return { success: true, message: "OrthoPlanner opened." };
}

export function setPlannerPatient(patientUhid: string, patientName: string): OrthoToolResult {
  currentPlan = {
    id: `plan-${Date.now()}`,
    patientUhid,
    patientName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: "ASTRA",
    bodyRegion: "",
    laterality: "NA",
    status: "DRAFT",
    landmarks: [],
    measurements: [],
    notes: [],
    imagingRefs: [],
  };
  return { success: true, message: `Patient ${patientName} set in planner.`, data: { planId: currentPlan.id } };
}

export function setPlannerView(view: string): OrthoToolResult {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("astra:ortho-command", { detail: { action: "set_view", args: view } }));
  }
  return { success: true, message: `View set to ${view}.` };
}

export function addPlannerLandmark(name: string, x: number, y: number, z?: number): OrthoToolResult {
  if (!currentPlan) return { success: false, message: "No active plan. Set patient first." };
  const landmark: PlannerLandmark = {
    id: `lm-${Date.now()}`,
    name,
    x,
    y,
    z,
    createdAt: new Date().toISOString(),
  };
  currentPlan.landmarks.push(landmark);
  currentPlan.updatedAt = new Date().toISOString();
  return { success: true, message: `Landmark "${name}" added.`, data: { landmarkId: landmark.id } };
}

export function startDistanceMeasurement(): OrthoToolResult {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("astra:ortho-command", { detail: { action: "measure_distance", args: "" } }));
  }
  return { success: true, message: "Distance measurement tool activated. Select two points." };
}

export function startAngleMeasurement(): OrthoToolResult {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("astra:ortho-command", { detail: { action: "measure_angle", args: "" } }));
  }
  return { success: true, message: "Angle measurement tool activated. Select three points." };
}

export function resetPlannerView(): OrthoToolResult {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("astra:ortho-command", { detail: { action: "reset_view", args: "" } }));
  }
  return { success: true, message: "View reset." };
}

export function savePlannerPlan(): OrthoToolResult {
  if (!currentPlan) return { success: false, message: "No plan to save." };
  currentPlan.updatedAt = new Date().toISOString();
  // In production, this would persist to backend
  return { success: true, message: `Plan saved. ${currentPlan.landmarks.length} landmarks, ${currentPlan.measurements.length} measurements.` };
}

export async function getSlicerStatus(): Promise<SlicerStatus> {
  try {
    const res = await apiFetch("/api/ortho-planner/slicer/status");
    if (!res.ok) throw new Error("Status endpoint unavailable");
    return await res.json();
  } catch {
    return {
      installed: false,
      executableFound: false,
      extensionFound: false,
      ready: false,
      version: "3D Slicer not installed, using built-in meshes",
    };
  }
}

export async function launchSlicerPlanner(): Promise<OrthoToolResult> {
  try {
    const res = await apiFetch("/api/ortho-planner/slicer/launch", {
      method: "POST",
      headers: authHeaders(true),
      body: JSON.stringify({ action: "launch_bone_reconstruction" }),
    });
    const data = await res.json();
    if (data.success) {
      return { success: true, message: data.message || "3D Slicer Bone Reconstruction Planner active." };
    }
    return { success: false, message: data.message || "3D Slicer could not be launched." };
  } catch {
    return { success: false, message: "3D Slicer is not installed. Using built-in 3D mesh viewer." };
  }
}

export function getCurrentPlan(): OrthoPlan | null {
  return currentPlan;
}

export function clearPlan(): void {
  currentPlan = null;
}
