import { orchestrator } from './src/astra/agents/orchestrator';
import { paperclip } from './src/astra/agents/paperclip';
import { hermes } from './src/astra/agents/hermes';
import { checkDrugSafety } from './src/astra/agents/tools';
import { routeIntent } from './src/astra/agents/specialists';
import { ecgSpokenSummary, EcgInterpretation } from './src/astra/agents/ecgAgent';

async function runTests() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  ASTRA SUPER-AGENTIC & ECG/VOICE UPGRADE TESTS');
  console.log('══════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  function assert(cond: boolean, name: string) {
    if (cond) {
      console.log(`  ✅ ${name}`);
      passed++;
    } else {
      console.error(`  ❌ ${name}`);
      failed++;
    }
  }

  console.log('📋 TEST 1: Intent Routing');
  assert(routeIntent('dhs vs pfn in intertrochanteric fracture') === 'surgery', 'Routes fracture/DHS query to surgery');
  assert(routeIntent('what are the drug interactions with ciprofloxacin') === 'drug', 'Routes interaction query to drug');
  assert(routeIntent('what is the differential for high fever and thrombocytopenia') === 'diagnosis', 'Routes differential query to diagnosis');

  console.log('\n📋 TEST 2: Deterministic Drug Interaction Checker');
  const ddi = await checkDrugSafety(['ciprofloxacin', 'amiodarone']);
  assert(ddi.data?.safe === false, 'Detects QT prolongation interaction');
  assert(ddi.content.includes('QT prolongation'), 'Contains QT prolongation details');

  console.log('\n📋 TEST 3: Paperclip RAG Ingestion & Search');
  await paperclip.init();
  const chunkCount = await paperclip.ingest('Test-Protocol-2026.md', 'In acute hypokalemia, administer IV potassium chloride at maximum 10-20 mEq/hr with continuous ECG monitoring.');
  assert(chunkCount > 0, 'Ingested test protocol chunks into vector DB');
  const results = await paperclip.search('potassium replacement rate', 2);
  assert(results.length > 0, 'Vector search retrieved indexed protocol');
  assert(results[0].text.includes('potassium chloride'), 'Search hit contains protocol content');

  console.log('\n📋 TEST 4: Hermes Self-Upgrade & Feedback Logger');
  const logId = hermes.logInteraction({
    message: 'Test query',
    mode: 'diagnosis',
    response: { answer: 'Sample Dx' },
    at: new Date().toISOString(),
  });
  assert(typeof logId === 'string' && logId.startsWith('log-'), 'Logged interaction returned log ID');
  hermes.recordFeedback(logId, 'up');
  const stats = hermes.getStats();
  assert(stats.up >= 1, 'Thumbs up feedback recorded');
  const proposal = await hermes.proposeImprovement();
  assert(proposal.newVersion.length > 0, 'Hermes generated prompt improvement version');

  console.log('\n📋 TEST 5: Orchestrator End-to-End Run');
  const res = await orchestrator.run('What is the surgical plan for unstable intertrochanteric fracture DHS vs PFN?', {
    activePatient: { name: 'Rajesh Kumar', uhid: 'UHID-2026-8801' },
  });
  assert(res.answer.includes('Cephalomedullary Nailing (PFN / PFNA)'), 'Orchestrator answer covers PFN vs DHS');
  assert(res.differentials.length > 0, 'Returns ranked differentials');
  assert(res.blindSpots.length > 0, 'Returns blind-spot audit (must-not-miss)');
  assert(res.citations.length > 0, 'Returns source citations');
  assert(res.trace.length > 0, 'Returns agent reasoning trace');
  assert(res.draftActions.length > 0, 'Returns draft action for approval');

  console.log('\n📋 TEST 6: ECG Spoken Summary & Disclaimer');
  const dummyEcg: EcgInterpretation = {
    technicalQuality: 'Diagnostic quality',
    rate: '110 bpm',
    rhythm: 'Atrial Fibrillation with RVR',
    axis: 'Normal',
    intervals: { pr: 'N/A', qrs: '88ms', qtc: '420ms' },
    chambers: 'Normal',
    ischemiaInfarction: 'No acute ST elevation',
    localization: 'N/A',
    findings: ['Irregularly irregular rhythm', 'Absence of distinct P waves'],
    impression: ['Atrial Fibrillation with Rapid Ventricular Response'],
    differentials: ['Multifocal Atrial Tachycardia', 'Atrial Flutter with variable block'],
    redFlags: ['Rapid ventricular rate (>100 bpm) with potential hemodynamic instability'],
    immediateManagement: ['Rate control with IV beta-blocker or Diltiazem', 'Calculate CHA2DS2-VASc score'],
    confidence: 'High',
    disclaimer: 'AI decision support only. Confirm with a 12-lead review and treating physician.',
  };
  const spoken = ecgSpokenSummary(dummyEcg);
  assert(spoken.includes('Atrial Fibrillation'), 'Spoken summary mentions impression');
  assert(spoken.includes('AI decision support only'), 'Spoken summary includes medical disclaimer');

  console.log('\n══════════════════════════════════════════════════════');
  console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
  console.log('══════════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
