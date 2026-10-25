import { deidentifyForScientificQuery } from "../../astra/intelligence_extensions/safety/phiGuard";
import { auditLogger } from "../../src/services/auditLogger";

const DEFAULT_ENDPOINT = "http://127.0.0.1:7017/mcp/call-tool";

export function healthcareHttpAdapterEnabled(): boolean {
  return process.env.ASTRA_HEALTHCARE_HTTP_ADAPTER_ENABLED?.trim().toLowerCase() === "true";
}

export async function callHealthcareHttpTool(name: string, args: Record<string, unknown> = {}) {
  if (!healthcareHttpAdapterEnabled()) return { ok: false, status: "disabled", provider: "HTTP-adapter", error: "feature_disabled" };
  const raw = JSON.stringify(args);
  const safe = deidentifyForScientificQuery(raw);
  const response = await fetch(process.env.ASTRA_HEALTHCARE_HTTP_ADAPTER_URL ?? DEFAULT_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, arguments: JSON.parse(safe.deidentified) }),
    signal: AbortSignal.timeout(8000),
  });
  const body = await response.json().catch(() => ({ status: "error", error_message: "invalid_json" }));
  auditLogger.log({
    action: "AI_SUMMARY_GENERATED",
    performedBy: "Astra HTTP-adapter",
    userRole: "System Engine",
    details: JSON.stringify({ provider: "HTTP-adapter", tool: name, upstreamStatus: response.status, redactedFields: safe.redactedFields }),
    sourceModule: "healthcare-mcp-public",
    provenanceData: { endpoint: process.env.ASTRA_HEALTHCARE_HTTP_ADAPTER_URL ?? DEFAULT_ENDPOINT, redactedFields: safe.redactedFields },
  });
  return { ok: response.ok, provider: "HTTP-adapter", upstreamStatus: response.status, data: body, phiRedactions: safe.redactedFields };
}

export function healthcareHttpAdapterStatus() {
  return { provider: "HTTP-adapter", enabled: healthcareHttpAdapterEnabled(), endpoint: process.env.ASTRA_HEALTHCARE_HTTP_ADAPTER_URL ?? DEFAULT_ENDPOINT };
}
