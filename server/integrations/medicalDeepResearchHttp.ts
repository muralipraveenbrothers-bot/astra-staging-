import { runAgenticRag, type AgenticRagResult } from "../rag/agenticRag";
import { auditLogger } from "../../src/services/auditLogger";

const DEFAULT_ENDPOINT = "http://127.0.0.1:7018/api/chat";
const DEFAULT_TIMEOUT_MS = 180_000;

export function medicalDeepResearchEnabled(): boolean {
  return process.env.ASTRA_MEDICAL_DEEP_RESEARCH_ENABLED?.trim().toLowerCase() === "true";
}

export async function runMedicalDeepResearch(query: string): Promise<{ ok: boolean; provider: "HTTP-service"; report?: string; rag?: AgenticRagResult; error?: string }> {
  if (!medicalDeepResearchEnabled()) return { ok: false, provider: "HTTP-service", error: "feature_disabled" };
  const timeoutMs = Number(process.env.ASTRA_MEDICAL_DEEP_RESEARCH_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const response = await fetch(process.env.ASTRA_MEDICAL_DEEP_RESEARCH_URL ?? DEFAULT_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS),
  });
  const text = await response.text();
  if (!response.ok) return { ok: false, provider: "HTTP-service", error: `upstream_http_${response.status}` };
  const rag = await runAgenticRag(query);
  auditLogger.log({
    action: "AI_SUMMARY_GENERATED",
    performedBy: "Astra HTTP-service",
    userRole: "System Engine",
    details: JSON.stringify({ provider: "HTTP-service", queryLength: query.length, upstreamStatus: response.status }),
    sourceModule: "medical-deep-research",
    provenanceData: { endpoint: process.env.ASTRA_MEDICAL_DEEP_RESEARCH_URL ?? DEFAULT_ENDPOINT, ragCycles: rag.cycleCount },
  });
  return { ok: true, provider: "HTTP-service", report: text, rag };
}

export function medicalDeepResearchStatus() {
  return { provider: "HTTP-service", enabled: medicalDeepResearchEnabled(), endpoint: process.env.ASTRA_MEDICAL_DEEP_RESEARCH_URL ?? DEFAULT_ENDPOINT };
}
