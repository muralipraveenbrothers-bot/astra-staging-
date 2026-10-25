import { detectNodeRuntimes } from "../server/services/runtimeDetect.js";

async function main() {
  const all = await detectNodeRuntimes();
  console.log("DETECTED:");
  console.log(all);
}

main().catch(console.error);
