import { streamChat } from "./llm";
import type { ConnectionSettings } from "./types";

/**
 * Voice/typed-dictation → structured OP registration.
 * Two paths: a local regex/heuristic parser (always available) and an
 * "AI extract" path through FreeLLMAPI (or local Ollama) that returns JSON.
 */

export interface RegistrationFormData {
  name: string;
  age: string;
  gender: string;
  phone: string;
  email: string;
  address: string;
  department: string;
  doctor: string;
  complaint: string;
  mode: "UPI" | "Card" | "Cash";
  aadhaar: string;
  occupation: string;
  mlc: boolean;
}

export const emptyRegistration: RegistrationFormData = {
  name: "",
  age: "",
  gender: "",
  phone: "",
  email: "",
  address: "",
  department: "",
  doctor: "",
  complaint: "",
  mode: "UPI",
  aadhaar: "",
  occupation: "",
  mlc: false,
};

const DEPT_KEYWORDS: [RegExp, string][] = [
  [/\b(bone|fracture|joint|knee|back pain|ortho)\b/i, "Orthopaedics"],
  [/\b(child|baby|kid|paediatric|infant)\b/i, "Paediatrics"],
  [/\b(heart|chest pain|bp|blood pressure|cardio)\b/i, "Cardiology"],
  [/\b(skin|rash|itching|derma)\b/i, "Dermatology"],
  [/\b(pregnan|delivery|gynae|period|obg)\b/i, "OBG"],
  [/\b(eye|vision|cataract)\b/i, "Ophthalmology"],
  [/\b(ear|nose|throat|ent|sinus)\b/i, "ENT"],
  [/\b(dental|tooth|teeth)\b/i, "Dental"],
  [/\b(fever|cough|cold|weakness|diabet|sugar|gastric|stomach|vomit|loose motion|body ache)\b/i, "General Medicine"],
];

const COMPLAINT_KEYWORDS =
  /\b(fever|cough|cold|pain|ache|weakness|vomit|loose motion|diarrhoea|rash|swelling|breathless|dizzy|headache|injury|cut|burn|diabet|sugar|bp|gastric|constipation|sore throat|ear pain|tooth)\b/i;

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
    .trim();
}

