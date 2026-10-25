import crypto from "crypto";
import fs from "fs";
import path from "path";
import { appendHashLog } from "./hashLog";
import { ensureIdentityFiles, knowledgeRoot } from "./memoryPolicy";

const ALLOWED = new Set([".md", ".txt", ".pdf", ".docx"]);
const MAX_BYTES = 20 * 1024 * 1024;

export type VaultCategory = "clinical" | "hospital-policy" | "equipment" | "legal" | "templates";

export interface VaultMeta {
  title: string;
  source: string;
  publisher?: string;
  date?: string;
  versionLabel?: string;
  owner?: string;
  category?: VaultCategory;
}

export interface ApprovalRecord {
  approver: string;
  role: string;
  at: string;
  /** sha256 of the bytes being approved */
  contentHash: string;
}

export interface IngestResult {
  id: string;
  status: "quarantine" | "duplicate" | "candidate" | "raw";
  hash: string;
  skipped?: boolean;
  location: string;
}

interface RecordRow {
  id: string;
  hash: string;
  name: string;
  status: IngestResult["status"] | "validated";
  category?: VaultCategory;
  version: number;
  meta: VaultMeta;
  approval?: ApprovalRecord;
}

export type PublishHook = (doc: { id: string; version: number; category: VaultCategory; hash: string }) => void;

/** Seam for an existing RAG index. Validated text is not rewritten here. */
let onPublishHook: PublishHook | null = null;
export function setKnowledgePublishHook(hook: PublishHook | null): void {
  onPublishHook = hook;
}

function magicOk(ext: string, bytes: Buffer): boolean {
  if (ext === ".pdf") return bytes.subarray(0, 5).toString("utf8").startsWith("%PDF-");
  if (ext === ".docx") return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (ext === ".md" || ext === ".txt") {
    if (bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a) return false;
    const head = bytes.subarray(0, Math.min(bytes.length, 512));
    return !head.includes(0);
  }
  return false;
}

export class KnowledgeVault {
  readonly root: string;

  constructor(root = knowledgeRoot()) {
    this.root = root;
    for (const dir of ["raw", "quarantine", "candidates", "validated/clinical", "validated/hospital-policy", "validated/equipment", "validated/legal", "validated/templates", "sources", "audit"]) {
      fs.mkdirSync(path.join(this.root, dir), { recursive: true });
    }
    ensureIdentityFiles(this.root);
  }

  private recordsFile(): string {
    return path.join(this.root, "records.json");
  }

  private readRecords(): RecordRow[] {
    const file = this.recordsFile();
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, "utf8")) as RecordRow[];
  }

  private writeRecords(rows: RecordRow[]): void {
    fs.writeFileSync(this.recordsFile(), JSON.stringify(rows, null, 2), "utf8");
  }

  ingest(name: string, bytes: Buffer, meta: VaultMeta, actor: { agent?: string; role?: string } = {}): IngestResult {
    const ext = path.extname(name).toLowerCase();
    const id = crypto.randomUUID();
    const hash = crypto.createHash("sha256").update(bytes).digest("hex");
    if (!ALLOWED.has(ext) || bytes.length > MAX_BYTES || !magicOk(ext, bytes)) {
      const location = path.join(this.root, "quarantine", `${id}${ext || ".bin"}`);
      fs.writeFileSync(location, bytes);
      this.writeRecords([...this.readRecords(), { id, hash, name, status: "quarantine", version: 0, meta }]);
      return { id, status: "quarantine", hash, location };
    }
    if (this.readRecords().some((row) => row.hash === hash && row.status !== "quarantine")) {
      return { id, status: "duplicate", hash, skipped: true, location: "" };
    }
    const agent = actor.agent;
    const rel = agent ? path.join("candidates", `${id}${ext}`) : path.join("raw", `${id}${ext}`);
    const location = path.join(this.root, rel);
    fs.writeFileSync(location, bytes);
    const status = agent ? "candidate" : "raw";
    this.writeRecords([...this.readRecords(), { id, hash, name, status, version: agent ? 1 : 0, category: meta.category, meta }]);
    if (!agent) {
      const candidate = path.join(this.root, "candidates", `${id}.json`);
      fs.writeFileSync(candidate, JSON.stringify({ id, hash, meta, categoryStatus: "SHADOW", confirmed: false }, null, 2), "utf8");
    }
    return { id, status, hash, location };
  }

  /** Nightly work may only create candidates. It never rewrites validated knowledge. */
  nightlyCandidate(meta: VaultMeta, text: string): IngestResult {
    return this.ingest(`${meta.title || "nightly"}.md`, Buffer.from(text, "utf8"), meta, { agent: "hermes" });
  }

  list(status?: RecordRow["status"]): RecordRow[] {
    const rows = this.readRecords();
    return status ? rows.filter((row) => row.status === status) : rows;
  }

  validate(id: string, actor: { role: string; approver: string }, category: VaultCategory): RecordRow {
    const rows = this.readRecords();
    const row = rows.find((item) => item.id === id);
    if (!row) throw new Error("unknown vault item");
    if (category === "clinical" && actor.role !== "doctor") throw new Error("clinical validation requires a doctor");
    if (actor.role !== "doctor" && actor.role !== "admin") throw new Error("validation requires admin or doctor");
    row.category = category;
    row.status = "candidate";
    row.approval = { approver: actor.approver, role: actor.role, at: new Date().toISOString(), contentHash: row.hash };
    appendHashLog(path.join(this.root, "audit"), { kind: "vault.validate", id, role: actor.role, contentHash: row.hash });
    this.writeRecords(rows);
    return row;
  }

  publish(id: string, approval: ApprovalRecord | undefined): { version: number; file: string } {
    if (!approval?.approver || !approval.contentHash) throw new Error("publish requires an approval record");
    const rows = this.readRecords();
    const row = rows.find((item) => item.id === id);
    if (!row) throw new Error("unknown vault item");
    if (approval.contentHash !== row.hash) throw new Error("approval hash does not match content");
    if (row.category === "clinical" && approval.role !== "doctor") throw new Error("clinical publish requires a doctor");
    const category = row.category ?? "templates";
    const version = (row.version || 0) + 1;
    const dir = path.join(this.root, "validated", category, id);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `v${version}.md`);
    const prior = version > 1 ? path.join(dir, `v${version - 1}.md`) : "";
    if (prior && !fs.existsSync(prior)) {
      // keep the contract even if a caller publishes v2 after an in-memory v1 marker
    }
    fs.writeFileSync(file, `# ${row.meta.title}\n\n`, "utf8");
    row.version = version;
    row.status = "validated";
    row.approval = approval;
    appendHashLog(path.join(this.root, "audit"), { kind: "vault.publish", id, version, contentHash: row.hash, role: approval.role });
    this.writeRecords(rows);
    onPublishHook?.({ id, version, category, hash: row.hash });
    return { version, file };
  }
}
