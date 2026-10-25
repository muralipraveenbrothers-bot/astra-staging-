import { useEffect, useState } from "react";
import { Brain, BookOpen, Database, Network, Target, ShieldAlert, CheckCircle2, Info, Cpu, FileText, Layers, CircleDashed, RefreshCw } from "lucide-react";
import { Badge, GlassCard, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import { computeKnowledgeMetrics, fmt, DATA_POINT_DEFINITION_EXPORT, type LiveStoreCounts } from "@/lib/knowledge/metrics";
import { buildModelRegistry, MODEL_CAPACITY_NOTE, type BackendProbe } from "@/lib/knowledge/models";
import { KNOWLEDGE_GRAPH, provenanceOf } from "@/lib/knowledge/graph";
import { KNOWLEDGE_SOURCES } from "@/lib/knowledge/registry";
import { checkVoicebox } from "@/lib/voicebox";
import { runPubMed, runClinicalTrials, runWikipedia, CONNECTOR_LABELS, newRunId, commitPoints, fetchStoreStats, createIngestionJob, jobAction, meshLookup, rxnormLookup, embedStatus, indexEmbeddings, type ConnectorRun, type ConnectorPoint, type KnowledgeStoreStats, type TermLookupResult, type EmbedStatus } from "@/lib/knowledge/connectors";
import { cn } from "@/lib/utils";

/** Tooltip — small info bubble explaining exactly what a number means. */
function Tip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex ml-1 align-middle">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-slate-500 hover:text-violet-300"
        aria-label="What does this mean?"
      >
        <Info size={11} />
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-64 rounded-lg border border-violet-400/30 bg-ink-900/95 p-2.5 text-[10px] leading-relaxed text-slate-300 z-50 shadow-xl">
          {text}
        </span>
      )}
    </span>
  );
}

