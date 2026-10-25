/**
 * ASTRA AI — Avatar fallback-chain tests (§11 / §21 / §36)
 * ========================================================
 * The chain must be truthful at every hop:
 *   - A2F reachable+ready     → providerId "audio2face", streaming
 *   - A2F unreachable + none of Live Avatar/OpenAvatar/Linly configured →
 *     honest "text-only" OFFLINE result (never a fabricated CONNECTED)
 *   - the function must not throw when every provider is down
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

let a2fStub: http.Server;
let a2fPort = 0;

beforeAll(async () => {
  a2fStub = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if ((req.url ?? "").includes("/status")) {
      res.end(JSON.stringify({ status: "READY", engine: "NVIDIA_AUDIO2FACE_3D" }));
    } else {
      res.end(JSON.stringify({ success: true, broadcast: { id: "BC-TEST", frameCount: 12 } }));
    }
  });
  await new Promise<void>((resolve) => a2fStub.listen(0, "127.0.0.1", resolve));
  a2fPort = (a2fStub.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => a2fStub.close(() => resolve()));
  vi.unstubAllEnvs();
});

async function loadRouter() {
  vi.resetModules();
  const mod = await import("./avatarRouter");
  return mod;
}

describe("avatarRouter fallback chain", () => {
  it("uses audio2face when the A2F controller is reachable and ready", async () => {
    process.env.A2F_CONTROLLER_URL = `http://127.0.0.1:${a2fPort}`;
    process.env.LIVE_AVATAR_ENABLED = "false";
    process.env.LINLY_ENABLED = "false";
    const { renderAvatar } = await loadRouter();
    const r = await renderAvatar({ text: "hello", language: "en-IN", mode: "doctor" });
    expect(r.providerId).toBe("audio2face");
    expect(r.status).toBe("streaming");
    expect(r.frameCount).toBe(12);
    expect(r.broadcastId).toBe("BC-TEST");
  });

  it("degrades honestly to text-only when no avatar provider is reachable", async () => {
    process.env.A2F_CONTROLLER_URL = "http://127.0.0.1:1"; // unreachable port
    process.env.LIVE_AVATAR_ENABLED = "false";
    process.env.LINLY_ENABLED = "false";
    process.env.OPENAVATAR_URL = "http://127.0.0.1:1";
    const { renderAvatar } = await loadRouter();
    const r = await renderAvatar({ text: "hello", language: "te-IN", mode: "doctor" });
    expect(r.providerId).toBe("text-only");
    expect(r.status).toBe("offline");
    expect(r.audioOnly).toBe(true);
    expect(r.frameCount).toBe(0);
  });

  it("never throws when every provider probe fails", async () => {
    process.env.A2F_CONTROLLER_URL = "http://127.0.0.1:1";
    process.env.LIVE_AVATAR_ENABLED = "false";
    process.env.LINLY_ENABLED = "false";
    process.env.OPENAVATAR_URL = "http://127.0.0.1:1";
    const { renderAvatar } = await loadRouter();
    await expect(renderAvatar({ text: "x", language: "hi-IN", mode: "receptionist" })).resolves.toBeTruthy();
  });
});
