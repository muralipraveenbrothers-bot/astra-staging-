/**
 * ASTRA AI — CENTRAL NAVIGATION (openInAstra)
 * ============================================================================
 * THE single entry point for opening any Astra-integrated service dashboard.
 * Every service link in Astra must go through openInAstra() so the Internal
 * Browser is used instead of launching Chrome/Edge. window.open / target=_blank
 * / location.href must NOT be used for Astra-integrated services.
 *
 * Recent services are stored locally with URL + service id ONLY — never any
 * credential, key or token.
 */

import { navHash } from "./hashRoute";
import { astraServiceHash, getService } from "../services/astraServices";
import { classifyUrl } from "./browserSecurity";

export interface RecentEntry {
  serviceId?: string;
  url: string;
  name: string;
  at: number;
}

const RECENTS_KEY = "astra.browser.recents";
const RECENTS_LIMIT = 8;

export function getRecentServices(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as RecentEntry[]) : [];
  } catch {
    return [];
  }
}

function pushRecent(entry: RecentEntry) {
  try {
    const list = [entry, ...getRecentServices().filter((r) => r.url !== entry.url)].slice(0, RECENTS_LIMIT);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable — recents are a convenience, not a requirement */
  }
}

/**
 * Open a service or URL inside the Astra Internal Browser.
 * Accepts: a service id ("paperclip", "freellmapi", "omniroute", …) or a URL.
 * Blocked/dangerous URLs are rejected and never navigated.
 */
export function openInAstra(target: string, subPath?: string): boolean {
  // Special: Plugin Center "Browser AI" card — Internal Browser home.
  if (target === "browser-home") {
    pushRecent({ url: "/browser", name: "Internal Browser", at: Date.now() });
    navHash("/browser");
    return true;
  }

  // Case 1 — a registered service id. User-facing URL is ALWAYS the Astra
  // hash route on :5173 — never a raw localhost:PORT jump.
  const svc = getService(target);
  if (svc) {
    const hash = astraServiceHash(svc.id, subPath);
    pushRecent({ serviceId: svc.id, url: hash, name: svc.name, at: Date.now() });
    navHash(hash);
    return true;
  }

  // Case 2 — an explicit URL (trusted service or external, safely classified).
  const verdict = classifyUrl(target);
  if (verdict.kind === "blocked") {
    console.warn("[Astra] Blocked navigation attempt:", verdict.reason);
    return false;
  }
  pushRecent({
    serviceId: verdict.trusted ? "freellmapi" : undefined,
    url: verdict.url,
    name: verdict.trusted ? "Astra Service" : verdict.url,
    at: Date.now(),
  });
  navHash(`/browser?url=${encodeURIComponent(verdict.url)}`);
  return true;
}

/** Alias matching the spec's alternative naming. */
export const AstraNavigation = { open: openInAstra };