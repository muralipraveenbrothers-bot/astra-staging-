import { ToolRegistry } from "../../../agents/core/ToolRegistry";
import { PermissionRegistry } from "../../../agents/core/PermissionRegistry";
import type { HospitalRole } from "../../../agents/core/AgentDefinition";

export interface SaarathiActor { userId: string; name: string; role: string }
const ROLE_MAP: Record<string, HospitalRole> = { doctor:"DOCTOR", ward:"NURSE", reception:"RECEPTION", pharmacy:"PHARMACIST", lab:"LAB_TECH", radiology:"RADIOLOGIST", ot:"OT_STAFF", billing:"BILLING", insurance:"INSURANCE", accounts:"MANAGEMENT", ceo:"CEO", admin:"ADMIN" };

export class AstraActionBroker {
  async execute(actor: SaarathiActor, request: { tool: string; args: unknown; confirmed?: boolean; source?: string }) {
    const tool = ToolRegistry.get(request.tool);
    if (!tool) throw new Error(`Unknown Astra tool: ${request.tool}`);
    const role = ROLE_MAP[actor.role.toLowerCase()];
    if (!role || !PermissionRegistry.authorizeTools(role, tool.requiredPermissions)) throw new Error(`Role ${actor.role} is not permitted to use ${request.tool}.`);
    const consequential = tool.readOrWrite === "WRITE" || tool.riskLevel === "HIGH_RISK" || tool.riskLevel === "CRITICAL" || tool.confirmationRequired;
    if (request.source === "gesture" && consequential) throw new Error("A gesture cannot confirm a consequential hospital action.");
    if (consequential && !request.confirmed) return { executed:false, confirmationRequired:true, tool:request.tool, risk:tool.riskLevel };
    const result = await ToolRegistry.execute(request.tool, request.args, { actor });
    return { executed:true, confirmationRequired:false, tool:request.tool, result };
  }
}

export const astraActionBroker = new AstraActionBroker();
