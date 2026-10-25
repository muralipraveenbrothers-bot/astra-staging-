/**
 * Bounded LangGraph-style clinical workflow. High-risk actions are never executed.
 * Independent second check uses a different path when one is actually available.
 */
import { agentOrchestrator } from "../langgraph";
import { centralAiChat, chatText } from "./centralCore";
import { loadModelCatalog } from "./modelCatalog";
import { aiGatewayConfig } from "./config";
import { openaiChatCompletions } from "./openaiCompatible";
import { nextRequestId } from "./log";
import { buildEnvelope, redactForExternal, type AutonomyLevel } from "./policy";
import type { UserSession } from "../types";

export interface ClinicalWorkflowResult {
  requestId: string;
  autonomy: AutonomyLevel;
  approvalRequired: true;
  executed: false;
  nodes: Array<{ id: string; path: string; output: string }>;
  synthesis: {
    differential: string[];
    evidence: string[];
    missing: string[];
    redFlags: string[];
    contradictions: string[];
    treatmentOptions: string[];
    risks: string[];
    monitoring: string[];
    uncertainty: string;
    doctorReviewRequired: true;
  };
  secondCheck: { used: boolean; path?: string; disagreement: boolean; flag?: string; detail: string };
  disclaimer: string;
}

function extractList(text: string, heading: string): string[] {
  const re = new RegExp(`${heading}[:\\n]([\\s\\S]{0,800}?)(?:\\n\\n|$)`, "i");
  const m = text.match(re);
  if (!m) return [];
  return m[1]
    .split(/\n/)
    .map((l) => l.replace(/^[-*•\d.\s]+/, "").trim())
    .filter((l) => l.length > 3)
    .slice(0, 8);
}

export async function runClinicalWorkflow(input: string, user?: UserSession): Promise<ClinicalWorkflowResult> {
  const requestId = nextRequestId();
  const envelope = buildEnvelope({ requestId, role: user?.role, input, taskType: "clinical-workflow" });
  const safeInput = redactForExternal(input);

  const graph = await agentOrchestrator.runGraph(safeInput, user ?? {
    userId: "clinical-workflow",
    name: "Astra Clinical Workflow",
    email: "workflow@astra.local",
    role: "doctor",
    department: "clinical",
    sessionToken: "workflow",
    expiresAt: Date.now() + 60_000,
  }, undefined, 8);

  const nodes: ClinicalWorkflowResult["nodes"] = [
    { id: "history", path: "graph", output: graph.extractedEntities ? JSON.stringify(graph.extractedEntities).slice(0, 400) : "entity node" },
    { id: "labs", path: "graph", output: "labs node (deterministic graph)" },
    { id: "imaging", path: "graph", output: "imaging node (deterministic graph)" },
    { id: "pharmacy", path: "graph", output: graph.safetyFlags.join(" | ").slice(0, 400) },
    { id: "differential", path: "graph", output: graph.differentialList.map((d) => d.condition).join("; ") },
    { id: "evidence", path: "graph", output: graph.evidenceHits.map((e) => e.title).join("; ").slice(0, 400) },
    { id: "safety", path: "graph", output: (graph.sparseDataAnalysis?.redFlags ?? []).join(" | ") },
  ];

  const primary = await centralAiChat({
    agent: "langgraph",
    clinical: true,
    memory: `request ${requestId} class=${envelope.data_class}`,
    messages: [{
      role: "user",
      content:
        `Clinical decision support (not a diagnosis). Summarize differentials, red flags, missing tests, uncertainty. Do not invent PMIDs or execute orders.\nCASE: ${safeInput}\nGRAPH: ${JSON.stringify({ ddx: graph.differentialList, safety: graph.safetyFlags }).slice(0, 2500)}`,
    }],
    max_tokens: 600,
    temperature: 0.1,
  });
  const primaryText = chatText(primary);
  nodes.push({ id: "primary_reasoning", path: primary.service, output: primaryText.slice(0, 800) });

  let secondCheck: ClinicalWorkflowResult["secondCheck"] = {
    used: false,
    disagreement: false,
    detail: "No independent path configured or available — not faking a second opinion from the same call.",
  };

  const catalog = await loadModelCatalog();
  const localChat = catalog.models.find((m) => m.source === "ollama" && !m.embedding && m.available);
  if (localChat) {
    const cfg = aiGatewayConfig();
    const second = await openaiChatCompletions({
      baseURL: cfg.local.baseUrl,
      requestId: `${requestId}-b`,
      timeoutMs: 8_000,
      body: {
        model: localChat.id,
        messages: [
          { role: "system", content: "Independent safety reviewer. List must-not-miss items only. Do not agree by default." },
          { role: "user", content: `Case: ${safeInput}\nPrimary ddx: ${graph.differentialList.map((d) => d.condition).join(", ")}` },
        ],
        max_tokens: 220,
        temperature: 0.2,
      },
    });
    if (second.ok) {
      const txt = typeof (second.json as { choices?: { message?: { content?: string } }[] } | null)?.choices?.[0]?.message?.content === "string"
        ? (second.json as { choices: { message: { content: string } }[] }).choices[0].message.content
        : second.text;
      nodes.push({ id: "independent_check", path: `ollama:${localChat.id}`, output: String(txt).slice(0, 800) });
      const overlap = graph.differentialList.some((d) => String(txt).toLowerCase().includes(d.condition.toLowerCase().slice(0, 12)));
      const disagreement = !overlap && String(txt).length > 40;
      secondCheck = {
        used: true,
        path: `ollama/${localChat.id} (context ${localChat.contextLength ?? "unknown"})`,
        disagreement,
        flag: disagreement ? "FLAG FOR DOCTOR — independent local check did not corroborate primary differentials." : undefined,
        detail: disagreement ? "Disagreement preserved; no forced consensus." : "Independent local path ran; no forced consensus.",
      };
    } else {
      secondCheck = { used: false, disagreement: false, detail: `Local independent check failed: ${second.error ?? second.status}` };
    }
  }

  const synthesis = {
    differential: graph.differentialList.map((d) => `${d.condition} (${d.probability})`),
    evidence: graph.evidenceHits.map((e) => e.title),
    missing: graph.sparseDataAnalysis?.missingInfo ?? [],
    redFlags: graph.sparseDataAnalysis?.redFlags ?? graph.safetyFlags,
    contradictions: secondCheck.disagreement ? [secondCheck.flag ?? "independent check disagreed"] : [],
    treatmentOptions: ["Supportive care pending clinician decision — no autonomous treatment"],
    risks: graph.safetyFlags,
    monitoring: graph.sparseDataAnalysis?.bestNextTests ?? [],
    uncertainty: "Decision support only. Not a diagnosis. Qualified human review required.",
    doctorReviewRequired: true as const,
  };

  return {
    requestId,
    autonomy: envelope.safety_level,
    approvalRequired: true,
    executed: false,
    nodes,
    synthesis,
    secondCheck,
    disclaimer:
      "Clinical decision support. Not 100% diagnostic accuracy, not zero missed diagnosis, not a guaranteed outcome. High-risk actions are not executed.",
  };
}
