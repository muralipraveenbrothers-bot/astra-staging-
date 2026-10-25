// Astra AI — Smart Context Panel.
// Right-side panel that dynamically shows the most relevant context based on
// the current conversation focus: Patient, Lab, Hospital, Pharmacy, Tasks, etc.
// Uses EXISTING Astra store data — never invents anything.

import { useMemo } from "react";
import {
    Activity,
    AlertTriangle,
    BedDouble,
    Building2,
    FlaskConical,
    HeartPulse,
    Pill,
    Stethoscope,
    Users2,
    X,
} from "lucide-react";
import { Badge, GlassCard } from "@/components/ui";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { navHash } from "@/lib/hashRoute";
import type { ConversationContext } from "@/lib/conversation";
import { hospitalCensus, whatNeedsAttention } from "@/lib/astraFeatures";

export type ContextMode =
    | "patient"
    | "lab"
    | "hospital"
    | "pharmacy"
    | "radiology"
    | "tasks"
    | "alerts"
    | "census"
    | "bed"
    | "timeline"
    | "default";

export function detectContextMode(
    text: string,
    session: ConversationContext
): ContextMode {
    const q = text.toLowerCase();
    if (session.patientUhid || session.patientName) {
        if (/(cbc|lft|rft|lab|blood|urine|esr|crp|troponin|d-dimer|electrolyte|lipid|thyroid|hba1c|sugar|amylase|lipase|bilirubin|sgpt|sgot|creatinine|urea|sodium|potassium|investigation|result)/.test(q)) return "lab";
        if (/(x-?ray|usg|ultrasound|ct|mri|ecg|echo|radiology|imaging|scan)/.test(q)) return "radiology";
        if (/(medication|medicine|drug|prescription|pharmacy|tablet|injection|dose)/.test(q)) return "pharmacy";
        if (/(task|order|pending|workflow)/.test(q)) return "tasks";
        if (/(alert|notification|critical|urgent|attention)/.test(q)) return "alerts";
        if (/(vital|bp|pulse|temp|spo2|heart)/.test(q)) return "timeline";
        if (/(bed|ward|admission|ip|inpatient)/.test(q)) return "bed";
        return "patient";
    }
    if (/(census|how many patients|hospital|total|op|ip|icu|ward|emergency)/.test(q)) return "census";
    if (/(pharmacy|prescription|dispense|medication|drug)/.test(q)) return "pharmacy";
    if (/(lab|laboratory|test|investigation|result)/.test(q)) return "lab";
    if (/(radiology|x-?ray|usg|ct|mri|imaging|scan)/.test(q)) return "radiology";
    if (/(task|order|pending|workflow|queue)/.test(q)) return "tasks";
    if (/(alert|notification|critical|urgent|attention)/.test(q)) return "alerts";
    if (/(bed|ward|admission|ip|inpatient|occupancy)/.test(q)) return "bed";
    if (/(attention|priority|what needs)/.test(q)) return "alerts";
    return "default";
}

