import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { seedStaffAccountsFromEnvironment } from "./accountVault";

const original = { ...process.env };
const directories: string[] = [];

afterEach(() => {
  process.env = { ...original };
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function isolatedVault(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "astra-vault-seed-"));
  directories.push(directory);
  process.env.ASTRA_DATA_DIR = directory;
  return path.join(directory, "auth-vault.json");
}

describe("staff vault bootstrap", () => {
  it("creates configured missing staff accounts and preserves existing accounts", () => {
    const vault = isolatedVault();
    const env = { NODE_ENV: "test", ASTRA_SEED_RECEPTION_PIN: "123456", ASTRA_SEED_DOCTOR_PIN: "654321" };
    expect(seedStaffAccountsFromEnvironment(env)).toEqual({ created: 2, skipped: 0 });
    const first = JSON.parse(fs.readFileSync(vault, "utf8"));
    expect(first.map((account: { id: string }) => account.id).sort()).toEqual(["doctor", "reception"]);
    const originalHash = first.find((account: { id: string }) => account.id === "doctor").passwordHash;
    expect(seedStaffAccountsFromEnvironment(env)).toEqual({ created: 0, skipped: 2 });
    const second = JSON.parse(fs.readFileSync(vault, "utf8"));
    expect(second.find((account: { id: string }) => account.id === "doctor").passwordHash).toBe(originalHash);
  });

  it("rejects malformed pins and production execution", () => {
    isolatedVault();
    expect(() => seedStaffAccountsFromEnvironment({ NODE_ENV: "test", ASTRA_SEED_CEO_PIN: "12345" })).toThrow("Invalid PIN");
    expect(() => seedStaffAccountsFromEnvironment({ NODE_ENV: "production", ASTRA_SEED_CEO_PIN: "123456" })).toThrow("disabled in production");
  });
});
