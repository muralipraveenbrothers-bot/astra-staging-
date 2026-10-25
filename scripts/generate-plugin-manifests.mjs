// ASTRA AI — PLUGIN MANIFEST GENERATOR
// Generates config/plugins/{pluginId}/manifest.json for all catalog tiers (P0-P3).
// Run: node scripts/generate-plugin-manifests.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { P0_MANIFESTS } from "./plugin-manifests-p0.mjs";
import { P1_MANIFESTS } from "./plugin-manifests-p1.mjs";
import { P2_MANIFESTS } from "./plugin-manifests-p2.mjs";
import { P3_MANIFESTS } from "./plugin-manifests-p3.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = path.resolve(__dirname, "..", "config", "plugins");

const ALL = [...P0_MANIFESTS, ...P1_MANIFESTS, ...P2_MANIFESTS, ...P3_MANIFESTS];

function validate(manifest) {
  const errors = [];
  if (!manifest.pluginId) errors.push("missing pluginId");
  if (!manifest.version) errors.push("missing version");
  if (!manifest.name) errors.push("missing name");
  if (!manifest.description) errors.push("missing description");
  if (!Array.isArray(manifest.healthChecks)) errors.push("healthChecks must be an array");
  if (!manifest.dependencies || !Array.isArray(manifest.dependencies.required)) errors.push("dependencies.required must be an array");
  if (!Array.isArray(manifest.tools)) errors.push("tools must be an array");
  if (!Array.isArray(manifest.agents)) errors.push("agents must be an array");
  if (manifest.healthChecks.some((h) => !h.name || !h.endpoint || typeof h.critical !== "boolean")) {
    errors.push("invalid healthCheck entry (needs name, endpoint, critical)");
  }
  return errors;
}

let written = 0;
let failed = 0;
const seen = new Set();

for (const m of ALL) {
  const errs = validate(m);
  if (errs.length > 0) {
    console.error(`[FAIL] ${m.pluginId || "(no id)"}: ${errs.join("; ")}`);
    failed++;
    continue;
  }
  if (seen.has(m.pluginId)) {
    console.error(`[FAIL] ${m.pluginId}: duplicate pluginId`);
    failed++;
    continue;
  }
  seen.add(m.pluginId);
  const dir = path.join(CONFIG_DIR, m.pluginId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(m, null, 2));
  written++;
}

console.log(`\n[OK] ${written}/${ALL.length} manifests written to ${CONFIG_DIR}`);
if (failed > 0) console.error(`[ERR] ${failed} manifests failed validation`);
