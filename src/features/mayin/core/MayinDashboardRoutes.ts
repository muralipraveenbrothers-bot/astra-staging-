/**
 * ASTRA 7D — DR. MAYIN DASHBOARD REGISTRY
 * ============================================================================
 * Central registry for dashboard routes Dr. Mayin can navigate to by voice.
 * Maps natural language commands to dashboard routes with role filtering.
 */

import { navHash } from "@/lib/hashRoute";
import type { MayinLanguage } from "./MayinTypes";

export interface DashboardInfo {
  id: string;
  label: string;
  route: string;
  description: string;
  voiceTag: string;
  roles: string[];
  keywords: string[];
}

export const DASHBOARDS: DashboardInfo[] = [
  { id: "dashboard", label: "Hospital Dashboard", route: "/hospital/home", description: "the main hospital operations overview", voiceTag: "main dashboard", roles: ["DOCTOR","NURSE","RECEPTION","PHARMACY","LAB_TECH","ADMIN","BILLING","HR"], keywords: ["home","main","hospital","overview","dashboard","main page"] },
  { id: "lab", label: "Laboratory", route: "/lab", description: "the laboratory dashboard with test results", voiceTag: "laboratory", roles: ["DOCTOR","NURSE","LAB_TECH"], keywords: ["lab","laboratory","tests","investigations","results"] },
  { id: "radiology", label: "Radiology", route: "/radiology", description: "the radiology dashboard with scans and reports", voiceTag: "radiology", roles: ["DOCTOR","NURSE","RADIOLOGIST"], keywords: ["radiology","x-ray","ct","mri","scan","imaging","usg","ultrasound","film"] },
  { id: "pharmacy", label: "Pharmacy", route: "/pharmacy", description: "the pharmacy dashboard with medication orders", voiceTag: "pharmacy", roles: ["DOCTOR","NURSE","PHARMACIST"], keywords: ["pharmacy","medicine","medication","drugs","dispense","dispensary"] },
  { id: "reception", label: "Reception", route: "/reception", description: "the reception and registration desk", voiceTag: "reception", roles: ["RECEPTION"], keywords: ["reception","front desk","registration","opd registration"] },
  { id: "opd", label: "OPD", route: "/opd", description: "the outpatient department", voiceTag: "OPD", roles: ["DOCTOR","NURSE","RECEPTION"], keywords: ["opd","outpatient","out patient","consultation","clinic"] },
  { id: "ip", label: "IP / Wards", route: "/ip", description: "the inpatient wards", voiceTag: "wards", roles: ["DOCTOR","NURSE","WARD_ADMIN"], keywords: ["ip","inpatient","indoor","wards","ward","admitted patients"] },
  { id: "icu", label: "ICU", route: "/icu", description: "the intensive care unit", voiceTag: "ICU", roles: ["DOCTOR","NURSE"], keywords: ["icu","intensive","critical care","ccu","critical"] },
  { id: "billing", label: "Billing", route: "/billing", description: "the billing and accounts section", voiceTag: "billing", roles: ["BILLING","ADMIN","DOCTOR"], keywords: ["billing","accounts","finance","payment","bill","invoice"] },
  { id: "reports", label: "Reports", route: "/reports", description: "all reports and analytics", voiceTag: "reports", roles: ["ADMIN","DOCTOR"], keywords: ["reports","analytics","data","charts","graphs"] },
  { id: "tasks", label: "Tasks", route: "/tasks", description: "your pending and completed tasks", voiceTag: "tasks", roles: ["DOCTOR","NURSE","STAFF"], keywords: ["tasks","pending","todo","queue","worklist","my tasks"] },
  { id: "patients", label: "Patient List", route: "/patients", description: "the patient list and queue", voiceTag: "patients", roles: ["DOCTOR","NURSE","RECEPTION"], keywords: ["patients","patient list","queue","waiting list","admissions"] },
  { id: "mayin", label: "Dr. Mayin", route: "/mayin", description: "the Dr. Mayin AI assistant", voiceTag: "Mayin", roles: ["DOCTOR","NURSE"], keywords: ["mayin","ai assistant","assistant","help me","doctor ai"] },
  { id: "clinical", label: "Clinical AI", route: "/clinical-ai", description: "the clinical AI reasoning panel", voiceTag: "clinical AI", roles: ["DOCTOR","NURSE"], keywords: ["clinical","ai","reasoning","analysis","decision support"] },
  { id: "settings", label: "Settings", route: "/settings", description: "application settings and preferences", voiceTag: "settings", roles: ["ALL"], keywords: ["settings","preferences","configure","options","setup"] },
];

/** Find a dashboard by route path. */
export function findDashboardByRoute(route: string): DashboardInfo | undefined {
  return DASHBOARDS.find((d) => d.route === route);
}

/** Find a dashboard by ID. */
export function findDashboardById(id: string): DashboardInfo | undefined {
  return DASHBOARDS.find((d) => d.id === id);
}

/**
 * Find dashboards matching a natural language query, sorted by relevance.
 * Score = keyword specificity (multi-word keywords weigh more); ties break on
 * the earliest keyword position so "open lab dashboard" prefers Lab over the
 * generic Hospital Dashboard's "dashboard" keyword.
 * Role filtering keeps voice navigation inside the user's permissions.
 */
export function findDashboardsByQuery(query: string, role: string): DashboardInfo[] {
  const lower = query.toLowerCase();
  return DASHBOARDS.filter((d) => d.roles.includes(role) || d.roles.includes("ALL"))
    .map((d) => {
      let score = 0;
      let minIndex = Number.MAX_SAFE_INTEGER;
      for (const keyword of d.keywords) {
        const idx = lower.indexOf(keyword);
        if (idx >= 0) {
          score += keyword.split(" ").length;
          minIndex = Math.min(minIndex, idx);
        }
      }
      return { dashboard: d, score, minIndex };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.minIndex - b.minIndex))
    .map((s) => s.dashboard);
}

/** Best matching dashboard for a voice command, if any. */
export function resolveDashboard(text: string, role: string): DashboardInfo | undefined {
  return findDashboardsByQuery(text, role)[0];
}

/** Navigate to a dashboard by route (hash router). */
export function navigateToDashboard(route: string): void {
  if (typeof window !== "undefined" && window.location) {
    navHash(route);
  }
}

/** Voice-friendly confirmation message for a dashboard. */
export function dashboardConfirmationMessage(
  dashboard: DashboardInfo,
  language: MayinLanguage
): string {
  const tag = dashboard.voiceTag;
  if (language === "te" || language === "te-en") return `${tag} తెరుస్తున్నాను.`;
  if (language === "hi" || language === "hi-en") return `${tag} खोल रहा हूँ.`;
  return `Opening ${tag}.`;
}
