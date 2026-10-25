import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";

const endpoint = "http://127.0.0.1:8791";
const phrases = [
  "SYNTHETIC registration help needed",
  "నాకు సహాయం కావాలి",
  "मुझे मदद चाहिए",
  "naku jwaram undi",
];
const schemas = [
  { id: "department_routing", version: 1, kind: "choice", question: "Which Astra department surface should handle this?", options: [{ key: "reception", label: "Reception", description: "registration appointments movement" }, { key: "lab", label: "Lab", description: "laboratory tests results" }, { key: "unknown", label: "Unknown" }, { key: "human_review", label: "Human review" }] },
  { id: "intent_routing", version: 1, kind: "choice", question: "What does the user want Astra to do?", options: [{ key: "patient_lookup", label: "Patient lookup", description: "find or select patient" }, { key: "other", label: "Other", description: "other user intent" }, { key: "unknown", label: "Unknown" }, { key: "human_review", label: "Human review" }] },
];

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function timed(fn) {
  const t0 = performance.now();
  const result = await fn();
  return { ms: performance.now() - t0, result };
}

async function post(pathname, body) {
  const response = await fetch(`${endpoint}${pathname}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${pathname} HTTP ${response.status}`);
  return response.json();
}

const single = [];
const batch = [];
const checkpoints = new Set();
for (let i = 0; i < 50; i++) {
  const state = phrases[i % phrases.length];
  const one = await timed(() => post("/v1/decide", { task: "department_routing", state }));
  single.push(one.ms);
  if (one.result.model) checkpoints.add(one.result.model);
  const many = await timed(() => post("/v1/decide_batch", { state, schemas }));
  batch.push(many.ms);
  if (many.result.checkpoint) checkpoints.add(many.result.checkpoint);
}

const report = {
  at: new Date().toISOString(),
  endpoint,
  samples: 50,
  single: { p50: percentile(single, 50), p95: percentile(single, 95), max: Math.max(...single) },
  batch: { p50: percentile(batch, 50), p95: percentile(batch, 95), max: Math.max(...batch) },
  checkpoints: [...checkpoints],
  system: { platform: os.platform(), release: os.release(), cpus: os.cpus().map((cpu) => cpu.model)[0], cpuCount: os.cpus().length, gpu: process.env.CUDA_VISIBLE_DEVICES ? `CUDA_VISIBLE_DEVICES=${process.env.CUDA_VISIBLE_DEVICES}` : "not detected by script" },
};

const out = path.join("reports", "reflex", "laya-latency.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
