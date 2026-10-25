/**
 * ASTRA AI - AGENTIC RAG ENGINE
 * Bounded retrieval-reasoning loop: ROUTE -> RETRIEVE -> EVALUATE -> REFORMULATE -> SYNTHESIZE
 * Max 3 cycles. Integrates vector store, MCP resources, model layer.
 */
import { centralAiChat, chatText } from "../ai/centralCore";
import { vectorStore, type RagDocument } from "./vectorStore";
import { mcpRegistry } from "../mcp/mcpRegistry";
import { callMcpTool } from "../mcp/mcpClient";

export interface RagSource {
  type: "vector" | "mcp-resource" | "mcp-tool" | "model";
  id: string; title?: string; snippet: string; evidenceLevel?: string; source?: string;
}
export interface RagStep { phase: string; detail: string; }
export interface AgenticRagResult {
  answer: string; sources: RagSource[]; steps: RagStep[]; cycleCount: number; sufficient: boolean; trace: string[];
  citationIntegrity: { cited: number[]; invalid: number[]; sourceCount: number; valid?: boolean };
  answeredBy: "freellmapi" | "ollama" | "none";
}

export const RAG_ABSTENTION_SENTENCE = "Astra could not find an authorized source for this question. No evidence-backed answer is available.";
const MAX_CYCLES = 3;

export function routeQuery(q: string): { useVector: boolean; useMcp: boolean; categories: string[]; mcpServers: string[] } {
  const lc = q.toLowerCase(); const c: string[] = [];
  if (/\b(diagnosis|differential|symptom|disease|condition|syndrome)\b/.test(lc)) c.push("medical-knowledge");
  if (/\b(drug|medication|dose|prescription|interaction|pharma)\b/.test(lc)) c.push("pharmacology");
  if (/\b(surgery|operative|procedure|ot|resection)\b/.test(lc)) c.push("surgery");
  if (/\b(guideline|protocol|policy|nabh|who)\b/.test(lc)) c.push("guideline");
  if (/\b(lab|test|investigation|cbc|bmp|x-ray|ct|mri|usg)\b/.test(lc)) c.push("investigation");
  if (c.length === 0) c.push("medical-knowledge");
  const mcpServers = mcpRegistry.listAll().filter((s) => s.status === "CONNECTED" || s.status === "CONFIGURED").map((s) => s.id);
  return { useVector: true, useMcp: mcpServers.length > 0, categories: c, mcpServers };
}

async function retrieveVector(query: string, categories: string[], topK = 4): Promise<RagSource[]> {
  const results: RagSource[] = [];
  for (const cat of [...categories, undefined]) {
    for (const h of vectorStore.search(query, topK, cat)) {
      const id = h.id + "#" + h.chunkIndex;
      if (results.find((r) => r.id === id)) continue;
      results.push({ type: "vector", id, title: h.title, snippet: h.text.slice(0, 600), evidenceLevel: h.evidenceLevel, source: h.source });
    }
  }
  return results.slice(0, 8);
}

async function retrieveMcp(query: string, servers: string[]): Promise<RagSource[]> {
  const results: RagSource[] = [];
  for (const sid of servers.slice(0, 3)) {
    try {
      const cfg = mcpRegistry.getConfig(sid);
      if (cfg === undefined) continue;
      const endpoint = cfg.endpoint;
      const out = await callMcpTool(endpoint, "search", { query }, 8000);
      if (out.ok && out.result) {
        const text = typeof out.result === "string" ? out.result : JSON.stringify(out.result);
        results.push({ type: "mcp-resource", id: sid, snippet: text.slice(0, 800), source: endpoint });
      }
    } catch { /* failure-isolated */ }
  }
  return results;
}

async function evaluateSufficiency(query: string, context: string): Promise<{ sufficient: boolean; reason: string; reformulation?: string }> {
  const result = await centralAiChat({
    agent: "rag-evaluator", clinical: true,
    messages: [{ role: "user", content: "Question: " + query + "\n\nRetrieved context:\n" + (context || "(none)") + "\n\nDoes the retrieved context contain sufficient information to answer the question accurately? Reply with JSON: {\"sufficient\": true/false, \"reason\": \"...\", \"reformulation\": \"better search query if insufficient, or null if sufficient\"}" }],
    max_tokens: 300, temperature: 0.2,
  });
  const text = chatText(result);
  try {
    const p = JSON.parse(text) as { sufficient: boolean; reason: string; reformulation?: string };
    return { sufficient: p.sufficient, reason: p.reason, reformulation: p.reformulation };
  } catch (e) {
    return { sufficient: context.length > 200, reason: "parse fallback" };
  }
}

