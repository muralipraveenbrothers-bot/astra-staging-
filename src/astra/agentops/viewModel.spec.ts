import { describe, expect, it } from "vitest";
import { boardColumns, emptyBoardCopy } from "./viewModel";

describe("agent operations board view", () => {
  it("shows an empty state and keeps cards in their status column", () => {
    expect(emptyBoardCopy([])).toBe("No agent tasks yet");
    const columns = boardColumns([{ taskId: "t1", title: "SYNTHETIC", status: "QUEUED", initiator: "doc", module: "agentops" }]);
    expect(columns.find((column) => column.status === "QUEUED")?.cards).toHaveLength(1);
    expect(columns.find((column) => column.status === "DONE")?.cards).toHaveLength(0);
  });
});
