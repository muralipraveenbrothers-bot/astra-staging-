import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import net from "net";
import { fileURLToPath } from "url";
import { FREELLM_PORTS, getActiveLLMEndpoint } from "./freellm-config.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.AGENT_BRIDGE_PORT || FREELLM_PORTS.AGENT_BRIDGE;

app.use(cors({ origin: "*" }));
app.use(express.json());

const INTEGRATIONS_DIR = path.resolve(__dirname);
const BAREHANDS_DIR = path.join(INTEGRATIONS_DIR, "barehands");
const VISUALIZER_DIR = path.join(INTEGRATIONS_DIR, "ai-visualizer");

// Ensure state directories exist
const barehandsStateDir = path.join(BAREHANDS_DIR, "state");
if (!fs.existsSync(barehandsStateDir)) {
  fs.mkdirSync(barehandsStateDir, { recursive: true });
}

interface AgentInfo {
  id: string;
  name: string;
  type: string;
  port?: number;
  status: "active" | "standby" | "offline";
  description: string;
  capabilities: string[];
}

/**
 * REAL liveness probe: a TCP connect to the agent's port.
 * The old implementation derived status from fs.existsSync on a directory,
 * so any folder that merely existed reported "standby" — a folder is not a
 * running process. Now "active" requires an actual listener on the port,
 * "offline" means the port is closed, and agents without a known port (their
 * runtimes are launched externally and expose no health surface) honestly
 * report "standby" = installed, not verified running.
 */
function probePort(host: string, port: number, timeoutMs = 900): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const onDone = (ok: boolean) => {
      try { socket.destroy(); } catch { /* already closed */ }
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => onDone(true));
    socket.once("timeout", () => onDone(false));
    socket.once("error", () => onDone(false));
    socket.connect(port, host);
  });
}

// Health endpoint
app.get("/health", async (_req, res) => {
  const llmEndpoint = await getActiveLLMEndpoint();
  res.json({
    status: "ok",
    service: "astra-agent-bridge",
    port: PORT,
    activeLLM: llmEndpoint,
    timestamp: new Date().toISOString(),
  });
});

// List all connected agents — statuses from REAL port probes, never fs.existsSync
app.get("/api/agents", async (_req, res) => {
  const host = "127.0.0.1";
  const [barehandsUp, visualizerUp] = await Promise.all([
    probePort(host, FREELLM_PORTS.BAREHANDS),
    probePort(host, FREELLM_PORTS.AI_VISUALIZER),
  ]);

  const agents: AgentInfo[] = [
    {
      id: "fullstack-agent",
      name: "Fullstack Agent Hub",
      type: "orchestrator",
      // No known port/health surface — directory presence only proves install.
      status: fs.existsSync(path.join(INTEGRATIONS_DIR, "fullstack-agent")) ? "standby" : "offline",
      description: "Full-stack memory, voice, face and hand controller wizard",
      capabilities: ["memory", "voice", "hands", "visualizer"],
    },
    {
      id: "barehands",
      name: "Barehands Air-Board",
      type: "spatial-input",
      port: FREELLM_PORTS.BAREHANDS,
      status: barehandsUp ? "active" : "offline",
      description: "Webcam hand-tracked spatial interaction air-board",
      capabilities: ["hand-tracking", "gesture-control", "spatial-notes"],
    },
    {
      id: "ai-visualizer",
      name: "AI Visualizer Face",
      type: "avatar-display",
      port: FREELLM_PORTS.AI_VISUALIZER,
      status: visualizerUp ? "active" : "offline",
      description: "Real-time avatar face & audio waveform visualizer",
      capabilities: ["face-animation", "waveform-sync", "mood-display"],
    },
    {
      id: "linly-talker",
      name: "Linly-Talker",
      type: "talking-head",
      status: fs.existsSync(path.join(INTEGRATIONS_DIR, "linly-talker")) ? "standby" : "offline",
      description: "Neural talking-head visual lip-sync",
      capabilities: ["lip-sync", "video-avatar"],
    },
    {
      id: "live-avatar",
      name: "Live Avatar Agent",
      type: "webrtc-streamer",
      status: fs.existsSync(path.join(INTEGRATIONS_DIR, "live-avatar-agent")) ? "standby" : "offline",
      description: "Real-time interactive WebRTC avatar",
      capabilities: ["webrtc", "bidirectional-stream"],
    },
  ];

  res.json({ success: true, count: agents.length, agents });
});

// Broadcast voice & thinking state to Barehands and AI Visualizer
app.post("/api/agents/state", (req, res) => {
  const { state, mood = "green", level = 0.5, samples = [] } = req.body;
  const validStates = ["idle", "listening", "thinking", "speaking"];
  const targetState = validStates.includes(state) ? state : "idle";

  try {
    // 1. Update barehands state
    fs.writeFileSync(path.join(barehandsStateDir, "state"), targetState, "utf8");
    fs.writeFileSync(
      path.join(barehandsStateDir, "mood.json"),
      JSON.stringify({ mood, ts: Math.floor(Date.now() / 1000) }),
      "utf8"
    );

    // 2. Update ai-visualizer state files
    fs.writeFileSync(path.join(VISUALIZER_DIR, ".voice_state"), targetState, "utf8");
    fs.writeFileSync(
      path.join(VISUALIZER_DIR, ".voice_waveform"),
      JSON.stringify({ ts: Date.now(), samples: samples.length ? samples : new Array(64).fill(0) }),
      "utf8"
    );

    res.json({ success: true, state: targetState, mood, level });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to broadcast state", details: err?.message });
  }
});

// Proxy command to barehands air-board
app.post("/api/agents/barehands/cmd", (req, res) => {
  const { cmd, args } = req.body;
  // Commands are queued for barehands polling
  try {
    const queueFile = path.join(barehandsStateDir, "pending_cmds.json");
    let queue: any[] = [];
    if (fs.existsSync(queueFile)) {
      try {
        queue = JSON.parse(fs.readFileSync(queueFile, "utf8"));
      } catch {
        queue = [];
      }
    }
    queue.push({ cmd, args, ts: Date.now() });
    fs.writeFileSync(queueFile, JSON.stringify(queue), "utf8");
    res.json({ success: true, queued: true, cmd });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to queue barehands command", details: err?.message });
  }
});

app.listen(PORT, () => {
  console.log(`[AgentBridge] Listening on port ${PORT}`);
  console.log(`[AgentBridge] Barehands state mapped to ${barehandsStateDir}`);
  console.log(`[AgentBridge] AI Visualizer state mapped to ${VISUALIZER_DIR}`);
});

export default app;
