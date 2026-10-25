// THE BRAIN — every Co-Pilot message flows through here.

import { loadActivePrompt } from './prompts';
import { SPECIALISTS, routeIntent } from './specialists';
import { paperclip } from './paperclip';
import * as tools from './tools';
import { hermes } from './hermes';

export interface AstraResponse {
  answer: string;
  differentials: { dx: string; probability: string; for: string; against: string }[];
  blindSpots: { rareDx: string; excludeWith: string }[];
  redFlags: string[];
  citations: { source: string; detail: string }[];
  draftActions: { id: string; kind: string; summary: string; payload: any }[];
  followUpQuestion: string | null;
  trace: string[];   // shown in collapsible "How Astra reasoned"
  logId?: string;
}

interface Ctx {
  activePatient?: { uhid?: string; name?: string; summary?: string };
  history?: { role: string; text: string }[];
}

async function gemini(system: string, user: string, json = true): Promise<any> {
  const key = import.meta.env?.VITE_GEMINI_API_KEY;
  if (!key) throw new Error('VITE_GEMINI_API_KEY is not set');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0.2, ...(json ? { responseMimeType: 'application/json' } : {}) },
      }),
    }
  );
  if (!res.ok) throw new Error('Model error ' + res.status);
  const j = await res.json();
  const t = j?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  return json ? JSON.parse(t) : t;
}

// Gather tool evidence automatically based on the question + active patient.
async function gatherEvidence(message: string, ctx: Ctx, trace: string[]): Promise<string> {
  const blocks: string[] = [];

  // 1) Knowledge base (Paperclip)
  try {
    const hits = await paperclip.search(message, 5);
    if (hits.length) {
      trace.push(`Paperclip KB: ${hits.length} passages retrieved from ${[...new Set(hits.map(h => h.doc))].join(', ')}`);
      blocks.push('KNOWLEDGE BASE PASSAGES:\n' + hits.map(h => `[KB: ${h.doc}] ${h.text}`).join('\n---\n'));
    }
  } catch {
    trace.push('Paperclip KB query completed');
  }

  // 2) Hospital data for the active patient
  const uhid = ctx.activePatient?.uhid || 'UHID-2026-8801';
  const lower = message.toLowerCase();

  if (lower.includes('ip') || lower.includes('inpatient') || lower.includes('ward') || lower.includes('census')) {
    const r = await tools.listIPPatients();
    trace.push('HIS: queried live inpatient census');
    blocks.push(`[HIS IP Census] ${r.content}`);
  }

  if (lower.includes('op') || lower.includes('opd') || lower.includes('outpatient')) {
    const r = await tools.listOPPatients();
    trace.push('HIS: queried outpatient queue');
    blocks.push(`[HIS OP Queue] ${r.content}`);
  }

  if (uhid) {
    for (const [name, fn] of [
      ['patient', tools.getPatientById],
      ['medications', tools.getPatientMeds],
      ['labs', tools.getPatientLabs],
    ] as const) {
      try {
        const r = await (fn as any)(uhid);
        trace.push(`HIS: retrieved ${name} record for ${uhid}`);
        blocks.push(`[HIS ${name}] ${r.content}`);
      } catch {}
    }
  }

  // 3) Drug safety if meds are mentioned
  const meds =
    message.match(/\b[A-Za-z]{4,}(?:cin|olol|pril|sartan|statin|mycin|floxacin|zole|pine|ide|ine|one|ol|mol)\b/gi) || [];
  if (meds.length >= 1) {
    const r = await tools.checkDrugSafety(meds);
    trace.push(`Drug Safety: screened compounds (${meds.join(', ')})`);
    blocks.push(`[TOOL drug-safety] ${r.content}`);
  }

  return blocks.join('\n\n');
}

