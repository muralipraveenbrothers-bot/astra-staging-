// Astra AI — unified command engine surface.
//
// useCommandRunner() owns the single command pipeline:
//   ASK → UNDERSTAND → AUTHORIZE → EXECUTE → VERIFY → REPORT
// CommandTray() renders its state (flow chips, result cards, confirm modal)
// inside the main conversation. Users never type into a separate box — every
// message goes through the same composer, and the brain routes it here when a
// command pattern matches.

import { useCallback, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Info,
  ShieldAlert,
  ShieldCheck,
  Undo2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth, type Role } from "@/lib/auth";
import {
  executeCommand,
  LEVEL_LABEL,
  type CommandLevel,
  type CommandOutcome,
} from "@/lib/commandEngine";
import { cn, uid } from "@/lib/utils";
import { navHash } from "@/lib/hashRoute";
import type { CommandCtx } from "@/lib/commandEngine";

export interface CmdResult {
  id: string;
  outcome: CommandOutcome;
}

export type FlowStage = "idle" | "understanding" | "authorizing" | "confirming" | "executing" | "reporting";

const FLOW_STEPS = ["ASK", "UNDERSTAND", "AUTHORIZE", "EXECUTE", "VERIFY", "REPORT"] as const;

const LEVEL_ICON: Record<CommandLevel, React.ComponentType<{ size?: number | string; className?: string }>> = {
  info: Info,
  reversible: Zap,
  important: AlertTriangle,
  "high-risk": ShieldAlert,
};

const LEVEL_TONE: Record<CommandLevel, "cyan" | "amber" | "red" | "violet"> = {
  info: "cyan",
  reversible: "violet",
  important: "amber",
  "high-risk": "red",
};

export interface CommandRunner {
  results: CmdResult[];
  flow: FlowStage;
  understood: string;
  executedLabel: string;
  pending: { text: string; outcome: CommandOutcome } | null;
  run: (raw: string) => CommandOutcome | null;
  confirmPending: () => void;
  cancelPending: () => void;
  undo: (r: CmdResult) => void;
  clearAll: () => void;
  ctx: CommandCtx;
}

