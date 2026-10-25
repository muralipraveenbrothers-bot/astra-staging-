/**
 * R5-05 canonical order events.
 * One naming set for the hospital journey. The nb2 names are aliases only.
 * Status values match the order centre (universalOrderTypes.ts), the hospital
 * order store (server/db.ts HospitalOrder.status), and the work-order engine.
 */
export const ORDER_EVENTS = {
  PATIENT_REGISTERED: "PATIENT_REGISTERED",
  CONSULTATION_BILL_PAID: "CONSULTATION_BILL_PAID",
  DOCTOR_ASSESSMENT_STARTED: "DOCTOR_ASSESSMENT_STARTED",
  INVESTIGATION_ORDER_CREATED: "INVESTIGATION_ORDER_CREATED",
  INVESTIGATION_PAYMENT_CONFIRMED: "INVESTIGATION_PAYMENT_CONFIRMED",
  REPORT_UPLOADED: "REPORT_UPLOADED",
  MEDICATION_DRAFT_CONFIRMED: "MEDICATION_DRAFT_CONFIRMED",
  DRUG_BILL_PAID: "DRUG_BILL_PAID",
  MEDICATION_DISPENSED: "MEDICATION_DISPENSED",
  ADMISSION_CONFIRMED: "ADMISSION_CONFIRMED",
  WARD_ADMINISTRATION_SCHEDULED: "WARD_ADMINISTRATION_SCHEDULED",
  DOSE_ADMINISTERED: "DOSE_ADMINISTERED",
  VITALS_UPDATED: "VITALS_UPDATED",
} as const;

export type CanonicalOrderEvent = (typeof ORDER_EVENTS)[keyof typeof ORDER_EVENTS];

/** Bill text when care proceeds before payment. */
export const PENDING_EMERGENCY_BILL_LABEL = "pending \u2013 emergency";

export type WorkflowDepartment = "consultation" | "laboratory" | "radiology" | "pharmacy" | "ward";

/**
 * nb2 names. BILL_GENERATED / BILL_ACCEPTED / PAYMENT_CONFIRMED follow the
 * department hint when one is supplied; otherwise they use the default below.
 */
export const ORDER_EVENT_ALIASES = {
  REGISTRATION_COMPLETED: ORDER_EVENTS.PATIENT_REGISTERED,
  BILL_GENERATED: ORDER_EVENTS.CONSULTATION_BILL_PAID,
  BILL_ACCEPTED: ORDER_EVENTS.INVESTIGATION_PAYMENT_CONFIRMED,
  PAYMENT_CONFIRMED: ORDER_EVENTS.INVESTIGATION_PAYMENT_CONFIRMED,
  INVESTIGATION_ORDERED: ORDER_EVENTS.INVESTIGATION_ORDER_CREATED,
  INVESTIGATION_PAID: ORDER_EVENTS.INVESTIGATION_PAYMENT_CONFIRMED,
  MEDICATION_DRAFTED: ORDER_EVENTS.MEDICATION_DRAFT_CONFIRMED,
} as const;

export type OrderEventAlias = keyof typeof ORDER_EVENT_ALIASES;

const CANONICAL_SET = new Set<string>(Object.values(ORDER_EVENTS));

export function isCanonicalOrderEvent(name: string): name is CanonicalOrderEvent {
  return CANONICAL_SET.has(name);
}

export function resolveOrderEvent(name: string, hint?: { department?: WorkflowDepartment }): CanonicalOrderEvent | null {
  if (isCanonicalOrderEvent(name)) return name;
  if (!(name in ORDER_EVENT_ALIASES)) return null;
  const department = hint?.department;
  if (name === "BILL_GENERATED" || name === "BILL_ACCEPTED" || name === "PAYMENT_CONFIRMED") {
    if (department === "pharmacy") return ORDER_EVENTS.DRUG_BILL_PAID;
    if (department === "laboratory" || department === "radiology") return ORDER_EVENTS.INVESTIGATION_PAYMENT_CONFIRMED;
    if (department === "consultation") return ORDER_EVENTS.CONSULTATION_BILL_PAID;
  }
  return ORDER_EVENT_ALIASES[name as OrderEventAlias];
}

export const ORDER_EVENT_CHIPS: Record<CanonicalOrderEvent, string> = {
  [ORDER_EVENTS.PATIENT_REGISTERED]: "Registered",
  [ORDER_EVENTS.CONSULTATION_BILL_PAID]: "Billed",
  [ORDER_EVENTS.DOCTOR_ASSESSMENT_STARTED]: "With doctor",
  [ORDER_EVENTS.INVESTIGATION_ORDER_CREATED]: "Tests pending payment",
  [ORDER_EVENTS.INVESTIGATION_PAYMENT_CONFIRMED]: "Tests in progress",
  [ORDER_EVENTS.REPORT_UPLOADED]: "Report ready",
  [ORDER_EVENTS.MEDICATION_DRAFT_CONFIRMED]: "Rx pending payment",
  [ORDER_EVENTS.DRUG_BILL_PAID]: "Rx paid",
  [ORDER_EVENTS.MEDICATION_DISPENSED]: "Dispensed",
  [ORDER_EVENTS.ADMISSION_CONFIRMED]: "Admitted",
  [ORDER_EVENTS.WARD_ADMINISTRATION_SCHEDULED]: "Admitted",
  [ORDER_EVENTS.DOSE_ADMINISTERED]: "Admitted",
  [ORDER_EVENTS.VITALS_UPDATED]: "Vitals updated",
};

