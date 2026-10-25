/**
 * ASTRA SAARATHI — Brain routes (formerly "jarvis" compatibility routes).
 * ========================================================================
 * - Brain ID: SAARATHI (primary interaction brain). "Jarvis" identifiers remain
 *   ONLY as legacy URL aliases for older clients — never as the spoken identity.
 * - POST /api/astra-clinical-ai  → Saarathi turn (local intent brain first,
 *   then the multi-provider Astra gateway with failover).
 * - POST /api/jarvis/chat        → same handler, legacy alias.
 * - GET  /api/jarvis/status      → live status (legacy path retained).
 *
 * LOCAL INTENT BRAIN
 * ------------------
 * Identity/system questions ("Who are you?", "Stop", "Help", …) resolve in
 * `resolveLocalIntent` BEFORE any network call. They must keep working with
 * zero internet and every LLM provider offline, and they must never spend a
 * cloud token answering "who are you?".
 *
 * VOICE PERSONAS (per department)
 * -------------------------------
 * Every dashboard gets its own Saarathi voice. The `voiceProfile`/`voiceboxProfile`
 * fields tell the client which Voicebox persona to speak with.
 */
import type { Express, Request, Response } from "express";
import { authenticate } from "../rbac";
import { detectLanguage } from "../voice/langDetector";
import { astraOrchestrator } from "../orchestrator";
import { classifyLocalIntent } from "../../src/astra/saarathi/intent/LocalIntentBrain";
import { toAstraLanguage, type AstraDashboard } from "../../src/astra/voice/roundTrip/contracts";

// Provider credentials must come from the server environment. Never embed a
// credential in source or ship one to the browser.
const GROQ_API_KEY = process.env.GROQ_API_KEY?.trim();

const LANG_DISPLAY_NAMES: Record<string, string> = {
  "te-IN": "తెలుగు (Telugu)",
  "hi-IN": "हिंदी (Hindi)",
  "ta-IN": "தமிழ் (Tamil)",
  "kn-IN": "ಕನ್ನಡ (Kannada)",
  "en-IN": "English",
};

/** Per-department Saarathi voice personas (Voicebox profiles). */
export const SAARATHI_VOICE_PERSONAS: Record<string, { voiceProfile: string; voiceboxProfile: string }> = {
  doctor: { voiceProfile: "saarathi-prime", voiceboxProfile: "SAARATHI PRIME" },
  ceo: { voiceProfile: "saarathi-prime", voiceboxProfile: "SAARATHI PRIME" },
  reception: { voiceProfile: "saarathi-welcome", voiceboxProfile: "SAARATHI WELCOME" },
  ward: { voiceProfile: "saarathi-ward", voiceboxProfile: "SAARATHI WARD" },
  pharmacy: { voiceProfile: "saarathi-medsafe", voiceboxProfile: "SAARATHI MEDSAFE" },
  ot: { voiceProfile: "saarathi-theatre", voiceboxProfile: "SAARATHI THEATRE" },
  lab: { voiceProfile: "saarathi-lab", voiceboxProfile: "SAARATHI LAB" },
  radiology: { voiceProfile: "saarathi-vision", voiceboxProfile: "SAARATHI VISION" },
  billing: { voiceProfile: "saarathi-ledger", voiceboxProfile: "SAARATHI LEDGER" },
  general: { voiceProfile: "saarathi-prime", voiceboxProfile: "SAARATHI PRIME" },
};

function personaFor(mode?: string): { voiceProfile: string; voiceboxProfile: string } {
  const key = String(mode ?? "").toLowerCase();
  return SAARATHI_VOICE_PERSONAS[key] ?? SAARATHI_VOICE_PERSONAS.general;
}

const WORKSPACE_OF_MODE: Record<string, AstraDashboard> = {
  doctor: "doctor", reception: "reception", pharmacy: "pharmacy", lab: "lab",
  radiology: "radiology", billing: "billing", ward: "ward", ot: "ot", general: "general",
};

