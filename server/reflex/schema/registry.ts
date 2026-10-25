import crypto from "crypto";
import fs from "fs";
import path from "path";
import { astraDataRoot } from "../../services/env";
import type { DecisionSchema } from "./types";

const registered = new Map<string, DecisionSchema>();
const hashesByIdVersion = new Map<string, string>();
const blockedClinical = /diagnos|probabilit(?:y|ies) of|prognos/i;
const allowedAbstain = new Set(["unknown", "insufficient_information", "human_review"]);

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).filter((key) => object[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

export function schemaKey(id: string, version: number): string {
  return `${id}@${version}`;
}

export function contentHash(schema?: DecisionSchema): string {
  const payload = schema ?? Array.from(registered.values()).sort((a, b) => schemaKey(a.id, a.version).localeCompare(schemaKey(b.id, b.version)));
  return crypto.createHash("sha256").update(canonical(payload)).digest("hex");
}

function snapshotPath(): string {
  return path.join(astraDataRoot(), "reflex", "schema-registry.json");
}

function persistAllowed(): boolean {
  return !process.env.VITEST;
}

export function writeRegistrySnapshot(): void {
  if (!persistAllowed()) return;
  try {
    const file = snapshotPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const schemas = list();
    const hashes = Object.fromEntries(schemas.map((schema) => [schemaKey(schema.id, schema.version), contentHash(schema)]));
    fs.writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), hash: contentHash(), hashes, schemas }, null, 2), "utf8");
  } catch {
    // Snapshot failure must not take down a decision.
  }
}

export function exportSchemasFile(): string {
  const file = path.join(astraDataRoot(), "reflex", "schemas.json");
  if (!persistAllowed()) return file;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ schemas: list(), hash: contentHash() }, null, 2), "utf8");
  } catch {
    // Python reload can be retried; registration itself still succeeded.
  }
  return file;
}

function validate(schema: DecisionSchema): void {
  if (!schema.id.trim()) throw new Error("schema id is required");
  if (schema.version < 1 || !Number.isInteger(schema.version)) throw new Error("schema version must be a positive integer");
  if (blockedClinical.test(schema.id) || blockedClinical.test(schema.question)) throw new Error("Laya schemas cannot request diagnosis, prognosis, or disease probability");
  if (schema.question.length > 300) throw new Error("schema question must be <= 300 chars");

  if (schema.kind === "choice") {
    const options = schema.options ?? [];
    if (options.length < 2 || options.length > 40) throw new Error("choice schema needs 2-40 options");
    const keys = new Set<string>();
    for (const option of options) {
      if (keys.has(option.key)) throw new Error(`duplicate choice key: ${option.key}`);
      keys.add(option.key);
      if (!schema.abstainKeys.includes(option.key)) {
        const words = (option.description ?? "").trim().split(/\s+/).filter(Boolean);
        if (words.length < 3) throw new Error(`choice option ${option.key} needs a description of at least 3 words`);
      }
    }
    if (!schema.abstainKeys.some((key) => allowedAbstain.has(key) && keys.has(key))) {
      throw new Error("choice schema needs an abstain key among its options");
    }
  }
  if (schema.kind === "score") {
    const levels = schema.levels ?? [];
    if (levels.length < 2 || levels.length > 10) throw new Error("score schema needs 2-10 levels");
  }
}

export function register(schema: DecisionSchema): DecisionSchema {
  validate(schema);
  const key = schemaKey(schema.id, schema.version);
  const hash = contentHash(schema);
  const existing = hashesByIdVersion.get(key);
  if (existing && existing !== hash) throw new Error(`schema ${key} changed without a version bump`);
  registered.set(key, schema);
  hashesByIdVersion.set(key, hash);
  writeRegistrySnapshot();
  exportSchemasFile();
  return schema;
}

export function get(id: string, version?: number): DecisionSchema | undefined {
  if (version != null) return registered.get(schemaKey(id, version));
  return Array.from(registered.values()).filter((schema) => schema.id === id).sort((a, b) => b.version - a.version)[0];
}

export function list(): DecisionSchema[] {
  return Array.from(registered.values()).sort((a, b) => schemaKey(a.id, a.version).localeCompare(schemaKey(b.id, b.version)));
}

export function clearRegistryForTests(): void {
  registered.clear();
  hashesByIdVersion.clear();
}
