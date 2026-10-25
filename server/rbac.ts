/**
 * Astra AI — Server-Side RBAC Middleware & Session Auth
 * =======================================================
 * Enforces authentic server-side security.
 * Every endpoint and route validates:
 *   1. Authenticated User & Session Token
 *   2. Role & Department Permissions
 *   3. Resource Scope (Patient / Department)
 *   4. Action Authorization
 *
 * Rejects unauthorized attempts with strict HTTP 403 Forbidden and writes to Audit Log.
 */

import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Role, ROLE_PERMISSIONS, UserSession } from "./types";
import { db } from "./db";

// Active in-memory session store (keyed by token)
const activeSessions = new Map<string, UserSession>();

export const KNOWN_USERS: Record<Role, { role: Role; name: string; department: string }> = {
  doctor: { role: "doctor", name: "Dr. Ananya Rao", department: "Clinical Medicine" },
  admin: { role: "admin", name: "System Administrator", department: "Hospital Management" },
  ceo: { role: "ceo", name: "Dr. K. S. Murthy (CEO)", department: "Executive Directorate" },
  reception: { role: "reception", name: "Kavitha Sharma", department: "Reception / OPD" },
  pharmacy: { role: "pharmacy", name: "M. Ramakrishna (Pharmacist)", department: "Central Pharmacy" },
  lab: { role: "lab", name: "S. Swathi (Lab Officer)", department: "Clinical Pathology" },
  radiology: { role: "radiology", name: "Dr. Nitin Deshmukh (Radiologist)", department: "Radio-Diagnosis" },
  ward: { role: "ward", name: "Sister Mary (Head Nurse)", department: "ICU & Nursing" },
  ot: { role: "ot", name: "OT Coordinator Priya", department: "Operation Theater" },
  hr: { role: "hr", name: "Vikas Reddy (HR)", department: "Human Resources" },
  billing: { role: "billing", name: "Ramesh Gupta (Billing Officer)", department: "Revenue & Billing" },
  insurance: { role: "insurance", name: "Sunita Nair (TPA Claims Desk)", department: "PMJAY / Insurance" },
  accounts: { role: "accounts", name: "P. R. Rao (Chief Accountant)", department: "Finance & Accounts" },
  supervisor: { role: "supervisor", name: "Hospital Supervisor", department: "Hospital Operations" },
  marketing: { role: "marketing", name: "Marketing Coordinator", department: "Marketing" },
};

/**
 * Authenticate session via Bearer token, Cookie, or Header
 *
 * SECURITY (Phase 2 hardening): the legacy development fallback that silently
 * granted a demo session to unauthenticated requests is now disabled;
 * ASTRA_DEV_AUTH_BYPASS=true AND a non-production NODE_ENV. In production an
 * unauthenticated request is always rejected with 401 — never mapped to a role.
 */
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const DEV_BYPASS_ENABLED =
  process.env.ASTRA_DEV_AUTH_BYPASS === "true" && !IS_PRODUCTION;

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  let token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : (req.headers["x-Astra-token"] as string);

  // Dev-only conveniences (query-param role for direct browser navigation and
  // the doctor default) — explicitly opt-in via ASTRA_DEV_AUTH_BYPASS=true and
  // never available in production.
  if (!token && DEV_BYPASS_ENABLED) {
    db.logAudit({
      actorId: "anonymous",
      actorName: "anonymous",
      actorRole: "admin",
      action: "AUTH_DEV_BYPASS_DISABLED",
      category: "security",
      status: "DENIED",
      details: `Fixed demo sessions are disabled; login required (${req.method} ${req.originalUrl})`,
      ip: req.ip,
    });
  }

  const session = activeSessions.get(token ?? "");
  if (!token || !session || session.expiresAt < Date.now()) {
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Authentication required. Please log in with valid credentials.",
    });
    return;
  }

  (req as any).user = session;
  next();
}

/** Validate a session token without HTTP semantics (used by the WS gateway). */
export function validateSessionToken(token: string | undefined): UserSession | null {
  if (!token) return null;
  const session = activeSessions.get(token);
  if (!session || session.expiresAt < Date.now()) return null;
  return session;
}

/**
 * Enforce RBAC permission gate for specific roles
 */
export function requireRole(allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as UserSession | undefined;

    if (!user) {
      res.status(401).json({ error: "UNAUTHORIZED", message: "User session not verified." });
      return;
    }

    if (user.role === "admin") {
      // Admin bypasses role checks
      return next();
    }

    if (!allowedRoles.includes(user.role)) {
      db.logAudit({
        actorId: user.userId,
        actorName: user.name,
        actorRole: user.role,
        action: `ACCESS_DENIED:${req.method} ${req.originalUrl}`,
        category: "security",
        status: "DENIED",
        details: `Role '${user.role}' attempted unauthorized access to route requiring [${allowedRoles.join(", ")}]`,
        ip: req.ip,
      });

      res.status(403).json({
        error: "FORBIDDEN",
        message: `Access denied. Role '${user.role}' is not authorized to access this resource.`,
        requiredRoles: allowedRoles,
        userRole: user.role,
      });
      return;
    }

    next();
  };
}

/**
 * Issue new session on login
 */
export function createSession(role: Role, name: string, accountId?: string): UserSession {
  const token = `Astra_${role}_` + crypto.randomBytes(16).toString("hex");
  const session: UserSession = {
    userId: accountId || "USR-" + crypto.randomUUID().slice(0, 8),
    name,
    email: `${role}@Astra.hospital.internal`,
    role,
    department: KNOWN_USERS[role]?.department || "General",
    sessionToken: token,
    expiresAt: Date.now() + 24 * 3600000,
  };
  activeSessions.set(token, session);
  return session;
}

/** Test-only session factory. It cannot operate against production or real data. */
export function createSyntheticSession(role: Role): UserSession {
  if (process.env.ASTRA_TEST_AUTH !== "1") throw new Error("ASTRA_TEST_AUTH=1 is required");
  if (process.env.NODE_ENV === "production") throw new Error("Synthetic auth is disabled in production");
  const configured = process.env.ASTRA_DATA_DIR?.trim();
  if (!configured) throw new Error("ASTRA_DATA_DIR is required for synthetic auth");
  const isolated = path.resolve(configured);
  if (isolated === path.resolve(process.cwd(), "data") || !fs.existsSync(isolated)) {
    throw new Error("Synthetic auth requires a separate data directory");
  }
  const vaultPath = path.join(isolated, "auth-vault.json");
  if (!fs.existsSync(vaultPath)) throw new Error("Synthetic auth requires auth-vault.json");
  const vault = JSON.parse(fs.readFileSync(vaultPath, "utf8"));
  if (!Array.isArray(vault) || vault.length !== 0) throw new Error("Synthetic auth requires an empty auth vault");
  return createSession(role, `Synthetic Test ${role}`, `ASTRA_TEST_${role.toUpperCase()}`);
}
