/** Person-readable probe words. A card must not show a bare status code. */

export function statusWords(status: number): string {
  if (status === 0) return "Not connected. Nothing answered on this PC.";
  if (status === 1) return "Not connected. The check did not get a real service reply.";
  if (status === 401 || status === 403) return "Not connected for this check. It asked for a login.";
  if (status === 404) return "Not connected. That address is not served.";
  if (status === 408 || status === 504) return "Not connected. The check timed out.";
  if (status >= 200 && status < 300) return "Connected. The service answered on this PC.";
  if (status >= 300 && status < 400) return "Connected. The service is up and redirected the check.";
  if (status >= 500) return "Not connected. The service reported an error.";
  return "Not connected. The check did not get a usable answer.";
}

/** Turn a probe string into a sentence. Leaves a real explanation alone. */
export function readableHealth(detail: string | undefined, online?: boolean): string {
  const raw = (detail ?? "").replace(/\s+/g, " ").trim();
  if (!raw) {
    return online
      ? "Connected. The service answered on this PC."
      : "Not connected. Nothing answered.";
  }
  const only = raw.match(/^(?:HTTP\s*)?(\d{1,3})$/i);
  if (only) return statusWords(Number(only[1]));
  if (/^(not answering|unreachable|no-url)$/i.test(raw)) {
    return "Not connected. Nothing is listening on this PC.";
  }
  if (/^timeout$/i.test(raw) || /timed out/i.test(raw) && raw.length < 48) {
    return "Not connected. The check timed out.";
  }
  if (/starting or unresponsive/i.test(raw) && raw.length < 80) {
    return "Not connected. A port is open, but the service did not answer.";
  }
  if (/^up$/i.test(raw)) {
    return "Connected. The port answered. The browser could not read a page from it.";
  }
  if (/HTTP\s+\d{3}/i.test(raw) && raw.length < 96) {
    const code = Number(raw.match(/HTTP\s+(\d{3})/i)?.[1] ?? 0);
    return statusWords(code);
  }
  return raw;
}

/** Two honest lines from what the code actually does. Not a slogan. */
export function servicePurpose(id: string): [string, string] {
  const notes: Record<string, [string, string]> = {
    freellmapi: [
      "Local OpenAI-style API on this PC, using the canonical FreeLLMAPI port.",
      "Non-patient text tries this process first. Patient names and notes do not.",
    ],
    omniroute: [
      "Local model router on this PC, port 20128.",
      "Used only after FreeLLM fails. Patient names, UHIDs, notes, and diagnoses stay off it.",
    ],
    ollama: [
      "Local model server on this PC, port 11434.",
      "Patient text stays here. Other text uses it only after FreeLLM and OmniRoute.",
    ],
    voicebox: [
      "Local speech process on this PC, port 17493.",
      "It turns a recording into text and text into audio. It is not the clinical brain.",
    ],
    laya: [
      "Loopback decider on this PC, port 8791.",
      "It picks language, urgency, and department before a larger model answers.",
    ],
    "astra-micro": [
      "Offline training model named astra-micro.",
      "It is not a live service. This card does not start it.",
    ],
    hermes: [
      "Planning agent on this PC, port 9119.",
      "It does not host a model. It is meant to call Astra's gateway.",
    ],
    "langgraph-orchestrator": [
      "Workflow graph inside the Astra API process.",
      "There is no separate port. A doctor still approves a clinical step.",
    ],
    scientist: [
      "Skill list on the Astra API: papers, trials, and writing helpers.",
      "These are suggestions. They do not sign an order.",
    ],
    "clinical-books": [
      "Writing skills on the Astra API.",
      "They format a draft. They do not sign an order.",
    ],
    "astra-7d": [
      "Symptom-to-plan text written inside a clinical answer.",
      "It is not its own server, and this button does not run a diagnosis.",
    ],
    openclaw: [
      "Tool runtime on this PC, port 18789.",
      "Model calls are supposed to go through Astra's gateway.",
    ],
    "astra-api": [
      "Hospital backend on this PC, port 3000.",
      "Login, plugins, and these health checks go through this process.",
    ],
    n8n: [
      "Workflow engine on port 5678, when that process is running.",
      "This page does not start it.",
    ],
    chatgpt: [
      "Outside website, not an Astra service.",
      "Opening it is not a hospital connection. Patient text is not sent there.",
    ],
    grok: [
      "Outside website, not an Astra service.",
      "Opening it is not a hospital connection. Patient text is not sent there.",
    ],
    kimi: [
      "Outside website, not an Astra service.",
      "Opening it is not a hospital connection. Patient text is not sent there.",
    ],
  };
  return notes[id] ?? [
    "Registered name in this repo.",
    "The line under this is a live check, not a catalog claim.",
  ];
}

export const CATALOG_NOTE: [string, string] = [
  "Catalog card. This name is in the plugin list.",
  "No service on this PC is wired to it, so it is not healthy.",
];
