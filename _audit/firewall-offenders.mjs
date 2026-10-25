// Mirror of the stack-contract retired-port firewall, so the full offender list
// can be read without a truncated assertion diff. Audit-only; not shipped.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const RETIRED = /(?::|,|=)\s*(3001|5170)\b/;
const SKIP_DIRS = new Set([
  "node_modules", "dist", "build", "release", "releases", "backups",
  ".git", "__pycache__", "venv", ".venv", ".build",
  "modules", "freellmapi", "public", "logs", "knowledge-data", "graphify-out",
  "integrations", "data", "coverage",
  "_quarantine", "_audit", "_diagnostics",
]);
const SKIP_PREFIXES = [
  "config/plugins/freellm-provider/app/",
  "config/plugins/omniroute-gateway/app/",
];
const ALLOWED_FILES = new Set(["config/ports.json"]);

const offenders = [];
function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      scan(path.join(dir, entry.name));
      continue;
    }
    const isRuntimeConfig =
      /\.(ts|tsx|mjs|cjs|json|ps1|cmd|bat|py)$/.test(entry.name) ||
      /^\.env/.test(entry.name) ||
      /\.env(\.example)?$/.test(entry.name);
    if (!isRuntimeConfig) continue;
    if (entry.name.endsWith(".spec.ts")) continue;
    const rel = path.relative(ROOT, path.join(dir, entry.name)).replace(/\\/g, "/");
    if (ALLOWED_FILES.has(rel)) continue;
    if (SKIP_PREFIXES.some((p) => rel.startsWith(p))) continue;
    const text = fs.readFileSync(path.join(dir, entry.name), "utf8");
    if (RETIRED.test(text)) {
      const line = text.split(/\r?\n/).findIndex((l) => RETIRED.test(l)) + 1;
      offenders.push(`${rel}  (first hit on line ${line})`);
    }
  }
}
scan(ROOT);
console.log(`OFFENDERS=${offenders.length}`);
offenders.forEach((o) => console.log("  " + o));
