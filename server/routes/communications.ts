import type { Express, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { authenticate, requireRole } from "../rbac";
import type { UserSession } from "../types";
import { verifyPatientMessageGuard } from "../../src/astra/approval/approvalGate.js";

type Message = { id: string; from: string; fromName: string; to: string; patientId?: string; text: string; at: string };
const dataDir = path.join(process.cwd(), "data");
const messageFile = path.join(dataDir, "communications.json");
const keyFile = path.join(dataDir, "secure-link.key");
function user(req: Request) { return (req as unknown as { user: UserSession }).user; }
function readMessages(): Message[] { try { return JSON.parse(fs.readFileSync(messageFile, "utf8")); } catch { return []; } }
function writeMessages(value: Message[]) { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(messageFile, JSON.stringify(value.slice(-5000), null, 2)); }
function signingKey() { fs.mkdirSync(dataDir, { recursive: true }); if (!fs.existsSync(keyFile)) fs.writeFileSync(keyFile, crypto.randomBytes(48), { mode: 0o600 }); return fs.readFileSync(keyFile); }
function sign(payload: string) { return crypto.createHmac("sha256", signingKey()).update(payload).digest("base64url"); }

export function registerCommunicationRoutes(app: Express) {
  app.get("/api/communications/messages", authenticate, (req, res) => {
    const me = user(req); const patientId = String(req.query.patientId ?? ""); const peer = String(req.query.peer ?? "");
    const elevated = ["doctor", "ceo", "admin"].includes(me.role);
    res.json({ messages: readMessages().filter((m) => (m.to === "global" || elevated || m.from === me.userId || m.to === me.userId) && (!patientId || m.patientId === patientId) && (!peer || m.from === peer || m.to === peer)).slice(-200) });
  });
  app.post("/api/communications/messages", authenticate, (req, res) => {
    const me = user(req); const text = String(req.body?.text ?? "").trim(); const to = String(req.body?.to ?? "").trim();
    if (!text || !to) return void res.status(400).json({ error: "MESSAGE_AND_RECIPIENT_REQUIRED" });

    // R5-01 Patient-facing guard: No AI-generated text to patient or attender without approved patient-message decision
    const isAi = req.body?.isAiGenerated || req.body?.source === "ai" || req.body?.source === "evidence-copilot";
    const guard = verifyPatientMessageGuard({
      isAiGenerated: isAi,
      approvalDecisionId: req.body?.approvalDecisionId,
      recipientType: to,
    });
    if (!guard.allowed) {
      return void res.status(403).json({ error: "PATIENT_MESSAGE_UNAPPROVED", reason: guard.reason });
    }

    const message: Message = { id: crypto.randomUUID(), from: me.userId, fromName: me.name, to, patientId: req.body?.patientId ? String(req.body.patientId) : undefined, text: text.slice(0, 4000), at: new Date().toISOString() };
    const all = readMessages(); all.push(message); writeMessages(all); res.json({ ok: true, message });
  });
  app.post("/api/communications/secure-links", authenticate, requireRole(["doctor", "ceo"]), (req, res) => {
    const targetAccountId = String(req.body?.targetAccountId ?? "").trim(); const route = String(req.body?.route ?? "/doctor");
    if (!targetAccountId || !/^\/(doctor|reception|billing|ward|ot|pharmacy|lab|radiology)(\?|$)/.test(route)) return void res.status(400).json({ error: "INVALID_LINK_TARGET" });
    const payload = Buffer.from(JSON.stringify({ sub: targetAccountId, patientId: req.body?.patientId || null, route, exp: Date.now() + Math.min(1440, Math.max(5, Number(req.body?.expiresMinutes ?? 60))) * 60000, nonce: crypto.randomUUID() })).toString("base64url");
    const token = `${payload}.${sign(payload)}`;
    res.json({ ok: true, token, path: `${route}${route.includes("?") ? "&" : "?"}secure=${encodeURIComponent(token)}` });
  });
  app.get("/api/communications/secure-links/:token", authenticate, (req, res) => {
    const [payload, signature] = String(req.params.token).split(".");
    const expected = payload ? sign(payload) : "";
    if (!payload || !signature || expected.length !== signature.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return void res.status(403).json({ error: "INVALID_SECURE_LINK" });
    const claim = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); const me = user(req);
    if (claim.exp < Date.now()) return void res.status(410).json({ error: "SECURE_LINK_EXPIRED" });
    if (claim.sub !== me.userId && !["doctor", "ceo", "admin"].includes(me.role)) return void res.status(403).json({ error: "LINK_NOT_ASSIGNED_TO_THIS_ACCOUNT" });
    res.json({ ok: true, claim });
  });
}
