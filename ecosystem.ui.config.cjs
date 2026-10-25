/**
 * ASTRA Stable — UI-only PM2 config.
 * =================================
 * `pm2 start cmd.exe -- /d /s /c ...` from the CLI drops the arguments and
 * opens an INTERACTIVE cmd (banner + prompt in the log, vite never starts).
 * A config file passes args reliably; this is the same pattern validated by
 * the stack contract for every cmd launcher.
 *
 *   pm2 delete AstraUI ; pm2 start ecosystem.ui.config.cjs
 */
const ROOT = "D:\\Astra pmb\\astra-staging";

module.exports = {
  apps: [
    {
      name: "AstraUI",
      cwd: ROOT,
      script: "cmd.exe",
      args: ["/d", "/s", "/c", "start-astra-vite.cmd"],
      interpreter: "none",
      autorestart: true,
      restart_delay: 5000,
      min_uptime: "20s",
      max_restarts: 5,
      kill_timeout: 10000,
      watch: false,
    },
  ],
};
