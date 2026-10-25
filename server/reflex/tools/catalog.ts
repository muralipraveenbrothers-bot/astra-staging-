export type ToolFamily = "queue" | "appointment" | "patient_lookup" | "lab" | "radiology" | "pharmacy" | "ward" | "billing" | "cmrf" | "messaging" | "knowledge" | "none";

export interface CatalogTool {
  name: string;
  family: ToolFamily;
  description: string;
  authorityAction: string;
  authorityLevel: "L0" | "L1" | "L2" | "L3" | "L4" | "L5" | "L6" | "L7";
  reversible: boolean;
  dataClass: string;
  clinical?: boolean;
}

export const MICRO_ASTRA_TOOLS = ["open_module", "patient_search", "bed_search", "report_status", "task_create", "internal_message", "document_lookup", "hospital_policy_search"] as const;

export const CATALOG: CatalogTool[] = [
  { name: "queue_lookup", family: "queue", description: "Read the current reception queue.", authorityAction: "queue_sort", authorityLevel: "L0", reversible: true, dataClass: "INTERNAL" },
  { name: "patient_search", family: "patient_lookup", description: "Search a local patient index.", authorityAction: "patient_search", authorityLevel: "L0", reversible: true, dataClass: "PHI" },
  { name: "bed_search", family: "ward", description: "Read bed availability.", authorityAction: "bed_search", authorityLevel: "L0", reversible: true, dataClass: "INTERNAL" },
  { name: "pharmacy_stock", family: "pharmacy", description: "Read pharmacy stock counts.", authorityAction: "stock_check", authorityLevel: "L0", reversible: true, dataClass: "INTERNAL" },
  { name: "create_lab_order", family: "lab", description: "Prepare a lab order for a doctor.", authorityAction: "create_lab_order", authorityLevel: "L5", reversible: false, dataClass: "PHI", clinical: true },
  { name: "issue_refund", family: "billing", description: "Issue a billing refund.", authorityAction: "issue_refund", authorityLevel: "L4", reversible: false, dataClass: "INTERNAL" },
  { name: "sign_prescription", family: "pharmacy", description: "Sign a prescription.", authorityAction: "sign_prescription", authorityLevel: "L5", reversible: false, dataClass: "PHI", clinical: true },
  { name: "open_module", family: "knowledge", description: "Open an internal Astra module.", authorityAction: "open_module", authorityLevel: "L0", reversible: true, dataClass: "INTERNAL" },
  { name: "report_status", family: "lab", description: "Read whether a report is ready.", authorityAction: "report_status", authorityLevel: "L0", reversible: true, dataClass: "PHI" },
  { name: "task_create", family: "messaging", description: "Create an internal task.", authorityAction: "task_create", authorityLevel: "L2", reversible: true, dataClass: "INTERNAL" },
  { name: "internal_message", family: "messaging", description: "Draft an internal message.", authorityAction: "internal_message", authorityLevel: "L1", reversible: true, dataClass: "INTERNAL" },
  { name: "document_lookup", family: "knowledge", description: "Look up an internal document.", authorityAction: "document_lookup", authorityLevel: "L0", reversible: true, dataClass: "INTERNAL" },
  { name: "hospital_policy_search", family: "knowledge", description: "Search local hospital policy text.", authorityAction: "hospital_policy_search", authorityLevel: "L0", reversible: true, dataClass: "PUBLIC" },
];

export function toolsInFamily(family: string): CatalogTool[] {
  return CATALOG.filter((tool) => tool.family === family);
}
