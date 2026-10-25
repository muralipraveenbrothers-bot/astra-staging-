/**
 * Live verification of the Astra Central AI Adapter.
 * Uses curl-equivalent fetch. Never invents context windows.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.ASTRA_API ?? "http://127.0.0.1:3000";
function keyFromEnvFile() {
  try {
    const raw = fs.readFileSync(path.join(ROOT, "config", "ai-gateway.env"), "utf8");
    const line = raw.split(/\r?\n/).find((l) => l.startsWith("FREELLMAPI_API_KEY=") || l.startsWith("ASTRA_ADAPTER_API_KEY="));
    return line ? line.slice(line.indexOf("=") + 1).trim() : "";
  } catch {
    return "";
  }
}
const KEY = process.env.ASTRA_ADAPTER_API_KEY ?? process.env.FREELLMAPI_API_KEY ?? keyFromEnvFile();

async function get(path, hdr = {}) {
  const res = await fetch(`${BASE}${path}`, { headers: hdr, signal: AbortSignal.timeout(12_000) });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, text: text.slice(0, 400) };
}

const headers = KEY ? { Authorization: `Bearer ${KEY}` } : {};
const out = { ok: true, checks: [] };

function check(name, pass, detail) {
  out.checks.push({ name, pass, detail });
  if (!pass) out.ok = false;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const arch = await get("/api/ai/architecture");
check("architecture", arch.status === 200, `HTTP ${arch.status}`);
check(
  "single-brain",
  Array.isArray(arch.json?.adapter?.chain) && arch.json.adapter.chain.map((c) => c.id).join(">") === "freellmapi>omniroute>ollama",
  JSON.stringify(arch.json?.adapter?.chain?.map((c) => c.role + ":" + c.id)),
);
check("manus-not-adapter", arch.json?.manus?.throughAdapter === false, arch.json?.manus?.note?.slice(0, 120));

const catalog = await get("/api/ai/catalog");
check("catalog", catalog.status === 200, `HTTP ${catalog.status}`);
const rec = catalog.json?.hermes?.recommended;
const hermesMin = catalog.json?.hermes?.requiredContext ?? 64000;
check(
  "hermes-recommend-only-if-64k",
  rec == null || (typeof rec.contextLength === "number" && rec.contextLength >= hermesMin),
  rec ? `${rec.id} context=${rec.contextLength} source=${rec.source}` : catalog.json?.hermes?.note,
);

const ollama = (catalog.json?.models ?? []).filter((m) => m.source === "ollama");
for (const m of ollama) {
  const tooSmall = m.contextLength != null && m.contextLength < hermesMin;
  check(
    `ollama-${m.id}-not-claimed-64k`,
    tooSmall ? rec?.id !== m.id : true,
    `${m.id} context=${m.contextLength}`,
  );
}

const models = await get("/v1/models", headers);
check("v1-models", models.status === 200 || models.status === 401, `HTTP ${models.status}`);
if (models.status === 200) {
  const auto = (models.json?.data ?? []).find((m) => m.id === "auto");
  if (auto) {
    check(
      "v1-auto-context-is-discovered",
      auto.context_length == null || auto.context_length === rec?.contextLength || auto.context_length >= hermesMin,
      `auto context_length=${auto.context_length}`,
    );
  }
}

const pingRes = await fetch(`${BASE}/api/ai/test`, { method: "POST", signal: AbortSignal.timeout(60_000) });
const pingJson = await pingRes.json().catch(() => null);
check("adapter-ping", pingRes.ok && pingJson?.used && pingJson.used !== "none", `used=${pingJson?.used}`);

console.log(out.ok ? "\nADAPTER OK" : "\nADAPTER FAILED");
process.exit(out.ok ? 0 : 1);
