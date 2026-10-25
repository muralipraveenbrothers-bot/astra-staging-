/** Checked on this PC. A snapshot, not a probe on each render. */
const CHECKED = "30 Sep 2026, 6:43 AM IST";

export function AstraBrainInventory() {
  return (
    <div className="flex flex-col gap-2" aria-label="Astra Brain inventory">
      <section className="ab-card rounded-xl px-3 py-2" aria-label="Services">
        <h2 className="text-xs uppercase tracking-wide">A. Services</h2>
        <p className="mt-1 text-[11px]">Checked {CHECKED}. Online is the pm2 status. Listening means the port was open. This is not a health probe.</p>
        <h3 className="mt-2 text-[11px] uppercase tracking-wide">PM2 online</h3>
        <ol className="mt-1 list-decimal pl-4 text-[11px] flex flex-col gap-1">
          <li>Voicebox. Online. pm2 pid 18288. 7.7mb. 127.0.0.1:17493 listening.</li>
          <li>AstraAPI. Online. pm2 pid 27804. 13.2mb. 127.0.0.1:3000 listening. The listener is a child of that pid.</li>
          <li>AstraUI. Online. pm2 pid 16300. 6.1mb. 127.0.0.1:5173 listening.</li>
          <li>OpenClaw. Online. pm2 pid 19512. 6.1mb. 127.0.0.1:18789 listening.</li>
          <li>Hermes. Online. pm2 pid 16244. 6.0mb. 127.0.0.1:9119 listening.</li>
        </ol>
        <h3 className="mt-2 text-[11px] uppercase tracking-wide">PM2 stopped</h3>
        <ol className="mt-1 list-decimal pl-4 text-[11px] flex flex-col gap-1">
          <li>OpenHands. Stopped. Configured ports 8080 and 18000 were not listening.</li>
          <li>n8n. Stopped. Configured port 5678 was not listening.</li>
        </ol>
        <h3 className="mt-2 text-[11px] uppercase tracking-wide">Listening, not its own pm2 row</h3>
        <ol className="mt-1 list-decimal pl-4 text-[11px] flex flex-col gap-1">
          <li>Ollama. 127.0.0.1:11434 listening. Process is ollama.exe serve. Not in this pm2 list.</li>
          <li>Laya. 127.0.0.1:8791 listening. Script is server/plugins/astra_laya_server.py. Its parent is the AstraAPI node, not a separate pm2 app.</li>
          <li>FreeLLMAPI endpoint and process ownership are reported from live health probes and the canonical port registry.</li>
          <li>OmniRoute. 127.0.0.1:20128 listening. Not its own pm2 app. The process is a child of the AstraAPI node.</li>
        </ol>
      </section>
      <section className="ab-card rounded-xl px-3 py-2" aria-label="What PM2 keeps">
        <h2 className="text-xs uppercase tracking-wide">B. What PM2 keeps</h2>
        <p className="mt-1 text-[11px]">C:\Users\mural\.pm2 has dump.pm2, dump.pm2.bak, pm2.log, pm2.pid, a logs folder, and a pids folder. This page does not show log text or environment values.</p>
      </section>
      <section className="ab-card rounded-xl px-3 py-2" aria-label="Project port files">
        <h2 className="text-xs uppercase tracking-wide">C. Project files that govern ports</h2>
        <ol className="mt-1 list-decimal pl-4 text-[11px] flex flex-col gap-1">
          <li>config/ports.json. Names the ports used above, including stopped ones.</li>
          <li>scripts/deploy-candidate.mjs. Reads ports.json. Restarts one named service after preflight.</li>
          <li>scripts/stack-preflight.mjs. Reads ports.json before a start.</li>
          <li>scripts/stack-watchdog.mjs. Probes services from ports.json.</li>
          <li>scripts/verify-stack.mjs. Reads ports.json for its health check.</li>
        </ol>
      </section>
      <section className="ab-card rounded-xl px-3 py-2" aria-label="Hospital data layer">
        <h2 className="text-xs uppercase tracking-wide">D. Hospital data layer</h2>
        <p className="mt-1 text-[11px]">server/db.ts names data/hospital.json, data/hospital_profile.json, and data/audit.jsonl. All three files are on this PC. This page does not open them. No hash or cryptographic audit code was found in server/db.ts.</p>
      </section>
      <section className="ab-card rounded-xl px-3 py-2" aria-label="Thinking order">
        <h2 className="text-xs uppercase tracking-wide">E. Thinking order</h2>
        <h3 className="mt-2 text-[11px] uppercase tracking-wide">7D ladder in code</h3>
        <p className="mt-1 text-[11px]">Node names in src/features/mayin/clinical/D7Workflow.ts. Defined in code, not a live diagnosis engine. runD7Workflow is called from D7Workflow.spec.ts. No app route imports it.</p>
        <ol className="mt-1 list-decimal pl-4 text-[11px]">
          <li>extract_1D</li>
          <li>build_2D_pattern</li>
          <li>collect_3D_evidence</li>
          <li>construct_4D_timeline</li>
          <li>branch_5D_differential</li>
          <li>model_6D_mechanisms</li>
          <li>synthesize_7D_decision</li>
        </ol>
        <p className="mt-1 text-[11px]">Inside that same file the mechanism order is molecular, cellular, tissue, organ, system, multi_system, whole_patient.</p>
        <h3 className="mt-2 text-[11px] uppercase tracking-wide">mechanism.ts</h3>
        <p className="mt-1 text-[11px]">src/astra/brain/part2/mechanism.ts is used by explainCase. explainCase is imported by ClinicalBrainPanel, review.ts, and hermesPath.ts. It is a local text ladder. It does not list organelle or whole-patient tiers.</p>
        <p className="mt-1 text-[11px]">Graph nodes: CAUSE, CELL, TISSUE, ORGAN, SYSTEM, COMPENSATION, CLINICAL SIGNS, LAB SIGNALS, COMPLICATIONS, INTERVENTION POINTS.</p>
        <p className="mt-1 text-[11px]">Level keys: cell, tissue, organ, system, multisystem, compensation, failure.</p>
        <h3 className="mt-2 text-[11px] uppercase tracking-wide">Scientific skills registered</h3>
        <p className="mt-1 text-[11px]">Names in astra/intelligence_extensions/scientific_skills/registry.ts. Code default on: paper-lookup, database-lookup, scientific-writing, clinical-reports, treatment-plans. Code default off: pydicom, biopython, rdkit. An environment flag can change that. This page did not read those flags.</p>
        <p className="mt-1 text-[11px]">That folder has registry.ts, types.ts, and worker.ts only. Skill body files are not there. The worker returns a plan and does not call the listed sites. server/ai/routes.ts can list the names at /api/intelligence/skills.</p>
        <h3 className="mt-2 text-[11px] uppercase tracking-wide">Search</h3>
        <p className="mt-1 text-[11px]">The search field on this page posts to this PC at /api/ai/doctor-order. In server/ai/modelGateway.ts, a patient name, UHID, note, diagnosis, or those words in the text stays on local Ollama. FreeLLM and OmniRoute are refused for that text. Other text on that route tries FreeLLM, then OmniRoute, then Ollama. That is chat routing, not a literature search. paper-lookup is only a registered name.</p>
        <h3 className="mt-2 text-[11px] uppercase tracking-wide">Anatomy systems in humanAtlas.ts</h3>
        <ul className="mt-1 flex flex-wrap gap-1 text-[11px]">
          <li className="ab-card rounded px-1.5 py-0.5">Skeleton #e2d9ba</li>
          <li className="ab-card rounded px-1.5 py-0.5">Muscles #a85b50</li>
          <li className="ab-card rounded px-1.5 py-0.5">Heart #b96760</li>
          <li className="ab-card rounded px-1.5 py-0.5">Sensory organs #b0c8ce</li>
          <li className="ab-card rounded px-1.5 py-0.5">Arteries #c05245</li>
          <li className="ab-card rounded px-1.5 py-0.5">Veins #527c9f</li>
          <li className="ab-card rounded px-1.5 py-0.5">Nervous system #d8b565</li>
          <li className="ab-card rounded px-1.5 py-0.5">Respiratory #b98991</li>
          <li className="ab-card rounded px-1.5 py-0.5">Digestive #b8916b</li>
          <li className="ab-card rounded px-1.5 py-0.5">Urinary #b47961</li>
          <li className="ab-card rounded px-1.5 py-0.5">Lymphatic #879f7c</li>
          <li className="ab-card rounded px-1.5 py-0.5">Endocrine #c5a09a</li>
          <li className="ab-card rounded px-1.5 py-0.5">Reproductive #bda098</li>
          <li className="ab-card rounded px-1.5 py-0.5">Body surface #ba9b7d</li>
          <li className="ab-card rounded px-1.5 py-0.5">Connective tissue #aec3bb</li>
        </ul>
      </section>
    </div>
  );
}
