export interface TimelineEvent {
  at: string;
  kind: "medication" | "symptom" | "result" | "procedure" | "trigger" | "deterioration";
  label: string;
}

export function buildTimeline(events: TimelineEvent[], anchorIso: string): { items: Array<{ label: string; kind: TimelineEvent["kind"]; offsetHours: number }>; flags: string[] } {
  const anchor = Date.parse(anchorIso);
  const items = [...events]
    .map((event) => ({ label: event.label, kind: event.kind, offsetHours: Math.round((Date.parse(event.at) - anchor) / 36e5) }))
    .sort((a, b) => a.offsetHours - b.offsetHours);
  const flags: string[] = [];
  const symptoms = events.filter((event) => event.kind === "symptom");
  for (const symptom of symptoms) {
    const symptomAt = Date.parse(symptom.at);
    const preceded = events.some((event) => event.kind === "medication" && Date.parse(event.at) < symptomAt && symptomAt - Date.parse(event.at) <= 72 * 36e5);
    if (preceded) flags.push("new medication preceded new symptom");
  }
  return { items, flags };
}
