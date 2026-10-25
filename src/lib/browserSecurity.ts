/**
 * ASTRA AI — INTERNAL BROWSER SECURITY (URL classification & hardening)
 * ============================================================================
 * Centralized, tested URL-safety helpers for the Astra Internal Browser.
 *
 * Rules:
 *  • Dangerous protocols are ALWAYS blocked: javascript:, vbscript:, file:,
 *    and data: navigations (except inline images, which are inert).
 *  • Private / metadata SSRF targets are flagged so they are never proxied
 *    for untrusted external pages (169.254.169.254 cloud metadata, etc.).
 *  • Astra never forwards auth headers / API keys to arbitrary origins —
 *    the browser iframe carries no Astra credentials at all.
 */

import { FREELLMAPI_PORT } from "../config/freeLlmEndpoint";

const BLOCKED_PROTOCOLS = ["javascript:", "vbscript:", "file:", "about:"];

/** data: is only allowed for inert inline images — never top-level navigation. */
function isSafeDataUrl(raw: string): boolean {
  return /^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);/i.test(raw);
}

/** Parse a raw string into a URL, returning null instead of throwing. */
export function parseUrl(raw: string): URL | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  try {
    return new URL(trimmed);
  } catch {
    try {
      return new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }
}

/** Add https:// for bare hosts; reject nothing else. Returns "" when invalid. */
export function normalizeUrl(raw: string): string {
  const u = parseUrl(raw);
  if (!u) return "";
  if (u.protocol === "http:" || u.protocol === "https:") return u.toString();
  if (u.protocol === "data:" && isSafeDataUrl(raw)) return raw;
  return "";
}

/** True for protocols/dangerous payloads the internal browser must never load. */
export function isBlockedUrl(raw: string): boolean {
  if (!raw) return true;
  const lower = raw.trim().toLowerCase();
  if (lower.startsWith("data:")) return !isSafeDataUrl(lower);
  return BLOCKED_PROTOCOLS.some((p) => lower.startsWith(p));
}

/** loopback / RFC1918 / link-local — i.e. a service running on this machine. */
export function isLocalServiceUrl(raw: string): boolean {
  const u = parseUrl(raw);
  if (!u) return false;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "127.0.0.1" || host === "::1" || host === "[::1]") return true;
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  return false;
}

/**
 * A URL is TRUSTED when it belongs to a service registered in the central
 * Astra service registry (same host AND port as the registered definition).
 */
export function isTrustedAstraUrl(raw: string): boolean {
  const u = parseUrl(raw);
  if (!u) return false;
  // Import lazily-critical registry inline to avoid cycles — services list
  // is static, so a plain comparison against known ports is safe.
  const trustedHostPorts = [
    "localhost:5173", // Astra AI main URL
    "127.0.0.1:5173",
    `localhost:${FREELLMAPI_PORT}`, // FreeLLMAPI dashboard + admin/login
    `127.0.0.1:${FREELLMAPI_PORT}`,
    "localhost:5171", // OmniRoute dev/portable (legacy — kept trusted)
    "127.0.0.1:5171",
    "localhost:20128", // OmniRoute desktop app (Electron — verified live 2026-09-09)
    "127.0.0.1:20128",
    "localhost:3100", // Paperclip
    "127.0.0.1:3100",
    "localhost:4000", // LiteLLM UI
    "127.0.0.1:4000",
    "localhost:5678", // n8n
    "127.0.0.1:5678",
    "localhost:11434", // Ollama
    "127.0.0.1:11434",
    "localhost:17493", // Voicebox
    "127.0.0.1:17493",
    "localhost:6060", // RouteLLM
    "127.0.0.1:6060",
    "localhost:3000", // Astra API
    "127.0.0.1:3000",
    "localhost:18789", // OpenClaw gateway
    "127.0.0.1:18789",
    "localhost:9119", // Hermes Agent dashboard
    "127.0.0.1:9119",
  ];
  const hostPort = `${u.hostname.toLowerCase() === "::1" ? "[::1]" : u.hostname.toLowerCase()}:${u.port || (u.protocol === "https:" ? "443" : "80")}`;
  return trustedHostPorts.includes(hostPort);
}

/** Cloud metadata / other SSRF-sensitive endpoints — never navigated or proxied. */
export function isSsrfRisk(raw: string): boolean {
  const u = parseUrl(raw);
  if (!u) return false;
  const host = u.hostname.toLowerCase();
  if (host === "169.254.169.254" || host === "100.100.100.200") return true; // AWS/Alibaba metadata
  if (host.endsWith(".internal")) return true;
  if (/^169\.254\./.test(host)) return true;
  return false;
}

/** Anything not local and not trusted → external website (isolated, no secrets). */
export function isExternalUrl(raw: string): boolean {
  if (isBlockedUrl(raw)) return false;
  return !isLocalServiceUrl(raw) && !isTrustedAstraUrl(raw);
}

/** Full verdict used by the internal browser before any navigation. */
export type UrlVerdict =
  | { kind: "ok"; url: string; trusted: boolean; local: boolean; external: boolean }
  | { kind: "blocked"; reason: string };

export function classifyUrl(raw: string): UrlVerdict {
  if (isBlockedUrl(raw)) {
    return { kind: "blocked", reason: "This URL uses a protocol that Astra blocks for your safety (javascript:, vbscript:, file:, or unsafe data:)." };
  }
  const trimmed = (raw || "").trim();
  // Same-origin Astra proxy paths (n8n / paperclip / voicebox dashboards).
  if (trimmed.startsWith("/proxy/") || trimmed.startsWith("/api/")) {
    return { kind: "ok", url: trimmed, trusted: true, local: true, external: false };
  }
  const normalized = normalizeUrl(raw);
  if (!normalized) {
    return { kind: "blocked", reason: "The URL could not be parsed as a valid http(s) address." };
  }
  if (isSsrfRisk(normalized)) {
    return { kind: "blocked", reason: "This address targets a private/metadata network endpoint and is blocked by Astra SSRF protection." };
  }
  const trusted = isTrustedAstraUrl(normalized);
  const local = isLocalServiceUrl(normalized);
  return { kind: "ok", url: normalized, trusted, local, external: !trusted && !local };
}
