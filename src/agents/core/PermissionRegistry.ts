/**
 * ASTRA AI — PERMISSION REGISTRY (1.3)
 * ============================================================================
 * Server-side RBAC enforcement matrix across 13 hospital roles and granular permissions.
 * UI hiding is NOT security — every tool and command execution must be enforced here.
 */

import { HospitalRole } from "./AgentDefinition";

export interface RolePermissions {
  role: HospitalRole;
  description: string;
  permissions: string[];
}

class PermissionRegistryService {
  private roleMap: Map<HospitalRole, Set<string>> = new Map();

  constructor() {
    this.seedRolePermissions();
  }

  private seedRolePermissions() {
    const definitions: RolePermissions[] = [
      {
        role: "DOCTOR",
        description: "Senior Medical Consultant / Attending Physician",
        permissions: [
          "patient:read", "patient:read_clinical", "patient:write",
          "order:create", "order:cancel", "order:verify",
          "lab:read", "radiology:read", "pharmacy:dispense", "pharmacy:prescribe_read",
          "ai:clinical_reasoning", "ai:evidence_search", "ai:image_analysis", "ai:voice_command"
        ]
      },
      {
        role: "NURSE",
        description: "Staff Nurse / ICU Care Specialist",
        permissions: [
          "patient:read", "patient:read_clinical", "patient:write",
          "lab:read", "radiology:read", "pharmacy:prescribe_read",
          "order:create", "ai:voice_command"
        ]
      },
      {
        role: "RECEPTION",
        description: "Front Desk & OP Registration Staff",
        permissions: [
          "patient:read", "patient:write", "ai:voice_command"
        ]
      },
      {
        role: "PHARMACIST",
        description: "Chief Hospital Pharmacist",
        permissions: [
          "patient:read", "pharmacy:dispense", "pharmacy:prescribe_read", "pharmacy:inventory_write",
          "ai:voice_command"
        ]
      },
      {
        role: "LAB_TECH",
        description: "Laboratory Technician / Pathologist",
        permissions: [
          "patient:read", "lab:read", "lab:write_result", "lab:verify",
          "ai:voice_command"
        ]
      },
      {
        role: "RADIOLOGIST",
        description: "Consultant Radiologist",
        permissions: [
          "patient:read", "radiology:read", "radiology:report", "radiology:verify",
          "ai:image_analysis", "ai:voice_command"
        ]
      },
      {
        role: "OT_STAFF",
        description: "Operating Theatre Nursing & Technician Staff",
        permissions: [
          "patient:read", "patient:read_clinical", "order:create", "ai:voice_command"
        ]
      },
      {
        role: "BILLING",
        description: "Cashier & Hospital Billing Officer",
        permissions: [
          "patient:read", "billing:read", "billing:write", "billing:refund"
        ]
      },
      {
        role: "INSURANCE",
        description: "TPA & PMJAY Claims Coordinator",
        permissions: [
          "patient:read", "billing:read", "billing:write"
        ]
      },
      {
        role: "MANAGEMENT",
        description: "Hospital Operations Director / Medical Superintendent",
        permissions: [
          "patient:read", "lab:read", "radiology:read", "billing:read",
          "admin:agent", "admin:rbac"
        ]
      },
      {
        role: "CEO",
        description: "Chief Executive Officer / Managing Director",
        permissions: [
          "patient:read", "billing:read", "billing:write", "admin:agent",
          "admin:plugin", "admin:rbac", "ai:clinical_reasoning"
        ]
      },
      {
        role: "ADMIN",
        description: "System Administrator",
        permissions: [
          "patient:read", "patient:write", "lab:read", "lab:write_result", "lab:verify",
          "radiology:read", "radiology:report", "radiology:verify", "pharmacy:dispense",
          "pharmacy:prescribe_read", "pharmacy:inventory_write", "order:create", "order:cancel",
          "order:verify", "billing:read", "billing:write", "billing:refund", "admin:plugin",
          "admin:agent", "admin:rbac", "ai:clinical_reasoning", "ai:evidence_search",
          "ai:image_analysis", "ai:voice_command"
        ]
      },
      {
        role: "SYSTEM",
        description: "Autonomous Internal System & Scheduled Tasks",
        permissions: [
          "patient:read", "patient:write", "order:create", "order:verify",
          "lab:read", "radiology:read", "billing:read", "admin:agent"
        ]
      }
    ];

    for (const def of definitions) {
      this.roleMap.set(def.role, new Set(def.permissions));
    }
  }

  public hasPermission(role: HospitalRole, requiredPermission: string): boolean {
    const rolePerms = this.roleMap.get(role);
    if (!rolePerms) return false;
    return rolePerms.has(requiredPermission) || rolePerms.has("*");
  }

  public authorizeTools(role: HospitalRole, requiredPermissions: string[]): boolean {
    if (requiredPermissions.length === 0) return true;
    return requiredPermissions.every(perm => this.hasPermission(role, perm));
  }

  public getRolePermissions(role: HospitalRole): string[] {
    const perms = this.roleMap.get(role);
    return perms ? Array.from(perms) : [];
  }

  public grant(role: HospitalRole, permission: string): boolean {
    let perms = this.roleMap.get(role);
    if (!perms) return false;
    perms.add(permission);
    return true;
  }

  public grantMany(role: HospitalRole, permissions: string[]): number {
    const perms = this.roleMap.get(role);
    if (!perms) return 0;
    let granted = 0;
    for (const p of permissions) {
      if (!perms.has(p)) {
        perms.add(p);
        granted++;
      }
    }
    return granted;
  }
}

export const PermissionRegistry = new PermissionRegistryService();
