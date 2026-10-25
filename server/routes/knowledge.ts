import type { Express, Request, Response } from "express";
import path from "path";
import { authenticate, requireRole } from "../rbac";
import { ensureKnowledgeCategorySchema } from "../knowledge/categorySchema";
import { getEvidenceBadge, listEvidence, saveEvidence, type EvidenceRecord } from "../knowledge/evidence";
import { answerSource, canRead, knowledgeRoot, STORE_NAMES, type StoreId } from "../knowledge/memoryPolicy";
import { mcpRegistry } from "../mcp/mcpRegistry";
import { approveSkill, existingBookSkills, retireSkill, type Skill } from "../knowledge/skills/registry";
import { approveTrainingCandidate, curriculumReport, exportJsonl, submitTrainingCandidate, trainingQueue, type TrainingExample } from "../knowledge/training/candidates";
import { KnowledgeVault, type ApprovalRecord, type VaultCategory } from "../knowledge/vault";

function user(req: Request): { role?: string; userId?: string; name?: string } | undefined {
  return (req as Request & { user?: { role?: string; userId?: string; name?: string } }).user;
}

function vault(): KnowledgeVault {
  return new KnowledgeVault(knowledgeRoot());
}

const readers = ["doctor", "admin"] as const;

export function registerKnowledgeRoutes(app: Express): void {
  ensureKnowledgeCategorySchema();

  // Governed source-selection contract: returns routing metadata only. It
  // never executes an MCP tool or sends patient text to an external source.
  app.post("/api/knowledge/source-policy", authenticate, requireRole([...readers]), (req, res) => {
    const question = String(req.body?.question ?? "").trim();
    if (!question) return res.status(400).json({ ok: false, error: "QUESTION_REQUIRED" });
    const actor = user(req);
    const selection = answerSource(question);
    const reads = selection.stores.map((store) => ({ store, name: STORE_NAMES[store as StoreId], access: canRead(actor?.role ?? "unknown", store as StoreId, /uhid|mrn|patient/i.test(question) ? "PHI" : "GENERAL") }));
    res.json({ ok: true, selection, reads, mcp: mcpRegistry.listAll().map((server) => ({ id: server.id, status: server.status, capabilities: server.capabilities, reachable: server.reachable })), execution: "metadata-only; explicit approval required before any tool call" });
  });

  app.post("/api/knowledge/research-plan", authenticate, requireRole([...readers]), (req, res) => {
    const question = String(req.body?.question ?? "").trim();
    if (!question) return res.status(400).json({ ok: false, error: "QUESTION_REQUIRED" });
    const selection = answerSource(question);
    const literature = /guideline|evidence|trial|study|pubmed|rct|meta-analysis|systematic review/i.test(question);
    res.json({ ok: true, plan: { question, mode: literature ? "DEEP_RESEARCH" : "TARGETED_RETRIEVAL", steps: ["classify question", "select approved internal stores", ...(literature ? ["query governed PubMed/NCBI capability"] : []), "screen source provenance", "rank evidence", "synthesize with uncertainty", "return citations"], internalStores: selection.stores.map((store) => ({ id: store, name: STORE_NAMES[store] })), external: literature ? { capability: "research.pubmed.search", approvalRequired: true, autoExecute: false } : null, safety: "No clinical action is executed; treating clinician reviews the synthesized evidence." } });
  });

  app.get("/api/knowledge/vault", authenticate, requireRole([...readers]), (_req, res) => {
    const items = vault().list().map((row) => ({ id: row.id, status: row.status, category: row.category, version: row.version, title: row.meta.title, hash: row.hash }));
    res.json({ ok: true, items });
  });

  app.post("/api/knowledge/vault/upload", authenticate, requireRole([...readers]), (req, res) => {
    const name = String(req.body?.name ?? "");
    const text = typeof req.body?.text === "string" ? req.body.text : "";
    if (!name || !text) return res.status(400).json({ ok: false, error: "name and text are required" });
    const actor = user(req);
    const result = vault().ingest(name, Buffer.from(text, "utf8"), req.body?.meta ?? { title: name, source: "upload" }, { role: actor?.role, agent: req.body?.agent });
    res.json({ ok: true, result });
  });

  app.post("/api/knowledge/vault/validate", authenticate, requireRole([...readers]), (req, res) => {
    const actor = user(req);
    const category = req.body?.category as VaultCategory;
    if (category === "clinical" && actor?.role !== "doctor") return res.status(403).json({ ok: false, error: "clinical validation requires a doctor" });
    try {
      const row = vault().validate(String(req.body?.id ?? ""), { role: actor?.role ?? "", approver: actor?.userId ?? "unknown" }, category);
      res.json({ ok: true, id: row.id, status: row.status });
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "validate failed" });
    }
  });

  app.post("/api/knowledge/vault/publish", authenticate, requireRole([...readers]), (req, res) => {
    const actor = user(req);
    const approval = req.body?.approval as ApprovalRecord | undefined;
    if (req.body?.category === "clinical" && actor?.role !== "doctor") return res.status(403).json({ ok: false, error: "clinical publish requires a doctor" });
    try {
      const published = vault().publish(String(req.body?.id ?? ""), approval);
      res.json({ ok: true, ...published });
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "publish failed" });
    }
  });

  app.get("/api/knowledge/evidence", authenticate, requireRole([...readers]), (_req, res) => {
    res.json({ ok: true, records: listEvidence().map((record) => ({ id: record.id, tier: record.tier, verified: record.verified, date: record.date })) });
  });

  app.get("/api/knowledge/evidence/:id/badge", authenticate, requireRole([...readers]), (req: Request<{ id: string }>, res: Response) => {
    const badge = getEvidenceBadge(req.params.id);
    if (!badge) return res.status(404).json({ ok: false, error: "not found" });
    res.json({ ok: true, badge });
  });

  app.post("/api/knowledge/evidence", authenticate, requireRole([...readers]), (req, res) => {
    const record = req.body?.record as EvidenceRecord | undefined;
    if (!record?.id) return res.status(400).json({ ok: false, error: "record required" });
    saveEvidence(record);
    res.json({ ok: true, id: record.id });
  });

  app.get("/api/knowledge/skills", authenticate, requireRole([...readers]), (_req, res) => {
    res.json({ ok: true, skills: existingBookSkills(), note: "No existing Book skills were found to wrap." });
  });

  app.post("/api/knowledge/skills/candidate", authenticate, requireRole([...readers]), (req, res) => {
    const skill = req.body?.skill as Skill | undefined;
    if (!skill?.id) return res.status(400).json({ ok: false, error: "skill required" });
    res.json({ ok: true, skill: { ...skill, status: "candidate" } });
  });

  app.post("/api/knowledge/skills/approve", authenticate, requireRole([...readers]), (req, res) => {
    const actor = user(req);
    const skill = req.body?.skill as Skill | undefined;
    if (!skill?.id) return res.status(400).json({ ok: false, error: "skill required" });
    if (skill.domain === "clinical" && actor?.role !== "doctor") return res.status(403).json({ ok: false, error: "clinical skill requires a doctor" });
    try {
      const approved = approveSkill(skill, { role: actor?.role ?? "", id: actor?.userId ?? "unknown" }, path.join(knowledgeRoot(), "skills"));
      res.json({ ok: true, skill: approved });
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "approve failed" });
    }
  });

  app.post("/api/knowledge/skills/retire", authenticate, requireRole([...readers]), (req, res) => {
    const actor = user(req);
    const skill = req.body?.skill as Skill | undefined;
    if (!skill?.id) return res.status(400).json({ ok: false, error: "skill required" });
    if (skill.domain === "clinical" && actor?.role !== "doctor") return res.status(403).json({ ok: false, error: "clinical retire requires a doctor" });
    res.json({ ok: true, skill: retireSkill(skill, { role: actor?.role ?? "" }) });
  });

  app.post("/api/knowledge/training/candidates", authenticate, requireRole([...readers]), (req, res) => {
    const example = req.body?.example as TrainingExample | undefined;
    if (!example?.id) return res.status(400).json({ ok: false, error: "example required" });
    const result = submitTrainingCandidate(example);
    res.status(result.ok ? 200 : 400).json(result);
  });

  app.post("/api/knowledge/training/approve", authenticate, requireRole([...readers]), (req, res) => {
    const actor = user(req);
    if (req.body?.clinical === true && actor?.role !== "doctor") return res.status(403).json({ ok: false, error: "clinical example requires a doctor" });
    const result = approveTrainingCandidate(String(req.body?.id ?? ""), { role: actor?.role ?? "" });
    res.status(result.ok ? 200 : 400).json(result);
  });

  app.post("/api/knowledge/training/export", authenticate, requireRole(["admin"]), (req, res) => {
    const actor = user(req);
    try {
      const exported = exportJsonl({
        family: req.body?.family ?? "terminology",
        split: req.body?.split ?? "train",
        role: actor?.role ?? "",
        rows: trainingQueue().filter((row) => row.approved),
      });
      res.json({ ok: true, count: exported.count });
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : "export failed" });
    }
  });

  app.get("/api/knowledge/training/report", authenticate, requireRole([...readers]), (_req, res) => {
    res.json({ ok: true, groups: curriculumReport(trainingQueue()) });
  });

  app.get("/api/knowledge/review", authenticate, requireRole([...readers]), (_req, res) => {
    const items = [
      ...vault().list("candidate").map((row) => ({ kind: "knowledge", id: row.id, title: row.meta.title, tier: null, provenance: row.meta.source })),
      ...trainingQueue().filter((row) => !row.approved).map((row) => ({ kind: "training", id: row.id, title: row.family, tier: null, provenance: row.department })),
    ];
    res.json({ ok: true, items });
  });

}
