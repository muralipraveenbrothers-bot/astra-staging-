// Astra-side integration test: the REAL client (src/astra/integrations/n8nClient.ts)
// with the REAL .env — run via tsx so the actual TS client is exercised.
import { readFileSync } from "fs";
// minimal .env load (no dotenv dependency in this repo) — MUST run before
// the dynamic import of n8nClient (its BASE resolves at module load time).
for (const line of readFileSync("d:/astra PM/.env", "utf-8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
console.log("VITE_N8N_BASE:", process.env.VITE_N8N_BASE ?? "(unset)");

async function main(): Promise<void> {
  const { n8nTrigger, AUTOMATIONS } = await import("../src/astra/integrations/n8nClient");
  const { db } = await import("../server/db");

  console.log("AUTOMATIONS_REGISTERED:", AUTOMATIONS.map((a) => a.name).join(", "));

  // Live fabric patient: ICU Bed 3 → P001 / UHID-7821 (real DB resolution)
  const resolved = db.getPatientById("P001");
  console.log("LIVE_PATIENT:", resolved ? `${resolved.id} ${resolved.uhid} ${resolved.name} ${resolved.admissionStatus}` : "NOT_FOUND");

  const orderId = `LAB-TSX-${Date.now().toString(36)}`;
  const result = await n8nTrigger("order-lab", {
    event: "ORDER_LAB",
    orderId,
    patientId: resolved?.id,
    uhid: resolved?.uhid,
    patientName: resolved?.name,
    bed: "ICU-03",
    ward: "Intensive Care Unit",
    tests: ["CBC", "CRP"],
    priority: "routine",
    idempotencyKey: `IDEM-${orderId}`,
    correlationId: `COR-TSX-${Date.now().toString(36)}`,
    source: "astra-copilot",
  });
  console.log("N8N_TRIGGER_RESULT:", JSON.stringify(result));
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});