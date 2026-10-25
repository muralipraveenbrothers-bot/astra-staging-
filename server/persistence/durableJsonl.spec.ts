import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";
import { DurableJsonlStream, open, verify } from "./durableJsonl";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "astra-durable-"));
}

describe("durableJsonl", () => {
  it("keeps a valid hash chain across month segments", () => {
    let now = new Date("2026-09-30T23:59:00.000Z");
    const stream = open(`chain-${Date.now()}`, tempDir(), { now: () => now });
    for (let i = 0; i < 500; i += 1) stream.append("entry", { i });
    now = new Date("2026-10-01T00:01:00.000Z");
    for (let i = 500; i < 1000; i += 1) stream.append("entry", { i });
    const entries = stream.replay();
    expect(entries).toHaveLength(1000);
    expect(entries.map((entry) => entry.seq)).toEqual(Array.from({ length: 1000 }, (_, index) => index + 1));
    expect(stream.verify()).toEqual({ ok: true, entries: 1000 });
    stream.close();
  });

  it("reports tampering and keeps only the good prefix on replay", () => {
    const dir = tempDir();
    const name = `tamper-${Date.now()}`;
    const stream = open(name, dir);
    stream.append("entry", { i: 1 });
    stream.append("entry", { i: 2 });
    stream.append("entry", { i: 3 });
    stream.close();
    const file = fs.readdirSync(dir).find((entry) => entry.endsWith(".jsonl"));
    if (!file) throw new Error("segment missing");
    const full = path.join(dir, file);
    const lines = fs.readFileSync(full, "utf8").trim().split(/\r?\n/);
    lines[1] = lines[1].replace('"i":2', '"i":9');
    fs.writeFileSync(full, `${lines.join("\n")}\n`, "utf8");
    const damaged = new DurableJsonlStream(name, dir);
    expect(damaged.replay()).toHaveLength(1);
    expect(fs.readdirSync(dir).some((entry) => entry.includes(".quarantined-"))).toBe(true);
    damaged.close();
  });

  it("verify() names the broken seq before boot replay quarantines and warns", () => {
    const dir = tempDir();
    const name = `verify-${Date.now()}`;
    const stream = open(name, dir);
    stream.append("entry", { i: 1 });
    stream.append("entry", { i: 2 });
    stream.append("entry", { i: 3 });
    stream.close();
    const file = fs.readdirSync(dir).find((entry) => entry.endsWith(".jsonl"));
    if (!file) throw new Error("segment missing");
    const full = path.join(dir, file);
    const lines = fs.readFileSync(full, "utf8").trim().split(/\r?\n/);
    lines[1] = lines[1].replace('"i":2', '"i":9');
    fs.writeFileSync(full, `${lines.join("\n")}\n`, "utf8");
    expect(verify(name, dir)).toEqual({ ok: false, entries: 1, brokenAtSeq: 2, file: full });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const booted = new DurableJsonlStream(name, dir);
    expect(booted.replay()).toHaveLength(1);
    expect(fs.readdirSync(dir).some((entry) => entry.includes(".quarantined-"))).toBe(true);
    expect(warn.mock.calls.some((call) => String(call[0]).includes("Broken hash chain"))).toBe(true);
    booted.close();
  });
});
