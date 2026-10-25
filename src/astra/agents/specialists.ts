// Specialist sub-prompts injected by the orchestrator depending on intent.

export const SPECIALISTS: Record<string, string> = {
  diagnosis: `MODE: DIAGNOSIS ENGINE. Build ranked differentials with for/against evidence.
Mandatory blind-spot pass: list >=3 rare or must-not-miss diagnoses fitting this presentation
(region-aware: include tropical/infectious causes where relevant) and the single best test to exclude each.`,
  surgery: `MODE: SURGICAL PLANNER. Give: diagnosis-linked indication; classification/staging;
non-operative alternatives; stepwise operative plan (positioning, approach, key steps, implants/fixation
pathway per AO-style structure); anesthesia & DVT prophylaxis; contraindications; consent points with
quantified risks where known; post-op protocol; red-flag complications and their early signs.`,
  drug: `MODE: DRUG SAFETY. Full prescription review: dose per indication, renal/hepatic adjustment,
interactions (call checkDrugSafety), contraindications in this patient, monitoring plan, patient counseling.`,
  evidence: `MODE: EVIDENCE CHECK. State the current guideline position (name the body: WHO/CDC/ACC/AHA/ESC/
NICE/ICMR), the strength of evidence, and any recent practice-changing updates. If unsure of recency, say so.`,
};

export function routeIntent(message: string): keyof typeof SPECIALISTS | 'general' {
  const m = message.toLowerCase();
  if (/\b(surgery|operative|operat|appendectomy|cholecyst|fixation|fracture|resection|anastomos|pre.?op|post.?op|orif|dhs|pfn)\b/.test(m)) return 'surgery';
  if (/\b(dose|dosage|drug|tablet|injection|interaction|contraindicat|prescri|antibiotic|paracetamol|ceftriaxone|mg\b)/.test(m)) return 'drug';
  if (/\b(guideline|latest|evidence|trial|who|cdc|nice|recommendation|update|pubmed|cochrane)\b/.test(m)) return 'evidence';
  if (/\b(diagnos|differential|fever|pain|rash|swelling|breathless|chest|ddx|workup|mimic|blind.?spot)\b/.test(m)) return 'diagnosis';
  return 'general';
}
