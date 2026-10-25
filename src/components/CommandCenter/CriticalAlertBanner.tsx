/**
 * R5-06 Level-3 critical value banner (Doctor Dashboard + HUD/admin view).
 * A persistent red alert that CANNOT be dismissed — the only way to close it
 * is [Acknowledge], which records the doctor id + time on the server and is
 * logged. Voice announcement is one sentence through the existing voice layer
 * and overrides night-time suppression. Unacknowledged alerts escalate after
 * the configured timeout: the voice repeats and the banner shows ESCALATED.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertOctagon, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { voiceEngine } from "@/astra/voice/voiceEngine";
import { acknowledgeCriticalAlert, listOpenCriticalAlerts } from "@/astra/clinical/results/resultsClient";
import { criticalVoiceLine, shouldSpeakAnnouncement } from "@/astra/clinical/results/resultsLoop";
import type { CriticalAlertView } from "@/astra/clinical/results/resultsLoop";

const POLL_MS = 4000;

function speakCritical(alert: CriticalAlertView): void {
  const line = criticalVoiceLine(alert);
  // critical: true always speaks — it overrides night-time suppression.
  if (!shouldSpeakAnnouncement({ critical: true, hour: new Date().getHours() })) return;
  try {
    voiceEngine.speak(line, "en-IN");
  } catch {
    // Voice is best-effort; the persistent banner + escalation remain.
  }
}

export function CriticalAlertBanner({ className = "" }: { className?: string }) {
  const { account } = useAuth();
  const isDoctor = ["doctor", "admin"].includes((account?.role ?? "").toLowerCase());
  const [alerts, setAlerts] = useState<CriticalAlertView[]>([]);
  const [acking, setAcking] = useState("");
  const spokenRef = useRef<Set<string>>(new Set());
  const repeatsRef = useRef<Map<string, number>>(new Map());

  const refresh = useCallback(async () => {
    const open = await listOpenCriticalAlerts();
    setAlerts(open);
    for (const alert of open) {
      if (!spokenRef.current.has(alert.id)) {
        spokenRef.current.add(alert.id);
        speakCritical(alert);
      } else if (alert.escalated && alert.escalationRepeats > (repeatsRef.current.get(alert.id) ?? 0)) {
        // Escalation: repeat the announcement until a doctor acknowledges.
        repeatsRef.current.set(alert.id, alert.escalationRepeats);
        speakCritical(alert);
        toast.error(`Level-3 critical alert ESCALATED — unacknowledged`, {
          description: `${alert.patientName ?? alert.patientUhid}: ${alert.findings[0]?.message ?? "critical result"}`,
        });
      }
      if (!alert.escalated) repeatsRef.current.set(alert.id, 0);
    }
    for (const id of [...spokenRef.current]) {
      if (!open.some((alert) => alert.id === id)) {
        spokenRef.current.delete(id);
        repeatsRef.current.delete(id);
      }
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  const handleAcknowledge = async (alert: CriticalAlertView) => {
    setAcking(alert.id);
    const result = await acknowledgeCriticalAlert(alert.id);
    setAcking("");
    if (!result.ok) {
      toast.error("Acknowledgment failed", { description: result.error });
      return;
    }
    toast.success("Critical alert acknowledged", {
      description: `Doctor ${result.alert?.acknowledged?.doctorName} at ${result.alert?.acknowledged?.at}. Logged.`,
    });
    void refresh();
  };

  if (alerts.length === 0) return null;

  return (
    <div data-testid="critical-alert-banner" role="alert" aria-live="assertive" className={`space-y-2 ${className}`}>
      {alerts.map((alert) => (
        <div
          key={alert.id}
          data-testid={`critical-alert-${alert.id}`}
          className={`flex flex-wrap items-center gap-3 rounded-xl border-2 border-rose-500 bg-rose-950/85 px-4 py-3 shadow-[0_0_28px_rgba(244,63,94,0.45)] ${alert.escalated ? "animate-pulse" : ""}`}
        >
          <AlertOctagon className="h-5 w-5 shrink-0 text-rose-300" />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-rose-300">
              {alert.levelLabel} critical value{alert.escalated ? " — ESCALATED (unacknowledged)" : ""}
            </div>
            <div className="text-sm font-bold text-white">
              {alert.patientName ?? alert.patientUhid} · {alert.testName} v{alert.reportVersion}
            </div>
            <ul className="mt-0.5 space-y-0.5">
              {alert.findings.map((finding) => (
                <li key={finding.ruleId} className="text-xs text-rose-100">
                  {finding.message} (confirm with doctor/lab)
                </li>
              ))}
            </ul>
            <div className="mt-1 flex items-center gap-1 text-[10px] text-rose-300/80">
              <Volume2 className="h-3 w-3" /> Spoken until acknowledged — cannot be dismissed.
              {alert.escalated && <span className="font-black">Repeat {alert.escalationRepeats} · shown on HUD/admin view.</span>}
            </div>
          </div>
          <button
            type="button"
            data-testid={`critical-alert-ack-${alert.id}`}
            disabled={!isDoctor || acking === alert.id}
            title={isDoctor ? "Record your acknowledgment (doctor id + time are logged)" : "Only a doctor can acknowledge a critical value"}
            onClick={() => void handleAcknowledge(alert)}
            className="shrink-0 rounded-lg border-2 border-rose-300 bg-rose-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {acking === alert.id ? "Recording…" : "Acknowledge"}
          </button>
        </div>
      ))}
    </div>
  );
}
