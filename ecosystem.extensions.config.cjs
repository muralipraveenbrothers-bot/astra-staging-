/**
 * ASTRA Stable — Tier-3 extension services (start on demand).
 * =========================================================
 * Everything in here is a CAPABILITY, never a dependency of Astra core:
 * if any of these crash or stay down, Astra keeps running (that guarantee is
 * enforced by server/astra/supervisor/stack-contract.spec.ts).
 *
 *   pm2 start ecosystem.extensions.config.cjs
 *
 * All cmd launchers use the validated pattern (cmd.exe /d /s /c + interpreter
 * none) because the CLI form `pm2 start cmd.exe -- /d /s /c ...` silently drops
 * the arguments and opens an interactive cmd instead.
 */
const ROOT = "D:\\Astra pmb\\astra-staging";
const ROUTELLM_PY = `${ROOT}\\modules\\RouteLLM\\venv312\\Scripts\\python.exe`;

const base = {
  autorestart: true,
  restart_delay: 5000,
  min_uptime: "20s",
  max_restarts: 5,
  kill_timeout: 10000,
  listen_timeout: 15000,
  watch: false,
};

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
    // Cost/quality router. Routes to the CANONICAL gateway port 31415.
    {
      name: "RouteLLM",
      cwd: ROOT,
      script: "modules/RouteLLM/routellm/openai_server.py",
      interpreter: ROUTELLM_PY,
      env: {
        PORT: "6060",
        OPENAI_API_BASE: "http://127.0.0.1:31415/v1",
        OPENAI_API_KEY: "dummy",
      },
      max_memory_restart: "400M",
      ...base,
    },

    // Optional typed-decision router; this remains isolated from Astra core.
    viaCmd("Laya", "scripts\\start-laya.cmd"),

    viaCmd("Hermes", "start-hermes.cmd"),
  ],
};
