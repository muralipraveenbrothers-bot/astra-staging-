// READ-ONLY audit scanner for Astra cleanup. No deletes, no moves, no writes
// outside _audit/. Bounded: skips heavy trees, caps file size + hits.
import fs from "node:fs";
import path from "node:path";

const ROOT = "D:/astra PM";
// Bounded: only the trees that can carry cross-service references.
// Heavy vendored trees are audited separately, never by full-text scan.
const SCAN_ROOTS = ["server", "src", "config", "scripts", "integrations"];
const SKIP_DIRS = new Set([
  "node_modules", ".git", "venv", ".venv", "__pycache__", "dist", "build",
  ".next", "coverage", ".turbo", ".vscode", "recycle", "Recycle.Bin",
]);
const SKIP_FILES = new Set(["package-lock.json"]);
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_HITS_PER_KEY = 60;

const GROUPS = {
  freellmapi_copy: ["modules/freellmapi"],
  agentzero: ["modules/agentzero"],
  litellm: ["modules/litellm"],
  routellm: ["modules/RouteLLM"],
  openhands: ["modules/OpenHands"],
  omniroute: ["modules/omniroute"],
  freellmapi_repo: ["freellmapi/"],
  voice_stack: ["voicebox", "voiceEngine", "geminiLiveVoice", "browserVoice", "a2f", "astra_voice_core", "ttsRouter", "voiceProviderRoutes"],
  jarvis_saarathi: ["jarvis_assistant", "Jarvius", "saarathi"],
  second_brain: ["secondary_brain", "secondary-brain", "personal_brain", "guardian_layer", "mode_router"],
  old_ports: ["127.0.0.1:3001", "localhost:3001", ":3001/v1", "127.0.0.1:5170", "localhost:5170"],
  avatar_voice: ["linly-talker", "ChatTTS", "CosyVoice", "live-avatar", "OpenAvatarChat"],
  tmp_scripts: [],
};

const hits = {};
for (const k of Object.keys(GROUPS)) hits[k] = [];
const counts = {};
for (const k of Object.keys(GROUPS)) counts[k] = 0;

function walk(dir, depth) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      if (depth < 8) walk(full, depth + 1);
      continue;
    }
    if (SKIP_FILES.has(e.name)) continue;
    if (!/\.(ts|tsx|js|mjs|cjs|py|json|cmd|ps1|bat|yml|yaml|toml|env|ini|cfg|md|txt)$/i.test(e.name)) continue;
    let st;
    try { st = fs.statSync(full); } catch { continue; }
    if (st.size > MAX_FILE_BYTES) continue;
    let text;
    try { text = fs.readFileSync(full, "utf8"); } catch { continue; }
    const rel = path.relative(ROOT, full).replace(/\\/g, "/");
    for (const [key, needles] of Object.entries(GROUPS)) {
      if (hits[key].length >= MAX_HITS_PER_KEY) continue;
      for (const n of needles) {
        if (n && text.includes(n)) {
          const idx = text.indexOf(n);
          const line = text.slice(0, idx).split("\n").length;
          hits[key].push(`${rel}:${line}: ...${text.slice(Math.max(0, idx - 60), idx + 80).replace(/\s+/g, " ")}...`);
          counts[key]++;
          break;
        }
      }
    }
  }
}
for (const r of SCAN_ROOTS) {
  try {
    if (fs.statSync(path.join(ROOT, r)).isDirectory()) walk(path.join(ROOT, r), 0);
  } catch {}
}

// tmp/probe/verify/do/test scratch files (top level + scripts), names only
const tmpFiles = [];
for (const d of [ROOT, path.join(ROOT, "scripts")]) {
  let entries;
  try { entries = fs.readdirSync(d); } catch { continue; }
  for (const f of entries) {
    if (/(_tmp\.py$|^probe_.*\.py$|^verify_.*\.py$|^do_.*\.py$|^test_.*\.(ts|py)$|\.tmp$|\.log$)/.test(f)) {
      try {
        const st = fs.statSync(path.join(d, f));
        if (!st.isDirectory()) tmpFiles.push(`${path.relative(ROOT, path.join(d, f))} (${st.size}B)`);
      } catch {}
    }
  }
}

// top-level candidate dirs with mtime
const candDirs = ["freellmapi", "modules", "integrations", "OpenAvatarChat", "external", "vendor", "server", "src", "config", "scripts", "data", "knowledge-data", "backups", "_quarantine", "logs", "dist", "public"];
const dirInfo = [];
for (const d of candDirs) {
  const full = path.join(ROOT, d);
  try {
    const st = fs.statSync(full);
    if (st.isDirectory()) dirInfo.push(`${d}/ mtime=${st.mtime.toISOString().slice(0, 10)}`);
  } catch {}
}

console.log(JSON.stringify({ counts, dirInfo, tmpFiles: tmpFiles.slice(0, 120), tmpTotal: tmpFiles.length, hits }, null, 1));
