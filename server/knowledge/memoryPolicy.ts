import fs from "fs";
import path from "path";
import { astraDataRoot } from "../services/env";

/** A–I memory stores. Patient truth is never copied into agent memory. */
export type StoreId = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I";

export const STORE_NAMES: Record<StoreId, string> = {
  A: "working",
  B: "conversation",
  C: "identity",
  D: "procedural",
  E: "clinical_knowledge",
  F: "hospital_knowledge",
  G: "patient_truth",
  H: "operational_truth",
  I: "audit",
};

const PATIENT_COPY_FORBIDDEN = new Set<StoreId>(["B", "C", "D", "E", "F"]);

function looksLikePatient(payload: unknown): boolean {
  if (payload == null) return false;
  const blob = typeof payload === "string" ? payload : JSON.stringify(payload);
  return /\b(uhid|mrn|aadhaar|creatinine|patient|phone|address)\b/i.test(blob);
}

/**
 * Agents may not write a patient record into conversation, identity, procedural,
 * clinical-knowledge or hospital-knowledge stores.
 */
export function canWrite(agent: string, store: StoreId, payload?: unknown): boolean {
  if (looksLikePatient(payload) && PATIENT_COPY_FORBIDDEN.has(store)) return false;
  if (store === "G" && agent !== "hims") return false;
  if ((store === "C" || store === "D" || store === "F") && agent !== "admin") return false;
  if (store === "I" && agent !== "system") return false;
  if (store === "E" && agent !== "admin" && agent !== "doctor") return false;
  return true;
}

export function canRead(agent: string, store: StoreId, dataClass: string): { ok: boolean; mode: "copy" | "reference" | "deny" } {
  if (store === "G") {
    const clinical = agent === "doctor" || agent === "nurse" || agent === "ward" || agent === "hims";
    if (dataClass === "PHI" && !clinical) return { ok: false, mode: "deny" };
    return { ok: true, mode: "reference" };
  }
  if (store === "H" && dataClass === "BILLING" && agent === "micro_astra") return { ok: false, mode: "deny" };
  return { ok: true, mode: "copy" };
}

/** Patient and price facts never fall back to model memory. */
export function answerSource(question: string): { store: StoreId | null; stores: StoreId[]; llm: false; found: boolean } {
  const q = question.toLowerCase();
  if (/creatinine|uhid|haemoglobin|hemoglobin|platelet|patient|latest\s+\w+\s+for/.test(q)) {
    return { store: "G", stores: ["G"], llm: false, found: true };
  }
  if (/charge|price|tariff|fee|billing|nursing/.test(q)) {
    return { store: "F", stores: ["F", "H"], llm: false, found: true };
  }
  if (/guideline|evidence|trial|textbook|meta-analysis|rct/.test(q)) {
    return { store: "E", stores: ["E"], llm: false, found: true };
  }
  return { store: null, stores: [], llm: false, found: false };
}

export function knowledgeRoot(): string {
  return path.join(astraDataRoot(), "knowledge");
}

/** Empty headings only. Does not invent hospital facts. */
export function ensureIdentityFiles(root = knowledgeRoot()): string[] {
  const files: Array<[string, string]> = [
    ["identity/hospital.md", "# Hospital\n\n"],
    ["identity/departments/README.md", "# Departments\n\n"],
    ["identity/agents/README.md", "# Agents\n\n"],
  ];
  const written: string[] = [];
  for (const [rel, body] of files) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (!fs.existsSync(file)) fs.writeFileSync(file, body, "utf8");
    written.push(file);
  }
  return written;
}
