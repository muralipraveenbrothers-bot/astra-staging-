import { RED_FLAG_RULES } from "../clinical/scientistAgent";
import { checkMedication } from "../../src/astra/clinical/medication/checkMedication";
import type { PatientMedicationContext } from "../../src/astra/clinical/medication/types";
import { decideWorkflowAction, type GuardInput } from "../../src/astra/clinical/workflow/workflowGuard";

export interface Level0Context {
  text?: string;
  medication?: { drug: string; dose?: string; allergies?: string[]; patientId?: string };
  workflow?: GuardInput;
  criticalAlertUnacknowledged?: boolean;
}

const EMERGENCY: RegExp[] = [
  /chest pain/i,
  /can'?t breathe|cannot breathe/i,
  /unconscious/i,
  /\u0c1b\u0c3e\u0c24\u0c40\s*\u0c28\u0c4a\u0c2a\u0c4d\u0c2a\u0c3f/,
  /\u0938\u093e\u0902\u0938\s*\u0928\u0939\u0940\u0902/,
  /\u0938\u0940\u0928\u0947\s*\u092e\u0947\u0902\s*\u0926\u0930\u094d\u0926/,
];

export interface Level0Result {
  hardStops: string[];
  redFlags: string[];
  forcedAnswers: Record<string, string>;
}

export function evaluateLevel0(context: Level0Context): Level0Result {
  const hardStops: string[] = [];
  const redFlags: string[] = [];
  const forcedAnswers: Record<string, string> = {};
  const text = context.text ?? "";
  if (EMERGENCY.some((pattern) => pattern.test(text))) {
    redFlags.push("emergency-keyword");
    forcedAnswers.urgency = "emergency";
    forcedAnswers.urgency_classification = "emergency";
    forcedAnswers.possible_emergency_flag = "yes";
  }
  const blob = text.toLowerCase();
  for (const rule of RED_FLAG_RULES) {
    try {
      if (rule.match(blob, { text } as never)) redFlags.push(rule.id);
    } catch {
      // A rule that needs a fuller case does not fire.
    }
  }
  if (context.medication?.drug) {
    const patient: PatientMedicationContext = {
      patientId: context.medication.patientId ?? "level0",
      allergies: context.medication.allergies ?? [],
      currentMedications: [],
    };
    const findings = checkMedication(
      { drug: context.medication.drug, dose: context.medication.dose ?? "" },
      patient,
    );
    if (findings.some((finding) => finding.severity === "red" || finding.ruleId.includes("allergy"))) {
      hardStops.push("medication-allergy");
      forcedAnswers.prescription = "blocked";
      forcedAnswers.prescribe = "blocked";
    }
  }
  if (context.workflow) {
    const decision = decideWorkflowAction(context.workflow);
    if (!decision.allowed) {
      hardStops.push(decision.code || "workflow-hard-stop");
      forcedAnswers.workflow = "blocked";
    }
  }
  if (context.criticalAlertUnacknowledged) {
    hardStops.push("critical-alert-unacknowledged");
    forcedAnswers.alert = "human_review";
  }
  return { hardStops, redFlags, forcedAnswers };
}

export function applyLevel0Answer(schemaId: string, layaAnswer: string, level0: Level0Result): { answer: string; source: "laya" | "level0" } {
  const forced = level0.forcedAnswers[schemaId] ?? (schemaId === "urgency" || schemaId === "urgency_classification" ? level0.forcedAnswers.urgency : undefined);
  if (!forced) return { answer: layaAnswer, source: "laya" };
  return { answer: forced, source: "level0" };
}
