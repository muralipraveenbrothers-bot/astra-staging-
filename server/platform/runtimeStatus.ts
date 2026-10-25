/**
 * Server-side runtime status for the Internal Browser service grid.
 * Probes the REAL loopback ports (not the Vite origin). Honest LIVE/OFFLINE.
 * Never reports LIVE from a Vite 404 or a timed-out heavy /api/health.
 */
export type RuntimeLevel = "live" | "degraded" | "offline" | "retired";

export interface RuntimeEntry {
  id: string;
  level: RuntimeLevel;
  online: boolean;
  api: boolean;
  ui: boolean;
  latencyMs: number;
  detail: string;
}

interface Target {
  id: string;
  api?: string[];
  ui?: string[];
  /** Per-target probe budget in ms. */
  timeoutMs?: number;
  gatewayAuth?: boolean;
  requiresModels?: boolean;
}

import { probeHermes } from "../agents/hermesAdapter";
import { statusWords } from "../../src/services/healthWords";
import { agentOrchestrator } from "../langgraph";
import { canonicalPort, portEntries } from "../astra/supervisor/portRegistry";

const TARGETS: Target[] = [
  { id: "astra-api", api: ["http://127.0.0.1:3000/api/live"] },
  // FreeLLMAPI is ONE process serving both the dashboard HTML and the
  // API (/v1 /api /livez /readyz /api/ping). The retired two-process layout
  // (retired legacy UI/API ports) is gone — probing it here made a
  // perfectly healthy gateway render as OFFLINE in the Internal Browser grid.
  { id: "freellmapi", api: [`http://${portEntries().freellmapi.host}:${canonicalPort("freellmapi")}/v1/models`], gatewayAuth: true },
  { id: "ollama", api: ["http://127.0.0.1:11434/api/tags"], requiresModels: true },
  // /v1/tasks is the static task list. /v1/health runs a CPU predict and can take ~7s; 1.8s reads as a hang.
  { id: "laya", api: ["http://127.0.0.1:8791/v1/health"], timeoutMs: 15_000 },
  { id: "voicebox", api: ["http://127.0.0.1:17493/health", "http://127.0.0.1:17493/"], ui: ["http://127.0.0.1:17493/"] },
  // Hermes and LangGraph are NOT HTTP services — their real health is produced
  // by dedicated probes below and injected into the `services` map.
];