async function synthesize(query: string, sources: RagSource[]): Promise<{ answer: string; answeredBy: "freellmapi" | "ollama" | "none" }> {
  if (sources.length === 0) return { answer: RAG_ABSTENTION_SENTENCE, answeredBy: "none" };
  const parts: string[] = [];
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    parts.push("[" + (i + 1) + "] " + s.type + (s.title ? ": " + s.title : "") + "\n" + s.snippet);
  }
  const srcList = parts.join("\n\n");
  const result = await centralAiChat({
    agent: "rag-synthesizer", clinical: true,
    messages: [{ role: "user", content: "You are Astra AI clinical decision support. Answer using ONLY the provided sources. If insufficient, say so. Cite as [1], [2], etc.\n\nQuestion: " + query + "\n\nSources:\n" + (srcList || "(none)") }],
    max_tokens: 800, temperature: 0.2,
  });
  return { answer: chatText(result), answeredBy: result.service ?? "none" };
}

export function citationIntegrity(answer: string, sourceCount: number): { cited: number[]; invalid: number[]; sourceCount: number } {
  const cited = [...answer.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1])).filter((value, index, all) => all.indexOf(value) === index).sort((a, b) => a - b);
  return { cited, invalid: cited.filter((value) => value < 1 || value > sourceCount), sourceCount };
}

export async function runAgenticRag(query: string): Promise<AgenticRagResult> {
  const steps: RagStep[] = []; const trace: string[] = []; const allSources: RagSource[] = [];
  let cycleCount = 0; let sufficient = false;
  const routing = routeQuery(query);
  steps.push({ phase: "route", detail: "categories=[" + routing.categories.join(",") + "] mcp=" + routing.useMcp });
  trace.push("Routing: " + routing.categories.join(", "));
  let currentQuery = query;
  for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
    cycleCount = cycle;
    const vectorHits = routing.useVector ? await retrieveVector(currentQuery, routing.categories) : [];
    const mcpHits = routing.useMcp ? await retrieveMcp(currentQuery, routing.mcpServers) : [];
    for (const s of [...vectorHits, ...mcpHits]) {
      if (allSources.find((e) => e.snippet === s.snippet)) continue;
      allSources.push(s);
    }
    steps.push({ phase: "retrieve", detail: "cycle " + cycle + ": " + (vectorHits.length + mcpHits.length) + " hits" });
    trace.push("Cycle " + cycle + ": " + allSources.length + " total sources");
    if (allSources.length === 0) { steps.push({ phase: "evaluate", detail: "no sources" }); break; }
    const ctx = allSources.map((s) => s.snippet).join("\n---\n");
    const ev = await evaluateSufficiency(query, ctx);
    steps.push({ phase: "evaluate", detail: "sufficient=" + ev.sufficient + ": " + ev.reason });
    trace.push("Sufficiency: " + ev.sufficient + " - " + ev.reason);
    if (ev.sufficient) { sufficient = true; break; }
    if (cycle < MAX_CYCLES) {
      currentQuery = ev.reformulation || (query + " clinical guidelines evidence");
      steps.push({ phase: "reformulate", detail: currentQuery });
    }
  }
  const synthesized = await synthesize(query, allSources);
  let answer = synthesized.answer;
  const citations = citationIntegrity(answer, allSources.length);
  const citationValid = allSources.length === 0 || (citations.cited.length > 0 && citations.invalid.length === 0);
  if (!citationValid) {
    answer = RAG_ABSTENTION_SENTENCE;
    sufficient = false;
  }
  steps.push({ phase: "synthesize", detail: "from " + allSources.length + " sources" });
  trace.push("Synthesized from " + allSources.length + " sources");
  return { answer, sources: allSources, steps, cycleCount, sufficient, trace, citationIntegrity: { ...citations, valid: citationValid }, answeredBy: synthesized.answeredBy };
}

export function ingestDocument(doc: RagDocument): void { vectorStore.add(doc); }
export function getRagStats(): { documents: number; chunks: number; categories: string[] } {
  return { documents: vectorStore.size, chunks: vectorStore.chunkCount, categories: vectorStore.categories() };
}
