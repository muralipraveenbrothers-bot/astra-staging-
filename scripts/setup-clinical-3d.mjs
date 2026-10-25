/**
 * ASTRA Clinical 3D Setup Script
 * Clones and builds external anatomy/surgical planning dependencies.
 *
 * - Human Atlas → external/human-atlas/ (built to dist/, served at /integrations/human-atlas/)
 * - Anatomy Explorer → external/Anatomy-Explorer/ (reference only)
 * - SlicerBoneReconstructionPlanner → external/SlicerBoneReconstructionPlanner/ (Slicer extension)
 *
 * NEVER deletes existing ASTRA files.
 * NEVER merges external package.json into ASTRA package.json.
 */
import { execSync } from "child_process";
import { existsSync, mkdirSync, readdirSync } from "fs";
import { join, resolve } from "path";

const ROOT = resolve(process.cwd());
const EXTERNAL_DIR = join(ROOT, "external");

const REPOS = [
  {
    name: "human-atlas",
    url: "https://github.com/ashemag/human-atlas.git",
    build: true,
    description: "Primary detailed anatomy engine (microfrontend)",
  },
  {
    name: "Anatomy-Explorer",
    url: "https://github.com/wchernandez/Anatomy-Explorer.git",
    build: false,
    description: "Reference for UX/interaction patterns",
  },
  {
    name: "SlicerBoneReconstructionPlanner",
    url: "https://github.com/SlicerIGT/SlicerBoneReconstructionPlanner.git",
    build: false,
    description: "3D Slicer extension for mandible/fibula reconstruction",
  },
];

function run(cmd, cwd) {
  console.log(`  → ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

function checkGit() {
  try {
    execSync("git --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function checkNodeVersion() {
  const version = process.version; // e.g. v20.11.0
  const major = parseInt(version.slice(1).split(".")[0], 10);
  return major;
}

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    console.log(`  Created: ${dir}`);
  }
}

function main() {
  console.log("=================================================");
  console.log("ASTRA Clinical 3D — Setup");
  console.log("=================================================\n");

  // Pre-flight checks
  if (!checkGit()) {
    console.error("ERROR: git is not installed. Please install git first.");
    process.exit(1);
  }
  console.log("✓ git found");

  const nodeMajor = checkNodeVersion();
  console.log(`✓ Node.js ${process.version}`);

  // Create external directory
  ensureDir(EXTERNAL_DIR);

  // Clone/update repos
  for (const repo of REPOS) {
    const repoDir = join(EXTERNAL_DIR, repo.name);
    console.log(`\n--- ${repo.name} ---`);
    console.log(`  ${repo.description}`);

    if (existsSync(join(repoDir, ".git"))) {
      console.log("  Updating existing clone...");
      run("git pull --ff-only", repoDir);
    } else {
      console.log("  Cloning...");
      run(`git clone --depth 1 ${repo.url} "${repoDir}"`, EXTERNAL_DIR);
    }

    // Preserve license files
    const licenseFiles = ["LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING"];
    for (const lf of licenseFiles) {
      if (existsSync(join(repoDir, lf))) {
        console.log(`  ✓ Preserved ${lf}`);
      }
    }
  }

  // Build Human Atlas (isolated)
  console.log("\n--- Building Human Atlas (isolated) ---");
  const atlasDir = join(EXTERNAL_DIR, "human-atlas");

  if (nodeMajor >= 18) {
    try {
      console.log("  Installing dependencies...");
      run("npm install", atlasDir);
      console.log("  Building...");
      run("npm run build", atlasDir);

      const atlasDist = join(atlasDir, "dist");
      if (existsSync(atlasDist)) {
        console.log("  ✓ Human Atlas built successfully");
        console.log(`  Output: ${atlasDist}`);
        console.log("  Served at: /integrations/human-atlas/");
      } else {
        console.log("  ⚠ Build completed but dist/ not found. Check build output.");
      }
    } catch (err) {
      console.log("  ⚠ Human Atlas build failed. ASTRA will use native anatomy fallback.");
      console.log(`  Error: ${err.message}`);
    }
  } else {
    console.log(`  ⚠ Node.js ${process.version} may be too old for Human Atlas.`);
    console.log("  HUMAN_ATLAS_BUILD = SKIPPED_NODE_VERSION");
    console.log("  ASTRA will continue with native anatomy.");
  }

  console.log("\n=================================================");
  console.log("Setup complete.");
  console.log("=================================================");
  console.log("\nNext steps:");
  console.log("  1. Human Atlas: served at /integrations/human-atlas/ (if built)");
  console.log("  2. Slicer: set SLICER_EXE env var to enable reconstruction planning");
  console.log("  3. Restart ASTRA server to pick up new routes");
  console.log("\nASTRA main build is unaffected.");
}

main();