async function tcpOpen(port: number, host = "127.0.0.1"): Promise<boolean> {
  const net = await import("net");
  return new Promise((resolve) => {
    const s = net.connect({ host, port });
    s.setTimeout(400);
    s.on("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.on("error", () => resolve(false));
    s.on("timeout", () => {
      s.destroy();
      resolve(false);
    });
  });
}

function portOf(url: string): number | null {
  try {
    const u = new URL(url);
    if (u.port) return Number(u.port);
    return u.protocol === "https:" ? 443 : 80;
  } catch {
    return null;
  }
}

export function ollamaModelsAvailable(payload: unknown): boolean {
  return Boolean(payload && typeof payload === "object" && Array.isArray((payload as { models?: unknown }).models) && (payload as { models: unknown[] }).models.length > 0);
}

async function hit(url: string, timeoutMs: number, gatewayAuth = false, requiresModels = false): Promise<{ ok: boolean; status: number; ms: number; error?: string }> {
  const t0 = Date.now();
  const attempt = (async () => {
    try {
      const key = gatewayAuth ? process.env.FREELLMAPI_API_KEY?.trim() : undefined;
      const r = await fetch(url, { method: "GET", headers: key ? { Authorization: `Bearer ${key}` } : undefined, signal: AbortSignal.timeout(timeoutMs), redirect: "manual" });
      if (requiresModels && r.ok) {
        const payload = await r.clone().json().catch(() => undefined);
        if (!ollamaModelsAvailable(payload)) return { ok: false, status: r.status, ms: Date.now() - t0, error: "Ollama running, no models installed" };
      }
      void r.body?.cancel().catch(() => {});
      return { ok: r.status >= 200 && r.status < 400, status: r.status, ms: Date.now() - t0 };
    } catch (e) {
      return {
        ok: false,
        status: 0,
        ms: Date.now() - t0,
        error: e instanceof Error ? (e.name === "TimeoutError" || e.name === "AbortError" ? "timeout" : "unreachable") : "unreachable",
      };
    }
  })();
  // Defence in depth: AbortSignal.timeout() asks undici to abort, but a socket
  // stuck in a half-open state can leave the fetch promise unsettled, and then
  // this probe never returns. Race a plain timer so hit() ALWAYS settles.
  const guard = new Promise<{ ok: false; status: 0; ms: number; error: string }>((resolve) =>
    setTimeout(() => resolve({ ok: false, status: 0, ms: Date.now() - t0, error: "timeout" }), timeoutMs + 500),
  );
  return Promise.race([attempt, guard]);
}

async function firstOk(urls: string[] | undefined, timeoutMs: number, gatewayAuth = false, requiresModels = false) {
  if (!urls?.length) return { ok: false, status: 0, ms: 0, error: "no-url" as string | undefined };
  const responses = await Promise.all(urls.map((u) => hit(u, timeoutMs, gatewayAuth, requiresModels)));
  const healthy = responses.find((r) => r.ok);
  if (healthy) return healthy;
  const responding = responses.find((r) => r.status > 0);
  if (responding) return responding;
  const port = portOf(urls[0]);
  if (port && (await tcpOpen(port))) {
    return { ok: false, status: 0, ms: timeoutMs, error: "starting or unresponsive" };
  }
  return responses[0];
}

async function probeRuntimeStatus(): Promise<{ checkedAt: string; status: RequiredStatus; services: Record<string, RuntimeEntry> }> {
  const checkedAt = new Date().toISOString();
  const entries = await Promise.all(
    TARGETS.map(async (t) => {
      const budget = t.timeoutMs ?? 1800;
      const [api, ui] = await Promise.all([firstOk(t.api, budget, t.gatewayAuth, t.requiresModels), firstOk(t.ui, budget)]);
      const apiUp = t.api ? api.ok : false;
      const uiUp = t.ui ? ui.ok : false;
      const reachable = (r: typeof api) => r.ok || r.status > 0 || r.error === "starting or unresponsive";
      const online = Boolean((t.api && reachable(api)) || (t.ui && reachable(ui)));
      const degraded = online && Boolean((t.api && !apiUp) || (t.ui && !uiUp));
      const level: RuntimeLevel = !online ? "offline" : degraded ? "degraded" : "live";
      // Prefer the error from a probe that is actually configured. A ui-only
      // target (e.g. agentzero) leaves `api` as the placeholder
      // {ok:false,status:0,error:"no-url"}, and `api.error || ui.error` would
      // then surface "no-url" to the operator instead of the real UI failure.
      const failureDetail = (t.api ? api.error : undefined) || (t.ui ? ui.error : undefined) || "unreachable";
      const side = (label: string, up: boolean, status: number, error?: string) => {
        if (up) return label + " answered";
        if (error && error !== "no-url") return label + ": " + (error === "timeout" ? "the check timed out" : error === "unreachable" ? "nothing answered" : error === "starting or unresponsive" ? "the port is open but it did not answer" : error);
        return label + ": " + statusWords(status).replace(/\.$/, "");
      };
      const detail = !online
        ? (failureDetail === "timeout"
            ? "Not connected. The check timed out."
            : failureDetail === "unreachable" || failureDetail === "no-url"
              ? "Not connected. Nothing is listening on this PC."
              : failureDetail === "starting or unresponsive"
                ? "Not connected. A port is open, but the service did not answer."
                : "Not connected. " + failureDetail)
        : degraded
          ? [t.api && side("API", apiUp, api.status, api.error), t.ui && side("Page", uiUp, ui.status, ui.error)].filter(Boolean).join(". ") + "."
          : statusWords(api.status || ui.status);
      const entry: RuntimeEntry = {
        id: t.id,
        level,
        online,
        api: apiUp,
        ui: t.ui ? uiUp : apiUp,
        latencyMs: Math.max(api.ms, ui.ms),
        detail,
      };
      return entry;
    }),
  );
  // Hermes and LangGraph are NOT HTTP endpoints. Use their dedicated probes.
  const [hermesProbe, langgraphTest] = await Promise.allSettled([
    probeHermes(),
    Promise.race([
      agentOrchestrator.selfTest(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000)),
    ]),
  ]);

  const hermesLevel: RuntimeLevel =
    hermesProbe.status === "fulfilled" && hermesProbe.value.status === "LIVE"
      ? "live"
      : "offline";
  const hermesDetail =
    hermesProbe.status === "fulfilled"
      ? `${hermesProbe.value.transport} · ${hermesProbe.value.detail}`
      : hermesProbe.status === "rejected"
        ? (hermesProbe.reason instanceof Error ? hermesProbe.reason.message : String(hermesProbe.reason))
        : "unreachable";

  const langgraphOnline = langgraphTest.status === "fulfilled" && (langgraphTest.value as any).ok !== false;
  const langgraphDetail =
    langgraphTest.status === "fulfilled"
      ? `in-process · nodes=${(langgraphTest.value as any).nodes ?? "?"} skills=${(langgraphTest.value as any).learnedSkills ?? "?"}`
      : langgraphTest.status === "rejected"
        ? (langgraphTest.reason instanceof Error ? langgraphTest.reason.message : String(langgraphTest.reason))
        : "timeout";

  const services: Record<string, RuntimeEntry> = {
    hermes: {
      id: "hermes",
      level: hermesLevel,
      online: hermesLevel === "live",
      api: hermesLevel === "live",
      ui: hermesLevel === "live",
      latencyMs: 0,
      detail: hermesDetail,
    },
    "langgraph-orchestrator": {
      id: "langgraph-orchestrator",
      level: langgraphOnline ? "live" : "degraded",
      online: true,
      api: true,
      ui: true,
      latencyMs: 0,
      detail: langgraphDetail,
    },
  };
  for (const e of entries) services[e.id] = e;
  return { checkedAt, status: combineRequiredStatus(services), services };
}

