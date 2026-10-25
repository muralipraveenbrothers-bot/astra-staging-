export interface SaarathiMemoryEntry { turnId: string; userText: string; assistantText: string; at: string }
class SessionMemoryStore {
  private sessions = new Map<string, SaarathiMemoryEntry[]>();
  append(sessionId: string, entry: SaarathiMemoryEntry) { this.sessions.set(sessionId, [...(this.sessions.get(sessionId) ?? []), entry].slice(-12)); }
  read(sessionId: string) { return [...(this.sessions.get(sessionId) ?? [])]; }
  clear(sessionId: string) { this.sessions.delete(sessionId); }
}
export const saarathiSessionMemory = new SessionMemoryStore();
