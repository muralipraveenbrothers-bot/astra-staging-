// Ward & ICU Digital Command Center Types

export type ClinicalStatus = "STABLE" | "WATCH" | "ATTENTION" | "CRITICAL";
export type RiskLevel = "Low" | "Moderate" | "High" | "Extreme";
export type WardType = "ICU" | "General Ward" | "Private Suite" | "Post-Op Recovery" | "Emergency Obs";

export interface VitalRecord {
  id: string;
  timestamp: string;
  date: string;
  hr: number; // Pulse / Heart rate bpm
  bpSystolic: number;
  bpDiastolic: number;
  temp: number; // Fahrenheit
  rr: number; // Respiratory rate
  spo2: number; // Oxygen saturation %
  gcs?: number; // Glasgow Coma Scale (3-15)
  painScore?: number; // 0-10
  bloodGlucose?: number; // mg/dL
  urineOutput?: number; // ml
  fluidIntake?: number; // ml
  oxygenFlow?: string; // e.g., "2L/min nasal cannula" or "Room Air"
  recordedBy: string;
  role: "Nurse" | "Doctor" | "Monitor OCR";
  isAbnormal?: boolean;
}

export interface DoctorOrder {
  id: string;
  category:
    | "Medication"
    | "Vital Monitoring"
    | "Nursing Instruction"
    | "Investigation"
    | "Imaging"
    | "Procedure"
    | "Diet"
    | "Fluid Management"
    | "Oxygen"
    | "Pre-Op Instruction"
    | "Post-Op Instruction"
    | "Consultation";
  title: string;
  details: string;
  orderedBy: string;
  orderedAt: string;
  frequency?: string;
  status: "Active" | "Completed" | "Discontinued" | "Pending Approval";
  priority: "Routine" | "Urgent" | "STAT Emergency";
  linkedTaskId?: string;
}

export interface NursingTask {
  id: string;
  title: string;
  category: "Vitals" | "Medication" | "Nursing Care" | "Sample Collection" | "Pre-Op" | "Post-Op" | "Hygiene";
  dueTime: string;
  dueDate: string;
  assignedStaff: string;
  status: "DUE NOW" | "UPCOMING" | "OVERDUE" | "COMPLETED" | "SKIPPED";
  escalationStage?: 1 | 2 | 3 | 4;
  completedAt?: string;
  completedBy?: string;
  remarks?: string;
}

export interface MARRecord {
  id: string;
  drugName: string;
  dose: string;
  route: string;
  frequency: string;
  scheduledTime: string;
  scheduledDate: string;
  status: "Scheduled" | "Due" | "Administered" | "Delayed" | "Missed" | "Held";
  administeredAt?: string;
  administeredBy?: string;
  remarks?: string;
}

