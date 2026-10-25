import { useState, useEffect, useRef, useCallback } from "react";
import { BellRing, Volume2, VolumeX, Clock, CheckCircle, XCircle, AlertTriangle, Info, Trash2, Phone } from "lucide-react";
import { toast } from "sonner";
import { GlassCard, SectionTitle, Badge } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn, nowTime, uid } from "@/lib/utils";
import { speakHumanVoice } from "@/utils/audioAlerts";

interface VoiceAlert {
  id: string;
  message: string;
  type: "order" | "lab" | "emergency" | "info";
  patientName?: string;
  read: boolean;
  createdAt: string;
  acknowledgedAt?: string;
}

const SAMPLE_ALERTS: VoiceAlert[] = [
  { id: uid("va"), message: "New lab results available for PT-2301", type: "lab", patientName: "Ramesh", read: false, createdAt: nowTime() },
  { id: uid("va"), message: "Dr. Arjun placed a new order for PT-2305", type: "order", patientName: "Sita", read: false, createdAt: nowTime() },
];

export function ReceptionNotifications() {
  const { account } = useAuth();
  const { orders, logAudit } = useStore();
  const [alerts, setAlerts] = useState<VoiceAlert[]>(SAMPLE_ALERTS);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    audioRef.current = new Audio();
  }, []);

  const speakAlert = useCallback((message: string) => {
    if (!voiceEnabled) return;
    speakHumanVoice(`Alert: ${message}`, undefined, undefined,
      () => toast.error("Voicebox is offline"), "urgent", "en-IN");
  }, [voiceEnabled]);

  const addAlert = useCallback((message: string, type: VoiceAlert["type"], patientName?: string) => {
    const alert: VoiceAlert = {
      id: uid("va"),
      message,
      type,
      patientName,
      read: false,
      createdAt: nowTime(),
    };
    setAlerts((prev) => [alert, ...prev]);
    speakAlert(message);
    logAudit("Voice alert", message, account?.name ?? "Reception");
  }, [speakAlert, logAudit, account]);

  useEffect(() => {
    const lastOrder = orders[orders.length - 1];
    if (lastOrder && !lastOrder.acknowledgedBy) {
      const patient = lastOrder.patientId;
      addAlert(`New order from Dr. ${lastOrder.doctor} for patient ${patient}`, "order", patient);
    }
  }, [orders.length]);

  const acknowledge = (id: string) => {
    setAlerts((prev) => prev.map((a) => a.id === id ? { ...a, read: true, acknowledgedAt: nowTime() } : a));
    toast.success("Alert acknowledged");
  };

  const dismiss = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const clearAll = () => {
    setAlerts([]);
    toast.success("All alerts cleared");
  };

  const filteredAlerts = unreadOnly ? alerts.filter((a) => !a.read) : alerts;

  const unreadCount = alerts.filter((a) => !a.read).length;

  return (
    <div className="space-y-4">
      <GlassCard>
        <div className="flex items-center justify-between">
          <div>
            <SectionTitle title="Voice Alerts & Notifications" subtitle="Real-time voice alerts for incoming orders and updates" />
          </div>
          <div className="flex items-center gap-3">
            <Badge tone="red" className="!text-[10px]">
              <BellRing size={12} className="mr-1" /> {unreadCount} unread
            </Badge>
            <button onClick={() => setVoiceEnabled((v) => !v)}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold border transition-all",
                voiceEnabled ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/30" : "text-slate-400 border-white/10")}>
              {voiceEnabled ? <><Volume2 size={13} className="mr-1" /> Voice ON</> : <><VolumeX size={13} className="mr-1" /> Voice OFF</>}
            </button>
            <button onClick={() => setUnreadOnly((v) => !v)}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold border transition-all",
                unreadOnly ? "bg-cyan-500/20 text-white border-cyan-400/50" : "text-slate-400 border-white/10")}>
              Unread only
            </button>
            <button className="btn-ghost !text-xs" onClick={clearAll}>Clear All</button>
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <SectionTitle title={`Notifications (${filteredAlerts.length})`} subtitle="Most recent first" />
        {filteredAlerts.length === 0 && (
          <div className="text-center py-8">
            <BellRing size={32} className="mx-auto text-slate-600 mb-2" />
            <p className="text-xs text-slate-500">All clear! No new notifications.</p>
          </div>
        )}
        <div className="space-y-2">
          {filteredAlerts.map((alert) => {
            const typeStyles: Record<string, string> = {
              order: "border-cyan-400/20 bg-cyan-500/5",
              lab: "border-violet-400/20 bg-violet-500/5",
              emergency: "border-red-400/20 bg-red-500/5",
              info: "border-white/10 bg-white/[0.02]",
            };
            const typeIcons: Record<string, any> = {
              order: Clock, lab: AlertTriangle, emergency: AlertTriangle, info: Info,
            };
            const typeColors: Record<string, string> = {
              order: "text-cyan-400", lab: "text-violet-400", emergency: "text-red-400", info: "text-slate-400",
            };
            const Icon = typeIcons[alert.type];
            return (
              <div key={alert.id} className={cn("rounded-lg border p-3 transition-all", typeStyles[alert.type], !alert.read && "ring-1 ring-cyan-400/20")}>
                <div className="flex items-center gap-3">
                  <Icon size={16} className={cn("shrink-0", typeColors[alert.type])} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-xs font-medium", !alert.read ? "text-white" : "text-slate-400")}>{alert.message}</span>
                      {!alert.read && <Badge tone="cyan" className="!text-[8px]">New</Badge>}
                      {alert.patientName && <Badge tone="violet" className="!text-[8px]">{alert.patientName}</Badge>}
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">{alert.createdAt}{alert.acknowledgedAt && ` · Acknowledged at ${alert.acknowledgedAt}`}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!alert.read && (
                      <button className="btn-ghost !text-[10px] !py-1 text-emerald-400" onClick={() => acknowledge(alert.id)}>
                        <CheckCircle size={12} /> Ack
                      </button>
                    )}
                    <button className="btn-ghost !text-[10px] !py-1 text-red-400" onClick={() => dismiss(alert.id)}>
                      <XCircle size={12} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>
    </div>
  );
}
