import { apiFetch } from "@/services/apiFetch";
import { speakSaarathi } from "@/astra/voice/providers/ttsPriority";
import { looksLikePhi } from "@/astra/voice/providers/phiGate";
import type { HumanMouth } from "@/astra/voice/providers/layaVoiceRoute";

export type EngineLabel = "Ollama" | "OmniRoute" | "FreeLLM" | "Voicebox" | "Gemini" | "Sarvam" | "OpenAI" | "none";

const ANSWERED: Record<string, EngineLabel> = {
  ollama: "Ollama",
  omniroute: "OmniRoute",
  freellmapi: "FreeLLM",
  none: "none",
};

export interface DoctorEngineInput {
  text: string;
  patientName?: string;
  uhid?: string;
  note?: string;
  diagnosis?: string;
}

export interface DoctorEngineDraft {
  agentId: string;
  localOnly: boolean;
  note: string;
}

export interface DoctorEngineTrace {
  privacy: "local" | "not-local";
  answeredBy: string;
  model: string;
  drafts: DoctorEngineDraft[];
}

export interface DoctorEngineAnswer {
  ok: boolean;
  engine: EngineLabel;
  text: string;
  model: string;
  localOnly: boolean;
  error?: string;
  drafts: DoctorEngineDraft[];
  trace: DoctorEngineTrace | null;
}

function asDrafts(value: unknown): DoctorEngineDraft[] {
  if (!Array.isArray(value)) return [];
  const drafts: DoctorEngineDraft[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as { agentId?: unknown; localOnly?: unknown; note?: unknown };
    if (typeof row.agentId !== "string" || typeof row.note !== "string") continue;
    drafts.push({ agentId: row.agentId, localOnly: row.localOnly === true, note: row.note });
  }
  return drafts;
}

/** Doctor Command OS and Doctor EMR share this route. Keys stay on the server. */
export async function askDoctorEngine(input: DoctorEngineInput): Promise<DoctorEngineAnswer> {
  const res = await apiFetch("/api/ai/doctor-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    answeredBy?: string;
    text?: string;
    model?: string;
    localOnly?: boolean;
    error?: string;
    drafts?: unknown;
    trace?: { privacy?: unknown; answeredBy?: unknown; model?: unknown; drafts?: unknown };
  };
  const drafts = asDrafts(data.trace?.drafts ?? data.drafts);
  const model = typeof data.model === "string" ? data.model : typeof data.trace?.model === "string" ? data.trace.model : "";
  const privacy = data.trace?.privacy === "local" || data.trace?.privacy === "not-local"
    ? data.trace.privacy
    : data.localOnly === true ? "local"
    : data.localOnly === false ? "not-local"
    : null;
  const localOnly = privacy === "local";
  return {
    ok: res.ok && data.ok === true,
    engine: ANSWERED[data.answeredBy ?? ""] ?? "none",
    text: typeof data.text === "string" ? data.text : "",
    model,
    localOnly,
    error: typeof data.error === "string" ? data.error : res.ok ? undefined : `HTTP ${res.status}`,
    drafts,
    trace: privacy ? {
      privacy,
      answeredBy: typeof data.answeredBy === "string" ? data.answeredBy : "none",
      model,
      drafts,
    } : null,
  };
}

export function voiceEngineLabel(provider: string | undefined): EngineLabel {
  if (provider === "voicebox-local") return "Voicebox";
  if (provider === "gemini-live") return "Gemini";
  if (provider === "sarvam") return "Sarvam";
  if (provider === "openai-live") return "OpenAI";
  return "none";
}

/**
 * Patient text is spoken only by local Voicebox.
 * A non-patient line such as "Ready" keeps the existing cloud-then-local cascade.
 */
export async function speakDoctorLine(text: string, patient: boolean): Promise<EngineLabel> {
  const body = text.trim();
  if (!body) return "none";
  const phi = patient || looksLikePhi(body);
  const mouths: HumanMouth[] = phi ? ["voicebox-local"] : ["sarvam", "gemini-live", "openai-live", "voicebox-local"];
  const result = await speakSaarathi({
    text: body,
    mouths,
    patientContext: phi ? { stayLocal: true } : undefined,
  });
  return voiceEngineLabel(result.provider);
}