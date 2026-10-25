/**
 * Saarathi command interpreter — secondary interaction brain.
 * Doctor and CEO may issue operational hospital commands. Clinical orders
 * (prescribing, diagnosis, investigations, discharge) wait for a doctor.
 * Other roles may look, navigate their workspace, and ask.
 */

import { canAuthorizeClinicalAction, canIssueHospitalOrders, isClinicalOrderText } from "./clinicalAuthority";

export interface SaarathiAction {
  type: string;
  path?: string;
  tool?: string;
  args?: Record<string, unknown>;
  label?: string;
}

export type SaarathiCommandKind = "wake" | "stop" | "navigate" | "order" | "query" | "chat";

export interface ParsedSaarathiCommand {
  kind: SaarathiCommandKind;
  actions: SaarathiAction[];
  spoken: string;
  denied?: boolean;
}

export { canIssueHospitalOrders };

const NAV: Array<{ re: RegExp; path: string; label: string }> = [
  { re: /\b(reception|front desk|registration)\b|రిసెప్షన్|रिसेप्शन/i, path: "/reception", label: "Reception" },
  { re: /\b(pharmacy|dispensary|medicine desk)\b|ఫార్మసీ|फार्मेसी/i, path: "/pharmacy", label: "Pharmacy" },
  { re: /\b(radiology|x-?ray|imaging|usg)\b|రేడియాలజీ|रेडियोलॉजी/i, path: "/radiology", label: "Radiology" },
  { re: /\b(lab(?:oratory)?|labs|pathology)\b|ల్యాబ్|लैब/i, path: "/lab", label: "Laboratory" },
  { re: /\b(ward|icu|inpatient|ip beds?|nursing)\b|వార్డ్|वार्ड/i, path: "/ward", label: "Ward" },
  { re: /\b(billing|accounts|cash desk|finance)\b|బిల్లింగ్|बिलिंग/i, path: "/billing", label: "Billing" },
  { re: /\b(ot|theatre|operation)\b|ఆపరేషన్|ओटी/i, path: "/ot", label: "OT" },
  { re: /\b(doctor|emr|clinical command|command os)\b|డాక్టర్|डॉक्टर/i, path: "/doctor", label: "Doctor Command" },
  { re: /\b(plugin(?:s)?|plugin center)\b/i, path: "/plugins", label: "Plugin Center" },
  { re: /\b(internal (?:browser|workspace)|services)\b/i, path: "/browser", label: "Internal Workspace" },
];

const STOP = /^(astra|saarathi|sarathi|jarvis)?[,. ]*(stop|pause|cancel|quiet|silence|ఆపు|ఆపండి|రోకో|रुको|रोको|बंद करो)$/i;
const ORDER = /\b(order|prescribe|indent|raise|book|schedule|admit|discharge|start|execute|do)\b|ఆర్డర్|प्रिस्क्राइब/i;
const OPEN = /\b(open|show|go to|take me|navigate|switch to|dikhao|kholo|kholiye)\b|చూపించు|చూపించండి|తెరువు|दिखाओ|खोलो|खोलिए/i;

/** Drop a leading Astra/Saarathi/Jarvis address so "Saarathi, open pharmacy" is a command. */
export function stripSaarathiWakePrefix(text: string): string {
  const said = (text ?? "").trim();
  const stripped = said.replace(
    /^(?:(?:hi|hello|hey|hai|hii|heyy|yo|namaste|namaskaram|namaskar)\s+)?(?:astra|asthra|saarathi|sarathi|saarthi|sarthy|jarvis|శారథి|सारथी)\s*[,:]?\s+/i,
    ""
  ).trim();
  return stripped || said;
}

export function parseSaarathiCommand(text: string, role: string): ParsedSaarathiCommand {
  const raw = (text ?? "").trim();
  const said = stripSaarathiWakePrefix(raw);
  if (STOP.test(raw) || STOP.test(said)) {
    return { kind: "stop", actions: [{ type: "voice.stop", label: "Stop" }], spoken: "Stopped. I am listening." };
  }

  if (OPEN.test(said)) {
    const hit = NAV.find((n) => n.re.test(said));
    if (hit) {
      return {
        kind: "navigate",
        actions: [{ type: "ui.navigate", path: hit.path, label: hit.label }],
        spoken: `Opening ${hit.label}.`,
      };
    }
  }

  if (ORDER.test(said)) {
    if (isClinicalOrderText(said) && !canAuthorizeClinicalAction(role)) {
      const executive = (role ?? "").toLowerCase() === "ceo";
      return {
        kind: "order",
        actions: [],
        denied: true,
        spoken: executive
          ? "A doctor confirms prescribing, diagnosis, investigations, and treatment. I can help with operations, staffing, finance, and department performance."
          : "A doctor confirms clinical orders. I will not execute this from the current role.",
      };
    }
    if (!canIssueHospitalOrders(role)) {
      return {
        kind: "order",
        actions: [],
        denied: true,
        spoken: "I can prepare that, but only the Doctor or CEO can place a hospital order. I will not execute it from this role.",
      };
    }
    const hit = NAV.find((n) => n.re.test(said));
    const dest = hit?.path ?? "/doctor";
    return {
      kind: "order",
      actions: [
        { type: "ui.navigate", path: dest, label: hit?.label ?? "Doctor Command" },
        { type: "hospital.command", args: { text: said }, label: "Doctor assistant draft" },
      ],
      spoken: "I am taking this as a doctor-assistant order. Opening the destination so you can confirm the final work.",
    };
  }

  return { kind: "chat", actions: [], spoken: "" };
}
