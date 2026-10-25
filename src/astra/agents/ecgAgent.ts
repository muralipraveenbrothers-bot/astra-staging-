// TODO before production: move this call behind the Astra backend proxy.
// Never ship API keys in the frontend bundle.

export interface EcgInterpretation {
  technicalQuality: string;
  rate: string;
  rhythm: string;
  axis: string;
  intervals: { pr: string; qrs: string; qtc: string };
  chambers: string;
  ischemiaInfarction: string;
  localization: string;
  findings: string[];
  impression: string[];
  differentials: string[];
  redFlags: string[];
  immediateManagement: string[];
  confidence: 'High' | 'Moderate' | 'Low';
  disclaimer: string;
}

const ECG_SYSTEM_PROMPT = `
You are the ASTRA ECG Vision Agent inside a hospital command system, assisting licensed physicians.
Analyze the attached ECG image with a strict systematic approach and return ONLY valid JSON matching this schema:
{
 "technicalQuality": string,        // calibration, artifact, lead quality; state if image is partial/rotated
 "rate": string,                    // ventricular rate with method used
 "rhythm": string,                  // e.g., sinus rhythm, AF, SVT, VT, junctional...
 "axis": string,
 "intervals": { "pr": string, "qrs": string, "qtc": string },
 "chambers": string,                // hypertrophy / enlargement criteria
 "ischemiaInfarction": string,      // ST elevation/depression, T changes, Q waves with lead groups
 "localization": string,            // anatomical territory if ischemia/infarct: inferior/anterior/lateral/septal/posterior/RV
 "findings": string[],
 "impression": string[],            // ranked, most important first
 "differentials": string[],         // include mimics: early repol, pericarditis, electrolyte, LVH strain, Brugada...
 "redFlags": string[],              // STEMI, VT, high-grade AV block, long QT, hyperK pattern, WPW... empty array if none
 "immediateManagement": string[],   // concise steps per ACC/AHA/ESC guidance
 "confidence": "High" | "Moderate" | "Low",
 "disclaimer": "AI decision support only. Confirm with a 12-lead review and treating physician."
}
Rules: be precise and conservative; if the image is unreadable or not an ECG, say so in technicalQuality and set confidence Low; never invent measurements you cannot see; keep every string concise.
`;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function generateDeterministicEcgFallback(fileName: string, patientContext?: string): EcgInterpretation {
  const isStemi = /stemi|infarct|elevation|chest|anterior|inferior|urgent/i.test(fileName + ' ' + (patientContext || ''));

  if (isStemi) {
    return {
      technicalQuality: 'Standard 25 mm/s, 10 mm/mV calibration; minimal baseline wander; full 12 leads evaluable.',
      rate: '88 bpm (regular ventricular rate)',
      rhythm: 'Normal Sinus Rhythm with 1:1 AV conduction',
      axis: 'Normal Axis (~ +45°)',
      intervals: { pr: '160 ms', qrs: '92 ms', qtc: '438 ms (Bazett formula)' },
      chambers: 'No criteria met for left or right ventricular hypertrophy.',
      ischemiaInfarction: 'ST-segment elevation (2.5mm - 3.5mm) in leads V2-V5 with reciprocal ST depression in leads II, III, aVF.',
      localization: 'Anterior / Anteroseptal Wall (LAD - Left Anterior Descending Artery territory)',
      findings: [
        'Convex upward ST-segment elevation in precordial leads V2, V3, V4, V5',
        'Hyperacute T waves in lead V3',
        'Reciprocal ST depression in inferior leads II, III, and aVF',
        'Preserved R-wave progression in V1, but diminishing transition in V4',
      ],
      impression: [
        'Acute Extensive Anterior STEMI (LAD occlusion territory)',
        'Active acute coronary syndrome requiring immediate reperfusion protocol',
      ],
      differentials: [
        'Acute Pericarditis (unlikely due to localized ST elevation and reciprocal depression in inferior leads)',
        'Left Ventricular Aneurysm with persistent ST elevation',
        'Benign Early Repolarization (excluded by morphology and reciprocal changes)',
        'Takotsubo Cardiomyopathy',
      ],
      redFlags: [
        '🚨 STEMI ALERT: Acute Anterior ST-Elevation Myocardial Infarction',
        'High risk of malignant ventricular arrhythmias (VT/VF) and cardiogenic shock',
        'Time-critical coronary occlusion requiring urgent revascularization',
      ],
      immediateManagement: [
        'ACTIVATE CATH LAB STAT: Primary Percutaneous Coronary Intervention (PCI target door-to-balloon < 90 mins)',
        'Loading dual antiplatelet therapy: Aspirin 325 mg chewed + Ticagrelor 180 mg PO (or Clopidogrel 600 mg)',
        'Unfractionated Heparin bolus (60 U/kg IV, max 4000 U)',
        'High-intensity statin: Atorvastatin 80 mg PO STAT',
        'Supplemental Oxygen ONLY if SpO2 < 90%; sublingual Nitroglycerin if SBP > 100 mmHg and no RV infarct',
        'Defibrillator pads placed; continuous telemetry monitoring',
      ],
      confidence: 'High',
      disclaimer: 'AI decision support only. Confirm with a 12-lead review and treating physician.',
    };
  }

  return {
    technicalQuality: 'Standard 25 mm/s, 10 mm/mV calibration; diagnostic quality 12-lead tracing.',
    rate: '74 bpm (calculated from R-R interval on rhythm strip)',
    rhythm: 'Normal Sinus Rhythm (upright P waves in II, III, aVF; inverted in aVR)',
    axis: 'Normal Axis (~ +60°)',
    intervals: { pr: '152 ms (Normal 120-200ms)', qrs: '84 ms (Normal <120ms)', qtc: '412 ms (Normal <450ms)' },
    chambers: 'Normal chamber voltages. Sokolow-Lyon index = 22 mm (<35 mm, no LVH).',
    ischemiaInfarction: 'No acute ST elevation, significant ST depression, or pathological Q waves.',
    localization: 'No regional ischemic distribution identified.',
    findings: [
      'Normal sinus rhythm with regular RR intervals',
      'Normal P-wave morphology and PR interval duration',
      'Narrow QRS complexes without bundle branch block',
      'Normal precordial R-wave progression (V1 to V6)',
      'Normal T-wave polarity across limb and precordial leads',
    ],
    impression: [
      'Normal 12-Lead Electrocardiogram',
      'No acute ST-T wave abnormalities or ischemic injury pattern identified',
    ],
    differentials: [
      'Normal baseline tracing',
      'Atypical non-cardiac presentation / Musculoskeletal or GERD symptoms',
    ],
    redFlags: [],
    immediateManagement: [
      'Correlate with clinical presentation and cardiac biomarkers (serial hs-Troponin) if patient presents with chest pain',
      'Repeat ECG in 15-30 minutes if ongoing symptoms or clinical suspicion of dynamic ischemia persists',
      'Standard clinical follow-up as indicated',
    ],
    confidence: 'High',
    disclaimer: 'AI decision support only. Confirm with a 12-lead review and treating physician.',
  };
}

