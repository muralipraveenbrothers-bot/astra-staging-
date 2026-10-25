import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import fs from "node:fs";
import path from "path";
import { astraEmbedProxyPlugin, stripFrameGuards } from "./vite.embed-proxy";
import { canonicalPort, portEntries } from "./server/astra/supervisor/portRegistry";

const FREELLMAPI_HOST = portEntries().freellmapi.host;
const FREELLMAPI_PORT = canonicalPort("freellmapi");

/** Shared Vite http-proxy configure: drop X-Frame-Options so Astra can iframe APIs. */
function allowAstraFrame(proxy: { on: (ev: string, fn: (...args: any[]) => void) => void }) {
  proxy.on("proxyReq", (proxyReq: import("http").ClientRequest) => {
    // Chat completions stream for tens of seconds. 2.5s aborted every
    // OpenAI-compatible /v1 call and made the UI look dead.
    proxyReq.setTimeout(60_000, () => proxyReq.destroy());
  });
  proxy.on("proxyRes", (proxyRes: import("http").IncomingMessage) => {
    stripFrameGuards(proxyRes);
  });
  // Offline upstreams must not crash Vite (WS errors pass a Socket, not ServerResponse).
  proxy.on("error", (_err: unknown, _req: unknown, res: { headersSent?: boolean; writeHead?: Function; end?: Function } | undefined) => {
    if (res && typeof res.writeHead === "function" && !res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end?.(JSON.stringify({ ok: false, error: "UPSTREAM_UNREACHABLE" }));
    }
  });
}

function apiProxy(target: string, extra: ProxyOptions = {}): ProxyOptions {
  return {
    target,
    changeOrigin: true,
    secure: false,
    // Hung upstreams must not stall Astra forever, but /v1/chat/completions
    // streams longer than 2.5s. Match gatewayManager's 60s budget.
    timeout: 60_000,
    proxyTimeout: 60_000,
    configure: allowAstraFrame,
    ...extra,
  };
}

