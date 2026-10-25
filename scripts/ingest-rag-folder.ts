import fs from "node:fs";
import path from "node:path";
import { vectorStore } from "../server/rag/vectorStore";

const MAX_BYTES = 200 * 1024;
const ALLOWED = new Set([".md", ".txt"]);

function filesUnder(root: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full));
    else if (ALLOWED.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

function parseDocument(raw: string): { text: string; license?: string; evidenceLevel: "A" | "B" | "C" | "D" | "F" | "unrated" } {
  let text = raw;
  let license: string | undefined;
  let evidenceLevel: "A" | "B" | "C" | "D" | "F" | "unrated" = "unrated";
  if (raw.startsWith("---\n")) {
    const end = raw.indexOf("\n---", 4);
    if (end >= 0) {
      for (const line of raw.slice(4, end).split(/\r?\n/)) {
        const [key, ...rest] = line.split(":");
        const value = rest.join(":").trim();
        if (key?.trim() === "license" && value) license = value;
        if (key?.trim() === "evidenceLevel" && ["A", "B", "C", "D", "F"].includes(value)) evidenceLevel = value as typeof evidenceLevel;
      }
      text = raw.slice(end + 4).replace(/^\r?\n/, "");
    }
  }
  return { text, license, evidenceLevel };
}

const root = process.argv[2];
if (!root) throw new Error("usage: ingest-rag-folder <folder>");
const rootPath = path.resolve(root);
let indexed = 0;
let skipped = 0;
for (const file of filesUnder(rootPath)) {
  if (fs.statSync(file).size > MAX_BYTES) { skipped++; continue; }
  const parsed = parseDocument(fs.readFileSync(file, "utf8"));
  const relative = path.relative(rootPath, file).split(path.sep).join("/");
  vectorStore.add({
    id: `folder:${relative}`,
    text: parsed.text,
    source: relative,
    category: "medical-knowledge",
    evidenceLevel: parsed.evidenceLevel,
    metadata: parsed.license ? { license: parsed.license } : undefined,
  });
  indexed++;
}
console.log(`INGEST_COUNTS indexed=${indexed} skipped=${skipped}`);
