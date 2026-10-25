/** Browser + Node universal UUID v4 — avoids `import { randomUUID } from "node:crypto"` which breaks Vite's browser build. */
const randomUUID: () => string =
  typeof globalThis.crypto?.randomUUID === "function"
    ? () => globalThis.crypto.randomUUID()
    : () => "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (+c ^ (Math.random() * 16 >> (+c / 4))).toString(16));

export type AstraRiskClass = "R0" | "R1" | "R2" | "R3" | "R4";
export type AstraPrivacyClass = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "PHI" | "HIGH_RISK_CLINICAL";

export interface AstraEventEnvelope<TPayload = unknown> {
  eventId: string;
  correlationId: string;
  causationId: string;
  timestamp: string;
  source: string;
  target: string;
  eventType: string;
  patientRef?: string;
  encounterId?: string;
  actorId: string;
  actorRole: string;
  privacyClass: AstraPrivacyClass;
  riskClass: AstraRiskClass;
  payload: TPayload;
  schemaVersion: string;
}

export interface AstraEventBus {
  publish(event: Partial<AstraEventEnvelope>): Promise<AstraEventEnvelope>;
  subscribe(eventType: string, handler: (event: AstraEventEnvelope) => void | Promise<void>): () => void;
  request(event: Partial<AstraEventEnvelope>, timeoutMs?: number): Promise<AstraEventEnvelope>;
  reply(request: AstraEventEnvelope, payload: unknown, overrides?: Partial<AstraEventEnvelope>): Promise<AstraEventEnvelope>;
  health(): { status: "HEALTHY" | "DEGRADED"; subscribers: number; traces: number };
}

export interface FlightRecorderEvent {
  eventId: string;
  correlationId: string;
  causationId: string;
  timestamp: string;
  source: string;
  target: string;
  eventType: string;
  actorId: string;
  actorRole: string;
  privacyClass: AstraPrivacyClass;
  riskClass: AstraRiskClass;
  schemaVersion: string;
  payloadRedacted: true;
}

const RISK: readonly AstraRiskClass[] = ["R0", "R1", "R2", "R3", "R4"];
const PRIVACY: readonly AstraPrivacyClass[] = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "PHI", "HIGH_RISK_CLINICAL"];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateAstraEventEnvelope(event: Partial<AstraEventEnvelope>): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  for (const key of ["eventId", "correlationId", "causationId", "timestamp", "source", "target", "eventType", "actorId", "actorRole", "privacyClass", "riskClass", "schemaVersion"] as const) {
    if (typeof event[key] !== "string" || event[key] === "") errors.push(`${key} is required`);
  }
  if (!RISK.includes(event.riskClass as AstraRiskClass)) errors.push("riskClass is invalid");
  if (!PRIVACY.includes(event.privacyClass as AstraPrivacyClass)) errors.push("privacyClass is invalid");
  if (!isObject(event.payload)) errors.push("payload must be an object");
  if (event.timestamp && Number.isNaN(Date.parse(event.timestamp))) errors.push("timestamp is invalid");
  return errors.length ? { ok: false, errors } : { ok: true };
}

class InProcessAstraEventBus implements AstraEventBus {
  private handlers = new Map<string, Set<(event: AstraEventEnvelope) => void | Promise<void>>>();
  private traces: FlightRecorderEvent[] = [];

  async publish(event: Partial<AstraEventEnvelope>): Promise<AstraEventEnvelope> {
    const envelope = this.complete(event);
    const validation = validateAstraEventEnvelope(envelope);
    if (!validation.ok) throw new Error(`ASTRA_EVENT_SCHEMA_REJECTED: ${validation.errors.join(", ")}`);
    this.record(envelope);
    const handlers = [...(this.handlers.get(envelope.eventType) ?? []), ...(this.handlers.get("*") ?? [])];
    await Promise.all(handlers.map((handler) => handler(envelope)));
    return envelope;
  }

  subscribe(eventType: string, handler: (event: AstraEventEnvelope) => void | Promise<void>): () => void {
    const set = this.handlers.get(eventType) ?? new Set();
    set.add(handler);
    this.handlers.set(eventType, set);
    return () => set.delete(handler);
  }

  async request(event: Partial<AstraEventEnvelope>, timeoutMs = 1000): Promise<AstraEventEnvelope> {
    const correlationId = event.correlationId || randomUUID();
    const replyType = `${event.eventType}.reply`;
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        unsubscribe();
        reject(new Error("ASTRA_EVENT_REQUEST_TIMEOUT"));
      }, timeoutMs);
      const unsubscribe = this.subscribe(replyType, (reply) => {
        if (reply.correlationId !== correlationId) return;
        clearTimeout(timer);
        unsubscribe();
        resolve(reply);
      });
      this.publish({ ...event, correlationId }).catch((err) => {
        clearTimeout(timer);
        unsubscribe();
        reject(err);
      });
    });
  }

  async reply(request: AstraEventEnvelope, payload: unknown, overrides: Partial<AstraEventEnvelope> = {}): Promise<AstraEventEnvelope> {
    return this.publish({
      source: request.target,
      target: request.source,
      eventType: `${request.eventType}.reply`,
      actorId: request.actorId,
      actorRole: request.actorRole,
      privacyClass: request.privacyClass,
      riskClass: request.riskClass,
      ...overrides,
      correlationId: request.correlationId,
      causationId: request.eventId,
      payload,
    });
  }

  health() {
    return { status: "HEALTHY" as const, subscribers: [...this.handlers.values()].reduce((sum, set) => sum + set.size, 0), traces: this.traces.length };
  }

  flightRecorderSnapshot(): FlightRecorderEvent[] {
    return [...this.traces];
  }

  clearFlightRecorder(): void {
    this.traces = [];
  }

  private complete(event: Partial<AstraEventEnvelope>): AstraEventEnvelope {
    const correlationId = event.correlationId || randomUUID();
    return {
      eventId: event.eventId || randomUUID(),
      correlationId,
      causationId: event.causationId || correlationId,
      timestamp: event.timestamp || new Date().toISOString(),
      source: event.source || "astra-api",
      target: event.target || "astra-api",
      eventType: event.eventType || "",
      actorId: event.actorId || "system",
      actorRole: event.actorRole || "system",
      privacyClass: event.privacyClass || "INTERNAL",
      riskClass: event.riskClass || "R0",
      payload: isObject(event.payload) ? event.payload : {},
      schemaVersion: event.schemaVersion || "1.0",
      patientRef: event.patientRef,
      encounterId: event.encounterId,
    };
  }

  private record(event: AstraEventEnvelope): void {
    this.traces.push({
      eventId: event.eventId,
      correlationId: event.correlationId,
      causationId: event.causationId,
      timestamp: event.timestamp,
      source: event.source,
      target: event.target,
      eventType: event.eventType,
      actorId: event.actorId,
      actorRole: event.actorRole,
      privacyClass: event.privacyClass,
      riskClass: event.riskClass,
      schemaVersion: event.schemaVersion,
      payloadRedacted: true,
    });
  }
}

export const astraEventBus = new InProcessAstraEventBus();
