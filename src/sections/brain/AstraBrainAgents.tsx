type AgentRow = { group: string; id: string; line: string };

const ROWS: AgentRow[] = [
  { group: "Core brain", id: "hermes_brain", line: "reason() calls runHermesPath and returns an empty differential. The method says no diagnosis was made. Called from clinical routes." },
  { group: "Core brain", id: "langgraph_orchestrator", line: "Graph helper in src/agents/core/LangGraphOrchestrator.ts. Imported by Sanjeevani reasoning code." },
  { group: "Core brain", id: "UniversalVerifier", line: "verify() records checks. Called from CommandEngine. The seed id validator_agent is not the field on this class." },
  { group: "Core brain", id: "UniversalIntentResolver", line: "Labels an intent from the text. Used by the draft collector." },
  { group: "Core brain", id: "PatientContextResolver", line: "resolve() is called from CommandEngine." },
  { group: "Core brain", id: "core-langgraph", line: "Lib graph helper. The internal browser imports langGraph from this file." },
  { group: "Core brain", id: "core-model-router", line: "Returns a route name such as LOCAL_FAST or FRONTIER_MEDICAL. Used by the lib graph file." },
  { group: "Core brain", id: "core-command", line: "processCommand can allow every role. A comment calls that a prototype. Not imported outside its file. Present, not called." },
  { group: "Core brain", id: "core-hermes", line: "analyze() logs and returns a mock differential. This is not the hermes_brain path. Present, not called." },
  { group: "Core brain", id: "core-knowledge", line: "retrieveEvidence returns one fixed sentence. Present, not called." },
  { group: "Core brain", id: "core-safety", line: "Returns true. A comment says mock safe. Present, not called." },
  { group: "Core brain", id: "core-memory", line: "Returns lastKnownStatus Stable. Present, not called." },
  { group: "Executive", id: "exec-ceo", line: "generateReport returns data_placeholder. Present, not called." },
  { group: "Department", id: "hod-clinical-command", line: "selectAgents is used by the AI routing bridge." },
  { group: "Manager", id: "command_agent", line: "CommandAgent exists. I did not find an import of this class. Present, not called." },
  { group: "Manager", id: "op_margin_optimizer_agent", line: "analyze() and formatReport() run from CommandEngine. The seed id op_margin_optimizer does not match this field." },
  { group: "Specialist", id: "hospital_query_agent", line: "Runs a local tool for census or a queue. The draft collector calls it." },
  { group: "Specialist", id: "patient_context_agent", line: "The draft collector calls it for a named local chart." },
  { group: "Specialist", id: "clinical_reasoning_agent", line: "execute() calls HermesBrain.reason. The draft collector calls it." },
  { group: "Specialist", id: "evidence_agent", line: "Calls the searchPubMed and retrieveGuideline tools. The draft path uses it only when non-patient literature is allowed." },
  { group: "Specialist", id: "image_agent", line: "execute() calls ClinicalCoPilotAgent." },
  { group: "Specialist", id: "clinical_copilot_agent", line: "Used by ImageAgent." },
  { group: "Specialist", id: "clinical_blind_spot_agent", line: "analyzeBlindSpots, ruleIn, and ruleOut run from CommandEngine." },
  { group: "Specialist", id: "integrative_medicine_agent", line: "routeByKeyword runs from CommandEngine." },
  { group: "Specialist", id: "susruta_clinical_superbrain", line: "analyze() builds condition cards. Called from CommandEngine and the server index." },
  { group: "Specialist", id: "biosim_simulator", line: "simulate() runs from CommandEngine. The seed id bio_sim_engine does not match this field." },
  { group: "Specialist", id: "molecular_cascade_agent", line: "run() writes local stage text from vitals. Called from CommandEngine. Not a timed engine." },
  { group: "Specialist", id: "vent_brain", line: "assess() computes driving pressure and an acid-base label from the numbers passed in." },
  { group: "Specialist", id: "tox_commander", line: "match() runs from CommandEngine and the server index. The seed id tox_command does not match this field." },
  { group: "Specialist", id: "trauma_intelligence_coordinator", line: "assess() runs from CommandEngine." },
  { group: "Specialist", id: "surgical_roadmap_agent", line: "run() runs from CommandEngine." },
  { group: "Specialist", id: "shield_guardian", line: "checkOrder() matches a fixed list of drug pairs. No hash or cryptographic audit in this file." },
  { group: "Specialist", id: "cerebellum_balancer", line: "filter() replaces phrases. Called from the server index. No timer in this file. The seed id cerebellum_filter does not match." },
  { group: "Specialist", id: "PragnyaCoordinator", line: "Class exists. getPragnyaCoordinator is not imported elsewhere. Present, not called." },
  { group: "Specialist", id: "MitraWellnessAgent", line: "Class exists. getMitraWellnessAgent is not imported elsewhere. Present, not called." },
  { group: "Worker", id: "SanjeevaniConfirmationAgent", line: "Registers a tool when the file loads. Not imported. Present, not called." },
  { group: "Worker", id: "SanjeevaniReasoningAgent", line: "File exists and is not imported. Present, not called." },
  { group: "Worker", id: "SanjeevaniEventListener", line: "Imported by a test, not by the app. Present, not called." },
  { group: "Worker", id: "MedicalImageAgentFinal", line: "analyzeImage is called from CentralResolver." },
  { group: "Worker", id: "MedicalImageAgent", line: "Exports the Hotspot type used by an image viewer." },
  { group: "Worker", id: "MedicalImageAgentV4", line: "Class exists. I did not find an app import. Present, not called." },
  { group: "Worker", id: "analyzeEcgImage", line: "Called from ClinicalChatPlugin. Tries a Google generateContent request, then a local fallback." },
  { group: "Worker", id: "runScientistAnalysis", line: "Called from the clinical route. Builds an analysis object." },
  { group: "Worker", id: "Astra7DClinicalEngine", line: "synthesize7D and layaSystem1Triage are called from saarathi routes. This is the class, not a timed engine." },
  { group: "Worker", id: "layaDecisionAdapter", line: "decide() is called for language routing. No millisecond figure in that call." },
  { group: "Worker", id: "PatientQueryAgent", line: "Used inside CommandCore." },
  { group: "Worker", id: "OTCommandAgent", line: "execute() is used inside CommandCore." },
];

export function AstraBrainAgents() {
  let last = "";
  return (
    <section className="ab-card rounded-xl px-3 py-2 mt-2" aria-label="Agents in code">
      <h2 className="text-xs uppercase tracking-wide">F. Agents in this code</h2>
      <p className="mt-1 text-[11px]">{ROWS.length} modules with a file. The pasted list of 310 agents is not in this code. Plugin cards that do not name one of these files are not counted.</p>
      <p className="mt-1 text-[11px]">voice_agent is only a name in the agent seed. There is no module with that id. A sentence in the seed says 13 thinking modes. HermesBrain.reason takes a mode number and does not use it. No 13-mode list, no sub-10ms filter, no sub-15ms Laya path, and no cryptographic audit were found in these files.</p>
      <ol className="mt-2 list-decimal pl-4 text-[11px] flex flex-col gap-1">
        {ROWS.map((row) => {
          const show = row.group !== last;
          last = row.group;
          return (
            <li key={row.id}>
              {show ? <span className="uppercase">{row.group}. </span> : null}
              <span>{row.id}. </span>
              <span>{row.line}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}