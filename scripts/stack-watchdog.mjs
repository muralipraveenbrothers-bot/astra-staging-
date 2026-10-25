#!/usr/bin/env node
/**
 * ASTRA Stable — stack watchdog (§16–§20)
 * ======================================
 * PM2 knows "process alive". This knows "service actually usable", and it
 * recovers with a scalpel instead of a hammer:
 *
 *   • probes every service from config/ports.json on an interval;
 *   • restarts AT MOST ONE service per tick (the supervisor guarantees it);
 *   • honours threshold -> cooldown -> isolation, so nothing crash-loops;
 *   • never touches a browser-only capability (gesture) — those are reported,
 *     not restarted;
 *   • never runs `pm2 restart all` (the restart function refuses it).
 *
 * Run with tsx because it imports the TypeScript supervisor:
 *   npm run stack:watchdog
 *
 * It is intentionally boring: if everything is healthy it prints one line per
 * interval and exits on Ctrl+C.
 */
import { AstraSupervisor } from "../server/astra/supervisor/index";
import { nodeProbe, restartViaPm2 } from "../server/astra/supervisor/healthProbe";
import { DEFAULT_RECOVERY_POLICY } from "../server/astra/supervisor/types";

const intervalMs = DEFAULT_RECOVERY_POLICY.healthIntervalMs;
const sup = new AstraSupervisor({
  probe: nodeProbe,
  restart: restartViaPm2,
  onEvent: (e) => {
    const detail = e.detail ? ` — ${e.detail}` : "";
    console.log(`  [${new Date(e.at).toISOString()}] ${e.kind} ${e.serviceId}${detail}`);
  },
});

let stopping = false;
const shutdown = (signal) => {
  if (stopping) return;
  stopping = true;
  console.log(`\n${signal} received — watchdog stopping. No services are left running by this process.`);
  // Deliberately no process.exit(0): let the interval handle close naturally.
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

function render() {
  const report = sup.dependencyReport();
  const caps = sup.capabilityReport();
  const lines = [];
  for (const [id, state] of Object.entries(report.dependencies)) {
    if (state === "healthy") continue;
    lines.push(`${id}=${state}`);
  }
  const routes = Object.entries(report.routes)
    .map(([g, v]) => `${g}:${v}`)
    .join(" ");
  console.log(
    `\n[watchdog] astra=ONLINE  routes ${routes || "none"}` +
      (lines.length ? `  | attention: ${lines.join(", ")}` : "  | all services healthy"),
  );
  if (caps.capabilities.length) {
    const capLine = caps.capabilities
      .map((c) => `${c.label} ${c.state === "online" ? "🟢" : c.state === "recovering" ? "🟡" : "🟠"}`)
      .join("  ");
    console.log(`[watchdog] capabilities: ${capLine}`);
  }
  const isolated = sup.isolatedServices();
  if (isolated.length) {
    console.log(
      `[watchdog] isolated (restart budget spent, stack unaffected): ${isolated.join(", ")}` +
        ` — resolve manually with sup.resolve(id) or fix the cause`,
    );
  }
}

async function tick() {
  if (stopping) return;
  try {
    const result = await sup.tick();
    if (result.restarted.length) {
      console.log(`[watchdog] scoped restart issued: ${result.restarted.join(", ")}`);
    }
    render();
  } catch (err) {
    // The watchdog must never become the thing that takes Astra down.
    console.error(`[watchdog] tick error contained: ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log(`ASTRA STABLE watchdog — interval ${intervalMs}ms, threshold ${DEFAULT_RECOVERY_POLICY.failureThreshold}, cooldown ${DEFAULT_RECOVERY_POLICY.cooldownMs}ms, max attempts ${DEFAULT_RECOVERY_POLICY.maxAttempts}`);
await tick();
const timer = setInterval(tick, intervalMs);
timer.unref?.();
