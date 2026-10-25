/**
 * Astra AI — Real-Time Cross-Department Event Fabric
 * ====================================================
 * High-performance Server-Sent Events (SSE) event hub.
 * Synchronizes orders, lab results, telemetry alerts, and admissions across all workstations.
 * Enforces role-based event isolation so departments receive only permitted event streams.
 */

import { Request, Response } from "express";
import { Role, UserSession } from "./types";

export interface HospitalEvent {
  id: string;
  type:
    | "ORDER_CREATED"
    | "LAB_RESULT_VERIFIED"
    | "CRITICAL_ALERT"
    | "VITALS_UPDATE"
    | "BED_STATUS_CHANGED"
    | "PHARMACY_DISPENSED"
    | "OT_STATUS_CHANGED"
    | "TASK_UPDATED"
    | "PATIENT_ADMITTED"
    | "BILL_CREATED"
    | "BILL_CHARGE_POSTED"
    | "BILL_PAYMENT_COLLECTED"
    | "BILL_ADJUSTMENT_POSTED"
    | "BILL_PAYMENT_REMINDER"
    // Hospital bus (n8n) acknowledgement / status flow
    | "ORDER_ACKNOWLEDGED"
    | "ORDER_STATUS_CHANGED"
    // These five are broadcast by server/index.ts but were never declared here,
    // so every emit site was a TS2322 and consumers had no type-safe way to
    // subscribe to them. `MEDICATION_DISPENSED` in particular is already
    // declared by the client (src/services/clinicalEvents.ts) and was therefore
    // arriving as an untyped event.
    | "HOSPITAL_PROFILE_UPDATED"
    | "ATTENTION_ITEM_UPDATED"
    | "OT_STAGE_UPDATED"
    | "MEDICATION_DISPENSED"
    | "BED_STATUS_UPDATED"
    | "ASTRA_BRAIN_EVENT"
    // R5-05 order-workflow notice on the existing SSE bus. The payload carries
    // the canonical event name; this union does not declare a second bus.
    | "ORDER_WORKFLOW_EVENT";
// NOTE: `PHARMACY_DISPENSED`, `BED_STATUS_CHANGED` and `OT_STATUS_CHANGED` are
// still declared above but no longer emitted anywhere in server/. Left in place
// deliberately — removing union members is a contract change that could break an
// external subscriber (e.g. the n8n webhook bus); flagging rather than deleting.
  timestamp: string;
  targetRoles: Role[] | "*";
  payload: any;
}

interface ClientConnection {
  id: string;
  res: Response;
  role: Role;
  userId: string;
}

class RealtimeEventFabric {
  private clients: Map<string, ClientConnection> = new Map();

  public handleConnection(req: Request, res: Response): void {
    const user = (req as any).user as UserSession | undefined;
    const role: Role = user?.role || "doctor";
    const clientId = `${user?.userId || "anon"}_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    res.write(`data: ${JSON.stringify({ type: "CONNECTED", clientId, role, timestamp: new Date().toISOString() })}\n\n`);

    const client: ClientConnection = { id: clientId, res, role, userId: user?.userId || "anon" };
    this.clients.set(clientId, client);

    const keepAlive = setInterval(() => {
      res.write(": keepalive\n\n");
    }, 20000);

    req.on("close", () => {
      clearInterval(keepAlive);
      this.clients.delete(clientId);
    });
  }

  public broadcast(event: Omit<HospitalEvent, "id" | "timestamp">): HospitalEvent {
    const fullEvent: HospitalEvent = {
      ...event,
      id: "EVT-" + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
    };

    const payloadStr = JSON.stringify(fullEvent);

    for (const [, client] of this.clients) {
      if (
        fullEvent.targetRoles === "*" ||
        client.role === "admin" ||
        fullEvent.targetRoles.includes(client.role)
      ) {
        try {
          client.res.write(`data: ${payloadStr}\n\n`);
        } catch {
          // Socket closed
        }
      }
    }

    return fullEvent;
  }

  public getConnectedClientsCount(): number {
    return this.clients.size;
  }
}

export const realtimeHub = new RealtimeEventFabric();
