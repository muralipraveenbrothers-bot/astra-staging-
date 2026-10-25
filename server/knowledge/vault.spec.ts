import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { KnowledgeVault } from "./vault";

function tmp(): KnowledgeVault {
  return new KnowledgeVault(fs.mkdtempSync(path.join(os.tmpdir(), "astra-vault-")));
}

describe("knowledge vault", () => {
  it("quarantines an exe and a bad magic byte, skips a duplicate hash, and refuses publish without approval", () => {
    const vault = tmp();
    const exe = vault.ingest("tool.exe", Buffer.from("not a document"), { title: "nope", source: "upload" });
    expect(exe.status).toBe("quarantine");
    expect(exe.location).toContain(`${path.sep}quarantine${path.sep}`);
    const bad = vault.ingest("note.pdf", Buffer.from("hello"), { title: "bad pdf", source: "upload" });
    expect(bad.status).toBe("quarantine");
    const body = Buffer.from("# Policy\n\nLocal only.\n");
    const first = vault.ingest("policy.md", body, { title: "Policy", source: "admin", category: "hospital-policy" });
    const second = vault.ingest("policy-copy.md", body, { title: "Policy", source: "admin" });
    expect(first.status).toBe("raw");
    expect(second.status).toBe("duplicate");
    expect(second.skipped).toBe(true);
    expect(() => vault.publish(first.id, undefined)).toThrow(/approval/);
  });

  it("keeps v1 when v2 is published and lets an agent write only under candidates", () => {
    const vault = tmp();
    const body = Buffer.from("# Note\n\nVersioned.\n");
    const item = vault.ingest("note.md", body, { title: "Note", source: "admin", category: "templates" });
    const approval = { approver: "admin-1", role: "admin", at: "2026-09-29T00:00:00.000Z", contentHash: item.hash };
    const v1 = vault.publish(item.id, approval);
    const v2 = vault.publish(item.id, approval);
    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect(fs.existsSync(v1.file)).toBe(true);
    expect(fs.existsSync(v2.file)).toBe(true);
    const agent = vault.ingest("idea.md", Buffer.from("# Idea\n"), { title: "Idea", source: "hermes" }, { agent: "hermes" });
    expect(agent.status).toBe("candidate");
    expect(agent.location).toContain(`${path.sep}candidates${path.sep}`);
    expect(fs.readdirSync(path.join(vault.root, "raw")).some((name) => name.startsWith(agent.id))).toBe(false);
    expect(fs.readdirSync(path.join(vault.root, "validated")).join(" ")).not.toContain(agent.id);
  });
});
