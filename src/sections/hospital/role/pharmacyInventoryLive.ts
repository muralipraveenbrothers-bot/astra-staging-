/**
 * Live pharmacy stock for the dispensing screen, the doctor's medication draft
 * and the billing desk. Reads GET /api/hospital/pharmacy on the local server.
 * If that fails, the demo formulary is used and the caller must show
 * DEMO_STOCK_LABEL so nobody mistakes it for real stock.
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/services/apiFetch";
import { INVENTORY_ITEMS, type InventoryItem } from "./pharmacyInventorySeed";

export const DEMO_STOCK_LABEL = "Demo stock \u2013 not live";

/** Shape of server/db.ts PharmacyItem. */
export interface ServerPharmacyItem {
  id: string;
  name: string;
  brand?: string;
  salt?: string;
  category?: string;
  stock: number;
  reorderLevel?: number;
  unitPrice: number;
  mrp?: number;
  batchNo?: string;
  expiryDate?: string;
  supplier?: string;
  rack?: string;
}

export interface PharmacyInventoryState {
  items: InventoryItem[];
  live: boolean;
}

const EXPIRY_SOON_MS = 90 * 24 * 60 * 60 * 1000;

export function mapServerPharmacyItem(row: ServerPharmacyItem, now = Date.now()): InventoryItem {
  const stock = Number.isFinite(Number(row.stock)) ? Number(row.stock) : 0;
  const reorder = Number.isFinite(Number(row.reorderLevel)) ? Number(row.reorderLevel) : 0;
  const expiryMs = row.expiryDate ? Date.parse(row.expiryDate) : NaN;
  const status: InventoryItem["status"] = stock <= reorder
    ? "LOW_STOCK"
    : Number.isFinite(expiryMs) && expiryMs - now < EXPIRY_SOON_MS
      ? "EXPIRING_SOON"
      : "OK";
  return {
    id: row.id,
    name: row.name,
    generic: row.salt || row.name,
    brand: row.brand || "",
    batch: row.batchNo || "",
    expiry: row.expiryDate || "",
    stock,
    sheets: 0,
    reorder,
    unitPrice: Number(row.unitPrice) || 0,
    mrp: Number(row.mrp ?? row.unitPrice) || 0,
    category: row.category || "",
    distributor: row.supplier || row.brand || "",
    status,
  };
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function loadPharmacyInventory(fetcher: Fetcher = apiFetch): Promise<PharmacyInventoryState> {
  try {
    const response = await fetcher("/api/hospital/pharmacy");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json() as { inventory?: ServerPharmacyItem[] };
    if (!Array.isArray(body.inventory) || body.inventory.length === 0) throw new Error("No live inventory rows.");
    return { items: body.inventory.map((row) => mapServerPharmacyItem(row)), live: true };
  } catch {
    return { items: INVENTORY_ITEMS, live: false };
  }
}

/** React hook: live stock with a labelled demo fallback. */
export function usePharmacyInventory(): PharmacyInventoryState & { loading: boolean; reload: () => void; setItems: (updater: (items: InventoryItem[]) => InventoryItem[]) => void } {
  const [state, setState] = useState<PharmacyInventoryState>({ items: [], live: false });
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    setLoading(true);
    void loadPharmacyInventory().then((next) => {
      setState(next);
      setLoading(false);
    });
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  const setItems = useCallback((updater: (items: InventoryItem[]) => InventoryItem[]) => {
    setState((current) => ({ ...current, items: updater(current.items) }));
  }, []);
  return { ...state, loading, reload, setItems };
}
