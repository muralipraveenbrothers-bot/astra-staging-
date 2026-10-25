/**
 * Astra embed proxy — same-origin dashboards under http://localhost:5173/proxy/<service>/
 *
 * Two jobs:
 *   1. Forward approved embedded service paths to their real local ports.
 *   2. When an iframe whose document lives under that prefix requests root
 *      assets (/assets, /rest, /api, …), forward those too — otherwise the
 *      SPA would hit Astra Vite and 404.
 *
 * Vite/Next apps are NOT path-proxied
 * here: their /@vite and /_next clients would collide with Astra. Those UIs
 * still open inside the Internal Browser via their own origin, with Astra's
 * hash URL (#/browser?service=…) as the user-facing address.
 */
import type { IncomingMessage, ServerResponse } from "http";
import type { Plugin } from "vite";
import { createProxyMiddleware, type RequestHandler } from "http-proxy-middleware";

const ASTRA_ORIGIN_ANCESTORS =
  "frame-ancestors 'self' http://localhost:5173 http://127.0.0.1:5173";

const RESERVED = [
  /^\/@/,
  /^\/src\//,
  /^\/node_modules/,
  /^\/__vite/,
  /^\/favicon/,
  /^\/manifest\.json/,
];

export const EMBED_UPSTREAMS: Array<{ prefix: string; target: string }> = [
  { prefix: "/proxy/voicebox", target: "http://127.0.0.1:17493" },
];

export function stripFrameGuards(proxyRes: IncomingMessage): void {
  const headers = proxyRes.headers;
  delete headers["x-frame-options"];
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() !== "content-security-policy") continue;
    const value = headers[key];
    if (typeof value === "string") {
      headers[key] = /frame-ancestors/i.test(value)
        ? value.replace(/frame-ancestors\s+[^;]+/i, ASTRA_ORIGIN_ANCESTORS)
        : `${value}; ${ASTRA_ORIGIN_ANCESTORS}`;
    }
  }
}

function isReserved(pathname: string): boolean {
  return RESERVED.some((re) => re.test(pathname));
}

function refererPath(req: IncomingMessage): string {
  const raw = String(req.headers.referer || "");
  if (!raw) return "";
  try {
    return new URL(raw).pathname;
  } catch {
    return "";
  }
}

function makeProxy(
  target: string,
  pathRewrite?: Record<string, string>,
  opts?: { preserveFrameGuards?: boolean; timeoutMs?: number },
): RequestHandler {
  const timeoutMs = opts?.timeoutMs ?? 2500;
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    // NEVER attach a global `upgrade` listener. http-proxy-middleware
    // with ws:true steals Vite's HMR websocket and puts Chrome into an
    // infinite "[vite] server connection lost" reload loop (blank page).
    ws: false,
    secure: false,
    timeout: timeoutMs,
    proxyTimeout: timeoutMs,
    ...(pathRewrite ? { pathRewrite } : {}),
    on: {
      proxyReq(proxyReq) {
        proxyReq.setTimeout(timeoutMs, () => proxyReq.destroy());
      },
      proxyRes(proxyRes) {
        // Voicebox ships its own security headers — do not strip them to force embedding.
        if (!opts?.preserveFrameGuards) stripFrameGuards(proxyRes);
      },
      error(_err, _req, res) {
        // HTTP responses have setHeader; WebSocket upgrade errors pass a Socket.
        const r = res as ServerResponse | undefined;
        if (r && typeof r.setHeader === "function" && !r.headersSent) {
          r.statusCode = 502;
          r.setHeader("Content-Type", "application/json");
          r.end(JSON.stringify({ ok: false, error: "UPSTREAM_UNREACHABLE", target }));
        }
      },
    },
  });
}

export function astraEmbedProxyPlugin(): Plugin {
  const handlers = EMBED_UPSTREAMS.map((e) => {
    const preserveFrameGuards = e.prefix === "/proxy/voicebox";
    return {
      prefix: e.prefix,
      prefixProxy: makeProxy(e.target, { [`^${e.prefix}`]: "" }, {
        preserveFrameGuards,
        timeoutMs: e.prefix === "/proxy/voicebox" ? 20_000 : 2500,
      }),
      assetProxy: makeProxy(e.target, undefined, { preserveFrameGuards }),
    };
  });

  return {
    name: "astra-embed-proxy",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || "/";
        const pathname = url.split("?")[0];
        const ref = refererPath(req);
        const isWs = String(req.headers.upgrade || "").toLowerCase() === "websocket";

        for (const h of handlers) {
          if (pathname === h.prefix || pathname.startsWith(`${h.prefix}/`)) {
            return h.prefixProxy(req, res, next);
          }
        }

        // Never steal Vite's HMR websocket — that reloads the whole Astra UI.
        if (isWs) return next();

        // Iframe asset/API calls (document URL is /proxy/<svc>/…) — never steal
        // Astra's own Vite / src / node_modules paths.
        if (!isReserved(pathname) && !pathname.startsWith("/proxy/")) {
          for (const h of handlers) {
            if (ref === h.prefix || ref.startsWith(`${h.prefix}/`)) {
              return h.assetProxy(req, res, next);
            }
          }
        }

        next();
      });
    },
  };
}
