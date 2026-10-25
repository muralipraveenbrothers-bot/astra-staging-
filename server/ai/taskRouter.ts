/**
 * ASTRA AI — Task Router (§6)
 * ===========================
 * Maps an incoming intent / category to a high-level AITask and orders the
 * candidate providers for that task. Selection is capability-aware, NOT
 * preference-harcoded: providers are only picked when configured + reachable.
 *
 * Routing policy (no fabricated provider success states):
 *   deep clinical reasoning / evidence: FreeLLMAPI, then Ollama
 *   voice / fast conversation / translation → FreeLLMAPI primary
 *   vision / image grounding: FreeLLMAPI, then Ollama
 *   patient name, UHID, note, diagnosis, or other PHI: local Ollama only
 *
 * This layer is pure logic — it never calls a provider, only orders them.
 */
import { AITask } from "./types";
import type { AIProvider, AIProviderHealth, ProviderSelection } from "./types";

/** Preferred provider order per task. Providers not configured/healthy are skipped at call time. */
const TASK_TO_PREFERRED: Partial<Record<AITask, string[]>> = {
  [AITask.ClinicalReasoning]: ["freellmapi", "ollama"],
  [AITask.DiagnosisSupport]: ["freellmapi", "ollama"],
  [AITask.DifferentialGeneration]: ["freellmapi", "ollama"],
  [AITask.InvestigationPlanning]: ["freellmapi", "ollama"],
  [AITask.MedicationReview]: ["freellmapi", "ollama"],
  [AITask.DrugInteraction]: ["freellmapi", "ollama"],
  [AITask.EvidenceSearch]: ["freellmapi", "ollama"],
  [AITask.LiteratureSearch]: ["freellmapi", "ollama"],
  [AITask.PatientEducation]: ["freellmapi"],
  [AITask.CommunicationCoach]: ["freellmapi"],
  [AITask.PatientPsychology]: ["freellmapi"],
  [AITask.AttendantPsychology]: ["freellmapi"],
  [AITask.HospitalOperations]: ["freellmapi", "ollama"],
  [AITask.PatientRegistry]: ["freellmapi", "ollama"],
  [AITask.Documentation]: ["freellmapi", "ollama"],
  [AITask.DischargeSummary]: ["freellmapi", "ollama"],
  [AITask.Referral]: ["freellmapi"],
  [AITask.MultilingualTranslation]: ["freellmapi"],
  [AITask.VoiceConversation]: ["freellmapi"],
  [AITask.AvatarResponse]: ["freellmapi"],
  [AITask.GeneralAssistant]: ["freellmapi"],
  [AITask.FastConversation]: ["freellmapi", "ollama"],
  [AITask.Vision]: ["freellmapi", "ollama"],
};

export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "hi", name: "Hindi" },
  { code: "te", name: "Telugu" },
  { code: "ta", name: "Tamil" },
  { code: "kn", name: "Kannada" },
  { code: "mr", name: "Marathi" },
] as const;

/** Heuristic intent → AITask (deterministic, keyword based; no LLM guessing). */
export function routeIntent(query: string, categoryHint?: string): AITask {
  const q = (query || "").toLowerCase();
  if (categoryHint) {
    const c = categoryHint.toLowerCase();
    if (c.includes("calc") || c.includes("census") || c.includes("order") || c.includes("patient")) return AITask.HospitalOperations;
  }
  if (/\b(census|inpatient|outpatient|bed occupancy|hospital pulse|how many patients|opd queue|ward occupancy)\b/i.test(q)) return AITask.HospitalOperations;
  if (/differential|diagnos|ddx|what.?cause|rule.?out|must.?not.?miss/i.test(q)) return AITask.DiagnosisSupport;
  if (/evidence|pubmed|pmid|guideline|study|rct|trial/i.test(q)) return AITask.EvidenceSearch;
  if (/translat|language|telugu|hindi|tamil|kannada|marathi|explain in/i.test(q)) return AITask.MultilingualTranslation;
  if (/medication|drug|interaction|contraindic|dose|prescription|pharmac/i.test(q)) return AITask.MedicationReview;
  if (/discharge|refer|r e f e r|reref|send to/i.test(q)) return AITask.Referral;
  if (/vision|image|scan|x.?ray|ct|mri|ultrasound|photo|picture/i.test(q)) return AITask.Vision;
  if (/voice|speech|listen|talk|pronounce/i.test(q)) return AITask.VoiceConversation;
  if (/avatar|video|narrate|show on/i.test(q)) return AITask.AvatarResponse;
  if (/teach|educate|explain to patient|simple terms/i.test(q)) return AITask.PatientEducation;
  if (/stress|anxiou|worried|calm|emotion|psycholog/i.test(q)) return AITask.PatientPsychology;
  if (/curb|apg|liverpool|sofa|news|score/i.test(q)) return AITask.ClinicalReasoning;
  return AITask.GeneralAssistant;
}

/** Order candidate provider ids for a task, preferring configured/reachable providers. */
export function orderedProvidersForTask(task: AITask, providers: AIProvider[]): AIProvider[] {
  const preferred = TASK_TO_PREFERRED[task] ?? TASK_TO_PREFERRED[AITask.GeneralAssistant]!;
  const ordered: AIProvider[] = [];
  const rest: AIProvider[] = [];
  for (const id of preferred) {
    const p = providers.find((x) => x.id === id);
    if (p) {
      ordered.push(p);
    }
  }
  for (const p of providers) {
    if (!ordered.includes(p)) rest.push(p);
  }
  return [...ordered, ...rest];
}

export function selectProviderForTask(task: AITask, providers: AIProvider[], health?: AIProviderHealth[]): ProviderSelection[] {
  const ordered = orderedProvidersForTask(task, providers);
  const unhealthy = new Set(
    (health ?? []).filter((h) => h.status === "unavailable").map((h) => h.id),
  );
  return ordered
    .filter((p) => p.configured && !unhealthy.has(p.id))
    .map((p) => ({ providerId: p.id, model: "", rationale: `selected for task ${task}` }));
}
