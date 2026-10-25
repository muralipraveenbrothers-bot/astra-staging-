// ASTRA AI — Hospital Context & Command Resolver v2.0 (LIVE DB — P0.1)
// ============================================================================
// The context resolution path is REAL DATABASE-BACKED via
// server/patient/patientContext.ts. Hardcoded patient context
// ("Bed 1" → static patient) has been removed: every bed → ward →
// assignment → admission → patient → MRN resolution now comes from the
// canonical hospital data fabric, and ambiguity/anomalies FAIL CLOSED
// with a clarification request — Astra never guesses identity.
import { Express, Request, Response } from "express";
import {
  resolvePatientContext,
  PatientContextError,
} from "../patient/patientContext";

export interface ResolvedContext {
  hospital: string;
  department: string;
  ward?: string;
  bed?: string;
  admissionId?: string;
  patientId?: string;
  uhid?: string;
  patientName?: string;
  consultant?: string;
}

export function registerCommandOSRoutes(app: Express) {
  // Resolve Ward / Bed / Patient Context — LIVE DB resolution (no static patient)
  app.post("/api/command-os/resolve-context", (req: Request, res: Response) => {
    const { query, currentWard, currentBed } = req.body ?? {};
    const reference =
      (typeof query === "string" && query.trim()) ||
      (typeof currentBed === "string" && currentBed.trim() && `${currentWard ?? ""} ${currentBed}`.trim());

    if (!reference) {
      return res.status(400).json({
        resolved: false,
        code: "NO_BED_REFERENCE",
        message: "No bed/patient reference in the request. Astra does not guess patient identity.",
      });
    }

    try {
      const context = resolvePatientContext(reference);
      return res.json({
        resolved: true,
        contextVersion: context.contextVersion,
        resolvedAt: context.resolvedAt,
        resolutionSource: context.resolutionSource,
        context: {
          hospital: context.hospitalId,
          department: context.wardId,
          ward: context.wardId,
          bed: context.bedNumber,
          admissionId: context.admissionId,
          patientId: context.patientId,
          uhid: context.mrn,
          patientName: context.patientName,
        },
      });
    } catch (e) {
      if (e instanceof PatientContextError) {
        return res.status(422).json({
          resolved: false,
          code: e.code,
          message: e.message,
          candidates: e.candidates,
        });
      }
      return res.status(500).json({ resolved: false, code: "RESOLUTION_FAILED", message: String(e) });
    }
  });

  // Interdepartmental Hospital Event Bus (Publish Event)
  app.post("/api/command-os/events/publish", (req: Request, res: Response) => {
    const { eventType, source, destination, payload } = req.body;
    const eventId = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const eventRecord = {
      eventId,
      eventType: eventType || "GENERAL_COMMAND",
      timestamp: new Date().toISOString(),
      source: source || "DoctorCommandCentre",
      destination: destination || "HospitalEventBus",
      status: "ACKNOWLEDGED",
      payload,
    };

    console.log(`[HospitalEventBus] Published Event #${eventId}:`, eventRecord);
    return res.json({ success: true, event: eventRecord });
  });
}
