export interface CaseSlice {
  key: string;
  text: string;
  pinned?: boolean;
  at?: string;
}

const PINNED = ["allergies", "active_medications", "critical_alert", "code_status", "pending_approvals", "latest_vitals", "pregnancy", "weight"];

export function selectContext(slices: CaseSlice[], budgetTokens: number): { text: string; droppedSummary: string } {
  const budgetChars = Math.max(40, budgetTokens * 4);
  const pinned = slices.filter((slice) => slice.pinned || PINNED.includes(slice.key));
  const rest = slices.filter((slice) => !pinned.includes(slice));
  const kept: string[] = [];
  let used = 0;
  for (const slice of pinned) {
    kept.push(slice.key + ": " + slice.text);
    used += slice.text.length;
  }
  const dropped: string[] = [];
  for (const slice of rest) {
    if (used + slice.text.length > budgetChars) dropped.push(slice.key);
    else { kept.push(slice.key + ": " + slice.text); used += slice.text.length; }
  }
  return {
    text: kept.join("\n"),
    droppedSummary: dropped.length ? "omitted: " + dropped.join(", ") : "",
  };
}

export interface Chunk { id: string; text: string; hash: string; pinned?: boolean; relevance?: "critical" | "relevant" | "duplicate" | "irrelevant" | "unknown" }

export function selectChunks(chunks: Chunk[], k = 20): Chunk[] {
  const seen = new Set<string>();
  const kept: Chunk[] = [];
  for (const chunk of chunks) {
    if (chunk.pinned) { kept.push(chunk); seen.add(chunk.hash); }
  }
  for (const chunk of chunks) {
    if (kept.length >= k) break;
    if (chunk.relevance === "irrelevant" || chunk.relevance === "duplicate" || chunk.relevance === "unknown") continue;
    if (seen.has(chunk.hash)) continue;
    if (chunk.relevance === "critical" || chunk.relevance === "relevant" || !chunk.relevance) {
      seen.add(chunk.hash);
      kept.push(chunk);
    }
  }
  return kept.slice(0, k);
}
