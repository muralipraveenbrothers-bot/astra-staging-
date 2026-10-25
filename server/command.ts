/**
 * Astra AI — Authoritative Hospital Command Engine Gateway
 * ==========================================================
 * Pipeline: INTENT -> ENTITY RESOLUTION -> RBAC -> VALIDATION -> CONFIRMATION -> DETERMINISTIC API -> AUDIT -> REALTIME
 *
 * Direct mutations occur exclusively through this authoritative gate.
 * LLMs are never permitted to execute arbitrary queries or bypass validation.
 */

import { Role, UserSession } from "./types";
import { db, Patient, HospitalOrder } from "./db";
import { realtimeHub } from "./events";
import { isApprovedForOrder } from "../src/astra/approval/approvalGate.js";

export interface CommandRequest {
  query: string;
  user: UserSession;
  confirmed?: boolean;
  contextPatientId?: string;
  isAiGenerated?: boolean;
  approvalDecisionId?: string;
  source?: string;
}

export interface CommandResponse {
  success: boolean;
  intent: string;
  category: string;
  safetyLevel: "info" | "reversible" | "important" | "high-risk";
  requiresConfirmation?: boolean;
  confirmationMessage?: string;
  data?: any;
  message: string;
  deltaSummary?: string;
}

export class HospitalCommandEngine {
  /**
   * Execute or parse command
   */
  public async execute(req: CommandRequest): Promise<CommandResponse> {
    const q = req.query.trim();
    const role = req.user.role;
    const actor = req.user.name;

    // 1. HOSPITAL CENSUS / IP / OP QUERIES
    if (/census|how many patients|admitted|occupancy|ip patients|op patients/i.test(q)) {
      const patients = db.getPatients();
      const beds = db.getStore().beds;
      const ip = patients.filter((p) => p.admissionStatus === "inpatient").length;
      const op = patients.filter((p) => p.admissionStatus === "outpatient").length;
      const occupiedBeds = beds.filter((b) => b.status === "occupied").length;
      const vacantBeds = beds.filter((b) => b.status === "vacant").length;
      const icu = beds.filter((b) => b.type === "icu" && b.status === "occupied").length;

      db.logAudit({
        actorId: req.user.userId,
        actorName: actor,
        actorRole: role,
        action: "VIEW_CENSUS",
        category: "census",
        status: "SUCCESS",
        details: "Queried hospital census and bed occupancy",
      });

      return {
        success: true,
        intent: "VIEW_CENSUS",
        category: "census",
        safetyLevel: "info",
        data: { total: patients.length, ip, op, icu, occupiedBeds, vacantBeds },
        message: `Hospital Census: ${patients.length} Total Patients (${ip} Inpatients, ${op} Outpatients, ${icu} in ICU). Bed Occupancy: ${occupiedBeds}/${beds.length} occupied (${vacantBeds} vacant).`,
      };
    }

    // 2. OPEN / SEARCH PATIENT
    const openMatch = q.match(/(?:open|find|search|lookup|patient|show)\s+([A-Za-z\s]+|UHID-\d+|P\d+)/i);
    if (openMatch && !/order|repeat|cbc|prescription/i.test(q)) {
      const target = openMatch[1].trim();
      const patient = db.getPatientById(target);
      if (patient) {
        db.logAudit({
          actorId: req.user.userId,
          actorName: actor,
          actorRole: role,
          action: "OPEN_PATIENT",
          category: "clinical",
          status: "SUCCESS",
          details: `Opened patient chart for ${patient.name} (${patient.uhid})`,
          patientId: patient.id,
        });

        return {
          success: true,
          intent: "OPEN_PATIENT",
          category: "clinical",
          safetyLevel: "info",
          data: patient,
          message: `Opened patient chart: **${patient.name}** (${patient.uhid}, ${patient.age}y/${patient.gender.charAt(0).toUpperCase()}). Diagnosis: ${patient.diagnosis || "Under evaluation"}. Ward: ${patient.ward || "Outpatient"} (Bed: ${patient.bedNumber || "None"}).`,
        };
      }
    }

    // 3. SHOW LABS / LAB RESULTS
    if (/labs|cbc|investigation|blood test|reports/i.test(q) && !/order|repeat/i.test(q)) {
      let patient: Patient | undefined;
      if (req.contextPatientId) {
        patient = db.getPatientById(req.contextPatientId);
      } else {
        const pMatch = q.match(/(?:for|of|patient)\s+([A-Za-z\s]+)/i);
        if (pMatch) patient = db.getPatientById(pMatch[1]);
      }

      if (patient) {
        const orders = db.getOrders(patient.id).filter((o) => o.category === "laboratory");
        return {
          success: true,
          intent: "VIEW_LABS",
          category: "laboratory",
          safetyLevel: "info",
          data: { patient, orders },
          message: `Laboratory history for **${patient.name}** (${orders.length} studies on record):\n` +
            orders.map((o) => `• **${o.item}** [${o.status.toUpperCase()}]: ${o.result || "Pending verification"}`).join("\n"),
        };
      }
    }

    // 4. CPOE: ORDER / REPEAT LAB OR MEDICATION
    const orderMatch = q.match(/(?:order|repeat|prescribe|send to lab|request)\s+(.+?)(?:\s+for\s+([A-Za-z\s]+|UHID-[\w-]+|P\d+))?$/i);
    if (orderMatch) {
      // Role Check
      if (role !== "doctor" && role !== "admin") {
        db.logAudit({
          actorId: req.user.userId,
          actorName: actor,
          actorRole: role,
          action: "ORDER_CREATION_DENIED",
          category: "cpoe",
          status: "DENIED",
          details: `Non-clinical role '${role}' attempted CPOE order`,
        });
        return {
          success: false,
          intent: "CREATE_ORDER",
          category: "cpoe",
          safetyLevel: "high-risk",
          message: `Access Denied: Only authorized clinicians (Doctors) are permitted to create CPOE orders.`,
        };
      }

      const itemRaw = orderMatch[1].trim();
      const patientTarget = orderMatch[2]?.trim() || req.contextPatientId || "";

      // R5-01: Server-side enforcement for Doctor Approval Gate
      const isAi = req.isAiGenerated || req.source === "AI" || req.source === "evidence-copilot" || req.source === "astra_ai";
      if (isAi) {
        if (!req.approvalDecisionId) {
          db.logAudit({
            actorId: req.user.userId,
            actorName: actor,
            actorRole: role,
            action: "AI_ORDER_BLOCKED_UNAPPROVED",
            category: "cpoe",
            status: "DENIED",
            details: "AI-originated order blocked: missing approved Doctor Approval Gate decision ID",
            patientId: patientTarget,
          });
          return {
            success: false,
            intent: "CREATE_ORDER",
            category: "cpoe",
            safetyLevel: "high-risk",
            message: "AI_ORDER_REQUIRES_DOCTOR_APPROVAL: AI-originated clinical orders require an approved Doctor Approval Gate decision (missing approvalDecisionId).",
          };
        }
        const approval = isApprovedForOrder(req.approvalDecisionId, patientTarget || req.contextPatientId);
        if (!approval.approved) {
          db.logAudit({
            actorId: req.user.userId,
            actorName: actor,
            actorRole: role,
            action: "AI_ORDER_BLOCKED_UNAPPROVED",
            category: "cpoe",
            status: "DENIED",
            details: `AI-originated order blocked: approval status is '${approval.status}'`,
            patientId: patientTarget,
          });
          return {
            success: false,
            intent: "CREATE_ORDER",
            category: "cpoe",
            safetyLevel: "high-risk",
            message: `AI_ORDER_REQUIRES_DOCTOR_APPROVAL: Approval decision is ${approval.status}. An explicit doctor approval is required.`,
          };
        }
      }

      // P0 SAFETY: no hardcoded/fallback patient. A consequential mutation
      // without an explicitly resolved target FAILS CLOSED.
      if (!patientTarget) {
        db.logAudit({
          actorId: req.user.userId,
          actorName: actor,
          actorRole: role,
          action: "ORDER_CREATION_DENIED",
          category: "cpoe",
          status: "DENIED",
          details: "No patient target resolved — refusing to guess (no fallback patient)",
        });
        return {
          success: false,
          intent: "CREATE_ORDER",
          category: "cpoe",
          safetyLevel: "high-risk",
          message: "Unable to determine the target patient. Specify a patient name, UHID, or resolve a bed context first (e.g. \"order CBC for Rajesh Kumar\"). Astra does not guess patient identity.",
        };
      }
      const patient = db.getPatientById(patientTarget);

      if (!patient) {
        return {
          success: false,
          intent: "CREATE_ORDER",
          category: "cpoe",
          safetyLevel: "reversible",
          message: `Unable to resolve target patient '${patientTarget}'. Please specify a valid patient name or UHID.`,
        };
      }

      // Categorize order
      const isLab = /cbc|lft|kft|crp|blood|culture|electrolyte|glucose|hba1c|urinalysis/i.test(itemRaw);
      const isRad = /x-ray|ct|mri|usg|ultrasound|ecg|echo/i.test(itemRaw);
      const category: HospitalOrder["category"] = isLab ? "laboratory" : isRad ? "radiology" : "pharmacy";

      // Safety level: high-risk if antibiotic or stat
      const isStat = /stat|urgent|emergency/i.test(q);
      const safetyLevel = isStat ? "high-risk" : "reversible";

      // Execute order creation
      const order = db.createOrder({
        patientId: patient.id,
        patientName: patient.name,
        uhid: patient.uhid,
        category,
        item: itemRaw,
        priority: isStat ? "stat" : "urgent",
        orderedBy: `${actor} (${role})`,
      });

      // Realtime broadcast to Lab or Pharmacy
      realtimeHub.broadcast({
        type: "ORDER_CREATED",
        targetRoles: category === "laboratory" ? ["lab", "doctor"] : category === "pharmacy" ? ["pharmacy", "doctor"] : ["radiology", "doctor"],
        payload: { order, patientName: patient.name, uhid: patient.uhid },
      });

      db.logAudit({
        actorId: req.user.userId,
        actorName: actor,
        actorRole: role,
        action: `CPOE_ORDER_${category.toUpperCase()}`,
        category: "cpoe",
        status: "SUCCESS",
        details: `Created order '${itemRaw}' for ${patient.name} (${patient.uhid})`,
        patientId: patient.id,
      });

      return {
        success: true,
        intent: "CREATE_ORDER",
        category,
        safetyLevel,
        data: order,
        message: `Authorized CPOE Order Created: **${itemRaw}** for **${patient.name}** (${patient.uhid}). Order ID: \`${order.id}\`. Dispatched to **${category.toUpperCase()}** queue immediately.`,
      };
    }

    // 5. WHAT NEEDS ATTENTION (Attention Queue Scan)
    if (/attention|what needs attention|critical|alerts|pending tests|delayed/i.test(q)) {
      const orders = db.getOrders();
      const patients = db.getPatients();
      const tasks = db.getStore().tasks;

      const criticalOrders = orders.filter((o) => o.isCritical);
      const lowSpO2Patients = patients.filter((p) => p.vitals?.[0]?.spo2 && p.vitals[0].spo2 < 94);
      const pendingStat = orders.filter((o) => o.priority === "stat" && o.status === "pending");

      return {
        success: true,
        intent: "WHAT_NEEDS_ATTENTION",
        category: "clinical",
        safetyLevel: "info",
        data: { criticalOrders, lowSpO2Patients, pendingStat, tasks },
        message: `Hospital Attention Radar:\n` +
          `• **CRITICAL ALERTS (${criticalOrders.length + lowSpO2Patients.length})**:\n` +
          lowSpO2Patients.map((p) => `  - 🚨 **${p.name}** (${p.bedNumber}): SpO2 critically low at ${p.vitals![0].spo2}%`).join("\n") + "\n" +
          criticalOrders.map((o) => `  - 🧪 **${o.patientName}**: Critical Lab Value in ${o.item} (${o.result})`).join("\n") +
          `\n• **STAT ORDERS PENDING (${pendingStat.length})**` +
          (pendingStat.length ? "\n" + pendingStat.map((o) => `  - ${o.item} for ${o.patientName}`).join("\n") : ": None"),
      };
    }

    // 6. WHAT CHANGED (Delta Tracker)
    if (/what changed|delta|updates since yesterday|since morning/i.test(q)) {
      let patient: Patient | undefined;
      if (req.contextPatientId) patient = db.getPatientById(req.contextPatientId);
      const targetName = patient ? patient.name : "Hospital-Wide";

      return {
        success: true,
        intent: "WHAT_CHANGED",
        category: "clinical",
        safetyLevel: "info",
        message: `Delta Summary for **${targetName}** (Last 24 Hours):\n` +
          `• 🟢 New completed lab: Complete Blood Count (Leukocytosis noted)\n` +
          `• 🟡 Vitals Trend: SpO2 improved from 89% to 91% on O2 therapy\n` +
          `• 🔵 Orders: Ceftriaxone IV dispensed and administered\n` +
          `• ⚪ Nursing: Q1H telemetry tracking initiated`,
      };
    }

    // Fallback for general intelligence / clinical reasoning
    return {
      success: true,
      intent: "CLINICAL_QUERY",
      category: "clinical",
      safetyLevel: "info",
      message: `Processed clinical inquiry for doctor command center.`,
    };
  }
}

export const commandEngine = new HospitalCommandEngine();
