/**
 * ASTRA AI - book-to-skill worker (KNOWLEDGE plugin, additive layer).
 *
 * Wraps the private book-to-skill Python extractor (deterministic text +
 * metadata) and drives skill generation through the Central AI Adapter
 * (centralAiChat) following the upstream SKILL.md generator contract
 * (Steps 0-9.5 + Update/Fold-in + Quality Rules).
 *
 * Boundaries:
 *  - No core ASTRA changes: this module only spawns the venv python and
 *    calls the central adapter. It never touches DB schemas, RBAC, or
 *    hospital mutation paths.
 *  - Extraction is deterministic (upstream extract.py). Only the
 *    structuring/generation step uses the LLM; quality rules force
 *    synthesis-from-source, never raw-text copying.
 *  - Writes are confined to the configured skills roots
 *    ($HERMES_HOME/skills | ~/.agents/skills | project-local opt-in).
 *  - Step 9.5 security scan (upstream tools/scan_generated_skill.py)
 *    runs before any skill is reported as ready.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { centralAiChat, chatText } from "./centralCore";
import type { AdapterAgent } from "./centralCore";

export type BtsMode = "text" | "technical";
export type BtsDepth = "reference" | "study";

export interface BtsConfig {
  root: string;
  python: string;
  extractPy: string;
  scannerPy: string;
  validatorPy: string;
  hermesSkillsRoot: string | null;
  crossAgentRoot: string;
  primaryRoot: string;
  maxChapters: number;
  maxInputTokens: number;
  generatorAgent: AdapterAgent;
}

export interface BtsSourceSummary {
  filename: string;
  format: string;
  extraction_method: string;
  pages: unknown;
  words: number;
  estimated_tokens: number;
  chapters_detected: number;
  chapters_method: string;
  has_toc: boolean;
  images_dropped: number;
}

export interface BtsMetadata {
  workdir: string;
  output_text: string;
  filename?: string;
  total_sources: number;
  total_words: number;
  total_tokens: number;
  chapters_detected: number;
  chapters_method: string;
  has_toc: boolean;
  chapter_headings_sample?: string[];
  sources: BtsSourceSummary[];
}

export interface BtsExtractResult {
  ok: boolean;
  workdir: string;
  textPath: string;
  metaPath: string;
  metadata: BtsMetadata;
  stdout: string;
  stderr: string;
}

const WIN = process.platform === "win32";

function repoRoot(): string {
  return path.resolve(process.cwd());
}

export function resolveBtsConfig(): BtsConfig {
  const root =
    process.env.BOOK_TO_SKILL_ROOT?.trim() ||
    path.join(repoRoot(), "get-repo", "book-to-skill");
  const venvBin = WIN
    ? path.join(root, ".venv", "Scripts", "python.exe")
    : path.join(root, ".venv", "bin", "python");
  const python = process.env.BOOK_TO_SKILL_PYTHON?.trim() || venvBin;
  const hermesHome = (
    process.env.HERMES_HOME ??
    process.env.HERMES_DIR ??
    ""
  ).trim();
  const hermesSkillsRoot = hermesHome ? path.join(hermesHome, "skills") : null;
  const crossAgentRoot =
    process.env.BOOK_TO_SKILL_CROSS_AGENT_ROOT?.trim() ||
    path.join(os.homedir(), ".agents", "skills");
  const fallbackPrimary =
    hermesSkillsRoot && fs.existsSync(hermesSkillsRoot)
      ? hermesSkillsRoot
      : crossAgentRoot;
  const primaryRoot =
    process.env.BOOK_TO_SKILL_OUTPUT_DIR?.trim() || fallbackPrimary;
  return {
    root,
    python,
    extractPy: path.join(root, "scripts", "extract.py"),
    scannerPy: path.join(root, "tools", "scan_generated_skill.py"),
    validatorPy: path.join(root, "tools", "validate_skill.py"),
    hermesSkillsRoot,
    crossAgentRoot,
    primaryRoot,
    maxChapters: Number(process.env.BOOK_TO_SKILL_MAX_CHAPTERS ?? 12) || 12,
    maxInputTokens:
      Number(process.env.BOOK_TO_SKILL_MAX_INPUT_TOKENS ?? 250_000) ||
      250_000,
    generatorAgent: "astra",
  };
}

/** Run a python script with the private venv, capturing stdout/stderr. */
export function runVenvPython(
  pythonBin: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(pythonBin, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env ?? {}) },
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    const timer =
      opts.timeoutMs && opts.timeoutMs > 0
        ? setTimeout(() => {
            try {
              child.kill();
            } catch {
              /* ignore */
            }
            resolve({
              exitCode: 124,
              stdout,
              stderr: stderr + "\n[TIMEOUT] venv python run exceeded timeout",
            });
          }, opts.timeoutMs)
        : null;
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      resolve({ exitCode: 127, stdout, stderr: stderr + String(err) });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

