// Deep-probe lifecycle proof: start -> layaStatus({deep:true}) -> HEALTHY(modelLoaded) -> stop.
import { detectLaya, layaStatus, startLaya, stopLaya } from "../server/services/layaService";

async function main() {
  console.log("detect:", JSON.stringify(detectLaya()));
  const s0 = await layaStatus();
  console.log("status-before:", JSON.stringify(s0));
  if (s0.state === "STOPPED") {
    console.log("start:", JSON.stringify(await startLaya({ bindBudgetMs: 60_000 })));
  } else {
    console.log("start: skipped (port already serving)");
  }
  const deep = await layaStatus({ deep: true, deepBudgetMs: 180_000 });
  console.log("status-deep:", JSON.stringify(deep));
  console.log("MODEL_LOADED:", deep.modelLoaded === true ? "YES" : "NO", "STATE:", deep.state);
  const s3 = await stopLaya();
  console.log("stop:", JSON.stringify(s3));
  const ok = deep.state === "HEALTHY" && deep.modelLoaded === true && s3.state === "STOPPED";
  console.log(ok ? "DEEP_PROBE_ALL_OK" : "DEEP_PROBE_NOT_OK");
}

main().catch((e) => {
  console.error("DEEP_FAIL", e);
  process.exit(1);
});
