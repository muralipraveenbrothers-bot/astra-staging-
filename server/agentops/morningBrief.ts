export interface BriefRow {
  section: string;
  text: string;
  href: string;
  doctorId?: string;
}

const SECTIONS = [
  "census", "icu", "admissions", "surgeries", "discharges", "labs", "radiology",
  "pharmacy", "billing", "cmrf", "whatsapp", "beds", "actions",
] as const;

export function buildMorningBrief(input: {
  role: string;
  userId: string;
  rows: BriefRow[];
  systemHealth?: string;
}): Record<string, string | BriefRow[]> {
  const visible = input.role === "admin" || input.role === "ceo"
    ? input.rows
    : input.rows.filter((row) => row.doctorId === input.userId);
  const brief: Record<string, string | BriefRow[]> = {};
  for (const section of SECTIONS) {
    const lines = visible.filter((row) => row.section === section);
    brief[section] = lines.length ? lines : "none";
  }
  if (input.role === "admin" || input.role === "ceo") brief.systemHealth = input.systemHealth ?? "none";
  return brief;
}
