/**
 * ASTRA AI — PUBMED / MEDICAL FABRIC REST API (mounted under /api/medical)
 * ============================================================================
 * Uses the existing Express + `authenticate` + UserSession conventions.
 *  - GET  /api/medical/fabric        → truthful fabric aggregate (any session)
 *  - GET  /api/medical/pubmed/search → capability-gated real search (doctor/admin/ceo)
 *  - POST /api/medical/pubmed/probe  → safe live probe + proof block (doctor/admin/ceo)
 * The NCBI key never appears in any request, response, log, or audit entry.
 */

import type { Express, Request } from "express";
import { db } from "../db";
import type { UserSession } from "../types";
import { searchPubMed } from "./ncbiClient";
import { getMedicalFabric, runPubMedProbe } from "./fabric";

function who(req: Request): UserSession {
  return (req as unknown as { user: UserSession }).user;
}

function isResearchRole(u: UserSession): boolean {
  return u.role === "doctor" || u.role === "admin" || u.role === "ceo";
}

function audit(u: UserSession, action: string, status: "SUCCESS" | "FAILED" | "DENIED", details: string, ip?: string): void {
  try {
    db.logAudit({
      actorId: u.userId,
      actorName: u.name,
      actorRole: u.role,
      action,
      category: "research",
      status,
      details,
      ip,
    });
  } catch {
    // Audit failures must never break a research call.
  }
}

export function registerPubMedRoutes(app: Express): void {
  // Truthful fabric aggregate (metadata only; no secrets).
  app.get("/api/medical/fabric", (_req, res) => {
    res.json(getMedicalFabric());
  });

  // Capability-gated real PubMed search: research.pubmed.search
  app.get("/api/medical/pubmed/search", async (req, res) => {
    const u = who(req);
    if (!isResearchRole(u)) {
      audit(u, "RESEARCH:PUBMED:SEARCH", "DENIED", `role=${u.role}`, req.ip);
      return res.status(403).json({ ok: false, error: "FORBIDDEN", message: "doctor/admin role required" });
    }
    const q = String(req.query.q ?? "").trim();
    const maxResults = Number(req.query.maxResults ?? 5);
    if (!q || q.length > 400) {
      return res.status(400).json({ ok: false, error: "VALIDATION", message: "q is required (1-400 chars)" });
    }
    const t0 = Date.now();
    try {
      const result = await searchPubMed({
        query: q,
        maxResults: Number.isFinite(maxResults) ? Math.min(Math.max(maxResults, 1), 20) : 5,
      });
      if (!result.ok) {
        audit(u, "RESEARCH:PUBMED:SEARCH", "FAILED", `errorCode=${result.errorCode ?? "SOURCE_UNAVAILABLE"} durationMs=${Date.now() - t0}`, req.ip);
        // SOURCE_UNAVAILABLE — never fabricated results.
        return res.status(502).json({
          ok: false,
          source: "NCBI/PubMed",
          mcpMode: "NATIVE_API",
          errorCode: result.errorCode ?? "SOURCE_UNAVAILABLE",
          error: result.error ?? "PubMed unreachable",
        });
      }
      audit(u, "RESEARCH:PUBMED:SEARCH", "SUCCESS", `hits=${result.totalHits ?? 0} returned=${result.articles?.length ?? 0} durationMs=${result.latencyMs}`, req.ip);
      res.json({
        ok: true,
        source: "NCBI/PubMed",
        mcpMode: "NATIVE_API",
        capability: "research.pubmed.search",
        query: q,
        totalHits: result.totalHits ?? 0,
        articles: result.articles,
        latencyMs: result.latencyMs,
      });
    } catch (e) {
      audit(u, "RESEARCH:PUBMED:SEARCH", "FAILED", `durationMs=${Date.now() - t0}`, req.ip);
      res.status(500).json({ ok: false, errorCode: "SOURCE_UNAVAILABLE", error: e instanceof Error ? e.message : String(e) });
    }
  });

  // Safe live probe — returns only masked, provenance-safe proof.
  app.post("/api/medical/pubmed/probe", async (req, res) => {
    const u = who(req);
    if (!isResearchRole(u)) {
      audit(u, "RESEARCH:PUBMED:PROBE", "DENIED", `role=${u.role}`, req.ip);
      return res.status(403).json({ ok: false, error: "FORBIDDEN", message: "doctor/admin role required" });
    }
    const term = typeof req.body?.term === "string" && req.body.term.trim() ? req.body.term.trim().slice(0, 200) : undefined;
    const t0 = Date.now();
    try {
      const probe = await runPubMedProbe(term);
      audit(u, "RESEARCH:PUBMED:PROBE", probe.ok ? "SUCCESS" : "FAILED", `ok=${probe.ok} latencyMs=${Date.now() - t0}`, req.ip);
      res.json({
        ok: probe.ok,
        proof: {
          connectivity: probe.ok || probe.errorCode === "AUTH_FAILED" ? "PASS" : "FAIL",
          authentication: probe.ok ? "PASS" : probe.errorCode === "AUTH_FAILED" ? "FAIL" : "UNKNOWN",
          resultsReceived: probe.totalHits ?? 0,
          firstPmid: probe.firstPmid ?? null,
          latencyMs: probe.latencyMs,
          source: "NCBI/PubMed",
          mcpMode: "NATIVE_API",
        },
        error: probe.ok ? undefined : (probe.error ?? probe.errorCode),
        errorCode: probe.errorCode,
      });
    } catch (e) {
      audit(u, "RESEARCH:PUBMED:PROBE", "FAILED", `durationMs=${Date.now() - t0}`, req.ip);
      res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
}
