import crypto from "crypto";
import fs from "fs";
import path from "path";

export function sha256(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return crypto.createHash("sha256").update(text).digest("hex");
}

/** Append a hash-only audit line. Payload must already be free of secrets and patient text. */
export function appendHashLog(dir: string, event: Record<string, unknown>): string {
  const safe = { ...event };
  for (const key of ["text", "patient", "name", "phone", "address", "uhid", "secret"]) delete safe[key];
  const hash = sha256(safe);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(path.join(dir, "audit.jsonl"), JSON.stringify({ hash, at: new Date().toISOString(), event: safe }) + "\n", "utf8");
  return hash;
}

export function readHashLog(dir: string): Array<{ hash: string }> {
  const file = path.join(dir, "audit.jsonl");
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\n/).filter(Boolean).map((line) => JSON.parse(line) as { hash: string });
}
