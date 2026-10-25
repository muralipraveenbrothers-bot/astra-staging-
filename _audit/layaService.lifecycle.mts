// Live lifecycle proof for server/services/layaService.ts (Step 6 wiring).
import { detectLaya, layaStatus, startLaya, stopLaya } from "../server/services/layaService";

async function main() {
  console.log("detect:", JSON.stringify(detectLaya()));
  const s0 = await layaStatus();
  console.log("status-before:", JSON.stringify(s0));
  if (s0.state === "STOPPED") {
    const s1 = await startLaya({ bindBudgetMs: 60_000 });
    console.log("start:", JSON.stringify(s1));
    const s2 = await layaStatus(); // fast path: /v1/tasks
    console.log("status-after:", JSON.stringify(s2));
    const s3 = await stopLaya();
    console.log("stop:", JSON.stringify(s3));
  } else {
    console.log("start: skipped (port already serving: " + s0.detail + ")");
    const s3 = await stopLaya();
    console.log("stop:", JSON.stringify(s3)); // expect external-instance refusal
  }
  console.log("LIFECYCLE_DONE");
}
main().catch((e) => { console.error("LIFECYCLE_FAIL", e); process.exit(1); });
