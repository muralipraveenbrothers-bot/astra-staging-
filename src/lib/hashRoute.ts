// Sparta-style per-department deep links. The app is a single-page bundle, so
// each department workspace gets a shareable hash URL (#/pharmacy etc.) that
// boots straight into the right Hospital Ops sub-page.

import { useEffect, useState } from "react";

export interface DeptRoute {
  path: string;
  label: string;
  sub: string;
  desc: string;
}

export const DEPT_ROUTES: DeptRoute[] = [
  { path: "/reception", label: "Reception", sub: "voice-reg", desc: "Front desk & registration" },
  { path: "/opscan", label: "OP Scan", sub: "op-scan", desc: "Document intake & OCR" },
  { path: "/appointments", label: "Appointments", sub: "appointments", desc: "Doctor-wise book & check-in" },
  { path: "/pharmacy", label: "Pharmacy", sub: "pharmacy", desc: "Dispensing + purchase register" },
  { path: "/ward", label: "Ward", sub: "ward", desc: "Bed board + med timing board" },
  { path: "/nursing", label: "Nursing", sub: "nursing", desc: "Weekly shift roster" },
  { path: "/doctor", label: "Doctor Console", sub: "orders", desc: "Orders + clinical support" },
  { path: "/lab", label: "Lab", sub: "lab", desc: "Lab queue & reports" },
  { path: "/radiology", label: "Radiology", sub: "radiology", desc: "Imaging orders & reports" },
  { path: "/ot", label: "OT", sub: "ot", desc: "Operation theatre" },
  { path: "/billing", label: "Billing", sub: "billing", desc: "Collections ledger" },
  { path: "/marketing", label: "Marketing", sub: "marketing", desc: "Outreach campaigns" },
  { path: "/reputation", label: "Reputation", sub: "reputation", desc: "Google reviews & QR standee" },
  { path: "/advisor", label: "Advisor", sub: "advisor", desc: "Financial advisor + patient counseling" },
  { path: "/reports", label: "Reports", sub: "reports", desc: "Analytics & statements" },
  { path: "/ceo", label: "CEO Dashboard", sub: "cloud-hms", desc: "Hospital-wide monitoring" },
  { path: "/finance", label: "Finance", sub: "billing", desc: "Accounts & revenue" },
  { path: "/hr", label: "HR", sub: "attendance", desc: "Human resources" },
  { path: "/admin", label: "Admin", sub: "departments", desc: "System administration" },
  { path: "/staff", label: "Staff Command", sub: "work-orders", desc: "Work orders & staff operations" },
];

export function getHash(): string {
  return window.location.hash.replace(/^#/, "") || "/";
}

export function useHashRoute(): string {
  const [hash, setHash] = useState(getHash);
  useEffect(() => {
    const fn = () => setHash(getHash());
    window.addEventListener("hashchange", fn);
    return () => window.removeEventListener("hashchange", fn);
  }, []);
  return hash;
}

export function navHash(path: string, state?: unknown): void {
  if (state !== undefined) {
    const next = `${window.location.pathname}${window.location.search}#${path}`;
    window.history.pushState(state, "", next);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    return;
  }
  window.location.hash = path;
}

/** Hospital Ops sub-page key for a hash route, or null when it isn't a dept link. */
export function deptSubFor(hash: string): string | null {
  const pathOnly = hash.split("?")[0];
  return DEPT_ROUTES.find((r) => r.path === pathOnly)?.sub ?? null;
}

/** Hash route for a Hospital Ops sub-page key (reverse lookup). */
export function hashForSub(sub: string): string | null {
  return DEPT_ROUTES.find((r) => r.sub === sub)?.path ?? null;
}

/** Absolute shareable URL for a department route. */
export function deptUrl(path: string): string {
  return `${window.location.origin}${window.location.pathname}#${path}`;
}
