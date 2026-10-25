/**
 * Account vault auth: PIN sign-in against data/auth-vault.json (salted
 * scrypt hashes). The vault file never leaves the server; responses carry
 * no salt or hash. Login is rate-limited per account+IP.
 */
import { Express, Request, Response } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { authenticate, createSession, requireRole } from "../rbac";
import { loginRateLimiter } from "../security/loginRateLimiter";
import { Role } from "../types";
import { db } from "../db";

function vaultPath(): string {
  const explicit = process.env.ASTRA_AUTH_VAULT_PATH?.trim();
  if (explicit) return explicit;
  const dataDir = process.env.ASTRA_DATA_DIR?.trim() || path.join(process.cwd(), "data");
  return path.join(dataDir, "auth-vault.json");
}

export interface VaultAccount {
  id: string;
  name: string;
  role: string;
  subtitle: string;
  enabled: boolean;
  salt?: string;
  passwordHash?: string;
  mustChangePin?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

const KNOWN_ROLES: ReadonlySet<string> = new Set<Role>([
  "doctor", "reception", "pharmacy", "lab", "radiology", "ward", "ot",
  "hr", "billing", "insurance", "accounts", "supervisor", "marketing", "ceo", "admin",
]);

function readVault(): VaultAccount[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(vaultPath(), "utf8"));
    return Array.isArray(parsed) ? (parsed as VaultAccount[]) : [];
  } catch {
    return [];
  }
}

function writeVault(accounts: VaultAccount[]): void {
  const target = vaultPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(accounts, null, 2), "utf8");
  fs.renameSync(tmp, target);
}

function hashPin(pin: string, salt: string): string {
  return crypto.scryptSync(pin, salt, 64).toString("hex");
}

function verifyPin(pin: string, account: VaultAccount): boolean {
  if (!account.salt || !account.passwordHash) return false;
  try {
    const candidate = Buffer.from(hashPin(pin, account.salt), "hex");
    const stored = Buffer.from(account.passwordHash, "hex");
    return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
  } catch {
    return false;
  }
}

function publicAccount(account: VaultAccount) {
  return {
    id: account.id,
    name: account.name,
    role: account.role,
    subtitle: account.subtitle,
    mustChangePin: Boolean(account.mustChangePin),
  };
}

