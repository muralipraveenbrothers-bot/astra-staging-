/**
 * Hermes evolution and replay room. Working versions stay in place.
 */
import React, { useState } from "react";
import { navHash } from "@/lib/hashRoute";
import { mem0Status, whyRetrieved } from "@/astra/brain/part5/memory";
import { runHermesPath } from "@/astra/brain/hermesPath";
import {
  advanceEvaluation,
  classifyLearning,
  mayAutoApply,
  openEvaluation,
  proposePlugin,
  proposeRevision,
  replayCases,
  rollback,
  seedSkills,
  shelf,
  type EvalRecord,
  type SkillVersion,
} from "@/astra/brain/part3/evolution";

function MemoryLab() {
  const status = mem0Status();
  const [open, setOpen] = React.useState(false);
  const why = whyRetrieved(null, "usual discharge format");
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm space-y-2">
      <h2 className="font-black">Memory lab</h2>
      <p>Provider: {status.state}. Hospital database, LangGraph, and Hermes built-in memory stay operational. Recalled text is not invented.</p>
      <p>LLM, embedding, vector store, recall accuracy: not measured while Mem0 is degraded.</p>
      <button type="button" className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white" onClick={() => setOpen(true)}>WHY WAS THIS MEMORY RETRIEVED?</button>
      {open && <p>Query: {why.query}. Memory: {why.memory}. Source: {why.source}. Verification: {why.verification}.</p>}
    </section>
  );
}

export function EvolutionRoom() {
  const [skills, setSkills] = useState<SkillVersion[]>(seedSkills);
  const [record, setRecord] = useState<EvalRecord | null>(null);
  const [reviewer, setReviewer] = useState("");
  const [learningNote, setLearningNote] = useState("The discharge summary missed the follow-up date.");
  const grouped = shelf(skills);
  const learning = classifyLearning(learningNote);
  const plugin = proposePlugin(["plugin-astra-brain-core"], {
    plugin_id: "plugin-astra-brain-core",
    name: "ASTRA Brain Core",
    version: "next",
    owner: "hermes",
    purpose: "proposal only",
    capabilities: [],
    inputs: [],
    outputs: [],
    tools: [],
    dependencies: [],
    data_classes: [],
    permissions: [],
    risk_class: "R4",
    human_approval: false,
    health_endpoint: "/health",
    fallback: "current plugin",
    tests: [],
    eval_suite: "clinical-eval",
    created_by: "hermes",
    reviewed_by: null,
    release_status: "proposal",
  });
  const replay = replayCases([]);

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4 text-slate-900">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-indigo-700">Hermes</p>
          <h1 className="text-2xl font-black">Evolution room</h1>
          <p className="text-xs text-slate-500">{runHermesPath("evolution room", "evolution").text}</p>
        </div>
        <button type="button" onClick={() => navHash("/command-center")} className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold">Back to command</button>
      </header>
      <section className="grid gap-3 md:grid-cols-4">
        {(["current", "draft", "under-evaluation", "approved", "deprecated", "failed", "suggested", "recently-changed"] as const).map((name) => (
          <article key={name} className="rounded-2xl border border-slate-200 bg-white p-3 text-sm">
            <h2 className="font-bold capitalize">{name.replace("-", " ")}</h2>
            <p>{grouped[name].map((skill) => skill.id).join(", ") || "none"}</p>
          </article>
        ))}
      </section>
      <button
        type="button"
        className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-bold text-white"
        onClick={() => {
          const next = proposeRevision(skills, "discharge-summary", "Draft format.", "clinical", "Hermes proposes a formatting revision.");
          setSkills(next.skills);
          setRecord(openEvaluation(next.draft, "discharge-summary-v4"));
        }}
      >
        Propose discharge-summary draft
      </button>
      {record && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm space-y-2">
          <p>Stage: {record.stage}</p>
          <p>Current version kept: {record.currentVersion}</p>
          <p>Previous safe version: {record.previousSafeVersion ?? "none"}</p>
          {record.blocked && <p className="text-amber-800">{record.blocked}</p>}
          <label className="block text-xs font-bold">Clinical reviewer
            <input value={reviewer} onChange={(event) => setReviewer(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white" onClick={() => setRecord(advanceEvaluation(record, reviewer))}>Advance evaluation</button>
            <button type="button" className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold" onClick={() => setRecord(rollback(record))}>Rollback</button>
          </div>
        </section>
      )}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
        <h2 className="font-black">Replay room</h2>
        <p>{replay.archiveEmpty ? "No de-identified historical archive is loaded. Cases are not invented, and past treatment is not applied to a new patient." : `${replay.casesRun} cases compared.`}</p>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm space-y-2">
        <h2 className="font-black">Learning candidate</h2>
        <input value={learningNote} onChange={(event) => setLearningNote(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2" />
        <p>{learning.class} → {learning.becomes}. This note does not become a clinical rule.</p>
        <p>Navigation can be applied inside limits: {mayAutoApply("navigation") ? "yes" : "no"}. Drug dosing logic can be applied without review: {mayAutoApply("drug dosing logic") ? "yes" : "no"}.</p>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
        <h2 className="font-black">Plugin laboratory</h2>
        <p>{plugin.reason}</p>
      </section>
      <MemoryLab />
    </main>
  );
}
