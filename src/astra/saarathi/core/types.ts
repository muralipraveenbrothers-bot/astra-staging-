import type { AstraDashboard, AstraLanguage, AstraRisk } from "../../voice/roundTrip/contracts";

export type SaarathiWorkspace = AstraDashboard;
export type SaarathiSource = "voice" | "text" | "gesture" | "file" | "camera";
export type SaarathiMode = "training" | "production" | "fallback";

export interface SaarathiTurn {
  turnId: string;
  input: { text: string; source: SaarathiSource };
  identity: { userId: string; role: string; name?: string };
  workspace: SaarathiWorkspace;
  language: AstraLanguage;
  mode: SaarathiMode;
  risk: AstraRisk;
  patientContext?: Record<string, unknown>;
}

export interface SaarathiOutput {
  turnId: string;
  text: string;
  speechText: string;
  language: AstraLanguage;
  workspace: SaarathiWorkspace;
  risk: AstraRisk;
  status: "completed" | "confirmation_required" | "escalated";
  actions: Array<{ type: string; label?: string; payload?: Record<string, unknown> }>;
  provenance: string[];
  audit: { actorId: string; workspace: SaarathiWorkspace; at: string };
}
