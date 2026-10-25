/**
 * Local encrypted secret vault (AES-256-GCM).
 * Stored in data/secrets.json with an auto-generated key in data/.secrets-key
 * (or SECRET_VAULT_KEY). Values are never logged.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA_DIR = path.join(ROOT, "data");
const VAULT_PATH = path.join(DATA_DIR, "secrets.json");
const KEY_PATH = path.join(DATA_DIR, ".secrets-key");

interface SealedEntry { ct: string; iv: string; tag: string }
interface VaultFile { version: 1; entries: Record<string, SealedEntry> }

function loadKey(): Buffer {
  const fromEnv = process.env.SECRET_VAULT_KEY?.trim();
  if (fromEnv && /^[0-9a-fA-F]{64}$/.test(fromEnv)) return Buffer.from(fromEnv, "hex");
  if (fs.existsSync(KEY_PATH)) {
    const hex = fs.readFileSync(KEY_PATH, "utf8").trim();
    if (/^[0-9a-fA-F]{64}$/.test(hex)) return Buffer.from(hex, "hex");
  }
  const fresh = crypto.randomBytes(32);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(KEY_PATH, fresh.toString("hex"), { mode: 0o600 });
  return fresh;
}

function readVault(): VaultFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(VAULT_PATH, "utf8")) as Partial<VaultFile>;
    if (parsed && typeof parsed === "object" && parsed.entries) {
      return { version: 1, entries: parsed.entries as Record<string, SealedEntry> };
    }
  } catch {
    /* vault missing or unreadable: start empty */
  }
  return { version: 1, entries: {} };
}

function writeVault(vault: VaultFile): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${VAULT_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(vault, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, VAULT_PATH);
}

function seal(value: string, key: Buffer): SealedEntry {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = cipher.update(value, "utf8", "hex") + cipher.final("hex");
  return { ct, iv: iv.toString("hex"), tag: cipher.getAuthTag().toString("hex") };
}

function unseal(entry: SealedEntry, key: Buffer): string | undefined {
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(entry.iv, "hex"));
    decipher.setAuthTag(Buffer.from(entry.tag, "hex"));
    return decipher.update(entry.ct, "hex", "utf8") + decipher.final("utf8");
  } catch {
    return undefined;
  }
}

export function getSecret(id: string): string | undefined {
  const vault = readVault();
  const entry = vault.entries[id];
  if (!entry) return undefined;
  return unseal(entry, loadKey());
}

export function setSecret(id: string, value: string): void {
  const key = loadKey();
  const vault = readVault();
  vault.entries[id] = seal(value, key);
  writeVault(vault);
}

export function deleteSecret(id: string): boolean {
  const vault = readVault();
  if (!(id in vault.entries)) return false;
  delete vault.entries[id];
  writeVault(vault);
  return true;
}

export function listSecretPresence(filterId?: string): Record<string, boolean> {
  const vault = readVault();
  const out: Record<string, boolean> = {};
  for (const id of Object.keys(vault.entries)) {
    if (!filterId || id === filterId || id.startsWith(`${filterId}.`)) out[id] = true;
  }
  return out;
}