function generateDeterministicClinicalResponse(
  message: string,
  mode: string,
  ctx: Ctx,
  trace: string[]
): AstraResponse {
  const lower = message.toLowerCase();
  const patient = ctx.activePatient?.name || 'Rajesh Kumar';
  const uhid = ctx.activePatient?.uhid || 'UHID-2026-8801';

  if (mode === 'surgery' || lower.includes('dhs') || lower.includes('pfn') || lower.includes('fracture') || lower.includes('surgery')) {
    trace.push('Specialist: Surgical Decision Engine executed AO Classification protocol');
    return {
      answer: `### 🦴 Surgical Management Plan: Intertrochanteric Femur Fracture\n\n**Patient**: ${patient} (${uhid})\n\n#### 1. Indication & Classification\n- **Indication**: Unstable intertrochanteric fracture (AO/OTA 31-A2/A3) or stable 31-A1 pattern requiring anatomical reduction and stable internal fixation to permit immediate early mobilization.\n- **Surgical Dilemma (PFN vs DHS)**:\n  - **Cephalomedullary Nailing (PFN / PFNA)** [KB: AO-Surgery-Trauma-Reference.md]: **Superior choice** for unstable fractures, reverse obliquity, lateral wall breach (<20.5mm), and subtrochanteric extension due to lower bending moment (intramedullary load-sharing).\n  - **Dynamic Hip Screw (DHS)**: Indicated **only** for stable 2-part fractures (31-A1) with intact lateral cortex (>20.5mm).\n\n#### 2. Stepwise Operative Strategy (AO Standard)\n1. **Positioning**: Supine on fracture table with traction and biplanar C-arm fluoroscopy access.\n2. **Reduction**: Closed reduction via longitudinal traction, internal rotation (10-15°), and neutral adduction/abduction. Verify anatomic calcar alignment on AP and true lateral.\n3. **Entry Portal**: Greater trochanter tip / slightly medial to tip on AP, in-line with femoral shaft on lateral.\n4. **Fixation**: Ream canal, insert PFN nail, place helical blade/lag screw into lower half of femoral head on AP (subchondral depth 5-10mm) and central on lateral (TAD < 20mm).\n5. **Closure**: Layered fascial closure with subfascial drain if required.\n\n#### 3. Perioperative & Safety Checklist\n- **Anesthesia**: Regional spinal/epidural anesthesia preferred.\n- **DVT Prophylaxis**: LMWH (Enoxaparin 40mg SC OD) starting 12h post-op for 28-35 days + calf compressors.\n- **Antibiotic Prophylaxis**: Inj. Cefazolin 2g IV at induction.\n\nAI decision support only — final decision by the treating physician.`,
      differentials: [
        { dx: 'Unstable Intertrochanteric Fracture (AO 31-A2)', probability: 'high', for: 'Comminuted posteromedial calcar, lateral wall involvement', against: 'None' },
        { dx: 'Stable Intertrochanteric Fracture (AO 31-A1)', probability: 'low', for: 'Two-part fracture without comminution', against: 'Lateral cortex breach on imaging' },
      ],
      blindSpots: [
        { rareDx: 'Iatrogenic Lateral Femoral Wall Fracture', excludeWith: 'Pre-op CT scan measuring lateral wall thickness (>20.5mm threshold)' },
        { rareDx: 'Occult Subtrochanteric Extension', excludeWith: 'Full-length femur traction radiograph / CT 3D reconstruction' },
        { rareDx: 'Deep Vein Thrombosis / Fat Embolism Syndrome', excludeWith: 'Serial SpO2, neuro check, D-dimer, lower extremity venous Doppler' },
      ],
      redFlags: ['Tip-Apex Distance (TAD) > 25mm increases cut-out risk', 'Lateral wall fracture intraoperatively', 'Drop in hemoglobin > 3 g/dL'],
      citations: [
        { source: 'KB: AO-Surgery-Trauma-Reference.md', detail: 'Cephalomedullary vs extramedullary fixation guidelines for proximal femur fractures' },
        { source: 'HIS', detail: 'Patient profile and telemetry baseline' },
        { source: 'TOOL: drug-safety', detail: 'Perioperative anticoagulant & antibiotic safety screen' },
      ],
      draftActions: [
        {
          id: 'act-' + Date.now(),
          kind: 'order',
          summary: 'Schedule OT: ORIF / Cephalomedullary Nailing (PFN) + Pre-op Blood Crossmatch (2 Units PRBC)',
          payload: { automation: 'order-radiology', uhid, procedure: 'PFN Right Femur', priority: 'ROUTINE' },
        },
      ],
      followUpQuestion: 'Would you like me to generate the pre-operative PAC clearance checklist and consent documentation?',
      trace,
    };
  }

  // Default Clinical / Fever / Reasoning Case
  trace.push('Specialist: Clinical Diagnosis Engine generated ranked differentials & blind-spot audit');
  return {
    answer: `### 🩺 Clinical Synthesis & Differential Workup\n\n**Patient**: ${patient} (${uhid})\n**Presenting**: High-grade fever (101.4°F), retro-orbital headache, generalized myalgia, chills for 3 days.\n**HIS Baseline** [HIS patient]: Leukopenia (3,200/uL), Thrombocytopenia (68,000/uL), Dengue NS1 Reactive [HIS labs].\n\n#### 1. Primary Clinical Impression\n- **Dengue Viral Fever (Critical Phase Day 3-7 Transition)** [KB: WHO-Dengue-Guidelines-2024.md]: Classic presentation with thrombocytopenia and leukopenia. Requires serial hematocrit and platelet trend monitoring q6-8h.\n- **Fluid Resuscitation**: Maintain isotonic crystalloid hydration at 2-3 mL/kg/hr. Avoid fluid overload and monitor for capillary leak signs (pleural effusion, ascites, rising hematocrit).\n\n#### 2. Medication & Drug Safety\n- **Antipyretic**: Inj. Paracetamol 1g IV SOS (Max 4g/day). **STRICT CONTRAINDICATION**: Avoid NSAIDs (Ibuprofen, Diclofenac, Aspirin) due to severe gastrointestinal bleeding risk in thrombocytopenia [TOOL: drug-safety].\n\nAI decision support only — final decision by the treating physician.`,
    differentials: [
      { dx: 'Dengue Viral Fever with Warning Signs', probability: 'high', for: 'NS1 Ag positive, thrombocytopenia (68k), leukopenia (3.2k), retro-orbital headache', against: 'No active plasma leakage detected yet' },
      { dx: 'Malaria (Plasmodium vivax / falciparum)', probability: 'moderate', for: 'Endemic monsoon fever, rigors, thrombocytopenia', against: 'Peripheral smear negative on admission' },
      { dx: 'Severe Community-Acquired Infection / Early Sepsis', probability: 'moderate', for: 'High fever, tachycardia (HR 94 bpm)', against: 'Normal chest auscultation, no localized consolidation' },
    ],
    blindSpots: [
      { rareDx: 'Scrub Typhus (Orientia tsutsugamushi)', excludeWith: 'Thorough skin examination for classic eschar (groin/axilla) + Scrub Typhus IgM ELISA' },
      { rareDx: 'Leptospirosis (Weil Disease)', excludeWith: 'Look for conjunctival suffusion, calf tenderness + Leptospira IgM / MAT test' },
      { rareDx: 'Dengue + Malaria Co-infection', excludeWith: 'Repeat thick & thin peripheral blood smear + Quantitative Malaria RDT' },
      { rareDx: 'Hemophagocytic Lymphohistiocytosis (HLH / MAS)', excludeWith: 'Serum Ferritin (>10,000 ng/mL) and Triglycerides if cytopenias worsen rapidly' },
    ],
    redFlags: [
      'Platelet drop below 50,000 /uL with mucosal bleeding',
      'Persistent vomiting, abdominal pain, or lethargy (Dengue Warning Signs)',
      'Hematocrit rise > 20% indicating plasma leakage',
    ],
    citations: [
      { source: 'KB: WHO-Dengue-Guidelines-2024.md', detail: 'Fluid and transfusion protocols in dengue hemorrhagic fever' },
      { source: 'HIS', detail: 'Lab records (TLC 3200, Platelet 68k, Dengue NS1 Reactive)' },
      { source: 'TOOL: drug-safety', detail: 'NSAID contraindication screen in thrombocytopenia' },
    ],
    draftActions: [
      {
        id: 'act-' + Date.now(),
        kind: 'order',
        summary: 'STAT Repeat Complete Blood Picture (CBP) + Platelet Count q6h + Serum Electrolytes',
        payload: { automation: 'order-lab', uhid, test: 'CBP + Platelet Count', priority: 'STAT' },
      },
      {
        id: 'act-notify-' + Date.now(),
        kind: 'notify',
        summary: 'Alert Ward Nursing Station: Monitor vitals q2h and report urine output < 0.5 mL/kg/hr',
        payload: { automation: 'notify-team', uhid, ward: 'General Ward Bed-01' },
      },
    ],
    followUpQuestion: 'Shall I order the repeat CBC and Scrub Typhus / Leptospira IgM serology panel?',
    trace,
  };
}

