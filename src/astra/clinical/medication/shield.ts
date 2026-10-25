import type { MedicationFinding } from "./types";

/** Orange and red shields never play audio in front of patients. */
export const SHIELD_AUDIO = "off" as const;

export interface ShieldCue {
  tone: "none" | "orange" | "red";
  playsAudio: false;
  bubbleText: string;
}

export function shieldCue(findings: readonly MedicationFinding[]): ShieldCue {
  const reds = findings.filter((finding) => finding.severity === "red");
  const oranges = findings.filter((finding) => finding.severity === "orange");
  if (reds.length) {
    return { tone: "red", playsAudio: false, bubbleText: reds.map((finding) => finding.message).join("\n") };
  }
  if (oranges.length) {
    return { tone: "orange", playsAudio: false, bubbleText: oranges.map((finding) => finding.message).join("\n") };
  }
  return { tone: "none", playsAudio: false, bubbleText: "" };
}
