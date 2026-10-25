import React, { createContext, useContext, useState, useCallback } from 'react';

export interface PatientState {
  uhid: string;
  name: string;
  surgery: string;
  otNumber: string;
  surgeon: string;
  anesthesiologist: string;
  billingCleared: boolean;
  checklist: Record<string, boolean>;
  specialty: string | null;
  specialtyChecks: Record<string, boolean>;
}

export const specialtyInstruments: Record<string, string[]> = {
  ortho: [
    'Bone saw (oscillating)', 'Bone cement + gun', 'Acetabular reamers',
    'Femoral trials', 'Cement restrictor', 'Pulse lavage',
    'Tourniquet machine', 'C-arm draping kit', 'Power drill + bits',
    'Plate & screw set (Synthes)'
  ],
  general: [
    'Babcock forceps', 'Allis forceps', 'Hemostats (Kelly, Crile)',
    'Needle holders (Mayo-Hegar)', 'Retractors (Deaver, Morris)',
    'Bowel clamps (Doyen)', 'Ligature carriers', 'Suture scissors',
    'Diathermy pencil + pad', 'Laparotomy pack'
  ],
  gastro: [
    'Laparoscopic tower (0° + 30° scope)', 'Trocars (5mm, 10mm, 12mm)',
    'Graspers (Maryland, Johann)', 'Clip applier (Hem-o-lok)',
    'Stapler (endo-GIA)', 'Specimen retrieval bag',
    'Energy device (Harmonic / LigaSure)', 'Insufflator + CO₂ tank',
    'Veress needle', 'Liver retractor (Nathanson)'
  ],
  obg: [
    'Vaginal speculum (Graves, Pederson)', 'Tenaculum forceps',
    'Uterine sound', 'Curettes (sharp + blunt)',
    'Vacuum extractor (Kiwi / Bird)', 'Episiotomy scissors',
    'Suture set (vicryl, chromic)', 'D&C tray',
    'Fetal scalp electrode', 'Cord clamp applicator'
  ],
  ent: [
    'Operating microscope / endoscope', 'Tonsillectomy set (snare, dissector)',
    'Mastoid retractor', 'Myringotomy knife + suction tube',
    'Nasal speculum (Thudichum)', 'Antrum burr + handpiece',
    'Turbinate scissors', 'Suction coagulator',
    'Headlight + fiber optic cable', 'Ear speculum set (Siegle)'
  ],
  uro: [
    'Cystoscope (rigid / flexible)', 'Resectoscope (24Fr / 26Fr)',
    'Loop electrode (cutting + coag)', 'Irrigation pump + tubing',
    'Ureteral stent set (double-J)', 'Lithotripter (pneumatic / laser)',
    'Nephroscope', 'Stone basket (tipless)',
    'Dilator set (Amplatz)', 'Foley catheter tray (14Fr–20Fr)'
  ],
  onco: [
    'Electrocautery unit (Bovie)', 'Sentinel node tracer (gamma probe)',
    'Specimen margins kit', 'Frozen section tray',
    'Lymph node dissection set', 'Vascular clamps (Satinsky, bulldogs)',
    'Skin stapler + adhesive strips', 'Closed suction drain (Jackson-Pratt)',
    'Oncology sutures (PDS, Prolene)', 'Tissue sealant (Tisseel / Surgicel)'
  ],
};