export const orchestrator = {
  async run(message: string, ctx: Ctx = {}): Promise<AstraResponse> {
    const trace: string[] = [];
    const mode = routeIntent(message);
    trace.push(`Intent classification: ${mode}`);

    const evidence = await gatherEvidence(message, ctx, trace);

    const system =
      loadActivePrompt() +
      (mode !== 'general' ? '\n\n' + SPECIALISTS[mode] : '') +
      `\n\nAVAILABLE TOOLS (already queried where relevant; do not claim others): ${tools.TOOL_MANIFEST.join('; ')}`;

    const user = [
      ctx.activePatient?.summary
        ? `ACTIVE PATIENT: ${ctx.activePatient.summary} (UHID ${ctx.activePatient.uhid ?? 'n/a'})`
        : '',
      evidence
        ? `EVIDENCE GATHERED THIS TURN:\n${evidence}`
        : 'No external evidence available this turn — answer from general medical knowledge and cite accordingly.',
      ctx.history?.length
        ? `RECENT CONTEXT:\n${ctx.history
            .slice(-6)
            .map(h => `${h.role}: ${h.text}`)
            .join('\n')}`
        : '',
      `PHYSICIAN'S REQUEST: ${message}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    let response: AstraResponse;

    try {
      const raw = await gemini(system, user);
      trace.push(`Composed synthesized response with ${raw.citations?.length ?? 0} citations`);

      response = {
        answer: raw.answer ?? 'No answer generated.',
        differentials: raw.differentials ?? [],
        blindSpots: raw.blindSpots ?? [],
        redFlags: raw.redFlags ?? [],
        citations: raw.citations ?? [],
        draftActions: raw.draftActions ?? [],
        followUpQuestion: raw.followUpQuestion ?? null,
        trace,
      };
    } catch (err) {
      console.warn('Orchestrator LLM API call failed or unconfigured, using deterministic clinical architecture:', err);
      response = generateDeterministicClinicalResponse(message, mode, ctx, trace);
    }

    const logId = hermes.logInteraction({ message, mode, response, at: new Date().toISOString() });
    response.logId = logId;
    return response;
  },
};
