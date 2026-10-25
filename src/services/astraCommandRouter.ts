// ASTRA Command Router — handles UI/navigation commands before LLM
export type AstraCommandResult = {
  handled: boolean;
  command?: string;
  success?: boolean;
  message?: string;
  requiresConfirmation?: boolean;
};

function navigate(destination: string): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("astra:navigate", { detail: { destination } })
    );
  }
}

function dispatchAnatomyCommand(detail: Record<string, unknown>): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("astra:anatomy-command", { detail }));
  }
}

function dispatchOrthoCommand(detail: Record<string, unknown>): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("astra:ortho-command", { detail }));
  }
}

function dispatchBoneReconCommand(detail: Record<string, unknown>): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("astra:bonerecon-command", { detail }));
  }
}

function normalizeInput(input: string): string {
  return input.toLowerCase().replace(/[.!?,;:]/g, "").replace(/\s+/g, " ").trim();
}

const NAVIGATION_CMDS: Record<string, string> = {
  "open doctor dashboard": "doctor", "open doctor": "doctor", "open anatomy": "doctor",
  "open ortho planner": "ortho_planner", "open orthoplanner": "ortho_planner",
  "open radiology": "radiology", "open laboratory": "laboratory", "open pharmacy": "pharmacy",
  "open ward": "ward", "open ot": "ot", "open command center": "command_center",
  "doctor open cheyyi": "doctor", "anatomy open cheyyi": "doctor",
  "ortho planner open cheyyi": "ortho_planner", "radiology open cheyyi": "radiology",
  "doctor kholo": "doctor", "anatomy kholo": "doctor", "ortho planner kholo": "ortho_planner",
};

const ANATOMY_CMDS: Record<string, { action: string; args: string }> = {
  "show skeleton": { action: "show_system", args: "skeletal" },
  "show muscles": { action: "show_system", args: "muscular" },
  "show vascular": { action: "show_system", args: "cardiovascular" },
  "show nervous": { action: "show_system", args: "nervous" },
  "show respiratory": { action: "show_system", args: "respiratory" },
  "show digestive": { action: "show_system", args: "digestive" },
  "hide muscles": { action: "hide_system", args: "muscular" },
  "hide skeleton": { action: "hide_system", args: "skeletal" },
  "explode": { action: "explode", args: "" },
  "reset": { action: "reset", args: "" },
  "reset anatomy": { action: "reset", args: "" },
  "camera reset": { action: "camera_reset", args: "" },
  "skeleton chupinchu": { action: "show_system", args: "skeletal" },
  "muscles hide cheyyi": { action: "hide_system", args: "muscular" },
  "skeleton dikhao": { action: "show_system", args: "skeletal" },
  "muscles dikhao": { action: "show_system", args: "muscular" },
  "muscles hide karo": { action: "hide_system", args: "muscular" },
};

const ORTHO_CMDS: Record<string, { action: string; args: string }> = {
  "ap view": { action: "set_view", args: "AP" },
  "pa view": { action: "set_view", args: "PA" },
  "lateral view": { action: "set_view", args: "lateral" },
  "reset view": { action: "reset_view", args: "" },
  "show ct": { action: "show_imaging", args: "CT" },
  "show mri": { action: "show_imaging", args: "MRI" },
  "ct open cheyyi": { action: "show_imaging", args: "CT" },
  "ct dikhao": { action: "show_imaging", args: "CT" },
  "add landmark": { action: "add_landmark", args: "" },
  "measure distance": { action: "measure_distance", args: "" },
  "measure angle": { action: "measure_angle", args: "" },
  "save plan": { action: "save_plan", args: "" },
  "launch slicer planner": { action: "launch_slicer", args: "" },
  "slicer reconstruction planner open cheyyi": { action: "launch_slicer", args: "" },
};

