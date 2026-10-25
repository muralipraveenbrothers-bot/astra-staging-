/* ---------------- shared domain types ---------------- */

export type ServiceStatus = "healthy" | "issues" | "disabled";

export interface ServiceInfo {
  id: "freellmapi" | "ollama" | "paperclip" | "hermes";
  name: string;
  baseUrl: string;
  status: ServiceStatus;
  latencyMs: number;
  detail: string;
}

export type RoutingStrategy =
  | "manual"
  | "balanced"
  | "smartest"
  | "fastest"
  | "reliable"
  | "custom";

export interface RoutingWeights {
  reliability: number;
  speed: number;
  intelligence: number;
}

export interface ConnectionSettings {
  freellmBaseUrl: string;
  freellmApiKey: string;
  ollamaUrl: string;
  paperclipUrl: string;
  hermesUrl: string;
  strategy: RoutingStrategy;
  weights: RoutingWeights;
  cdsPinnedReliable: boolean;
}

export interface ProviderHealth {
  provider: string;
  models: number;
  status: ServiceStatus;
  latencyMs: number;
}

export interface Department {
  id: string;
  name: string;
  head: string;
  staffCount: number;
  color: string;
  custom?: boolean;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  departmentId: string;
  linkedDoctor?: string;
  notifyWhatsApp: boolean;
  notifyTelegram: boolean;
  paperclipMapped: boolean;
}

export type PaymentMode = "UPI" | "Card" | "Cash";

export interface Bill {
  id: string;
  receiptNo: string;
  patientId: string;
  kind: "OP" | "IP";
  service: string;
  amount: number;
  staffName: string;
  timestamp: string;
  mode: PaymentMode;
  reference: string;
  reversalOf?: string;
}

export type IssueStatus = "todo" | "in-progress" | "in-review" | "done";
export type IssuePriority = "low" | "medium" | "high" | "critical";

export interface Issue {
  id: string;
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
  assignee: string;
  createdAt: string;
}

export interface AgentNode {
  id: string;
  name: string;
  role: string;
  runtime: string;
  model: string;
  heartbeatMin: number;
  status: "active" | "paused";
  tier: 1 | 2 | 3;
  successRate: number;
  monthlyTokens: number;
  tokenBudget: number;
  skills: string[];
  instructions: string;
}

export interface AgentRun {
  id: string;
  agentId: string;
  startedAt: string;
  status: "running" | "done" | "failed";
  summary: string;
}

export interface Goal {
  id: string;
  title: string;
  progress: number;
  children?: Goal[];
}

export interface AttendanceRecord {
  id: string;
  staffName: string;
  department: string;
  inTime?: string;
  outTime?: string;
  faceConfidence: number;
  geofenceOk: boolean;
  anomaly?: string;
}

export type DdxStatus = "pending" | "accepted" | "edited" | "rejected";

export interface DdxItem {
  id: string;
  rank: number;
  diagnosis: string;
  probability: string;
  citation: string;
  status: DdxStatus;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  detail: string;
}

export type OrderDept = "Ward" | "Pharmacy" | "Lab";

export interface HospitalOrder {
  id: string;
  patientId: string;
  orderText: string;
  doctor: string;
  createdAt: string;
  /** epoch ms when the order was posted — drives the countdown */
  createdTs: number;
  dueMin: number;
  /** department queue this order routes to instantly (default Ward) */
  targetDept?: OrderDept;
  /** optional structured medication payload for pharmacy orders */
  drug?: string;
  dose?: string;
  qty?: number;
  unitPrice?: number;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  /** true once the overdue escalation has auto-filed an Issue */
  escalated?: boolean;
  /** proof-of-execution artifacts */
  proofNote?: string;
  proofPhoto?: boolean;
  proofVoice?: boolean;
}

export interface SendLogEntry {
  id: string;
  timestamp: string;
  provider: "Telegram" | "WhatsApp" | "Internal";
  template: string;
  recipient: string;
  status: "sent" | "failed";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  servedBy?: string;
  fusion?: boolean;
  /** true when this bubble carries a backend error instead of a reply */
  error?: boolean;
  /** show the "Reply in simulation mode instead" button */
  simOffer?: boolean;
  /** true when the reply was streamed from a real backend */
  live?: boolean;
  /** result of an executed AI command (command bubble) */
  cmd?: CommandOutcome;
  /** short spoken version of this bubble's content (voice override) */
  spoken?: string;
  /** true while the voice engine is reading this bubble aloud */
  speaking?: boolean;
  /** retrieved evidence citations (provenance panel) */
  citations?: Array<{ subject: string; relation: string; object: string; evidence: string; docRef: string; tier: string; confidence: number; _score: number }>;
}