export type RequiredStatus = "HEALTHY" | "DEGRADED";
export function combineRequiredStatus(services: Record<string, Pick<RuntimeEntry, "level" | "online">>): RequiredStatus {
  return ["astra-api", "freellmapi", "laya", "ollama"].every((id) => services[id]?.online && services[id]?.level === "live") ? "HEALTHY" : "DEGRADED";
}

// Concurrent browser tabs share one bounded probe; do not multiply load on cold runtimes.
let cached: Awaited<ReturnType<typeof probeRuntimeStatus>> | undefined;
let cachedAt = 0;
let pending: ReturnType<typeof probeRuntimeStatus> | undefined;

/**
 * Hard ceiling on one probe sweep.
 *
 * WHY THIS EXISTS
 * ---------------
 * Without it, ONE wedged service could hang the entire grid.
 * Electron app answers normally but can stop responding while still holding the
 * socket ESTABLISHED; the fetch then never settles, `pending` is never cleared,
 * and every subsequent /api/runtime/status request awaits the same dead promise.
 * The Internal Browser polls with a 20s budget, so the whole grid sat on
 * "checking…" indefinitely — for every service, not just the wedged one.
 *
 * A single misbehaving sidecar must never be able to do that. Past the deadline
 * we answer from the last good snapshot instead of blocking.
 */
const PROBE_DEADLINE_MS = 12000;

function withDeadline<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    p.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

export function collectRuntimeStatus(): ReturnType<typeof probeRuntimeStatus> {
  if (cached && Date.now() - cachedAt < 5000) return Promise.resolve(cached);
  if (!pending) {
    const raw = probeRuntimeStatus();
    // Cache the genuine result whenever it eventually lands — even if the
    // deadline below has already answered the callers. Best-effort background
    // refresh; failures are swallowed because a rejected probe must not leave
    // an unhandled rejection behind.
    raw.then(
      (result) => {
        cached = result;
        cachedAt = Date.now();
      },
      () => {},
    );
    // `pending` IS the deadline-bounded promise, so every concurrent caller gets
    // this exact object back (callers rely on that identity). Wrapping per call
    // instead would hand out a fresh promise each time.
    pending = withDeadline(raw, PROBE_DEADLINE_MS)
      .then((result) => {
        if (result) return result;
        // Deadline blown. Serve the last good snapshot (if any) so the grid keeps
        // rendering real states rather than spinning.
        return cached ?? { checkedAt: new Date().toISOString(), status: "DEGRADED", services: {} };
      })
      .finally(() => {
        // Clear on OUR settlement, not on the raw probe's: a wedged service never
        // settles its own probe, and waiting for it is precisely the bug that
        // froze the whole grid on "checking…".
        pending = undefined;
      });
  }
  return pending;
}
