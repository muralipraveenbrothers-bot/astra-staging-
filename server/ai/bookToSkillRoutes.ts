/**
 * ASTRA AI - book-to-skill routes (KNOWLEDGE plugin, additive layer).
 *
 *  GET  /api/book-to-skill/health        extractor preflight + config echo
 *  POST /api/book-to-skill/extract       Step 2: deterministic extraction
 *  POST /api/book-to-skill/analyze       Mode 2: extract + structure plan
 *  POST /api/book-to-skill/generate      Modes 1/3: extract + full skill
 *  POST /api/book-to-skill/fold-in       Mode 4: merge extraction into a skill
 *  GET  /api/book-to-skill/skills        list generated skills in known roots
 *  GET  /api/book-to-skill/extraction/:runId  read back extraction metadata
 *
 * Mounted additively in server/index.ts. Health is public (plugin probe);
 * every conversion route carries `authenticate`.
 */
import type { Express, Request, Response } from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { authenticate } from "../rbac";
import {
  analyzeStructure,
  bookToSkillHealth,
  extractDocument,
  foldInExtraction,
  generateSkill,
  listInstalledSkills,
  preflightEstimate,
  resolveBtsConfig,
  type BtsDepth,
  type BtsExtractResult,
  type BtsMode,
} from "./bookToSkillWorker";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asMode(v: unknown): BtsMode {
  return String(v ?? "text").toLowerCase() === "technical" ? "technical" : "text";
}

function asDepth(v: unknown): BtsDepth {
  return String(v ?? "reference").toLowerCase() === "study" ? "study" : "reference";
}

function fail(res: Response, status: number, code: string, e: unknown) {
  res.status(status).json({ error: code, message: e instanceof Error ? e.message : String(e) });
}

function inputPaths(body: unknown): string[] {
  const b = (body ?? {}) as Record<string, unknown>;
  const inputs = Array.isArray(b.inputs) ? b.inputs.map(str).filter(Boolean) : [];
  const single = str(b.input ?? b.path);
  return single ? [single, ...inputs] : inputs;
}

function uploadedInput(body: unknown): { path: string; cleanup: () => void } | null {
  const b = (body ?? {}) as Record<string, unknown>;
  const filename = path.basename(str(b.filename)).replace(/[^a-zA-Z0-9._-]/g, "-");
  const dataBase64 = str(b.dataBase64).replace(/^data:[^;]+;base64,/, "");
  if (!filename || !dataBase64) return null;
  const allowed = new Set([".pdf", ".epub", ".docx", ".md", ".txt", ".html", ".htm", ".rtf"]);
  const ext = path.extname(filename).toLowerCase();
  if (!allowed.has(ext)) throw new Error(`UNSUPPORTED_UPLOAD: ${ext || "unknown"}`);
  const bytes = Buffer.from(dataBase64, "base64");
  if (!bytes.length || bytes.length > 30 * 1024 * 1024) throw new Error("UPLOAD_SIZE: file must be between 1 byte and 30 MB");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "astra-bts-upload-"));
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, bytes);
  return { path: filePath, cleanup: () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } } };
}

function extractionFromWorkdir(workdir: string): BtsExtractResult {
  const metaPath = path.join(workdir, "metadata.json");
  const textPath = path.join(workdir, "full_text.txt");
  if (!fs.existsSync(metaPath) || !fs.existsSync(textPath)) {
    throw new Error(`extraction not found at workdir: ${workdir}`);
  }
  const metadata = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
  return { ok: true, workdir, textPath: metadata.output_text || textPath,
    metaPath, metadata, stdout: "", stderr: "" };
}
async function extractionForRequest(body: unknown, mode: BtsMode): Promise<BtsExtractResult> {
  const b = (body ?? {}) as Record<string, unknown>;
  const workdir = str(b.workdir);
  if (workdir) return extractionFromWorkdir(workdir);
  const all = inputPaths(body);
  if (!all.length) throw new Error("MISSING_INPUTS: provide inputs[]/input or a prior workdir.");
  return extractDocument(all, mode);
}

