import fs from "fs";
import path from "path";
import { astraDataRoot } from "../services/env";
import { computeDecisionHash, GENESIS_HASH, type ApprovalDecision } from "../../src/astra/approval/approvalGate";

export const CONNECTOR_STAGES = [
  "CONNECTED", "READ_TESTED", "VALIDATED", "SHADOW", "SANDBOX_WRITE", "LIMITED", "FULL",
] as const;
export type ConnectorStage = (typeof CONNECTOR_STAGES)[number];

export interface ConnectorRecord {
  id: string;
  stage: ConnectorStage;
  sandboxTarget?: string;
  allowRoles?: string[];
}

const KNOWN = ["whatsapp", "n8n", "hims", "browser", "email", "printers"];
const memory = new Map<string, ConnectorRecord>();
const stageLog: ApprovalDecision[] = [];

function seed(): void {
  for (const id of KNOWN) {
    if (!memory.has(id)) memory.set(id, { id, stage: "CONNECTED", sandboxTarget: "sandbox" });
  }
}
seed();

function persist(): void {
  if (process.env.VITEST) return;
  try {
    const file = path.join(astraDataRoot(), "reflex", "connectors.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ connectors: listConnectors() }, null, 2));
  } catch { /* persistence must not block a decision */ }
}

export function listConnectors(): ConnectorRecord[] {
  seed();
  return [...memory.values()];
}

export function getConnector(id: string): ConnectorRecord {
  seed();
  return memory.get(id) ?? { id, stage: "CONNECTED", sandboxTarget: "sandbox" };
}

export function writeAllowed(id: string, target: string): { allowed: boolean; level: "FORBIDDEN" | "CONFIRM_USER"; reason: string } {
  const connector = getConnector(id);
  const rank = CONNECTOR_STAGES.indexOf(connector.stage);
  const sandbox = CONNECTOR_STAGES.indexOf("SANDBOX_WRITE");
  if (rank < sandbox) {
    return { allowed: false, level: "FORBIDDEN", reason: id + " writes are forbidden below SANDBOX_WRITE (now " + connector.stage + ")." };
  }
  if (connector.stage === "SANDBOX_WRITE" && target !== (connector.sandboxTarget ?? "sandbox")) {
    return { allowed: false, level: "FORBIDDEN", reason: "SANDBOX_WRITE may only touch the sandbox target." };
  }
  if (connector.stage === "LIMITED") {
    return { allowed: false, level: "CONFIRM_USER", reason: "LIMITED writes stay on the allow-list and still need a person." };
  }
  return { allowed: false, level: "CONFIRM_USER", reason: "Connector writes are never automatic." };
}

export function changeConnectorStage(input: {
  id: string;
  stage: ConnectorStage;
  role: string;
  reason?: string;
}): { ok: boolean; reason: string; entry?: ApprovalDecision } {
  if (input.role !== "admin") return { ok: false, reason: "Stage changes are admin-only." };
  if (!input.reason || input.reason.trim().length < 15) return { ok: false, reason: "An admin reason of at least 15 characters is required." };
  if (!CONNECTOR_STAGES.includes(input.stage)) return { ok: false, reason: "Unknown connector stage." };
  const current = getConnector(input.id);
  memory.set(input.id, { ...current, stage: input.stage });
  persist();
  const previousHash = stageLog.at(-1)?.entryHash ?? GENESIS_HASH;
  const base = {
    decisionId: "conn-" + Date.now().toString(36),
    suggestionId: "connector:" + input.id,
    patientId: "none",
    kind: "other" as const,
    payload: { connector: input.id, from: current.stage, to: input.stage },
    source: "reflex-connector",
    createdAt: new Date().toISOString(),
    status: "APPROVED" as const,
    decision: "APPROVE_CASE_ONLY" as const,
    decidedBy: input.role,
    decidedAt: new Date().toISOString(),
    reason: input.reason.trim(),
    learningWritten: false,
  };
  const entry: ApprovalDecision = { ...base, previousHash, entryHash: computeDecisionHash(previousHash, base) };
  stageLog.push(entry);
  return { ok: true, reason: "Stage updated.", entry };
}

export function connectorStageLog(): ApprovalDecision[] {
  return stageLog.slice();
}

export function _resetConnectorsForTest(): void {
  memory.clear();
  stageLog.length = 0;
  seed();
}
