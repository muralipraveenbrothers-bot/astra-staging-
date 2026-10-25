/**
 * Astra AI — Backend Types & Security Definitions
 */

export type Role =
  | "doctor"
  | "reception"
  | "pharmacy"
  | "lab"
  | "radiology"
  | "ward"
  | "ot"
  | "hr"
  | "billing"
  | "insurance"
  | "accounts"
  | "supervisor"
  | "marketing"
  | "ceo"
  | "admin"
  | "system";

export interface UserSession {
  userId: string;
  name: string;
  email: string;
  role: Role;
  department: string;
  sessionToken: string;
  expiresAt: number;
}

export interface SecurityContext {
  user: UserSession;
  ip: string;
  userAgent: string;
}

export interface PermissionGate {
  role: Role;
  allowedRoutes: string[];
  allowedCommands: string[];
  canAccessCentralCommand: boolean;
  canAccessFinancials: boolean;
  canOrderMedications: boolean;
  canVerifyLabResults: boolean;
  canScheduleSurgeries: boolean;
}

export const ROLE_PERMISSIONS: Record<Role, PermissionGate> = {
  doctor: {
    role: "doctor",
    allowedRoutes: ["/doctor", "/command", "/knowledge", "/settings"],
    allowedCommands: ["*"],
    canAccessCentralCommand: true,
    canAccessFinancials: false,
    canOrderMedications: true,
    canVerifyLabResults: true,
    canScheduleSurgeries: true,
  },
  admin: {
    role: "admin",
    allowedRoutes: ["*"],
    allowedCommands: ["*"],
    canAccessCentralCommand: true,
    canAccessFinancials: true,
    canOrderMedications: true,
    canVerifyLabResults: true,
    canScheduleSurgeries: true,
  },
  ceo: {
    role: "ceo",
    allowedRoutes: ["/ceo", "/command", "/reports", "/settings"],
    allowedCommands: ["census", "reporting", "admin", "tasks"],
    canAccessCentralCommand: true,
    canAccessFinancials: true,
    canOrderMedications: false,
    canVerifyLabResults: false,
    canScheduleSurgeries: false,
  },
  reception: {
    role: "reception",
    allowedRoutes: ["/reception"],
    allowedCommands: ["reception", "registration", "admission", "tasks"],
    canAccessCentralCommand: false,
    canAccessFinancials: false,
    canOrderMedications: false,
    canVerifyLabResults: false,
    canScheduleSurgeries: false,
  },
  pharmacy: {
    role: "pharmacy",
    allowedRoutes: ["/pharmacy"],
    allowedCommands: ["pharmacy", "tasks"],
    canAccessCentralCommand: false,
    canAccessFinancials: false,
    canOrderMedications: false,
    canVerifyLabResults: false,
    canScheduleSurgeries: false,
  },
  lab: {
    role: "lab",
    allowedRoutes: ["/lab"],
    allowedCommands: ["laboratory", "tasks"],
    canAccessCentralCommand: false,
    canAccessFinancials: false,
    canOrderMedications: false,
    canVerifyLabResults: true,
    canScheduleSurgeries: false,
  },
  radiology: {
    role: "radiology",
    allowedRoutes: ["/radiology"],
    allowedCommands: ["radiology", "tasks"],
    canAccessCentralCommand: false,
    canAccessFinancials: false,
    canOrderMedications: false,
    canVerifyLabResults: false,
    canScheduleSurgeries: false,
  },
  ward: {
    role: "ward",
    allowedRoutes: ["/ward"],
    allowedCommands: ["admission", "tasks"],
    canAccessCentralCommand: false,
    canAccessFinancials: false,
    canOrderMedications: false,
    canVerifyLabResults: false,
    canScheduleSurgeries: false,
  },
  ot: {
    role: "ot",
    allowedRoutes: ["/ot"],
    allowedCommands: ["ot", "tasks"],
    canAccessCentralCommand: false,
    canAccessFinancials: false,
    canOrderMedications: false,
    canVerifyLabResults: false,
    canScheduleSurgeries: true,
  },
  hr: {
    role: "hr",
    allowedRoutes: ["/hr"],
    allowedCommands: ["hr", "tasks"],
    canAccessCentralCommand: false,
    canAccessFinancials: false,
    canOrderMedications: false,
    canVerifyLabResults: false,
    canScheduleSurgeries: false,
  },
  billing: {
    role: "billing",
    allowedRoutes: ["/billing"],
    allowedCommands: ["billing", "tasks"],
    canAccessCentralCommand: false,
    canAccessFinancials: true,
    canOrderMedications: false,
    canVerifyLabResults: false,
    canScheduleSurgeries: false,
  },
  insurance: {
    role: "insurance",
    allowedRoutes: ["/insurance"],
    allowedCommands: ["billing", "tasks"],
    canAccessCentralCommand: false,
    canAccessFinancials: true,
    canOrderMedications: false,
    canVerifyLabResults: false,
    canScheduleSurgeries: false,
  },
  accounts: {
    role: "accounts",
    allowedRoutes: ["/accounts"],
    allowedCommands: ["billing", "tasks"],
    canAccessCentralCommand: false,
    canAccessFinancials: true,
    canOrderMedications: false,
    canVerifyLabResults: false,
    canScheduleSurgeries: false,
  },
  supervisor: {
    role: "supervisor",
    allowedRoutes: ["/reception", "/pharmacy", "/ward", "/lab"],
    allowedCommands: ["reception", "registration", "tasks"],
    canAccessCentralCommand: false,
    canAccessFinancials: false,
    canOrderMedications: false,
    canVerifyLabResults: false,
    canScheduleSurgeries: false,
  },
  marketing: {
    role: "marketing",
    allowedRoutes: ["/marketing"],
    allowedCommands: ["marketing", "tasks"],
    canAccessCentralCommand: false,
    canAccessFinancials: false,
    canOrderMedications: false,
    canVerifyLabResults: false,
    canScheduleSurgeries: false,
  },
  system: {
    role: "system",
    allowedRoutes: [],
    allowedCommands: [],
    canAccessCentralCommand: false,
    canAccessFinancials: false,
    canOrderMedications: false,
    canVerifyLabResults: false,
    canScheduleSurgeries: false,
  },
};
