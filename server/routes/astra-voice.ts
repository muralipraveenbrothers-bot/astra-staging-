import type { Express, Request, Response } from "express";
import { AstraVoiceGuardian } from "../ai/VoiceGuardian";
import { astraTools } from "../ai/tools";
import { detectLanguage } from "../voice/langDetector";
import { authenticate } from "../rbac";

// Never embed provider credentials in source. When GROQ_API_KEY is absent the
// request continues through Astra's local Ollama and role-safe fallback paths.
const GROQ_API_KEY = process.env.GROQ_API_KEY?.trim();

export async function processAstraVoiceChat(
  prompt: string,
  dashboardRole: string,
  patientContext?: any
) {
  const detected = detectLanguage(prompt, "en-IN");
  const lang = detected.lang;

  // Deterministic wake response keeps the first interaction fast and natural,
  // even when every model provider is offline.
  if (/^(?:hi|hello|hey)\s+astra\b|^(?:హాయ్|హలో)\s+ఆస్ట్రా|^(?:हाय|हेलो)\s+एस्ट्रा/i.test(prompt.trim())) {
    const text = lang.startsWith("te")
      ? "హాయ్, నేను ఆస్ట్రా. మీకు ఎలా సహాయం చేయాలి?"
      : lang.startsWith("hi")
        ? "नमस्ते, मैं एस्ट्रा हूँ। मैं आपकी कैसे मदद करूँ?"
        : "Hi, I’m Astra. How can I help you?";
    return { text, language: lang, intent: "WAKE" };
  }

  // 1. Voice Guardian Safety Check
  const guardian = AstraVoiceGuardian.check(prompt, dashboardRole);
  if (!guardian.isSafe) {
    return {
      text: guardian.escalationMessage || "Safety override triggered.",
      language: lang,
      intent: guardian.intent
    };
  }

  // 2. R.O.C.D Prompt Construction
  const patientSnippet = patientContext
    ? `Active Patient: ${patientContext.name || "Unknown"} (UHID: ${patientContext.uhid || "N/A"})`
    : "";

  let rolePrompt = "You are an elite, highly professional hospital assistant for Astra OS.";
  if (dashboardRole === "reception") {
    rolePrompt = "You are a professional hospital receptionist. Focus on booking appointments, answering FAQs, and guiding patients. Do not provide clinical advice.";
  } else if (dashboardRole === "doctor") {
    rolePrompt = "You are a clinical AI Copilot assisting a doctor. Provide concise data, lab trends, and clinical reasoning based on the EMR.";
  } else if (dashboardRole === "pharmacy") {
    rolePrompt = "You are a pharmacy AI assistant. Focus on pending orders, inventory, and drug safety.";
  }

  const systemPrompt = `
### ROLE
${rolePrompt}

### CONTEXT & DATA (R.A.G.)
- You speak fluently in English, Telugu, Hindi, and Tamil based on the user's language.
- The user is currently communicating in: ${lang}. 
${patientSnippet ? `- ${patientSnippet}` : ""}

### TASK & OBJECTIVE
Your main objective is to assist the user seamlessly. If they ask to book an appointment, check lab results, or view pending orders, use the provided tools to fetch real data. DO NOT invent or hallucinate data.

### SPECIFIC INSTRUCTIONS & GUARDRAILS
1. STREAM OF CONSCIOUSNESS HANDLING: If the user speaks in a messy way, actively listen, reconstruct what they meant, and answer calmly.
2. CONSTRAINTS: Keep responses short (under 2-3 sentences) to avoid overwhelming the listener. If asked something outside your role, respectfully guide them to the correct department.
3. PERSONALITY: Use a conversational, warm, and natural tone. Avoid rigid robot-like responses.
`;

  // 3. LLM Call with Tool Logic (Simulated for this MVP)
  // In a real environment, we'd use OpenAI function calling or Groq tool calling API.
  // For now, we simulate tool routing based on Guardian intent if it's APPOINTMENT or CLINICAL.
  
  if (guardian.intent === "APPOINTMENT") {
    const result = astraTools.create_appointment.execute({ doctor: "Dr. Murali", time: "11:30" });
    return { text: result + " Would you like me to notify them?", language: lang, intent: guardian.intent };
  } else if (guardian.intent === "CLINICAL" && dashboardRole === "doctor") {
    const result = astraTools.get_latest_lab_result.execute({ bed: "3", testName: prompt });
    return { text: result + " Should I open the full trend screen?", language: lang, intent: guardian.intent };
  } else if (dashboardRole === "pharmacy" && prompt.includes("order")) {
    const result = astraTools.get_pending_orders.execute({ bed: "6" });
    return { text: result + " Should I open them?", language: lang, intent: guardian.intent };
  }

  // Primary: Groq API
  if (GROQ_API_KEY) try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama3-8b-8192",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 300,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (res.ok) {
      const data = (await res.json()) as any;
      const txt = data.choices?.[0]?.message?.content?.trim();
      if (txt) return { text: txt, language: lang, intent: guardian.intent };
    }
  } catch (err) {
    console.warn("[ASTRA VOICE AGENT] Groq failed, trying Ollama local...");
  }

  // Fallback: Local Ollama (llama3.2:3b)
  try {
    const ollamaRes = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.2:3b",
        prompt: `${systemPrompt}\n\nUser: ${prompt}\nAssistant:`,
        stream: false,
        options: { temperature: 0.3, num_predict: 200 }
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (ollamaRes.ok) {
      const data = (await ollamaRes.json()) as any;
      const txt = (data.response || "").trim();
      if (txt) return { text: txt, language: lang, intent: guardian.intent };
    }
  } catch (err) {
    console.warn("[ASTRA VOICE AGENT] Ollama also unavailable:", err);
  }

  // Last resort: smart role-based static responses
  const fallbacks: Record<string, string> = {
    reception: "I'm here at the Reception desk. How can I help you today? I can assist with appointments, directions, and general inquiries.",
    doctor: "I am your clinical Copilot. Please describe the patient situation and I will assist with reasoning, labs, and next steps.",
    pharmacy: "Pharmacy assistant active. I can help with pending orders, drug interactions, and inventory status.",
    counselor: "I'm here with you. Take a deep breath. How can I support you or the patient right now?",
    ward: "Ward monitoring is active. Please describe the situation and I will help with vitals, alerts, and nursing tasks.",
    lab: "Lab dashboard is ready. I can help with pending tests, result trends, and critical value alerts.",
    billing: "Billing assistance is active. I can help with invoice queries, insurance, and payment statuses.",
  };

  return {
    text: fallbacks[dashboardRole] || "I am Astra, your hospital AI assistant. How can I help you?",
    language: lang,
    intent: guardian.intent || "GENERAL"
  };
}

export function registerAstraVoiceRoutes(app: Express) {
  app.post("/api/astra-voice-agent", authenticate, async (req: Request, res: Response) => {
    try {
      const { message, dashboardRole, patientContext } = req.body;
      const result = await processAstraVoiceChat(message, dashboardRole || "doctor", patientContext);
      res.json({ ...result, safety: { decisionSupportOnly: true, doctorConfirmationRequiredForClinicalActions: true, voiceTranscriptIsNotIdentityProof: true, partialTranscriptMustNotTriggerOrders: true } });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal Server Error", text: "Something went wrong." });
    }
  });
}