function readJsonFile<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
}
/**
 * SKILL.md Step 2 - deterministic extraction through scripts/extract.py.
 * Each run gets its own BOOK_SKILL_WORKDIR so concurrent runs never
 * collide (upstream default is already per-PID; this makes it per-run).
 */
export async function extractDocument(
  inputs: string[],
  mode: BtsMode = "text",
  opts: { timeoutMs?: number } = {},
): Promise<BtsExtractResult> {
  const cfg = resolveBtsConfig();
  const clean = inputs.map((s) => String(s ?? "").trim()).filter(Boolean);
  if (!clean.length) throw new Error("extractDocument: no input paths given");
  for (const p of clean) {
    if (!fs.existsSync(p)) {
      throw new Error(`extractDocument: input not found: ${p}`);
    }
  }
  if (!fs.existsSync(cfg.python)) {
    throw new Error(
      `extractDocument: venv python missing at ${cfg.python} (set BOOK_TO_SKILL_PYTHON or install get-repo/book-to-skill/.venv)`,
    );
  }
  if (!fs.existsSync(cfg.extractPy)) {
    throw new Error(`extractDocument: extractor missing at ${cfg.extractPy}`);
  }
  const runId = `bts-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const workdir = path.join(os.tmpdir(), runId);
  fs.mkdirSync(workdir, { recursive: true });
  const run = await runVenvPython(
    cfg.python,
    [cfg.extractPy, ...clean, "--mode", mode, "--install-missing", "no"],
    { env: { BOOK_SKILL_WORKDIR: workdir }, timeoutMs: opts.timeoutMs ?? 600_000 },
  );
  const textPath = path.join(workdir, "full_text.txt");
  const metaPath = path.join(workdir, "metadata.json");
  if (run.exitCode !== 0 || !fs.existsSync(metaPath)) {
    throw new Error(
      `extractDocument: extractor failed (exit ${run.exitCode}): ${(run.stderr || run.stdout).slice(-2000)}`,
    );
  }
  const metadata = readJsonFile<BtsMetadata>(metaPath);
  metadata.workdir = metadata.workdir || workdir;
  metadata.output_text = metadata.output_text || textPath;
  return {
    ok: true,
    workdir: metadata.workdir,
    textPath: metadata.output_text,
    metaPath,
    metadata,
    stdout: run.stdout,
    stderr: run.stderr,
  };
}

/** SKILL.md Step 2.5 pre-flight - deterministic cost envelope from metadata. */
export function preflightEstimate(metadata: BtsMetadata, depth: BtsDepth) {
  const perChapter = depth === "study" ? [1000, 3000] : [800, 1800];
  const chapters = Math.max(1, metadata.chapters_detected || 1);
  return {
    inputTokens: metadata.total_tokens,
    chapters,
    estChapterTokens: [chapters * perChapter[0], chapters * perChapter[1]],
    estSkillTokens: chapters * perChapter[1] + 4000 + 2500 + 1500 + 1500,
    depth,
  };
}
// Generation (SKILL.md Steps 3-9): structure -> chapters -> support
// files -> SKILL.md assembly. All LLM calls go through the adapter.

export interface ChapterPlanItem {
  number: number;
  title: string;
  focus: string;
}

export interface SkillPlan {
  skillName: string;
  title: string;
  author: string;
  bookType: "text" | "technical";
  bookKind: string;
  purpose: "reference" | "study";
  coreFrameworks: string[];
  chapters: ChapterPlanItem[];
}

const QUALITY_RULES = [
  "Extract structure, not summaries - named frameworks and exact formulations.",
  "Preserve the author's precision - keep exact naming, never generic paraphrase.",
  "Density over completeness - tight, practitioner-dense summaries.",
  "Practitioner voice - write 'Use X when Y', not 'The book explains X'.",
  "Never copy raw source text - synthesize and extract signal (fair-use).",
].join("\n");

function slugify(s: string): string {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 48);
}

export function skillNameFromTitle(title: string, fallback: string): string {
  const stop = new Set(["the", "a", "an", "of", "and", "for", "to", "in", "on", "with"]);
  const words = String(title || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/).filter((w) => w && !stop.has(w)).slice(0, 3);
  const base = slugify(words.join("-") || fallback);
  return base || slugify(fallback) || "book-skill";
}

function readTextSlice(textPath: string, start: number, length: number): string {
  const buf = fs.readFileSync(textPath);
  const end = Math.min(buf.length, start + length);
  let cut = end;
  if (end < buf.length) {
    const nl = buf.lastIndexOf(10, end);
    if (nl > start) cut = nl;
  }
  return buf.subarray(start, cut).toString("utf-8");
}

function findHeadingOffsets(text: string): number[] {
  const offsets: number[] = [0];
  const re = /^(?:#{1,4}\s*)?(?:chapter|part|section|module|unit|lesson)\s+\d+[^\n]*$/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > 4096) offsets.push(m.index);
  }
  return offsets;
}
async function adapterGenerate(
  system: string,
  user: string,
  maxTokens: number,
  cfg: BtsConfig,
): Promise<string> {
  const res = await centralAiChat({
    agent: cfg.generatorAgent,
    clinical: true,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: maxTokens,
    temperature: 0.2,
  });
  const text = chatText(res).trim();
  if (!text) throw new Error("bookToSkill: adapter returned empty content");
  return text;
}

function parsePlanJson(raw: string, fallbackName: string): SkillPlan {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fence ? fence[1] : raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("plan JSON not found");
  const obj = JSON.parse(candidate.slice(start, end + 1)) as Partial<SkillPlan>;
  const chapters = Array.isArray(obj.chapters) ? obj.chapters : [];
  return {
    skillName: slugify(String(obj.skillName || fallbackName)) || fallbackName,
    title: String(obj.title || "Untitled"),
    author: String(obj.author || "Unknown"),
    bookType: obj.bookType === "technical" ? "technical" : "text",
    bookKind: String(obj.bookKind || "general nonfiction"),
    purpose: obj.purpose === "study" ? "study" : "reference",
    coreFrameworks: Array.isArray(obj.coreFrameworks)
      ? obj.coreFrameworks.map(String).slice(0, 12) : [],
    chapters: chapters.slice(0, 64).map((c, i) => ({
      number: Number((c as ChapterPlanItem)?.number ?? i + 1) || i + 1,
      title: String((c as ChapterPlanItem)?.title || `Section ${i + 1}`),
      focus: String((c as ChapterPlanItem)?.focus || ""),
    })),
  };
}
/** SKILL.md Steps 3-5 - structure analysis + skill naming. No files written. */
export async function analyzeStructure(
  extraction: BtsExtractResult,
  opts: { depth?: BtsDepth; skillName?: string } = {},
): Promise<{ plan: SkillPlan; estimate: ReturnType<typeof preflightEstimate> }> {
  const cfg = resolveBtsConfig();
  const md = extraction.metadata;
  const depth = opts.depth ?? "reference";
  const fallbackName = skillNameFromTitle(
    md.filename ?? "book", `book-${Date.now().toString(36)}`);
  const head = readTextSlice(extraction.textPath, 0, 24_000);
  const system = "You structure documents into agent-skill plans. Reply with " +
    "a single JSON object only, no prose. Quality rules:\n" + QUALITY_RULES;
  const user =
    `Plan an agent skill for the document described below.\n\n` +
    `Depth: ${depth}.\n` +
    `Detected chapters: ${md.chapters_detected} (${md.chapters_method}); ` +
    `ToC: ${md.has_toc ? "yes" : "no"}.\n` +
    `Total words: ${md.total_words}; est. tokens: ${md.total_tokens}.\n` +
    `Heading sample: ${(md.chapter_headings_sample ?? []).slice(0, 20).join(" | ") || "(none)"}.\n` +
    `Sources: ${md.sources.map((s) => `${s.filename} [${s.format}, ${s.words} words]`).join("; ")}.\n\n` +
    `Head of extracted text:\n-----\n${head}\n-----\n\n` +
    `Return JSON: {"skillName": "kebab-case, <=3 words", "title": "full title", ` +
    `"author": "author or Unknown", "bookType": "text|technical", ` +
    `"bookKind": "short kind label", "purpose": "reference|study", ` +
    `"coreFrameworks": ["up to 8 named frameworks"], ` +
    `"chapters": [{"number": 1, "title": "...", "focus": "what to extract"}]}. ` +
    `Keep chapters to the real top-level sections (merge sub-sections).`;
  const raw = await adapterGenerate(system, user, 2000, cfg);
  const plan = parsePlanJson(raw, opts.skillName ?? fallbackName);
  if (opts.skillName) plan.skillName = slugify(opts.skillName) || plan.skillName;
  if (depth === "study") plan.purpose = "study";
  return { plan, estimate: preflightEstimate(md, plan.purpose) };
}

function chapterBudgetTokens(bookType: "text" | "technical", depth: BtsDepth) {
  if (depth === "study") return bookType === "technical" ? 3000 : 1800;
  return bookType === "technical" ? 1800 : 1200;
}
/** SKILL.md Step 7 - one chapter file per plan item, sliced by headings. */
export async function generateChapterFiles(
  extraction: BtsExtractResult,
  plan: SkillPlan,
  skillDir: string,
  opts: { depth?: BtsDepth; onProgress?: (done: number, total: number) => void } = {},
): Promise<string[]> {
  const cfg = resolveBtsConfig();
  const depth = opts.depth ?? plan.purpose;
  const budget = chapterBudgetTokens(plan.bookType, depth);
  const chaptersDir = path.join(skillDir, "chapters");
  fs.mkdirSync(chaptersDir, { recursive: true });
  const full = fs.readFileSync(extraction.textPath, "utf-8");
  const offsets = findHeadingOffsets(full);
  const span = Math.max(12_000, Math.floor(full.length / Math.max(1, plan.chapters.length)));
  const items = plan.chapters.slice(0, cfg.maxChapters);
  const files: string[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const start = offsets[Math.min(i, offsets.length - 1)] ?? 0;
    const excerpt = full.slice(start, start + span * 2).slice(0, 28_000);
    const system =
      `You write one chapter file for an on-demand agent skill. Practitioner ` +
      `voice, dense, no raw-text copying. Quality rules:\n${QUALITY_RULES}\n` +
      `Markdown only - start with "# Ch${item.number}: ${item.title}" and keep ` +
      `it under ~${budget} tokens. End with a 3-6 bullet "Key takeaways" list.`;
    const user =
      `Book: ${plan.title} - ${plan.author} (${plan.bookKind}, ${plan.bookType}).\n` +
      `Chapter ${item.number}: ${item.title}. Focus: ${item.focus || "core frameworks and actionable detail"}.\n\n` +
      `Source excerpt (synthesise from this; do not paste it):\n-----\n${excerpt}\n-----`;
    const md = await adapterGenerate(system, user, budget + 600, cfg);
    const fname = `ch${String(item.number).padStart(2, "0")}-${slugify(item.title) || `section-${item.number}`}.md`;
    fs.writeFileSync(path.join(chaptersDir, fname), md.trim() + "\n", "utf-8");
    files.push(fname);
    opts.onProgress?.(i + 1, items.length);
  }
  return files;
}
/** SKILL.md Step 8 - glossary / patterns / cheatsheet from chapter files. */
export async function generateSupportFiles(
  plan: SkillPlan,
  skillDir: string,
): Promise<string[]> {
  const cfg = resolveBtsConfig();
  const chaptersDir = path.join(skillDir, "chapters");
  const files = fs.readdirSync(chaptersDir).filter((f) => f.endsWith(".md")).sort();
  const condensed = files.map((f) => {
    const t = fs.readFileSync(path.join(chaptersDir, f), "utf-8");
    return `--- ${f} ---\n${t.slice(0, 4000)}`;
  }).join("\n\n").slice(0, 40_000);
  const system = "You write agent-skill support files. Dense practitioner " +
    "markdown only, no raw-text copying. Quality rules:\n" + QUALITY_RULES;
  const specs = [
    { file: "glossary.md", max: 1500,
      brief: "Alphabetical glossary: **Term** - one-line precise definition (Ch N). Only terms the source defines or uses distinctively." },
    { file: "patterns.md", max: 2600,
      brief: "Reusable techniques/patterns: each with name, when-to-use, steps, anti-pattern. Under ~2500 tokens." },
    { file: "cheatsheet.md", max: 1500,
      brief: "One-page quick reference: comparison rules, decision tables, key numbers. Terse bullets and tables." },
  ];
  const out: string[] = [];
  for (const spec of specs) {
    const md = await adapterGenerate(system,
      `Book: ${plan.title} - ${plan.author}.\nTask: write ${spec.file}.\nSpec: ${spec.brief}\n\nChapter material:\n-----\n${condensed}\n-----`,
      spec.max + 400, cfg);
    const title = `# ${plan.title} - ${spec.file.replace(".md", "")}\n\n`;
    fs.writeFileSync(path.join(skillDir, spec.file), title + md.trim() + "\n", "utf-8");
    out.push(spec.file);
  }
  return out;
}
/** SKILL.md Step 9 - assemble the master SKILL.md (front-loaded index). */
export function assembleSkillMd(
  plan: SkillPlan,
  chapterFiles: string[],
  opts: { generatedDate?: string } = {},
): string {
  const date = opts.generatedDate ?? new Date().toISOString().slice(0, 10);
  const rows = chapterFiles.map((f, i) => {
    const item = plan.chapters[i];
    const n = String(item?.number ?? i + 1).padStart(2, "0");
    return `| ch${n} | ${item?.title ?? f} | [${f}](chapters/${f}) |`;
  }).join("\n");
  const topics = plan.chapters.map((c, i) =>
    `- **${c.title}** -> chapters/${chapterFiles[i] ?? ""}`).join("\n");
  const frameworks = plan.coreFrameworks.map((f) => `- ${f}`).join("\n") || "- (see chapters)";
  const desc = plan.coreFrameworks.slice(0, 3).join("; ") || "Chapter-indexed reference";
  return `---\nname: ${plan.skillName}\ndescription: "Practitioner skill distilled from *${plan.title}* by ${plan.author} (${plan.bookKind}). ${desc}."\n---\n\n# ${plan.title} - Agent Skill\n\nDistilled from *${plan.title}* by ${plan.author}. Use this skill when the task touches ${plan.bookKind}: load these frameworks first, then dive into the linked chapter file for detail.\n\n*Generated ${date} - synthesised summaries for agent use, not the source text. Consult the original source before acting on critical detail.*\n\n## Core frameworks\n\n${frameworks}\n\n## How to use this skill\n\n- Ask for ${plan.skillName} -> load these core frameworks.\n- Ask ${plan.skillName} about <topic> -> check the topic index, then read that chapter file.\n- Ask ${plan.skillName} for ch<N> -> dive into a specific chapter.\n\n## Chapter index\n\n| Ch | Title | File |\n|----|-------|------|\n${rows}\n\n## Topic index\n\n${topics}\n\n## Support files\n\n- [glossary.md](glossary.md) - key terms with chapter references.\n- [patterns.md](patterns.md) - reusable techniques and anti-patterns.\n- [cheatsheet.md](cheatsheet.md) - one-page quick reference.\n`;
}

