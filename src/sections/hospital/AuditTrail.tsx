// Astra AI — Audit Trail.
// Every AI command that changes hospital data is recorded here:
// user · role · command · time · module · action · result.
// Accessible to authorized administrators (CEO / Admin).

import { useMemo, useState } from "react";
import { Filter, Search, ShieldCheck } from "lucide-react";
import { Badge, GlassCard, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function AuditTrail() {
  const { audit } = useStore();
  const { account } = useAuth();
  const [search, setSearch] = useState("");
  const [actorFilter, setActorFilter] = useState("all");

  const actors = useMemo(() => Array.from(new Set(audit.map((a) => a.actor))), [audit]);

  const filtered = audit.filter((a) => {
    if (actorFilter !== "all" && a.actor !== actorFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!a.action.toLowerCase().includes(q) && !a.detail.toLowerCase().includes(q) && !a.actor.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const aiCommands = audit.filter((a) => a.action.toLowerCase().includes("ai command") || a.action.toLowerCase().startsWith("ai")).length;

  return (
    <div className="max-w-[1200px] mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl font-bold text-gradient">Audit Trail</h1>
            <Badge tone="amber"><ShieldCheck size={11} /> {aiCommands} AI commands</Badge>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Full command and authorization history · user → command → authorization → action → audit
          </p>
        </div>
      </div>

      {/* filters */}
      <div className="glass p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input-dark !pl-9"
            placeholder="Search actions, details, actors…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-slate-400" />
          <span className="text-xs text-slate-400">Actor:</span>
          <select className="input-dark !py-1.5 text-xs" value={actorFilter} onChange={(e) => setActorFilter(e.target.value)}>
            <option value="all">All actors</option>
            {actors.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>

      {/* entries */}
      <GlassCard>
        <SectionTitle title="Audit Entries" subtitle={`${filtered.length} of ${audit.length} recorded events`} />
        {filtered.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">No audit entries match. Commands issued here appear immediately.</p>
        ) : (
          <div className="space-y-1.5 max-h-[65vh] overflow-y-auto">
            {filtered.map((a) => {
              const isAI = a.action.toLowerCase().includes("ai command") || a.action.toLowerCase().startsWith("ai");
              const isDenied = a.detail.toLowerCase().includes("denied") || a.action.toLowerCase().includes("denied");
              const isVoid = a.action.toLowerCase().includes("void");
              return (
                <div
                  key={a.id}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-xs",
                    isVoid
                      ? "border-red-400/40 bg-red-400/[0.06]"
                      : isDenied
                        ? "border-red-400/30 bg-red-400/[0.04]"
                        : isAI
                          ? "border-amber-400/25 bg-amber-400/[0.04]"
                          : "border-white/5 bg-white/[0.02]"
                  )}
                >
                  <span className="font-mono text-[10px] text-slate-500 shrink-0 w-36">{a.timestamp}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[10px] text-cyan-300 font-semibold">{a.actor}</span>
                      <span className="text-slate-200 font-semibold">{a.action}</span>
                      {isAI && <Badge tone="amber" className="!text-[8px]">AI COMMAND</Badge>}
                      {isDenied && <Badge tone="red" className="!text-[8px]">DENIED</Badge>}
                      {isVoid && <Badge tone="red" className="!text-[8px]">VOID</Badge>}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{a.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>

      <p className="text-[10px] text-slate-500">
        Session: {account?.name} ({account?.role.toUpperCase()}) · Audit is append-only and persisted locally. Authorized administrators can export from the Admin workspace.
      </p>
    </div>
  );
}
