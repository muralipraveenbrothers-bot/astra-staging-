/**
 * ASTRA AI — OP MARGIN OPTIMIZER AGENT (FINANCE-CTO / SPECIALIST)
 * ============================================================================
 * Purpose: computes cost-per-OP, revenue-per-OP, margin %, and break-even
 * volume from REAL hospital data (live patient census + order activity +
 * hospital profile), combined with a transparent, editable cost model.
 *
 * NO FAKE DATA RULE:
 * - OP volume & activity: real (db.getPatients / db.getOrders / profile)
 * - Charges & cost tables: institutional rate-card + cost model (defaults
 *   shown; editable in config). Every output row shows its inputs.
 * - Projections (break-even) are labeled DERIVED ESTIMATE with the formula.
 */

import { db } from "../../../server/db";

export interface OpCostRow {
  procedure: string;
  charge: number;          // ₹ per procedure (rate card)
  materials: number;       // ₹ per procedure (consumables)
  staffShare: number;      // ₹ per procedure (doctor + nurse + assistant time)
  overheadShare: number;   // ₹ per procedure (allocated rent/power/equipment)
  cost: number;            // materials + staff + overhead
  margin: number;          // charge - cost
  marginPct: number;       // (revenue - cost) / revenue × 100
  flag: "OK" | "LOW" | "LOSS";
  suggestion?: string;
}

export interface OpMarginAnalysis {
  department: string;
  generatedAt: string;
  opVolumeToday: number;       // REAL: outpatient census
  activeOrdersToday: number;   // REAL: orders across categories
  rows: OpCostRow[];
  weightedAvgMarginPct: number;
  fixedCostsPerDay: number;    // ₹/day (configurable institutional input)
  breakEvenPerDay: number;     // fixed / (avg revenue - avg variable cost)
  currentPnlPerDay: number;    // (revenue - variable cost) × volume - fixed
  targetVolume: number;        // volume at desired margin
  avgRevenue: number;
  avgVariableCost: number;
  suggestion: string;
}

interface CostModel {
  procedures: {
    name: string;
    charge: number;
    materials: number;
    staffMin: number;
    staffRatePerHr: number;
    overheadShare: number;
  }[];
  fixedCostsPerDay: number;
  desiredMarginPct: number;
  deptOverheadShare: number;
}

/** Institutional cost model — defaults transparent & editable (rate card + costing). */
const DEFAULT_COST_MODEL: CostModel = {
  fixedCostsPerDay: 14500,
  desiredMarginPct: 40,
  deptOverheadShare: 0.5,
  procedures: [
    { name: "POP Cast Application", charge: 350, materials: 45, staffMin: 10, staffRatePerHr: 150, overheadShare: 30 },
    { name: "Suture Removal", charge: 100, materials: 15, staffMin: 10, staffRatePerHr: 150, overheadShare: 30 },
    { name: "Dressing (Simple)", charge: 120, materials: 40, staffMin: 8, staffRatePerHr: 150, overheadShare: 25 },
    { name: "Intramuscular / IV Injection", charge: 80, materials: 25, staffMin: 6, staffRatePerHr: 120, overheadShare: 20 },
    { name: "Minor Surgery (Incision & Drainage)", charge: 900, materials: 320, staffMin: 30, staffRatePerHr: 180, overheadShare: 120 }
  ]
};

export class OpMarginOptimizerAgent {
  public static readonly agentId = "op_margin_optimizer_agent";

