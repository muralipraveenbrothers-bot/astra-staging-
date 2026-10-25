import { containsDrugPhrase, normaliseDrugName } from "./checkMedication";
import type { BuyAlert, StockItem, StockNotice, StockSuggestion } from "./types";

const BUY_ALERT_KEY = "astra.medicationBuyAlerts.v1";
const buyAlerts: BuyAlert[] = [];
let buyAlertsHydrated = false;

function readBuyAlerts(): void {
  if (buyAlertsHydrated) return;
  buyAlertsHydrated = true;
  try {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(BUY_ALERT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) buyAlerts.push(...parsed);
  } catch {
    // Keep the in-memory list.
  }
}

function writeBuyAlerts(): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(BUY_ALERT_KEY, JSON.stringify(buyAlerts));
  } catch {
    // The in-memory alert still stands.
  }
}

export function moleculeKey(value: string): string {
  return normaliseDrugName(value)
    .replace(/\b\d+(?:\.\d+)?\s*(mg|g|ml|mcg|iu)\b/g, " ")
    .replace(/\b\d+(?:\.\d+)?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function toStockItems(rows: Array<{ id: string; name: string; salt?: string; generic?: string; stock: number; unitPrice: number; mrp?: number }>): StockItem[] {
  return rows.map((row) => {
    const mrp = row.mrp;
    return {
      id: row.id,
      name: row.name,
      salt: row.salt || row.generic || row.name,
      stock: row.stock,
      unitPrice: row.unitPrice,
      mrp,
      hospitalMargin: typeof mrp === "number" ? Number((mrp - row.unitPrice).toFixed(2)) : undefined,
    };
  });
}

function sameDrug(row: StockItem, drug: string): boolean {
  return containsDrugPhrase(row.name, drug) || containsDrugPhrase(drug, row.name) || containsDrugPhrase(row.salt, drug) || containsDrugPhrase(drug, row.salt);
}

/** Pure stock note. Does not change the draft and does not block confirm. */
export function checkStock(drug: string, inventory: readonly StockItem[]): StockNotice | null {
  const name = drug.trim();
  if (!name || inventory.length === 0) return null;
  const matches = inventory.filter((row) => sameDrug(row, name));
  if (!matches.length) return null;
  const onHand = matches.reduce((sum, row) => sum + row.stock, 0);
  if (onHand > 0) return null;
  const molecule = moleculeKey(matches[0].salt || matches[0].name);
  const alternative = inventory.find((row) => row.stock > 0 && !matches.some((match) => match.id === row.id) && moleculeKey(row.salt || row.name) === molecule);
  const suggestion: StockSuggestion | null = alternative
    ? { id: alternative.id, drug: alternative.name, molecule, checked: false, patientPrice: alternative.unitPrice }
    : null;
  return { outOfStock: true, note: "out of stock", tone: "red", blocksConfirm: false, suggestion };
}

export function getBuyAlerts(): BuyAlert[] {
  readBuyAlerts();
  return buyAlerts.map((alert) => ({ ...alert }));
}

export function clearBuyAlerts(): void {
  buyAlerts.length = 0;
  buyAlertsHydrated = true;
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(BUY_ALERT_KEY);
  } catch {
    // Memory is already clear.
  }
}

/** One open alert per drug. The alternative stays unticked. */
export function reviewOutOfStock(drug: string, inventory: readonly StockItem[], now = new Date().toISOString()): { notice: StockNotice | null; buyAlert: BuyAlert | null } {
  readBuyAlerts();
  const notice = checkStock(drug, inventory);
  if (!notice) return { notice: null, buyAlert: null };
  const molecule = notice.suggestion?.molecule || moleculeKey(drug);
  const existing = buyAlerts.find((alert) => alert.status === "open" && alert.drug === drug && alert.molecule === molecule);
  if (existing) return { notice, buyAlert: existing };
  const created: BuyAlert = {
    id: `buy-${buyAlerts.length + 1}-${molecule.replace(/\s+/g, "-") || "drug"}`,
    drug,
    molecule,
    createdAt: now,
    forRole: "pharmacist",
    status: "open",
  };
  buyAlerts.push(created);
  writeBuyAlerts();
  return { notice, buyAlert: created };
}
