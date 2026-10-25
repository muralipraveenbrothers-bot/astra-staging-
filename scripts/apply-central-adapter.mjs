import { loadBackendEnv } from "../server/ai/loadEnv.ts";
import { applyAdapterBindings } from "../server/ai/agentBindings.ts";

loadBackendEnv();

applyAdapterBindings({ confirm: true, targets: ["sidecars", "hermes", "openclaw"] })
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
    if (!r.ok) process.exit(1);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