import type { CommandOutcome } from "./commandEngine";

export interface InstallState {
  tool: string;
  status: "not-installed" | "installing" | "installed";
  log: string[];
}

/* ---------------- Astra appearance + brain state ---------------- */

export type BrainState = "idle" | "thinking" | "speaking";

export type BackgroundPreset = "Astra" | "classic";
export type AnimIntensity = "calm" | "normal" | "epic";

export interface AppearanceSettings {
  preset: BackgroundPreset;
  intensity: AnimIntensity;
  particles: boolean;
  ripples: boolean;
}

export const defaultAppearance: AppearanceSettings = {
  preset: "Astra",
  intensity: "normal",
  particles: true,
  ripples: true,
};

/** Wizard detection status for one tool. */
export type DetectResult = "reachable" | "not-detected";

/* ---------------- patient registry + discharge ---------------- */

export interface PatientRecord {
  id: string; // PT-23xx
  name: string;
  age?: number;
  gender?: string;
  phone?: string;
  email?: string;
  address?: string;
  department?: string;
  linkedDoctor?: string;
  complaint?: string;
  registeredAt: string;
  source: "voice" | "scan" | "manual" | "sparta";
  // Auto-fill fields for Clinical Decision Support
  allergies?: string;
  previousVisits?: string;
  previousDiagnoses?: string;
  currentMedications?: string;
  pastInvestigations?: string;
  chronicIllnesses?: string;
  admissionStatus?: "outpatient" | "inpatient" | "discharged";
  previousSurgeries?: string;
  insurance?: string;
  weight?: number;
  height?: number;
  bloodGroup?: string;
  emergencyContact?: string;
  aadhaar?: string;
  occupation?: string;
  mlc?: boolean;
  mlcNumber?: string;
  policeStation?: string;
}

export interface DischargeRecord {
  patientId: string;
  dischargedAt: string;
  diagnosis: string;
  followUpDate: string;
}

/* ---------------- pharmacy ---------------- */

export interface PharmacyStockSeed {
  item: string;
  opening: number;
  reorderLevel: number;
  unitPrice: number;
}

/** One dispensing event — sold-side of the stock ledger; revenue posts as a Bill. */
export interface PharmacyDispense {
  id: string;
  orderId?: string;
  patientId: string;
  item: string;
  qty: number;
  amount: number;
  staffName: string;
  timestamp: string;
}

/** One posted purchase-register line (append-only). */
export interface PharmacyPurchase {
  id: string;
  supplier: string;
  invoiceNo: string;
  item: string;
  qty: number;
  amount: number;
  postedAt: string;
}

/* ---------------- ward management ---------------- */

export type BedStatus = "occupied" | "vacant" | "cleaning";

export interface Bed {
  id: string;
  ward: string;
  label: string;
  status: BedStatus;
  patientId?: string;
  patientName?: string;
  admittedAt?: string;
  diagnosis?: string;
}

/** Scheduled medication dose for the ward timing board. */
export interface MedDose {
  id: string;
  patientId: string;
  patientName: string;
  drug: string;
  dose: string;
  dueTs: number;
  givenAt?: string;
  givenBy?: string;
  escalated?: boolean;
}

export interface VitalsEntry {
  id: string;
  patientId: string;
  tempF: number;
  pulse: number;
  bp: string;
  spo2: number;
  at: string;
  abnormal: string[];
}

/* ---------------- appointments ---------------- */

export type AppointmentStatus = "booked" | "checked-in" | "in-consult" | "done" | "no-show";

export interface Appointment {
  id: string;
  patientName: string;
  phone: string;
  doctor: string;
  department: string;
  /** YYYY-MM-DD */
  date: string;
  /** e.g. "10:30" */
  slot: string;
  mode: "Walk-in" | "Phone" | "WhatsApp";
  status: AppointmentStatus;
  createdAt: string;
}

/* ---------------- nurse scheduling ---------------- */

export type ShiftCode = "M" | "E" | "N" | "Off";

export interface ShiftCell {
  id: string;
  nurseName: string;
  /** 0 = Monday … 6 = Sunday */
  day: number;
  shift: ShiftCode;
  ward: string;
}

/* ---------------- approvals (doctor/CEO inbox) ---------------- */

