import { commandCore, CommandPayload } from "./src/lib/agents/core/CommandCore";
import { hermesBrain } from "./src/lib/agents/core/HermesBrain";
import { langGraph } from "./src/lib/agents/core/LangGraphOrchestrator";

async function run() {
  console.log("=== Testing ASTRA Master Architecture ===");
  
  // 1. Command Core Routing (Non-Clinical)
  console.log("\n--- Test 1: Ops Command ---");
  const opsPayload: CommandPayload = { text: "show ip patients", source: "text" };
  const res1 = await commandCore.processCommand(opsPayload, "user1");
  console.log("CommandCore Result:", res1);

  // 2. Hermes Clinical Synthesis
  console.log("\n--- Test 2: Complex Clinical Routing ---");
  const clinPayload: CommandPayload = { text: "Patient is deteriorating, oxygen dropped to 85%", source: "voice" };
  const res2 = await commandCore.processCommand(clinPayload, "user1");
  console.log("CommandCore Result:", res2);

  if (res2.requiresHermes) {
    const wf = langGraph.startWorkflow("wf-001", { query: clinPayload.text });
    const hermesRes = await hermesBrain.analyze({ query: clinPayload.text });
    
    hermesRes.delegatedSpecialists.forEach(agent => {
      langGraph.routeToAgent("wf-001", agent);
    });
    
    console.log("Hermes Result:", hermesRes);
    langGraph.completeWorkflow("wf-001");
  }
}

run().catch(console.error);
