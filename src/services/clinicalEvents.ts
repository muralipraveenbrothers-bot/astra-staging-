export type ClinicalEventType =
  | "PATIENT_REGISTERED"
  | "PATIENT_ADMITTED"
  | "PATIENT_TRANSFERRED"
  | "VITAL_RECORDED"
  | "LAB_ORDERED"
  | "LAB_RESULT_AVAILABLE"
  | "LAB_RESULT_REVIEWED"
  | "CRITICAL_RESULT_CREATED"
  | "RADIOLOGY_ORDERED"
  | "RADIOLOGY_REPORT_AVAILABLE"
  | "MEDICATION_ORDERED"
  | "MEDICATION_DISPENSED"
  | "MEDICATION_ADMINISTERED"
  | "PROCEDURE_SCHEDULED"
  | "PROCEDURE_COMPLETED"
  | "NURSING_TASK_CREATED"
  | "DOCTOR_TASK_CREATED"
  | "DISCHARGE_STARTED"
  | "DISCHARGE_COMPLETED"
  | "TASK_CREATED"
  | "TASK_COMPLETED";

export interface ClinicalEvent {
  id: string;
  eventType: ClinicalEventType;
  patientUhid: string;
  patientName: string;
  department: string;
  description: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  timestamp: string;
  sourceModule: string;
  sourceRecordId?: string;
  performedBy: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  dataPayload?: any;
}

class ClinicalEventEngine {
  private events: ClinicalEvent[] = [
    {
      id: "EVT-2026-001",
      eventType: "CRITICAL_RESULT_CREATED",
      patientUhid: "UHID-2026-8802",
      patientName: "Ananya Sharma",
      department: "Laboratory",
      description: "Critical Lab Value: Hb 6.1 g/dL (Severe Anemia Flag)",
      severity: "CRITICAL",
      timestamp: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      sourceModule: "lab_orders",
      sourceRecordId: "LAB-1029",
      performedBy: "Lab Tech Ramesh",
    },
    {
      id: "EVT-2026-002",
      eventType: "VITAL_RECORDED",
      patientUhid: "UHID-2026-8801",
      patientName: "Rajesh Kumar",
      department: "ICU",
      description: "SpO2 drop recorded at 89% on room air with tachycardia (HR 124)",
      severity: "CRITICAL",
      timestamp: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
      sourceModule: "icu_monitor",
      sourceRecordId: "MON-ICU-04",
      performedBy: "Bedside Monitor Telemetry",
    },
    {
      id: "EVT-2026-003",
      eventType: "RADIOLOGY_REPORT_AVAILABLE",
      patientUhid: "UHID-2026-8803",
      patientName: "Venkat Rao",
      department: "Radiology",
      description: "USG Abdomen & Pelvis finalized - Cholecystitis with gallstones",
      severity: "MEDIUM",
      timestamp: new Date(Date.now() - 22 * 60 * 1000).toISOString(),
      sourceModule: "radiology_reports",
      sourceRecordId: "RAD-3001",
      performedBy: "Dr. Murali Praveen",
    },
  ];

  getEvents(): ClinicalEvent[] {
    return this.events;
  }

  logEvent(event: Omit<ClinicalEvent, "id">): ClinicalEvent {
    const newEvent: ClinicalEvent = {
      ...event,
      id: `EVT-${Date.now()}`,
    };
    this.events.unshift(newEvent);
    return newEvent;
  }

  acknowledgeEvent(id: string, user: string): boolean {
    const event = this.events.find((e) => e.id === id);
    if (event) {
      event.acknowledgedBy = user;
      event.acknowledgedAt = new Date().toISOString();
      return true;
    }
    return false;
  }
}

export const clinicalEventEngine = new ClinicalEventEngine();
