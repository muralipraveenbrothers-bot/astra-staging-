import { internalServiceManager } from "../server/services/serviceManager.js";
import { ALL_SERVICE_IDS } from "../server/services/serviceDefs.js";

async function verifyServiceStartup() {
  console.log("Starting verification of service startup...");
  let allHealthy = true;

  for (const id of ALL_SERVICE_IDS) {
    console.log(`\n--- Starting ${id} ---`);
    try {
      const snapshot = await internalServiceManager.start(id, { timeoutMs: 60000 });
      console.log(`State after start: ${snapshot.state}`);
      if (snapshot.state === "HEALTHY") {
        console.log(`✅ ${id} is HEALTHY!`);
        console.log(`Endpoint: ${snapshot.endpoint}`);
        console.log(`PID: ${snapshot.process?.pid}`);
      } else {
        console.log(`❌ ${id} failed to become HEALTHY. State is ${snapshot.state}`);
        console.log(`Diagnostics: ${JSON.stringify(snapshot.health)}`);
        console.log(`Last Error: ${snapshot.lastError}`);
        allHealthy = false;
        
        const logs = internalServiceManager.logs(id, 20);
        console.log(`Logs:\n${logs.join('\n')}`);
      }
    } catch (err) {
       console.error(`❌ Error starting ${id}:`, err);
       allHealthy = false;
    }
  }

  if (allHealthy) {
    console.log("\n✅✅✅ All services started and are HEALTHY!");
  } else {
    console.log("\n❌❌❌ Some services failed to start correctly.");
    process.exit(1);
  }
}

verifyServiceStartup().catch(console.error);
