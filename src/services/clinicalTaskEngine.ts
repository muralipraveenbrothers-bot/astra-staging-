export interface ClinicalTask {
  id: string;
  patientUhid: string;
  patientName: string;
  bedOrLocation?: string;
  department: string;
  taskType:
    | "CRITICAL_LAB_REVIEW"
    | "RADIOLOGY_INTERPRETATION"
    | "MEDICATION_RECONCILIATION"
    | "DOCTOR_ORDER"
    | "NURSING_ESCALATION"
    | "DISCHARGE_REVIEW"
    | "PROCEDURE_READINESS"
    | "DOCUMENTATION_REQUIREMENT"
    | "BLIND_SPOT_GAP";
  taskName: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  assignedTo: string;
  assignedRole: string;
  status: "PENDING" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "ESCALATED";
  sourceModule: string;
  sourceRecordId?: string;
  createdAt: string;
  dueAt: string;
  completedAt?: string;
  completedBy?: string;
  notes?: string;
}

class ClinicalTaskEngineService {
  private tasks: ClinicalTask[] = [
    {
      id: "TSK-2026-501",
      patientUhid: "UHID-2026-8801",
      patientName: "Rajesh Kumar",
      bedOrLocation: "ICU Bed 04",
      department: "ICU",
      taskType: "CRITICAL_LAB_REVIEW",
      taskName: "Review Repeat ABG & Serum Electrolytes Result",
      priority: "CRITICAL",
      assignedTo: "Dr. Murali Praveen",
      assignedRole: "Attending Consultant",
      status: "IN_PROGRESS",
      sourceModule: "icu_monitor",
      createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      dueAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    },
    {
      id: "TSK-2026-502",
      patientUhid: "UHID-2026-8802",
      patientName: "Ananya Sharma",
      bedOrLocation: "Ward 2-Bed-08",
      department: "Laboratory",
      taskType: "CRITICAL_LAB_REVIEW",
      taskName: "Confirm Severe Anemia Hb 6.1 g/dL Flag & Blood Crossmatch Order",
      priority: "CRITICAL",
      assignedTo: "Duty Pathologist",
      assignedRole: "Pathologist",
      status: "PENDING",
      sourceModule: "lab_orders",
      sourceRecordId: "LAB-1029",
      createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      dueAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    },
    {
      id: "TSK-2026-503",
      patientUhid: "UHID-2026-8803",
      patientName: "Venkat Rao",
      bedOrLocation: "Ward 1-Bed-02",
      department: "Radiology",
      taskType: "RADIOLOGY_INTERPRETATION",
      taskName: "Clear Pending USG Abdomen & Pelvis Report Backlog",
      priority: "HIGH",
      assignedTo: "Radiology Desk",
      assignedRole: "Radiologist",
      status: "ASSIGNED",
      sourceModule: "radiology_reports",
      createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      dueAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    },
  ];

  getTasks(): ClinicalTask[] {
    return this.tasks;
  }

  getTasksForPatient(uhid: string): ClinicalTask[] {
    return this.tasks.filter((t) => t.patientUhid === uhid);
  }

  createTask(task: Omit<ClinicalTask, "id" | "createdAt">): ClinicalTask {
    // Deduplication check
    const existing = this.tasks.find(
      (t) =>
        t.patientUhid === task.patientUhid &&
        t.taskName.toLowerCase().trim() === task.taskName.toLowerCase().trim() &&
        t.status !== "COMPLETED" &&
        t.status !== "CANCELLED"
    );

    if (existing) {
      return existing;
    }

    const newTask: ClinicalTask = {
      ...task,
      id: `TSK-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    this.tasks.unshift(newTask);
    return newTask;
  }

  updateTaskStatus(
    id: string,
    newStatus: ClinicalTask["status"],
    user?: string,
    notes?: string
  ): boolean {
    const task = this.tasks.find((t) => t.id === id);
    if (task) {
      task.status = newStatus;
      if (notes) task.notes = notes;
      if (newStatus === "COMPLETED") {
        task.completedAt = new Date().toISOString();
        if (user) task.completedBy = user;
      }
      return true;
    }
    return false;
  }
}

export const clinicalTaskEngine = new ClinicalTaskEngineService();
