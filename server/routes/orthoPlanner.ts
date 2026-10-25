/**
 * ASTRA OrthoPlanner — Slicer Bridge API
 * ============================================================================
 * Endpoints for 3D Slicer BoneReconstructionPlanner integration.
 * SAFETY: Only predefined actions accepted. No arbitrary command execution.
 */
import type { Express } from "express";
import { spawn } from "child_process";
import { existsSync, writeFileSync, mkdirSync } from "fs";
import { join, resolve, sep } from "path";
import { tmpdir } from "os";

function findSlicerExecutable(): string | null {
  const envPath = process.env.SLICER_EXE;
  if (envPath && existsSync(envPath)) return envPath;

  // Common Windows locations
  const commonPaths = [
    "C:\\Program Files\\Slicer 5.6.2\\Slicer.exe",
    "C:\\Program Files\\Slicer 5.4.0\\Slicer.exe",
    "C:\\Program Files\\Slicer\\Slicer.exe",
    "C:\\Slicer\\Slicer.exe",
  ];

  for (const p of commonPaths) {
    if (existsSync(p)) return p;
  }
  return null;
}

function findBoneReconstructionPlanner(): string | null {
  const candidates = [
    resolve(process.cwd(), "external", "SlicerBoneReconstructionPlanner", "BoneReconstructionPlanner"),
    resolve(process.cwd(), "..", "SlicerBoneReconstructionPlanner", "BoneReconstructionPlanner"),
    "D:\\astra PM\\external\\SlicerBoneReconstructionPlanner\\BoneReconstructionPlanner",
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

export function registerOrthoPlannerRoutes(app: Express): void {
  // GET /api/ortho-planner/slicer/status — honest status report
  app.get("/api/ortho-planner/slicer/status", (_req, res) => {
    const exe = findSlicerExecutable();
    const ext = findBoneReconstructionPlanner();

    const status = {
      installed: !!exe,
      executableFound: !!exe,
      extensionFound: !!ext,
      ready: !!exe,
      mode: exe ? "native_slicer" : "embedded_vsp_engine",
      version: exe ? "3D Slicer (Native Desktop)" : "ASTRA Built-in 3D Mesh Viewer (Slicer not installed)",
      error: exe ? undefined : "3D Slicer not installed, using built-in meshes",
    };

    res.json(status);
  });

  // POST /api/ortho-planner/slicer/launch — launch Slicer with module
  app.post("/api/ortho-planner/slicer/launch", (req, res) => {
    const { action } = req.body ?? {};

    const exe = findSlicerExecutable();
    if (!exe) {
      return res.json({
        success: false,
        mode: "built_in_meshes",
        message: "3D Slicer not installed, using built-in meshes.",
      });
    }

    const extPath = findBoneReconstructionPlanner();
    try {
      const args = extPath ? ["--additional-module-paths", extPath] : [];
      const tmpDir = resolve(tmpdir(), `astra-brp-${Date.now()}`);
      mkdirSync(tmpDir, { recursive: true });
      const startupScript = join(tmpDir, "select_brp.py");
      writeFileSync(startupScript, [
        "import slicer",
        "try:",
        "    slicer.util.selectModule('BoneReconstructionPlanner')",
        "except Exception as e:",
        "    print('Error selecting module:', e)",
        "",
      ].join("\n"), "utf-8");
      args.push("--python-script", startupScript);

      const child = spawn(exe, args, {
        detached: true,
        shell: false,
        stdio: "ignore",
      });

      child.on("error", (err) => {
        console.error("[OrthoPlanner] Slicer launch error:", err.message);
      });

      child.unref();

      res.json({
        success: true,
        message: "Slicer launched with BoneReconstructionPlanner module auto-selected.",
        pid: child.pid,
      });
    } catch (err) {
      res.json({
        success: false,
        mode: "built_in_meshes",
        message: "3D Slicer could not be launched. Using built-in meshes.",
      });
    }
  });
}
