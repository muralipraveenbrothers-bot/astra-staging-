import fs from "fs";
import path from "path";
import { CATALOG } from "../../reflex/tools/catalog";
import { appendHashLog, sha256 } from "../hashLog";
import { knowledgeRoot } from "../memoryPolicy";

export type SkillDomain = "clinical" | "hospital" | "technical";
export type SkillStatus = "candidate" | "approved" | "retired";
export type ApprovalLevel = "L0" | "L1" | "L2" | "L3" | "L4" | "L5" | "L6" | "L7";

const RANK: Record<ApprovalLevel, number> = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4, L5: 5, L6: 6, L7: 7 };

export interface Skill {
  id: string;
  version: number;
  name: string;
  purpose: string;
  allowedRoles: string[];
  inputs: Record<string, string>;
  requiredData: string[];
  steps: string[];
  tools: string[];
  validation: string[];
  approvalLevel: ApprovalLevel;
  failureHandling: string;
  tests: string[];
  domain: SkillDomain;
  status: SkillStatus;
  approvedBy?: string;
  hash?: string;
}

export function toolRank(name: string): number {
  const tool = CATALOG.find((item) => item.name === name);
  if (!tool) throw new Error(`unknown tool ${name}`);
  return RANK[tool.authorityLevel];
}

export function validateSkillShape(skill: Skill): string | null {
  if (!skill.inputs || typeof skill.inputs !== "object") return "inputs schema required";
  let max = 0;
  for (const name of skill.tools) max = Math.max(max, toolRank(name));
  if (RANK[skill.approvalLevel] < max) return "approval level is lower than the most privileged tool";
  return null;
}

export function sandboxReplay(skill: Skill, mocks: Record<string, () => void>): { writes: 0; called: string[] } {
  const called: string[] = [];
  for (const name of skill.tools) {
    const mock = mocks[name];
    if (!mock) throw new Error(`sandbox missing mock for ${name}`);
    mock();
    called.push(name);
  }
  return { writes: 0, called };
}

export function approveSkill(skill: Skill, actor: { role: string; id: string }, dir = path.join(knowledgeRoot(), "skills")): Skill {
  const problem = validateSkillShape(skill);
  if (problem) throw new Error(problem);
  if (skill.domain === "clinical" && actor.role !== "doctor") throw new Error("clinical skill requires doctor approval");
  if (skill.status === "approved") throw new Error("approved skills are not overwritten");
  if (actor.role !== "doctor" && actor.role !== "admin") throw new Error("approval requires a doctor or admin");
  const next: Skill = { ...skill, status: "approved", approvedBy: actor.id, version: skill.version || 1 };
  next.hash = sha256({ id: next.id, version: next.version, tools: next.tools, purpose: next.purpose, domain: next.domain });
  const folder = path.join(dir, next.id);
  fs.mkdirSync(folder, { recursive: true });
  const base = path.join(folder, String(next.version));
  if (fs.existsSync(`${base}.json`)) throw new Error("version already exists");
  fs.writeFileSync(`${base}.json`, JSON.stringify(next, null, 2), "utf8");
  fs.writeFileSync(`${base}.md`, `# ${next.name}\n\n${next.purpose}\n`, "utf8");
  appendHashLog(path.join(dir, "..", "audit"), { kind: "skill.approve", id: next.id, version: next.version, hash: next.hash, role: actor.role });
  return next;
}

export function retireSkill(skill: Skill, actor: { role: string }): Skill {
  if (actor.role !== "admin" && actor.role !== "doctor") throw new Error("retire requires admin or doctor");
  if (skill.domain === "clinical" && actor.role !== "doctor") throw new Error("clinical retire requires a doctor");
  return { ...skill, status: "retired" };
}

/**
 * No BookSkill module was found in code (discharge formats in the brain are not a governed skill).
 * Nothing is registered as an approved v1.
 */
export function existingBookSkills(): Skill[] {
  return [];
}
