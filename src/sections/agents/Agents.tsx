import { useEffect, useMemo, useState } from "react";
import {
  Pause,
  Play,
  Plus,
  Radio,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { Badge, GlassCard, Modal, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { initialGoals } from "@/lib/mock";
import { cn, nowTime, randInt, sleep, uid } from "@/lib/utils";
import type { AgentNode, AgentRun, IssueStatus } from "@/lib/types";

/* ---------------- org chart node ---------------- */
function AgentCard({ agent, onClick, compact }: { agent: AgentNode; onClick: () => void; compact?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "glass glass-hover text-left w-full",
        compact ? "p-2.5 w-52" : "p-4 w-60",
        agent.status === "paused" && "opacity-60"
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("h-2 w-2 rounded-full", agent.status === "active" ? "bg-emerald-400 animate-pulse" : "bg-slate-500")} />
        <span className={cn("font-semibold text-white truncate", compact ? "text-xs" : "text-sm")}>{agent.name}</span>
      </div>
      <div className="text-[11px] text-slate-400 mt-1 truncate">{agent.role}</div>
      <div className="flex flex-wrap gap-1 mt-2">
        <Badge tone="cyan" className="!text-[9px]">{agent.runtime}</Badge>
        <Badge tone="violet" className="!text-[9px]">{agent.model}</Badge>
        {agent.heartbeatMin > 0 && <Badge className="!text-[9px]">♥ {agent.heartbeatMin}m</Badge>}
      </div>
    </button>
  );
}

/* ---------------- run stream simulation ---------------- */
const runLines = [
  "$ astra agent run --agent {name}",
  "→ loading Hermes skills… ok",
  "→ pulling context: 14 open issues, 3 goals",
  "→ scanning ledger window [last 24h]…",
  "→ 42 receipts analysed · 1 anomaly candidate",
  "→ confidence 0.87 — filing issue draft",
  "→ notifying supervisor channel",
  "✓ run complete in 6.4s · tokens: 2,184",
];

function RunsTab({ agent, runs }: { agent: AgentNode; runs: AgentRun[] }) {
  const [streamIdx, setStreamIdx] = useState(-1);
  const mine = runs.filter((r) => r.agentId === agent.id);
  const running = mine.find((r) => r.status === "running");

  useEffect(() => {
    if (!running) return;
    setStreamIdx(0);
    const t = setInterval(() => setStreamIdx((i) => (i < runLines.length - 1 ? i + 1 : i)), 450);
    return () => clearInterval(t);
  }, [running?.id]);

  return (
    <div className="space-y-3">
      {running && (
        <div className="rounded-lg bg-black/50 border border-emerald-400/20 p-3 font-mono text-[11px] text-emerald-300/90 space-y-1">
          {runLines.slice(0, streamIdx + 1).map((l, i) => (
            <div key={i}>{l.replace("{name}", agent.name)}</div>
          ))}
          <span className="inline-block w-2 h-3 bg-emerald-400 animate-pulse" />
        </div>
      )}
      {mine.length === 0 && <p className="text-xs text-slate-500">No runs yet — press “Run Heartbeat”.</p>}
      {mine.map((r) => (
        <div key={r.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
          <Badge tone={r.status === "running" ? "cyan" : r.status === "done" ? "green" : "red"}>{r.status}</Badge>
          <span className="text-xs text-slate-300 flex-1">{r.summary}</span>
          <span className="text-[10px] text-slate-500">{r.startedAt}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- detail drawer ---------------- */
function AgentDrawer({
  agent,
  onClose,
  onPause,
  onHeartbeat,
  onAssign,
  runs,
}: {
  agent: AgentNode;
  onClose: () => void;
  onPause: () => void;
  onHeartbeat: () => void;
  onAssign: () => void;
  runs: AgentRun[];
}) {
  const [tab, setTab] = useState<"dashboard" | "instructions" | "skills" | "config" | "runs" | "budget">("dashboard");
  const [hb, setHb] = useState(agent.heartbeatMin);
  const chartData = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => ({ d, runs: randInt(4, 18) }));
  const tabs = ["dashboard", "instructions", "skills", "config", "runs", "budget"] as const;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="glass !rounded-none relative z-10 w-full max-w-lg h-full overflow-y-auto p-6 border-l border-violet-400/20">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-xl font-bold text-white">{agent.name}</h3>
            <p className="text-sm text-slate-400">{agent.role}</p>
            <div className="flex gap-1.5 mt-2">
              <Badge tone="cyan">{agent.runtime}</Badge>
              <Badge tone="violet">{agent.model}</Badge>
              <Badge tone={agent.status === "active" ? "green" : "neutral"}>{agent.status}</Badge>
            </div>
          </div>
          <button className="btn-ghost !p-2" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="flex gap-2 mt-5">
          <button className="btn-neon !text-xs flex-1" onClick={onAssign}><Plus size={13} /> Assign Task</button>
          <button className="btn-ghost !text-xs flex-1" onClick={onHeartbeat}><Radio size={13} /> Run Heartbeat</button>
          <button className="btn-ghost !text-xs flex-1" onClick={onPause}>
            {agent.status === "active" ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Resume</>}
          </button>
        </div>

        <div className="flex gap-1 mt-5 border-b border-white/10 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-3 py-2 text-xs font-medium capitalize whitespace-nowrap border-b-2 -mb-px transition-colors",
                tab === t ? "border-neon-cyan text-white" : "border-transparent text-slate-500 hover:text-slate-300"
              )}
            >
              {t === "config" ? "Configuration" : t}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {tab === "dashboard" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-[10px] text-slate-500 uppercase">Success rate</div>
                  <div className="text-lg font-bold text-emerald-300">{agent.successRate}%</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
                  <div className="text-[10px] text-slate-500 uppercase">Est. cost this month</div>
                  <div className="text-lg font-bold text-white">₹{(agent.monthlyTokens * 0.0004).toFixed(0)}</div>
                </div>
              </div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <XAxis dataKey="d" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: "#10142b", border: "1px solid rgba(212,175,55,0.4)", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="runs" fill="#d4af37" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          {tab === "instructions" && (
            <p className="text-sm text-slate-300 leading-relaxed rounded-lg border border-white/10 bg-white/[0.03] p-4">{agent.instructions}</p>
          )}
          {tab === "skills" && (
            <div className="flex flex-wrap gap-2">
              {agent.skills.length === 0 && <p className="text-xs text-slate-500">Human node — no Hermes skills attached.</p>}
              {agent.skills.map((s) => (
                <Badge key={s} tone="violet" className="!px-3 !py-1 !text-xs">{s}</Badge>
              ))}
            </div>
          )}
          {tab === "config" && (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-2">
                  <span>Heartbeat interval</span>
                  <span className="text-white font-semibold">{hb === 0 ? "On-demand only" : `${hb} min`}</span>
                </div>
                <input
                  type="range" min={0} max={120} step={5} value={hb}
                  onChange={(e) => setHb(Number(e.target.value))}
                  className="w-full accent-violet-500"
                />
              </div>
              <button className="btn-neon !text-xs" onClick={() => toast.success("Configuration saved", { description: `Heartbeat set to ${hb} min for ${agent.name}.` })}>
                Save configuration
              </button>
            </div>
          )}
          {tab === "runs" && <RunsTab agent={agent} runs={runs} />}
          {tab === "budget" && (
            <div>
              {agent.tokenBudget === 0 ? (
                <p className="text-xs text-slate-500">Human node — no token budget.</p>
              ) : (
                <>
                  <div className="flex justify-between text-xs text-slate-400 mb-2">
                    <span>Monthly token budget (FreeLLMAPI)</span>
                    <span className="text-white font-semibold">
                      {(agent.monthlyTokens / 1000).toFixed(0)}k / {(agent.tokenBudget / 1000).toFixed(0)}k
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-violet-500 to-fuchsia-500"
                      style={{ width: `${Math.min(100, (agent.monthlyTokens / agent.tokenBudget) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">
                    Hard stop at 100% — requests then route to fallback chain per routing strategy.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- main section ---------------- */
const statusCols: { key: IssueStatus; label: string }[] = [
  { key: "todo", label: "Todo" },
  { key: "in-progress", label: "In Progress" },
  { key: "in-review", label: "In Review" },
  { key: "done", label: "Done" },
];

export function Agents() {
  const { agents, setAgents, issues, setIssues } = useStore();
  const [selected, setSelected] = useState<AgentNode | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([
    { id: "r-1", agentId: "ag-billing", startedAt: "Today 09:12", status: "done", summary: "Ledger scan — 1 flag filed (RCPT-1044)" },
    { id: "r-2", agentId: "ag-attend", startedAt: "Today 08:05", status: "done", summary: "Roster diff — 1 coverage gap found" },
  ]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");

  const tiers = useMemo(() => {
    const t1 = agents.filter((a) => a.tier === 1);
    const t2 = agents.filter((a) => a.tier === 2);
    const t3 = agents.filter((a) => a.tier === 3);
    return [t1, t2, t3];
  }, [agents]);

  const heartbeat = async (a: AgentNode) => {
    const id = uid("run");
    setRuns((p) => [{ id, agentId: a.id, startedAt: `Today ${nowTime()}`, status: "running", summary: "Heartbeat in progress…" }, ...p]);
    toast.info(`Heartbeat started — ${a.name}`);
    await sleep(4000);
    setRuns((p) => p.map((r) => (r.id === id ? { ...r, status: "done", summary: `Heartbeat ok — ${randInt(2, 9)} checks passed` } : r)));
    toast.success(`Heartbeat complete — ${a.name}`);
  };

  const togglePause = (a: AgentNode) => {
    setAgents(agents.map((x) => (x.id === a.id ? { ...x, status: x.status === "active" ? "paused" : "active" } : x)));
    setSelected((s) => (s && s.id === a.id ? { ...s, status: s.status === "active" ? "paused" : "active" } : s));
    toast(a.status === "active" ? `⏸ ${a.name} paused` : `▶ ${a.name} resumed`);
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-gradient">Agent Org</h1>
          <p className="text-sm text-slate-400 mt-1">Astra agent organization · heartbeats & budgets</p>
        </div>
      </div>

      {/* org chart */}
      <GlassCard className="overflow-x-auto">
        <div className="min-w-[900px] py-4">
          {/* connectors svg */}
          {tiers.map((tier, ti) => (
            <div key={ti} className={cn("flex justify-center gap-5", ti > 0 && "mt-10 relative")}>
              {ti > 0 && (
                <div className="absolute -top-10 left-0 right-0 h-10 pointer-events-none flex justify-center">
                  <svg width="60%" height="40" className="opacity-40">
                    <line x1="50%" y1="0" x2="50%" y2="14" stroke="#d4af37" strokeWidth="1.5" />
                    <line x1="8%" y1="40" x2="92%" y2="40" stroke="transparent" />
                    <line x1="12%" y1="14" x2="12%" y2="40" stroke="#d4af37" strokeWidth="1" />
                    <line x1="50%" y1="14" x2="50%" y2="40" stroke="#d4af37" strokeWidth="1" />
                    <line x1="88%" y1="14" x2="88%" y2="40" stroke="#d4af37" strokeWidth="1" />
                    <line x1="12%" y1="14" x2="88%" y2="14" stroke="#d4af37" strokeWidth="1" />
                  </svg>
                </div>
              )}
              {tier.map((a) => (
                <AgentCard key={a.id} agent={a} compact={ti === 2} onClick={() => setSelected(a)} />
              ))}
            </div>
          ))}
        </div>
      </GlassCard>

      {/* issues kanban */}
      <div>
        <SectionTitle title="Issues" subtitle="Agent & human work queue" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {statusCols.map((col) => (
            <div key={col.key} className="glass p-3">
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">{col.label}</span>
                <Badge>{issues.filter((i) => i.status === col.key).length}</Badge>
              </div>
              <div className="space-y-2">
                {issues.filter((i) => i.status === col.key).map((i) => (
                  <div key={i.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3 hover:border-violet-400/40 transition-colors">
                    <p className="text-xs text-slate-200 leading-snug">{i.title}</p>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <Badge tone={i.priority === "critical" ? "red" : i.priority === "high" ? "amber" : "neutral"} className="!text-[9px]">{i.priority}</Badge>
                      <Badge tone="cyan" className="!text-[9px]">{i.assignee}</Badge>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-[9px] text-slate-500">{i.createdAt}</span>
                      {col.key !== "done" && (
                        <button
                          className="text-[9px] text-neon-cyan hover:underline"
                          onClick={() => {
                            const next: IssueStatus = col.key === "todo" ? "in-progress" : col.key === "in-progress" ? "in-review" : "done";
                            setIssues(issues.map((x) => (x.id === i.id ? { ...x, status: next } : x)));
                            toast.success(`Moved to ${next.replace("-", " ")}`);
                          }}
                        >
                          Advance →
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {issues.filter((i) => i.status === col.key).length === 0 && (
                  <p className="text-[10px] text-slate-600 text-center py-4">empty</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* goals */}
      <div className="grid grid-cols-1 gap-4">
        <GlassCard>
          <SectionTitle title="Goals" subtitle="Company → team sub-goals" />
          <div className="space-y-4">
            {initialGoals.map((g) => (
              <div key={g.id}>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-200 font-medium">{g.title}</span>
                  <span className="text-neon-cyan font-semibold">{g.progress}%</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 transition-all duration-700" style={{ width: `${g.progress}%` }} />
                </div>
                {g.children?.map((c) => (
                  <div key={c.id} className="ml-4 mt-2">
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-slate-400">↳ {c.title}</span>
                      <span className="text-slate-400">{c.progress}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full rounded-full bg-violet-500/70" style={{ width: `${c.progress}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </GlassCard>

      </div>

      {/* drawer */}
      {selected && (
        <AgentDrawer
          agent={agents.find((a) => a.id === selected.id) ?? selected}
          onClose={() => setSelected(null)}
          onPause={() => togglePause(agents.find((a) => a.id === selected.id) ?? selected)}
          onHeartbeat={() => void heartbeat(agents.find((a) => a.id === selected.id) ?? selected)}
          onAssign={() => setAssignOpen(true)}
          runs={runs}
        />
      )}

      {/* assign task modal */}
      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title={`Assign task → ${selected?.name ?? ""}`}>
        <div className="space-y-4">
          <input
            className="input-dark"
            placeholder="Task title, e.g. Audit weekend cash collections"
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
          />
          <button
            className="btn-neon w-full"
            disabled={!taskTitle.trim()}
            onClick={() => {
              // Dispatch through Astra command bus so issue creation enters the unified pipeline
              if (typeof window !== "undefined") {
                const event = new CustomEvent("Astra:command", {
                  detail: { text: `create issue ${taskTitle.trim()}`, source: "agent" }
                });
                window.dispatchEvent(event);
              }
              toast.success("Task assigned", { description: "Added to Issues as Todo." });
              setTaskTitle("");
              setAssignOpen(false);
            }}
          >
            Create Issue
          </button>
        </div>
      </Modal>
    </div>
  );
}