const initialPatient: PatientState = {
  uhid: 'UHID-2026-08421',
  name: 'R. Venkatesh',
  surgery: 'Total Knee Replacement',
  otNumber: 'OT-02',
  surgeon: 'Dr. P. Reddy',
  anesthesiologist: 'Dr. K. Srinivas',
  billingCleared: false,
  checklist: {
    'l1-1': true,
    'l1-2': true,
    'l1-3': true,
    'l2-1': true,
    'l2-2': true,
    'l2-3': true,
    'l2-4': true,
    'l3-1': true,
    'l3-2': true,
    'l3-3': true,
    'l3-4': true,
    'l4-1': true,
    'l5-1': true,
    'l5-2': true,
    'l5-3': true,
    'l5-4': true,
    'l5-5': true,
    'l5-6': true,
    'l5-7': true,
    'l5-8': true,
    'l5-9': true,
    'l5-10': true,
    'l5-11': true,
    'l5-12': true,
    'l6-1': true,
    'l6-2': true,
    'l6-3': true,
    'l7-1': true,
    'l7-2': true,
    'l8-1': false,
    'l8-2': false,
    'l8-3': false,
    'l8-4': false,
  },
  specialty: 'ortho',
  specialtyChecks: {
    'spec-0': true,
    'spec-1': true,
    'spec-2': true,
    'spec-3': true,
    'spec-4': true,
    'spec-5': true,
    'spec-6': true,
    'spec-7': true,
    'spec-8': true,
    'spec-9': true,
  },
};

interface PatientContextType {
  patient: PatientState;
  toggleCheck: (key: string) => void;
  setSpecialty: (spec: string) => void;
  toggleSpecCheck: (key: string) => void;
  grantBillingClearance: () => void;
  getReadinessPercent: () => number;
  getMissingItems: () => string[];
}

const PatientContext = createContext<PatientContextType | null>(null);

export const PatientProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [patient, setPatient] = useState<PatientState>(initialPatient);

  const toggleCheck = useCallback((key: string) => {
    setPatient((prev) => ({
      ...prev,
      checklist: { ...prev.checklist, [key]: !prev.checklist[key] },
    }));
  }, []);

  const setSpecialty = useCallback((spec: string) => {
    setPatient((prev) => ({ ...prev, specialty: spec, specialtyChecks: {} }));
  }, []);

  const toggleSpecCheck = useCallback((key: string) => {
    setPatient((prev) => ({
      ...prev,
      specialtyChecks: { ...prev.specialtyChecks, [key]: !prev.specialtyChecks[key] },
    }));
  }, []);

  const grantBillingClearance = useCallback(() => {
    setPatient((prev) => ({ ...prev, billingCleared: true }));
  }, []);

  const getReadinessPercent = useCallback(() => {
    const layerCounts = [3, 4, 4, 1, 12, 3, 2, 4];
    let total = layerCounts.reduce((a, b) => a + b, 0);
    let done = 0;
    for (let layer = 1; layer <= 8; layer++) {
      for (let i = 1; i <= layerCounts[layer - 1]; i++) {
        if (patient.checklist[`l${layer}-${i}`]) done++;
      }
    }
    if (patient.specialty) {
      const specList = specialtyInstruments[patient.specialty] || [];
      total += specList.length;
      specList.forEach((_, idx) => {
        if (patient.specialtyChecks[`spec-${idx}`]) done++;
      });
    }
    return total > 0 ? Math.round((done / total) * 100) : 0;
  }, [patient]);

  const getMissingItems = useCallback(() => {
    const missing: string[] = [];
    if (!patient.checklist['l2-2']) missing.push('PAC clearance');
    if (!patient.checklist['l2-3']) missing.push('Blood bank cross-match');
    if (!patient.checklist['l2-4']) missing.push('Financial clearance');
    if (!patient.checklist['l6-1']) missing.push('Digital consent signature');
    if (!patient.checklist['l5-11'] || !patient.checklist['l5-12']) missing.push('Emergency reversal drugs');
    if (!patient.checklist['l1-2']) missing.push('O₂ pipeline pressure check');
    return missing;
  }, [patient]);

  return (
    <PatientContext.Provider
      value={{ patient, toggleCheck, setSpecialty, toggleSpecCheck, grantBillingClearance, getReadinessPercent, getMissingItems }}
    >
      {children}
    </PatientContext.Provider>
  );
};

export const usePatient = () => {
  const ctx = useContext(PatientContext);
  if (!ctx) throw new Error('usePatient must be used within PatientProvider');
  return ctx;
};