export function SmartContextPanel({
    mode,
    session,
    onClose,
}: {
    mode: ContextMode;
    session: ConversationContext;
    onClose?: () => void;
}) {
    const store = useStore();

    const patient = useMemo(() => {
        if (!session.patientUhid && !session.patientName) return undefined;
        return (
            store.patients.find((p) => p.id === session.patientUhid) ??
            store.patients.find((p) => p.name.toLowerCase().includes((session.patientName ?? "").toLowerCase()))
        );
    }, [session.patientUhid, session.patientName, store.patients]);

    const census = useMemo(
        () => hospitalCensus(store.patients, store.beds, store.appointments, store.discharged),
        [store.patients, store.beds, store.appointments, store.discharged]
    );

    const attention = useMemo(
        () =>
            whatNeedsAttention({
                patients: store.patients,
                beds: store.beds,
                orders: store.orders,
                tasks: store.tasks,
                vitals: store.vitals,
                medDoses: store.medDoses,
                appointments: store.appointments,
                notifications: store.notifications,
            }),
        [store.patients, store.beds, store.orders, store.tasks, store.vitals, store.medDoses, store.appointments, store.notifications]
    );

    const patientOrders = useMemo(
        () => (patient ? store.orders.filter((o) => o.patientId === patient.id) : []),
        [patient, store.orders]
    );

    const patientTasks = useMemo(
        () =>
            patient
                ? store.tasks.filter(
                    (t) => t.patientId === patient.id || t.patientName === patient.name
                )
                : [],
        [patient, store.tasks]
    );

    const patientVitals = useMemo(
        () => (patient ? store.vitals.filter((v) => v.patientId === patient.id).slice(0, 5) : []),
        [patient, store.vitals]
    );

    const patientMeds = useMemo(
        () => (patient ? store.medDoses.filter((m) => m.patientId === patient.id) : []),
        [patient, store.medDoses]
    );

    const patientBed = useMemo(
        () => (patient ? store.beds.find((b) => b.patientId === patient.id) : undefined),
        [patient, store.beds]
    );

    const patientAlerts = useMemo(
        () =>
            patient
                ? store.notifications.filter(
                    (n) =>
                        (n.linkedPatient && patient.name.toLowerCase().includes(n.linkedPatient.toLowerCase())) ||
                        (n.linkedUhid && patient.id.includes(n.linkedUhid))
                )
                : [],
        [patient, store.notifications]
    );

    const openTasks = store.tasks.filter(
        (t) => t.status !== "COMPLETED" && t.status !== "CLOSED" && t.status !== "VERIFIED"
    );

    const openOrders = store.orders.filter((o) => !o.acknowledgedAt);

    const pendingPharmacy = store.tasks.filter(
        (t) => t.category === "pharmacy" && t.status !== "COMPLETED" && t.status !== "CLOSED" && t.status !== "VERIFIED"
    );

    const pendingLab = store.tasks.filter(
        (t) => t.category === "lab" && t.status !== "COMPLETED" && t.status !== "CLOSED" && t.status !== "VERIFIED"
    );

    const renderPatient = () => {
        if (!patient) {
            return (
                <div className="text-xs text-slate-500 p-3 text-center">
                    No patient in context. Ask about a patient to see their details here.
                </div>
            );
        }
        return (
            <div className="space-y-3">
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-sm font-bold text-white">{patient.name}</p>
                        <p className="font-mono text-[10px] text-cyan-300">{patient.id}</p>
                    </div>
                    <Badge tone={patient.admissionStatus === "inpatient" ? "amber" : "cyan"}>
                        {patient.admissionStatus ?? "outpatient"}
                    </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg border border-white/10 p-2">
                        <div className="text-slate-500">Age / Gender</div>
                        <div className="text-white font-semibold">{patient.age ?? "—"}y · {patient.gender ?? "—"}</div>
                    </div>
                    <div className="rounded-lg border border-white/10 p-2">
                        <div className="text-slate-500">Department</div>
                        <div className="text-white font-semibold">{patient.department ?? "—"}</div>
                    </div>
                    <div className="rounded-lg border border-white/10 p-2">
                        <div className="text-slate-500">Doctor</div>
                        <div className="text-white font-semibold">{patient.linkedDoctor ?? "—"}</div>
                    </div>
                    <div className="rounded-lg border border-white/10 p-2">
                        <div className="text-slate-500">Complaint</div>
                        <div className="text-white font-semibold truncate">{patient.complaint ?? "—"}</div>
                    </div>
                </div>
                {patientBed && (
                    <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.05] p-2.5 text-[11px]">
                        <div className="flex items-center gap-1.5 text-amber-300 font-semibold">
                            <BedDouble size={12} /> {patientBed.label} · {patientBed.ward}
                        </div>
                        <div className="text-slate-400 mt-0.5">{patientBed.diagnosis ?? "No diagnosis"}</div>
                    </div>
                )}
                {patientVitals.length > 0 && (
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Latest vitals</p>
                        <div className="space-y-1">
                            {patientVitals.map((v) => (
                                <div key={v.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-2 text-[11px]">
                                    <div className="flex items-center justify-between">
                                        <span className="text-slate-400">{v.at}</span>
                                        {v.abnormal.length > 0 && <AlertTriangle size={10} className="text-red-400" />}
                                    </div>
                                    <div className="text-white mt-0.5">
                                        {v.tempF}°F · {v.pulse} bpm · BP {v.bp} · SpO2 {v.spo2}%
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {patientOrders.length > 0 && (
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Orders</p>
                        <div className="space-y-1">
                            {patientOrders.slice(0, 4).map((o) => (
                                <div key={o.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-2 text-[11px]">
                                    <div className="text-white">{o.orderText}</div>
                                    <div className="text-slate-500 mt-0.5">{o.targetDept ?? "Ward"} · {o.createdAt}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {patientMeds.length > 0 && (
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Medications</p>
                        <div className="space-y-1">
                            {patientMeds.slice(0, 4).map((m) => (
                                <div key={m.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-2 text-[11px]">
                                    <div className="text-white">{m.drug} · {m.dose}</div>
                                    <div className="text-slate-500 mt-0.5">
                                        {m.givenAt ? `Given ${m.givenAt}` : `Due ${new Date(m.dueTs).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {patientAlerts.length > 0 && (
                    <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Alerts</p>
                        <div className="space-y-1">
                            {patientAlerts.slice(0, 3).map((n) => (
                                <div key={n.id} className={cn("rounded-lg border p-2 text-[11px]", n.severity === "critical" ? "border-red-400/40 bg-red-400/[0.05]" : "border-amber-400/30 bg-amber-400/[0.05]")}>
                                    <div className="text-white font-semibold">{n.title}</div>
                                    <div className="text-slate-400 mt-0.5">{n.detail}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <button className="btn-ghost w-full !text-[10px]" onClick={() => navHash("/journey")}>
                    Open Patient Workspace →
                </button>
            </div>
        );
    };

    const renderCensus = () => (
        <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-cyan-400/30 bg-cyan-400/[0.05] p-3 text-center">
                    <div className="text-2xl font-bold text-white">{census.total}</div>
                    <div className="text-[10px] text-slate-400">Total</div>
                </div>
                <div className="rounded-lg border border-white/10 p-3 text-center">
                    <div className="text-2xl font-bold text-white">{census.op}</div>
                    <div className="text-[10px] text-slate-400">OP</div>
                </div>
                <div className="rounded-lg border border-violet-400/30 bg-violet-400/[0.05] p-3 text-center">
                    <div className="text-2xl font-bold text-white">{census.ip}</div>
                    <div className="text-[10px] text-slate-400">IP</div>
                </div>
                <div className="rounded-lg border border-red-400/30 bg-red-400/[0.05] p-3 text-center">
                    <div className="text-2xl font-bold text-white">{census.icu}</div>
                    <div className="text-[10px] text-slate-400">ICU</div>
                </div>
                <div className="rounded-lg border border-white/10 p-3 text-center">
                    <div className="text-2xl font-bold text-white">{census.ward}</div>
                    <div className="text-[10px] text-slate-400">Ward</div>
                </div>
                <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.05] p-3 text-center">
                    <div className="text-2xl font-bold text-white">{census.emergency}</div>
                    <div className="text-[10px] text-slate-400">Emergency</div>
                </div>
            </div>
            <div className="rounded-lg border border-white/10 p-3 text-[11px] space-y-1">
                <div className="flex justify-between"><span className="text-slate-400">Beds occupied</span><span className="text-white font-semibold">{census.bedsOccupied}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Beds vacant</span><span className="text-white font-semibold">{census.bedsVacant}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Cleaning</span><span className="text-white font-semibold">{census.bedsCleaning}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Discharged today</span><span className="text-white font-semibold">{census.dischargedToday}</span></div>
                <div className="flex justify-between"><span className="text-slate-400">Appointments today</span><span className="text-white font-semibold">{census.appointmentsToday}</span></div>
            </div>
            <button className="btn-ghost w-full !text-[10px]" onClick={() => navHash("/journey")}>
                View Patients →
            </button>
        </div>
    );

    const renderAttention = () => (
        <div className="space-y-2">
            {attention.length === 0 && (
                <p className="text-xs text-slate-500 p-3 text-center">Nothing needs attention right now.</p>
            )}
            {attention.slice(0, 8).map((item) => (
                <div
                    key={item.id}
                    className={cn(
                        "rounded-lg border p-2.5 cursor-pointer hover:bg-white/[0.05] transition-colors",
                        item.severity === "critical" ? "border-red-400/40 bg-red-400/[0.05]"
                            : item.severity === "high" ? "border-amber-400/30 bg-amber-400/[0.05]"
                                : "border-white/10 bg-white/[0.02]"
                    )}
                    onClick={() => item.actionRoute && navHash(item.actionRoute)}
                >
                    <div className="flex items-center gap-1.5">
                        {item.severity === "critical" && <AlertTriangle size={11} className="text-red-400" />}
                        <span className="text-[9px] uppercase tracking-wider text-slate-500">{item.category}</span>
                    </div>
                    <p className="text-[11px] text-white font-semibold mt-1">{item.title}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">{item.detail}</p>
                </div>
            ))}
        </div>
    );

    const renderTasks = () => (
        <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-white/10 p-2.5 text-center">
                    <div className="text-xl font-bold text-white">{openTasks.length}</div>
                    <div className="text-[10px] text-slate-400">Open tasks</div>
                </div>
                <div className="rounded-lg border border-white/10 p-2.5 text-center">
                    <div className="text-xl font-bold text-white">{openOrders.length}</div>
                    <div className="text-[10px] text-slate-400">Unacked orders</div>
                </div>
            </div>
            {openTasks.slice(0, 6).map((t) => (
                <div key={t.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                    <div className="flex items-center justify-between">
                        <span className="font-mono text-[9px] text-amber-300">{t.id}</span>
                        <Badge tone={t.priority === "critical" ? "red" : t.priority === "high" ? "amber" : "neutral"} className="!text-[8px]">
                            {t.priority}
                        </Badge>
                    </div>
                    <p className="text-[11px] text-white mt-1">{t.title}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{t.department} · {t.status}</p>
                </div>
            ))}
            <button className="btn-ghost w-full !text-[10px]" onClick={() => navHash("/tasks")}>
                Open Tasks →
            </button>
        </div>
    );

    const renderLab = () => (
        <div className="space-y-2">
            <div className="rounded-lg border border-cyan-400/30 bg-cyan-400/[0.05] p-2.5">
                <div className="flex items-center gap-1.5 text-cyan-300 font-semibold text-[11px]">
                    <FlaskConical size={12} /> Pending lab investigations
                </div>
                <div className="text-2xl font-bold text-white mt-1">{pendingLab.length}</div>
            </div>
            {pendingLab.slice(0, 5).map((t) => (
                <div key={t.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                    <p className="text-[11px] text-white font-semibold">{t.title}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{t.patientName ?? "No patient"} · {t.status}</p>
                </div>
            ))}
            <button className="btn-ghost w-full !text-[10px]" onClick={() => navHash("/lab")}>
                Open Laboratory →
            </button>
        </div>
    );

    const renderPharmacy = () => (
        <div className="space-y-2">
            <div className="rounded-lg border border-violet-400/30 bg-violet-400/[0.05] p-2.5">
                <div className="flex items-center gap-1.5 text-violet-300 font-semibold text-[11px]">
                    <Pill size={12} /> Pending pharmacy orders
                </div>
                <div className="text-2xl font-bold text-white mt-1">{pendingPharmacy.length}</div>
            </div>
            {pendingPharmacy.slice(0, 5).map((t) => (
                <div key={t.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                    <p className="text-[11px] text-white font-semibold">{t.title}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{t.patientName ?? "No patient"} · {t.status}</p>
                </div>
            ))}
            <button className="btn-ghost w-full !text-[10px]" onClick={() => navHash("/pharmacy")}>
                Open Pharmacy →
            </button>
        </div>
    );

    const renderRadiology = () => (
        <div className="space-y-2">
            <div className="rounded-lg border border-white/10 p-2.5">
                <div className="flex items-center gap-1.5 text-white font-semibold text-[11px]">
                    <Activity size={12} /> Radiology worklist
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Open the Radiology workspace for imaging orders and reports.</p>
            </div>
            <button className="btn-ghost w-full !text-[10px]" onClick={() => navHash("/radiology")}>
                Open Radiology →
            </button>
        </div>
    );

    const renderBed = () => (
        <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/[0.05] p-2.5 text-center">
                    <div className="text-xl font-bold text-white">{census.bedsOccupied}</div>
                    <div className="text-[9px] text-slate-400">Occupied</div>
                </div>
                <div className="rounded-lg border border-white/10 p-2.5 text-center">
                    <div className="text-xl font-bold text-white">{census.bedsVacant}</div>
                    <div className="text-[9px] text-slate-400">Vacant</div>
                </div>
                <div className="rounded-lg border border-amber-400/30 bg-amber-400/[0.05] p-2.5 text-center">
                    <div className="text-xl font-bold text-white">{census.bedsCleaning}</div>
                    <div className="text-[9px] text-slate-400">Cleaning</div>
                </div>
            </div>
            <div className="space-y-1">
                {store.beds.filter((b) => b.status === "occupied").slice(0, 6).map((b) => (
                    <div key={b.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-2 text-[11px]">
                        <div className="flex items-center justify-between">
                            <span className="text-white font-semibold">{b.label} · {b.ward}</span>
                            <span className="text-slate-500">{b.patientName}</span>
                        </div>
                    </div>
                ))}
            </div>
            <button className="btn-ghost w-full !text-[10px]" onClick={() => navHash("/ward")}>
                Open Ward →
            </button>
        </div>
    );

    const renderTimeline = () => {
        if (!patient) return <p className="text-xs text-slate-500 p-3 text-center">No patient in context.</p>;
        return (
            <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Patient timeline</p>
                {patientVitals.length === 0 && patientOrders.length === 0 && patientTasks.length === 0 && (
                    <p className="text-xs text-slate-500 p-3 text-center">No timeline data for this patient yet.</p>
                )}
                {patientVitals.map((v) => (
                    <div key={v.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-2 text-[11px]">
                        <div className="flex items-center gap-1.5 text-cyan-300">
                            <HeartPulse size={10} /> Vitals · {v.at}
                        </div>
                        <div className="text-white mt-0.5">{v.tempF}°F · {v.pulse} bpm · BP {v.bp} · SpO2 {v.spo2}%</div>
                    </div>
                ))}
                {patientOrders.map((o) => (
                    <div key={o.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-2 text-[11px]">
                        <div className="flex items-center gap-1.5 text-violet-300">
                            <Stethoscope size={10} /> Order · {o.createdAt}
                        </div>
                        <div className="text-white mt-0.5">{o.orderText}</div>
                    </div>
                ))}
                {patientTasks.map((t) => (
                    <div key={t.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-2 text-[11px]">
                        <div className="flex items-center gap-1.5 text-amber-300">
                            <Activity size={10} /> Task · {t.status}
                        </div>
                        <div className="text-white mt-0.5">{t.title}</div>
                    </div>
                ))}
            </div>
        );
    };

    const renderDefault = () => (
        <div className="space-y-3">
            <div className="rounded-lg border border-white/10 p-3">
                <div className="flex items-center gap-2 text-white font-semibold text-xs">
                    <Building2 size={14} className="text-cyan-300" /> Hospital Pulse
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                    <div className="text-center">
                        <div className="text-xl font-bold text-white">{census.total}</div>
                        <div className="text-[9px] text-slate-400">Patients</div>
                    </div>
                    <div className="text-center">
                        <div className="text-xl font-bold text-white">{census.bedsOccupied}/{store.beds.length}</div>
                        <div className="text-[9px] text-slate-400">Beds</div>
                    </div>
                    <div className="text-center">
                        <div className="text-xl font-bold text-white">{openTasks.length}</div>
                        <div className="text-[9px] text-slate-400">Open tasks</div>
                    </div>
                    <div className="text-center">
                        <div className="text-xl font-bold text-white">{attention.filter((a) => a.severity === "critical").length}</div>
                        <div className="text-[9px] text-slate-400">Critical</div>
                    </div>
                </div>
            </div>
            <div className="rounded-lg border border-white/10 p-3">
                <div className="flex items-center gap-2 text-white font-semibold text-xs">
                    <Users2 size={14} className="text-violet-300" /> Quick actions
                </div>
                <div className="space-y-1.5 mt-2">
                    {["What needs attention?", "How many patients are in the hospital?", "Show me the patients.", "Start my rounds."].map((q) => (
                        <button
                            key={q}
                            className="w-full text-left rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5 text-[10px] text-slate-300 hover:text-white hover:border-cyan-400/30 transition-colors"
                            onClick={() => {
                                window.dispatchEvent(new CustomEvent("Astra:command", { detail: { text: q, source: "suggestion" } }));
                            }}
                        >
                            {q}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );

    const renderContent = () => {
        switch (mode) {
            case "patient": return renderPatient();
            case "census": return renderCensus();
            case "alerts": return renderAttention();
            case "tasks": return renderTasks();
            case "lab": return renderLab();
            case "pharmacy": return renderPharmacy();
            case "radiology": return renderRadiology();
            case "bed": return renderBed();
            case "timeline": return renderTimeline();
            default: return renderDefault();
        }
    };

    const titleFor = (m: ContextMode): string => {
        switch (m) {
            case "patient": return "Patient Context";
            case "census": return "Hospital Pulse";
            case "alerts": return "Attention Queue";
            case "tasks": return "Tasks & Orders";
            case "lab": return "Lab Context";
            case "pharmacy": return "Pharmacy Context";
            case "radiology": return "Radiology Context";
            case "bed": return "Bed & Ward";
            case "timeline": return "Patient Timeline";
            default: return "Context";
        }
    };

    return (
        <GlassCard className="!p-4 h-full overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gradient">{titleFor(mode)}</h3>
                {onClose && (
                    <button className="btn-ghost !p-1" onClick={onClose} aria-label="Close context panel">
                        <X size={12} />
                    </button>
                )}
            </div>
            {renderContent()}
        </GlassCard>
    );
}
