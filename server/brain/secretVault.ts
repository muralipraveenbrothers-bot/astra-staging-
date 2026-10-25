/**
 * Secret-vault reference surface for the Brain: capability lookups that never
 * return values, sink policy, and text scrubbing before secrets reach a prompt.
 */
import { getSecret, listSecretPresence } from "../services/secrets";

const SINK_ALLOWLIST = new Set(["vault", "gateway", "env", "logs-local"]);

export function capabilityReference(id: string): {
  ref: string;
  present: boolean;
  masked: "set" | "missing";
  source: string;
} {
  const present = listSecretPresence(id)[id] === true;
  return {
    ref: `vault://${id}`,
    present,
    masked: present ? "set" : "missing",
    source: "server/services/secrets.ts",
  };
}

export function environmentCapability(name: string): {
  ref: string;
  present: boolean;
  masked: "set" | "missing";
  source: string;
} {
  const value = process.env[name];
  const present = Boolean(value && value.trim() && !value.includes("xxxx"));
  return {
    ref: `env://${name}`,
    present,
    masked: present ? "set" : "missing",
    source: "process.env",
  };
}

export function assertNoSecretSink(sink: string): { allowed: boolean; reason: string } {
  const allowed = SINK_ALLOWLIST.has(sink);
  return {
    allowed,
    reason: allowed ? `${sink} is an approved secret sink` : `${sink} must never receive secret values`,
  };
}

const SECRET_ENV_SUFFIXES = ["_API_KEY", "_SECRET", "_TOKEN", "_KEY"];

function secretValues(): string[] {
  const values = new Set<string>();
  for (const [name, value] of Object.entries(process.env)) {
    if (!value || value.length < 8) continue;
    if (SECRET_ENV_SUFFIXES.some((s) => name.endsWith(s))) values.add(value);
  }
  for (const id of Object.keys(listSecretPresence())) {
    const value = getSecret(id);
    if (value && value.length >= 8) values.add(value);
  }
  return [...values].sort((a, b) => b.length - a.length);
}

export function scrubSecrets(text: string): string {
  let out = text;
  for (const value of secretValues()) {
    if (out.includes(value)) out = out.split(value).join("[redacted]");
  }
  // FreeLLMAPI unified keys follow the freellmapi-<token> shape.
  out = out.replace(/freellmapi-[A-Za-z0-9_-]{8,}/g, "[redacted]");
  return out;
}
