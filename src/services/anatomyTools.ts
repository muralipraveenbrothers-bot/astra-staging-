// ASTRA Anatomy Command Toolset
// Astra-callable UI tools for anatomy visualization

import { anatomyCommandBus } from "./anatomyCommandBus";

export interface AnatomyToolResult {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
}

/**
 * Search for an anatomical structure by name/query
 */
export function findAnatomy(query: string): AnatomyToolResult {
  if (!query.trim()) {
    return { success: false, message: "No search query provided." };
  }
  anatomyCommandBus.search(query);
  return {
    success: true,
    message: `Searching anatomy for "${query}"...`,
  };
}

/**
 * Select an anatomical structure by ID
 */
export function selectAnatomy(id: string): AnatomyToolResult {
  if (!id) {
    return { success: false, message: "No structure ID provided." };
  }
  anatomyCommandBus.select(id);
  return { success: true, message: `Selected structure ${id}.` };
}

/**
 * Inspect an anatomical structure — show details panel
 */
export function inspectAnatomy(id: string): AnatomyToolResult {
  if (!id) {
    return { success: false, message: "No structure ID provided." };
  }
  anatomyCommandBus.select(id);
  return { success: true, message: `Inspecting structure ${id}.` };
}

/**
 * Isolate a single structure — hide everything else
 */
export function isolateAnatomy(id: string): AnatomyToolResult {
  if (!id) {
    return { success: false, message: "No structure ID provided." };
  }
  anatomyCommandBus.isolate(id);
  return { success: true, message: `Isolated structure ${id}.` };
}

/**
 * Show an entire anatomical system
 */
export function showAnatomySystem(system: string): AnatomyToolResult {
  if (!system) {
    return { success: false, message: "No system specified." };
  }
  anatomyCommandBus.showSystem(system);
  return { success: true, message: `Showing ${system} system.` };
}

/**
 * Hide an anatomical system
 */
export function hideSystem(system: string): AnatomyToolResult {
  if (!system) {
    return { success: false, message: "No system specified." };
  }
  anatomyCommandBus.hideSystem(system);
  return { success: true, message: `Hiding ${system} system.` };
}

/**
 * Explode the anatomy view
 */
export function explodeAnatomy(): AnatomyToolResult {
  anatomyCommandBus.explode();
  return { success: true, message: "Exploded anatomy view." };
}

/**
 * Reset the anatomy view to default state
 */
export function resetAnatomy(): AnatomyToolResult {
  anatomyCommandBus.reset();
  return { success: true, message: "Anatomy view reset." };
}

/**
 * Focus camera on a specific structure
 */
export function focusAnatomy(id: string): AnatomyToolResult {
  if (!id) {
    return { success: false, message: "No structure ID provided." };
  }
  anatomyCommandBus.select(id);
  anatomyCommandBus.cameraReset();
  return { success: true, message: `Focused on structure ${id}.` };
}
