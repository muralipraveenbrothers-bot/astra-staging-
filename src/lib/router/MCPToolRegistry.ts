/**
 * ASTRA AI — MCP TOOL REGISTRY
 * 
 * Exposes hospital systems as MCP-compatible tool definitions.
 * Each tool has RBAC filtering via AstraMatrices permission scopes.
 * 
 * Namespaces:
 *   mcp-hospital  — census, beds, OT status
 *   mcp-clinical  — patient records, vitals, timeline
 *   mcp-laboratory — lab queue, orders, results
 *   mcp-radiology — radiology queue, orders, reports
 *   mcp-pharmacy  — pharmacy queue, prescriptions, med history
 *   mcp-billing   — billing summary, insurance, clearance
 */

import type { MCPToolDefinition } from "./types";

// ─── Tool Definitions ────────────────────────────────────────────

const MCP_TOOLS: MCPToolDefinition[] = [
  // ── Hospital Operations ──────────────────────────────────
  {
    name: "get_ip_patients",
    description: "Get the list of all current inpatients with bed assignments, diagnoses, and attending doctors.",
    namespace: "mcp-hospital",
    inputSchema: {
      type: "object",
      properties: {
        ward: { type: "string", description: "Filter by ward name" },
        department: { type: "string", description: "Filter by department" },
      },
    },
    outputSchema: {
      type: "array",
      items: { type: "object", properties: { uhid: { type: "string" }, name: { type: "string" }, bed: { type: "string" }, diagnosis: { type: "string" } } },
    },
    requiredPermissions: ["READ_PATIENT_BASIC", "READ_HOSPITAL_CENSUS"],
    riskLevel: "LOW",
  },
  {
    name: "get_bed_status",
    description: "Get real-time bed occupancy status across all wards.",
    namespace: "mcp-hospital",
    inputSchema: {
      type: "object",
      properties: {
        ward: { type: "string", description: "Optional ward filter" },
      },
    },
    outputSchema: {
      type: "object",
      properties: { total: { type: "number" }, occupied: { type: "number" }, available: { type: "number" } },
    },
    requiredPermissions: ["READ_HOSPITAL_CENSUS"],
    riskLevel: "LOW",
  },
  {
    name: "get_ot_status",
    description: "Get real-time Operation Theater status — which OTs are in use, idle, or under fumigation.",
    namespace: "mcp-hospital",
    inputSchema: {
      type: "object",
      properties: {},
    },
    outputSchema: {
      type: "array",
      items: { type: "object", properties: { otNumber: { type: "number" }, status: { type: "string" }, procedure: { type: "string" }, surgeon: { type: "string" } } },
    },
    requiredPermissions: ["READ_HOSPITAL_CENSUS"],
    riskLevel: "LOW",
  },
  {
    name: "get_hospital_census",
    description: "Get hospital-wide census: total IP, OP, ICU, emergency counts.",
    namespace: "mcp-hospital",
    inputSchema: { type: "object", properties: {} },
    outputSchema: {
      type: "object",
      properties: { ip: { type: "number" }, op: { type: "number" }, icu: { type: "number" }, emergency: { type: "number" } },
    },
    requiredPermissions: ["READ_HOSPITAL_CENSUS"],
    riskLevel: "LOW",
  },

  // ── Clinical ─────────────────────────────────────────────
  {
    name: "get_patient",
    description: "Get detailed patient record by UHID including demographics, history, and active problems.",
    namespace: "mcp-clinical",
    inputSchema: {
      type: "object",
      properties: {
        uhid: { type: "string", description: "Patient UHID" },
      },
      required: ["uhid"],
    },
    outputSchema: {
      type: "object",
      properties: { uhid: { type: "string" }, name: { type: "string" }, age: { type: "number" }, history: { type: "array" } },
    },
    requiredPermissions: ["READ_PATIENT_BASIC", "READ_PATIENT_CLINICAL"],
    riskLevel: "LOW",
  },
  {
    name: "get_vitals",
    description: "Get latest vital signs for a patient: BP, HR, SpO2, temperature, RR.",
    namespace: "mcp-clinical",
    inputSchema: {
      type: "object",
      properties: {
        uhid: { type: "string", description: "Patient UHID" },
      },
      required: ["uhid"],
    },
    outputSchema: {
      type: "object",
      properties: { bp: { type: "string" }, hr: { type: "number" }, spo2: { type: "number" }, temp: { type: "number" }, rr: { type: "number" } },
    },
    requiredPermissions: ["READ_PATIENT_CLINICAL"],
    riskLevel: "LOW",
  },
  {
    name: "get_timeline",
    description: "Get chronological timeline of patient events: admissions, procedures, orders, vitals.",
    namespace: "mcp-clinical",
    inputSchema: {
      type: "object",
      properties: {
        uhid: { type: "string", description: "Patient UHID" },
        hours: { type: "number", description: "Hours of history to retrieve (default: 24)" },
      },
      required: ["uhid"],
    },
    outputSchema: {
      type: "array",
      items: { type: "object", properties: { time: { type: "string" }, event: { type: "string" }, details: { type: "string" } } },
    },
    requiredPermissions: ["READ_PATIENT_CLINICAL"],
    riskLevel: "LOW",
  },
  {
    name: "write_clinical_note",
    description: "Write a clinical note (progress note, procedure note, or consultation note) for a patient.",
    namespace: "mcp-clinical",
    inputSchema: {
      type: "object",
      properties: {
        uhid: { type: "string", description: "Patient UHID" },
        noteType: { type: "string", enum: ["progress", "procedure", "consultation", "discharge"] },
        content: { type: "string", description: "Note content" },
      },
      required: ["uhid", "noteType", "content"],
    },
    outputSchema: {
      type: "object",
      properties: { noteId: { type: "string" }, status: { type: "string" } },
    },
    requiredPermissions: ["WRITE_PATIENT_NOTES"],
    riskLevel: "IMPORTANT",
  },

  // ── Laboratory ───────────────────────────────────────────
  {
    name: "get_lab_queue",
    description: "Get pending lab orders and their current status (ordered, collected, processing, reported).",
    namespace: "mcp-laboratory",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pending", "collected", "processing", "reported"] },
      },
    },
    outputSchema: {
      type: "array",
      items: { type: "object", properties: { orderId: { type: "string" }, test: { type: "string" }, patient: { type: "string" }, status: { type: "string" } } },
    },
    requiredPermissions: ["ORDER_LABS"],
    riskLevel: "LOW",
  },
  {
    name: "create_lab_order",
    description: "Create a new laboratory order for a patient (CBC, RFT, LFT, coagulation, etc.).",
    namespace: "mcp-laboratory",
    inputSchema: {
      type: "object",
      properties: {
        uhid: { type: "string", description: "Patient UHID" },
        tests: { type: "array", items: { type: "string" }, description: "List of test codes" },
        priority: { type: "string", enum: ["routine", "urgent", "stat"] },
        clinicalNotes: { type: "string" },
      },
      required: ["uhid", "tests"],
    },
    outputSchema: {
      type: "object",
      properties: { orderId: { type: "string" }, status: { type: "string" }, estimatedTime: { type: "string" } },
    },
    requiredPermissions: ["ORDER_LABS"],
    riskLevel: "IMPORTANT",
  },
  {
    name: "get_lab_result",
    description: "Get lab test results by order ID or patient UHID.",
    namespace: "mcp-laboratory",
    inputSchema: {
      type: "object",
      properties: {
        orderId: { type: "string" },
        uhid: { type: "string" },
      },
    },
    outputSchema: {
      type: "object",
      properties: { results: { type: "array" }, reportedAt: { type: "string" } },
    },
    requiredPermissions: ["READ_PATIENT_CLINICAL"],
    riskLevel: "LOW",
  },

  // ── Radiology ────────────────────────────────────────────
  {
    name: "get_radiology_queue",
    description: "Get pending radiology orders and their status.",
    namespace: "mcp-radiology",
    inputSchema: {
      type: "object",
      properties: {
        modality: { type: "string", enum: ["xray", "ct", "mri", "ultrasound", "ecg", "echo"] },
      },
    },
    outputSchema: {
      type: "array",
      items: { type: "object", properties: { orderId: { type: "string" }, modality: { type: "string" }, patient: { type: "string" }, status: { type: "string" } } },
    },
    requiredPermissions: ["ORDER_RADIOLOGY"],
    riskLevel: "LOW",
  },
  {
    name: "create_radiology_order",
    description: "Create a new radiology/imaging order (X-ray, CT, MRI, ultrasound, ECG, Echo).",
    namespace: "mcp-radiology",
    inputSchema: {
      type: "object",
      properties: {
        uhid: { type: "string", description: "Patient UHID" },
        modality: { type: "string", enum: ["xray", "ct", "mri", "ultrasound", "ecg", "echo"] },
        bodyPart: { type: "string", description: "Body part/region to image" },
        clinicalIndication: { type: "string" },
        priority: { type: "string", enum: ["routine", "urgent", "stat"] },
      },
      required: ["uhid", "modality", "bodyPart"],
    },
    outputSchema: {
      type: "object",
      properties: { orderId: { type: "string" }, status: { type: "string" }, scheduledTime: { type: "string" } },
    },
    requiredPermissions: ["ORDER_RADIOLOGY"],
    riskLevel: "IMPORTANT",
  },

  // ── Pharmacy ─────────────────────────────────────────────
  {
    name: "get_pharmacy_queue",
    description: "Get pending prescriptions awaiting dispensing.",
    namespace: "mcp-pharmacy",
    inputSchema: {
      type: "object",
      properties: {},
    },
    outputSchema: {
      type: "array",
      items: { type: "object", properties: { rxId: { type: "string" }, patient: { type: "string" }, medications: { type: "array" }, status: { type: "string" } } },
    },
    requiredPermissions: ["DISPENSE_MEDS"],
    riskLevel: "LOW",
  },
  {
    name: "create_prescription",
    description: "Create a new prescription for a patient with drug, dose, route, frequency, and duration.",
    namespace: "mcp-pharmacy",
    inputSchema: {
      type: "object",
      properties: {
        uhid: { type: "string", description: "Patient UHID" },
        medications: {
          type: "array",
          items: {
            type: "object",
            properties: {
              drug: { type: "string" },
              dose: { type: "string" },
              route: { type: "string", enum: ["oral", "iv", "im", "sc", "topical", "inhaled"] },
              frequency: { type: "string" },
              duration: { type: "string" },
            },
          },
        },
      },
      required: ["uhid", "medications"],
    },
    outputSchema: {
      type: "object",
      properties: { rxId: { type: "string" }, status: { type: "string" } },
    },
    requiredPermissions: ["DISPENSE_MEDS"],
    riskLevel: "HIGH_RISK",
  },
  {
    name: "get_medication_history",
    description: "Get medication history for a patient including active and past prescriptions.",
    namespace: "mcp-pharmacy",
    inputSchema: {
      type: "object",
      properties: {
        uhid: { type: "string", description: "Patient UHID" },
      },
      required: ["uhid"],
    },
    outputSchema: {
      type: "array",
      items: { type: "object", properties: { drug: { type: "string" }, startDate: { type: "string" }, endDate: { type: "string" }, active: { type: "boolean" } } },
    },
    requiredPermissions: ["READ_PATIENT_CLINICAL"],
    riskLevel: "LOW",
  },

  // ── Billing ──────────────────────────────────────────────
  {
    name: "get_billing_summary",
    description: "Get billing summary: today's collections, pending bills, insurance claims.",
    namespace: "mcp-billing",
    inputSchema: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["today", "week", "month"] },
      },
    },
    outputSchema: {
      type: "object",
      properties: { totalCollections: { type: "number" }, pending: { type: "number" }, insuranceClaims: { type: "number" } },
    },
    requiredPermissions: ["READ_FINANCE"],
    riskLevel: "LOW",
  },
  {
    name: "get_insurance_status",
    description: "Get insurance pre-authorization status for a patient's procedure.",
    namespace: "mcp-billing",
    inputSchema: {
      type: "object",
      properties: {
        uhid: { type: "string", description: "Patient UHID" },
      },
      required: ["uhid"],
    },
    outputSchema: {
      type: "object",
      properties: { status: { type: "string" }, provider: { type: "string" }, preAuthAmount: { type: "number" } },
    },
    requiredPermissions: ["READ_FINANCE"],
    riskLevel: "LOW",
  },
  {
    name: "grant_billing_clearance",
    description: "Grant billing clearance for a patient's discharge or OT procedure.",
    namespace: "mcp-billing",
    inputSchema: {
      type: "object",
      properties: {
        uhid: { type: "string", description: "Patient UHID" },
        purpose: { type: "string", enum: ["discharge", "ot_procedure", "transfer"] },
        approvedBy: { type: "string" },
      },
      required: ["uhid", "purpose"],
    },
    outputSchema: {
      type: "object",
      properties: { clearanceId: { type: "string" }, status: { type: "string" } },
    },
    requiredPermissions: ["READ_FINANCE"],
    riskLevel: "IMPORTANT",
  },
];

