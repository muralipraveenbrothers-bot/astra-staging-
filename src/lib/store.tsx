import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { loadLS, saveLS, uid, nowTime } from "./utils";
import { testOllama, type TestResult } from "./llm";
import { type HospitalTask, type TaskStatus, INITIAL_TASKS } from "./taskEngine";
import {
  initialAgents,
  initialAppointments,
  initialAttendance,
  initialBeds,
  initialBills,
  initialClinicalReferences,
  initialDepartments,
  initialIssues,
  initialMedDoses,
  initialOrders,
  initialPharmacyStock,
  initialProviders,
  initialServices,
  initialShifts,
  initialStaff,
} from "./mock";
import type {
  AgentNode,
  AppearanceSettings,
  Appointment,
  ApprovalRequest,
  AttendanceRecord,
  AuditEntry,
  Bed,
  Bill,
  BrainState,
  CDSDifferential,
  CDSInvestigation,
  CDSMedication,
  CDSProcedure,
  ClinicalNote,
  ClinicalReference,
  ConnectionSettings,
  ConsentRecord,
  Department,
  DischargePlan,
  DischargeRecord,
  FollowUpPlan,
  HospitalOrder,
  Issue,
  MDTEntry,
  MedDose,
  Medicine,
  MonitoringPlan,
  PatientEducationRecord,
  PatientRecord,
  PharmacyDispense,
  PharmacyPurchase,
  ProgressNote,
  ProviderHealth,
  ReviewEntry,
  SendLogEntry,
  ServiceInfo,
  ShiftCell,
  StaffMember,
  SurgicalPlan,
  AdmissionDecision,
  VitalsEntry,
} from "./types";
import { defaultAppearance } from "./types";
import { FREELLMAPI_API_URL } from "../config/freeLlmEndpoint";
import type { RegistrationFormData } from "./registration";
import {
  makeNotification,
  type HospitalNotification,
  type NewNotification,
} from "./notifications";

const defaultSettings: ConnectionSettings = {
  freellmBaseUrl: FREELLMAPI_API_URL,
  freellmApiKey: "",
  ollamaUrl: "http://127.0.0.1:11434",
  paperclipUrl: "",
  hermesUrl: "http://127.0.0.1:8787",
  strategy: "balanced",
  weights: { reliability: 40, speed: 30, intelligence: 30 },
  cdsPinnedReliable: true,
};

