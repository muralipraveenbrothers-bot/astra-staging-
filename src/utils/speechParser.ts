import { surgeryTemplates } from '../data/surgeryTemplates';
import { anesthesiaTemplates } from '../data/anesthesiaTemplates';

const speechMap: Record<string, string> = {
  'tibia nailing': 'tibia_nailing',
  'tibia': 'tibia_nailing',
  'nailing': 'tibia_nailing',
  'imn': 'tibia_nailing',
  crif: 'crif',
  'closed reduction': 'crif',
  'k wire': 'crif',
  tkr: 'tkr',
  'total knee': 'tkr',
  'knee replacement': 'tkr',
  thr: 'thr',
  'total hip': 'thr',
  'hip replacement': 'thr',
  orif: 'orif_femur',
  'femur fracture': 'orif_femur',
  arthroscopy: 'arthroscopy',
  'knee scope': 'arthroscopy',
  'spine fusion': 'spine_fusion',
  'spinal fusion': 'spine_fusion',
  appendectomy: 'appendectomy',
  appendix: 'appendectomy',
  cholecystectomy: 'cholecystectomy',
  gallbladder: 'cholecystectomy',
  'lap chole': 'cholecystectomy',
  hernia: 'hernia_repair',
  'inguinal hernia': 'hernia_repair',
  thyroidectomy: 'thyroidectomy',
  thyroid: 'thyroidectomy',
  mastectomy: 'mastectomy',
  'breast removal': 'mastectomy',
  lscs: 'lscs',
  caesarean: 'lscs',
  'c section': 'lscs',
  cesarean: 'lscs',
  hysterectomy: 'hysterectomy',
  'uterus removal': 'hysterectomy',
  myomectomy: 'myomectomy',
  fibroid: 'myomectomy',
  tonsillectomy: 'tonsillectomy',
  tonsil: 'tonsillectomy',
  septoplasty: 'septoplasty',
  septum: 'septoplasty',
  mastoidectomy: 'mastoidectomy',
  mastoid: 'mastoidectomy',
  turp: 'turp',
  prostate: 'turp',
  pcnl: 'pcnl',
  'kidney stone': 'pcnl',
  ureteroscopy: 'ureteroscopy',
  ureter: 'ureteroscopy',
  whipple: 'whipple',
  pancreaticoduodenectomy: 'whipple',
  colectomy: 'colectomy',
  colon: 'colectomy',
  spinal: 'spinal',
  'spinal anesthesia': 'spinal',
  ga: 'ga',
  general: 'ga',
  'general anesthesia': 'ga',
  epidural: 'epidural',
  'epidural anesthesia': 'epidural',
  cse: 'cse',
  'combined spinal epidural': 'cse',
  local: 'la',
  'local anesthesia': 'la',
  sedation: 'la',
};

export interface SpeechParseResult {
  surgeryKey: string | null;
  anesthesiaKey: string | null;
  matchedPhrases: string[];
}

export function parseSpeechInput(raw: string): SpeechParseResult {
  const lower = raw.toLowerCase().trim();
  let surgeryKey: string | null = null;
  let anesthesiaKey: string | null = null;
  const matchedPhrases: string[] = [];

  for (const [phrase, key] of Object.entries(speechMap)) {
    if (lower.includes(phrase)) {
      if (surgeryTemplates[key] && !surgeryKey) {
        surgeryKey = key;
        matchedPhrases.push(surgeryTemplates[key].name);
      }
      if (anesthesiaTemplates[key] && !anesthesiaKey) {
        anesthesiaKey = key;
        matchedPhrases.push(anesthesiaTemplates[key].name);
      }
    }
  }

  return { surgeryKey, anesthesiaKey, matchedPhrases };
}
