export type TaskPriority = "critical" | "high" | "normal" | "low";
export type TaskStatus = "NEW" | "ASSIGNED" | "IN_PROGRESS" | "WAITING" | "COMPLETED" | "VERIFIED" | "CLOSED";

export interface TaskAuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  detail: string;
}

export interface HospitalTask {
  id: string;
  title: string;
  patientId?: string;
  patientName?: string;
  uhid?: string;
  department: string;
  assignedRole?: string;
  assignedUser?: string;
  createdBy: string;
  priority: TaskPriority;
  slaMinutes?: number;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  category: "clinical" | "pharmacy" | "lab" | "radiology" | "ot" | "nursing" | "reception" | "billing" | "admin";
  description?: string;
  history: TaskAuditEntry[];
}

export const INITIAL_TASKS: HospitalTask[] = [
  {
    id: "TSK-1001",
    title: "Dispense Emergency Antibiotics (Ceftriaxone 1g)",
    patientId: "P-101",
    patientName: "Rajesh Sharma",
    uhid: "UHID-2024-001",
    department: "Pharmacy",
    assignedRole: "pharmacy",
    createdBy: "Dr. Anitha",
    priority: "critical",
    slaMinutes: 15,
    status: "IN_PROGRESS",
    createdAt: "10:15 AM",
    updatedAt: "10:20 AM",
    category: "pharmacy",
    description: "Stat order from ER. Patient has high fever & elevated WBC.",
    history: [
      { id: "h1", timestamp: "10:15 AM", actor: "Dr. Anitha", action: "CREATED", detail: "Stat pharmacy order placed via AI Command" },
      { id: "h2", timestamp: "10:20 AM", actor: "Sana Iqbal", action: "ASSIGNED", detail: "Picked up by Chief Pharmacist" }
    ]
  },
  {
    id: "TSK-1002",
    title: "Process Stat CBC & LFT Sample",
    patientId: "P-102",
    patientName: "Meenakshi Sundaram",
    uhid: "UHID-2024-002",
    department: "Laboratory",
    assignedRole: "lab",
    createdBy: "Dr. Karthik",
    priority: "high",
    slaMinutes: 30,
    status: "NEW",
    createdAt: "10:30 AM",
    updatedAt: "10:30 AM",
    category: "lab",
    description: "Pre-op investigation before scheduled cholecystectomy.",
    history: [
      { id: "h1", timestamp: "10:30 AM", actor: "Dr. Karthik", action: "CREATED", detail: "Lab investigation order created" }
    ]
  },
  {
    id: "TSK-1003",
    title: "Verify Surgical Consent for Hernia Repair",
    patientId: "P-103",
    patientName: "Suresh Babu",
    uhid: "UHID-2024-003",
    department: "OT",
    assignedRole: "ot",
    createdBy: "Binu S",
    priority: "high",
    slaMinutes: 45,
    status: "WAITING",
    createdAt: "09:45 AM",
    updatedAt: "10:10 AM",
    category: "ot",
    description: "Patient signed digital consent; waiting for attending physician signature.",
    history: [
      { id: "h1", timestamp: "09:45 AM", actor: "Binu S", action: "CREATED", detail: "Pre-op checklist initiated" }
    ]
  },
  {
    id: "TSK-1004",
    title: "Clear Final Insurance Pre-Auth for Discharge",
    patientId: "P-104",
    patientName: "Sunita Reddy",
    uhid: "UHID-2024-004",
    department: "Finance",
    assignedRole: "finance",
    createdBy: "Meera Nair",
    priority: "normal",
    slaMinutes: 60,
    status: "ASSIGNED",
    createdAt: "10:00 AM",
    updatedAt: "10:05 AM",
    category: "billing",
    description: "PMJAY claim approval document pending final signoff.",
    history: [
      { id: "h1", timestamp: "10:00 AM", actor: "Meera Nair", action: "CREATED", detail: "Discharge clearance handoff" }
    ]
  }
];
