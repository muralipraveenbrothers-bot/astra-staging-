// Shared doctor-order queue plumbing — used by the Pharmacy dispensing queue,
// the Ward instruction feed, and any other department queue. Countdown,
// NEW-pulse badge, escalation, and proof-of-execution are identical to the
// main Orders (IP) page, so every queue stays consistent.

import { useEffect, useRef, useState } from "react";
import { AlarmClock, Camera, CheckCircle2, Mic, ShieldAlert, Sparkle } from "lucide-react";
import { toast } from "sonner";
import { Badge, Modal } from "@/components/ui";
import { cn, sleep } from "@/lib/utils";
import type { HospitalOrder, Issue } from "@/lib/types";

export const ESCALATION_PATH = "Staff → Supervisor → Dept Head → CEO";
export const NEW_WINDOW_MS = 120_000;

export function useNow(stepMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), stepMs);
    return () => clearInterval(t);
  }, [stepMs]);
  return now;
}

export const isNewOrder = (o: HospitalOrder, now: number) => !o.acknowledgedAt && now - o.createdTs < NEW_WINDOW_MS;

export function fmtLeft(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

/**
 * Auto-escalation ticker for a department queue: expired, unacknowledged,
 * not-yet-escalated orders get flagged, file a critical Issue, and toast.
 * Runs only while the owning module is mounted; guarded by the persisted
 * `escalated` flag so re-mounts never double-file.
 */
export function useOrderEscalation(
  orders: HospitalOrder[],
  setOrders: (o: HospitalOrder[]) => void,
  addIssue: (i: Omit<Issue, "id" | "createdAt">) => void,
  deptFilter: string
) {
  const ref = useRef({ orders, setOrders, addIssue, deptFilter });
  ref.current = { orders, setOrders, addIssue, deptFilter };
  useEffect(() => {
    const t = setInterval(() => {
      const { orders: cur, setOrders: set, addIssue: file, deptFilter: dept } = ref.current;
      const pending = cur.filter(
        (o) => (o.targetDept ?? "Ward") === dept && !o.acknowledgedAt && !o.escalated && Date.now() - o.createdTs > o.dueMin * 60_000
      );
      if (!pending.length) return;
      pending.forEach((o) => {
        file({
          title: `OVERDUE ${dept} order ${o.patientId}: “${o.orderText.slice(0, 50)}” — escalated (${ESCALATION_PATH})`,
          status: "todo",
          priority: "critical",
          assignee: "Ward Ops Reviewer",
        });
        toast.error(`${dept} order overdue — escalated`, { description: `${o.patientId} · ${ESCALATION_PATH}` });
      });
      const ids = new Set(pending.map((o) => o.id));
      set(cur.map((o) => (ids.has(o.id) ? { ...o, escalated: true } : o)));
    }, 1000);
    return () => clearInterval(t);
  }, []);
}

/** One department-queue order row — NEW pulse, countdown, overdue/escalation badges, action button. */
export function OrderQueueRow({
  o,
  now,
  actionLabel,
  onAction,
}: {
  o: HospitalOrder;
  now: number;
  actionLabel: string;
  onAction: (o: HospitalOrder) => void;
}) {
  const msLeft = o.createdTs + o.dueMin * 60_000 - now;
  const expired = msLeft <= 0 && !o.acknowledgedAt;
  const urgent = !expired && !o.acknowledgedAt && msLeft < 5 * 60_000;
  const fresh = isNewOrder(o, now);
  return (
    <div
      className={cn(
        "rounded-lg border p-3.5 flex items-start gap-3.5",
        o.acknowledgedAt
          ? "border-emerald-400/25 bg-emerald-400/[0.04]"
          : expired
            ? "border-red-400/40 bg-red-400/[0.05]"
            : urgent
              ? "border-amber-400/40 bg-amber-400/[0.05]"
              : fresh
                ? "border-yellow-400/50 bg-yellow-400/[0.06] shadow-[0_0_18px_rgba(212,175,55,0.18)]"
                : "border-white/10 bg-white/[0.03]"
      )}
    >
      <div className="shrink-0 mt-0.5">
        {o.acknowledgedAt ? (
          <CheckCircle2 size={18} className="text-emerald-400" />
        ) : expired ? (
          <ShieldAlert size={18} className="text-red-400 animate-pulse" />
        ) : fresh ? (
          <Sparkle size={18} className="text-yellow-300 animate-pulse" />
        ) : (
          <AlarmClock size={18} className={urgent ? "text-amber-400" : "text-cyan-300"} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-neon-cyan text-xs">{o.patientId}</span>
          <span className="text-[10px] text-slate-500">by {o.doctor} · {o.createdAt}</span>
          {fresh && (
            <span className="inline-flex items-center gap-1 rounded-full border border-yellow-400/60 bg-yellow-400/15 px-2 py-0.5 text-[9px] font-bold text-yellow-300 animate-pulse">
              ✦ NEW
            </span>
          )}
          {expired && <Badge tone="red" className="!text-[9px]">CAUTION — OVERDUE</Badge>}
          {expired && o.escalated && <Badge tone="amber" className="!text-[9px]">⬆ {ESCALATION_PATH}</Badge>}
          {urgent && !expired && <Badge tone="amber" className="!text-[9px]">due soon</Badge>}
          {o.acknowledgedAt && <Badge tone="green" className="!text-[9px]">executed ✓</Badge>}
        </div>
        <p className="text-sm text-slate-200 mt-1">{o.orderText}</p>
        {o.drug && (
          <p className="text-[11px] text-slate-400 mt-0.5">
            💊 {o.drug}{o.dose ? ` · ${o.dose}` : ""}{o.qty ? ` · qty ${o.qty}` : ""}
          </p>
        )}
        {o.acknowledgedAt && (
          <p className="text-[11px] text-emerald-300/80 mt-1">
            ✓ {o.acknowledgedBy} at {o.acknowledgedAt} — proof: “{o.proofNote}”{o.proofPhoto ? " 📷" : ""}{o.proofVoice ? " 🎙" : ""}
          </p>
        )}
      </div>
      {!o.acknowledgedAt && (
        <div className="shrink-0 text-right space-y-2">
          <div
            className={cn(
              "font-mono text-base font-bold tabular-nums",
              expired ? "text-red-300 animate-pulse" : urgent ? "text-amber-300" : "text-white"
            )}
          >
            {expired ? `+${fmtLeft(-msLeft)}` : fmtLeft(msLeft)}
          </div>
          <button className="btn-neon !text-[11px] !py-1.5" onClick={() => onAction(o)}>
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
}

/** Proof-of-execution modal — note required, optional simulated photo / voice note. */
export function AckModal({
  order,
  staffName,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  order: HospitalOrder | null;
  staffName: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: (o: HospitalOrder, proof: { note: string; photo: boolean; voice: boolean }) => void;
}) {
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState(false);
  const [voice, setVoice] = useState(false);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    setNote("");
    setPhoto(false);
    setVoice(false);
    setRecording(false);
  }, [order?.id]);

  const snap = async () => {
    toast.info("Capturing proof photo…", { description: "Kiosk cam 02 (simulated snapshot)." });
    await sleep(700);
    setPhoto(true);
    toast.success("Proof photo attached");
  };
  const rec = async () => {
    setRecording(true);
    await sleep(1500);
    setRecording(false);
    setVoice(true);
    toast.success("Voice note recorded", { description: "0:02 clip attached (simulated)." });
  };

  return (
    <Modal open={!!order} onClose={onClose} title={`Proof of execution — ${order?.patientId ?? ""}`} wide>
      <div className="space-y-3">
        <p className="text-xs text-slate-400">Order: <span className="text-slate-200">{order?.orderText}</span></p>
        <textarea
          className="input-dark resize-none"
          rows={3}
          placeholder="Completion note (required) — what was done, observations…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="flex gap-2">
          <button className={cn("btn-ghost !text-xs flex-1", photo && "!border-emerald-400/50 !text-emerald-300")} onClick={() => void snap()}>
            <Camera size={13} /> {photo ? "✓ Photo attached" : "Attach photo"}
          </button>
          <button
            className={cn("btn-ghost !text-xs flex-1", voice && "!border-emerald-400/50 !text-emerald-300", recording && "!border-red-400/60 !text-red-300")}
            disabled={recording}
            onClick={() => void rec()}
          >
            <Mic size={13} className={recording ? "animate-pulse" : ""} />
            {recording ? "Recording…" : voice ? "✓ Voice note 0:02" : "Record voice note"}
          </button>
        </div>
        <button
          className="btn-neon w-full"
          disabled={!note.trim() || !order}
          onClick={() => order && onConfirm(order, { note: note.trim(), photo, voice })}
        >
          {confirmLabel ?? `Sign & acknowledge (${staffName})`}
        </button>
      </div>
    </Modal>
  );
}

/** Small helper to build an ack'ed order object. */
export function ackPatch(o: HospitalOrder, staffName: string, at: string, proof: { note: string; photo: boolean; voice: boolean }): HospitalOrder {
  return {
    ...o,
    acknowledgedBy: staffName,
    acknowledgedAt: at,
    proofNote: proof.note,
    proofPhoto: proof.photo,
    proofVoice: proof.voice,
  };
}

