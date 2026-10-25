export type DataClass = "PUBLIC" | "INTERNAL" | "SENSITIVE" | "CLINICAL" | "HIGHLY_SENSITIVE";
export type AutonomyLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface ContextEnvelope {
  request_id: string;
  user_role: string;
  hospital_context: string;
  patient_context: { uhid?: string; included: boolean };
  clinical_context: string;
  task_type: string;
  safety_level: AutonomyLevel;
  required_capabilities: string[];
  allowed_tools: string[];
  model_policy: string;
  evidence_requirements: string;
  approval_required: boolean;
  data_class: DataClass;
}

const ID_RE = /\b(UHID[-\s]?\d+|P\d{3,}|\+\d{10,}|[A-Z]{5}\d{4}[A-Z]\d{3})\b/gi;

export function classifyData(text: string): DataClass {
  if (/\b(uhid|inpatient|icu|diagnosis|medication|lab result)\b/i.test(text) && ID_RE.test(text)) return "HIGHLY_SENSITIVE";
  if (/\b(diagnosis|medication|allergy|spo2|creatinine|ct scan)\b/i.test(text)) return "CLINICAL";
  if (/\b(patient|ward|bed)\b/i.test(text)) return "SENSITIVE";
  return "INTERNAL";
}

export function redactForExternal(text: string): string {
  return text.replace(ID_RE, "[REDACTED_ID]");
}

export function allowExternalRoute(dataClass: DataClass, destination: "freellmapi" | "omniroute" | "ollama"): boolean {
  if (destination === "ollama") return true;
  if (dataClass === "HIGHLY_SENSITIVE") return false;
  return true;
}

export function autonomyForTask(taskType: string): AutonomyLevel {
  const t = taskType.toLowerCase();
  if (/\b(observe|status|census)\b/.test(t)) return 0;
  if (/\b(suggest|differential|evidence)\b/.test(t)) return 1;
  if (/\b(draft|document)\b/.test(t)) return 2;
  if (/\b(recommend|treat|plan)\b/.test(t)) return 3;
  if (/\b(order|prescribe|admit|discharge)\b/.test(t)) return 4;
  return 1;
}

export function buildEnvelope(opts: {
  requestId: string;
  role?: string;
  input: string;
  taskType: string;
}): ContextEnvelope {
  const dataClass = classifyData(opts.input);
  const safety = autonomyForTask(opts.taskType);
  return {
    request_id: opts.requestId,
    user_role: opts.role ?? "doctor",
    hospital_context: "Astra AI Hospital OS",
    patient_context: { included: false },
    clinical_context: opts.input.slice(0, 500),
    task_type: opts.taskType,
    safety_level: safety,
    required_capabilities: ["clinical-reasoning"],
    allowed_tools: [],
    model_policy: "adapter-primary-freellmapi",
    evidence_requirements: "cite when available; do not invent PMIDs",
    approval_required: safety >= 3,
    data_class: dataClass,
  };
}