export async function processJarvisChat(
  prompt: string,
  explicitLang?: string,
  mode?: string,
  patientContext?: any
) {
  const detected = detectLanguage(prompt, explicitLang || "en-IN");
  const lang = detected.lang; // "en-IN", "te-IN", "hi-IN", "ta-IN", "kn-IN"
  const shortLang = lang.split("-")[0];
  const persona = personaFor(mode);

  // ---- 0. SAARATHI LOCAL INTENT BRAIN (shared, canonical implementation) --
  // Resolves identity/help/stop/status/dashboard intents BEFORE any network
  // call. Must work with zero internet and every LLM provider offline.
  const local = classifyLocalIntent(prompt, {
    workspace: WORKSPACE_OF_MODE[String(mode ?? "").toLowerCase()] ?? "general",
    role: "doctor",
    language: toAstraLanguage(lang),
  });
  if (local) {
    return {
      ok: true,
      reply: local.reply,
      answer: local.reply,
      intent: local.intent,
      brain: "SAARATHI-LOCAL",
      provider: "SAARATHI-LOCAL",
      detectedLanguage: shortLang,
      fullLanguage: lang,
      languageName: LANG_DISPLAY_NAMES[lang] || "English",
      voiceProfile: persona.voiceProfile,
      voiceboxProfile: persona.voiceboxProfile,
    };
  }

  const langGuidance = lang.startsWith("te")
    ? "The user is communicating in TELUGU. Answer fluently, politely, and naturally in TELUGU script."
    : lang.startsWith("hi")
    ? "The user is communicating in HINDI. Answer fluently, politely, and naturally in HINDI (Devanagari script)."
    : lang.startsWith("ta")
    ? "The user is communicating in TAMIL. Answer fluently and politely in TAMIL."
    : lang.startsWith("kn")
    ? "The user is communicating in KANNADA. Answer fluently and politely in KANNADA."
    : "The user is communicating in ENGLISH. Respond concisely, politely, and intelligently as Saarathi.";

  const patientSnippet = patientContext
    ? `Active Patient: ${patientContext.name || "Patient"} (UHID: ${patientContext.uhid || "N/A"}), Age: ${patientContext.age || "Unknown"}, Diagnosis: ${patientContext.diagnosis || "General"}.`
    : "";

  const systemPrompt = `You are Saarathi, the ultra-fast, highly intelligent, and compassionate AI assistant for PM Brothers Multispeciality Hospital and Astra OS.
${langGuidance}
${patientSnippet}
Guidelines:
- Keep the spoken response concise (2-4 clear sentences) and natural to listen to aloud.
- Assist with patient questions, clinical reasoning, hospital departments, triage, appointments, and navigation.
- Avoid markdown tables or complex symbols that sound awkward when spoken aloud.`;

  let replyText = "";
  let providerUsed = "";

  // ---- 1. Optional fast cloud path (Groq) ----------------------------------
  if (GROQ_API_KEY) try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      },
      body: JSON.stringify({
        model: "qwen/qwen3.8-27b",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 350,
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (res.ok) {
      const data = (await res.json()) as any;
      replyText = data.choices?.[0]?.message?.content?.trim() || "";
      if (replyText) providerUsed = "groq-cloud";
    }
  } catch (err) {
    console.warn("[SAARATHI] Groq query failed, falling back to central orchestrator:", err);
  }

  // ---- 2. Astra multi-provider orchestrator (FreeLLMAPI → OmniRoute →
  //         Ollama → Gemini via the gateway registry, circuit-breaker aware).
  //         An empty upstream answer NEVER surfaces — the chain keeps walking.
  if (!replyText) {
    try {
      const fb = await astraOrchestrator.handle({
        query: prompt,
        language: lang,
        mode: (mode as any) || "doctor",
        user: { userId: "saarathi", name: "Saarathi User", role: "doctor" } as any,
        patientContext,
      });
      if (fb.text && fb.text.trim()) {
        replyText = fb.text.trim();
        providerUsed = fb.provider;
      }
    } catch (e) {
      console.warn("[SAARATHI] orchestrator failed:", e);
    }
  }

  // ---- 3. Honest degraded answer — never fabricated clinical content -------
  if (!replyText) {
    replyText = shortLang === "te"
      ? "సారథి రీజనింగ్ సర్వీసెస్ ప్రస్తుతం అందుబాటులో లేవు. హాస్పిటల్ కంట్రోల్స్ సాధారణంగా పనిచేస్తూనే ఉంటాయి."
      : shortLang === "hi"
      ? "सारथी reasoning services अभी उपलब्ध नहीं हैं। hospital controls सामान्य रूप से काम करते रहेंगे।"
      : "Saarathi's reasoning services are temporarily unavailable. Hospital controls remain operational.";
    providerUsed = "none-degraded";
  }

  return {
    ok: true,
    reply: replyText,
    answer: replyText,
    brain: providerUsed === "SAARATHI-LOCAL" ? "SAARATHI-LOCAL" : "SAARATHI",
    provider: providerUsed || "saarathi",
    detectedLanguage: shortLang,
    fullLanguage: lang,
    languageName: LANG_DISPLAY_NAMES[lang] || "English",
    voiceProfile: persona.voiceProfile,
    voiceboxProfile: persona.voiceboxProfile,
  };
}