export type ApprovalKind = "discount" | "refund" | "purchase" | "surgery" | "discharge" | "rule" | "other";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface ApprovalRequest {
  id: string;
  kind: ApprovalKind;
  title: string;
  detail: string;
  amount?: number;
  requestedBy: string;
  requestedByRole: string;
  status: ApprovalStatus;
  createdAt: string;
  decidedBy?: string;
  decidedAt?: string;
  /** executor payload — interpreted by lib/approvalsExec.ts on approval */
  payload?: string;
}

/* ---------------- reputation / Google reviews ---------------- */

export interface ReviewEntry {
  id: string;
  patient: string;
  doctor: string;
  department: string;
  stars: number;
  note?: string;
  at: string;
}

/* ---------------- surgery consent ---------------- */

export interface ConsentRecord {
  id: string;
  surgeryId: string;
  patientId: string;
  procedure: string;
  surgeon: string;
  risks: string[];
  alternatives: string;
  attender: string;
  relation: string;
  witness: string;
  /** dataURL of the drawn signature */
  signature: string;
  signedAt: string;
}

/* ---------------- pharmacy medicine master ---------------- */

export interface Medicine {
  id: string;
  name: string;
  generic: string;
  batch: string;
  stock: number;
  price: number;
  rack: string;
}

/* ---------------- Clinical Decision Support ---------------- */

export type CDSSubModule =
  | "clinical-intake" | "clinical-insight" | "clinical-roadmap"
  | "differential-diagnosis" | "investigations" | "laboratory"
  | "radiology" | "medication-assistant" | "procedures"
  | "surgical-planning" | "admission-decision" | "progress-notes"
  | "monitoring" | "patient-education" | "clinical-references"
  | "followup-planner" | "ai-case-discussion" | "mdt"
  | "doctor-orders" | "discharge-planning"
  | "surgical-r1";

export type DdxProbability = "high" | "moderate" | "low" | "rule-out";
export type RiskLevel = "low" | "moderate" | "high" | "critical";
export type OrderUrgency = "routine" | "urgent" | "stat";
export type DxStatus = "pending" | "accepted" | "rejected" | "edited";

export interface CDSDifferential {
  id: string;
  rank: number;
  diagnosis: string;
  probability: DdxProbability;
  confidenceScore: number;
  risk: RiskLevel;
  rulesIn: string[];
  rulesOut: string[];
  reasoning: string;
  guidelines: string[];
  alternatives: string[];
  redFlags: string[];
  escalation: string;
  status: DxStatus;
  confirmedBy?: string;
  confirmedAt?: string;
}

export type InvCategory = "lab" | "radiology" | "pathology" | "microbiology";
export type InvStatus = "recommended" | "ordered" | "result-available" | "reviewed";

