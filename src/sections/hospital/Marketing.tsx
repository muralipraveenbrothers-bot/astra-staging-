import { useState } from "react";
import { BellRing, Megaphone, Plus, Send } from "lucide-react";
import { toast } from "sonner";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, GlassCard, Modal, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { fmtINR, uid } from "@/lib/utils";

interface Campaign {
  id: string;
  name: string;
  kind: "Village visit" | "Health camp" | "WhatsApp campaign";
  date: string;
  spend: number;
  opAttributed: number[];
  status: "active" | "completed" | "planned";
}

const seedCampaigns: Campaign[] = [
  { id: "cp-1", name: "Rampur village outreach", kind: "Village visit", date: "Jul 6", spend: 12000, opAttributed: [4, 9, 14, 18], status: "completed" },
  { id: "cp-2", name: "Free BP & sugar camp — bus stand", kind: "Health camp", date: "Jul 13", spend: 21000, opAttributed: [6, 15, 26, 41], status: "completed" },
  { id: "cp-3", name: "Monsoon fever WhatsApp drive", kind: "WhatsApp campaign", date: "Jul 18", spend: 3500, opAttributed: [2, 7, 13, 22], status: "active" },
  { id: "cp-4", name: "School health check — Govt HS", kind: "Health camp", date: "Jul 27", spend: 15000, opAttributed: [], status: "planned" },
];

const referrals = [
  { name: "Rampur ASHA worker — Sunita", kind: "Referral partner", discount: "10% OP consult", used: 34 },
  { name: "Loyalty — 5+ visits this year", kind: "Patient loyalty", discount: "15% pharmacy", used: 61 },
  { name: "Senior citizen (60+)", kind: "Standing policy", discount: "20% diagnostics", used: 88 },
  { name: "Staff family", kind: "Internal", discount: "25% all services", used: 12 },
];

const followUps = [
  { patient: "PT-1087 · R. Devi", reason: "Post-op day-7 wound check (lap chole)", due: "Today", sent: false },
  { patient: "PT-1076 · M. Singh", reason: "Hernia repair — day-10 review", due: "Tomorrow", sent: false },
  { patient: "PT-1054 · A. Bibi", reason: "HbA1c recheck — 90 days since last", due: "In 3 days", sent: true },
];

export function Marketing() {
  const { addSendLog } = useStore();
  const [campaigns] = useState(seedCampaigns);
  const [reminders, setReminders] = useState(followUps);
  const [modal, setModal] = useState(false);
  const [list, setList] = useState(campaigns);

  const addCampaign = (name: string, kind: Campaign["kind"], spend: number) => {
    setList([...list, { id: uid("cp"), name, kind, date: "Today", spend, opAttributed: [0], status: "active" }]);
    setModal(false);
    toast.success("Campaign created", { description: "OP-attribution tracking starts today." });
  };

  const sendReminder = (idx: number) => {
    const r = reminders[idx];
    setReminders(reminders.map((x, i) => (i === idx ? { ...x, sent: true } : x)));
    addSendLog({ provider: "WhatsApp", template: "appointment_reminder", recipient: r.patient, status: "sent" });
    toast.success("Follow-up reminder sent", { description: `${r.patient} · WhatsApp appointment_reminder · logged.` });
  };

  const chartData = ["W1", "W2", "W3", "W4"].map((wk, i) => {
    const row: Record<string, string | number> = { week: wk };
    list.forEach((c) => {
      row[c.name.slice(0, 14)] = c.opAttributed[i] ?? (c.opAttributed.length ? c.opAttributed[c.opAttributed.length - 1] : 0);
    });
    return row;
  });
  const lineColors = ["#d4af37", "#39d5ff", "#f5d97e", "#34d399"];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* campaigns */}
        <GlassCard className="xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <SectionTitle title="Campaigns" subtitle="Outreach spend vs attributed OP growth" />
            <button className="btn-neon !text-xs !py-1.5" onClick={() => setModal(true)}><Plus size={13} /> New campaign</button>
          </div>
          <div className="space-y-2.5">
            {list.map((c) => {
              const total = c.opAttributed.reduce((s, v) => s + v, 0);
              return (
                <div key={c.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3.5 flex items-center gap-4">
                  <Megaphone size={16} className="text-violet-300 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{c.name}</div>
                    <div className="text-[11px] text-slate-500">{c.kind} · {c.date} · spend {fmtINR(c.spend)}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-violet-300">{total > 0 ? `+${total} OP` : "—"}</div>
                    <div className="text-[10px] text-slate-500">{total > 0 ? `${fmtINR(Math.round(c.spend / Math.max(1, total)))}/visit` : "pending"}</div>
                  </div>
                  <Badge tone={c.status === "active" ? "green" : c.status === "planned" ? "cyan" : "neutral"} className="!text-[9px] shrink-0">{c.status}</Badge>
                </div>
              );
            })}
          </div>
          <div className="h-52 mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="week" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#0b1d20", border: "1px solid rgba(212,175,55,0.4)", borderRadius: 8, fontSize: 11 }} />
                {list.map((c, i) => (
                  <Line key={c.id} type="monotone" dataKey={c.name.slice(0, 14)} stroke={lineColors[i % lineColors.length]} strokeWidth={2} dot={{ r: 2.5 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        {/* referrals + reminders */}
        <div className="space-y-4">
          <GlassCard>
            <SectionTitle title="Referral & Loyalty Discounts" />
            <div className="space-y-2">
              {referrals.map((r) => (
                <div key={r.name} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-xs font-semibold text-white">{r.name}</div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-slate-500">{r.kind}</span>
                    <Badge tone="violet" className="!text-[9px]">{r.discount}</Badge>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">used {r.used}× this quarter</div>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard>
            <SectionTitle title="Discharged-patient Follow-ups" />
            <div className="space-y-2">
              {reminders.map((r, i) => (
                <div key={r.patient} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">{r.patient}</span>
                    <Badge tone={r.due === "Today" ? "amber" : "neutral"} className="!text-[9px]">{r.due}</Badge>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">{r.reason}</p>
                  <button
                    className="btn-ghost !text-[10px] !py-1 mt-2 w-full"
                    disabled={r.sent}
                    onClick={() => sendReminder(i)}
                  >
                    {r.sent ? "✓ Reminder sent" : <><Send size={10} /> Send WhatsApp reminder</>}
                  </button>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-600 mt-2 flex items-center gap-1"><BellRing size={10} /> Sends use the Meta-approved appointment_reminder template and appear in the send-log.</p>
          </GlassCard>
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="New campaign">
        <CampaignForm onCreate={addCampaign} />
      </Modal>
    </div>
  );
}

function CampaignForm({ onCreate }: { onCreate: (name: string, kind: Campaign["kind"], spend: number) => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Campaign["kind"]>("Village visit");
  const [spend, setSpend] = useState("10000");
  return (
    <div className="space-y-3">
      <input className="input-dark" placeholder="Campaign name" value={name} onChange={(e) => setName(e.target.value)} />
      <select className="input-dark" value={kind} onChange={(e) => setKind(e.target.value as Campaign["kind"])}>
        <option>Village visit</option>
        <option>Health camp</option>
        <option>WhatsApp campaign</option>
      </select>
      <input className="input-dark" type="number" placeholder="Budget (₹)" value={spend} onChange={(e) => setSpend(e.target.value)} />
      <button className="btn-neon w-full" disabled={!name.trim()} onClick={() => onCreate(name.trim(), kind, Number(spend) || 0)}>
        Create campaign
      </button>
    </div>
  );
}