/** Upstream Step 9.5 - advisory security scan of the generated skill. */
export async function scanGeneratedSkill(skillDir: string) {
  const cfg = resolveBtsConfig();
  if (!fs.existsSync(cfg.scannerPy)) return { ok: true, output: "scanner not present - skipped" };
  const run = await runVenvPython(cfg.python, [cfg.scannerPy, skillDir], { timeoutMs: 120_000 });
  return { ok: run.exitCode === 0, output: `${run.stdout}\n${run.stderr}`.trim().slice(-4000) };
}

/** Upstream structural validator for the generated skill. */
export async function validateGeneratedSkill(skillDir: string) {
  const cfg = resolveBtsConfig();
  if (!fs.existsSync(cfg.validatorPy)) return { ok: true, output: "validator not present - skipped" };
  // validate_skill.py takes the SKILL.md path (not the dir) plus a host lens.
  const skillMd = path.join(skillDir, "SKILL.md");
  const run = await runVenvPython(cfg.python, [cfg.validatorPy, "--lens", "hermes", skillMd], { timeoutMs: 120_000 });
  return { ok: run.exitCode === 0, output: `${run.stdout}\n${run.stderr}`.trim().slice(-4000) };
}
export interface GenerateOptions {
  depth?: BtsDepth;
  skillName?: string;
  mirrorRoots?: string[];
  skipScan?: boolean;
  onProgress?: (stage: string, done: number, total: number) => void;
}

