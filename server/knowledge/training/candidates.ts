import fs from "fs";
import path from "path";
import { appendHashLog } from "../hashLog";
import { findIdentifierKinds, stripIdentifiers } from "../privacy";
import { astraDataRoot } from "../../services/env";

/** Training is not performed here. This store only holds human-approved, de-identified examples. */

export type TrainingFamily =
  | "hospital_commands"
  | "terminology"
  | "normalization"
  | "extraction"
  | "form_completion"
  | "tool_arguments"
  | "department_vocabulary"
  | "response_style";

export interface TrainingExample {
  id: string;
  family: TrainingFamily;
  language: string;
  department: string;
  text: string;
  verified: boolean;
  approved: boolean;
  clinical?: boolean;
  scientistValidated?: boolean;
  doctorValidated?: boolean;
  correct?: boolean;
}

export function deidentifyTrainingText(text: string): string {
  return stripIdentifiers(text);
}

export function acceptTrainingExample(example: TrainingExample): { ok: true; example: TrainingExample } | { ok: false; reason: string } {
  if (!example.verified) return { ok: false, reason: "unverified interaction" };
  if (!example.approved) return { ok: false, reason: "human approval required" };
  if (example.clinical && !(example.scientistValidated && example.doctorValidated)) {
    return { ok: false, reason: "clinical examples need Scientist and doctor validation and must not teach treatment truth" };
  }
  const text = deidentifyTrainingText(example.text);
  if (findIdentifierKinds(text).length) return { ok: false, reason: "identifiers remain after de-identification" };
  return { ok: true, example: { ...example, text } };
}

export function exportJsonl(args: {
  family: TrainingFamily;
  split: "train" | "dev" | "test";
  role: string;
  rows: TrainingExample[];
  root?: string;
}): { file: string; count: number } {
  if (args.role !== "admin") throw new Error("export requires admin");
  const clean: TrainingExample[] = [];
  for (const row of args.rows) {
    const accepted = acceptTrainingExample(row);
    if (!accepted.ok) continue;
    clean.push(accepted.example);
  }
  const dir = path.join(args.root ?? astraDataRoot(), "training", "exports");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${args.family}.${args.split}.jsonl`);
  fs.writeFileSync(file, clean.map((row) => JSON.stringify({ family: row.family, language: row.language, department: row.department, text: row.text })).join("\n") + (clean.length ? "\n" : ""), "utf8");
  appendHashLog(path.join(args.root ?? astraDataRoot(), "knowledge", "audit"), { kind: "training.export", family: args.family, split: args.split, count: clean.length, role: args.role });
  return { file, count: clean.length };
}

export function curriculumReport(rows: Array<Pick<TrainingExample, "language" | "department" | "family" | "correct">>): Array<{ language: string; department: string; family: string; n: number; accuracy: number | null }> {
  const groups = new Map<string, { language: string; department: string; family: string; n: number; correct: number; labelled: number }>();
  for (const row of rows) {
    const key = `${row.language}|${row.department}|${row.family}`;
    const group = groups.get(key) ?? { language: row.language, department: row.department, family: row.family, n: 0, correct: 0, labelled: 0 };
    group.n += 1;
    if (typeof row.correct === "boolean") {
      group.labelled += 1;
      if (row.correct) group.correct += 1;
    }
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    language: group.language,
    department: group.department,
    family: group.family,
    n: group.n,
    accuracy: group.labelled ? group.correct / group.labelled : null,
  }));
}

/** Hermes may propose more examples. The proposal stays a candidate. */
export function proposeMoreExamples(note: string): { status: "candidate"; note: string } {
  return { status: "candidate", note };
}

const queue: TrainingExample[] = [];

export function submitTrainingCandidate(example: TrainingExample): { ok: boolean; reason?: string } {
  if (!example.verified) return { ok: false, reason: "unverified interaction" };
  queue.push({ ...example, approved: false });
  return { ok: true };
}

export function approveTrainingCandidate(id: string, actor: { role: string }): { ok: true; example: TrainingExample } | { ok: false; reason: string } {
  const row = queue.find((item) => item.id === id);
  if (!row) return { ok: false, reason: "unknown example" };
  if (row.clinical && actor.role !== "doctor") return { ok: false, reason: "clinical example requires a doctor" };
  if (actor.role !== "doctor" && actor.role !== "admin") return { ok: false, reason: "approval requires a doctor or admin" };
  row.approved = true;
  if (row.clinical) row.doctorValidated = true;
  const accepted = acceptTrainingExample(row);
  if (!accepted.ok) return accepted;
  row.text = accepted.example.text;
  return { ok: true, example: row };
}

export function trainingQueue(): TrainingExample[] {
  return queue.map((row) => ({ ...row }));
}

export function clearTrainingQueueForTests(): void {
  queue.length = 0;
}
