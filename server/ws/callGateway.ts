import type { Server as HttpServer, IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { validateSessionToken } from "../rbac";
// `UserSession` is declared in ../types and merely *used* by ../rbac, which does
// not re-export it. Importing it from ../rbac was a TS2459 (declared locally but
// not exported).
import type { UserSession } from "../types";

const PATH = "/ws/staff-call";
const rooms = new Map<string, Set<WebSocket>>();
const metadata = new WeakMap<WebSocket, { id: string; room: string; user: UserSession | null; name: string; role: string }>();

type Signal = { type: "join"; room: string; name: string; role: string; targetRole?: string } | { type: "offer" | "answer" | "ice"; payload: unknown; to?: string } | { type: "chat"; text: string } | { type: "leave" };

function send(ws: WebSocket, value: unknown): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(value));
}

function canCall(role: string, targetRole: string): boolean {
  return role === "doctor" || role === "ceo" || role === "admin" || targetRole === "doctor";
}

export function attachCallGateway(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (url.pathname !== PATH) return;
    const user = validateSessionToken(url.searchParams.get("token") ?? undefined);
    if (process.env.NODE_ENV === "production" && !user) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, user));
  });

  wss.on("connection", (ws: WebSocket, user: UserSession | null) => {
    ws.on("message", (raw: Buffer) => {
      let msg: Signal;
      try { msg = JSON.parse(raw.toString("utf8")) as Signal; } catch { send(ws, { type: "error", message: "Invalid call message" }); return; }
      const current = metadata.get(ws);
      if (msg.type === "join") {
        const room = msg.room.trim().slice(0, 80);
        if (!room || !canCall(user?.role ?? msg.role, msg.targetRole ?? (room.startsWith("doctor") ? "doctor" : msg.role))) {
          send(ws, { type: "error", message: "Doctor permission is required for this call" });
          return;
        }
        const members = rooms.get(room) ?? new Set<WebSocket>();
        const role = user?.role ?? msg.role;
        const id = randomUUID();
        const existingPeers = [...members].map((peer) => { const p = metadata.get(peer); return p ? { id: p.id, name: p.name, role: p.role } : null; }).filter(Boolean);
        metadata.set(ws, { id, room, user, name: user?.name ?? msg.name, role });
        members.forEach((peer) => send(peer, { type: "peer-joined", peer: { id, name: user?.name ?? msg.name, role } }));
        members.add(ws);
        rooms.set(room, members);
        send(ws, { type: "joined", room, peerId: id, peers: existingPeers, callId: randomUUID() });
        return;
      }
      if (!current) { send(ws, { type: "error", message: "Join a call room first" }); return; }
      if (msg.type === "leave") {
        rooms.get(current.room)?.delete(ws);
        rooms.get(current.room)?.forEach((peer) => send(peer, { type: "peer-left", peerId: current.id, name: current.name }));
        return;
      }
      rooms.get(current.room)?.forEach((peer) => {
        if (peer === ws) return;
        const target = metadata.get(peer);
        if ("to" in msg && msg.to && target?.id !== msg.to) return;
        send(peer, msg.type === "chat"
          ? { type: "chat", text: msg.text.slice(0, 4000), from: current.name, fromRole: current.role, at: new Date().toISOString() }
          : { type: msg.type, payload: msg.payload, from: current.id, fromName: current.name });
      });
    });
    ws.on("close", () => {
      const current = metadata.get(ws);
      if (!current) return;
      const members = rooms.get(current.room);
      members?.delete(ws);
      members?.forEach((peer) => send(peer, { type: "peer-left", peerId: current.id, name: current.name }));
      if (members?.size === 0) rooms.delete(current.room);
    });
  });
}
