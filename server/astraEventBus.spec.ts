import { describe, expect, it, beforeEach } from "vitest";
import { astraEventBus } from "../src/astra/events/astraEventBus";

beforeEach(() => astraEventBus.clearFlightRecorder());

describe("astra event bus", () => {
  it("publishes and subscribes", async () => {
    const seen: string[] = [];
    const off = astraEventBus.subscribe("hospital.ping", (event) => seen.push(event.correlationId));
    const event = await astraEventBus.publish({ eventType: "hospital.ping", actorId: "u1", actorRole: "doctor", payload: { ok: true } });
    off();
    expect(seen).toEqual([event.correlationId]);
    expect(astraEventBus.flightRecorderSnapshot()[0]).toMatchObject({ eventId: event.eventId, payloadRedacted: true });
  });

  it("supports request and reply with correlation propagation", async () => {
    const off = astraEventBus.subscribe("tool.echo", async (event) => {
      await astraEventBus.reply(event, { echoed: true });
    });
    const reply = await astraEventBus.request({ eventType: "tool.echo", actorId: "u1", actorRole: "doctor", payload: { q: "x" } });
    off();
    expect(reply.eventType).toBe("tool.echo.reply");
    expect(reply.causationId).toBeTruthy();
    expect(reply.correlationId).toBe(astraEventBus.flightRecorderSnapshot()[0].correlationId);
  });

  it("rejects invalid schemas", async () => {
    await expect(astraEventBus.publish({ eventType: "bad", privacyClass: "NOPE" as never, payload: { ok: true } })).rejects.toThrow(/SCHEMA_REJECTED/);
  });
});