interface Store {
  settings: ConnectionSettings;
  setSettings: (s: ConnectionSettings) => void;
  services: ServiceInfo[];
  providers: ProviderHealth[];
  departments: Department[];
  setDepartments: (d: Department[]) => void;
  staff: StaffMember[];
  setStaff: (s: StaffMember[]) => void;
  bills: Bill[];
  addBill: (b: Omit<Bill, "id" | "receiptNo">) => Bill;
  issues: Issue[];
  addIssue: (i: Omit<Issue, "id" | "createdAt">) => void;
  setIssues: (i: Issue[]) => void;
  agents: AgentNode[];
  setAgents: (a: AgentNode[]) => void;
  attendance: AttendanceRecord[];
  setAttendance: (a: AttendanceRecord[]) => void;
  orders: HospitalOrder[];
  setOrders: (o: HospitalOrder[]) => void;
  audit: AuditEntry[];
  logAudit: (action: string, detail: string, actor?: string) => void;
  sendLog: SendLogEntry[];
  addSendLog: (e: Omit<SendLogEntry, "id" | "timestamp">) => void;
  ceoView: boolean;
  setCeoView: (v: boolean) => void;
  /** Models detected on the local Ollama runtime (via real /api/tags). */
  ollamaModels: string[];
  /**
   * Run a REAL connectivity check for a service (freellmapi / ollama) and
   * update its sidebar status dot. paperclip / hermes stay simulated.
   * `override` lets Settings test unsaved field values.
   */
  checkService: (id: ServiceInfo["id"], override?: { baseUrl?: string; apiKey?: string }) => Promise<TestResult | null>;
  setServiceStatus: (id: ServiceInfo["id"], status: ServiceInfo["status"], latencyMs?: number) => void;
  /** Global AI brain state — drives the Astra background pulse + fish speed. */
  brainState: BrainState;
  setBrainState: (s: BrainState) => void;
  /** Appearance prefs — persisted to localStorage. */
  appearance: AppearanceSettings;
  setAppearance: (a: AppearanceSettings) => void;
  /** OP patient registry — persisted. */
  patients: PatientRecord[];
  addPatient: (p: Omit<PatientRecord, "id" | "registeredAt">) => PatientRecord;
  /** IP discharges — persisted; Dashboard census = base − discharges. */
  discharged: DischargeRecord[];
  markDischarged: (d: DischargeRecord) => void;
  /** One-shot form prefill handed from OP Scan → Voice Registration. */
  prefillReg: Partial<RegistrationFormData> | null;
  setPrefillReg: (p: Partial<RegistrationFormData> | null) => void;
  /** Pharmacy sold-side ledger (append-only). */
  dispenses: PharmacyDispense[];
  addDispense: (d: Omit<PharmacyDispense, "id">) => PharmacyDispense;
  /** Pharmacy purchase register (append-only). */
  purchases: PharmacyPurchase[];
  addPurchases: (rows: Omit<PharmacyPurchase, "id" | "postedAt">[]) => void;
  /** Ward bed board. */
  beds: Bed[];
  setBeds: (b: Bed[]) => void;
  /** Ward medication timing board. */
  medDoses: MedDose[];
  setMedDoses: (d: MedDose[]) => void;
  /** Ward vitals quick-entries. */
  vitals: VitalsEntry[];
  addVitals: (v: Omit<VitalsEntry, "id">) => void;
  /** Appointment book. */
  appointments: Appointment[];
  setAppointments: (a: Appointment[]) => void;
  /** Nurse weekly roster. */
  shifts: ShiftCell[];
  setShifts: (s: ShiftCell[]) => void;
  /** Approvals inbox — Doctor/CEO decisions on key events. */
  approvals: ApprovalRequest[];
  addApproval: (a: Omit<ApprovalRequest, "id" | "status" | "createdAt">) => ApprovalRequest;
  decideApproval: (id: string, approve: boolean, decidedBy: string) => void;
  /** Google review funnel — manual star entries. */
  reviews: ReviewEntry[];
  addReview: (r: Omit<ReviewEntry, "id" | "at">) => void;
  /** Digital surgery consents. */
  consents: ConsentRecord[];
  addConsent: (c: Omit<ConsentRecord, "id">) => void;
  /** Pharmacy medicine master (sales search + rack map). */
  medicines: Medicine[];
  setMedicines: (m: Medicine[]) => void;
  /** Universal Hospital Task Engine */
  tasks: HospitalTask[];
  addTask: (t: Omit<HospitalTask, "id" | "createdAt" | "updatedAt" | "history">) => HospitalTask;
  updateTaskStatus: (id: string, status: TaskStatus, actor: string, detail: string) => void;
  
  /** Undo helpers for AI-executed actions. */
  removeBill: (id: string) => void;
  removePatient: (id: string) => void;

