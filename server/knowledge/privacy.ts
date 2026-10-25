/** Strip identifiers before any public evidence query. No patient text is logged. */

const PHONE = /(?:\+91[\s-]?)?[6-9]\d{9}/g;
const LABELLED_ID = /\b(?:uhid|mrn|aadhaar|phone|mobile|name|address)\s*[:#-]\s*[^\n;,]{1,80}/gi;
const BARE_UHID = /\b[A-Z]{2,6}-?\d{4,}\b/g;
const AADHAAR = /\b\d{4}\s?\d{4}\s?\d{4}\b/g;
const DATE = /\b(?:19|20)\d{2}-\d{2}-\d{2}\b/g;

export function findIdentifierKinds(text: string): string[] {
  const found: string[] = [];
  if (/(?:\+91[\s-]?)?[6-9]\d{9}/.test(text)) found.push("phone");
  if (/\b(?:uhid|mrn)\s*[:#-]\s*\S+/i.test(text) || /\b[A-Z]{2,6}-?\d{4,}\b/.test(text)) found.push("uhid");
  if (/\baadhaar\s*[:#-]\s*\d/i.test(text) || /\b\d{4}\s\d{4}\s\d{4}\b/.test(text)) found.push("aadhaar");
  if (/\bname\s*[:#-]\s*\S+/i.test(text)) found.push("name");
  if (/\baddress\s*[:#-]\s*\S+/i.test(text)) found.push("address");
  return found;
}

export function stripIdentifiers(text: string): string {
  return text
    .replace(LABELLED_ID, "[redacted]")
    .replace(PHONE, "[redacted]")
    .replace(AADHAAR, "[redacted]")
    .replace(BARE_UHID, "[redacted]")
    .replace(DATE, (iso) => shiftDate(iso));
}

/** Dates are shifted, never kept as recorded. */
export function shiftDate(iso: string): string {
  const [y, m, d] = iso.split("-").map((part) => Number(part));
  const shifted = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  shifted.setUTCDate(shifted.getUTCDate() + 17);
  return shifted.toISOString().slice(0, 10);
}

/** Refuse a public fetch when a UHID, phone, Aadhaar, name or address is present. */
export function gatePublicQuery(query: string): { ok: true; query: string } | { ok: false; reason: string } {
  const kinds = findIdentifierKinds(query);
  if (kinds.length) return { ok: false, reason: `refused before fetch: ${kinds.join(", ")}` };
  return { ok: true, query: stripIdentifiers(query) };
}
