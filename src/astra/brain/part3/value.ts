/**
 * Stay and value. No day count and no rupee amount without a verified source.
 * The aim is the best outcome per resource used.
 */

export const VALUE_PRINCIPLE = "BEST OUTCOME PER RESOURCE USED";

export interface StayEstimate {
  minimumPlausible: string;
  expectedRange: string;
  longerStayScenario: string;
  dayCountShown: false;
  historicalSource: string;
}

export function expectedStay(input: { icu?: boolean; infection?: boolean; mobility?: string; complications?: string }): StayEstimate {
  const longer: string[] = [];
  if (input.icu) longer.push("ICU requirement");
  if (input.infection) longer.push("infection");
  if (input.mobility && /bed|poor|unable/i.test(input.mobility)) longer.push("limited mobility");
  if (input.complications?.trim()) longer.push(input.complications.trim());
  return {
    minimumPlausible: "The short course assumes no complication and a ready discharge path. A day count is not shown.",
    expectedRange: "The expected course is a range. No single day number is shown.",
    longerStayScenario: longer.length ? `Longer when ${longer.join(", ")} is present.` : "No longer-stay factor was supplied.",
    dayCountShown: false,
    historicalSource: "No sufficient clean PM Brothers historical stay data is loaded.",
  };
}

export const COST_LINES = [
  "bed", "nursing", "ICU", "OT", "surgeon", "anesthesia", "implant", "consumables",
  "medication", "laboratory", "radiology", "blood products", "physiotherapy", "documentation", "other",
] as const;

export interface CostBand {
  lines: Record<string, "not estimated">;
  low: null;
  expected: null;
  high: null;
  assumptions: string[];
  principle: typeof VALUE_PRINCIPLE;
}

export function costEstimate(): CostBand {
  const lines = Object.fromEntries(COST_LINES.map((line) => [line, "not estimated" as const]));
  return {
    lines,
    low: null,
    expected: null,
    high: null,
    assumptions: ["No verified hospital tariff, package, quotation, insurance rate, or historical bill was supplied."],
    principle: VALUE_PRINCIPLE,
  };
}

export type PricePlace = "Kothagudem" | "Khammam" | "Hyderabad";

export interface VerifiedPrice {
  place: PricePlace;
  item: string;
  amount: number;
  source: string;
  date: string;
  included: string[];
  excluded: string[];
  implantDifferences: string;
  roomCategory: string;
  surgeonAnesthesiaIncluded: boolean;
  confidence: "verified";
}

export function compareRegions(records: Array<Partial<VerifiedPrice> & { place?: string; item?: string }>, item: string): VerifiedPrice[] {
  return records.filter((record): record is VerifiedPrice => {
    return record.item === item
      && (record.place === "Kothagudem" || record.place === "Khammam" || record.place === "Hyderabad")
      && typeof record.amount === "number"
      && Boolean(record.source?.trim())
      && Boolean(record.date?.trim())
      && Array.isArray(record.included)
      && Array.isArray(record.excluded)
      && Boolean(record.implantDifferences?.trim())
      && Boolean(record.roomCategory?.trim())
      && typeof record.surgeonAnesthesiaIncluded === "boolean"
      && record.confidence === "verified";
  });
}

const ALLOWED_SAVINGS = [
  "duplicate tests",
  "unnecessary repeat imaging",
  "avoidable prolonged admission",
  "avoidable premium-brand substitution when an equivalent formulary option is appropriate",
  "unnecessary prolonged prophylactic antibiotics",
  "duplicated medications",
  "inefficient OT scheduling",
  "unused consumables",
  "avoidable delays",
  "late discharge preparation",
] as const;

const FORBIDDEN = [
  "skipping clinically required monitoring",
  "inferior implant solely because cheaper",
  "premature discharge",
  "inadequate antibiotics",
  "unsafe anesthesia",
  "reduced sterility",
];

export function safeSavings(text: string): { found: string[]; refused: string[]; principle: typeof VALUE_PRINCIPLE } {
  const found: string[] = [];
  if (/duplicate (test|lab)/i.test(text)) found.push(ALLOWED_SAVINGS[0]);
  if (/repeat (ct|mri|x-?ray|imaging|usg)/i.test(text)) found.push(ALLOWED_SAVINGS[1]);
  if (/prolonged admission|still admitted after medically ready/i.test(text)) found.push(ALLOWED_SAVINGS[2]);
  if (/brand substitution|premium brand/i.test(text)) found.push(ALLOWED_SAVINGS[3]);
  if (/prophylaxis.{0,80}(continue|day [3-9]|week)/i.test(text)) found.push(ALLOWED_SAVINGS[4]);
  if (/duplicate medication|same drug twice/i.test(text)) found.push(ALLOWED_SAVINGS[5]);
  if (/ot (list|schedule).{0,40}gap|idle theatre/i.test(text)) found.push(ALLOWED_SAVINGS[6]);
  if (/unused consumable/i.test(text)) found.push(ALLOWED_SAVINGS[7]);
  if (/delay in (report|transport|pharmacy)/i.test(text)) found.push(ALLOWED_SAVINGS[8]);
  if (/discharge (summary|medicines|transport) not prepared/i.test(text)) found.push(ALLOWED_SAVINGS[9]);
  return { found, refused: FORBIDDEN, principle: VALUE_PRINCIPLE };
}