export function useCommandRunner(): CommandRunner {
  const store = useStore();
  const { account } = useAuth();
  const [results, setResults] = useState<CmdResult[]>([]);
  const [flow, setFlow] = useState<FlowStage>("idle");
  const [understood, setUnderstood] = useState("");
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [executedLabel, setExecutedLabel] = useState("");
  const [pending, setPending] = useState<{ text: string; outcome: CommandOutcome } | null>(null);

  const actor = account?.name ?? "Console";
  const role: Role = account?.role ?? "ceo";

  const ctx = useMemo<CommandCtx>(
    () => ({
      accountName: actor,
      accountRole: role,
      patients: store.patients,
      appointments: store.appointments,
      beds: store.beds,
      orders: store.orders,
      tasks: store.tasks,
      surgicalPlans: store.surgicalPlans,
      admissionDecisions: store.admissionDecisions,
      dischargePlans: store.dischargePlans,
      shifts: store.shifts,
      attendance: store.attendance,
      bills: store.bills,
      medDoses: store.medDoses,
      discharged: store.discharged,
      vitals: store.vitals,
      notifications: store.notifications,
      progressNotes: store.progressNotes,
      clinicalNotes: store.clinicalNotes,
      cdsDifferentials: store.cdsDifferentials,
      cdsInvestigations: store.cdsInvestigations,
      clinicalReferences: store.clinicalReferences,
      addTask: store.addTask,
      addPatient: store.addPatient,
      addBill: store.addBill,
      addSendLog: store.addSendLog,
      addNotification: store.addNotification,
      logAudit: (action: string, detail: string) => store.logAudit(action, detail, actor),
      removePatient: store.removePatient,
      removeBill: store.removeBill,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actor, role, store]
  );

  const push = useCallback((outcome: CommandOutcome) => {
    setResults((p) => [{ id: uid("cmd"), outcome }, ...p].slice(0, 8));
  }, []);

  const applySideEffects = useCallback(
    (outcome: CommandOutcome) => {
      if (outcome.taskAdvance) {
        store.updateTaskStatus(
          outcome.taskAdvance.taskId,
          outcome.taskAdvance.toStatus as Parameters<typeof store.updateTaskStatus>[1],
          actor,
          "Advanced via AI command"
        );
        store.logAudit("AI command — task advanced", `${outcome.taskAdvance.taskId} → ${outcome.taskAdvance.toStatus}`, actor);
      }
    },
    [actor, store]
  );

  const undo = useCallback(
    (r: CmdResult) => {
      const u = r.outcome.undo;
      if (!u) return;
      if (u.billId) store.removeBill(u.billId);
      if (u.patientId) store.removePatient(u.patientId);
      store.logAudit("AI command undone", `${r.outcome.title} — patient/bill removed by ${actor}`, actor);
      setResults((p) => p.filter((x) => x.id !== r.id));
      toast.success("Undone", { description: "Registration and its consultation bill were removed." });
    },
    [actor, store]
  );

  const run = useCallback(
    (raw: string): CommandOutcome | null => {
      const q = raw.trim();
      if (!q) return null;

      if (flow === "confirming" && pending) {
        cancelPendingInternal();
      }

      setFlow("understanding");
      setAuthorized(null);
      setUnderstood("");
      setExecutedLabel("");

      const outcome = executeCommand(q, ctx);

      setUnderstood(outcome.label ?? "unknown");
      setFlow("authorizing");

      if (!outcome.allowed) {
        setAuthorized(false);
        setFlow("executing");
        setExecutedLabel("blocked");
        setFlow("reporting");
        push(outcome);
        toast.error("Permission denied", { description: outcome.deniedReason });
        return outcome;
      }
      setAuthorized(true);

      if (outcome.requiresConfirm && !outcome.confirmed) {
        setExecutedLabel("awaiting confirmation");
        setFlow("confirming");
        setPending({ text: q, outcome });
        return outcome;
      }

      setExecutedLabel("executed");
      setFlow("executing");
      applySideEffects(outcome);
      setFlow("reporting");
      push(outcome);
      toast.success(outcome.title, {
        description: outcome.lines[0] ?? "Audit trail updated.",
      });
      return outcome;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx, applySideEffects, flow, pending, push]
  );

  const cancelPendingInternal = () => {
    setPending(null);
    setFlow("reporting");
    setExecutedLabel("cancelled");
    store.logAudit("AI command — confirmation declined", `“${pending?.text}” by ${actor}`, actor);
    toast.info("Command cancelled", { description: "No action was taken." });
  };

  const confirmPending = useCallback(() => {
    if (!pending) return;
    setPending(null);
    setFlow("executing");
    const outcome = executeCommand(pending.text, ctx, { confirmed: true });
    setExecutedLabel("executed · confirmed");
    applySideEffects(outcome);
    setFlow("reporting");
    push(outcome);
    toast.success(outcome.title, { description: "Confirmation recorded in audit trail." });
  }, [pending, ctx, applySideEffects, push]);

  const cancelPending = useCallback(() => cancelPendingInternal(), []);

  const clearAll = useCallback(() => {
    setResults([]);
    setFlow("idle");
    setUnderstood("");
    setExecutedLabel("");
    setPending(null);
  }, []);

  return { results, flow, understood, executedLabel, pending, run, confirmPending, cancelPending, undo, clearAll, ctx };
}

/* ---------------- tray rendering ---------------- */

export function CommandTray({ runner }: { runner: CommandRunner }) {
  const { flow, results, understood, executedLabel } = runner;

  const flowIndex = (): number => {
    switch (flow) {
      case "understanding": return 0;
      case "authorizing": return 1;
      case "confirming": return 2;
      case "executing": return 3;
      case "reporting": return 5;
      default: return -1;
    }
  };

  return (
    <>
      {flow !== "idle" && (
        <div className="flex items-center gap-1 mb-3 overflow-x-auto pb-1">
          {FLOW_STEPS.map((step, i) => {
            const idx = flowIndex();
            const done = i < idx || flow === "reporting";
            const waitingHere = flow === "confirming" && i === idx;
            return (
              <div key={step} className="flex items-center gap-1 shrink-0">
                <span
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold border transition-all",
                    done ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                      : waitingHere ? "border-amber-400/50 bg-amber-400/10 text-amber-300 animate-pulse"
                        : "border-white/10 bg-white/[0.03] text-slate-500"
                  )}
                >
                  {done ? <CheckCircle2 size={9} /> : waitingHere ? <AlertTriangle size={9} /> : null}
                  {step}
                </span>
                {i < FLOW_STEPS.length - 1 && <ArrowRight size={9} className="text-slate-600" />}
              </div>
            );
          })}
          {flow === "reporting" && !results.length && (
            <span className="text-[9px] text-slate-500 ml-1 whitespace-nowrap">
              {executedLabel === "blocked" ? "blocked — no action taken" : executedLabel === "cancelled" ? "cancelled — no action taken" : "done"}
            </span>
          )}
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2 mb-3">
          {results.map((r) => {
            const o = r.outcome;
            const Icon = LEVEL_ICON[o.level] ?? Info;
            return (
              <div key={r.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 flex items-start gap-3">
                <Icon size={15} className={cn("shrink-0 mt-0.5", o.level === "high-risk" ? "text-red-300" : o.level === "important" ? "text-amber-300" : "text-cyan-300")} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-semibold text-white">{o.title}</p>
                    {!o.allowed && <Badge tone="red" className="!text-[9px]">DENIED</Badge>}
                    <Badge tone={LEVEL_TONE[o.level]} className="!text-[9px]">{LEVEL_LABEL[o.level]}</Badge>
                    {o.confirmed && <Badge tone="green" className="!text-[9px]">confirmed</Badge>}
                  </div>
                  {o.lines.map((l, i) => (
                    <p key={i} className="text-[11px] text-slate-400 mt-0.5">{l}</p>
                  ))}
                  <p className="text-[9px] text-slate-600 mt-1 font-mono">audit: {o.auditAction ?? `${o.label} — recorded`}</p>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  {o.undo && (
                    <button className="btn-ghost !text-[10px] !py-1 !border-red-400/40 !text-red-300" onClick={() => runner.undo(r)}>
                      <Undo2 size={11} /> Undo
                    </button>
                  )}
                  {o.actionRoute && (
                    <button className="btn-ghost !text-[10px] !py-1 !border-cyan-400/40 !text-cyan-300" onClick={() => navHash(o.actionRoute!)}>
                      Open module <ArrowRight size={11} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {understood && results.length === 0 && (
        <p className="text-[10px] text-slate-500 mb-2">
          Intent: <span className="text-amber-300 font-semibold">{understood}</span>
          {executedLabel && <> · <span className={cn("font-semibold", executedLabel === "blocked" ? "text-red-400" : executedLabel === "cancelled" ? "text-amber-400" : "text-emerald-400")}>{executedLabel}</span></>}
        </p>
      )}

      {runner.pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="glass max-w-lg w-full p-6 border !border-amber-400/50 shadow-[0_0_30px_rgba(245,158,11,0.25)]">
            <div className="flex items-center gap-2 mb-3">
              {runner.pending.outcome.level === "high-risk" ? (
                <ShieldAlert size={18} className="text-red-400" />
              ) : (
                <AlertTriangle size={18} className="text-amber-400" />
              )}
              <h3 className="text-sm font-bold font-display text-white">
                {runner.pending.outcome.level === "high-risk" ? "High-risk action — confirm authorization" : "Confirm action"}
              </h3>
            </div>
            <p className="text-sm text-white font-semibold">{runner.pending.outcome.title}</p>
            <div className="mt-2 space-y-1">
              {runner.pending.outcome.lines.map((l, i) => (
                <p key={i} className="text-xs text-slate-400">{l}</p>
              ))}
            </div>
            <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-2.5 text-[10px] text-slate-500">
              Acting as <span className="text-white font-semibold">{runner.ctx.accountName}</span> ({runner.ctx.accountRole.toUpperCase()}) · Confirmation is written to the audit trail.
            </div>
            <div className="flex gap-2 mt-4">
              <button className="btn-ghost flex-1" onClick={runner.cancelPending}>Cancel</button>
              <button
                className={cn("flex-1", runner.pending.outcome.level === "high-risk" ? "btn-danger !border-red-400/60 !text-red-200" : "btn-neon")}
                onClick={runner.confirmPending}
              >
                <ShieldCheck size={13} /> Confirm & Execute
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