// ─── MCP Tool Registry Service ───────────────────────────────────

class MCPToolRegistryService {
  private tools: MCPToolDefinition[] = [...MCP_TOOLS];

  /**
   * Get all registered MCP tools.
   */
  getAll(): MCPToolDefinition[] {
    return [...this.tools];
  }

  /**
   * Get tools by namespace.
   */
  getByNamespace(namespace: string): MCPToolDefinition[] {
    return this.tools.filter((t) => t.namespace === namespace);
  }

  /**
   * Get a specific tool by name.
   */
  get(name: string): MCPToolDefinition | undefined {
    return this.tools.find((t) => t.name === name);
  }

  /**
   * Filter tools by user permissions (RBAC).
   */
  getAccessible(userPermissions: string[]): MCPToolDefinition[] {
    return this.tools.filter((tool) =>
      tool.requiredPermissions.every((perm) => userPermissions.includes(perm))
    );
  }

  /**
   * Get tools grouped by namespace for dashboard display.
   */
  getGrouped(): Record<string, MCPToolDefinition[]> {
    const grouped: Record<string, MCPToolDefinition[]> = {};
    for (const tool of this.tools) {
      if (!grouped[tool.namespace]) grouped[tool.namespace] = [];
      grouped[tool.namespace].push(tool);
    }
    return grouped;
  }

  /**
   * Get all unique namespaces.
   */
  getNamespaces(): string[] {
    return [...new Set(this.tools.map((t) => t.namespace))];
  }

  /**
   * Get summary statistics.
   */
  getSummary(): { total: number; namespaces: number; highRisk: number } {
    return {
      total: this.tools.length,
      namespaces: this.getNamespaces().length,
      highRisk: this.tools.filter((t) => t.riskLevel === "HIGH_RISK" || t.riskLevel === "CLINICAL").length,
    };
  }

  /**
   * Export tools as MCP-compatible JSON for external MCP servers.
   */
  exportMCPManifest(): object {
    return {
      name: "astra-hospital-tools",
      version: "1.0.0",
      description: "ASTRA AI Hospital Command Center MCP Tool Suite",
      tools: this.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      })),
    };
  }
}

// ─── Singleton Export ─────────────────────────────────────────────

export const mcpToolRegistry = new MCPToolRegistryService();