export default defineConfig(({ mode }) => {
  const uiPort = Number(process.env.ASTRA_UI_PORT ?? 5173);
  const apiPort = Number(process.env.ASTRA_API_PORT ?? 3000);
  // `npm run dev:https` (mode "https") serves the app over TLS on 5443 so staff
  // laptops get a secure context for camera/mic. Normal `npm run dev` stays
  // plain HTTP on 5173. If mkcert certificates are provided via ASTRA_HTTPS_KEY
  // / ASTRA_HTTPS_CERT (files outside the repo), they are preferred over the
  // self-signed basic-ssl certificate so browsers don't warn.
  const httpsMode = mode === "https";
  const mkcertKeyPath = process.env.ASTRA_HTTPS_KEY;
  const mkcertCertPath = process.env.ASTRA_HTTPS_CERT;
  const mkcertReady =
    !!mkcertKeyPath && !!mkcertCertPath && fs.existsSync(mkcertKeyPath) && fs.existsSync(mkcertCertPath);

  return {
  // Keep dev-cache writes inside the isolated staging workspace. The staging
  // dependency directory is a read-only junction to the original install.
  cacheDir: ".vite-cache",
  plugins: [react(), astraEmbedProxyPlugin(), ...(httpsMode && !mkcertReady ? [basicSsl()] : [])],
  // ROOT CAUSE of "localhost:5173 refused to connect":
  // Vite's dev-server dependency scanner defaults to entries = "**/*.html".
  // That walks external module HTML, including
  //   modules/health-record-mcp/intrabrowser/public/ehr-mcp/index.html
  // whose index.tsx imports `jszip` and
  // `@jmandel/ehr-mcp/src/tools-browser-entry.js` (neither installed). The
  // scanner then fails hard with
  //   "Error: The following dependencies are imported but could not be resolved"
  // and `npm run dev` dies BEFORE port 5173 is bound, so the browser reports
  // ERR_CONNECTION_REFUSED. Evidence: logs/astra-vite.err.log.
  //
  // FIX: scope the scanner to Astra's real entry point so it never enters
  // external modules. `exclude` alone is NOT sufficient — it only disables
  // prebundling, not scanning/resolution.
  //
  // To re-enable the EHR intrabrowser feature: npm i jszip @jmandel/ehr-mcp
  optimizeDeps: {
    entries: ["index.html"],
    exclude: ["jszip", "@jmandel/ehr-mcp/src/tools-browser-entry.js", "@jmandel/ehr-mcp"],
    // Prebundle deps that only lazy dashboards import. Without this, the first
    // visit discovers them, Vite invalidates the dep cache, and open pages go
    // blank with "504 Outdated Optimize Dep".
    include: [
      "three",
      "three/examples/jsm/utils/BufferGeometryUtils.js",
      "@react-three/fiber",
      "@react-three/drei",
      "qrcode",
      "qrcode.react",
      "recharts",
      "@mediapipe/tasks-vision",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    headers: {
      // Serve binary anatomy model chunks uncompressed so byteLength checks pass
      "Content-Encoding": "identity",
    },
    // Astra's dedicated frontend port. FreeLLMAPI owns its own registry port.
    // Model-routing layer (OpenAI-compatible /v1):
    //   Agents call Astra /v1 (proxied below) — Central AI Adapter
    //   PRIMARY        FreeLLMAPI  /proxy/freellmapi/v1
    //   LOCAL FALLBACK Ollama      /proxy/ollama/v1
    port: httpsMode ? 5443 : uiPort,
    strictPort: true,
    // Dual-stack any-address. Windows Chrome resolves `localhost` to ::1 first;
    // IPv4-only 0.0.0.0 makes http://localhost:5173 look dead while 127.0.0.1 works.
    host: "::",
    ...(httpsMode && mkcertReady
      ? { https: { key: fs.readFileSync(mkcertKeyPath!), cert: fs.readFileSync(mkcertCertPath!) } }
      : {}),
    // Without mkcert, basicSsl() (added above) generates and injects its own
    // self-signed server.https certificate — never set `https: true` here.
    // No hmr.host: the client must use the page's own host so LAN staff laptops
    // (http://192.168.1.46:5173) get a working live-reload websocket instead of
    // dialing "localhost" on their own machine. Same port as the page.
    hmr: {
      protocol: "ws",
      port: httpsMode ? 5443 : uiPort,
    },
    // Nested runtimes (FreeLLMAPI logs, hospital.json, …)
    // write continuously. Watching them full-reloads Astra and makes the
    // dashboard blink. Only src/ + config entrypoints should trigger HMR.
    watch: {
      ignored: [
        "**/.git/**",
        "**/node_modules/**",
        "**/*.log",
        "**/*.tsbuildinfo",
        "**/vite.config.ts.timestamp-*.mjs",
        "**/*.timestamp-*.mjs",
        "**/data/**",
        "**/logs/**",
        "**/dist/**",
        "**/modules/**",
        "**/freellmapi/**",
        "**/config/plugins/**",
        "**/OpenAvatarChat/**",
        "**/OpenAvatarChat/**",
        "**/knowledge-data/**",
        "**/.build/**",
        "**/graphify-out/**",
        "**/scripts/**",
      ],
    },
    proxy: {
      // FreeLLMAPI unified router — /proxy/freellmapi/v1/chat/completions
      //   → canonical FreeLLMAPI process (the
      //     retired legacy API port must never be targeted here).
      // HTTP only: ws:true on these prefixes can steal Vite's HMR upgrade
      // and freeze the UI as a blank page. Chat uses SSE, not websockets.
      "/proxy/freellmapi": apiProxy(`http://${FREELLMAPI_HOST}:${FREELLMAPI_PORT}`, {
        rewrite: (p) => p.replace(/^\/proxy\/freellmapi/, ""),
      }),
      // Ollama local runtime
      "/proxy/ollama": apiProxy("http://127.0.0.1:11434", {
        rewrite: (p) => p.replace(/^\/proxy\/ollama/, ""),
      }),
      // Hermes Agent official web dashboard (iframe stays on :9119; this is health/API only)
      "/proxy/hermes": apiProxy("http://127.0.0.1:9119", {
        rewrite: (p) => p.replace(/^\/proxy\/hermes/, ""),
      }),
      // All /api/* endpoints (plugins, agents, auth, health, etc.) are
      // served by the Astra AI Hospital OS server on port 3000.
      "/api": apiProxy(`http://127.0.0.1:${apiPort}`),
      // Central AI Adapter OpenAI-compatible surface (same process as /api).
      "/v1": apiProxy(`http://127.0.0.1:${apiPort}`),
    },
  },
  };
});
