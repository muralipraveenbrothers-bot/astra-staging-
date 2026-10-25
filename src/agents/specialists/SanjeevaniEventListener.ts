import { agentBus } from "@/astra/runtime/agentBus";
import { ToolRegistry } from "@/agents/core/ToolRegistry";

/**
 * Sanjeevani Event Listener
 * Subscribes to hospital event bus and forwards relevant events to the UI overlay.
 * Emits a custom event type "sanjeevani:prompt" with a payload that the overlay can display.
 */
export class SanjeevaniEventListener {
  constructor() {
    // Subscribe to all events; the callback will filter relevant ones.
    agentBus.subscribe(this.handleEvent.bind(this));
  }

  private async handleEvent(event: { type: string; payload: any }) {
    const { type, payload } = event;
    // Define which events trigger a Sanjeevani prompt.
    const promptEvents = new Set([
      "patient.registered",
      "lab.resulted",
      "radiology.resulted",
      "pharmacy.dispensed",
      "billing.updated",
    ]);

    if (!promptEvents.has(type)) return; // ignore other events

    // Build a concise message for the UI.
    let message = "";
    switch (type) {
      case "patient.registered":
        // payload: { patientId, name, age, gender, triage }
        message = `New patient arrived: ${payload.name}, ${payload.age || "-"}y/${payload.gender || "-"}`;
        break;
      case "lab.resulted":
        // payload: { patientId, testName, result, critical }
        message = `Lab result for ${payload.patientName}: ${payload.testName} = ${payload.result}`;
        if (payload.critical) message += " (CRITICAL)";
        break;
      case "radiology.resulted":
        // payload: { patientId, modality, impression }
        message = `Radiology ${payload.modality} for ${payload.patientName}: ${payload.impression}`;
        break;
      case "pharmacy.dispensed":
        // payload: { patientId, medicationList }
        message = `Pharmacy dispensed meds for ${payload.patientName}`;
        break;
      case "billing.updated":
        // payload: { patientId, amount, status }
        message = `Billing update for ${payload.patientName}: ${payload.amount} – ${payload.status}`;
        break;
      default:
        return;
    }

    // Emit a custom Sanjeevani UI event.
    agentBus.emit("sanjeevani:prompt", {
      type,
      message,
      payload,
    });
  }
}

// Instantiate the listener when this module is imported.
new SanjeevaniEventListener();
