import { AstraUniversalOrder, OrderPriority, OrderType } from "./universalOrderTypes";

export interface HospitalActionResult {
  success: boolean;
  actionName: string;
  orderId?: string;
  timestamp: string;
  summary: string;
  patientName: string;
  bedNumber: string;
  destinationDept: string;
  order?: AstraUniversalOrder;
  receiptText: string;
  error?: string;
}

export interface MedicalImageDerivative {
  id: string;
  patientUhid: string;
  patientName: string;
  originalUrl: string;
  enhancedUrl?: string;
  annotatedUrl?: string;
  createdAt: string;
  author: string;
  enhancementsApplied: string[];
  annotations: {
    label: string;
    category: "OBSERVED" | "REFERENCE" | "AT_RISK" | "UNCERTAIN";
    notes: string;
    coordinates?: { x: number; y: number };
  }[];
  clinicalLimitationDisclaimer: string;
}

/**
 * Hospital Action Tool Execution Engine
 * Validates, executes, and records transactions in real time across departments
 */
export function executeHospitalAction(params: {
  actionName: string;
  patientUhid: string;
  patientName: string;
  bedNumber: string;
  orderType: OrderType;
  itemSummary: string;
  category: string;
  priority: OrderPriority;
  destinationDept: string;
  orderingDoctor: string;
  existingOrders?: AstraUniversalOrder[];
  customDetails?: any;
  approvalDecisionId?: string;
}): HospitalActionResult {
  const {
    actionName,
    patientUhid,
    patientName,
    bedNumber,
    orderType,
    itemSummary,
    category,
    priority,
    destinationDept,
    orderingDoctor,
    existingOrders = [],
    customDetails,
    approvalDecisionId,
  } = params;

  const nowStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // 1. Duplicate Order Check
  const duplicate = existingOrders.find(
    (o) =>
      o.patientUhid === patientUhid &&
      o.itemSummary.toLowerCase().trim() === itemSummary.toLowerCase().trim() &&
      o.status !== "COMPLETED" &&
      o.status !== "CANCELLED"
  );

  if (duplicate) {
    return {
      success: false,
      actionName,
      timestamp: nowStr,
      summary: `DUPLICATE WARNING: Order '${itemSummary}' already exists for ${patientName} (${bedNumber}) with status '${duplicate.status}' [ID: ${duplicate.orderId}].`,
      patientName,
      bedNumber,
      destinationDept,
      receiptText: `⚠ DUPLICATE DETECTED: Order ${duplicate.orderId} is currently ${duplicate.status}. Duplicate execution prevented.`,
      error: "DUPLICATE_ORDER",
    };
  }

  // 2. Generate Real Transaction ID
  const prefix = orderType.slice(0, 4);
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const orderId = `AST-${prefix}-2026-${randomNum}`;

  // 3. Create Universal Order Record
  const newOrder: AstraUniversalOrder = {
    orderId,
    patientUhid,
    patientName,
    bedNumber,
    orderType,
    itemSummary,
    category,
    priority,
    destinationDept,
    orderingDoctor,
    createdAt: nowStr,
    status: "SENT",
    closedLoopProgress: 20,
    orderDetails: customDetails,
    approvalDecisionId: approvalDecisionId || customDetails?.approvalDecisionId,
    timelineEvents: [
      {
        id: `t-${Date.now()}-1`,
        timestamp: nowStr,
        event: `Order '${itemSummary}' created via Astra Hospital Action Bus (${actionName})`,
        actor: orderingDoctor,
        dept: "Astra Command Interface",
      },
      {
        id: `t-${Date.now()}-2`,
        timestamp: nowStr,
        event: `Dispatched STAT to ${destinationDept} worklist`,
        actor: "System Router",
        dept: destinationDept,
      },
    ],
  };

  const receiptText = `✓ COMMAND EXECUTED SUCCESSFULLY
• Transaction ID: ${orderId}
• Patient: ${patientName} (${bedNumber})
• Order: ${itemSummary} (${priority})
• Target Department: ${destinationDept}
• Dispatched At: ${nowStr}
• Status: SENT (Closed-Loop Tracker Active - 20%)`;

  return {
    success: true,
    actionName,
    orderId,
    timestamp: nowStr,
    summary: `Order ${orderId} dispatched to ${destinationDept}`,
    patientName,
    bedNumber,
    destinationDept,
    order: newOrder,
    receiptText,
  };
}