function seededAccountFor(id: string, pin: string): VaultAccount {
  const role = id.toLowerCase();
  if (!KNOWN_ROLES.has(role)) throw new Error(`Unsupported staff seed account role: ${id}`);
  if (!/^\d{6,}$/.test(pin)) throw new Error(`Invalid PIN for staff seed account: ${id}`);
  const now = new Date().toISOString();
  const salt = crypto.randomBytes(24).toString("hex");
  return {
    id: role,
    name: `${role.slice(0, 1).toUpperCase()}${role.slice(1)} staff`,
    role,
    subtitle: `Local ${role} account`,
    enabled: true,
    salt,
    passwordHash: hashPin(pin, salt),
    mustChangePin: true,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Development-only bootstrap invoked by scripts/start-all.ps1. It deliberately
 * creates only absent accounts and never returns or logs a PIN/hash.
 */
export function seedStaffAccountsFromEnvironment(env: NodeJS.ProcessEnv = process.env): { created: number; skipped: number } {
  if (env.NODE_ENV?.trim().toLowerCase() === "production") {
    throw new Error("Staff account seeding is disabled in production");
  }
  const seeds = Object.entries(env)
    .filter(([name, value]) => /^ASTRA_SEED_[A-Z0-9_]+_PIN$/.test(name) && Boolean(value))
    .map(([name, value]) => ({ id: name.slice("ASTRA_SEED_".length, -"_PIN".length).toLowerCase(), pin: value! }));
  const accounts = readVault();
  let created = 0;
  let skipped = 0;
  for (const seed of seeds) {
    if (accounts.some((account) => account.id === seed.id)) {
      skipped++;
      continue;
    }
    accounts.push(seededAccountFor(seed.id, seed.pin));
    created++;
  }
  if (created > 0) writeVault(accounts);
  return { created, skipped };
}

function clientIp(req: Request): string {
  return req.ip ?? "unknown";
}

export function registerAccountVaultRoutes(app: Express): void {
  app.get("/api/auth/accounts/public", (_req: Request, res: Response) => {
    const accounts = readVault()
      .filter((a) => a.enabled !== false)
      .map(publicAccount);
    res.json({ accounts });
  });

  app.post("/api/auth/vault-login", (req: Request, res: Response) => {
    const id = String(req.body?.id ?? "");
    const password = String(req.body?.password ?? "");
    const ip = clientIp(req);

    const locked = loginRateLimiter.lockedSeconds(id, ip);
    if (locked > 0) {
      res.status(429).json({
        error: "TOO_MANY_ATTEMPTS",
        message: `Too many attempts. Try again in ${locked}s.`,
      });
      return;
    }

    const account = readVault().find((a) => a.id === id);
    if (!account || account.enabled === false || !verifyPin(password, account)) {
      loginRateLimiter.recordFailure(id, ip);
      res.status(401).json({ error: "INVALID_CREDENTIALS", message: "Invalid account or PIN." });
      return;
    }

    loginRateLimiter.recordSuccess(id, ip);
    const session = createSession(account.role as Role, account.name, account.id);
    db.logAudit({
      actorId: session.userId,
      actorName: session.name,
      actorRole: session.role,
      action: "USER_LOGIN",
      category: "security",
      status: "SUCCESS",
      details: `Vault PIN login for account ${account.id}`,
      ip,
    });
    res.json({
      success: true,
      session: { sessionToken: session.sessionToken },
      account: publicAccount(account),
      mustChangePin: Boolean(account.mustChangePin),
    });
  });

  app.put("/api/auth/accounts/:id", authenticate, requireRole(["doctor", "ceo", "admin"]), (req: Request, res: Response) => {
    const id = String(req.params.id ?? "");
    if (!id) {
      res.status(400).json({ error: "MISSING_ID", message: "Account id is required." });
      return;
    }
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const role = typeof req.body?.role === "string" ? req.body.role : "";
    const subtitle = typeof req.body?.subtitle === "string" ? req.body.subtitle.trim() : "";
    const password = typeof req.body?.password === "string" && req.body.password ? req.body.password : undefined;

    if (role && !KNOWN_ROLES.has(role)) {
      res.status(400).json({ error: "INVALID_ROLE", message: `Role '${role}' is not a valid hospital role.` });
      return;
    }
    if (password !== undefined && !/^\d{6,}$/.test(password)) {
      res.status(400).json({ error: "INVALID_PIN", message: "PIN must be at least 6 digits." });
      return;
    }

    const accounts = readVault();
    const index = accounts.findIndex((a) => a.id === id);
    const existing = index >= 0 ? accounts[index] : undefined;
    if (existing && password === undefined && !name && !role && !subtitle) {
      res.status(400).json({ error: "NO_CHANGE", message: "Nothing to update." });
      return;
    }

    const now = new Date().toISOString();
    const account: VaultAccount = {
      id,
      name: name || existing?.name || id,
      role: role || existing?.role || "reception",
      subtitle: subtitle || existing?.subtitle || "",
      enabled: existing?.enabled ?? true,
      mustChangePin: existing?.mustChangePin ?? false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    if (password !== undefined) {
      account.salt = crypto.randomBytes(24).toString("hex");
      account.passwordHash = hashPin(password, account.salt);
    } else {
      account.salt = existing?.salt;
      account.passwordHash = existing?.passwordHash;
    }

    if (index >= 0) accounts[index] = account;
    else accounts.push(account);
    writeVault(accounts);

    const user = (req as any).user;
    db.logAudit({
      actorId: user?.userId ?? "unknown",
      actorName: user?.name ?? "unknown",
      actorRole: user?.role ?? "admin",
      action: password !== undefined ? "ACCOUNT_PIN_SET" : "ACCOUNT_UPDATED",
      category: "security",
      status: "SUCCESS",
      details: `Account '${id}' updated (PIN values are never logged)`,
      ip: clientIp(req),
    });
    res.json({ ok: true, account: publicAccount(account) });
  });

  app.post("/api/auth/change-pin", authenticate, (req: Request, res: Response) => {
    const user = (req as any).user;
    const password = String(req.body?.password ?? "");
    if (!/^\d{6,}$/.test(password)) {
      res.status(400).json({ error: "INVALID_PIN", message: "PIN must be at least 6 digits." });
      return;
    }
    const accounts = readVault();
    const index = accounts.findIndex((a) => a.id === user?.userId);
    if (index < 0) {
      res.status(404).json({ error: "ACCOUNT_NOT_FOUND", message: "No vault account for this session." });
      return;
    }
    accounts[index].salt = crypto.randomBytes(24).toString("hex");
    accounts[index].passwordHash = hashPin(password, accounts[index].salt!);
    accounts[index].mustChangePin = false;
    accounts[index].updatedAt = new Date().toISOString();
    writeVault(accounts);
    res.json({ ok: true });
  });
}
