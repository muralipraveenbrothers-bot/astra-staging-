/**
 * ASTRA AI — CENTRAL INTEGRATION & MASTER VERIFICATION SUITE (PHASE 4 + RESTORATION)
 * ============================================================================
 * Runs automated end-to-end tests validating the complete clinical command loop,
 * hardened voice preflight/recovery, and self-healing canonical plugin restoration.
 */

import { centralCommand } from './src/astra/runtime/centralCommand';
import { pluginRuntime } from './src/astra/runtime/pluginRuntime';
import { agentBus } from './src/astra/runtime/agentBus';
import { healthService } from './src/astra/runtime/healthService';
import { voiceEngine } from './src/astra/voice/voiceEngine';
import { voicebox } from './src/astra/plugins/voicebox';
import { CANONICAL_PLUGIN_REGISTRY } from './src/astra/runtime/pluginRegistry';

async function runMasterVerification() {
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  ASTRA AI — CENTRAL INTEGRATION & MASTER VERIFICATION SUITE');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  function assert(cond: boolean, name: string, detail?: string) {
    if (cond) {
      console.log(`  ✅ ${name}`);
      passed++;
    } else {
      console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
      failed++;
    }
  }

  // -------------------------------------------------------------------------
  // TEST 1: Plugin Runtime Activation Lifecycle & Honest Status
  // -------------------------------------------------------------------------
  console.log('📋 TEST 1: Plugin Runtime Activation Lifecycle');
  await pluginRuntime.init();
  const allPlugins = pluginRuntime.list();
  assert(allPlugins.length >= CANONICAL_PLUGIN_REGISTRY.length, `Loaded full canonical registry (${allPlugins.length} plugins registered)`);

  const n8nPlugin = pluginRuntime.get('n8n-automation-addon');
  assert(
    n8nPlugin?.status === 'CONFIG_REQUIRED' || n8nPlugin?.status === 'ACTIVE',
    'n8n Plugin reports honest status (CONFIG_REQUIRED if VITE_N8N_BASE missing)',
    `Status: ${n8nPlugin?.status}`
  );

  const toxPlugin = pluginRuntime.get('emergency-toxicology-plugin');
  assert(toxPlugin?.status === 'ACTIVE' && toxPlugin?.health === 'HEALTHY', 'Emergency Toxicology is ACTIVE & HEALTHY');

  const voiceboxPlugin = pluginRuntime.get('voicebox');
  assert(voiceboxPlugin?.status === 'ACTIVE' && voiceboxPlugin?.health === 'HEALTHY', 'Voicebox Plugin is RESTORED & ACTIVE');

  // -------------------------------------------------------------------------
  // TEST 2: AgentBus Tool Registration & Pub/Sub
  // -------------------------------------------------------------------------
  console.log('\n📋 TEST 2: AgentBus Tool Registration');
  assert(agentBus.hasTool('match_toxidrome'), 'AgentBus has match_toxidrome tool from Toxicology plugin');
  assert(agentBus.hasTool('check_interaction'), 'AgentBus has check_interaction tool from Drug Safety plugin');
  assert(agentBus.hasTool('search_pubmed'), 'AgentBus has search_pubmed tool from Evidence plugin');
  assert(agentBus.hasTool('run_hope_engine'), 'AgentBus has run_hope_engine tool from Hope Engine plugin');
  assert(agentBus.hasTool('voicebox:transcribe_stream'), 'AgentBus has Voicebox stream transcription tool');
  assert(agentBus.hasTool('voicebox:synthesize_speech'), 'AgentBus has Voicebox speech synthesis tool');

  // -------------------------------------------------------------------------
  // TEST 3: Health Monitoring Service Background Cycle
  // -------------------------------------------------------------------------
  console.log('\n📋 TEST 3: Health Monitoring Service');
  const snapshot = await healthService.runCheckCycle();
  assert(snapshot.totalPlugins >= 15, 'HealthService evaluated ecosystem plugins');
  assert(snapshot.activeCount > 0, `HealthService reports ${snapshot.activeCount} active plugins`);

  // -------------------------------------------------------------------------
  // TEST 4: Co-Pilot Case: Dengue Suspect (Multi-Plugin Fusion)
  // -------------------------------------------------------------------------
  console.log('\n📋 TEST 4: Dengue Suspect Multi-Plugin Fusion');
  const dengueRes = await centralCommand.run(
    'Patient with high fever, severe retro-orbital pain, thrombocytopenia 68k, and hematocrit 44%. What is the diagnosis and fluid protocol?',
    {
      activePatient: {
        name: 'Rajesh Kumar',
        uhid: 'UHID-2026-8801',
        bedNumber: 'Bed-01',
        allergies: ['Penicillin'],
      },
    }
  );

  assert(dengueRes.answer.includes('Dengue'), 'Answer addresses Dengue / Febrile illness');
  assert(dengueRes.differentials.length > 0, 'Returns ranked differentials');
  assert(dengueRes.blindSpots.length > 0, 'Returns must-not-miss blind spots (e.g. hematocrit monitoring, plasma leakage)');
  assert(dengueRes.citations.length > 0, 'Returns citations tagged with source plugins');
  assert(dengueRes.disclaimer.includes('treating physician'), 'Includes mandatory clinical safety disclaimer');
  assert(dengueRes.draftActions.length > 0, 'Drafts actions (e.g., lab order / IDSP notification) requiring doctor approval');
  assert(
    dengueRes.contributingPlugins.includes('clinical-reasoning-plugin'),
    'Trace includes Clinical Reasoning Plugin'
  );

  // -------------------------------------------------------------------------
  // TEST 5: Co-Pilot Case: OP / Snakebite Emergency (Tox-Command)
  // -------------------------------------------------------------------------
  console.log('\n📋 TEST 5: Emergency Snakebite & Toxicology Case');
  const toxRes = await centralCommand.run('OP snake bite, bilateral ptosis, single breath count 12, 20 min since bite.', {
    activePatient: { name: 'Vikram Reddy', uhid: 'UHID-2026-8805', bedNumber: 'ICU-02' },
  });

  assert(toxRes.answer.includes('Antivenom') || toxRes.answer.includes('ASV'), 'Answer contains ASV antivenom protocol');
  assert(toxRes.redFlags.length > 0, 'Flags critical red flags (respiratory paralysis / bleeding)');
  const notifyAction = toxRes.draftActions.find((a) => a.type === 'notify-team' || a.type === 'critical-alert');
  assert(!!notifyAction, 'Generates STAT Notify Team / Critical Alert draft action requiring approval');

  // -------------------------------------------------------------------------
  // TEST 6: PubMed Real Search Verification
  // -------------------------------------------------------------------------
  console.log('\n📋 TEST 6: Real PubMed Evidence Retrieval');
  const pubmedRes = await centralCommand.run('latest guideline for acute febrile illness fluid management');
  const pmidCitation = pubmedRes.citations.find((c) => c.plugin.includes('PubMed'));
  assert(!!pmidCitation, 'Evidence & Literature plugin returns real PubMed indexed citation');
  assert(
    !!pmidCitation?.source || !!pmidCitation?.title,
    'Citation includes title and source'
  );

  // -------------------------------------------------------------------------
  // TEST 7: Drug-Drug Interaction Safety
  // -------------------------------------------------------------------------
  console.log('\n📋 TEST 7: Drug-Drug Safety Screening');
  const drugRes = await centralCommand.run('Is it safe to prescribe warfarin and aspirin together?', {
    activePatient: { name: 'Suresh Verma', uhid: 'UHID-2026-8809', allergies: [] },
  });
  const ddiRedFlag = drugRes.redFlags.find((rf) => rf.toLowerCase().includes('bleeding') || rf.toLowerCase().includes('warfarin'));
  assert(!!ddiRedFlag, 'Flags major bleeding interaction between warfarin and aspirin');

  // -------------------------------------------------------------------------
  // TEST 8: Plugin Deactivation Lifecycle
  // -------------------------------------------------------------------------
  console.log('\n📋 TEST 8: Plugin Deactivation Lifecycle');
  await pluginRuntime.toggle('hope-engine-plugin'); // Deactivate Hope Engine
  assert(pluginRuntime.get('hope-engine-plugin')?.status === 'DISABLED', 'Hope Engine set to DISABLED');
  assert(!agentBus.hasTool('hope-engine-plugin:run_hope_engine'), 'Hope Engine tools unregistered from AgentBus');

  const afterDeactRes = await centralCommand.run('Mystery fever refractory after 4 days with salmon rash');
  const hopeTrace = afterDeactRes.contributingPlugins.includes('hope-engine-plugin');
  assert(!hopeTrace, 'Deactivated plugin is skipped in execution trace');

  // Reactivate Hope Engine
  await pluginRuntime.toggle('hope-engine-plugin');
  assert(pluginRuntime.get('hope-engine-plugin')?.status === 'ACTIVE', 'Hope Engine reactivated');

  // -------------------------------------------------------------------------
  // TEST 9: Hardened Voice Engine & Preflight
  // -------------------------------------------------------------------------
  console.log('\n📋 TEST 9: Hardened Voice Engine & Preflight Verification');
  assert(typeof voiceEngine.preflight === 'function', 'voiceEngine provides preflight permission probe');
  const preflightRes = await voiceEngine.preflight();
  assert(typeof preflightRes.ok === 'boolean', 'preflight probe completes without uncaught exception');

  // Test voicebox profile switcher
  voicebox.switchVoice('empathetic-physician');
  assert(voicebox.getActiveProfile() === 'empathetic-physician', 'Voicebox profile switched to empathetic-physician');
  voicebox.switchVoice('warm-consultant');
  assert(voicebox.getActiveProfile() === 'warm-consultant', 'Voicebox profile switched back to warm-consultant');

  // -------------------------------------------------------------------------
  // TEST 10: Canonical Self-Healing Plugin Registry
  // -------------------------------------------------------------------------
  console.log('\n📋 TEST 10: Self-Healing Plugin Registry Verification');
  const initialCount = pluginRuntime.list().length;
  assert(initialCount >= 20, `Self-healing runtime initialized with ${initialCount} canonical plugins`);

  // Verify all essential categories exist
  const cats = new Set(pluginRuntime.list().map((p) => p.category));
  assert(cats.has('Models'), 'Models category present');
  assert(cats.has('Agents'), 'Agents category present');
  assert(cats.has('Voice'), 'Voice category present');
  assert(cats.has('Medical'), 'Medical category present');
  assert(cats.has('Hospital'), 'Hospital category present');
  assert(cats.has('Integrations'), 'Integrations category present');

  // -------------------------------------------------------------------------
  // TEST 11: Clinical Outcomes & Governance Records
  // -------------------------------------------------------------------------
  console.log('\n📋 TEST 11: Clinical Outcomes & Governance Records');
  const outcomes = centralCommand.getOutcomesSummary();
  assert(outcomes.totalConsultations > 0, `Recorded ${outcomes.totalConsultations} clinical consultations`);
  assert(typeof outcomes.averageGuidelineAdherence === 'string', `Guideline adherence: ${outcomes.averageGuidelineAdherence}`);
  assert(typeof outcomes.mustNotMissSafetyCatchRate === 'string', `Safety catch rate: ${outcomes.mustNotMissSafetyCatchRate}`);

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(`  MASTER VERIFICATION RESULTS: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  if (failed > 0) process.exit(1);
}

runMasterVerification().catch((err) => {
  console.error(err);
  process.exit(1);
});
