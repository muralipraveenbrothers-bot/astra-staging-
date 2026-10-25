import React from "react";
import { agentBus } from "@/astra/runtime/agentBus";
import { SanjeevaniOverlay } from "@/components/SanjeevaniOverlay";
import { useEffect } from "react";
import { navHash } from "@/lib/hashRoute";

/**
 * Integrate SanjeevaniOverlay into the global UI.
 * This file is imported once in the main entry (e.g., index.tsx) to set up the listener.
 */
function initSanjeevaniUI() {
  // Listen for custom prompts from the EventListener.
  const unsubscribe = agentBus.subscribe((event) => {
    if (event.type === "sanjeevani:prompt") {
      const { message, payload } = event.payload;
      // Simple UI trigger: open overlay if not already open.
      // This demo uses a global flag – in real code you might use a store.
      const root = document.getElementById("sanjeevani-root");
      if (!root) {
        const div = document.createElement("div");
        div.id = "sanjeevani-root";
        document.body.appendChild(div);
        // Render the overlay using ReactDOM (placeholder import).
        import("react-dom/client").then(({ createRoot }) => {
          const root = createRoot(div);
          const onClose = () => {
            // Unmount and remove the node.
            root.unmount();
            div.remove();
          };
          // Pass patient ID if payload includes it.
          root.render(
            React.createElement(SanjeevaniOverlay, { onClose, initialPatientId: payload?.patientId })
          );
        });
      }
    }
  });

  // Clean up on unload (optional).
  window.addEventListener("beforeunload", () => {
    unsubscribe();
  });
}

// Run on module load.
initSanjeevaniUI();
