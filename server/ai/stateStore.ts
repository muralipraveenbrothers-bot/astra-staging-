/**
 * ASTRA AI — CENTRAL STATE DB (system setup, item 3)
 * ============================================================================
 * Snapshot of the Astra command-center state, persisted to data/astra-state.json:
 *   - agent status (Hermes, LangGraph, Paperclip, OpenClaw, n8n, Agent Zero, OpenHands)
 *   - API health (FreeLLMAPI primary / OmniRoute fallback / Ollama local)
 *   - voice settings (Voicebox service, enabled across dashboards)
 *   - avatar presence (OpenAvatarChat + LiteAvatar module)
 *   - video call availability (client-side WebRTC surface)
 * Every API call is additionally appended to data/ai-calls.jsonl (see ./log.ts).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { collectAiHealth } from "./health";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DATA_DIR = path.join(ROOT, "data");
const STATE_PATH = path.join(DATA_DIR, "astra-state.json");

const AGENT_IDS = ["hermes", "langgraph", "paperclip", "openclaw", "n8n", "agentzero", "openhands"] as const;

export interface CentralStateSnapshot {
  savedAt: string;
  agents: Record<
    string,
    { name: string; online: boolean; status: "ONLINE" | "OFFLINE" | "DEGRADED"; endpoint: string; dashboardUrl: string; latencyMs: number; error?: string }
  >;
  api: {
    primary: { id: string; online: boolean; endpoint: string };
    fallback: { id: string; online: boolean; endpoint: string };
    local: { id: string; online: boolean; endpoint: string };
    callLog: string;
  };
  voice: { voiceboxOnline: boolean; engine: string; settingsDb: string };
  avatar: { modulePresent: boolean; presence: string };
  videoCall: { available: boolean; transport: string; surface: string };
}

function fileExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

export async function buildCentralState(): Promise<CentralStateSnapshot> {
  const health = await collectAiHealth();
  const s = health.services;

  const agents = Object.fromEntries(
    AGENT_IDS.map((id) => {
      const h = s[id];
      return [
        id,
        {
          name: h?.name ?? id,
          online: Boolean(h?.reachable),
          status: !h?.reachable ? ("OFFLINE" as const) : h.error ? ("DEGRADED" as const) : ("ONLINE" as const),
          endpoint: h?.endpoint ?? "",
          dashboardUrl: h?.dashboardUrl ?? "",
          latencyMs: h?.latencyMs ?? 0,
          ...(h?.error ? { error: h.error } : {}),
        },
      ];
    }),
  );

  const avatarModulePresent =
    fileExists(path.join(ROOT, "modules", "OpenAvatarChat")) || fileExists(path.join(ROOT, "OpenAvatarChat"));

  return {
    savedAt: new Date().toISOString(),
    agents,
    api: {
      primary: { id: "freellmapi", online: Boolean(s.freellmapi?.reachable), endpoint: s.freellmapi?.endpoint ?? "" },
      fallback: { id: "omniroute", online: Boolean(s.omniroute?.reachable), endpoint: s.omniroute?.endpoint ?? "" },
      local: { id: "ollama", online: Boolean(s.ollama?.reachable), endpoint: s.ollama?.endpoint ?? "" },
      callLog: "data/ai-calls.jsonl",
    },
    voice: {
      voiceboxOnline: Boolean(s.voicebox?.reachable),
      engine: "Voicebox :17493 — local neural speech; no Windows/browser speech output fallback",
      settingsDb: "data/voicebox.db",
    },
    avatar: {
      modulePresent: avatarModulePresent,
      presence: "AvatarOrb + AstraAvatar (OpenAvatarChat + LiteAvatar) across Astra dashboards",
    },
    videoCall: {
      available: true,
      transport: "WebRTC (client-side, browser-to-browser)",
      surface: "DoctorDashboard / PatientWorkspaceModal — Start Live Video Call",
    },
  };
}

/** Build AND persist the snapshot — call from test-all and GET /api/ai/state. */
export async function saveCentralState(): Promise<CentralStateSnapshot> {
  const snapshot = await buildCentralState();
  try {
    if (!fileExists(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(snapshot, null, 2) + "\n");
  } catch {
    /* best-effort persistence */
  }
  return snapshot;
}
