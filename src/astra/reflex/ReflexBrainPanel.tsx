import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Brain, Check, ChevronDown, ChevronRight, CircleHelp, GitBranch, MessageCircle, Pencil, ShieldAlert, X } from "lucide-react";
import { apiFetch } from "@/services/apiFetch";
import { postReflexOutcome, submitReflexApproval } from "./approvalClient";
import { ACCOUNTS } from "@/lib/auth";
import { CockpitHypercube } from "./CockpitHypercube";
import { CockpitSuggestionsView } from "./CockpitSuggestions";
import { approvedBookSkills, readCockpitAudience, validatedVaultItems, type CauseFinderPayload, type SkillListItem, type VaultListItem } from "./suggestionModel";

export const REFLEX_COCKPIT_TITLE = "SanmukhaGanapathi Doctor Cockpit";

export interface ReflexItem {
  kind: "missing_info" | "consider" | "contradiction" | "escalate" | "red_flag" | "blind_spot";
  text: string;
  source: "level0" | "laya" | "rules";
  band: "high" | "mid" | "low";
  schemaId?: string;
  decisionId?: string;
}

export interface DdxNode {
  id: string;
  diagnosis: string;
  supporting: string[];
  against: string[];
  unexplainedFindings: string[];
  expectedButMissing: string[];
  dangerIfMissed: string;
  nextDiscriminatingStep: string;
}

export interface ReflexMeshResponse {
  ok?: boolean;
  hidden?: boolean;
  redFlags?: ReflexItem[];
  board?: { items?: ReflexItem[]; ddxGraph?: DdxNode[] };
  completeness?: { score: number; family: string; missing: string[] };
  contradictions?: Array<{ text: string; source: "rules" | "laya"; band: "high" | "mid" | "low"; decisionId?: string }>;
  causeFinder?: CauseFinderPayload | null;
}

function badge(source: ReflexItem["source"]) {
  if (source === "level0") return "Level 0";
  if (source === "laya") return "Laya-assist";
  return "Rules";
}

function icon(kind: ReflexItem["kind"]) {
  if (kind === "red_flag") return <ShieldAlert size={14} aria-hidden />;
  if (kind === "escalate") return <AlertTriangle size={14} aria-hidden />;
  if (kind === "blind_spot") return <CircleHelp size={14} aria-hidden />;
  return <Brain size={14} aria-hidden />;
}

export function groupReflexItems(data?: ReflexMeshResponse | null) {
  const items = [...(data?.redFlags ?? []), ...(data?.board?.items ?? [])];
  const by = (kind: ReflexItem["kind"]) => items.filter((item) => item.kind === kind);
  return {
    red_flag: by("red_flag"),
    missing_info: by("missing_info"),
    consider: by("consider"),
    blind_spot: by("blind_spot"),
    contradiction: by("contradiction"),
    escalate: by("escalate"),
  };
}

