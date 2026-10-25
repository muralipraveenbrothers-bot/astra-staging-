export interface InventoryItem {
  id: string;
  name: string;
  generic: string;
  brand: string;
  batch: string;
  expiry: string;
  stock: number;
  sheets: number;
  reorder: number;
  unitPrice: number;
  mrp: number;
  category: string;
  distributor: string;
  status: "OK" | "LOW_STOCK" | "EXPIRING_SOON";
}

/**
 * DEMO STOCK – NOT LIVE.
 * Fallback formulary shown only when the live pharmacy inventory
 * (GET /api/hospital/pharmacy) cannot be loaded. Every screen that falls back
 * to this list must show DEMO_STOCK_LABEL (see pharmacyInventoryLive.ts).
 * MED-006 is deliberately at zero stock so the out-of-stock / Buy Alert path
 * can be exercised in demo mode; MED-007 is the same molecule in stock.
 */
export const INVENTORY_ITEMS: InventoryItem[] = [
  {
    id: "MED-001",
    name: "Augmentin 625mg",
    generic: "Amoxicillin + Clavulanic Acid 625mg",
    brand: "GlaxoSmithKline India Pharmaceuticals",
    batch: "AUG-2026-991",
    expiry: "2027-11-30",
    stock: 1400,
    sheets: 140,
    reorder: 200,
    unitPrice: 15.0,
    mrp: 22.0,
    category: "Antibiotics",
    distributor: "GlaxoSmithKline India Pharmaceuticals",
    status: "OK",
  },
  {
    id: "MED-002",
    name: "Dolo 650mg",
    generic: "Paracetamol 650mg",
    brand: "Micro Labs Ltd",
    batch: "DOL-8821",
    expiry: "2028-05-15",
    stock: 6750,
    sheets: 450,
    reorder: 500,
    unitPrice: 1.4,
    mrp: 2.5,
    category: "Analgesic",
    distributor: "Micro Labs Ltd",
    status: "OK",
  },
  {
    id: "MED-003",
    name: "Amlokind 5mg",
    generic: "Amlodipine Besylate 5mg",
    brand: "Mankind Pharma",
    batch: "AML-5541",
    expiry: "2027-08-20",
    stock: 2500,
    sheets: 250,
    reorder: 300,
    unitPrice: 2.2,
    mrp: 4.0,
    category: "Cardiovascular",
    distributor: "Mankind Pharma",
    status: "OK",
  },
  {
    id: "MED-004",
    name: "Pan 40mg",
    generic: "Pantoprazole Sodium 40mg",
    brand: "Alkem Laboratories",
    batch: "PAN-5512",
    expiry: "2027-12-10",
    stock: 3100,
    sheets: 310,
    reorder: 400,
    unitPrice: 6.5,
    mrp: 11.0,
    category: "Gastrointestinal",
    distributor: "Alkem Laboratories",
    status: "OK",
  },
  {
    id: "MED-005",
    name: "Deriphyllin Retard 150mg",
    generic: "Etofylline + Theophylline 150mg",
    brand: "Zydus Healthcare",
    batch: "DER-1102",
    expiry: "2026-10-30",
    stock: 850,
    sheets: 85,
    reorder: 100,
    unitPrice: 1.8,
    mrp: 3.5,
    category: "Respiratory",
    distributor: "Zydus Healthcare",
    status: "EXPIRING_SOON",
  },
  {
    id: "MED-006",
    name: "Azithral 500mg",
    generic: "Azithromycin 500mg",
    brand: "Alembic Pharmaceuticals",
    batch: "AZI-0000",
    expiry: "2027-06-30",
    stock: 0,
    sheets: 0,
    reorder: 50,
    unitPrice: 18.0,
    mrp: 24.0,
    category: "Antibiotics",
    distributor: "Alembic Pharmaceuticals",
    status: "LOW_STOCK",
  },
  {
    id: "MED-007",
    name: "Azee 500mg",
    generic: "Azithromycin 500mg",
    brand: "Cipla Ltd",
    batch: "AZE-3310",
    expiry: "2027-09-30",
    stock: 120,
    sheets: 40,
    reorder: 50,
    unitPrice: 16.5,
    mrp: 22.0,
    category: "Antibiotics",
    distributor: "Cipla Ltd",
    status: "OK",
  },
];
