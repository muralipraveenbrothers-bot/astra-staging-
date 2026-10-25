/**
 * ASTRA AI — MEDICAL FABRIC AGGREGATE (truthful health, server-side)
 * ============================================================================
 * Produces the honest aggregate for the MCP Tool Fabric + the PubMed/NCBI
 * native capability card. Rules (Phase 8/11):
 *  - CONNECTED is only ever reported when a real MCP handshake succeeded
 *    (mcpRegistry sets CONNECTED only after initialize + tools/list).
 *  - READY for PubMed/NCBI is only reported after a REAL safe probe succeeded.
 *  - Configured is never reported as Connected.
 *  - Secrets never appear here — only masked statuses.
 */

import { mcpRegistry } from "../mcp/mcpRegistry";
import { ncbiKeyStatus, probePubMed, type PubMedProbe } from "./ncbiClient";

export const PUBMED_CAPABILITY_ID = "research.pubmed.search";
export const PUBMED_RISK_CLASS = "READ_ONLY_EXTERNAL_RESEARCH";

export interface FabricCounts {
  registered: number;
  configured: number;
  connected: number;
  ready: number;
  degraded: number;
  offline: number;
  configRequired: number;
  error: number;
  disabled: number;
}

export interface PubMedFabricCard {
  source: "NATIVE_API";
  provider: "NCBI/PubMed";
  transport: "HTTPS";
  configuration: "PASS" | "FAIL";
  connectivity: "PASS" | "FAIL" | "UNKNOWN";
  authentication: "PASS" | "FAIL" | "UNKNOWN";
  capability: string;
  riskClass: string;
  lastProbe: string | null;
  lastProbeTerm: string | null;
  latencyMs: number | null;
  totalHits: number | null;
  firstPmid: string | null;
  status: "READY" | "DEGRADED" | "OFFLINE" | "CONFIG_REQUIRED";
  lastError: string | null;
}

export interface MedicalFabric {
  mcp: FabricCounts;
  mcpRegistryBadge: "CONNECTED" | "DEGRADED" | "CONFIGURED" | "OFFLINE";
  pubmed: PubMedFabricCard;
  updatedAt: string;
}

/** Cached last probe state (provenance-safe fields only). */
let lastProbe: (PubMedProbe & { at: string; term: string }) | null = null;
let probeInFlight: Promise<PubMedProbe> | null = null;

/** Record the outcome of a real probe/search so the UI shows truth. */
export function recordPubMedOutcome(term: string, probe: PubMedProbe): void {
  lastProbe = { ...probe, at: new Date().toISOString(), term };
}

export function getMedicalFabric(): MedicalFabric {
  const servers = mcpRegistry.listAll();
  const mcp: FabricCounts = {
    registered: servers.length,
    configured: servers.filter((s) => s.status !== "DISABLED").length,
    connected: servers.filter((s) => s.status === "CONNECTED").length,
    ready: servers.filter((s) => s.status === "CONNECTED" && s.tools.length > 0).length,
    degraded: servers.filter((s) => s.status === "CONFIGURED" && s.lastError).length,
    offline: 0,
    configRequired: 0,
    error: servers.filter((s) => s.status === "ERROR").length,
    disabled: servers.filter((s) => s.status === "DISABLED").length,
  };

  const anyConfigured = mcp.configured > 0;
  const mcpRegistryBadge = mcp.registered > 0 && mcp.connected === mcp.registered ? "CONNECTED" : mcp.connected > 0 ? "DEGRADED" : anyConfigured ? "CONFIGURED" : "OFFLINE";

  const keyConfigured = ncbiKeyStatus() === "CONFIGURED";
  const lp = lastProbe;
  const pubmed: PubMedFabricCard = {
    source: "NATIVE_API",
    provider: "NCBI/PubMed",
    transport: "HTTPS",
    configuration: keyConfigured ? "PASS" : "FAIL",
    connectivity: lp ? (lp.ok ? "PASS" : "FAIL") : "UNKNOWN",
    authentication: lp ? (lp.ok ? "PASS" : lp.errorCode === "AUTH_FAILED" ? "FAIL" : "UNKNOWN") : "UNKNOWN",
    capability: PUBMED_CAPABILITY_ID,
    riskClass: PUBMED_RISK_CLASS,
    lastProbe: lp?.at ?? null,
    lastProbeTerm: lp?.term ?? null,
    latencyMs: lp?.latencyMs ?? null,
    totalHits: lp?.totalHits ?? null,
    firstPmid: lp?.firstPmid ?? null,
    status: !keyConfigured
      ? "CONFIG_REQUIRED"
      : lp?.ok
        ? "READY"
        : lp
          ? "OFFLINE"
          : "DEGRADED",
    lastError: lp && !lp.ok ? (lp.error ?? lp.errorCode ?? "probe failed") : null,
  };

  return { mcp, mcpRegistryBadge, pubmed, updatedAt: new Date().toISOString() };
}

/** Run the safe NCBI probe now (used by /api/medical/pubmed/probe). */
export async function runPubMedProbe(term?: string): Promise<PubMedProbe> {
  if (!probeInFlight) {
    probeInFlight = probePubMed(term).then((result) => {
      recordPubMedOutcome(term ?? "acute pancreatitis", result);
      return result;
    }).finally(() => { probeInFlight = null; });
  }
  return probeInFlight;
}
