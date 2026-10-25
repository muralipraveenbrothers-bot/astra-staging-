import { describe, it, expect, vi, beforeEach, type MockInstance } from "vitest";
import { agentBus } from "@/astra/runtime/agentBus";
import { SanjeevaniEventListener } from "@/agents/specialists/SanjeevaniEventListener";

describe("Sanjeevani Event Listener", () => {
  let emitSpy: MockInstance;

  beforeEach(() => {
    // Clear all listeners and mock the emit function
    // Note: In a real implementation, we might need to reset the agentBus
    emitSpy = vi.spyOn(agentBus, "emit");
  });

  it("should emit sanjeevani:prompt for patient.registered event", () => {
    const listener = new SanjeevaniEventListener();

    // Simulate a patient.registered event
    agentBus.emit("patient.registered", {
      patientId: "PAT123",
      name: "John Doe",
      age: 45,
      gender: "Male",
      triage: "Urgent"
    });

    // Check that sanjeevani:prompt was emitted
    expect(emitSpy).toHaveBeenCalledWith("sanjeevani:prompt", expect.objectContaining({
      type: "patient.registered",
      message: expect.stringContaining("New patient arrived: John Doe"),
      payload: expect.objectContaining({
        patientId: "PAT123",
        name: "John Doe"
      })
    }));
  });

  it("should emit sanjeevani:prompt for lab.resulted event", () => {
    const listener = new SanjeevaniEventListener();

    // Simulate a lab.resulted event
    agentBus.emit("lab.resulted", {
      patientId: "PAT123",
      patientName: "John Doe",
      testName: "CBC",
      result: "Normal",
      critical: false
    });

    // Check that sanjeevani:prompt was emitted
    expect(emitSpy).toHaveBeenCalledWith("sanjeevani:prompt", expect.objectContaining({
      type: "lab.resulted",
      message: expect.stringContaining("Lab result for John Doe: CBC = Normal"),
      payload: expect.objectContaining({
        patientId: "PAT123",
        testName: "CBC"
      })
    }));
  });

  it("should emit sanjeevani:prompt for lab.resulted with critical flag", () => {
    const listener = new SanjeevaniEventListener();

    // Simulate a lab.resulted event with critical flag
    agentBus.emit("lab.resulted", {
      patientId: "PAT123",
      patientName: "John Doe",
      testName: "Troponin",
      result: "Elevated",
      critical: true
    });

    // Check that sanjeevani:prompt was emitted with critical notice
    expect(emitSpy).toHaveBeenCalledWith("sanjeevani:prompt", expect.objectContaining({
      type: "lab.resulted",
      message: expect.stringContaining("(CRITICAL)"),
      payload: expect.objectContaining({
        patientId: "PAT123",
        testName: "Troponin",
        critical: true
      })
    }));
  });

  it("should ignore non-prompt events", () => {
    const listener = new SanjeevaniEventListener();

    // Simulate a non-prompt event
    agentBus.emit("some.other.event", {
      data: "test"
    });

    // Check that sanjeevani:prompt was NOT emitted
    expect(emitSpy).not.toHaveBeenCalledWith("sanjeevani:prompt", expect.anything());
  });
});
