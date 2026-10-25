// Verification harness — probe Astra backend, run live test-all, write central state.
import fs from "fs";

const out = {};
async function probe(url, opts, label) {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(90000) });
    const text = await r.text();
    return { label, status: r.status, ms: Date.now() - t0, body: text.slice(0, 200000) };
  } catch (e) {
    return { label, status: 0, ms: Date.now() - t0, error: String(e) };
  }
}

const health = await probe("http://127.0.0.1:3000/api/health", {}, "backend-health");
out.backend = health.status;

let testAll = null;
if (health.status === 200) {
  testAll = await probe("http://127.0.0.1:3000/api/ai/test-all", { method: "POST" }, "test-all");
  try {
    fs.writeFileSync("logs/testall.json", JSON.stringify(JSON.parse(testAll.body), null, 2));
  } catch { /* keep raw */ }
  const state = await probe("http://127.0.0.1:3000/api/ai/state", {}, "central-state");
  try {
    fs.writeFileSync("data/astra-state.json", JSON.stringify(JSON.parse(state.body), null, 2) + "\n");
  } catch { /* keep raw */ }
  out.stateStatus = state.status;
}
out.testAllStatus = testAll?.status ?? "skipped-backend-down";

if (testAll && testAll.status === 200) {
  try {
    const parsed = JSON.parse(testAll.body);
    out.summary = Object.fromEntries(
      Object.entries(parsed.services).map(([k, v]) => [k, `${v.status}${v.pass === undefined ? "" : v.pass ? "/PASS" : "/FAIL"}`]),
    );
    out.routing = parsed.routing;
  } catch (e) {
    out.summaryError = String(e);
  }
}

fs.writeFileSync("logs/_verify.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.summary ?? out, null, 2));