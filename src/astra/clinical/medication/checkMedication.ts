/**
 * Deterministic medication checks. No model and no network.
 * The rules file must keep its doctor/pharmacist review banner.
 */
import rawRules from "./medicationSafetyRules.json";
import type {
  AllergyRule,
  ClassInteractionRule,
  DoseOutlierRule,
  DraftMedicationItem,
  DrugClassEntry,
  FindingSeverity,
  ImpossibleDoseRule,
  InteractionRule,
  LethalPairRule,
  MedicationFinding,
  MedicationRules,
  PatientMedicationContext,
  RenalHepaticRule,
} from "./types";

export const RULES_REVIEW_BANNER = "REVIEW REQUIRED BY DOCTOR/PHARMACIST BEFORE CLINICAL USE";

const SEVERITIES: FindingSeverity[] = ["info", "orange", "red"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strings(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) return null;
  return value.map((item) => item.trim());
}

function severityOf(value: unknown): FindingSeverity | null {
  return typeof value === "string" && (SEVERITIES as string[]).includes(value) ? (value as FindingSeverity) : null;
}

function optionalNumber(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return value as null | undefined;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function requireBanner(value: unknown): string {
  if (typeof value !== "string" || !value.includes(RULES_REVIEW_BANNER)) {
    throw new Error("Medication rules file is missing the clinical review warning.");
  }
  return value;
}

function parseAllergy(value: unknown): AllergyRule {
  if (!isRecord(value)) throw new Error("Allergy rule must be an object.");
  const severity = severityOf(value.severity);
  const drugNames = strings(value.drugNames);
  if (typeof value.id !== "string" || typeof value.allergen !== "string" || !drugNames || !severity || typeof value.message !== "string") {
    throw new Error("Allergy rule is missing id, allergen, drugNames, severity, or message.");
  }
  return {
    id: value.id,
    allergen: value.allergen,
    drugNames,
    alsoMatchClass: typeof value.alsoMatchClass === "string" ? value.alsoMatchClass : undefined,
    severity,
    message: value.message,
    suggestionOnly: typeof value.suggestionOnly === "string" ? value.suggestionOnly : undefined,
    overrideAllowed: value.overrideAllowed === true,
  };
}

function parseRenal(value: unknown): RenalHepaticRule {
  if (!isRecord(value)) throw new Error("Renal/hepatic rule must be an object.");
  const severity = severityOf(value.severity);
  const drugNames = strings(value.drugNames);
  if (typeof value.id !== "string" || !drugNames || !severity || typeof value.message !== "string") {
    throw new Error("Renal/hepatic rule is missing id, drugNames, severity, or message.");
  }
  return {
    id: value.id,
    drugNames,
    egfrBelow: optionalNumber(value.egfrBelow) ?? null,
    creatinineMgDlAtOrAbove: optionalNumber(value.creatinineMgDlAtOrAbove) ?? null,
    altAbove: optionalNumber(value.altAbove) ?? null,
    astAbove: optionalNumber(value.astAbove) ?? null,
    severity,
    message: value.message,
    overrideAllowed: value.overrideAllowed === true,
    reviewNote: typeof value.reviewNote === "string" ? value.reviewNote : undefined,
  };
}

function parseInteraction(value: unknown): InteractionRule {
  if (!isRecord(value)) throw new Error("Interaction rule must be an object.");
  const pair = strings(value.pair);
  const severity = severityOf(value.severity);
  if (typeof value.id !== "string" || !pair || pair.length < 2 || !severity || typeof value.message !== "string") {
    throw new Error("Interaction rule is missing id, pair, severity, or message.");
  }
  return { id: value.id, pair, severity, message: value.message, overrideAllowed: value.overrideAllowed === true };
}

function parseClassInteraction(value: unknown): ClassInteractionRule {
  if (!isRecord(value)) throw new Error("Class interaction rule must be an object.");
  const severity = severityOf(value.severity);
  if (typeof value.id !== "string" || typeof value.patientDrug !== "string" || typeof value.draftClass !== "string" || !severity || typeof value.message !== "string") {
    throw new Error("Class interaction rule is missing id, patientDrug, draftClass, severity, or message.");
  }
  return {
    id: value.id,
    patientDrug: value.patientDrug,
    draftClass: value.draftClass,
    severity,
    message: value.message,
    overrideAllowed: value.overrideAllowed === true,
  };
}

function parseDose(value: unknown): DoseOutlierRule {
  if (!isRecord(value)) throw new Error("Dose rule must be an object.");
  const drugNames = strings(value.drugNames);
  if (typeof value.id !== "string" || !drugNames || typeof value.orangeMessage !== "string") {
    throw new Error("Dose rule is missing id, drugNames, or orangeMessage.");
  }
  return {
    id: value.id,
    drugNames,
    orangeAtOrAboveSingleMg: optionalNumber(value.orangeAtOrAboveSingleMg) ?? null,
    redAboveSingleMg: optionalNumber(value.redAboveSingleMg) ?? null,
    maxDailyMg: optionalNumber(value.maxDailyMg) ?? null,
    orangeMessage: value.orangeMessage,
    redMessage: typeof value.redMessage === "string" ? value.redMessage : undefined,
    overrideAllowed: value.overrideAllowed === true,
    reviewNote: typeof value.reviewNote === "string" ? value.reviewNote : undefined,
  };
}

function parseLethal(value: unknown): LethalPairRule {
  if (!isRecord(value)) throw new Error("Lethal pair rule must be an object.");
  const pair = strings(value.pair);
  if (typeof value.id !== "string" || !pair || pair.length < 2 || value.severity !== "red" || typeof value.message !== "string") {
    throw new Error("Lethal pair rules must be severity red and name both drugs.");
  }
  return {
    id: value.id,
    pair,
    severity: "red",
    message: value.message,
    overrideAllowed: value.overrideAllowed === true,
    enabled: value.enabled !== false,
  };
}

function parseClasses(value: unknown): DrugClassEntry {
  if (!isRecord(value)) throw new Error("Drug class entry must be an object.");
  const drugNames = strings(value.drugNames);
  const classes = strings(value.classes);
  if (!drugNames || !classes) throw new Error("Drug class entry needs drugNames and classes.");
  return { drugNames, classes };
}

function parseImpossible(value: unknown): ImpossibleDoseRule {
  if (!isRecord(value) || value.severity !== "red" || typeof value.id !== "string" || typeof value.message !== "string") {
    throw new Error("Impossible-dose rule must be severity red.");
  }
  const threshold = optionalNumber(value.whenSingleDoseMgAtOrBelow);
  if (typeof threshold !== "number") throw new Error("Impossible-dose rule needs a numeric threshold.");
  return {
    id: value.id,
    severity: "red",
    whenSingleDoseMgAtOrBelow: threshold,
    overrideAllowed: value.overrideAllowed === true,
    message: value.message,
  };
}

export function parseMedicationRules(value: unknown): MedicationRules {
  if (!isRecord(value)) throw new Error("Medication rules must be an object.");
  const banner = requireBanner(value.banner);
  if (!Array.isArray(value.allergy) || !Array.isArray(value.renalHepatic) || !Array.isArray(value.interactions)) {
    throw new Error("Medication rules are missing allergy, renal, or interaction lists.");
  }
  return {
    schemaVersion: typeof value.schemaVersion === "number" ? value.schemaVersion : 1,
    banner,
    importFormat: isRecord(value.importFormat) ? value.importFormat : {},
    drugClasses: Array.isArray(value.drugClasses) ? value.drugClasses.map(parseClasses) : [],
    allergy: value.allergy.map(parseAllergy),
    renalHepatic: value.renalHepatic.map(parseRenal),
    interactions: value.interactions.map(parseInteraction),
    classInteractions: Array.isArray(value.classInteractions) ? value.classInteractions.map(parseClassInteraction) : [],
    doseOutliers: Array.isArray(value.doseOutliers) ? value.doseOutliers.map(parseDose) : [],
    lethalPairs: Array.isArray(value.lethalPairs) ? value.lethalPairs.map(parseLethal) : [],
    impossibleDose: parseImpossible(value.impossibleDose),
  };
}

export const defaultMedicationRules = parseMedicationRules(rawRules);

function cloneRules(rules: MedicationRules): MedicationRules {
  return parseMedicationRules(JSON.parse(JSON.stringify(rules)) as unknown);
}

/** Doctor/pharmacist extension. The review banner cannot be removed. */
export function importMedicationRules(extension: unknown, base: MedicationRules = defaultMedicationRules): MedicationRules {
  if (!isRecord(extension)) throw new Error("Import must be an object of rule lists.");
  if (extension.banner !== undefined && (typeof extension.banner !== "string" || !extension.banner.includes(RULES_REVIEW_BANNER))) {
    throw new Error("Import cannot remove the clinical review warning.");
  }
  const next = cloneRules(base);
  const append = <T extends { id: string }>(current: T[], incoming: unknown, parse: (value: unknown) => T, label: string) => {
    if (incoming === undefined) return;
    if (!Array.isArray(incoming)) throw new Error(`${label} import must be a list.`);
    for (const row of incoming.map(parse)) {
      if (current.some((item) => item.id === row.id)) throw new Error(`Duplicate rule id ${row.id}.`);
      current.push(row);
    }
  };
  append(next.allergy, extension.allergy, parseAllergy, "Allergy");
  append(next.renalHepatic, extension.renalHepatic, parseRenal, "Renal/hepatic");
  append(next.interactions, extension.interactions, parseInteraction, "Interaction");
  append(next.classInteractions, extension.classInteractions, parseClassInteraction, "Class interaction");
  append(next.doseOutliers, extension.doseOutliers, parseDose, "Dose");
  append(next.lethalPairs, extension.lethalPairs, parseLethal, "Lethal pair");
  if (extension.drugClasses !== undefined) {
    if (!Array.isArray(extension.drugClasses)) throw new Error("Drug class import must be a list.");
    next.drugClasses.push(...extension.drugClasses.map(parseClasses));
  }
  return next;
}

export function normaliseDrugName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function containsDrugPhrase(haystack: string, needle: string): boolean {
  const phrase = normaliseDrugName(needle);
  if (phrase.length < 4) return false;
  return ` ${normaliseDrugName(haystack)} `.includes(` ${phrase} `);
}

export function matchesAnyDrug(input: string, names: readonly string[]): boolean {
  return names.some((name) => containsDrugPhrase(input, name));
}

const MASS_UNIT = /(\d+(?:\.\d+)?)\s*(mg|g|mcg|\u00b5g)\b/;
const COUNT_OR_VOLUME_UNIT = /\d\s*(ml|l|iu|units?|u|tabs?|tablets?|caps?|capsules?|drops?|puffs?|sachets?|patch(es)?|tsp|tbsp|spoons?|vials?|amps?|ampoules?)\b|\d\s*%/;

/** True when a dose has a number but no unit at all (e.g. "500"). "1 tab" or "5 ml" are not flagged. */
export function doseHasNumberWithoutUnit(dose: string, doseMg?: number): boolean {
  if (typeof doseMg === "number" && Number.isFinite(doseMg)) return false;
  const text = dose.trim().toLowerCase();
  if (!text || !/\d/.test(text)) return false;
  return !MASS_UNIT.test(text) && !COUNT_OR_VOLUME_UNIT.test(text);
}

export function parseSingleDoseMg(dose: string, doseMg?: number): number | null {
  if (typeof doseMg === "number" && Number.isFinite(doseMg)) return doseMg;
  const match = dose.trim().toLowerCase().match(/(\d+(?:\.\d+)?)\s*(mg|g|mcg|µg)\b/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  if (match[2] === "g") return amount * 1000;
  if (match[2] === "mcg" || match[2] === "µg") return amount / 1000;
  return amount;
}

function dosesPerDay(frequency: string | undefined): number | null {
  const text = normaliseDrugName(frequency ?? "");
  if (!text) return null;
  if (/\b(qid|qds|four times)\b/.test(text)) return 4;
  if (/\b(tid|tds|three times)\b/.test(text)) return 3;
  if (/\b(bid|bd|twice|two times)\b/.test(text)) return 2;
  if (/\b(od|qd|daily|once|hs|nocte)\b/.test(text)) return 1;
  return null;
}

function classesFor(drug: string, rules: MedicationRules): string[] {
  const found = new Set<string>();
  for (const row of rules.drugClasses) {
    if (matchesAnyDrug(drug, row.drugNames)) {
      row.classes.forEach((name) => found.add(name.toLowerCase()));
    }
  }
  return [...found];
}

function listHasDrug(values: readonly string[], drug: string): boolean {
  return values.some((value) => containsDrugPhrase(value, drug));
}

function finding(
  ruleId: string,
  severity: FindingSeverity,
  message: string,
  dataUsed: Record<string, unknown>,
  overrideAllowed: boolean,
  suggestionOnly?: string,
): MedicationFinding {
  return { severity, ruleId, message, dataUsed, overrideAllowed, suggestionOnly };
}

/**
 * Pure check. `patientContext.currentMedications` should already include
 * the other lines of this draft when those lines can interact.
 */
export function checkMedication(
  draftItem: Pick<DraftMedicationItem, "drug" | "dose"> & Partial<Pick<DraftMedicationItem, "doseMg" | "frequency">>,
  patientContext: PatientMedicationContext,
  rules: MedicationRules = defaultMedicationRules,
): MedicationFinding[] {
  requireBanner(rules.banner);
  const drug = draftItem.drug?.trim() ?? "";
  if (!drug) return [];
  const findings: MedicationFinding[] = [];
  const allergies = patientContext.allergies ?? [];
  const current = patientContext.currentMedications ?? [];
  const drugClasses = classesFor(drug, rules);

  for (const rule of rules.allergy) {
    const allergic = allergies.some((entry) => containsDrugPhrase(entry, rule.allergen) || normaliseDrugName(entry) === normaliseDrugName(rule.allergen));
    const named = matchesAnyDrug(drug, rule.drugNames);
    const byClass = !!rule.alsoMatchClass && drugClasses.includes(rule.alsoMatchClass.toLowerCase());
    if (!allergic || (!named && !byClass)) continue;
    findings.push(finding(rule.id, rule.severity, rule.message, {
      allergen: rule.allergen,
      recordedAllergies: allergies,
      drug,
    }, rule.overrideAllowed, rule.suggestionOnly));
  }

  for (const rule of rules.renalHepatic) {
    if (!matchesAnyDrug(drug, rule.drugNames)) continue;
    if (typeof rule.egfrBelow === "number" && typeof patientContext.egfr === "number" && patientContext.egfr < rule.egfrBelow) {
      findings.push(finding(rule.id, rule.severity, rule.message, { drug, egfr: patientContext.egfr, egfrBelow: rule.egfrBelow }, rule.overrideAllowed));
    }
    if (typeof rule.creatinineMgDlAtOrAbove === "number" && typeof patientContext.creatinineMgDl === "number" && patientContext.creatinineMgDl >= rule.creatinineMgDlAtOrAbove) {
      findings.push(finding(rule.id, rule.severity, rule.message, {
        drug,
        creatinineMgDl: patientContext.creatinineMgDl,
        creatinineMgDlAtOrAbove: rule.creatinineMgDlAtOrAbove,
      }, rule.overrideAllowed));
    }
    if (typeof rule.altAbove === "number" && typeof patientContext.alt === "number" && patientContext.alt > rule.altAbove) {
      findings.push(finding(rule.id, rule.severity, rule.message, { drug, alt: patientContext.alt, altAbove: rule.altAbove }, rule.overrideAllowed));
    }
    if (typeof rule.astAbove === "number" && typeof patientContext.ast === "number" && patientContext.ast > rule.astAbove) {
      findings.push(finding(rule.id, rule.severity, rule.message, { drug, ast: patientContext.ast, astAbove: rule.astAbove }, rule.overrideAllowed));
    }
  }

  for (const rule of rules.interactions) {
    const [left, right] = rule.pair;
    if (!left || !right) continue;
    const draftIsLeft = containsDrugPhrase(drug, left);
    const draftIsRight = containsDrugPhrase(drug, right);
    const othersHaveLeft = listHasDrug(current, left);
    const othersHaveRight = listHasDrug(current, right);
    const hit = (draftIsLeft && othersHaveRight) || (draftIsRight && othersHaveLeft);
    if (!hit) continue;
    findings.push(finding(rule.id, rule.severity, rule.message, {
      drug,
      pair: rule.pair,
      currentMedications: current,
    }, rule.overrideAllowed));
  }

  for (const rule of rules.classInteractions) {
    const draftHasClass = drugClasses.includes(rule.draftClass.toLowerCase());
    const patientHasDrug = listHasDrug(current, rule.patientDrug) || containsDrugPhrase(drug, rule.patientDrug);
    const companionHasClass = current.some((entry) => classesFor(entry, rules).includes(rule.draftClass.toLowerCase()));
    const draftIsPatientDrug = containsDrugPhrase(drug, rule.patientDrug);
    const hit = (draftHasClass && patientHasDrug && !draftIsPatientDrug) || (draftIsPatientDrug && companionHasClass);
    if (!hit) continue;
    findings.push(finding(rule.id, rule.severity, rule.message, {
      drug,
      patientDrug: rule.patientDrug,
      draftClass: rule.draftClass,
      currentMedications: current,
    }, rule.overrideAllowed));
  }

  for (const rule of rules.lethalPairs) {
    if (rule.enabled === false) continue;
    const [left, right] = rule.pair;
    if (!left || !right) continue;
    const draftIsLeft = containsDrugPhrase(drug, left);
    const draftIsRight = containsDrugPhrase(drug, right);
    const hit = (draftIsLeft && listHasDrug(current, right)) || (draftIsRight && listHasDrug(current, left));
    if (!hit) continue;
    findings.push(finding(rule.id, "red", rule.message, { drug, pair: rule.pair, currentMedications: current }, rule.overrideAllowed));
  }

  const singleMg = parseSingleDoseMg(draftItem.dose ?? "", draftItem.doseMg);
  if (doseHasNumberWithoutUnit(draftItem.dose ?? "", draftItem.doseMg)) {
    findings.push(finding("dose.unit-missing", "orange", "Unit missing - confirm dose. Dose checks could not run until a unit (mg, g, mcg) is entered.", {
      drug,
      dose: draftItem.dose ?? "",
    }, false));
  }
  if (singleMg !== null && singleMg <= rules.impossibleDose.whenSingleDoseMgAtOrBelow) {
    findings.push(finding(rules.impossibleDose.id, "red", rules.impossibleDose.message, {
      drug,
      singleDoseMg: singleMg,
    }, rules.impossibleDose.overrideAllowed));
  }

  for (const rule of rules.doseOutliers) {
    if (!matchesAnyDrug(drug, rule.drugNames) || singleMg === null) continue;
    if (typeof rule.redAboveSingleMg === "number" && singleMg > rule.redAboveSingleMg) {
      findings.push(finding(rule.id, "red", rule.redMessage || rule.orangeMessage, {
        drug,
        singleDoseMg: singleMg,
        redAboveSingleMg: rule.redAboveSingleMg,
      }, rule.overrideAllowed));
      continue;
    }
    const perDay = dosesPerDay(draftItem.frequency);
    const dailyMg = perDay && typeof rule.maxDailyMg === "number" ? singleMg * perDay : null;
    if (typeof rule.orangeAtOrAboveSingleMg === "number" && singleMg >= rule.orangeAtOrAboveSingleMg) {
      findings.push(finding(rule.id, "orange", rule.orangeMessage, {
        drug,
        singleDoseMg: singleMg,
        orangeAtOrAboveSingleMg: rule.orangeAtOrAboveSingleMg,
      }, rule.overrideAllowed));
    } else if (dailyMg !== null && typeof rule.maxDailyMg === "number" && dailyMg > rule.maxDailyMg) {
      findings.push(finding(rule.id, "orange", rule.orangeMessage, {
        drug,
        singleDoseMg: singleMg,
        dailyDoseMg: dailyMg,
        maxDailyMg: rule.maxDailyMg,
      }, rule.overrideAllowed));
    }
  }

  return findings;
}

export function findingsForItems(
  items: DraftMedicationItem[],
  patientContext: PatientMedicationContext,
  rules: MedicationRules = defaultMedicationRules,
): Record<string, MedicationFinding[]> {
  const out: Record<string, MedicationFinding[]> = {};
  for (const item of items) {
    const companions = items.filter((other) => other.id !== item.id && other.drug.trim()).map((other) => other.drug);
    out[item.id] = checkMedication(item, {
      ...patientContext,
      currentMedications: [...patientContext.currentMedications, ...companions],
    }, rules);
  }
  return out;
}