export function registerBookToSkillRoutes(app: Express): void {
  app.get("/api/book-to-skill/health", async (_req: Request, res: Response) => {
    try {
      res.json({ plugin: "book-to-skill", ...(await bookToSkillHealth()) });
    } catch (e) {
      fail(res, 500, "BOOKTOSKILL_HEALTH_FAILED", e);
    }
  });

  app.post("/api/book-to-skill/extract", authenticate, async (req: Request, res: Response) => {
    try {
      const r = await extractionForRequest(req.body, asMode((req.body as Record<string, unknown>)?.mode));
      res.json({ ok: r.ok, workdir: r.workdir, textPath: r.textPath,
        metaPath: r.metaPath, metadata: r.metadata,
        estimate_reference: preflightEstimate(r.metadata, "reference") });
    } catch (e) {
      const missing = String(e instanceof Error ? e.message : e).startsWith("MISSING_INPUTS");
      fail(res, missing ? 400 : 500, missing ? "MISSING_INPUTS" : "BOOKTOSKILL_EXTRACT_FAILED", e);
    }
  });

  app.post("/api/book-to-skill/analyze", authenticate, async (req: Request, res: Response) => {
    try {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const extraction = await extractionForRequest(req.body, asMode(b.mode));
      const depth = asDepth(b.depth);
      const { plan, estimate } = await analyzeStructure(extraction, {
        depth, skillName: str(b.skillName) || undefined,
      });
      res.json({ ok: true, workdir: extraction.workdir, plan, estimate, metadata: extraction.metadata });
    } catch (e) {
      const missing = String(e instanceof Error ? e.message : e).startsWith("MISSING_INPUTS");
      fail(res, missing ? 400 : 500, missing ? "MISSING_INPUTS" : "BOOKTOSKILL_ANALYZE_FAILED", e);
    }
  });
  app.post("/api/book-to-skill/generate", authenticate, async (req: Request, res: Response) => {
    try {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const extraction = await extractionForRequest(req.body, asMode(b.mode));
      const cfg = resolveBtsConfig();
      const mirrorRoots = Array.isArray(b.mirrorRoots)
        ? (b.mirrorRoots as unknown[]).map(str).filter(Boolean) : [];
      if (!mirrorRoots.length && cfg.hermesSkillsRoot &&
          cfg.primaryRoot === cfg.hermesSkillsRoot) {
        mirrorRoots.push(cfg.crossAgentRoot);
      }
      const result = await generateSkill(extraction, {
        depth: asDepth(b.depth),
        skillName: str(b.skillName) || undefined,
        mirrorRoots,
        skipScan: b.skipScan === true,
      });
      res.json(result);
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      fail(res, msg.startsWith("MISSING_INPUTS") ? 400 : 500,
        msg.startsWith("MISSING_INPUTS") ? "MISSING_INPUTS" : "BOOKTOSKILL_GENERATE_FAILED", e);
    }
  });

  app.post("/api/book-to-skill/upload-generate", authenticate, async (req: Request, res: Response) => {
    let upload: ReturnType<typeof uploadedInput> = null;
    try {
      upload = uploadedInput(req.body);
      if (!upload) return void fail(res, 400, "MISSING_UPLOAD", "Provide filename and dataBase64.");
      const b = (req.body ?? {}) as Record<string, unknown>;
      const extraction = await extractDocument([upload.path], asMode(b.mode));
      const cfg = resolveBtsConfig();
      const mirrorRoots = cfg.hermesSkillsRoot && cfg.primaryRoot === cfg.hermesSkillsRoot ? [cfg.crossAgentRoot] : [];
      const result = await generateSkill(extraction, {
        depth: asDepth(b.depth), skillName: str(b.skillName) || undefined, mirrorRoots,
      });
      res.json({ ...result, status: "CREATED", uploadedFilename: path.basename(upload.path) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      fail(res, msg.startsWith("UNSUPPORTED_UPLOAD") || msg.startsWith("UPLOAD_SIZE") ? 400 : 500,
        "BOOKTOSKILL_UPLOAD_GENERATE_FAILED", e);
    } finally {
      upload?.cleanup();
    }
  });

  app.post("/api/book-to-skill/fold-in", authenticate, async (req: Request, res: Response) => {
    try {
      const b = (req.body ?? {}) as Record<string, unknown>;
      const skillRef = str(b.skill ?? b.skillDir ?? b.skillName);
      if (!skillRef) {
        res.status(400).json({ error: "MISSING_SKILL", message: "Provide skill (name or directory)." });
        return;
      }
      const cfg = resolveBtsConfig();
      const skillDir = fs.existsSync(skillRef) && fs.statSync(skillRef).isDirectory()
        ? skillRef : path.join(cfg.primaryRoot, skillRef);
      const extraction = await extractionForRequest(req.body, asMode(b.mode));
      const result = await foldInExtraction(skillDir, extraction, {
        depth: asDepth(b.depth),
        skipScan: b.skipScan === true,
      });
      res.json(result);
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e);
      fail(res, msg.startsWith("MISSING_INPUTS") ? 400 : 500,
        msg.startsWith("MISSING_INPUTS") ? "MISSING_INPUTS" : "BOOKTOSKILL_FOLDIN_FAILED", e);
    }
  });
  app.get("/api/book-to-skill/extraction/:runId", authenticate, (req: Request, res: Response) => {
    try {
      const runId = str(req.params.runId).replace(/[^a-zA-Z0-9._-]/g, "");
      const direct = path.join(os.tmpdir(), runId);
      const fromQuery = str(req.query.workdir as string);
      const workdir = fs.existsSync(path.join(direct, "metadata.json")) ? direct : fromQuery;
      if (!workdir) {
        res.status(404).json({ error: "EXTRACTION_NOT_FOUND" });
        return;
      }
      const metadata = extractionFromWorkdir(workdir).metadata;
      res.json({ ok: true, workdir, metadata,
        estimate_reference: preflightEstimate(metadata, "reference") });
    } catch (e) {
      fail(res, 404, "EXTRACTION_NOT_FOUND", e);
    }
  });

  app.get("/api/book-to-skill/skills", authenticate, (_req: Request, res: Response) => {
    try {
      res.json({ ok: true, skills: listInstalledSkills() });
    } catch (e) {
      fail(res, 500, "BOOKTOSKILL_LIST_FAILED", e);
    }
  });
}
