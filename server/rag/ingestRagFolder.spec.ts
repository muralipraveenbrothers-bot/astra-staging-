import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

describe("synthetic RAG folder ingestion", () => {
  const tempDirs: string[] = [];
  afterEach(() => { for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

  it("indexes the three seed documents and replaces them on rerun", () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "astra-rag-ingest-"));
    tempDirs.push(temp);
    const indexPath = path.join(temp, "index.json");
    const command = process.execPath;
    const env = { ...process.env, ASTRA_RAG_INDEX_PATH: indexPath };
    const run = () => spawnSync(command, [path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"), "scripts/ingest-rag-folder.ts", "knowledge-seed"], { cwd: process.cwd(), env, encoding: "utf8" });
    const first = run();
    expect(first.status).toBe(0);
    expect(first.stdout.trim()).toBe("INGEST_COUNTS indexed=3 skipped=0");
    const firstIndex = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    expect(new Set(firstIndex.chunks.map((chunk: { id: string }) => chunk.id)).size).toBe(3);
    const second = run();
    expect(second.status).toBe(0);
    expect(second.stdout.trim()).toBe("INGEST_COUNTS indexed=3 skipped=0");
    const secondIndex = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    expect(new Set(secondIndex.chunks.map((chunk: { id: string }) => chunk.id)).size).toBe(3);
  });
});
