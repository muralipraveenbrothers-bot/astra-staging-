/**
 * ASTRA Stable — recovery configuration (Step 1 of the stability plan).
 * ====================================================================
 * Deliberately minimal: only the two services that prove the fix works.
 * It replaces the confirmed-broken pattern
 *     script: "*.ts" + interpreter: "node" + "-r ts-node/register"
 * with Node 22 + tsx (TypeScript) and Node 22 + compiled dist (FreeLLMAPI).
 *
 * Start:  pm2 start ecosystem.recovery.config.cjs
 * Undo:   pm2 delete AstraAPI-Recovery FreeLLMAPI-Recovery
 *
 * Do NOT `pm2 save` until scripts/verify-stack.mjs reports every service green.
 */
const ROOT = "D:\\Astra pmb\\astra-staging";
const NODE22 = "D:\\tools\\node-v22.22.3-win-x64\\node.exe";

module.exports = {
  apps: [
    {
      name: "AstraAPI-Recovery",

      cwd: ROOT,

      script: "node_modules/tsx/dist/cli.mjs",
      args: "server/index.ts",

      interpreter: NODE22,

      autorestart: true,
      restart_delay: 5000,
      min_uptime: "20s",
      max_restarts: 5,

      watch: false,

      kill_timeout: 10000,

      env: {
        NODE_ENV: "production",
      },
    },

    {
      name: "FreeLLMAPI-Recovery",

      cwd: ROOT + "\\freellmapi\\server",

      script: "dist/index.js",
      interpreter: NODE22,

      autorestart: true,
      restart_delay: 5000,
      min_uptime: "20s",
      max_restarts: 5,

      watch: false,

      kill_timeout: 10000,

      env: {
        NODE_ENV: "production",
        PORT: "31415",
      },
    },
  ],
};
