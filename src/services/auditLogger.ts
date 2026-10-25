export interface AuditLogEntry {
  id: string;
  action:
    | "ALERT_CREATED"
    | "ALERT_VIEWED"
    | "ALERT_ACKNOWLEDGED"
    | "TASK_CREATED"
    | "TASK_ASSIGNED"
    | "TASK_ESCALATED"
    | "TASK_COMPLETED"
    | "AI_SUMMARY_GENERATED"
    | "AI_SUMMARY_VIEWED"
    | "AI_SUGGESTION_ACCEPTED"
    | "AI_SUGGESTION_REJECTED"
    | "CLINICAL_DATA_ACCESSED"
    | "BLIND_SPOT_SCAN_EXECUTED"
    | "ANATOMY_OPENED"
    | "ANATOMY_STRUCTURE_SELECTED"
    | "ANATOMY_SEARCH"
    | "ORTHOPLANNER_OPENED"
    | "ORTHOPLANNER_PATIENT_SELECTED"
    | "ORTHOPLANNER_LANDMARK_ADDED"
    | "ORTHOPLANNER_MEASUREMENT_ADDED"
    | "ORTHOPLANNER_PLAN_SAVED"
    | "SLICER_LAUNCH_REQUESTED"
    | "SLICER_LAUNCHED"
    | "SLICER_LAUNCH_FAILED"
    | "SURGICAL_PLAN_REVIEWED"
    | "SURGICAL_PLAN_FINALIZED"
    | "SKILL_GATE_EVALUATED";
  performedBy: string;
  userRole: string;
  patientUhid?: string;
  details: string;
  timestamp: string;
  sourceModule: string;
  sourceRecordId?: string;
  provenanceData?: any;
}

class AuditLoggerService {
  private logs: AuditLogEntry[] = [
    {
      id: "AUD-1001",
      action: "ALERT_CREATED",
      performedBy: "Clinical Attention Engine",
      userRole: "System Engine",
      patientUhid: "UHID-2026-8801",
      details: "SpO2 drop to 89% detected in ICU Bed 04",
      timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      sourceModule: "ward_monitors",
    },
    {
      id: "AUD-1002",
      action: "CLINICAL_DATA_ACCESSED",
      performedBy: "Dr. Murali Praveen",
      userRole: "Attending Consultant",
      patientUhid: "UHID-2026-8801",
      details: "Opened Patient Clinical Workspace for Rajesh Kumar",
      timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      sourceModule: "clinical_command",
    },
  ];

  log(entry: Omit<AuditLogEntry, "id" | "timestamp">): AuditLogEntry {
    const newEntry: AuditLogEntry = {
      ...entry,
      id: `AUD-${Date.now()}`,
      timestamp: new Date().toISOString(),
    };
    this.logs.unshift(newEntry);
    return newEntry;
  }

  getLogsForPatient(uhid: string): AuditLogEntry[] {
    return this.logs.filter((l) => l.patientUhid === uhid);
  }

  getAllLogs(): AuditLogEntry[] {
    return this.logs;
  }
}

export const auditLogger = new AuditLoggerService();