// BoneReconstructionPlanner workflow commands
const BONERECON_CMDS: Record<string, { action: string; args: string }> = {
  "open bone reconstruction planner": { action: "open_dashboard", args: "" },
  "bone reconstruction planner open cheyyi": { action: "open_dashboard", args: "" },
  "bone planner kholo": { action: "open_dashboard", args: "" },
  "load test case": { action: "load_test_case", args: "" },
  "test case load cheyyi": { action: "load_test_case", args: "" },
  "create 3d models": { action: "create_models", args: "" },
  "3d models create cheyyi": { action: "create_models", args: "" },
  "add cut plane": { action: "add_cut_plane", args: "" },
  "add mandible plane": { action: "add_cut_plane", args: "" },
  "plane add cheyyi": { action: "add_cut_plane", args: "" },
  "remove cut plane": { action: "remove_cut_plane", args: "" },
  "create neomandible": { action: "create_neomandible", args: "" },
  "neomandible create cheyyi": { action: "create_neomandible", args: "" },
  "generate fibula guide base": { action: "generate_fibula_guidebase", args: "" },
  "fibula guide base generate cheyyi": { action: "generate_fibula_guidebase", args: "" },
  "create fibula surgical guide": { action: "create_fibula_guide", args: "" },
  "fibula surgical guide create cheyyi": { action: "create_fibula_guide", args: "" },
  "create mandible resection boxes": { action: "create_mandible_resection", args: "" },
  "create mandible surgical guide": { action: "create_mandible_guide", args: "" },
  "mandible surgical guide create cheyyi": { action: "create_mandible_guide", args: "" },
  "run head segmentation": { action: "run_head_segmentation", args: "" },
  "run legs segmentation": { action: "run_legs_segmentation", args: "" },
  "donor leg left": { action: "donor_leg", args: "Left" },
  "donor leg right": { action: "donor_leg", args: "Right" },
  "select mandible ct": { action: "select_mandible_ct", args: "" },
  "select fibula ct": { action: "select_fibula_ct", args: "" },
};

export function routeCommand(input: string): AstraCommandResult {
  const n = normalizeInput(input);

  for (const [kw, dest] of Object.entries(NAVIGATION_CMDS)) {
    if (n.includes(kw)) {
      navigate(dest);
      return { handled: true, command: "navigate", success: true, message: `Navigating to ${dest.replace(/_/g, " ")}.` };
    }
  }

  for (const [kw, cfg] of Object.entries(ANATOMY_CMDS)) {
    if (n.includes(kw)) {
      dispatchAnatomyCommand(cfg);
      return { handled: true, command: cfg.action, success: true, message: `${cfg.action} executed.` };
    }
  }

  const iso = n.match(/(\w+)\s+isolate\s*(?:cheyyi|karo)?/) || n.match(/isolate\s+(?:the\s+)?(\w+)/);
  if (iso) {
    dispatchAnatomyCommand({ action: "isolate", args: iso[1] });
    return { handled: true, command: "isolate", success: true, message: `Isolating ${iso[1]}.` };
  }

  const search = n.match(/search\s+(?:for\s+)?(\w+)/) || n.match(/(\w+)\s+(?:ekkada\s+undo|dikhao|chupinchu)/);
  if (search) {
    dispatchAnatomyCommand({ action: "search", args: search[1] });
    return { handled: true, command: "search", success: true, message: `Searching for ${search[1]}.` };
  }

  for (const [kw, cfg] of Object.entries(ORTHO_CMDS)) {
    if (n.includes(kw)) {
      dispatchOrthoCommand(cfg);
      return {
        handled: true, command: cfg.action, success: true, message: `${cfg.action} executed.`,
        requiresConfirmation: cfg.action === "launch_slicer" || cfg.action === "save_plan",
      };
    }
  }

  // 6. BoneReconstructionPlanner workflow commands
  for (const [kw, cfg] of Object.entries(BONERECON_CMDS)) {
    if (n.includes(kw)) {
      dispatchBoneReconCommand(cfg);
      return {
        handled: true, command: cfg.action, success: true, message: `${cfg.action} executed.`,
        requiresConfirmation: cfg.action === "launch_slicer",
      };
    }
  }

  return { handled: false, message: "Passing to AI." };
}