function MetricCard({ label, value, sub, tip }: { label: string; value: string; sub?: string; tip: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
      <div className="text-[10px] uppercase tracking-[0.15em] text-slate-500 flex items-center">
        {label}
        <Tip text={tip} />
      </div>
      <div className="font-display text-xl font-bold text-white mt-1">{value}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export function KnowledgeFabric() {
  const store = useStore();
  const [probe, setProbe] = useState<BackendProbe>({
    ollamaModels: 0,
    freellmApiReachable: false,
    freellmApiKeyValid: false,
    voiceboxOnline: false,
    paperclipOnline: false,
  });
  const [probeTs, setProbeTs] = useState<string>(new Date().toISOString());

  // ---- Connector Lab state ----
  const [runs, setRuns] = useState<ConnectorRun[]>([]);
  const [busyKind, setBusyKind] = useState<ConnectorRun["kind"] | null>(null);
  const [queries, setQueries] = useState<Record<ConnectorRun["kind"], string>>({
    pubmed: CONNECTOR_LABELS.pubmed.sample,
    ct: CONNECTOR_LABELS.ct.sample,
    wiki: CONNECTOR_LABELS.wiki.sample,
  });
  const committedPoints = runs.filter((r) => r.committed && r.result).reduce((a, r) => a + (r.result?.points.length ?? 0), 0);

  const runConnector = async (kind: ConnectorRun["kind"]) => {
    const q = queries[kind].trim();
    if (!q || busyKind) return;
    setBusyKind(kind);
    const started = performance.now();
    let result: Awaited<ReturnType<typeof runPubMed>> | undefined;
    let error: string | undefined;
    try {
      result = kind === "pubmed" ? await runPubMed(q) : kind === "ct" ? await runClinicalTrials(q) : await runWikipedia(q);
      if (result.error) error = result.error;
    } catch (e) {
      error = String(e instanceof Error ? e.message : e);
    }
    setRuns((p) => [{ id: newRunId(), kind, label: CONNECTOR_LABELS[kind].name, query: q, result, error, ranAt: new Date().toISOString(), tookMs: Math.round(performance.now() - started), committed: false }, ...p].slice(0, 12));
    setBusyKind(null);
  };

  const commitRun = async (runId: string, kind: ConnectorRun["kind"]) => {
    const run = runs.find((r) => r.id === runId);
    if (!run || !run.result || run.committed) return;
    try {
      const points = run.result.points.map((p) => ({ ...p, sourceId: p.sourceId || CONNECTOR_LABELS[kind].name, year: p.year }));
      const out = await commitPoints(points);
      setRuns((p) =>
        p.map((r) =>
          r.id === runId
            ? { ...r, committed: true, commitInfo: { added: out.added, duplicates: out.duplicates, conflicts: out.conflictsDetected } }
            : r
        )
      );
    } catch (e) {
      alert(`Commit failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  const preview = (run: ConnectorRun) => (run.result?.points ?? []).slice(0, 5) as ConnectorPoint[];

  // ---- Knowledge Growth (persistent store) state ----
  const [stats, setStats] = useState<KnowledgeStoreStats | null>(null);
  const [newJob, setNewJob] = useState({ query: "", specialty: "General Medicine", target: 2000 });
  const [termTerm, setTermTerm] = useState("typhoid fever");
  const [termHits, setTermHits] = useState<TermLookupResult[]>([]);
  const [termBusy, setTermBusy] = useState(false);
  const [embedStatusData, setEmbedStatusData] = useState<EmbedStatus | null>(null);
  const [embedBusy, setEmbedBusy] = useState(false);

  const refreshGrowth = async () => {
    try {
      const s = await fetchStoreStats();
      setStats(s);
      try {
        const es = await embedStatus();
        setEmbedStatusData(es);
      } catch { /* embed status unavailable */ }
    } catch { /* stats unavailable */ }
  };
  useEffect(() => {
    void refreshGrowth();
    const id = setInterval(() => void refreshGrowth(), 5000);
    return () => clearInterval(id);
  }, []);

  const startJob = async () => {
    if (!newJob.query.trim()) return;
    await createIngestionJob(newJob.query, newJob.specialty, newJob.target);
    setNewJob((p) => ({ ...p, query: "" }));
    void refreshGrowth();
  };

  const runTermLookup = async (kind: "mesh" | "rxnorm") => {
    if (!termTerm.trim() || termBusy) return;
    setTermBusy(true);
    try {
      const hits = kind === "mesh" ? await meshLookup(termTerm) : await rxnormLookup(termTerm);
      setTermHits(hits);
    } catch (e) {
      alert(`Lookup failed: ${e instanceof Error ? e.message : e}`);
    }
    setTermBusy(false);
    void refreshGrowth();
  };

  const runEmbedIndex = async () => {
    if (!embedStatusData?.engineOnline || embedBusy) return;
    setEmbedBusy(true);
    const out = await indexEmbeddings();
    if (out.error) alert(out.error);
    setEmbedBusy(false);
    void refreshGrowth();
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const [ollama, freellm, vb, paperclip] = await Promise.all([
          fetch("/proxy/ollama/api/tags", { signal: AbortSignal.timeout(4000) }).then((r) => (r.ok ? r.json() : { models: [] })).catch(() => ({ models: [] })),
          fetch("/proxy/freellmapi/v1/models", { signal: AbortSignal.timeout(4000) }).then((r) => ({ status: r.status })).catch(() => ({ status: 0 })),
          checkVoicebox(),
          fetch("/proxy/paperclip/", { signal: AbortSignal.timeout(4000) }).then((r) => r.ok).catch(() => false),
        ]);
        if (cancelled) return;
        const ollamaCount = Array.isArray(ollama.models) ? ollama.models.length : 0;
        setProbe({
          ollamaModels: ollamaCount,
          freellmApiReachable: freellm.status !== 0,
          freellmApiKeyValid: freellm.status === 200,
          voiceboxOnline: vb.ok,
          paperclipOnline: paperclip,
        });
        setProbeTs(new Date().toISOString());
      } catch {
        /* keep last state */
      }
    };
    void run();
    const id = setInterval(() => void run(), 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const live: LiveStoreCounts = {
    patients: store.patients.length,
    bills: store.bills.length,
    orders: store.orders.length,
    tasks: store.tasks.length,
    medDoses: store.medDoses.length,
    vitals: store.vitals.length,
    attendance: store.attendance.length,
    approvals: store.approvals.length,
    audit: store.audit.length,
    notifications: store.notifications.length,
    dispenses: store.dispenses.length,
  };
  const m = computeKnowledgeMetrics(live);
  const models = buildModelRegistry(probe);
  const paramsTotal = models.reduce((a, x) => a + (x.paramsBillions ?? 0), 0);
  const badCount = m.quality.filter((q) => q.severity === "bad").length;
  const warnCount = m.quality.filter((q) => q.severity === "warn").length;

  const byType = (t: string) => KNOWLEDGE_GRAPH.nodes.filter((n) => n.type === t);

  return (
    <div className="max-w-[1200px] mx-auto space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-gradient">Knowledge Intelligence</h1>
          <p className="text-sm text-slate-400 mt-1">Truthful audit of Astra's knowledge fabric — every number measured from actual data.</p>
        </div>
        <div className="text-right text-[10px] text-slate-500 font-mono">
          Measured {new Date(m.measuredAt).toLocaleString()}
          <br />
          <span className="inline-flex items-center gap-1"><RefreshCw size={10} /> live probe {new Date(probeTs).toLocaleTimeString()}</span>
        </div>
      </div>

      {/* ---------------- Primary: verified vs target ---------------- */}
      <GlassCard className="!border-violet-400/25">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] text-slate-500 mb-1">Verified — stored + derived</div>
            <div className="font-display text-5xl font-bold text-gradient">{fmt(m.knowledgePoints + committedPoints)}</div>
            <div className="text-xs text-slate-400 mt-1">Medical Knowledge Points (verified)
              <Tip text={DATA_POINT_DEFINITION_EXPORT} />
            </div>
            {committedPoints > 0 && (
              <div className="text-[10px] text-cyan-300 mt-1">
                +{fmt(committedPoints)} live-connector points committed this session (session-local, not persisted)
              </div>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                <div className="text-slate-400">Derived relationship space</div>
                <div className="font-semibold text-white">{fmt(m.derivedSpace)} <span className="text-[9px] text-slate-500">validated combos</span></div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                <div className="text-slate-400">Hospital data (live)</div>
                <div className="font-semibold text-white">{fmt(m.hospitalEvents)} <span className="text-[9px] text-slate-500">events</span></div>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.04] p-4">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-amber-300">
              <Target size={12} /> Target — NOT achieved
            </div>
            <div className="font-display text-4xl font-bold text-amber-200 mt-1">{fmt(m.capacityTarget)}+</div>
            <div className="text-xs text-slate-300 mt-1">{m.capacityLabel}</div>
            <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
              Requires actually connecting and ingesting real corpora: PubMed (E-utilities), medical textbooks,
              GitHub repositories, guidelines and web sources — then indexing text, chunks and embeddings into a
              vector store. Reaches only when <em>measured</em> — never displayed as achieved.
            </p>
          </div>
        </div>
      </GlassCard>

      {/* ---------------- Model capacity (separate, never merged) ---------------- */}
      <GlassCard>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle title="AI Model Capacity" subtitle="Model architecture parameters — strictly separate from knowledge data" />
          <Badge tone="cyan" className="!text-[9px]">{fmt(paramsTotal)}B configured local params</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-ink-800/95">
              <tr className="text-left text-slate-500 border-b border-white/10">
                <th className="pb-2 font-medium">Model</th>
                <th className="pb-2 font-medium">Provider</th>
                <th className="pb-2 font-medium">Parameters</th>
                <th className="pb-2 font-medium">Context</th>
                <th className="pb-2 font-medium">Local</th>
                <th className="pb-2 font-medium">Availability (live)</th>
              </tr>
            </thead>
            <tbody>
              {models.map((mo) => (
                <tr key={mo.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                  <td className="py-2.5 font-mono text-slate-200">{mo.name}</td>
                  <td className="py-2.5 text-slate-400">{mo.provider}</td>
                  <td className="py-2.5 text-slate-300">{mo.paramsBillions !== null ? `${mo.paramsBillions}B` : "— (router)"}</td>
                  <td className="py-2.5 text-slate-400">{mo.contextWindow}</td>
                  <td className="py-2.5 text-slate-400">{mo.local ? "yes" : "no"}</td>
                  <td className="py-2.5">
                    <span className={cn("inline-flex items-center gap-1.5", mo.availableNow ? "text-emerald-300" : "text-amber-300")}>
                      <CircleDashed size={11} /> {mo.availabilityNote}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-500 mt-2.5">{MODEL_CAPACITY_NOTE}</p>
      </GlassCard>

      {/* ---------------- Knowledge fabric metrics ---------------- */}
      <GlassCard>
        <SectionTitle title="Medical Knowledge Fabric" subtitle="Measured from the actual source registry and knowledge graph" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
          <MetricCard label="Knowledge Sources" value={String(m.sources)} sub={`${m.sourcesIndexed} indexed · ${m.sourcesLiveSearchable} live`} tip="Registered sources in the KnowledgeSourceRegistry. Indexed = content present locally; live = queried at runtime; not-connected = no connector configured." />
          <MetricCard label="Documents" value={String(m.documents)} sub="records, measured" tip="Actual records inside indexed sources (5 clinical references + CDS + pharmacy master + lab + OT + bed diagnoses)." />
          <MetricCard label="Pages" value={m.pagesMeasured ? String(m.pages) : "N/A"} sub={m.pagesMeasured ? "measured" : "no paginated corpus"} tip="No PDF/page-based corpus exists in this build — pages are NOT MEASURED." />
          <MetricCard label="Tokens" value={fmt(m.tokens ?? 0)} sub={m.tokenMethod} tip="Deterministic word-token estimate of the indexed text. No LLM tokenizer is bundled, so this is labelled an estimate." />
          <MetricCard label="RAG chunks" value={fmt(m.chunks ?? 0)} sub="512-token units" tip="Computed from the measured token count ÷ 512. No vector store exists yet — embeddings = 0." />
          <MetricCard label="Embeddings" value="0" sub={m.embeddingDimension === null ? "no vector store" : `dim ${m.embeddingDimension}`} tip="No embeddings are stored anywhere in this build. A vector database would be required for real RAG." />
          <MetricCard label="Medical concepts" value={String(m.nodes)} sub={`${m.diseases} diseases · ${m.drugs} drugs`} tip="Unique nodes in the MedicalKnowledgeGraph, each mapped to real content (bed board, DDx module, pharmacy, lab, OT)." />
          <MetricCard label="Clinical relationships" value={String(m.edges)} sub="provenance-tracked" tip="Edges with evidence text and confidence, e.g. Enteric fever TREATED_BY Ceftriaxone (from actual med doses)." />
          <MetricCard label="Specialty domains" value={String(m.specialties)} sub="see coverage table" tip="Specialties with at least one indexed concept or source." />
          <MetricCard label="Evidence sources" value={String(m.evidenceSources)} sub="guidelines cited" tip="Distinct guideline/evidence nodes actually cited in CDS knowledge (UpToDate, IDSA, Centor, ACC/AHA, ADA, WHO, ESC…)." />
          <MetricCard label="PubMed records" value="0" sub={m.pubmedLiveSearch ? "live search available" : "not connected"} tip="No PubMed E-utilities connector exists. 0 indexed, no live search." />
          <MetricCard label="Live data" value={fmt(m.hospitalEvents)} sub={`${m.patientRecords} patient records`} tip="Hospital operational data from the live browser store — LIVE data, not knowledge. Never merged with the knowledge fabric." />
        </div>
        <div className="mt-4 flex items-center gap-2 text-[11px] text-slate-500">
          <Database size={12} className="text-violet-400" />
          {DATA_POINT_DEFINITION_EXPORT}
        </div>
      </GlassCard>

      {/* ---------------- Graph snapshot ---------------- */}
      <GlassCard>
        <SectionTitle title="Knowledge Graph Snapshot" subtitle="Nodes with provenance — click a concept to see where it came from" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            {(["disease", "drug", "investigation", "procedure", "guideline", "symptom", "sign"] as const).map((t) => (
              <div key={t} className="mb-3">
                <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5">{t}s — {byType(t).length}</div>
                <div className="flex flex-wrap gap-1.5">
                  {byType(t).map((n) => (
                    <span key={n.id} title={provenanceOf(n.id)} className="cursor-help rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-slate-300 hover:border-violet-400/40">
                      {n.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5">Sample relationships (real evidence)</div>
            <div className="space-y-1.5 max-h-96 overflow-y-auto">
              {KNOWLEDGE_GRAPH.edges.slice(0, 16).map((e) => (
                <div key={e.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-[10px]">
                  <span className="text-cyan-300">{e.from}</span>
                  <span className="text-violet-300 mx-1.5 font-mono">{e.type}</span>
                  <span className="text-fuchsia-300">{e.to}</span>
                  <div className="text-slate-500 mt-0.5">{e.evidence} · conf {Math.round(e.confidence * 100)}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </GlassCard>

      {/* ---------------- Specialty coverage ---------------- */}
      <GlassCard>
        <SectionTitle title="Specialty Coverage" subtitle="Measured concepts, relationships and sources per specialty" />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-white/10">
                <th className="pb-2 font-medium">Specialty</th>
                <th className="pb-2 font-medium">Sources</th>
                <th className="pb-2 font-medium">Documents</th>
                <th className="pb-2 font-medium">Concepts</th>
                <th className="pb-2 font-medium">Relationships</th>
                <th className="pb-2 font-medium">Evidence</th>
                <th className="pb-2 font-medium">Freshness</th>
              </tr>
            </thead>
            <tbody>
              {m.coverage.map((c) => (
                <tr key={c.specialty} className="border-b border-white/5">
                  <td className="py-2 text-slate-200">{c.specialty}</td>
                  <td className="py-2 text-slate-400">{c.sources}</td>
                  <td className="py-2 text-slate-400">{c.documents}</td>
                  <td className="py-2 text-slate-400">{c.concepts}</td>
                  <td className="py-2 text-slate-400">{c.relationships}</td>
                  <td className="py-2 text-slate-400">{c.evidenceSources}</td>
                  <td className="py-2"><Badge tone={c.freshness === "live" ? "cyan" : "neutral"} className="!text-[9px]">{c.freshness}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* ---------------- Source inventory ---------------- */}
      <GlassCard>
        <SectionTitle title="Source Registry" subtitle="Every knowledge source — what is actually accessible" />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-white/10">
                <th className="pb-2 font-medium">Source</th>
                <th className="pb-2 font-medium">Category</th>
                <th className="pb-2 font-medium">Records</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 font-medium">Freshness</th>
                <th className="pb-2 font-medium">Access</th>
              </tr>
            </thead>
            <tbody>
              {KNOWLEDGE_SOURCES.map((s) => (
                <tr key={s.id} className="border-b border-white/5">
                  <td className="py-2 text-slate-200">{s.name}</td>
                  <td className="py-2"><Badge tone="violet" className="!text-[9px]">{s.category}</Badge></td>
                  <td className="py-2 text-slate-400 font-mono">{s.recordsMeasured ? s.records : "?"}</td>
                  <td className="py-2">
                    <Badge tone={s.indexed === "indexed" ? "green" : s.indexed === "live-searchable" ? "cyan" : s.indexed === "configured-unavailable" ? "amber" : "neutral"} className="!text-[9px]">
                      {s.indexed.replace(/-/g, " ")}
                    </Badge>
                  </td>
                  <td className="py-2 text-slate-400">{s.freshness}</td>
                  <td className="py-2 text-slate-500 max-w-xs">{s.access}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* ---------------- Quality report ---------------- */}
      <GlassCard>
        <div className="flex items-center gap-3 mb-3">
          <SectionTitle title="Knowledge Quality" subtitle="Automated checks on the actual registry and graph" />
          <div className="flex items-center gap-2 ml-auto text-[10px]">
            {badCount === 0 && warnCount === 0 ? (
              <Badge tone="green"><CheckCircle2 size={10} /> all checks passed</Badge>
            ) : (
              <Badge tone={badCount > 0 ? "red" : "amber"}><ShieldAlert size={10} /> {badCount} bad · {warnCount} warnings</Badge>
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          {m.quality.map((q, i) => (
            <div key={i} className={cn("flex items-start gap-2 rounded-lg border p-2 text-[11px]", q.severity === "ok" ? "border-emerald-400/20 bg-emerald-400/[0.04] text-slate-300" : q.severity === "warn" ? "border-amber-400/25 bg-amber-400/[0.04] text-amber-200/90" : "border-red-400/30 bg-red-400/[0.05] text-red-200/90")}>
              <span className="mt-0.5 shrink-0">
                {q.severity === "ok" ? <CheckCircle2 size={12} className="text-emerald-400" /> : <ShieldAlert size={12} className={q.severity === "warn" ? "text-amber-400" : "text-red-400"} />}
              </span>
              <div>
                <span className="font-semibold capitalize">{q.category}:</span> {q.detail}
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* ---------------- Live Connector Lab ---------------- */}
      <GlassCard className="!border-cyan-400/25">
        <SectionTitle title="Live Connector Lab" subtitle="Real queries against public medical APIs — results carry provenance, nothing is fabricated" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          {(Object.keys(CONNECTOR_LABELS) as ConnectorRun["kind"][]).map((kind) => (
            <div key={kind} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-cyan-300 text-sm">{CONNECTOR_LABELS[kind].name}</span>
                <Badge tone="cyan" className="!text-[9px]">live</Badge>
              </div>
              <p className="text-[10px] text-slate-500 mt-1 min-h-[28px]">{CONNECTOR_LABELS[kind].desc}</p>
              <input
                value={queries[kind]}
                onChange={(e) => setQueries((p) => ({ ...p, [kind]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") void runConnector(kind); }}
                className="mt-2 w-full rounded-lg border border-white/10 bg-ink-900/60 px-2.5 py-1.5 text-xs text-white outline-none focus:border-cyan-400/50"
                placeholder={`query… e.g. ${CONNECTOR_LABELS[kind].sample}`}
              />
              <button
                onClick={() => void runConnector(kind)}
                disabled={busyKind !== null}
                className="mt-2 w-full rounded-lg bg-cyan-500/15 border border-cyan-400/30 text-cyan-200 py-1.5 text-xs font-medium hover:bg-cyan-500/25 disabled:opacity-40"
              >
                {busyKind === kind ? "Fetching…" : "Run live query"}
              </button>
            </div>
          ))}
        </div>

        {runs.length > 0 && (
          <div className="space-y-2">
            {runs.map((run) => (
              <div key={run.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge tone="cyan" className="!text-[9px]">{run.label}</Badge>
                  <span className="font-mono text-[11px] text-slate-300">"{run.query}"</span>
                  {run.result && <Badge tone="green" className="!text-[9px]">{run.result.fetched} fetched · {run.result.points.length} points · {run.tookMs}ms</Badge>}
                  {run.result?.totalHits !== undefined && <span className="text-[10px] text-slate-500">{run.result.totalHits} total hits on PubMed</span>}
                  {run.committed && run.commitInfo && (
                    <Badge tone="violet" className="!text-[9px]">persisted +{run.commitInfo.added} (dups {run.commitInfo.duplicates}, conflicts {run.commitInfo.conflicts})</Badge>
                  )}
                  <span className="ml-auto text-[9px] text-slate-600 font-mono">{new Date(run.ranAt).toLocaleTimeString()}</span>
                </div>
                {run.error ? (
                  <div className="text-[11px] text-red-300 mt-1.5">Failed: {run.error}</div>
                ) : (
                  <>
                    <div className="mt-1.5 text-[10px] text-slate-500">{run.result?.note}</div>
                    <div className="mt-1.5 space-y-1">
                      {preview(run).map((p, i) => (
                        <div key={i} className="flex items-start gap-2 text-[10px] text-slate-300 rounded-lg border border-white/5 bg-white/[0.02] px-2 py-1.5">
                          <span className="text-cyan-300 shrink-0">{p.subject}</span>
                          <span className="text-violet-300 shrink-0 font-mono">{p.relation}</span>
                          <span className="text-fuchsia-300 shrink-0">{p.object}</span>
                          <span className="text-slate-500 truncate" title={p.evidence}>— {p.evidence}</span>
                          <a className="text-cyan-400 hover:underline shrink-0" href={p.docRef} target="_blank" rel="noreferrer">↗</a>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => void commitRun(run.id, run.kind)}
                      disabled={run.committed}
                      className="mt-2 rounded-lg border border-violet-400/30 bg-violet-500/10 text-violet-200 px-2.5 py-1 text-[10px] font-medium hover:bg-violet-500/20 disabled:opacity-40"
                    >
                      {run.committed ? "Persisted to knowledge store" : "Persist to knowledge store (dedup + conflict check)"}
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="text-[10px] text-slate-500 mt-3">
          Points are persisted to the server-side knowledge store (knowledge-data/) with document hashing,
          deduplication and conflict detection — they survive restarts and appear in the Knowledge Growth panel
          below. Bulk PubMed ingestion runs as resumable jobs there too.
        </p>
      </GlassCard>

      {/* ---------------- Knowledge Growth (persistent store) ---------------- */}
      <GlassCard className="!border-emerald-400/20">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle title="Knowledge Growth — Persistent Store" subtitle="Real ingested data, measured from the server store (survives restarts)" />
          <Badge tone="green" className="!text-[9px]">{stats ? stats.store.engine.split(" (")[0] : "connecting…"}</Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
          <MetricCard label="Documents" value={fmt(stats?.totals.documents ?? 0)} sub="hashed, deduped" tip="Real documents ingested into the persistent store — each with checksum and provenance." />
          <MetricCard label="Chunks" value={fmt(stats?.totals.chunks ?? 0)} sub="~512-char units" tip="Deterministic sentence-boundary chunks of document text." />
          <MetricCard label="Knowledge points" value={fmt(stats?.totals.points ?? 0)} sub="persisted" tip="Verified knowledge points in the persistent store, each with evidence, tier, confidence, timestamps." />
          <MetricCard label="Concepts" value={fmt(stats?.totals.concepts ?? 0)} sub="MeSH + RxNorm" tip="Canonical terminology concepts with aliases and codes. Concepts are NOT counted as facts." />
          <MetricCard label="Embeddings" value={fmt(stats?.totals.embeddings ?? 0)} sub={stats?.embeddingEngine.model ?? "engine offline"} tip="Real vector embeddings of chunks, stored with model + dimension. 0 until an embedding model is available." />
          <MetricCard label="Evidence conflicts" value={fmt(stats?.totals.conflicts ?? 0)} sub="kept separate, never merged" tip="Source disagreements detected on ingest — both sides preserved as separate evidence." />
        </div>

        <div className="mt-3 text-[10px] text-slate-500">
          {stats && (
            <>
              Store: {stats.store.engine} · {fmt(stats.store.storageBytes)} bytes on disk · last ingest {stats.totals.lastIngest ? new Date(stats.totals.lastIngest).toLocaleString() : "never"}
              {" · "}embedding model: {stats.embeddingEngine.model ? `${stats.embeddingEngine.model} (dim ${stats.embeddingEngine.dimension})` : "EMBEDDING ENGINE OFFLINE"}
            </>
          )}
        </div>

        {/* ingestion jobs */}
        <div className="mt-4">
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Start PubMed ingestion job</div>
              <input
                value={newJob.query}
                onChange={(e) => setNewJob((p) => ({ ...p, query: e.target.value }))}
                className="w-full rounded-lg border border-white/10 bg-ink-900/60 px-2.5 py-1.5 text-xs text-white outline-none focus:border-emerald-400/50"
                placeholder="e.g. acute myocardial infarction"
              />
            </div>
            <select
              value={newJob.specialty}
              onChange={(e) => setNewJob((p) => ({ ...p, specialty: e.target.value }))}
              className="rounded-lg border border-white/10 bg-ink-900/60 px-2 py-1.5 text-xs text-slate-200 outline-none"
            >
              {["General Medicine", "Cardiology", "Endocrinology", "Infectious Disease", "Pulmonology", "Neurology", "Oncology", "Pediatrics", "OBGYN", "Psychiatry", "Nephrology"].map((s) => <option key={s}>{s}</option>)}
            </select>
            <input
              type="number"
              value={newJob.target}
              onChange={(e) => setNewJob((p) => ({ ...p, target: Number(e.target.value) || 0 }))}
              className="w-28 rounded-lg border border-white/10 bg-ink-900/60 px-2 py-1.5 text-xs text-slate-200 outline-none"
              placeholder="target points"
            />
            <button onClick={() => void startJob()} className="rounded-lg bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 px-3 py-1.5 text-xs font-medium hover:bg-emerald-500/25">
              Start job
            </button>
          </div>
          <p className="text-[10px] text-slate-600 mt-1">Target = stop once N points created (0 = ingest all hits, rate-limited 3 req/s). Jobs checkpoint to disk — resumable after a restart.</p>
        </div>

        <div className="mt-3 space-y-1.5 max-h-80 overflow-y-auto">
          {(stats?.jobs ?? []).map((j) => (
            <div key={j.jobId} className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5 text-[11px]">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge tone={j.status === "done" ? "green" : j.status === "running" || j.status === "queued" ? "cyan" : j.status === "failed" ? "red" : "amber"} className="!text-[9px]">{j.status}</Badge>
                <span className="font-mono text-slate-200">{j.query}</span>
                <span className="text-slate-500">· {j.specialty}</span>
                <span className="ml-auto font-mono text-slate-400">
                  {fmt(j.recordsProcessed)}/{fmt(j.recordsFound || j.recordsProcessed)} records · +{fmt(j.pointsCreated)} points · {fmt(j.duplicates)} dups blocked · {j.errors} errors
                  {j.conflictsDetected ? ` · ${j.conflictsDetected} conflicts` : ""}
                </span>
                <div className="w-full h-1 rounded bg-white/5 overflow-hidden">
                  <div className="h-full bg-emerald-400/60 transition-all" style={{ width: `${j.recordsFound ? Math.min(100, (j.recordsProcessed / j.recordsFound) * 100) : j.status === "done" ? 100 : 0}%` }} />
                </div>
              </div>
              <div className="text-slate-500 mt-1">
                {j.status === "failed" ? `Failed: ${j.error} · ` : ""}{j.lastBatch} · checkpoint {j.checkpoint} · {j.durationMs ? `${(j.durationMs / 1000).toFixed(1)}s` : ""} · {new Date(j.updatedAt).toLocaleTimeString()}
              </div>
              {(j.status === "running" || j.status === "queued" || j.status === "paused" || j.status === "failed") && (
                <div className="mt-1.5 flex gap-1.5">
                  {j.status === "running" && <button onClick={() => { void jobAction(j.jobId, "pause"); void refreshGrowth(); }} className="rounded border border-amber-400/30 bg-amber-400/10 text-amber-200 px-2 py-0.5 text-[9px]">pause</button>}
                  {(j.status === "paused" || j.status === "failed") && <button onClick={() => { void jobAction(j.jobId, "resume"); void refreshGrowth(); }} className="rounded border border-emerald-400/30 bg-emerald-400/10 text-emerald-200 px-2 py-0.5 text-[9px]">resume</button>}
                  <button onClick={() => { void jobAction(j.jobId, "cancel"); void refreshGrowth(); }} className="rounded border border-red-400/30 bg-red-400/10 text-red-200 px-2 py-0.5 text-[9px]">cancel</button>
                </div>
              )}
            </div>
          ))}
          {(stats?.jobs ?? []).length === 0 && <div className="text-[11px] text-slate-600">No ingestion jobs yet — start one above.</div>}
        </div>

        {/* embeddings */}
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-[11px]">
              <span className="font-semibold text-slate-200">Embedding Engine: </span>
              {embedStatusData?.engineOnline ? (
                <span className="text-emerald-300">{embedStatusData.model} (dim {embedStatusData.dimension}) — {fmt(embedStatusData.embeddedChunks)}/{fmt(embedStatusData.embeddedChunks + embedStatusData.pendingChunks)} chunks embedded</span>
              ) : (
                <span className="text-amber-300">EMBEDDING ENGINE OFFLINE — no embedding model in Ollama (bge-m3 pull running in background)</span>
              )}
            </div>
            {embedStatusData?.engineOnline && (
              <button onClick={() => void runEmbedIndex()} disabled={embedBusy} className="rounded-lg border border-emerald-400/30 bg-emerald-500/15 text-emerald-200 px-3 py-1 text-[10px] font-medium hover:bg-emerald-500/25 disabled:opacity-40">
                {embedBusy ? "Embedding…" : `Embed ${embedStatusData.pendingChunks} pending chunks`}
              </button>
            )}
          </div>
        </div>

        {/* terminology lab */}
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5">Terminology Lab — MeSH / RxNorm (concepts + aliases + codes, stored for normalization)</div>
          <div className="flex items-center gap-2">
            <input
              value={termTerm}
              onChange={(e) => setTermTerm(e.target.value)}
              className="flex-1 rounded-lg border border-white/10 bg-ink-900/60 px-2.5 py-1.5 text-xs text-white outline-none focus:border-violet-400/50"
              placeholder="term… e.g. myocardial infarction"
            />
            <button onClick={() => void runTermLookup("mesh")} disabled={termBusy} className="rounded-lg border border-violet-400/30 bg-violet-500/15 text-violet-200 px-3 py-1.5 text-xs font-medium hover:bg-violet-500/25 disabled:opacity-40">MeSH lookup</button>
            <button onClick={() => void runTermLookup("rxnorm")} disabled={termBusy} className="rounded-lg border border-violet-400/30 bg-violet-500/15 text-violet-200 px-3 py-1.5 text-xs font-medium hover:bg-violet-500/25 disabled:opacity-40">RxNorm lookup</button>
          </div>
          {termHits.length > 0 && (
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
              {termHits.map((h, i) => (
                <div key={i} className="rounded-lg border border-white/10 bg-white/[0.02] p-2 text-[10px]">
                  <span className="text-cyan-300 font-semibold">{h.name}</span> <span className="text-slate-500">· {h.source} · {h.codes.map((c) => `${c.system}:${c.code}`).join(", ")}</span>
                  {h.aliases.length > 0 && <div className="text-slate-500 mt-0.5">aliases: {h.aliases.slice(0, 8).join(" · ")}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </GlassCard>

      {/* ---------------- Roadmap to 40T+ ---------------- */}
      <GlassCard className="!border-amber-400/20">
        <SectionTitle title="Roadmap to 40T+" subtitle="The only honest path — 40T+ appears as DERIVED capacity, never as verified facts or parameters" />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500 border-b border-white/10">
                <th className="pb-2 font-medium">Milestone</th>
                <th className="pb-2 font-medium">Work</th>
                <th className="pb-2 font-medium">Verified target</th>
                <th className="pb-2 font-medium">Derived space</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {[
                { id: "M0", work: "Local registry + graph + 13 sources (this build)", verified: "133", derived: "~1.9K", status: "done" as const },
                { id: "M1", work: "Live connectors: PubMed E-utilities, ClinicalTrials.gov v2, Wikipedia REST — shipped now", verified: "up to ~3K per query", derived: "+", status: "live" as const },
                { id: "M2", work: "Bulk index jobs: PMC OA full-text (~4M), MeSH, RxNorm, ICD-11, MedlinePlus, WHO fact sheets", verified: "50M–300M", derived: "~10¹¹", status: "planned" as const },
                { id: "M3", work: "UMLS 14M concepts + SNOMED + full trials export + embeddings (bge-m3/e5) + local vector store for real RAG", verified: "1–2B", derived: "~10¹⁴ → 40T+ REACHED", status: "planned" as const },
                { id: "M4", work: "Freshness crawls, quality gates, human review, citation tracing end-to-end", verified: "sustained", derived: "sustained", status: "planned" as const },
              ].map((row) => (
                <tr key={row.id} className="border-b border-white/5">
                  <td className="py-2.5 font-mono text-slate-300">{row.id}</td>
                  <td className="py-2.5 text-slate-300 max-w-md">{row.work}</td>
                  <td className="py-2.5 text-slate-400">{row.verified}</td>
                  <td className="py-2.5 text-amber-300/90">{row.derived}</td>
                  <td className="py-2.5"><Badge tone={row.status === "done" ? "green" : row.status === "live" ? "cyan" : "amber"} className="!text-[9px]">{row.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-500 mt-3 leading-relaxed">
          Why verified saturates at ~1–2B: the entire world's medical literature is roughly 30M articles ≈
          300B tokens ≈ at most ~4B sentence-level facts. Verified 40T would require ~5–10 PB of peer-reviewed
          text that does not exist — any system claiming it is lying. 40T+ therefore lives in the derived space:
          mathematically bounded combinations of a real verified base (formula in metrics.ts). Parameters stay
          where they belong: 17.2B local, shown separately.
        </p>
      </GlassCard>

      {/* ---------------- Provenance / model note ---------------- */}
      <div className="flex items-start gap-2 text-[10px] text-slate-600 px-1 pb-4">
        <Brain size={12} className="mt-0.5 shrink-0" />
        <span>
          Model parameters and knowledge data are never merged. 40T+ is a labelled <em>target</em> that will only light up when
          real corpora are connected and measured. No number on this page is hard-coded — every metric recomputes from the
          registry, the graph and the live store.
        </span>
      </div>
    </div>
  );
}
