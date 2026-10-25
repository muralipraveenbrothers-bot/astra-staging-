import { ASTRACommandEngine } from "../src/command/CommandEngine";

(async () => {
  const engine = ASTRACommandEngine.getInstance();
  const user = { userId: "USR-test", name: "Dr. Sharma", role: "DOCTOR", department: "Clinical Medicine", ipAddress: "127.0.0.1" };
  const queries = [
    "find blind spots in Rajesh Kumar",
    "rule out PE in Rajesh Kumar",
    "rule in dengue for Rajesh Kumar",
    "rule in bacterial pneumonia in UHID-7821",
    "rule out DVT for Rajesh Kumar",
  ];
  for (const q of queries) {
    const r = await engine.execute({ query: q, user, confirmed: false, contextPatient: undefined });
    console.log("=== " + q + " ===");
    console.log("intent:", r.intent, "| success:", r.success);
    console.log((r.message || "").slice(0, 1200));
    console.log();
  }
})().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});