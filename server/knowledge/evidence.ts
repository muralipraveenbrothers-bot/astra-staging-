import { gatePublicQuery } from "./privacy";

export type EvidenceTier = 1 | 2 | 3 | 4 | 5;
export type EvidenceClass = "evidence" | "claim" | "weak_signal" | "unverified";

export interface EvidenceRecord {
  id: string;
  claim: string;
  source: string;
  url?: string;
  publisher: string;
  date: string;
  tier: EvidenceTier;
  evidenceLevel: string;
  verified: boolean;
  conflicts: string[];
  applicability: string;
  limitations: string;
  reviewedBy?: string;
  version: number;
}

const store = new Map<string, EvidenceRecord>();

export function saveEvidence(record: EvidenceRecord): EvidenceRecord {
  store.set(record.id, record);
  return record;
}

export function listEvidence(): EvidenceRecord[] {
  return [...store.values()];
}

export function getEvidence(id: string): EvidenceRecord | undefined {
  return store.get(id);
}

export function clearEvidenceForTests(): void {
  store.clear();
}

/** Tier 5 and unverified items are never recommendations. */
export function classifyEvidence(record: EvidenceRecord): EvidenceClass {
  if (!record.verified) return "unverified";
  if (record.tier >= 5) return "weak_signal";
  if (record.tier <= 2) return "evidence";
  return "claim";
}

export function asRecommendation(record: EvidenceRecord): EvidenceRecord | null {
  if (record.tier >= 5 || !record.verified) return null;
  return record;
}

export function recommendations(): EvidenceRecord[] {
  return listEvidence().filter((record) => asRecommendation(record) !== null);
}

export function getEvidenceBadge(recordId: string): { tier: EvidenceTier; date: string; verified: boolean } | null {
  const record = store.get(recordId);
  if (!record) return null;
  return { tier: record.tier, date: record.date, verified: record.verified };
}

export interface FetchClient {
  fetch(url: string): Promise<string>;
}

/** Explicit admin/doctor action only. Identifiers are refused before any fetch. */
export async function scoutPublicSource(args: {
  query: string;
  role: string;
  explicit: boolean;
  client: FetchClient;
  url: string;
}): Promise<{ ok: true; body: string } | { ok: false; reason: string }> {
  if (!args.explicit) return { ok: false, reason: "public fetch requires an explicit admin or doctor action" };
  if (args.role !== "admin" && args.role !== "doctor") return { ok: false, reason: "role cannot fetch public sources" };
  const gate = gatePublicQuery(args.query);
  if (!gate.ok) return { ok: false, reason: gate.reason };
  const body = await args.client.fetch(args.url);
  return { ok: true, body };
}