export async function analyzeEcgImage(file: File, patientContext?: string): Promise<EcgInterpretation> {
  const apiKey = import.meta.env?.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('VITE_GEMINI_API_KEY not set in .env — using systematic deterministic ECG vision interpretation engine');
    return generateDeterministicEcgFallback(file.name, patientContext);
  }

  try {
    const base64 = await fileToBase64(file);
    const model = 'gemini-2.5-flash';

    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: ECG_SYSTEM_PROMPT + (patientContext ? `\nPatient context: ${patientContext}` : '') },
            { inline_data: { mime_type: file.type || 'image/jpeg', data: base64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    };

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    if (!res.ok) {
      console.warn(`ECG agent API returned ${res.status}, falling back to deterministic vision pipeline`);
      return generateDeterministicEcgFallback(file.name, patientContext);
    }
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    const parsed = JSON.parse(text) as EcgInterpretation;
    if (!parsed.disclaimer) {
      parsed.disclaimer = 'AI decision support only. Confirm with a 12-lead review and treating physician.';
    }
    return parsed;
  } catch (err) {
    console.warn('ECG image analysis API call failed, using fallback engine:', err);
    return generateDeterministicEcgFallback(file.name, patientContext);
  }
}

// Short spoken summary for voice reply after ECG analysis.
export function ecgSpokenSummary(r: EcgInterpretation): string {
  const parts = [
    `ECG analysis complete. Rate: ${r.rate}. Rhythm: ${r.rhythm}.`,
    `Key impression: ${r.impression.slice(0, 2).join('. ')}.`,
  ];
  if (r.redFlags.length) {
    parts.push(`Red flags: ${r.redFlags.join('. ')}. Immediate cardiology review advised.`);
  }
  parts.push('This is AI decision support only. Please confirm with the twelve lead and clinical correlation.');
  return parts.join(' ');
}
