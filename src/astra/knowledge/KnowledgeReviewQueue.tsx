import React from "react";

export interface ReviewItem {
  kind: "knowledge" | "skill" | "training";
  id: string;
  title: string;
  provenance: string;
  tier?: number | null;
}

export function reviewQueueEmpty(items: ReviewItem[]): boolean {
  return items.length === 0;
}

/** Admin or doctor review. Empty when nothing is waiting. Does not approve by itself. */
export function KnowledgeReviewQueue({ items, onDecision }: { items: ReviewItem[]; onDecision?: (id: string, decision: "approve" | "reject") => void }) {
  if (reviewQueueEmpty(items)) {
    return <p className="text-sm text-slate-400">Nothing waiting for review</p>;
  }
  return (
    <ul className="space-y-2 text-sm">
      {items.map((item) => (
        <li key={item.id} className="rounded border border-slate-700 p-2">
          <p className="font-semibold">{item.title}</p>
          <p className="text-xs text-slate-400">{item.kind} · {item.provenance}{item.tier ? ` · tier ${item.tier}` : ""}</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => onDecision?.(item.id, "approve")}>Approve</button>
            <button type="button" onClick={() => onDecision?.(item.id, "reject")}>Reject</button>
          </div>
        </li>
      ))}
    </ul>
  );
}
