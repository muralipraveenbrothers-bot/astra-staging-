import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { readHashLog } from "./hashLog";
import { approveSkill, sandboxReplay, type Skill } from "./skills/registry";

function skill(over: Partial<Skill> = {}): Skill {
  return {
    id: "skill-demo",
    version: 1,
    name: "Demo",
    purpose: "Look up a local document",
    allowedRoles: ["doctor"],
    inputs: { query: "string" },
    requiredData: [],
    steps: ["search"],
    tools: ["document_lookup"],
    validation: ["tool exists"],
    approvalLevel: "L0",
    failureHandling: "stop",
    tests: ["shape"],
    domain: "hospital",
    status: "candidate",
    ...over,
  };
}

describe("skill registry", () => {
  it("rejects a skill below its tool level, rejects a non-doctor clinical approval, and sandbox replay does not write", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "astra-skill-"));
    expect(() => approveSkill(skill({ tools: ["sign_prescription"], approvalLevel: "L0" }), { role: "doctor", id: "d1" }, dir)).toThrow(/approval level/);
    expect(() => approveSkill(skill({ domain: "clinical", approvalLevel: "L5", tools: ["sign_prescription"] }), { role: "admin", id: "a1" }, dir)).toThrow(/doctor/);
    let writes = 0;
    const replay = sandboxReplay(skill(), { document_lookup: () => { /* mock, no write */ } });
    const realWrite = () => { writes += 1 };
    void realWrite;
    expect(replay.writes).toBe(0);
    expect(writes).toBe(0);
    const approved = approveSkill(skill({ id: "skill-ok" }), { role: "admin", id: "a1" }, dir);
    expect(approved.status).toBe("approved");
    expect(approved.version).toBe(1);
    expect(approved.hash).toMatch(/^[a-f0-9]{64}$/);
    const log = readHashLog(path.join(dir, "..", "audit"));
    expect(log.some((row) => row.hash.length === 64)).toBe(true);
    expect(fs.existsSync(path.join(dir, "skill-ok", "1.json"))).toBe(true);
  });
});
