/** R5-04 medication draft. Severity red is only a lethal pair or a physiologically impossible dose. */

export type FindingSeverity = "info" | "orange" | "red";

export interface MedicationFinding {
  severity: FindingSeverity;
  ruleId: string;
  message: string;
  dataUsed: Record<string, unknown>;
  overrideAllowed: boolean;
  /** Shown unchecked. The engine never adds this drug to the draft. */
  suggestionOnly?: string;
}

export interface DraftMedicationItem {
  id: string;
  drug: string;
  dose: string;
  doseMg?: number;
  route: string;
  frequency: string;
  duration: string;
  source: "typed" | "ai-suggested";
  selected: boolean;
}

export interface PatientMedicationContext {
  patientId: string;
  allergies: string[];
  currentMedications: string[];
  egfr?: number | null;
  creatinineMgDl?: number | null;
  alt?: number | null;
  ast?: number | null;
}

export interface DrugClassEntry {
  drugNames: string[];
  classes: string[];
}

export interface AllergyRule {
  id: string;
  allergen: string;
  drugNames: string[];
  alsoMatchClass?: string;
  severity: FindingSeverity;
  message: string;
  suggestionOnly?: string;
  overrideAllowed: boolean;
}

export interface RenalHepaticRule {
  id: string;
  drugNames: string[];
  egfrBelow?: number | null;
  creatinineMgDlAtOrAbove?: number | null;
  altAbove?: number | null;
  astAbove?: number | null;
  severity: FindingSeverity;
  message: string;
  overrideAllowed: boolean;
  reviewNote?: string;
}

export interface InteractionRule {
  id: string;
  pair: [string, string] | string[];
  severity: FindingSeverity;
  message: string;
  overrideAllowed: boolean;
}

export interface ClassInteractionRule {
  id: string;
  patientDrug: string;
  draftClass: string;
  severity: FindingSeverity;
  message: string;
  overrideAllowed: boolean;
}

export interface DoseOutlierRule {
  id: string;
  drugNames: string[];
  orangeAtOrAboveSingleMg?: number | null;
  redAboveSingleMg?: number | null;
  maxDailyMg?: number | null;
  orangeMessage: string;
  redMessage?: string;
  overrideAllowed: boolean;
  reviewNote?: string;
}

export interface LethalPairRule {
  id: string;
  pair: string[];
  severity: "red";
  message: string;
  overrideAllowed: boolean;
  enabled?: boolean;
}

export interface ImpossibleDoseRule {
  id: string;
  severity: "red";
  whenSingleDoseMgAtOrBelow: number;
  overrideAllowed: boolean;
  message: string;
}

export interface MedicationRules {
  schemaVersion: number;
  banner: string;
  importFormat: Record<string, unknown>;
  drugClasses: DrugClassEntry[];
  allergy: AllergyRule[];
  renalHepatic: RenalHepaticRule[];
  interactions: InteractionRule[];
  classInteractions: ClassInteractionRule[];
  doseOutliers: DoseOutlierRule[];
  lethalPairs: LethalPairRule[];
  impossibleDose: ImpossibleDoseRule;
}

export interface StockItem {
  id: string;
  name: string;
  salt: string;
  stock: number;
  unitPrice: number;
  mrp?: number;
  hospitalMargin?: number;
}

export interface StockSuggestion {
  id: string;
  drug: string;
  molecule: string;
  checked: false;
  patientPrice: number;
}

export interface StockNotice {
  outOfStock: boolean;
  note: "out of stock";
  tone: "red";
  blocksConfirm: false;
  suggestion: StockSuggestion | null;
}

export interface BuyAlert {
  id: string;
  drug: string;
  molecule: string;
  createdAt: string;
  forRole: "pharmacist";
  status: "open";
}

export type MedicationAudience = "doctor" | "billing" | "pharmacy" | "admin";

export interface RankedSuggestion {
  id: string;
  label: string;
  findings: MedicationFinding[];
  inStock: boolean;
  patientPrice: number;
  hospitalMargin?: number;
}

export interface MedicationDraft {
  id: string;
  patientId: string;
  patientName: string;
  items: DraftMedicationItem[];
  allergiesText: string;
  currentMedicationsText: string;
  egfrText: string;
  creatinineText: string;
  altText: string;
  astText: string;
  status: "editing" | "confirmed";
  approvalDecisionId?: string;
  confirmedAt?: string;
  confirmedBy?: string;
  event?: string;
}

export interface OverrideRecord {
  id: string;
  patientId?: string;
  itemId: string;
  ruleId: string;
  doctorId: string;
  reason: string;
  drug: string;
  dose: string;
  at: string;
}

export interface ApprovalLink {
  decisionId: string;
  approved: boolean;
  patientId: string;
  kind: string;
}
