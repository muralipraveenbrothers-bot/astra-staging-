// pm2 ecosystem configuration for Astra services
// Canonical Smart Core (Always-On): AstraAPI, FreeLLMAPI, Hermes and Voicebox.
module.exports = {
  apps: [
    // FreeLLMAPI service - Primary LLM Gateway
    {
      name: 'FreeLLMAPI',
      script: 'node_modules/tsx/dist/cli.mjs',
      args: 'freellmapi/server/src/index.ts',
      interpreter: 'D:\\tools\\node-v22.22.3-win-x64\\node.exe',
      watch: false,
      env: {
        PORT: process.env.FREELLMAPI_PORT || '31415',
      },
      restart_delay: 5000,
      autorestart: true,
      max_memory_restart: '500M',
    },
    // Astra API - Core Backend
    {
      name: 'AstraAPI',
      script: 'server/index.ts',
      interpreter: 'node',
      interpreter_args: '-r ts-node/register',
      watch: false,
      env: {
        PORT: process.env.ASTRA_API_PORT || '3000',
      },
      restart_delay: 3000,
      autorestart: true,
      max_memory_restart: '800M',
    },
    // Hermes - Planning & Multi-step Orchestration
    {
      name: 'Hermes',
      // Official Hermes dashboard (hermes dashboard --port 9119) via start-hermes.cmd
      script: 'cmd.exe',
      args: '/d /s /c start-hermes.cmd',
      interpreter: 'none',
      cwd: __dirname,
      watch: false,
      restart_delay: 4000,
      autorestart: true,
    },
    // Voicebox - Speech Input/Output Engine (:17493)
    {
      name: 'Voicebox',
      script: 'src/astra/voice/voiceEngine.ts',
      interpreter: 'node',
      interpreter_args: '-r ts-node/register',
      watch: false,
      env: {
        PORT: process.env.VOICEBOX_PORT || '17493',
      },
      restart_delay: 5000,
      autorestart: true,
    },
  ],
};
