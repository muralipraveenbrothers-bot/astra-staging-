export const TASK_COLUMNS = ["QUEUED", "PLANNING", "RUNNING", "WAITING", "BLOCKED", "REVIEW", "APPROVED", "DONE", "FAILED", "CANCELLED"] as const;

export interface BoardCard {
  taskId: string;
  title: string;
  status: (typeof TASK_COLUMNS)[number];
  initiator: string;
  module: string;
}

export function boardColumns(cards: BoardCard[]) {
  return TASK_COLUMNS.map((status) => ({ status, cards: cards.filter((card) => card.status === status) }));
}

export function emptyBoardCopy(cards: BoardCard[]): string | null {
  return cards.length ? null : "No agent tasks yet";
}