export function registerJarvisRoutes(app: Express): void {
  // Main endpoint called by AstraCopilot frontend
  app.post("/api/astra-clinical-ai", authenticate, async (req: Request, res: Response) => {
    const query =
      typeof req.body?.message === "string"
        ? req.body.message
        : typeof req.body?.query === "string"
        ? req.body.query
        : "";

    if (!query.trim()) {
      res.status(400).json({ error: "MISSING_QUERY", reply: "Please provide a query for Saarathi." });
      return;
    }

    try {
      const result = await processJarvisChat(
        query,
        req.body?.language,
        req.body?.mode,
        req.body?.patientContext
      );
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "SAARATHI_ERROR", reply: "Saarathi is temporarily unavailable." });
    }
  });

  // Dedicated /api/jarvis/chat endpoint (legacy alias — same Saarathi brain)
  app.post("/api/jarvis/chat", authenticate, async (req: Request, res: Response) => {
    const query =
      typeof req.body?.message === "string"
        ? req.body.message
        : typeof req.body?.query === "string"
        ? req.body.query
        : "";

    if (!query.trim()) {
      res.status(400).json({ error: "MISSING_QUERY", reply: "Please provide a query for Saarathi." });
      return;
    }

    try {
      const result = await processJarvisChat(
        query,
        req.body?.language,
        req.body?.mode,
        req.body?.patientContext
      );
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "SAARATHI_ERROR", reply: "Saarathi is temporarily unavailable." });
    }
  });

  // Check Saarathi status (legacy path retained for existing clients).
  app.get("/api/jarvis/status", authenticate, async (_req: Request, res: Response) => {
    const voiceboxEndpoint = process.env.VOICEBOX_URL || "http://127.0.0.1:17493";
    let voiceboxReachable = false;
    let latencyMs: number | null = null;
    const started = Date.now();
    try {
      const probe = await fetch(`${voiceboxEndpoint}/health`, { signal: AbortSignal.timeout(1800) });
      voiceboxReachable = probe.ok;
      latencyMs = Date.now() - started;
    } catch {
      latencyMs = Date.now() - started;
    }
    res.json({
      status: voiceboxReachable ? "online" : "degraded",
      name: "SAARATHI",
      brain: "SAARATHI",
      voiceboxEndpoint,
      voiceboxReachable,
      latencyMs,
      voiceProfile: "SAARATHI PRIME",
      personas: SAARATHI_VOICE_PERSONAS,
      languagesSupported: ["English", "Telugu", "Hindi", "Tamil", "Kannada"],
      autoDetectEnabled: true,
    });
  });
}