export function ReflexBrainPanel({ patientId, role }: { patientId?: string; role?: "doctor" | "ward" }) {
  const audience = role ?? readCockpitAudience(typeof localStorage === "undefined" ? null : localStorage, ACCOUNTS);
  const [open, setOpen] = useState(true);
  const [data, setData] = useState<ReflexMeshResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [knowledge, setKnowledge] = useState<VaultListItem[] | "not_loaded">("not_loaded");
  const [skills, setSkills] = useState<SkillListItem[] | "not_loaded">("not_loaded");
  const grouped = useMemo(() => groupReflexItems(data), [data]);

  useEffect(() => {
    let alive = true;
    if (!patientId) {
      setData(null);
      return;
    }
    setLoading(true);
    apiFetch("/api/reflex/clinical/mesh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientId }),
    }).then((r) => r.json()).then((body) => {
      if (alive) setData(body);
    }).catch(() => alive && setData(null)).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [patientId]);

  useEffect(() => {
    if (audience === "ward") return;
    let alive = true;
    Promise.all([
      apiFetch("/api/knowledge/vault").then((response) => response.ok ? response.json() : null).catch(() => null),
      apiFetch("/api/knowledge/skills").then((response) => response.ok ? response.json() : null).catch(() => null),
    ]).then(([vaultBody, skillBody]) => {
      if (!alive) return;
      setKnowledge(vaultBody?.items ? validatedVaultItems(vaultBody.items) : "not_loaded");
      setSkills(skillBody?.skills ? approvedBookSkills(skillBody.skills) : "not_loaded");
    });
    return () => { alive = false; };
  }, [audience]);

  const act = async (item: ReflexItem, action: "approve" | "modify" | "reject" | "discuss") => {
    try {
      if (action === "reject") {
        await submitReflexApproval({ patientId: patientId ?? "unknown", text: item.text, decision: "REJECT_IGNORE", reason: "Rejected from reflex cockpit" });
        await postReflexOutcome(item.decisionId, "rejected");
      } else if (action === "discuss") {
        await submitReflexApproval({ patientId: patientId ?? "unknown", text: item.text, decision: "DISCUSS_ONLY", reason: "Discuss from reflex cockpit" });
      } else {
        await submitReflexApproval({ patientId: patientId ?? "unknown", text: item.text, decision: "APPROVE_CASE_ONLY", reason: action === "modify" ? "Modify requested from reflex cockpit" : "Approved from reflex cockpit" });
        if (action === "modify") await postReflexOutcome(item.decisionId, "modified");
      }
      setMessage(`${action} recorded`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    }
  };

  const empty = !loading && (!data || data.hidden || (!data.redFlags?.length && !data.board?.items?.length && !data.board?.ddxGraph?.length));

  return (
    <aside className="w-[380px] max-w-[45vw] border-l border-slate-800 bg-slate-950/95 text-slate-100 flex flex-col" aria-label={REFLEX_COCKPIT_TITLE}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center justify-between border-b border-slate-800 px-3 py-2 text-left focus:outline-none focus:ring-2 focus:ring-cyan-400">
        <span className="flex items-center gap-2 text-xs font-bold"><GitBranch size={15} className="text-cyan-300" /> {REFLEX_COCKPIT_TITLE}</span>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
      </button>
      {open && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
          {loading && <div className="rounded border border-slate-800 p-3 text-slate-400">Loading reflex mesh...</div>}
          {empty && <div className="rounded border border-slate-800 p-3 text-slate-400">No reflex data yet</div>}
          {message && <div className="rounded border border-cyan-700 bg-cyan-950/40 p-2 text-cyan-200">{message}</div>}
          <Section title="Red flags" items={grouped.red_flag} locked onAction={act} />
          {audience !== "ward" && <Section title="Missing info" items={grouped.missing_info} onAction={act} />}
          {audience !== "ward" && <Section title="Consider" items={grouped.consider} onAction={act} />}
          {audience !== "ward" && <Section title="Blind spots" items={grouped.blind_spot} onAction={act} />}
          {audience !== "ward" && <Section title="Contradictions" items={grouped.contradiction} onAction={act} />}
          {audience !== "ward" && <Section title="Escalate" items={grouped.escalate} onAction={act} />}
          {audience !== "ward" && (data?.board?.ddxGraph ?? []).length > 0 && (
            <div className="space-y-2">
              <h3 className="font-bold text-slate-200">DDx graph</h3>
              {data!.board!.ddxGraph!.map((node) => <DdxCard key={node.id} node={node} />)}
            </div>
          )}
          {audience !== "ward" && (
            <CockpitSuggestionsView
              role="doctor"
              knowledge={knowledge}
              skills={skills}
              causeFinder={data?.causeFinder ?? null}
              onApprove={(text) => { void submitReflexApproval({ patientId: patientId ?? "unknown", text, decision: "APPROVE_CASE_ONLY", reason: "Doctor approved a cockpit suggestion. Not an order." }); }}
            />
          )}
          {audience === "ward" ? <p>Red flags only</p> : <CockpitHypercube patientId={patientId} role={audience} />}
        </div>
      )}
    </aside>
  );
}

function Section({ title, items, locked, onAction }: { title: string; items: ReflexItem[]; locked?: boolean; onAction: (item: ReflexItem, action: "approve" | "modify" | "reject" | "discuss") => void }) {
  if (!items.length) return null;
  return (
    <section className="space-y-2">
      <h3 className="font-bold text-slate-200">{title}</h3>
      {items.map((item, index) => (
        <div key={`${item.kind}-${item.text}-${index}`} className="rounded border border-slate-800 bg-slate-900 p-2">
          <div className="flex gap-2">
            <span className={item.band === "high" ? "text-rose-300" : item.band === "mid" ? "text-amber-300" : "text-slate-400"}>{icon(item.kind)}</span>
            <div className="min-w-0 flex-1">
              <p className="text-slate-100">{item.text}</p>
              <p className="mt-1 text-[10px] text-slate-400">{badge(item.source)} · {item.band} · routing confidence, not probability of disease</p>
            </div>
          </div>
          {!locked && (
            <div className="mt-2 flex flex-wrap gap-1">
              <Action icon={<Check size={12} />} label="Approve" onClick={() => onAction(item, "approve")} />
              <Action icon={<Pencil size={12} />} label="Modify" onClick={() => onAction(item, "modify")} />
              <Action icon={<X size={12} />} label="Reject" onClick={() => onAction(item, "reject")} />
              <Action icon={<MessageCircle size={12} />} label="Discuss" onClick={() => onAction(item, "discuss")} />
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

function Action({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  const sensitive = label === "Approve" || label === "Modify" || label === "Reject";
  return <button type="button" data-astra-control={`reflex-${label.toLowerCase()}`} data-astra-name={label} data-astra-kind="button" data-astra-sensitive={sensitive ? "approval" : undefined} onClick={onClick} className="flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[10px] text-slate-200 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400">{icon}{label}</button>;
}

function DdxCard({ node }: { node: DdxNode }) {
  const row = (label: string, values: string[]) => values.length ? <p><span className="font-semibold text-slate-300">{label}: </span>{values.join("; ")}</p> : null;
  return (
    <article className="rounded border border-slate-800 bg-slate-900 p-2 space-y-1">
      <h4 className="font-bold text-cyan-200">{node.diagnosis}</h4>
      {row("Supporting", node.supporting)}
      {row("Against", node.against)}
      {row("Unexplained", node.unexplainedFindings)}
      {row("Expected but missing", node.expectedButMissing)}
      <p><span className="font-semibold text-slate-300">Danger if missed: </span>{node.dangerIfMissed}</p>
      <p><span className="font-semibold text-slate-300">Next step: </span>{node.nextDiscriminatingStep}</p>
    </article>
  );
}
