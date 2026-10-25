/**
 * In-memory clip cache so a repeated sentence is not sent to Sarvam or Gemini again.
 * PHI is never stored. The cache is per provider, so one mouth cannot impersonate another.
 */

import { looksLikePhi } from "./phiGate";

const MAX_CLIPS = 32;

interface CachedClip {
  blob: Blob;
  provider: string;
}

const clips = new Map<string, CachedClip>();

export function voiceClipKey(provider: string, text: string, language: string): string {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
  return `${provider}|${language}|${normalized}`;
}

export function rememberVoiceClip(provider: string, text: string, language: string, blob: Blob): void {
  if (!text.trim() || looksLikePhi(text) || !blob || blob.size === 0) return;
  const key = voiceClipKey(provider, text, language);
  if (clips.has(key)) clips.delete(key);
  clips.set(key, { blob, provider });
  while (clips.size > MAX_CLIPS) {
    const oldest = clips.keys().next().value;
    if (oldest === undefined) break;
    clips.delete(oldest);
  }
}

export function peekVoiceClip(provider: string, text: string, language: string): CachedClip | null {
  if (looksLikePhi(text)) return null;
  return clips.get(voiceClipKey(provider, text, language)) ?? null;
}

/** Test-only reset so specs do not share spoken clips. */
export function clearVoiceClipCache(): void {
  clips.clear();
}