export interface CDSInvestigation {
  id: string;
  test: string;
  category: InvCategory;
  reasoning: string;
  priority: OrderUrgency;
  guidelineRef: string;
  status: InvStatus;
  result?: string;
  resultAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export type MedStatus = "draft" | "pending-confirmation" | "confirmed" | "sent-to-pharmacy" | "dispensed" | "administered" | "discontinued";

export interface CDSMedication {
  id: string;
  drug: string; dose: string; route: string; frequency: string;
  duration: string; quantity: number; instructions: string;
  reasoning: string; guidelineRef: string; status: MedStatus;
  confirmedBy?: string; confirmedAt?: string;
}

export type NoteStatus = "draft" | "finalized";

export interface ProgressNote {
  id: string; patientId: string;
  subjective: string; objective: string; assessment: string; plan: string;
  doctor: string; createdAt: string; updatedAt: string; status: NoteStatus;
}

export interface ClinicalNote {
  id: string; patientId: string;
  type: "progress" | "admission" | "discharge" | "consultation" | "procedure";
  content: string; doctor: string; createdAt: string; updatedAt: string;
  status: NoteStatus; signedBy?: string; signedAt?: string;
}

export type ProcStatus = "draft" | "pending-confirmation" | "confirmed" | "scheduled" | "completed" | "cancelled";

export interface CDSProcedure {
  id: string; procedure: string; specialty: string;
  urgency: "elective" | "urgent" | "emergency";
  reasoning: string; preparation: string[]; risks: string[]; benefits: string[]; alternatives: string[];
  status: ProcStatus; confirmedBy?: string; confirmedAt?: string; scheduledAt?: string; completedAt?: string;
}

export interface SurgicalPlan {
  id: string; procedure: string; surgeon: string; assistantSurgeon: string;
  anaesthetist: string; date: string; time: string; theatre: string;
  side: "left" | "right" | "bilateral" | "n/a"; approach: string;
  preoperativePreparation: string[]; intraoperativePlan: string; postoperativePlan: string;
  implants: string[]; specialEquipment: string[]; bloodRequired: boolean; bloodUnits: number;
  consentObtained: boolean; consentId?: string;
  status: "draft" | "planned" | "scheduled" | "in-progress" | "completed" | "cancelled";
  createdBy: string; createdAt: string;
}

export interface AdmissionDecision {
  id: string; patientId: string; patientName: string;
  diagnosis: string; severity: RiskLevel; recommendedWard: string;
  admittingDoctor: string; expectedStay: string; reason: string;
  status: "draft" | "pending-confirmation" | "admitted" | "transferred" | "discharged";
  confirmedBy?: string; confirmedAt?: string; admittedAt?: string; bedId?: string;
}

export interface DischargePlan {
  id: string; patientId: string; patientName: string;
  admissionDate: string; dischargeDate: string; diagnosis: string;
  proceduresPerformed: string[]; conditionAtDischarge: string;
  medicationsAtDischarge: string; followUpInstructions: string;
  followUpDate: string; dietaryAdvice: string; activityRestrictions: string;
  warningSignals: string[]; prescribedBy: string; reviewedBy?: string;
  status: "draft" | "pending-review" | "finalized" | "discharged";
}

export interface FollowUpPlan {
  id: string; patientId: string; patientName: string;
  date: string; specialty: string; doctor: string; reason: string;
  investigationsOrdered: string[];
  status: "planned" | "completed" | "missed" | "cancelled";
  notes: string; createdAt: string;
}

export interface MDTEntry {
  id: string; patientId: string; patientName: string;
  diagnosis: string; discussionDate: string; participants: string[];
  discussion: string; recommendations: string[]; decisions: string[];
  createdBy: string; createdAt: string;
}

export interface MonitoringPlan {
  id: string; patientId: string; patientName: string;
  parameter: string; frequency: string; target: string; alertThreshold: string;
  status: "active" | "completed" | "discontinued";
  orderedBy: string; createdAt: string;
}

export interface PatientEducationRecord {
  id: string; patientId: string; patientName: string;
  topic: string; content: string; language: string;
  providedBy: string; providedAt: string; understood: boolean; notes: string;
}

export interface ClinicalReference {
  id: string; title: string; specialty: string;
  source: string; url: string; summary: string;
  tags: string[]; addedBy: string; addedAt: string;
}

/* ---------------- Radiology ---------------- */

export type RadModality = "X-Ray" | "USG" | "CT" | "MRI";
export type RadPriority = "routine" | "urgent" | "stat";
export type RadStatus = "ordered" | "scheduled" | "reported" | "approved";

export interface RadScanCatalogEntry {
  id: string;
  modality: RadModality;
  department: string;
  scanName: string;
}

export interface RadOrder {
  id: string;
  patientId: string;
  patientName: string;
  patientType: "registered" | "outside";
  modality: RadModality;
  study: string;
  referringDoctor: string;
  department: string;
  clinicalNotes: string;
  priority: RadPriority;
  status: RadStatus;
  orderedAt: string;
  orderedTs: number;
  tatTargetMin: number;
  scheduledDate?: string;
  scheduledSlot?: string;
  room?: string;
  findings?: string;
  impression?: string;
  radiologist?: string;
  reportedTs?: number;
}

export interface OutsidePatient {
  id: string;
  name: string;
  address: string;
  contact: string;
  referralDoctor: string;
  registeredAt: string;
}

/* ---------------- Medico-Legal Case (MLC) ---------------- */

export interface MLCWound {
  slNo: number;
  type: string;
  dimensions: string;
  location: string;
  age: string;
  weapon: string;
  remarks: string;
}

export type WoundSeverity = "simple" | "grievous";

export interface MLCRecord {
  id: string;
  patientId: string;
  mlcNumber: string;
  mrNumber: string;
  dateTime: string;
  policeStation: string;
  patientName: string;
  ageSex: string;
  address: string;
  broughtBy: string;
  broughtByDetails: string;
  identificationMarks: string[];
  history: string;
  injuryDescription: string;
  clinicalFindings: string;
  investigations: string[];
  wounds: MLCWound[];
  finalOpinion: string;
  grievousWoundNos: string;
  simpleWoundNos: string;
  injuryNature: string;
  weaponUsed: string;
  doctorName: string;
  doctorRegNo: string;
  hospitalName: string;
  hospitalStamp: string;
  signature: string;
  signedAt: string;
  attachments: string[];
  status: "draft" | "finalized";
}
