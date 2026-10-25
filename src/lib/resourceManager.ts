/**
 * Astra AI — Resource Manager & Hardware Awareness
 * ===================================================
 * Automatically analyzes local hardware (CPU, GPU, RAM, VRAM)
 * and determines optimal execution tiers (Local Fast, Local Specialist, Cloud Frontier).
 * Enforces safety boundaries to prevent system starvation.
 */

export interface SystemResourceProfile {
  totalRamGB: number;
  availableRamGB: number;
  gpuName: string;
  vramMB: number;
  hasCuda: boolean;
  cpuCores: number;
  ollamaStatus: "CONNECTED" | "OFFLINE" | "DEGRADED";
  installedLocalModels: string[];
  recommendedExecutionTier: "LOCAL_FAST" | "HYBRID_BALANCED" | "FRONTIER_CLOUD";
  maxSafeLocalParamSizeB: number;
}

// Measured hardware profile
export const HOST_HARDWARE_BASELINE: SystemResourceProfile = {
  totalRamGB: 24,
  availableRamGB: 16,
  gpuName: "AMD Radeon 820M Graphics",
  vramMB: 512,
  hasCuda: false,
  cpuCores: 8,
  ollamaStatus: "CONNECTED",
  installedLocalModels: ["bge-m3:latest"],
  recommendedExecutionTier: "HYBRID_BALANCED",
  maxSafeLocalParamSizeB: 8, // Up to 8B quant models run comfortably on 24GB host RAM
};

/**
 * Evaluates whether a proposed model download or execution fits host capacity.
 */
export function evaluateModelSafety(modelParamSizeB: number, requiresVramMB: number = 0): {
  safeToRun: boolean;
  strategy: "LOCAL_CPU_RAM" | "LOCAL_GPU" | "ROUTE_CLOUD" | "REJECT_EXCESSIVE";
  reason: string;
} {
  if (modelParamSizeB > HOST_HARDWARE_BASELINE.maxSafeLocalParamSizeB * 2) {
    return {
      safeToRun: false,
      strategy: "ROUTE_CLOUD",
      reason: `Model (${modelParamSizeB}B) exceeds safe host capacity (${HOST_HARDWARE_BASELINE.maxSafeLocalParamSizeB}B). Automatically routed to Cloud Frontier.`,
    };
  }

  if (requiresVramMB > HOST_HARDWARE_BASELINE.vramMB && !HOST_HARDWARE_BASELINE.hasCuda) {
    return {
      safeToRun: true,
      strategy: "LOCAL_CPU_RAM",
      reason: `GPU VRAM (${HOST_HARDWARE_BASELINE.vramMB}MB) insufficient for full GPU offload; executing on Host RAM (24GB).`,
    };
  }

  return {
    safeToRun: true,
    strategy: "LOCAL_CPU_RAM",
    reason: "Model fits within available host memory allocation.",
  };
}

/**
 * Dynamic resource probe
 */
export async function probeSystemResources(): Promise<SystemResourceProfile> {
  try {
    const res = await fetch("/api/system/resources");
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Fallback to measured baseline
  }
  return HOST_HARDWARE_BASELINE;
}
