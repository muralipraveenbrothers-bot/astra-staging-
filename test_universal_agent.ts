import { commandCore } from "./src/lib/agents/core/CommandCore";
import { CommandPayload } from "./src/lib/agents/core/CommandTypes";

async function runTest() {
  console.log("=== Testing Universal Agent Operating System ===");
  
  // Test 1: Simple IP List Query -> Should route through IntentResolver to PatientQueryAgent
  console.log("\n[Test 1] Executing IP List Query...");
  const payload1: CommandPayload = {
    text: "Show me the IP list",
    source: "text"
  };
  
  const result1 = await commandCore.processCommand(payload1, "doctor-123");
  console.log("Result 1:", JSON.stringify(result1, null, 2));

  // Test 2: Clinical Question -> Should route to Hermes
  console.log("\n[Test 2] Executing Clinical Analysis...");
  const payload2: CommandPayload = {
    text: "Analyze this wound image",
    source: "text",
    imageData: "base64:image"
  };
  
  const result2 = await commandCore.processCommand(payload2, "doctor-123");
  console.log("Result 2:", JSON.stringify(result2, null, 2));

  // Test 3: OT Checklist for Orthopaedics -> Should route to OTCommandAgent
  console.log("\n[Test 3] Executing OT Checklist...");
  const payload3: CommandPayload = {
    text: "Start OT checklist for Orthopaedics surgery",
    source: "text"
  };
  
  const result3 = await commandCore.processCommand(payload3, "doctor-123");
  console.log("Result 3:", JSON.stringify(result3, null, 2));

  console.log("\n=== Tests Completed ===");
}

runTest().catch(console.error);