export interface GenerateResult {
  ok: boolean;
  skillName: string;
  skillDir: string;
  mirroredTo: string[];
  plan: SkillPlan;
  estimate: ReturnType<typeof preflightEstimate>;
  chapterFiles: string[];
  supportFiles: string[];
  scan: { ok: boolean; output: string };
  validation: { ok: boolean; output: string };
  workdir: string;
  report: string;
}

function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

/** Full conversion (SKILL.md Modes 1/3): structure -> files -> scan -> publish. */
export async function generateSkill(
  extraction: BtsExtractResult,
  opts: GenerateOptions = {},
): Promise<GenerateResult> {
  const cfg = resolveBtsConfig();
  const depth = opts.depth ?? "reference";
  const { plan, estimate } = await analyzeStructure(extraction, {
    depth, skillName: opts.skillName,
  });
  if (extraction.metadata.total_tokens > cfg.maxInputTokens) {
    throw new Error(`bookToSkill: input ~${extraction.metadata.total_tokens} tokens exceeds BOOK_TO_SKILL_MAX_INPUT_TOKENS=${cfg.maxInputTokens}`);
  }
  const staging = path.join(os.tmpdir(), `bts-skill-${plan.skillName}-${Date.now().toString(36)}`);
  fs.mkdirSync(path.join(staging, "chapters"), { recursive: true });
  opts.onProgress?.("chapters", 0, plan.chapters.length);
  const chapterFiles = await generateChapterFiles(extraction, plan, staging, {
    depth: plan.purpose,
    onProgress: (d, t) => opts.onProgress?.("chapters", d, t),
  });
  opts.onProgress?.("support", 0, 3);
  const supportFiles = await generateSupportFiles(plan, staging);
  opts.onProgress?.("support", 3, 3);
  fs.writeFileSync(path.join(staging, "SKILL.md"), assembleSkillMd(plan, chapterFiles), "utf-8");
  const scan = opts.skipScan
    ? { ok: true, output: "skipped by caller" }
    : await scanGeneratedSkill(staging);
  if (!scan.ok) {
    throw new Error(`bookToSkill: Step 9.5 security scan flagged ${plan.skillName} - human review required before publish. Findings:\n${scan.output}`);
  }
  const validation = await validateGeneratedSkill(staging);
  const skillDir = path.join(cfg.primaryRoot, plan.skillName);
  fs.mkdirSync(cfg.primaryRoot, { recursive: true });
  if (fs.existsSync(skillDir)) fs.rmSync(skillDir, { recursive: true, force: true });
  copyDir(staging, skillDir);
  const mirroredTo: string[] = [];
  for (const root of opts.mirrorRoots ?? []) {
    const dest = path.join(root, plan.skillName);
    try {
      fs.mkdirSync(root, { recursive: true });
      if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
      copyDir(skillDir, dest);
      mirroredTo.push(dest);
    } catch { /* mirroring is best-effort */ }
  }
  try { fs.rmSync(staging, { recursive: true, force: true }); } catch { /* ignore */ }
  const report =
    `Skill created: ${skillDir}/\n` +
    `Book: ${plan.title} - ${plan.author}\n` +
    `Chapters: ${chapterFiles.length} | Support files: ${supportFiles.join(", ")}\n` +
    `Input: ~${estimate.inputTokens} tokens (${extraction.metadata.total_words} words) -> est. skill ~${estimate.estSkillTokens} tokens (loaded on-demand)\n` +
    `Discoverable by: ASTRA skill roots (${cfg.primaryRoot})` +
    (mirroredTo.length ? `; mirrored to ${mirroredTo.join(", ")}` : "") +
    `\nUsage: ask for ${plan.skillName} -> core frameworks; ask ${plan.skillName} about <topic> -> chapter dive.`;
  return { ok: true, skillName: plan.skillName, skillDir, mirroredTo, plan,
    estimate, chapterFiles, supportFiles, scan, validation,
    workdir: extraction.workdir, report };
}
/** SKILL.md Update/Fold-in (Mode 4): merge a new extraction into a skill. */
export async function foldInExtraction(
  skillDir: string,
  extraction: BtsExtractResult,
  opts: { depth?: BtsDepth; skipScan?: boolean } = {},
): Promise<GenerateResult> {
  const cfg = resolveBtsConfig();
  if (!fs.existsSync(path.join(skillDir, "SKILL.md"))) {
    throw new Error(`foldIn: not a skill directory: ${skillDir}`);
  }
  const chaptersDir = path.join(skillDir, "chapters");
  const existing = fs.existsSync(chaptersDir)
    ? fs.readdirSync(chaptersDir).filter((f) => f.endsWith(".md")).sort() : [];
  let highest = 0;
  for (const f of existing) {
    const m = f.match(/^ch(\d+)/i);
    if (m) highest = Math.max(highest, Number(m[1]));
  }
  const { plan, estimate } = await analyzeStructure(extraction, { depth: opts.depth });
  plan.chapters = plan.chapters.slice(0, cfg.maxChapters)
    .map((c, i) => ({ ...c, number: highest + i + 1 }));
  const master = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf-8");
  const nameMatch = master.match(/^name:\s*(.+)\s*$/m);
  if (nameMatch) plan.skillName = slugify(nameMatch[1]);
  const titleMatch = master.match(/^#\s+(.+?)\s+-\s+Agent Skill\s*$/m);
  if (titleMatch) plan.title = titleMatch[1].trim();
  const staging = path.join(os.tmpdir(), `bts-foldin-${Date.now().toString(36)}`);
  fs.mkdirSync(path.join(staging, "chapters"), { recursive: true });
  await generateChapterFiles(extraction, plan, staging, { depth: plan.purpose });
  const newFiles = fs.readdirSync(path.join(staging, "chapters"))
    .filter((f) => f.endsWith(".md")).sort();
  fs.mkdirSync(chaptersDir, { recursive: true });
  for (const f of newFiles) {
    fs.copyFileSync(path.join(staging, "chapters", f), path.join(chaptersDir, f));
  }
  const mergedSupport: string[] = [];
  for (const file of ["glossary.md", "patterns.md", "cheatsheet.md"]) {
    const existingPath = path.join(skillDir, file);
    const existingText = fs.existsSync(existingPath)
      ? fs.readFileSync(existingPath, "utf-8").slice(0, 12_000) : "(none yet)";
    const newText = newFiles.map((f) =>
      fs.readFileSync(path.join(chaptersDir, f), "utf-8").slice(0, 4000),
    ).join("\n\n").slice(0, 24_000);
    const md = await adapterGenerate(
      "You merge new material into an agent-skill support file. Keep the existing " +
      "format, alphabetise glossary entries, keep patterns.md under ~2500 tokens. " +
      "Markdown only.\n" + QUALITY_RULES,
      `Existing ${file}:\n-----\n${existingText}\n-----\n\nNew chapter material to fold in:\n-----\n${newText}\n-----`,
      2800, cfg);
    fs.writeFileSync(existingPath, md.trim() + "\n", "utf-8");
    mergedSupport.push(file);
  }
  const allChapters = fs.readdirSync(chaptersDir).filter((f) => f.endsWith(".md")).sort();
  const mergedPlan: SkillPlan = {
    ...plan,
    chapters: allChapters.map((f, i) => {
      const m = f.match(/^ch(\d+)-(.+)\.md$/i);
      return { number: m ? Number(m[1]) : i + 1,
        title: m ? m[2].replace(/-/g, " ") : f, focus: "" };
    }),
  };
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), assembleSkillMd(mergedPlan, allChapters), "utf-8");
  const scan = opts.skipScan
    ? { ok: true, output: "skipped by caller" }
    : await scanGeneratedSkill(skillDir);
  if (!scan.ok) {
    throw new Error(`bookToSkill: Step 9.5 scan flagged the folded-in skill - human review required.\n${scan.output}`);
  }
  const validation = await validateGeneratedSkill(skillDir);
  try { fs.rmSync(staging, { recursive: true, force: true }); } catch { /* ignore */ }
  return { ok: true, skillName: plan.skillName, skillDir, mirroredTo: [],
    plan: mergedPlan, estimate, chapterFiles: newFiles, supportFiles: mergedSupport,
    scan, validation, workdir: extraction.workdir,
    report: `Skill updated: ${skillDir}/\nNew chapters: ${newFiles.join(", ")}\n` +
      `Merged: ${mergedSupport.join(", ")}; master SKILL.md regenerated (${allChapters.length} chapters total).` };
}
export interface InstalledSkillInfo {
  name: string;
  root: string;
  dir: string;
  chapters: number;
  hasSkillMd: boolean;
}