/** Local heuristic parser — always runs, no network needed. */
export function parseTranscriptLocal(raw: string): Partial<RegistrationFormData> {
  const text = raw.replace(/\s+/g, " ").trim();
  const out: Partial<RegistrationFormData> = {};

  // name — "name is X" / "my name is X" / "patient X" / "naam X"
  const nameM = text.match(/(?:my name is|name is|patient name is|patient|naam)\s+([a-zA-Z][a-zA-Z .]{1,38})/i);
  if (nameM) {
    let n = nameM[1];
    // cut trailing clause keywords
    n = n.split(/\b(?:age|aged|year|phone|mobile|from|village|address|male|female|having|complain|suffering)\b/i)[0];
    n = n.replace(/[.,]+$/, "").trim();
    if (n.length >= 2) out.name = titleCase(n);
  }

  // age
  const ageM =
    text.match(/(?:age|aged)\s*(?:is|of)?\s*(\d{1,3})/i) ??
    text.match(/(\d{1,3})\s*(?:years?|yrs?|sal)\s*(?:old|ka|ki)?/i);
  if (ageM) out.age = ageM[1];

  // gender
  if (/\bfemale\b|\baurat\b|\blady\b/i.test(text)) out.gender = "Female";
  else if (/\bmale\b|\bmard\b|\bboy\b/i.test(text)) out.gender = "Male";

  // phone — Indian 10-digit
  const phoneM = text.match(/\b([6-9]\d{9})\b/);
  if (phoneM) out.phone = phoneM[1];

  // address / village
  const addrM = text.match(/(?:from|village|address|gaon|town)\s+([a-zA-Z][a-zA-Z ]{1,30})/i);
  if (addrM) {
    let a = addrM[1].split(/\b(?:having|complain|suffering|age|phone|male|female|department|dr\b)/i)[0];
    a = a.replace(/[.,]+$/, "").trim();
    if (a.length >= 2) out.address = titleCase(a);
  }

  // department
  for (const [re, dept] of DEPT_KEYWORDS) {
    if (re.test(text)) { out.department = dept; break; }
  }
  if (!out.department) out.department = "General Medicine";

  // doctor
  const drM = text.match(/\bdr\.?\s*([a-z]+(?:\s+[a-z]+)?)/i);
  if (drM) out.doctor = `Dr. ${titleCase(drM[1])}`;

  // complaint — sentence fragment(s) containing symptom keywords
  const frags = text.split(/[.,;]/).map((f) => f.trim()).filter((f) => COMPLAINT_KEYWORDS.test(f));
  if (frags.length) {
    out.complaint = frags
      .join("; ")
      .replace(/\b(?:patient|name is|my name is|having|suffering from|complain(?:t)? of)\s*[a-zA-Z .]*?/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    if (out.complaint.length < 3) out.complaint = frags.join("; ");
  }

  // payment mode
  if (/\bupi\b|gpay|phonepe|paytm/i.test(text)) out.mode = "UPI";
  else if (/\bcard\b|swipe|debit|credit/i.test(text)) out.mode = "Card";
  else if (/\bcash\b|paisa|note/i.test(text)) out.mode = "Cash";

  return out;
}

/** AI extraction — FreeLLMAPI if a Unified Key is saved, else local Ollama. */
export async function aiExtractRegistration(
  transcript: string,
  settings: ConnectionSettings
): Promise<{ data: Partial<RegistrationFormData>; engine: string }> {
  // Registration dictation contains patient names and complaints. It stays on local Ollama.
  const provider = "ollama" as const;
  const prompt = [
    "Extract OP registration fields from this reception dictation. Reply with ONLY a JSON object,",
    'keys: name, age, gender, phone, address, department, doctor, complaint, mode.',
    'mode must be one of "UPI","Card","Cash". Use "" for unknown fields. No prose.',
    `Dictation: """${transcript}"""`,
  ].join(" ");

  let buf = "";
  await streamChat({
    provider,
    baseUrl: settings.ollamaUrl,
    apiKey: "",
    model: "llama3.2:3b",
    messages: [
      { role: "system", content: "You are a precise hospital reception data-extraction assistant. Output JSON only." },
      { role: "user", content: prompt },
    ],
    onToken: (t) => { buf += t; },
  });

  const jsonM = buf.match(/\{[\s\S]*\}/);
  if (!jsonM) throw new Error("AI returned no JSON — try again or edit fields manually.");
  const parsed = JSON.parse(jsonM[0]) as Record<string, unknown>;
  const str = (k: string) => (typeof parsed[k] === "string" || typeof parsed[k] === "number" ? String(parsed[k]) : undefined);
  const mode = str("mode");
  const data: Partial<RegistrationFormData> = {
    name: str("name") || undefined,
    age: str("age") || undefined,
    gender: str("gender") || undefined,
    phone: str("phone") || undefined,
    address: str("address") || undefined,
    department: str("department") || undefined,
    doctor: str("doctor") || undefined,
    complaint: str("complaint") || undefined,
    mode: mode === "Card" || mode === "Cash" ? mode : mode === "UPI" ? "UPI" : undefined,
  };
  return { data, engine: "ollama" };
}

/** Consultation fee schedule (₹) by department. */
export function consultFee(department: string): number {
  const table: Record<string, number> = {
    "General Medicine": 800,
    Orthopaedics: 1000,
    Paediatrics: 900,
    Cardiology: 1200,
    Dermatology: 900,
    OBG: 1000,
    Ophthalmology: 800,
    ENT: 800,
    Dental: 700,
  };
  return table[department] ?? 800;
}