  /**
   * Runs a full OP margin analysis using REAL hospital state.
   */
  public static analyze(department = "Orthopaedics", costModel: CostModel = DEFAULT_COST_MODEL): OpMarginAnalysis {
    // ── REAL DATA ─────────────────────────────────────────────────────────
    const patients = db.getPatients();
    const opVolumeToday = patients.filter(p => p.admissionStatus === "outpatient").length;
    const orders = db.getOrders();
    const activeOrdersToday = orders.length;
    const profile = db.getProfile();

    // ── ROWS ──────────────────────────────────────────────────────────────
    const rows: OpCostRow[] = costModel.procedures.map(proc => {
      const staffShare = Math.round((proc.staffMin / 60) * proc.staffRatePerHr);
      const overheadShare = Math.round(proc.overheadShare * costModel.deptOverheadShare);
      const cost = proc.materials + staffShare + overheadShare;
      const margin = proc.charge - cost;
      const marginPct = proc.charge > 0 ? Math.round((margin / proc.charge) * 100) : 0;
      const flag: OpCostRow["flag"] = margin <= 0 ? "LOSS" : marginPct < 40 ? "LOW" : "OK";
      const suggestion =
        flag === "LOW"
          ? `Increase charge to ₹${Math.ceil(cost / (1 - costModel.desiredMarginPct / 100))} OR bundle with review/dressing visit`
          : flag === "LOSS"
            ? `REVIEW IMMEDIATELY: charge ₹${proc.charge} does not cover cost ₹${cost} — reprice or discontinue`
            : undefined;
      return { procedure: proc.name, charge: proc.charge, materials: proc.materials, staffShare, overheadShare, cost, margin, marginPct, flag, suggestion };
    });

    const weightedAvgMarginPct = rows.length
      ? Math.round(rows.reduce((s, r) => s + r.marginPct, 0) / rows.length)
      : 0;

    // ── BREAK-EVEN (DERIVED ESTIMATE, formula shown) ──────────────────────
    const avgRevenue = rows.length ? rows.reduce((s, r) => s + r.charge, 0) / rows.length : 0;
    const avgVariableCost = rows.length ? rows.reduce((s, r) => s + (r.materials + r.staffShare), 0) / rows.length : 0;
    const contribution = avgRevenue - avgVariableCost;
    const breakEvenPerDay = contribution > 0
      ? Math.ceil(costModel.fixedCostsPerDay / contribution)
      : Number.POSITIVE_INFINITY;

    const currentPnlPerDay = Math.round((contribution * opVolumeToday) - costModel.fixedCostsPerDay);
    const targetVolume = contribution > 0
      ? Math.ceil(costModel.fixedCostsPerDay / (contribution * (1 - costModel.desiredMarginPct / 100)))
      : Number.POSITIVE_INFINITY;

    const suggestion =
      weightedAvgMarginPct < 40
        ? `Weighted margin ${weightedAvgMarginPct}% is below the ${costModel.desiredMarginPct}% target. Review LOW/LOSS rows above (reprice or bundle).`
        : breakEvenPerDay <= opVolumeToday
          ? `Margin healthy and volume is above break-even — consider expanding OP hours.`
          : `Volume ${opVolumeToday}/day is below break-even ${breakEvenPerDay}/day. Focus: queue reduction, same-day billing, reminder calls.`;

    return {
      department,
      generatedAt: new Date().toISOString(),
      opVolumeToday,
      activeOrdersToday,
      rows,
      weightedAvgMarginPct,
      fixedCostsPerDay: costModel.fixedCostsPerDay,
      breakEvenPerDay,
      currentPnlPerDay,
      targetVolume,
      avgRevenue: Math.round(avgRevenue),
      avgVariableCost: Math.round(avgVariableCost),
      suggestion
    };
  }

  /** Human-readable report for the command channel. */
  public static formatReport(a: OpMarginAnalysis): string {
    const lines = [
      `📊 OP MARGIN ANALYSIS — ${a.department} (${a.generatedAt.slice(0, 10)})`,
      `Real data: ${a.opVolumeToday} OPD patients today · ${a.activeOrdersToday} active orders across hospital · ${db.getProfile().name}`,
      ""
    ];
    for (const r of a.rows) {
      lines.push(
        `${r.flag === "OK" ? "✓" : r.flag === "LOW" ? "⚠" : "✗"} ${r.procedure}:`,
        `   Charge ₹${r.charge} · Materials ₹${r.materials} · Staff ₹${r.staffShare} · Overhead ₹${r.overheadShare}`,
        `   Cost ₹${r.cost} → Margin ₹${r.margin} (${r.marginPct}%)${r.suggestion ? ` — ${r.suggestion}` : ""}`
      );
    }
    lines.push(
      "",
      `Weighted margin: ${a.weightedAvgMarginPct}% · Fixed costs: ₹${a.fixedCostsPerDay}/day`,
      `Break-even: ${a.breakEvenPerDay} OPs/day (DERIVED ESTIMATE: fixed ÷ (avg revenue ₹${Math.round(a.avgRevenue ?? 0)} − avg variable ₹${Math.round(a.avgVariableCost ?? 0)}))`,
      `Current P&L: ${a.currentPnlPerDay >= 0 ? "+" : ""}₹${a.currentPnlPerDay}/day`,
      `💡 ${a.suggestion}`
    );
    return lines.join("\n");
  }
}