  /** CDS — Clinical Decision Support */
  cdsDifferentials: CDSDifferential[];
  setCdsDifferentials: (d: CDSDifferential[]) => void;
  cdsInvestigations: CDSInvestigation[];
  setCdsInvestigations: (i: CDSInvestigation[]) => void;
  cdsMedications: CDSMedication[];
  setCdsMedications: (m: CDSMedication[]) => void;
  cdsProcedures: CDSProcedure[];
  setCdsProcedures: (p: CDSProcedure[]) => void;
  progressNotes: ProgressNote[];
  setProgressNotes: (n: ProgressNote[]) => void;
  clinicalNotes: ClinicalNote[];
  setClinicalNotes: (n: ClinicalNote[]) => void;
  surgicalPlans: SurgicalPlan[];
  setSurgicalPlans: (s: SurgicalPlan[]) => void;
  admissionDecisions: AdmissionDecision[];
  setAdmissionDecisions: (a: AdmissionDecision[]) => void;
  dischargePlans: DischargePlan[];
  setDischargePlans: (d: DischargePlan[]) => void;
  followUpPlans: FollowUpPlan[];
  setFollowUpPlans: (f: FollowUpPlan[]) => void;
  mdtEntries: MDTEntry[];
  setMdtEntries: (m: MDTEntry[]) => void;
  monitoringPlans: MonitoringPlan[];
  setMonitoringPlans: (m: MonitoringPlan[]) => void;
  patientEducationRecords: PatientEducationRecord[];
  setPatientEducationRecords: (p: PatientEducationRecord[]) => void;
  clinicalReferences: ClinicalReference[];
  setClinicalReferences: (r: ClinicalReference[]) => void;
  /** Active CDS patient context */
  cdsActivePatientId: string;
  setCdsActivePatientId: (id: string) => void;

  /** Unified Smart Notification Engine */
  notifications: HospitalNotification[];
  addNotification: (n: NewNotification) => HospitalNotification;
  acknowledgeNotification: (id: string) => void;
  actNotification: (id: string) => void;
  resolveNotification: (id: string) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<ConnectionSettings>(() => {
    const loaded = loadLS("astra.settings", defaultSettings);
    // Unified key lives in FreeLLMAPI Keys tab + Astra backend only — never in the browser.
    return { ...loaded, freellmApiKey: "" };
  });
  // LLM services start amber ("untested") until the real health check resolves them
  const [services, setServices] = useState<ServiceInfo[]>(() =>
    initialServices.map((s) =>
      s.id === "freellmapi" || s.id === "ollama" ? { ...s, status: "issues" as const } : s
    )
  );
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [providers] = useState<ProviderHealth[]>(initialProviders);
  const [departments, setDepartments] = useState<Department[]>(() => loadLS("astra.departments", initialDepartments));
  const [staff, setStaff] = useState<StaffMember[]>(() => loadLS("astra.staff", initialStaff));
  const [bills, setBills] = useState<Bill[]>(() => loadLS("astra.bills", initialBills));
  const [issues, setIssues] = useState<Issue[]>(() => loadLS("astra.issues", initialIssues));
  const [agents, setAgents] = useState<AgentNode[]>(() => loadLS("astra.agents", initialAgents));
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(() => loadLS("astra.attendance", initialAttendance));
  const [orders, setOrders] = useState<HospitalOrder[]>(() => loadLS("astra.orders", initialOrders));
  const [audit, setAudit] = useState<AuditEntry[]>(() => loadLS("astra.audit", [] as AuditEntry[]));
  const [sendLog, setSendLog] = useState<SendLogEntry[]>(() => loadLS("astra.sendlog", [] as SendLogEntry[]));
  const [ceoView, setCeoView] = useState(false);
  const [brainState, setBrainState] = useState<BrainState>("idle");
  const [appearance, setAppearance] = useState<AppearanceSettings>(() =>
    loadLS("astra.appearance", defaultAppearance)
  );
  const [patients, setPatients] = useState<PatientRecord[]>(() => loadLS("astra.patients", [] as PatientRecord[]));
  const [discharged, setDischarged] = useState<DischargeRecord[]>(() => loadLS("astra.discharged", [] as DischargeRecord[]));
  const [prefillReg, setPrefillReg] = useState<Partial<RegistrationFormData> | null>(null);
  const [dispenses, setDispenses] = useState<PharmacyDispense[]>(() => loadLS("astra.dispenses", [] as PharmacyDispense[]));
  const [purchases, setPurchases] = useState<PharmacyPurchase[]>(() => loadLS("astra.purchases", [] as PharmacyPurchase[]));
  const [beds, setBeds] = useState<Bed[]>(() => loadLS("astra.beds", initialBeds));
  const [medDoses, setMedDoses] = useState<MedDose[]>(() => loadLS("astra.medDoses", initialMedDoses));
  const [vitals, setVitals] = useState<VitalsEntry[]>(() => loadLS("astra.vitals", [] as VitalsEntry[]));
  const [appointments, setAppointments] = useState<Appointment[]>(() => loadLS("astra.appointments", initialAppointments));
  const [shifts, setShifts] = useState<ShiftCell[]>(() => loadLS("astra.shifts", initialShifts));
  const [approvals, setApprovals] = useState<ApprovalRequest[]>(() => loadLS("astra.approvals", [] as ApprovalRequest[]));
  const [reviews, setReviews] = useState<ReviewEntry[]>(() => loadLS("astra.reviews", [] as ReviewEntry[]));
  const [consents, setConsents] = useState<ConsentRecord[]>(() => loadLS("astra.consents", [] as ConsentRecord[]));
  const [medicines, setMedicines] = useState<Medicine[]>(() =>
    loadLS<Medicine[]>(
      "astra.medicines",
      initialPharmacyStock.map((s, i) => ({
        id: `med-${i + 1}`,
        name: s.item,
        generic: s.item.split(" ")[0],
        batch: `B${2400 + i * 7}`,
        stock: s.opening,
        price: s.unitPrice,
        rack: `R${(i % 3) + 1}-S${(i % 4) + 1}`,
      }))
    )
  );

