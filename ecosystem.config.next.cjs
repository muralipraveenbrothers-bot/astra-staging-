/**
 * ASTRA Stable — corrected full stack configuration (candidate).
 * ============================================================
 * This is the corrected replacement for ecosystem.config.cjs. It is NOT active
 * yet: prove ecosystem.recovery.config.cjs first, then activate this one with
 *
 *   pm2 delete all && pm2 start ecosystem.config.next.cjs
 *
 * Rules encoded here (enforced by server/astra/supervisor/stack-contract.spec.ts):
 *   • TypeScript is launched with Node 22 + tsx  — never `node foo.ts`,
 *     never `-r ts-node/register` under "type": "module" (that produced
 *     ERR_UNKNOWN_FILE_EXTENSION and crash-looped six services).
 *   • .cmd launchers run through `cmd.exe /d /s /c` in the FOREGROUND so PM2
 *     owns the real PID (the old `interpreter: "cmd"` opened a shell instead).
 *   • Ports come from config/ports.json only. FreeLLMAPI is 31415 everywhere.
 *   • No watch:true, no `pm2 restart all`, bounded restarts (min_uptime +
 *     max_restarts) so a broken service is isolated instead of looping.
 *   • Gesture Vision is deliberately ABSENT: src/features/saarathi/gesture is
 *     browser React + MediaPipe (getUserMedia). It is not a server.
 */
const ROOT = "D:\\Astra pmb\\astra-staging";
const NODE22 = "D:\\tools\\node-v22.22.3-win-x64\\node.exe";
const LOCAL = process.env.LOCALAPPDATA || "C:\\Users\\mural\\AppData\\Local";
const VOICEBOX_EXE = `${LOCAL}\\Voicebox\\voicebox-server.exe`;

/** Shared hardening: bounded restarts, no watchers, graceful kill. */
const base = {
  autorestart: true,
  restart_delay: 5000,
  min_uptime: "20s",
  max_restarts: 5,
  kill_timeout: 10000,
  listen_timeout: 15000,
  watch: false,
};

/** Windows launcher: foreground .cmd under cmd.exe, PM2 owns the PID. */
function viaCmd(name, launcher, extra = {}) {
  return {
    name,
    cwd: ROOT,
    script: "cmd.exe",
    args: ["/d", "/s", "/c", launcher],
    interpreter: "none",
    ...base,
    ...extra,
  };
}

module.exports = {
  apps: [
    // ── Core: Astra API (the only service Astra itself needs) ──────────────
    {
      name: "AstraAPI",
      cwd: ROOT,
      script: "node_modules/tsx/dist/cli.mjs",
      args: "server/index.ts",
      interpreter: NODE22,
      env: { NODE_ENV: "production", PORT: "3000" },
      ...base,
    },

    // ── AI route: FreeLLMAPI ───────────────────────────────────────────────
    // STANDBY, not a default app. Verified live on 2026-09-20 the desktop
    // FreeLLMAPI.exe (PID 11880) already owns 127.0.0.1:31415 and answers
    // /v1/models with HTTP 200 using the key in config/ai-gateway.env. Two
    // owners of one port is exactly the "connects to a zombie instance"
    // failure mode, so PM2 must not grab the port while the desktop app runs.
    //
    // To let PM2 own the gateway instead: close the desktop app, then
    // uncomment this block.
    //
    // {
    //   name: "FreeLLMAPI",
    //   cwd: `${ROOT}\\freellmapi\\server`,
    //   script: "dist/index.js",
    //   interpreter: NODE22,
    //   env: { NODE_ENV: "production", PORT: "31415" },
    //   ...base,
    // },

    // ── Voice: PM2 owns the real Voicebox server executable ───────────────
    {
      name: "Voicebox",
      cwd: ROOT,
      script: VOICEBOX_EXE,
      args: ["--host", "127.0.0.1", "--port", "17493"],
      interpreter: "none",
      ...base,
    },

    // ── Extensions: capabilities, never dependencies of Astra core ────────
    viaCmd("Hermes", "start-hermes.cmd"),

    // ── Intentionally NOT here ────────────────────────────────────────────
    // GestureService: src/features/saarathi/gesture/** is browser React +
    // MediaPipe (getUserMedia + camera). There is no HTTP listener in it, so
    // it can never be a PM2 service. Camera/model problems must surface inside
    // the Gesture panel only, never as a stack outage.
  ],
};
