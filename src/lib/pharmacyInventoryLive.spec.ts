import { describe, expect, it, vi } from "vitest";
import { DEMO_STOCK_LABEL, loadPharmacyInventory, mapServerPharmacyItem } from "@/sections/hospital/role/pharmacyInventoryLive";
import { INVENTORY_ITEMS } from "@/sections/hospital/role/pharmacyInventorySeed";
import { checkStock, toStockItems } from "@/astra/clinical/medication/stockCheck";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("R5-04 fix: pharmacy stock is live, or clearly labelled demo", () => {
  it("uses the live /api/hospital/pharmacy inventory when available", async () => {
    const fetcher = vi.fn(async () => json(200, { inventory: [
      { id: "PH-1", name: "Azithromycin 500mg", salt: "Azithromycin 500mg", stock: 0, reorderLevel: 20, unitPrice: 18, mrp: 24, expiryDate: "2030-01-01" },
      { id: "PH-2", name: "Paracetamol 650mg", salt: "Paracetamol", stock: 400, reorderLevel: 50, unitPrice: 1.4, mrp: 2.5, expiryDate: "2030-01-01" },
    ] }));
    const state = await loadPharmacyInventory(fetcher);
    expect(state.live).toBe(true);
    expect(state.items.map((item) => item.id)).toEqual(["PH-1", "PH-2"]);
    expect(state.items[0]).toMatchObject({ generic: "Azithromycin 500mg", stock: 0, status: "LOW_STOCK" });
    expect(checkStock("Azithromycin 500mg", toStockItems(state.items))?.outOfStock).toBe(true);
  });

  it("falls back to the demo list, flagged not-live, when the server fails", async () => {
    const state = await loadPharmacyInventory(vi.fn(async () => json(401, { error: "UNAUTHORIZED" })));
    expect(state.live).toBe(false);
    expect(state.items).toBe(INVENTORY_ITEMS);
    expect(DEMO_STOCK_LABEL).toBe("Demo stock \u2013 not live");
  });

  it("makes the out-of-stock path reachable in demo mode, with a same-molecule suggestion left unticked", () => {
    const notice = checkStock("Azithral 500mg", toStockItems(INVENTORY_ITEMS));
    expect(notice?.outOfStock).toBe(true);
    expect(notice?.suggestion?.drug).toBe("Azee 500mg");
    expect(notice?.suggestion?.checked).toBe(false);
  });

  it("maps expiry and reorder level to the dashboard status", () => {
    const now = Date.parse("2026-09-29T00:00:00Z");
    expect(mapServerPharmacyItem({ id: "a", name: "A", stock: 100, reorderLevel: 10, unitPrice: 1, expiryDate: "2026-10-15" }, now).status).toBe("EXPIRING_SOON");
    expect(mapServerPharmacyItem({ id: "b", name: "B", stock: 5, reorderLevel: 10, unitPrice: 1, expiryDate: "2030-01-01" }, now).status).toBe("LOW_STOCK");
    expect(mapServerPharmacyItem({ id: "c", name: "C", stock: 100, reorderLevel: 10, unitPrice: 1, expiryDate: "2030-01-01" }, now).status).toBe("OK");
  });
});
