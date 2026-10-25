import { useState } from "react";
import { Eye, EyeOff, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge, GlassCard, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { sleep } from "@/lib/utils";

const waTemplates = [
  { name: "bill_receipt", desc: "Itemised receipt with UPI reference, sent post-payment", approved: true },
  { name: "lab_report_ready", desc: "Report-ready alert with secure download link", approved: true },
  { name: "appointment_reminder", desc: "T-24h reminder with doctor, room and prep notes", approved: true },
  { name: "discount_offer_festive", desc: "Seasonal discount broadcast — marketing category", approved: false },
];

export function Notifications() {
  const { staff, sendLog, addSendLog, logAudit } = useStore();
  const [botToken, setBotToken] = useState("7731:AAF9x...kQ2m");
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  const testSend = async (provider: "Telegram" | "WhatsApp", template: string) => {
    setTesting(template);
    await sleep(900);
    setTesting(null);
    addSendLog({ provider, template, recipient: "Dr. Admin (test)", status: "sent" });
    logAudit("Test notification sent", `${provider} · template ${template}`, "Dr. Admin");
    toast.success(`✓ Test ${provider} message delivered`, { description: `Template: ${template}` });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* telegram */}
        <GlassCard>
          <div className="flex items-center justify-between mb-3">
            <SectionTitle title="Telegram Bot" subtitle="Staff alerts & escalation channel" />
            <Badge tone="green">connected</Badge>
          </div>
          <label className="text-[11px] text-slate-500">Bot token</label>
          <div className="flex gap-2 mt-1">
            <div className="relative flex-1">
              <input
                className="input-dark font-mono !pr-9"
                type={showToken ? "text" : "password"}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
              />
              <button className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white" onClick={() => setShowToken((v) => !v)}>
                {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button className="btn-neon !text-xs" disabled={testing === "tg_test"} onClick={() => void testSend("Telegram", "tg_test")}>
              {testing === "tg_test" ? <span className="h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin" /> : <Send size={13} />}
              Test send
            </button>
          </div>
          <p className="text-[10px] text-slate-600 mt-2">Escalations, attendance anomalies and recon flags post to #astra-ops automatically.</p>
        </GlassCard>

        {/* whatsapp */}
        <GlassCard>
          <div className="flex items-center justify-between mb-3">
            <SectionTitle title="WhatsApp Business Cloud API" subtitle="Patient-facing templates" />
            <Badge tone="green">connected</Badge>
          </div>
          <div className="space-y-2">
            {waTemplates.map((t) => (
              <div key={t.name} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono text-white">{t.name}</div>
                  <div className="text-[11px] text-slate-500">{t.desc}</div>
                </div>
                <Badge tone={t.approved ? "green" : "amber"} className="!text-[9px] shrink-0">
                  {t.approved ? "Meta approved" : "pending review"}
                </Badge>
                <button
                  className="btn-ghost !text-[10px] !py-1 shrink-0"
                  disabled={!t.approved || testing === t.name}
                  onClick={() => void testSend("WhatsApp", t.name)}
                >
                  {testing === t.name ? "sending…" : "Test"}
                </button>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      {/* preference matrix */}
      <GlassCard>
        <SectionTitle title="Per-Staff Preference Matrix" subtitle="Who receives what, where" />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-white/10">
                <th className="pb-2 font-medium">Staff</th>
                <th className="pb-2 font-medium">Role</th>
                <th className="pb-2 font-medium text-center">WhatsApp</th>
                <th className="pb-2 font-medium text-center">Telegram</th>
                <th className="pb-2 font-medium text-center">Escalations</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                  <td className="py-2.5 text-white font-medium">{s.name}</td>
                  <td className="py-2.5 text-slate-400">{s.role}</td>
                  <td className="py-2.5 text-center">{s.notifyWhatsApp ? <span className="text-emerald-300">✓</span> : <span className="text-slate-600">—</span>}</td>
                  <td className="py-2.5 text-center">{s.notifyTelegram ? <span className="text-cyan-300">✓</span> : <span className="text-slate-600">—</span>}</td>
                  <td className="py-2.5 text-center">{s.paperclipMapped ? <Badge tone="violet" className="!text-[9px]">via Paperclip</Badge> : <span className="text-slate-600">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* send log */}
      <GlassCard>
        <SectionTitle title="Send Log" subtitle="Every outbound message, newest first" />
        <div className="max-h-56 overflow-y-auto space-y-1.5">
          {sendLog.length === 0 && <p className="text-xs text-slate-500">No messages sent yet — try a Test send above.</p>}
          {sendLog.map((l) => (
            <div key={l.id} className="flex items-center gap-3 text-xs rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
              <span className="font-mono text-slate-500">{l.timestamp}</span>
              <Badge tone={l.provider === "Telegram" ? "cyan" : "green"} className="!text-[9px]">{l.provider}</Badge>
              <span className="font-mono text-slate-300">{l.template}</span>
              <span className="text-slate-500 truncate flex-1">→ {l.recipient}</span>
              <Badge tone={l.status === "sent" ? "green" : "red"} className="!text-[9px]">{l.status}</Badge>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
