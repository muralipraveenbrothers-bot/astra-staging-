import type { Express, Request, Response } from "express";
import os from "node:os";
import net from "node:net";
import { authenticate } from "../rbac";

const VITE_PORT = 5173;
const HTTPS_PORT = 5443;

// Virtual adapters are useless for staff laptops; only real LAN NICs matter.
const SKIP_IFACE = /docker|vethernet|wsl|tailscale|loopback|vmware|virtualbox|hamachi|zerotier|bluetooth/i;

function privateIPv4s(): string[] {
  const out: string[] = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (SKIP_IFACE.test(name)) continue;
    for (const addr of addrs ?? []) {
      if (addr.family !== "IPv4" || addr.internal) continue;
      if (/^(10\.\d{1,3}\.|192\.168\.\d{1,3}\.|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.)$/.test(`${addr.address}.`)) out.push(addr.address);
    }
  }
  return [...new Set(out)];
}

function isPortListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    const done = (ok: boolean) => { socket.destroy(); resolve(ok); };
    socket.setTimeout(400);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

export function registerSystemLanRoutes(app: Express) {
  app.get("/api/system/lan-info", authenticate, async (_req: Request, res: Response) => {
    const httpsRunning = await isPortListening(HTTPS_PORT);
    res.json({
      addresses: privateIPv4s(),
      vitePort: VITE_PORT,
      httpsPort: HTTPS_PORT,
      httpsRunning,
    });
  });
}