/** List skills present in the configured roots (primary + mirrors). */
export function listInstalledSkills(): InstalledSkillInfo[] {
  const cfg = resolveBtsConfig();
  const roots = [cfg.primaryRoot];
  if (cfg.hermesSkillsRoot && cfg.hermesSkillsRoot !== cfg.primaryRoot) {
    roots.push(cfg.hermesSkillsRoot);
  }
  if (cfg.crossAgentRoot !== cfg.primaryRoot && cfg.crossAgentRoot !== cfg.hermesSkillsRoot) {
    roots.push(cfg.crossAgentRoot);
  }
  const out: InstalledSkillInfo[] = [];
  for (const root of roots) {
    if (!root || !fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(root, entry.name);
      const hasSkillMd = fs.existsSync(path.join(dir, "SKILL.md"));
      const chaptersDir = path.join(dir, "chapters");
      const chapters = fs.existsSync(chaptersDir)
        ? fs.readdirSync(chaptersDir).filter((f) => f.endsWith(".md")).length : 0;
      if (hasSkillMd || chapters > 0) out.push({ name: entry.name, root, dir, chapters, hasSkillMd });
    }
  }
  return out;
}

/** Health: venv python + extractor + adapter config presence. */
export async function bookToSkillHealth() {
  const cfg = resolveBtsConfig();
  let check = "extractor files not probed";
  if (fs.existsSync(cfg.python) && fs.existsSync(cfg.extractPy)) {
    try {
      const run = await runVenvPython(cfg.python, [cfg.extractPy, "--check"], { timeoutMs: 120_000 });
      check = `${run.stdout}\n${run.stderr}`.trim().slice(-2000) || "check produced no output";
    } catch (e) {
      check = `check failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return {
    ok: fs.existsSync(cfg.python) && fs.existsSync(cfg.extractPy),
    root: cfg.root,
    python: cfg.python,
    pythonExists: fs.existsSync(cfg.python),
    extractPyExists: fs.existsSync(cfg.extractPy),
    scannerExists: fs.existsSync(cfg.scannerPy),
    primaryRoot: cfg.primaryRoot,
    hermesSkillsRoot: cfg.hermesSkillsRoot,
    crossAgentRoot: cfg.crossAgentRoot,
    check,
  };
}
