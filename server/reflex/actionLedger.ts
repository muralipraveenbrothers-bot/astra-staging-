export interface LedgerEntry {
  operationId: string;
  tool: string;
  before: unknown;
  after?: unknown;
  reason: string;
  reversible: boolean;
  undone?: boolean;
}

const entries: LedgerEntry[] = [];

export function beginAction(input: { tool: string; before: unknown; reason: string; reversible?: boolean }): LedgerEntry {
  const entry: LedgerEntry = { operationId: "op-" + (entries.length + 1), tool: input.tool, before: input.before, reason: input.reason, reversible: input.reversible !== false };
  entries.push(entry);
  return entry;
}

export function completeAction(operationId: string, after: unknown): LedgerEntry | undefined {
  const entry = entries.find((row) => row.operationId === operationId);
  if (entry) entry.after = after;
  return entry;
}

export function undoAction(operationId: string, humanConfirmed: boolean): LedgerEntry {
  if (!humanConfirmed) throw new Error("Undo requires human confirmation");
  const entry = entries.find((row) => row.operationId === operationId);
  if (!entry) throw new Error("Unknown operation");
  entry.undone = true;
  return beginAction({ tool: "undo:" + entry.tool, before: entry.after, reason: "human undo of " + operationId, reversible: false });
}

export function ledgerEntries(): LedgerEntry[] { return entries.slice(); }
export function _resetLedgerForTest(): void { entries.length = 0; }
