export interface VaultListItem { id: string; status?: string; title?: string }
export interface SkillListItem { id: string; name?: string; purpose?: string; status?: string }
export interface CauseFinderItem { id: string; text: string; tier?: string }
export interface CauseFinderPayload {
  suggestionsOnly?: boolean;
  statedAsFact?: boolean;
  autoOrders?: boolean;
  causeChain?: string;
  items?: CauseFinderItem[];
}

export function validatedVaultItems(items: VaultListItem[] | null | undefined): VaultListItem[] {
  return (items ?? []).filter((item) => item.status === "validated" && String(item.title ?? "").trim());
}

export function approvedBookSkills(skills: SkillListItem[] | null | undefined): SkillListItem[] {
  return (skills ?? []).filter((skill) => skill.status === "approved" && String(skill.name ?? "").trim());
}

export function suggestionLabel(text: string): string {
  const clean = text.trim();
  if (!clean) return "Suggestion only, not a diagnosis.";
  if (/suggestion only, not a diagnosis/i.test(clean)) return clean;
  return `Suggestion only, not a diagnosis: ${clean}`;
}

export function readCockpitAudience(
  storage: { getItem(key: string): string | null } | null,
  accounts: ReadonlyArray<{ id: string; role: string }> = [],
): "doctor" | "ward" {
  if (!storage) return "doctor";
  try {
    const raw = storage.getItem("astra.session");
    if (!raw) return "doctor";
    const session = JSON.parse(raw) as { accountId?: string };
    const account = accounts.find((item) => item.id === session.accountId);
    return account?.role === "ward" ? "ward" : "doctor";
  } catch {
    return "doctor";
  }
}
