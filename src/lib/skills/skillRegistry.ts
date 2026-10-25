// ASTRA AI — Unified Clinical & Operational Skill Registry v1.0
import { z } from "zod";

export type RiskLevel = "low" | "moderate" | "high" | "critical";
export type ConfirmationPolicy = "none" | "implicit" | "explicit_confirmation" | "doctor_signature";
export type DepartmentScope =
  | "clinical"
  | "reception"
  | "opd"
  | "ward"
  | "icu"
  | "ot"
  | "lab"
  | "usg"
  | "radiology"
  | "pharmacy"
  | "billing"
  | "discharge"
  | "cmrf"
  | "communication"
  | "printing";

export interface SkillDefinition<TInput = any, TOutput = any> {
  skillId: string;
  name: string;
  description: string;
  category: DepartmentScope;
  requiredRole: string[];
  riskLevel: RiskLevel;
  confirmationPolicy: ConfirmationPolicy;
  inputSchema: z.ZodType<TInput>;
  executionHandler: (input: TInput, context: Record<string, any>) => Promise<TOutput>;
}

class SkillRegistryService {
  private skills = new Map<string, SkillDefinition>();

  register<TInput, TOutput>(skill: SkillDefinition<TInput, TOutput>) {
    this.skills.set(skill.skillId, skill);
  }

  get(skillId: string): SkillDefinition | undefined {
    return this.skills.get(skillId);
  }

  list(category?: DepartmentScope): SkillDefinition[] {
    const all = Array.from(this.skills.values());
    if (!category) return all;
    return all.filter((s) => s.category === category);
  }

  async execute(skillId: string, input: any, context: Record<string, any> = {}) {
    const skill = this.get(skillId);
    if (!skill) {
      throw new Error(`Skill ${skillId} not registered.`);
    }

    // Validate input against Zod schema
    const parsed = skill.inputSchema.parse(input);

    // Audit logging payload
    const auditId = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const auditRecord = {
      auditId,
      skillId,
      user: context.user || "Dr. Murali Praveen",
      role: context.role || "Doctor",
      patientId: context.patientId || null,
      timestamp: new Date().toISOString(),
      parsedInput: parsed,
      riskLevel: skill.riskLevel,
      confirmationPolicy: skill.confirmationPolicy,
    };

    console.log(`[SkillRegistry] Executing ${skillId} (${auditId}):`, auditRecord);

    const result = await skill.executionHandler(parsed, context);
    return { auditId, result };
  }
}

export const skillRegistry = new SkillRegistryService();

// ─────────────────────────────────────────────────────────────────────────────
// REGISTER CORE HOSPITAL SKILLS
// ─────────────────────────────────────────────────────────────────────────────

// 1. Patient Search & Snapshot Skill
skillRegistry.register({
  skillId: "patient.search",
  name: "Search Patient Record",
  description: "Find patient by Name, UHID, Bed, or Ward location",
  category: "clinical",
  requiredRole: ["Doctor", "Nurse", "Admin", "Reception"],
  riskLevel: "low",
  confirmationPolicy: "none",
  inputSchema: z.object({
    query: z.string(),
  }),
  executionHandler: async (input) => {
    return {
      query: input.query,
      matches: [
        {
          id: "p-101",
          uhid: "UHID-2026-8841",
          name: "Ramesh Kumar",
          age: 45,
          gender: "Male",
          ward: "General Ward 2",
          bed: "Bed 1",
          consultant: "Dr. Murali Praveen",
          diagnosis: "Acute Bronchial Asthma / Lower Lobe Pneumonia",
          status: "ADMITTED",
          vitals: { hr: 88, bp: "128/82", spo2: 98, temp: "99.1°F" },
        },
      ],
    };
  },
});

