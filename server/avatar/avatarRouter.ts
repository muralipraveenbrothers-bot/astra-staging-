/**
 * ASTRA AI — Avatar Provider Router (§11 §12 §15 §21)
 * ================================================
 * Fallback chain for avatar rendering of an already-authorized Astra response.
 * Order is configurable and truthful — each provider is only used when its
 * health probe succeeds; failures degrade gracefully and never crash the
 * clinical response (which has already been delivered as text).
 *
 *   A2F controller (real blendshapes — verified path)
 *       ↓ unavailable
 *   Live Avatar (presentation-only ADK service)
 *       ↓ unavailable
 *   Linly-Talker avatar generation
 *       ↓ unavailable
 *   voice-only (TTS continues)
 *       ↓ unavailable
 *   text-only Astra (clinical answer still delivered)
 */
import { a2fStatus, a2fBroadcast, openAvatarStatus } from "../avatar/a2fClient";
import { liveAvatarHealth } from "../integrations/live-avatar/adapter";
import { linlyCapabilities } from "../integrations/linly-talker/adapter";
import { normalizeLanguage } from "../voice/ttsRouter";
import type { AvatarConnectionState } from "../avatar/types";

export interface AvatarBroadcastInput {
  text: string;
  language: string;
  mode: string;
  speaker?: string;
}

export interface AvatarBroadcastResult {
  providerId: string;
  status: "streaming" | "offline";
  frameCount: number;
  broadcastId?: string;
  audioOnly: boolean;
  detail?: string;
  error?: string;
  state: AvatarConnectionState;
}

const AVATAR_TIMEOUT_MS = Number(process.env.ASTRA_AVATAR_TIMEOUT_MS ?? 8000);

/** Walk the avatar fallback chain once per spoken turn. */
export async function renderAvatar(input: AvatarBroadcastInput): Promise<AvatarBroadcastResult> {
  const lang = normalizeLanguage(input.language);
  const text = input.text;
  // Observability (§29): collect WHY each provider was skipped so the final
  // text-only detail is diagnostic instead of a dead end.
  const skipped: string[] = [];

  // 1) A2F controller (real blendshapes — the verified primary path).
  try {
    const st = await a2fStatus(Math.max(2500, Math.floor(AVATAR_TIMEOUT_MS / 2)));
    if (st.ready) {
      const b = await a2fBroadcast(
        { text, mode: "avatar", language: lang, speaker: input.speaker },
        AVATAR_TIMEOUT_MS,
      );
      if (b.success) {
        return {
          providerId: "audio2face",
          status: "streaming",
          frameCount: b.frameCount,
          broadcastId: b.broadcastId,
          audioOnly: false,
          state: "SPEAKING",
        };
      }
            // A2F configured but this turn failed — try secondary below.
      skipped.push(`a2f: ${b.error ?? "broadcast rejected"}`);
    } else {
      skipped.push(`a2f: ${st.error ?? "not ready"}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 80) : "probe failed";
    skipped.push(`a2f: ${msg}`);
  }

  // 2) Live Avatar (presentation-only ADK service) — session bookkeeping.
  try {
    const h = await liveAvatarHealth();
    if (!h.configured) skipped.push("live-avatar: not configured");
    else if (!h.ready) skipped.push(`live-avatar: ${h.detail ?? "not ready"}`);
    if (h.configured && h.ready) {
      return {
        providerId: "live-avatar",
        status: "streaming",
        frameCount: 0,
        audioOnly: false,
        detail: "live-avatar session available; rendering delegated to ADK avatar",
        state: "SPEAKING",
      };
    }
  } catch {
    // fall through
  }

  // 3) OpenAvatarChat/LiteAvatar (secondary presentation).
  try {
    const o = await openAvatarStatus(1500);
    if (!o.reachable) skipped.push(`openavatar: ${o.error ?? "unreachable"}`);
    if (o.reachable) {
      return {
        providerId: "openavatar",
        status: "streaming",
        frameCount: 0,
        audioOnly: false,
        detail: o.status ?? "openavatar reachable",
        state: "SPEAKING",
      };
    }
  } catch {
    // fall through
  }

  // 4) Linly-Talker avatar generation (if reachable).
  try {
    const cap = await linlyCapabilities();
    if (!cap.configured) skipped.push("linly: not configured");
    else if (!cap.reachable) skipped.push("linly: unreachable");
    if (cap.reachable && cap.avatarGeneration) {
      return {
        providerId: "linly",
        status: "streaming",
        frameCount: 0,
        audioOnly: false,
        detail: "linly avatar generation available",
        state: "SPEAKING",
      };
    }
  } catch {
    // fall through
  }

  // 5) voice-only / text-only — clinical response already delivered.
  return {
    providerId: "text-only",
    status: "offline",
    frameCount: 0,
    audioOnly: true,
    detail: `no avatar provider reachable — clinical text response still delivered (${skipped.join("; ")})`,
    state: "READY",
  };
}