/** Order-centre status. Same members as OrderStatus in universalOrderTypes.ts. */
export type UniversalOrderStatus =
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

/** Hospital order store status. Same members as HospitalOrder["status"]. */
export type HospitalOrderWorkflowStatus =
  | "pending"
  | "sample_collected"
  | "processing"
  | "completed"
  | "dispensed"
  | "cancelled"
  | "sent"
  | "received"
  | "acknowledged"
  | "in_progress";

/** Work-order engine status. Same members as WorkOrderStatus. */
export type WorkOrderWorkflowStatus =
  | "DRAFT"
  | "REQUESTED"
  | "VALIDATED"
  | "BILL_REQUIRED"
  | "BILL_CREATED"
  | "PAYMENT_PENDING"
  | "PAID"
  | "RELEASED"
  | "ASSIGNED"
  | "ACKNOWLEDGED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "RESULT_READY"
  | "REVIEWED"
  | "CLOSED"
  | "CANCELLED"
  | "REJECTED"
  | "FAILED"
  | "DELAYED"
  | "ESCALATED";

export interface MappedOrderStatuses {
  universal: UniversalOrderStatus;
  hospital: HospitalOrderWorkflowStatus;
  work: WorkOrderWorkflowStatus;
}

const STATUS_MAP: Record<CanonicalOrderEvent, MappedOrderStatuses> = {
  [ORDER_EVENTS.PATIENT_REGISTERED]: { universal: "DRAFT", hospital: "pending", work: "REQUESTED" },
  [ORDER_EVENTS.CONSULTATION_BILL_PAID]: { universal: "SENT", hospital: "pending", work: "PAID" },
  [ORDER_EVENTS.DOCTOR_ASSESSMENT_STARTED]: { universal: "RECEIVED", hospital: "received", work: "ACKNOWLEDGED" },
  [ORDER_EVENTS.INVESTIGATION_ORDER_CREATED]: { universal: "SENT", hospital: "pending", work: "BILL_REQUIRED" },
  [ORDER_EVENTS.INVESTIGATION_PAYMENT_CONFIRMED]: { universal: "IN_PROGRESS", hospital: "in_progress", work: "RELEASED" },
  [ORDER_EVENTS.REPORT_UPLOADED]: { universal: "RESULT_AVAILABLE", hospital: "completed", work: "RESULT_READY" },
  [ORDER_EVENTS.MEDICATION_DRAFT_CONFIRMED]: { universal: "SENT", hospital: "pending", work: "PAYMENT_PENDING" },
  [ORDER_EVENTS.DRUG_BILL_PAID]: { universal: "ACCEPTED", hospital: "pending", work: "PAID" },
  [ORDER_EVENTS.MEDICATION_DISPENSED]: { universal: "COMPLETED", hospital: "dispensed", work: "COMPLETED" },
  [ORDER_EVENTS.ADMISSION_CONFIRMED]: { universal: "COMPLETED", hospital: "completed", work: "COMPLETED" },
  [ORDER_EVENTS.WARD_ADMINISTRATION_SCHEDULED]: { universal: "ACCEPTED", hospital: "acknowledged", work: "ASSIGNED" },
  [ORDER_EVENTS.DOSE_ADMINISTERED]: { universal: "COMPLETED", hospital: "completed", work: "COMPLETED" },
  [ORDER_EVENTS.VITALS_UPDATED]: { universal: "IN_PROGRESS", hospital: "in_progress", work: "IN_PROGRESS" },
};

export function orderStatusesForEvent(event: CanonicalOrderEvent): MappedOrderStatuses {
  return STATUS_MAP[event];
}

export const WORKFLOW_STATUS_ROLES = ["reception", "billing", "lab", "doctor", "radiology", "pharmacy", "ward", "ot"] as const;

const PAYMENT_EVENTS = new Set<CanonicalOrderEvent>([
  ORDER_EVENTS.CONSULTATION_BILL_PAID,
  ORDER_EVENTS.INVESTIGATION_PAYMENT_CONFIRMED,
  ORDER_EVENTS.DRUG_BILL_PAID,
]);

const ORDERED_EVENTS = new Set<CanonicalOrderEvent>([
  ORDER_EVENTS.INVESTIGATION_ORDER_CREATED,
  ORDER_EVENTS.MEDICATION_DRAFT_CONFIRMED,
]);

const EXECUTION_EVENTS = new Set<CanonicalOrderEvent>([
  ORDER_EVENTS.REPORT_UPLOADED,
  ORDER_EVENTS.MEDICATION_DISPENSED,
  ORDER_EVENTS.DOSE_ADMINISTERED,
  ORDER_EVENTS.ADMISSION_CONFIRMED,
]);

export function eventMarksPayment(event: CanonicalOrderEvent): boolean {
  return PAYMENT_EVENTS.has(event);
}

export function eventMarksOrdered(event: CanonicalOrderEvent): boolean {
  return ORDERED_EVENTS.has(event);
}

export function eventMarksExecution(event: CanonicalOrderEvent): boolean {
  return EXECUTION_EVENTS.has(event);
}
