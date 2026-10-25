/**
 * ASTRA Stable — Node probe + restart adapters (safety wall: layer 4)
 * ==================================================================
 * The supervisor core is pure; these are the only places that touch the
 * network or PM2. Both are injected, so tests never need a live stack.
 *
 * Hard rules encoded here:
 *   • every probe is bounded by AbortSignal.timeout (§21) — a dead dependency
 *     must never be able to freeze Saarathi;
 *   • `pm2 restart <one service>` only. "all" / "*" / "delete all" are refused
 *     before PM2 is ever invoked (§6, §23).
 */
import { execFile } from "node:child_process";
import { connect } from "node:net";
import type { ProbeFn, ProbeResult, RestartFn, ServiceDefinition } from "./types";

const FORBIDDEN_TARGETS = new Set(["all", "*", "everything"]);

async function probeHttp(service: ServiceDefinition, timeoutMs: number): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(service.url, {
      method: "GET",
      signal: controller.signal,
      redirect: "manual",
    });
    // Any HTTP answer means something is listening and speaking HTTP — a 401 or
    // 404 is still a live service, only "no answer" is a failure.
    return { ok: true, detail: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

function probeTcp(service: ServiceDefinition, timeoutMs: number): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const socket = connect({ host: service.host, port: service.port });
    let settled = false;
    const done = (result: ProbeResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done({ ok: true, detail: "tcp open" }));
    socket.once("timeout", () => done({ ok: false, detail: "tcp timeout" }));
    socket.once("error", (err: Error) => done({ ok: false, detail: err.message }));
  });
}

/** Default probe used by the watchdog script and the supervisor runtime. */
export const nodeProbe: ProbeFn = async (service, timeoutMs) => {
  if (service.probe === "none") return { ok: true, detail: "not probed" };
  if (service.probe === "tcp") return probeTcp(service, timeoutMs);
  if (service.id === "laya") {
    // config/ports.json healthPath is /v1/tasks (the task list) and is not edited here.
    // The real check is GET /v1/health, which blocks on a CPU predict (~7s).
    const budget = Math.max(timeoutMs, 15_000);
    return probeHttp(
      { ...service, healthPath: "/v1/health", url: `http://${service.host}:${service.port}/v1/health` },
      budget,
    );
  }
  return probeHttp(service, timeoutMs);
};

/** Restart exactly one PM2 app. Refuses blanket commands by design. */
export const restartViaPm2: RestartFn = (pm2Name: string) => {
  if (FORBIDDEN_TARGETS.has(pm2Name.trim().toLowerCase())) {
    throw new Error(
      `supervisor: refusing blanket PM2 target "${pm2Name}" — recovery must always be scoped to one service`,
    );
  }
  return new Promise<void>((resolve, reject) => {
    execFile("pm2", ["restart", pm2Name], { shell: true, timeout: 30_000 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};
