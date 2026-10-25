export type OrderType =
  | "LABORATORY"
  | "RADIOLOGY"
  | "PHARMACY"
  | "NURSING_WARD"
  | "CONSULTATION"
  | "SURGERY_OT"
  | "DIETARY"
  | "PHYSIOTHERAPY"
  | "BLOOD_BANK"
  | "DISCHARGE";

export type OrderPriority = "ROUTINE" | "URGENT" | "STAT" | "EMERGENCY";

export type OrderStatus =
  | "DRAFT"
  | "SENT"
  | "RECEIVED"
  | "ACCEPTED"
  | "IN_PROGRESS"
  | "SAMPLE_COLLECTED"
  | "RESULT_AVAILABLE"
  | "DOCTOR_REVIEWED"
  | "COMPLETED"
  | "CANCELLED"
  | "STUCK";

export interface TimelineEvent {
  id: string;
  timestamp: string;
  event: string;
  actor: string;
  dept: string;
}

export interface AstraUniversalOrder {
  orderId: string;
  patientUhid: string;
  patientName: string;
  bedNumber: string;
  orderType: OrderType;
  itemSummary: string; // e.g. "CBC / Complete Blood Count", "Chest X-Ray PA", "Paracetamol 650mg PO q6h"
  category: string;
  orderDetails?: any;
  priority: OrderPriority;
  destinationDept: string;
  orderingDoctor: string;
  createdAt: string;
  status: OrderStatus;
  closedLoopProgress: number; // 0-100%
  resultSummary?: string;
  resultDetails?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  isStuck?: boolean;
  stuckReason?: string;
  approvalDecisionId?: string;
  timelineEvents: TimelineEvent[];
}