  /* Tasks state */
  const [tasks, setTasks] = useState<HospitalTask[]>(() => loadLS("astra.tasks", INITIAL_TASKS));
  useEffect(() => saveLS("astra.tasks", tasks), [tasks]);

  const addTask = useCallback((t: Omit<HospitalTask, "id" | "createdAt" | "updatedAt" | "history">): HospitalTask => {
    const tId = `TSK-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = nowTime();
    const newTask: HospitalTask = {
      ...t,
      id: tId,
      createdAt: now,
      updatedAt: now,
      history: [{ id: uid("h"), timestamp: now, actor: t.createdBy, action: "CREATED", detail: `Task created for ${t.department}` }]
    };
    setTasks((prev) => [newTask, ...prev]);
    return newTask;
  }, []);

  const updateTaskStatus = useCallback((id: string, status: TaskStatus, actor: string, detail: string) => {
    setTasks((prev) =>
      prev.map((tk) => {
        if (tk.id !== id) return tk;
        const now = nowTime();
        return {
          ...tk,
          status,
          updatedAt: now,
          history: [{ id: uid("h"), timestamp: now, actor, action: status, detail }, ...tk.history]
        };
      })
    );
  }, []);

  /* CDS state */
  const [cdsDifferentials, setCdsDifferentials] = useState<CDSDifferential[]>(() => loadLS("astra.cdsDifferentials", []));
  const [cdsInvestigations, setCdsInvestigations] = useState<CDSInvestigation[]>(() => loadLS("astra.cdsInvestigations", []));
  const [cdsMedications, setCdsMedications] = useState<CDSMedication[]>(() => loadLS("astra.cdsMedications", []));
  const [cdsProcedures, setCdsProcedures] = useState<CDSProcedure[]>(() => loadLS("astra.cdsProcedures", []));
  const [progressNotes, setProgressNotes] = useState<ProgressNote[]>(() => loadLS("astra.progressNotes", []));
  const [clinicalNotes, setClinicalNotes] = useState<ClinicalNote[]>(() => loadLS("astra.clinicalNotes", []));
  const [surgicalPlans, setSurgicalPlans] = useState<SurgicalPlan[]>(() => loadLS("astra.surgicalPlans", []));
  const [admissionDecisions, setAdmissionDecisions] = useState<AdmissionDecision[]>(() => loadLS("astra.admissionDecisions", []));
  const [dischargePlans, setDischargePlans] = useState<DischargePlan[]>(() => loadLS("astra.dischargePlans", []));
  const [followUpPlans, setFollowUpPlans] = useState<FollowUpPlan[]>(() => loadLS("astra.followUpPlans", []));
  const [mdtEntries, setMdtEntries] = useState<MDTEntry[]>(() => loadLS("astra.mdtEntries", []));
  const [monitoringPlans, setMonitoringPlans] = useState<MonitoringPlan[]>(() => loadLS("astra.monitoringPlans", []));
  const [patientEducationRecords, setPatientEducationRecords] = useState<PatientEducationRecord[]>(() => loadLS("astra.patientEducationRecords", []));
  const [clinicalReferences, setClinicalReferences] = useState<ClinicalReference[]>(() => loadLS("astra.clinicalReferences", initialClinicalReferences));
  const [cdsActivePatientId, setCdsActivePatientId] = useState("");

  /* Universal notification engine state */
  const [notifications, setNotifications] = useState<HospitalNotification[]>(() =>
    loadLS("astra.notifications", [] as HospitalNotification[])
  );

  useEffect(() => saveLS("astra.settings", settings), [settings]);

  const setServiceStatus = useCallback(
    (id: ServiceInfo["id"], status: ServiceInfo["status"], latencyMs?: number) => {
      setServices((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status, latencyMs: latencyMs ?? s.latencyMs } : s))
      );
    },
    []
  );

  const checkService = useCallback(
    async (
      id: ServiceInfo["id"],
      override?: { baseUrl?: string; apiKey?: string }
    ): Promise<TestResult | null> => {
      const s = settingsRef.current;
      if (id === "freellmapi") {
        const t0 = performance.now();
        try {
          const res = await fetch("/api/health/ai", { signal: AbortSignal.timeout(8000) });
          const latencyMs = Math.round(performance.now() - t0);
          const data = res.ok ? await res.json() : null;
          const svc = data?.services?.freellmapi;
          const ok = Boolean(svc?.reachable);
          const r = { ok, latencyMs, error: ok ? undefined : String(svc?.error ?? `HTTP ${res.status}`) };
          setServiceStatus("freellmapi", ok ? "healthy" : "disabled", latencyMs);
          return r;
        } catch (e) {
          const r = { ok: false, latencyMs: Math.round(performance.now() - t0), error: e instanceof Error ? e.message : String(e) };
          setServiceStatus("freellmapi", "disabled", r.latencyMs);
          return r;
        }
      }
      if (id === "ollama") {
        const r = await testOllama(override?.baseUrl ?? s.ollamaUrl);
        setServiceStatus("ollama", r.ok ? "healthy" : "disabled", r.latencyMs);
        if (r.ok && r.models) setOllamaModels(r.models);
        return r;
      }
      return null; // paperclip / hermes remain simulated
    },
    [setServiceStatus]
  );

  // real connectivity checks on app load — drives the sidebar status dots
  useEffect(() => {
    void checkService("freellmapi");
    void checkService("ollama");
  }, [checkService]);

  useEffect(() => saveLS("astra.departments", departments), [departments]);
  useEffect(() => saveLS("astra.staff", staff), [staff]);
  useEffect(() => saveLS("astra.bills", bills), [bills]);
  useEffect(() => saveLS("astra.issues", issues), [issues]);
  useEffect(() => saveLS("astra.agents", agents), [agents]);
  useEffect(() => saveLS("astra.attendance", attendance), [attendance]);
  useEffect(() => saveLS("astra.orders", orders), [orders]);
  useEffect(() => saveLS("astra.audit", audit), [audit]);
  useEffect(() => saveLS("astra.sendlog", sendLog), [sendLog]);
  useEffect(() => saveLS("astra.appearance", appearance), [appearance]);
  useEffect(() => saveLS("astra.patients", patients), [patients]);
  useEffect(() => saveLS("astra.discharged", discharged), [discharged]);
  useEffect(() => saveLS("astra.dispenses", dispenses), [dispenses]);
  useEffect(() => saveLS("astra.purchases", purchases), [purchases]);
  useEffect(() => saveLS("astra.beds", beds), [beds]);
  useEffect(() => saveLS("astra.medDoses", medDoses), [medDoses]);
  useEffect(() => saveLS("astra.vitals", vitals), [vitals]);
  useEffect(() => saveLS("astra.appointments", appointments), [appointments]);
  useEffect(() => saveLS("astra.shifts", shifts), [shifts]);
  useEffect(() => saveLS("astra.approvals", approvals), [approvals]);
  useEffect(() => saveLS("astra.reviews", reviews), [reviews]);
  useEffect(() => saveLS("astra.consents", consents), [consents]);
  useEffect(() => saveLS("astra.medicines", medicines), [medicines]);
  useEffect(() => saveLS("astra.cdsDifferentials", cdsDifferentials), [cdsDifferentials]);
  useEffect(() => saveLS("astra.cdsInvestigations", cdsInvestigations), [cdsInvestigations]);
  useEffect(() => saveLS("astra.cdsMedications", cdsMedications), [cdsMedications]);
  useEffect(() => saveLS("astra.cdsProcedures", cdsProcedures), [cdsProcedures]);
  useEffect(() => saveLS("astra.progressNotes", progressNotes), [progressNotes]);
  useEffect(() => saveLS("astra.clinicalNotes", clinicalNotes), [clinicalNotes]);
  useEffect(() => saveLS("astra.surgicalPlans", surgicalPlans), [surgicalPlans]);
  useEffect(() => saveLS("astra.admissionDecisions", admissionDecisions), [admissionDecisions]);
  useEffect(() => saveLS("astra.dischargePlans", dischargePlans), [dischargePlans]);
  useEffect(() => saveLS("astra.followUpPlans", followUpPlans), [followUpPlans]);
  useEffect(() => saveLS("astra.mdtEntries", mdtEntries), [mdtEntries]);
  useEffect(() => saveLS("astra.monitoringPlans", monitoringPlans), [monitoringPlans]);
  useEffect(() => saveLS("astra.patientEducationRecords", patientEducationRecords), [patientEducationRecords]);
  useEffect(() => saveLS("astra.clinicalReferences", clinicalReferences), [clinicalReferences]);
  useEffect(() => saveLS("astra.notifications", notifications), [notifications]);

  const value = useMemo<Store>(
    () => ({
      settings,
      setSettings,
      services,
      providers,
      departments,
      setDepartments,
      staff,
      setStaff,
      bills,
      addBill: (b) => {
        const nextNo = `RCPT-${1041 + bills.length + 1}`;
        const bill: Bill = { ...b, id: uid("bill"), receiptNo: nextNo };
        setBills((prev) => [...prev, bill]);
        return bill;
      },
      issues,
      addIssue: (i) =>
        setIssues((prev) => [...prev, { ...i, id: uid("iss"), createdAt: `Today ${nowTime()}` }]),
      setIssues,
      agents,
      setAgents,
      attendance,
      setAttendance,
      orders,
      setOrders,
      audit,
      logAudit: (action, detail, actor = "system") =>
        setAudit((prev) => [
          { id: uid("aud"), timestamp: `${new Date().toLocaleDateString("en-IN")} ${nowTime()}`, actor, action, detail },
          ...prev,
        ]),
      sendLog,
      addSendLog: (e) =>
        setSendLog((prev) => [{ ...e, id: uid("snd"), timestamp: nowTime() }, ...prev]),
      ceoView,
      setCeoView,
      ollamaModels,
      checkService,
      setServiceStatus,
      brainState,
      setBrainState,
      appearance,
      setAppearance,
      patients,
      addPatient: (p) => {
        const rec: PatientRecord = {
          ...p,
          id: `PT-${2300 + patients.length + 1}`,
          registeredAt: `${new Date().toLocaleDateString("en-IN")} ${nowTime()}`,
        };
        setPatients((prev) => [...prev, rec]);
        return rec;
      },
      discharged,
      markDischarged: (d) => setDischarged((prev) => [...prev.filter((x) => x.patientId !== d.patientId), d]),
      prefillReg,
      setPrefillReg,
      dispenses,
      addDispense: (d) => {
        const rec: PharmacyDispense = { ...d, id: uid("dsp") };
        setDispenses((prev) => [...prev, rec]);
        return rec;
      },
      purchases,
      addPurchases: (rows) =>
        setPurchases((prev) => [
          ...prev,
          ...rows.map((r) => ({ ...r, id: uid("pur"), postedAt: `${new Date().toLocaleDateString("en-IN")} ${nowTime()}` })),
        ]),
      beds,
      setBeds,
      medDoses,
      setMedDoses,
      vitals,
      addVitals: (v) => setVitals((prev) => [{ ...v, id: uid("vit") }, ...prev]),
      appointments,
      setAppointments,
      shifts,
      setShifts,
      approvals,
      addApproval: (a) => {
        const rec: ApprovalRequest = {
          ...a,
          id: uid("apv"),
          status: "pending",
          createdAt: `${new Date().toLocaleDateString("en-IN")} ${nowTime()}`,
        };
        setApprovals((prev) => [rec, ...prev]);
        return rec;
      },
      decideApproval: (id, approve, decidedBy) =>
        setApprovals((prev) =>
          prev.map((x) =>
            x.id === id ? { ...x, status: approve ? "approved" : "rejected", decidedBy, decidedAt: `${new Date().toLocaleDateString("en-IN")} ${nowTime()}` } : x
          )
        ),
      reviews,
      addReview: (r) => setReviews((prev) => [{ ...r, id: uid("rev"), at: `${new Date().toLocaleDateString("en-IN")} ${nowTime()}` }, ...prev]),
      consents,
      addConsent: (c) => setConsents((prev) => [...prev, { ...c, id: uid("con") }]),
      medicines,
      setMedicines,
      tasks,
      addTask,
      updateTaskStatus,
      removeBill: (id) => setBills((prev) => prev.filter((b) => b.id !== id)),
      removePatient: (id) => setPatients((prev) => prev.filter((p) => p.id !== id)),
      cdsDifferentials, setCdsDifferentials,
      cdsInvestigations, setCdsInvestigations,
      cdsMedications, setCdsMedications,
      cdsProcedures, setCdsProcedures,
      progressNotes, setProgressNotes,
      clinicalNotes, setClinicalNotes,
      surgicalPlans, setSurgicalPlans,
      admissionDecisions, setAdmissionDecisions,
      dischargePlans, setDischargePlans,
      followUpPlans, setFollowUpPlans,
      mdtEntries, setMdtEntries,
      monitoringPlans, setMonitoringPlans,
      patientEducationRecords, setPatientEducationRecords,
      clinicalReferences, setClinicalReferences,
      cdsActivePatientId, setCdsActivePatientId,
      notifications,
      addNotification: (n) => {
        const rec = makeNotification(n);
        setNotifications((prev) => [rec, ...prev]);
        return rec;
      },
      acknowledgeNotification: (id) =>
        setNotifications((prev) =>
          prev.map((x) =>
            x.id === id && x.status === "NEW"
              ? { ...x, status: "ACKNOWLEDGED", acknowledgedAt: nowTime() }
              : x
          )
        ),
      actNotification: (id) =>
        setNotifications((prev) =>
          prev.map((x) =>
            x.id === id && (x.status === "NEW" || x.status === "ACKNOWLEDGED")
              ? { ...x, status: "ACTED", actedAt: nowTime() }
              : x
          )
        ),
      resolveNotification: (id) =>
        setNotifications((prev) =>
          prev.map((x) =>
            x.id === id && x.status !== "RESOLVED"
              ? { ...x, status: "RESOLVED", resolvedAt: nowTime() }
              : x
          )
        ),
    }),
    [settings, services, providers, departments, staff, bills, issues, agents, attendance, orders, audit, sendLog, ceoView, ollamaModels, checkService, setServiceStatus, brainState, appearance, patients, discharged, prefillReg, dispenses, purchases, beds, medDoses, vitals, appointments, shifts, approvals, reviews, consents, medicines, cdsDifferentials, cdsInvestigations, cdsMedications, cdsProcedures, progressNotes, clinicalNotes, surgicalPlans, admissionDecisions, dischargePlans, followUpPlans, mdtEntries, monitoringPlans, patientEducationRecords, clinicalReferences, cdsActivePatientId, notifications]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
