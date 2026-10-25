import type { AstraEventEnvelope, FlightRecorderEvent } from "@/astra/events/astraEventBus";

export type HudTone = "cyan" | "emerald" | "amber" | "red" | "neutral";

export interface HudGauge {
  id: string;
  label: string;
  value: number | null;
  display: string;
  tone: HudTone;
  state: "LIVE" | "DEGRADED" | "OFFLINE" | "UNKNOWN";
  detail: string;
}

export interface HudFlowEvent {
  id: string;
  label: string;
  source: string;
  target: string;
  tone: HudTone;
  at: string;
}

export function clampPercent(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function gaugeTone(value: number | null, invert = false): HudTone {
  if (value === null) return "neutral";
  if (invert) {
    if (value >= 85) return "emerald";
    if (value >= 60) return "amber";
    return "red";
  }
  if (value >= 90) return "red";
  if (value >= 75) return "amber";
  return "emerald";
}

export function metricToGauge(input: {
  id: string;
  label: string;
  value?: number | null;
  total?: number;
  liveCount?: number;
  display?: string;
  detail?: string;
  invert?: boolean;
}): HudGauge {
  const value = clampPercent(
    typeof input.value === "number"
      ? input.value
      : typeof input.liveCount === "number" && typeof input.total === "number" && input.total > 0
        ? (input.liveCount / input.total) * 100
        : null,
  );
  const tone = gaugeTone(value, input.invert);
  return {
    id: input.id,
    label: input.label,
    value,
    display: input.display ?? (value === null ? "No data" : `${value}%`),
    tone,
    state: value === null ? "UNKNOWN" : tone === "red" ? "DEGRADED" : "LIVE",
    detail: input.detail ?? "Live hospital store",
  };
}

export function eventTone(eventType: string, riskClass?: string): HudTone {
  const text = `${eventType} ${riskClass ?? ""}`.toLowerCase();
  if (text.includes("critical") || text.includes("alert") || text.includes("failed") || text.includes("r4")) return "red";
  if (text.includes("billing") || text.includes("pharmacy") || text.includes("lab") || text.includes("r3")) return "amber";
  if (text.includes("ready") || text.includes("completed") || text.includes("sent")) return "emerald";
  return "cyan";
}

export function eventToFlow(event: FlightRecorderEvent | AstraEventEnvelope): HudFlowEvent {
  return {
    id: event.eventId,
    label: event.eventType || "event",
    source: event.source || "integration",
    target: event.target || "command",
    tone: eventTone(event.eventType, event.riskClass),
    at: event.timestamp,
  };
}
