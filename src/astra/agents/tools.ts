// Tool registry the orchestrator can call.

export interface ToolResult {
  source: string;
  content: string;
  data?: any;
}

// ---- Hospital information system adapters ----
export async function getPatientById(uhid: string): Promise<ToolResult> {
  return {
    source: 'HIS',
    content: `Patient record [${uhid}]: Rajesh Kumar, 48y/M, Bed-01. Diagnosis: Dengue Viral Fever with Thrombocytopenia. Vitals: BP 130/85, HR 94 bpm, Temp 101.4°F, SpO2 97%, RR 20/min. Allergies: NKDA.`,
  };
}

export async function listIPPatients(): Promise<ToolResult> {
  return {
    source: 'HIS',
    content: `Live Inpatient (IP) Census:\n• Bed-01: Rajesh Kumar (48y/M) - Dengue Viral Fever (Febrile)\n• Bed-05: Suresh Verma (56y/M) - Type 2 Diabetes / Cellulitis (Stable)\n• ICU-Bed-04: Ananya Sharma (32y/F) - Severe Pneumonia / ARDS (Critical)\n• Ward-B-02: Vikram Reddy (41y/M) - Post-op ORIF Right Femur\n• Bed-06: Priya Nair (29y/F) - Acute Gastroenteritis (Ready for discharge)\nTotal Inpatients: 32 | Bed Occupancy: 84% (32/38 beds)`,
  };
}

export async function listOPPatients(): Promise<ToolResult> {
  return {
    source: 'HIS',
    content: `Live Outpatient (OP) Queue:\n• Queue #1 (Active): Rajesh Kumar (UHID-2026-8801) - High fever 101.4°F, retro-orbital pain\n• Queue #2: Lakshmi Devi (UHID-2026-8810) - Bronchial Asthma flare\n• Queue #3: Mohd. Tariq (UHID-2026-8811) - Suspected Renal Calculus\n• Queue #4: Sneha Gupta (UHID-2026-8812) - Hypothyroidism follow-up`,
  };
}

export async function getPatientMeds(uhid: string): Promise<ToolResult> {
  return {
    source: 'HIS',
    content: `Current Medications for ${uhid}:\n1. Inj. Paracetamol 1g IV SOS (Max 4g/day)\n2. IV Normal Saline (0.9%) @ 100 mL/hr\n3. Tab. Pantoprazole 40mg PO OD before breakfast\n4. Tab. Recadril 100mg PO TDS`,
  };
}

export async function getPatientLabs(uhid: string): Promise<ToolResult> {
  return {
    source: 'HIS',
    content: `Latest Lab Results for ${uhid}:\n• Hemoglobin: 14.8 g/dL (Normal)\n• Total Leukocyte Count: 3,200 /uL (Leukopenia ⚠️)\n• Platelet Count: 68,000 /uL (Thrombocytopenia ⚠️)\n• Hematocrit: 44.2% (Borderline Hemoconcentration)\n• Dengue NS1 Antigen: POSITIVE (Reactive)\n• Serum Creatinine: 0.9 mg/dL | SGOT/AST: 88 U/L | SGPT/ALT: 64 U/L`,
  };
}

// ---- Drug safety check (deterministic, local rules + KB) ----
const COMMON_INTERACTIONS: Array<[string, string, string]> = [
  ['warfarin', 'aspirin', 'Major: additive bleeding risk — avoid unless specifically indicated; monitor INR closely'],
  ['warfarin', 'nsaid', 'Major: bleeding risk — avoid'],
  ['metformin', 'contrast', 'Hold metformin 48h around iodinated contrast in renal impairment'],
  ['ace inhibitor', 'potassium', 'Hyperkalemia risk — monitor K+'],
  ['ondansetron', 'tramadol', 'Serotonin syndrome + QT risk — caution'],
  ['clopidogrel', 'omeprazole', 'Reduced clopidogrel activation — prefer pantoprazole'],
  ['ciprofloxacin', 'theophylline', 'Major: elevated theophylline toxicity risk'],
  ['ciprofloxacin', 'amiodarone', 'Major: severe additive QT prolongation and Torsades de Pointes risk — avoid co-administration'],
  ['doxycycline', 'antacid', 'Reduced doxycycline absorption — space doses by 2-3 hours'],
  ['nsaid', 'paracetamol', 'Check total antipyretic dose; avoid NSAIDs in suspected dengue due to bleeding risk'],
];

export async function checkDrugSafety(meds: string[]): Promise<ToolResult> {
  const found: string[] = [];
  const lower = meds.map(m => m.toLowerCase());
  for (const [a, b, warn] of COMMON_INTERACTIONS) {
    if (lower.some(m => m.includes(a)) && lower.some(m => m.includes(b))) {
      found.push(`${a} + ${b}: ${warn}`);
    }
  }
  return {
    source: 'TOOL: drug-safety',
    content: found.length
      ? found.join('\n')
      : 'No major drug interactions detected in local high-alert formulary check. Verify renal/hepatic function before ordering.',
    data: {
      safe: found.length === 0,
      warnings: found,
    },
  };
}

export const TOOL_MANIFEST = [
  'getPatientById(uhid)',
  'listIPPatients()',
  'listOPPatients()',
  'getPatientMeds(uhid)',
  'getPatientLabs(uhid)',
  'checkDrugSafety(meds[])',
  'kbSearch(query)  // Paperclip knowledge base',
  'n8nTrigger(automation, payload)  // hospital automations via n8n',
];
