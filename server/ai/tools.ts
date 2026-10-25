export const astraTools = {
  create_appointment: {
    name: "create_appointment",
    description: "Books an appointment for a patient in the hospital calendar.",
    parameters: {
      type: "object",
      properties: {
        doctor: { type: "string" },
        time: { type: "string" },
        patientName: { type: "string" },
      },
      required: ["doctor", "time"]
    },
    execute: (args: any) => {
      // Stub: in a real environment, this connects to the hospital DB
      return `Appointment successfully booked with ${args.doctor} at ${args.time}.`;
    }
  },
  get_latest_lab_result: {
    name: "get_latest_lab_result",
    description: "Fetches the latest laboratory result for a specific bed or patient.",
    parameters: {
      type: "object",
      properties: {
        bed: { type: "string" },
        testName: { type: "string" },
      },
      required: ["bed", "testName"]
    },
    execute: (args: any) => {
      // Stub: in a real environment, this connects to the LIS (Lab Info System)
      if (args.testName.toLowerCase().includes("potassium")) {
        return `Bed ${args.bed} latest potassium is 5.8 mmol/L. Previous value was 5.2.`;
      }
      return `Bed ${args.bed} latest ${args.testName} is pending.`;
    }
  },
  get_pending_orders: {
    name: "get_pending_orders",
    description: "Fetches the pending pharmacy orders for a given bed.",
    parameters: {
      type: "object",
      properties: {
        bed: { type: "string" },
      },
      required: ["bed"]
    },
    execute: (args: any) => {
      return `Bed ${args.bed} has two pending orders: Ceftriaxone and Pantoprazole.`;
    }
  }
};