// 2. Ward & Bed Census Query Skill
skillRegistry.register({
  skillId: "ward.bed_status",
  name: "Query Bed & Ward Status",
  description: "Inspect live occupancy, active admission, and vitals for a specific bed",
  category: "ward",
  requiredRole: ["Doctor", "Nurse", "Admin"],
  riskLevel: "low",
  confirmationPolicy: "none",
  inputSchema: z.object({
    ward: z.string().optional(),
    bedNumber: z.string(),
  }),
  executionHandler: async (input) => {
    return {
      resolvedBed: input.bedNumber,
      ward: input.ward || "General Ward 2",
      occupied: true,
      patient: {
        id: "p-101",
        uhid: "UHID-2026-8841",
        ipNumber: "IP-2026-4421",
        name: "Ramesh Kumar",
        age: 45,
        gender: "Male",
        admissionDate: "2026-09-08T10:30:00Z",
        consultant: "Dr. Murali Praveen",
        diagnosis: "Acute Exacerbation COPD / Lower Lobe Pneumonia",
        vitals: { hr: 84, bp: "124/80", temp: "98.6°F", spo2: 98, rr: 18 },
        allergies: ["Penicillin"],
        latestLabs: [
          { test: "Hb", value: "12.4 g/dL", status: "NORMAL" },
          { test: "WBC", value: "11,800 /mm³", status: "ELEVATED" },
          { test: "Creatinine", value: "0.9 mg/dL", status: "NORMAL" },
          { test: "Potassium", value: "4.2 mmol/L", status: "NORMAL" },
        ],
        activeMeds: ["Tab Augmentin 625mg BD", "Neb Duolin t.d.s", "Inj Hydrocortisone 100mg IV"],
        pendingOrders: ["Repeat CBC tomorrow 7 AM"],
      },
    };
  },
});

// 3. Laboratory Order Creation Skill
skillRegistry.register({
  skillId: "lab.order",
  name: "Create Laboratory Order",
  description: "Generate structured lab order for active patient admission",
  category: "lab",
  requiredRole: ["Doctor"],
  riskLevel: "moderate",
  confirmationPolicy: "implicit",
  inputSchema: z.object({
    patientId: z.string(),
    tests: z.array(z.string()),
    priority: z.enum(["routine", "urgent", "stat"]),
    scheduleTime: z.string().optional(),
    instructions: z.string().optional(),
  }),
  executionHandler: async (input) => {
    const orderId = `LAB-${Date.now().toString().slice(-6)}`;
    return {
      orderId,
      status: "QUEUED",
      acknowledged: true,
      department: "Laboratory",
      tests: input.tests,
      priority: input.priority,
      message: `Lab Order ${orderId} created for [${input.tests.join(", ")}]. Transmitted to Laboratory Dashboard.`,
    };
  },
});

// 4. Reception Print OPD Slip Skill
skillRegistry.register({
  skillId: "opd.print",
  name: "Print OP Slip at Reception",
  description: "Dispatch finalized OP slip or prescription to Reception printer",
  category: "printing",
  requiredRole: ["Doctor", "Reception"],
  riskLevel: "low",
  confirmationPolicy: "none",
  inputSchema: z.object({
    encounterId: z.string(),
    patientName: z.string(),
    printerTarget: z.string().default("Reception-Printer-01"),
  }),
  executionHandler: async (input) => {
    const printJobId = `PRN-${Date.now().toString().slice(-6)}`;
    return {
      printJobId,
      status: "PRINTED",
      printer: input.printerTarget,
      timestamp: new Date().toLocaleTimeString(),
      message: `OP Slip #${printJobId} sent to ${input.printerTarget}. Acknowledged by Receptionist. Status: Printed.`,
    };
  },
});

// 5. Interdepartmental Audio/Video Communication Skill
skillRegistry.register({
  skillId: "communication.call",
  name: "Call Department / Ward",
  description: "Initiate instant WebRTC audio/video call to Ward, ICU, Pharmacy or Lab",
  category: "communication",
  requiredRole: ["Doctor", "Nurse", "Admin"],
  riskLevel: "low",
  confirmationPolicy: "none",
  inputSchema: z.object({
    targetDepartment: z.string(),
    callType: z.enum(["audio", "video"]).default("audio"),
  }),
  executionHandler: async (input) => {
    const channelId = `call-${input.targetDepartment.toLowerCase().replace(/\s+/g, "_")}-${Date.now().toString().slice(-4)}`;
    return {
      channelId,
      status: "RINGING",
      target: input.targetDepartment,
      callType: input.callType,
      message: `Connecting ${input.callType} call to ${input.targetDepartment}...`,
    };
  },
});
