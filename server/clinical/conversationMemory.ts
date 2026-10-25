/** Bounded, non-diagnostic conversation memory for continuity and auditability. */
export interface ClinicalTurn { at: string; query: string; intent?: string; responseMode?: string; summary?: string }
const MAX_TURNS = 8;
const sessions = new Map<string, ClinicalTurn[]>();

export function rememberClinicalTurn(sessionId: string, turn: ClinicalTurn): ClinicalTurn[] {
  const prior = sessions.get(sessionId) ?? [];
  const next = [...prior, { ...turn, query: turn.query.trim().slice(0, 1000), summary: turn.summary?.slice(0, 1200) }].slice(-MAX_TURNS);
  sessions.set(sessionId, next);
  return next;
}

export function recentClinicalTurns(sessionId: string): ClinicalTurn[] { return [...(sessions.get(sessionId) ?? [])]; }

export function clearClinicalMemory(sessionId: string): void { sessions.delete(sessionId); }
export function clearClinicalMemoryForUser(userId: string): number {
  const prefix = `${userId}:`;
  let cleared = 0;
  for (const key of sessions.keys()) if (key.startsWith(prefix)) { sessions.delete(key); cleared++; }
  return cleared;
}