export interface InvestigationTask {
  id: string;
  testName: string;
  category: "Laboratory" | "Radiology" | "ECG" | "ABG";
  orderedAt: string;
  orderedBy: string;
  status: "Ordered" | "Sample Collected" | "Processing" | "Result Available" | "Reviewed";
  resultValue?: string;
  isCritical?: boolean;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface ProgressNote {
  id: string;
  timeframe: "Morning" | "Afternoon" | "Evening" | "Night";
  date: string;
  timestamp: string;
  author: string;
  role: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  isSigned: boolean;
}

export interface PreOpChecklist {
  patientIdentityVerified: boolean;
  consentSigned: boolean;
  procedureConfirmed: boolean;
  siteMarked: boolean;
  allergyChecked: boolean;
  npoStatus: boolean;
  npoSinceTime?: string;
  cbcDone: boolean;
  renalDone: boolean;
  coagulationProfileDone: boolean;
  bloodCrossmatched: boolean;
  anesthesiaFitnessDone: boolean;
  antibioticProphylaxisGiven: boolean;
  allChecked: boolean;
}

export interface SurgeryDetail {
  procedureName: string;
  surgeonName: string;
  anesthetistName: string;
  scheduledTime: string;
  scheduledDate: string;
  otNumber: string;
  status: "Scheduled" | "In-Progress" | "Completed" | "Post-Op Care";
  preOpChecklist: PreOpChecklist;
  estimatedBloodLoss?: string;
  complications?: string;
  postOpInstructions?: string;
}

export interface ConsultRequest {
  id: string;
  specialty: string;
  consultantName: string;
  requestedBy: string;
  requestedAt: string;
  reason: string;
  status: "Pending" | "In Progress" | "Completed";
  consultantNotes?: string;
  respondedAt?: string;
}

export interface ClinicalAlert {
  id: string;
  severity: "CRITICAL" | "HIGH" | "MODERATE" | "INFO";
  title: string;
  description: string;
  detectedAt: string;
  isAcknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  trendData?: string;
}

export interface TimelineEvent {
  id: string;
  timestamp: string;
  date: string;
  category: "Vitals" | "Medications" | "Orders" | "Investigations" | "Notes" | "Alerts" | "Consultations" | "Voice" | "Video" | "Nursing";
  title: string;
  details: string;
  user: string;
  role: string;
}

export interface DischargeChecklist {
  clinicalStabilityConfirmed: boolean;
  labsReviewed: boolean;
  dischargeMedicationPlanReady: boolean;
  dischargeSummaryGenerated: boolean;
  patientEducationDone: boolean;
  billingCleared: boolean;
  followUpScheduled: boolean;
  readinessPercentage: number;
  blockers: string[];
}

export interface VentilatorData {
  mode: "SIMV" | "AC/VC" | "CPAP/PSV" | "PRVC" | "BiPAP" | "High Flow Nasal Cannula" | "Off (Room Air)";
  fiO2: number; // e.g. 60%
  peep: number; // e.g. 10 cmH2O
  tidalVolume: number; // e.g. 420 ml
  respRate: number; // e.g. 28 /min
  peakPressure: number; // e.g. 32 cmH2O
  status: "NORMAL" | "HIGH PRESSURE ALARM" | "APNEA ALERT" | "LOW VOLUME" | "OFF";
  isIntubated: boolean;
}

export interface NurseCallAlert {
  id: string;
  isActive: boolean;
  type: "Emergency Code Blue" | "Routine Nurse Call" | "Patient Pain Call" | "Infusion Pump Alarm" | "Ventilator Alarm";
  triggeredAt: string;
  isAcknowledged: boolean;
  acknowledgedBy?: string;
  reason?: string;
}

export interface BlindSpotItem {
  id: string;
  category:
    | "DATA GAP"
    | "CLINICAL REVIEW GAP"
    | "ORDER GAP"
    | "TASK GAP"
    | "MEDICATION GAP"
    | "INVESTIGATION GAP"
    | "DOCUMENTATION GAP"
    | "HANDOVER GAP"
    | "SAFETY GAP"
    | "DEVICE MONITORING GAP"
    | "PRE-OP GAP"
    | "POST-OP GAP"
    | "DISCHARGE GAP";
  title: string;
  finding: string;
  problem: string;
  suggestedAction: string;
  severity: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  detectedAt: string;
}

export type TrajectoryType = "IMPROVING" | "STABLE" | "FLUCTUATING" | "WORSENING" | "RAPIDLY WORSENING" | "UNKNOWN";

export interface OrganSystemStatus {
  systemName: "NEURO" | "RESPIRATORY" | "CARDIOVASCULAR" | "RENAL" | "GASTROINTESTINAL" | "HEPATIC" | "HEMATOLOGIC" | "INFECTIOUS" | "DEVICES" | "FLUIDS";
  status: "STABLE" | "IMPROVING" | "WORSENING" | "CRITICAL" | "UNKNOWN";
  notes?: string;
}

export interface BaselineVitals {
  hr: string;
  bp: string;
  spo2: string;
  temp: string;
  rr: string;
}

export interface ClosedLoopItem {
  id: string;
  triggerEvent: string;
  detectedAt: string;
  acknowledged: boolean;
  actionTaken?: string;
  completedAt?: string;
  reassessmentStatus: "IMPROVING" | "NO CHANGE" | "WORSENED" | "PENDING";
}

export interface WardBed {
  bedId: string;
  wardName: string;
  roomNumber: string;
  bedType: WardType;
  status: "Occupied" | "Vacant" | "Cleaning" | "Reserved";
  patientUhid?: string;
  patientName?: string;
  age?: number;
  gender?: string;
  diagnosis?: string;
  attendingDoctor?: string;
  admissionDate?: string;
  admissionTime?: string;
  admissionDay?: number;
  clinicalStatus?: ClinicalStatus;
  riskLevel?: RiskLevel;
  safetyScore?: number; // e.g., 92%
  vitalsHistory: VitalRecord[];
  orders: DoctorOrder[];
  nursingTasks: NursingTask[];
  marRecords: MARRecord[];
  investigations: InvestigationTask[];
  progressNotes: ProgressNote[];
  surgeryDetail?: SurgeryDetail;
  consultations: ConsultRequest[];
  alerts: ClinicalAlert[];
  timeline: TimelineEvent[];
  dischargeChecklist: DischargeChecklist;
  aiSummary: string;
  vitalMonitoringFrequency: string; // e.g. "Every 2 hours"
  codeStatus?: "FULL CODE" | "DNR" | "DNI";
  allergies?: string[];
  oxygenRequirement?: string;
  ventilatorData?: VentilatorData;
  nurseCallAlert?: NurseCallAlert;
  trajectory?: TrajectoryType;
  baselineVitals?: BaselineVitals;
  organSystems?: OrganSystemStatus[];
  blindSpots?: BlindSpotItem[];
  closedLoopItems?: ClosedLoopItem[];
  lastStateChange?: { previous: ClinicalStatus; current: ClinicalStatus; reason: string; timestamp: string };
}
