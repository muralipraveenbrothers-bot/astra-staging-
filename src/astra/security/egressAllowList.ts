export type EgressVerdict = "ALLOW" | "DENY";
import { FREELLMAPI_PORT } from "../../config/freeLlmEndpoint";

export class EgressDeniedError extends Error {
  constructor(target: unknown, reason = "Egress denied by ASTRA allow-list") {
    super(`${reason}: ${String(target ?? "")}`);
    this.name = "EgressDeniedError";
  }
}

const ALLOWED_HOSTS = new Set([
  "pubmed.ncbi.nlm.nih.gov",
  "rxnav.nlm.nih.gov",
  "clinicaltrials.gov",
  "lab-service.astra.hospital.internal",
  "127.0.0.1",
  "localhost",
]);

const ALLOWED_LOCAL_PORTS = new Set(["3000", "5173", "8791", "11434", "17493", "20128", String(FREELLMAPI_PORT)]);

export function decodeObfuscatedHost(host: string): string | null {
  const clean = host.trim().toLowerCase().replace(/\.$/, "");
  const decoded = decodeURIComponent(clean);
  if (/^\d+$/.test(decoded)) {
    const n = Number(decoded);
    if (Number.isInteger(n) && n >= 0 && n <= 0xffffffff) {
      return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
    }
  }
  const parts = decoded.split(".");
  if (parts.length === 4 && parts.every((p) => /^(0x[0-9a-f]+|0[0-7]+|\d+)$/i.test(p))) {
    return parts.map((p) => String(p.startsWith("0x") ? parseInt(p, 16) : /^0[0-7]+/.test(p) ? parseInt(p, 8) : Number(p))).join(".");
  }
  return null;
}

export function checkEgress(target: unknown): { verdict: EgressVerdict; reason: string } {
  if (typeof target !== "string" || target.trim() === "") return { verdict: "DENY", reason: "empty target denied fail closed" };
  const rawHostMatch = target.trim().match(/^[a-z][a-z0-9+.-]*:\/\/([^/?#:]+)/i);
  const originalHost = rawHostMatch?.[1] ?? "";
  if (decodeObfuscatedHost(originalHost) && decodeObfuscatedHost(originalHost) !== originalHost.toLowerCase()) {
    return { verdict: "DENY", reason: "obfuscated host denied" };
  }
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return { verdict: "DENY", reason: "malformed target denied fail closed" };
  }
  if (!["http:", "https:"].includes(url.protocol)) return { verdict: "DENY", reason: "scheme denied fail closed" };
  const rawHost = url.hostname.trim().toLowerCase().replace(/\.$/, "");
  const decodedHost = decodeObfuscatedHost(url.hostname);
  const host = decodedHost ?? rawHost;
  if (decodedHost && decodedHost !== rawHost) return { verdict: "DENY", reason: "obfuscated host denied" };
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) && host !== "127.0.0.1") return { verdict: "DENY", reason: "raw IP denied" };
  if ((host === "127.0.0.1" || host === "localhost") && ALLOWED_LOCAL_PORTS.has(url.port)) return { verdict: "ALLOW", reason: "approved local service" };
  if (ALLOWED_HOSTS.has(host)) return { verdict: "ALLOW", reason: "approved endpoint" };
  return { verdict: "DENY", reason: "host denied fail closed" };
}

export function assertEgressAllowed(target: unknown): void {
  const decision = checkEgress(target);
  if (decision.verdict !== "ALLOW") throw new EgressDeniedError(target, decision.reason);
}
