import React, { useState } from "react";

export interface DraftTableRow { id: string; label: string; reviewStatus: "draft_needs_doctor_review" | "approved" }

/** Doctor review of draft tables. Approval is recorded by the caller; this component does not order anything. */
export function ClinicalTableReview({ rows, onDecision }: { rows: DraftTableRow[]; onDecision: (id: string, decision: "approve" | "reject", reason: string) => void }) {
  const [reason, setReason] = useState("");
  const drafts = rows.filter((row) => row.reviewStatus === "draft_needs_doctor_review");
  if (!drafts.length) return <p>No tables waiting for review</p>;
  return (
    <ul>
      {drafts.map((row) => (
        <li key={row.id}>
          <p>{row.label}</p>
          <label>Reason<input aria-label={`Reason for ${row.label}`} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
          <button type="button" onClick={() => onDecision(row.id, "approve", reason)}>Approve table</button>
          <button type="button" onClick={() => onDecision(row.id, "reject", reason)}>Reject table</button>
        </li>
      ))}
    </ul>
  );
}
