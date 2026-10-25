/**
 * Contact registry. A call or message is recorded. Astra does not dial or send it.
 */

export const CONTACT_GROUPS = [
  "Doctors", "Nurses", "Reception", "Pharmacy", "Lab", "Radiology", "Administration",
  "Ambulance", "Referral hospitals", "Vendors", "External laboratories", "Service engineers", "Approved patient contacts",
] as const;

export type ContactGroup = (typeof CONTACT_GROUPS)[number];

export interface ContactRecord {
  id: string;
  group: ContactGroup;
  name: string;
  department: string;
}

export interface ContactAudit {
  who: string;
  recipient: string;
  purpose: string;
  time: string;
  related: string;
  delivered: false;
  allowed: boolean;
  reason: string;
}

const DIRECTORY: ContactRecord[] = [
  { id: "duty-doctor", group: "Doctors", name: "Duty doctor", department: "Clinical" },
  { id: "ward-nurse", group: "Nurses", name: "Ward nurse station", department: "Ward" },
  { id: "pharmacy-desk", group: "Pharmacy", name: "Pharmacy desk", department: "Pharmacy" },
  { id: "lab-desk", group: "Lab", name: "Laboratory desk", department: "Laboratory" },
  { id: "ambulance", group: "Ambulance", name: "Ambulance desk", department: "Emergency" },
];

export function findContacts(query: string): ContactRecord[] {
  const words = query.toLowerCase().split(/[^a-z]+/).filter((word) => word.length > 3);
  return DIRECTORY.filter((item) => {
    const blob = `${item.group} ${item.name} ${item.department}`.toLowerCase();
    return words.some((word) => blob.includes(word));
  });
}

const CLINICAL_SEND_ROLES = new Set(["doctor", "ceo", "admin", "ward"]);

export function contactAction(input: { text: string; role: string; who: string; related?: string }): ContactAudit {
  const verb = /\b(call|message|referral)\b/i.test(input.text) ? "send" : "read";
  const hit = findContacts(input.text)[0];
  const allowed = verb === "read" || CLINICAL_SEND_ROLES.has((input.role ?? "").toLowerCase());
  return {
    who: input.who || "unknown",
    recipient: hit?.name ?? "unknown",
    purpose: input.text.trim() || "unknown",
    time: new Date().toISOString(),
    related: input.related?.trim() || "none",
    delivered: false,
    allowed,
    reason: allowed
      ? "Recorded. Astra did not place the call or send the message."
      : "This role cannot start a contact action.",
  };
}
