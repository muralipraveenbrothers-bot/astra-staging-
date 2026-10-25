import { beforeEach, describe, expect, it } from "vitest";
import { beginAction, completeAction, ledgerEntries, undoAction, _resetLedgerForTest } from "./actionLedger";

describe("action ledger", () => {
  beforeEach(() => _resetLedgerForTest());
  it("records before and after, and ledgers a confirmed undo", () => {
    const entry = beginAction({ tool: "queue_sort", before: { order: [1] }, reason: "sort" });
    completeAction(entry.operationId, { order: [2] });
    expect(ledgerEntries()[0].before).toEqual({ order: [1] });
    expect(ledgerEntries()[0].after).toEqual({ order: [2] });
    expect(() => undoAction(entry.operationId, false)).toThrow(/human/);
    undoAction(entry.operationId, true);
    expect(ledgerEntries().some((row) => row.tool.startsWith("undo:"))).toBe(true);
  });
});
