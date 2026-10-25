import { useEffect, useState } from "react";
import { statusChipForRole, subscribeWorkflow } from "./workflowGuard";

/**
 * Same chip on every dashboard. Reads the in-memory stream immediately and
 * the shared /api/workflow/status endpoint (the existing API, refreshed on focus).
 */
export function useOrderWorkflowStatus(patientUhid?: string, role = "doctor"): string {
  const [chip, setChip] = useState("");
  useEffect(() => {
    if (!patientUhid) {
      setChip("");
      return;
    }
    const readLocal = () => statusChipForRole(patientUhid, role);
    setChip(readLocal());
    const unsubscribe = subscribeWorkflow(() => setChip(readLocal()));
    let cancelled = false;
    const pull = () => {
      let token = "";
      try {
        token = typeof localStorage === "undefined" ? "" : localStorage.getItem("astra.serverToken") ?? "";
      } catch {
        token = "";
      }
      if (!token) return;
      fetch(`/api/workflow/status?uhid=${encodeURIComponent(patientUhid)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((body: { chip?: string } | null) => {
          if (!cancelled && body && typeof body.chip === "string" && body.chip) setChip(body.chip);
        })
        .catch(() => undefined);
    };
    pull();
    if (typeof window !== "undefined") window.addEventListener("focus", pull);
    return () => {
      cancelled = true;
      unsubscribe();
      if (typeof window !== "undefined") window.removeEventListener("focus", pull);
    };
  }, [patientUhid, role]);
  return chip;
}

export function OrderStatusChip({ patientUhid, role = "doctor" }: { patientUhid?: string; role?: string }) {
  const chip = useOrderWorkflowStatus(patientUhid, role);
  if (!chip) return null;
  return (
    <span
      data-testid="order-workflow-status"
      data-role={role}
      className="inline-flex items-center rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-200"
    >
      {chip}
    </span>
  );
}
