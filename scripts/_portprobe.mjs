// Port availability check for all Astra local runtimes.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = JSON.parse(readFileSync(path.join(root, "config/ports.json"), "utf8"));
const ports = [
  ["freellmapi", registry.services.freellmapi.port], ["omniroute", 20128], ["ollama", 11434], ["hermes-ui", 9119],
  ["paperclip", 3100], ["n8n", 5678], ["openclaw", 18789], ["voicebox", 17493],
  ["agentzero", 5000], ["openhands-ui", 8080], ["openhands-agentserver", 18000], ["astra-api", 3000],
];
const results = await Promise.all(ports.map(async ([name, port]) => {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(3000) });
    return `${name}:${port} UP`;
  } catch {
    return `${name}:${port} DOWN`;
  }
}));
console.log(results.join("\n"));
