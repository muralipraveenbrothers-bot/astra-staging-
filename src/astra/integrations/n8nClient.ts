// n8n = hospital automation bus. Self-host n8n inside the hospital network.
// Create webhooks in n8n like: /webhook/notify-team, /webhook/order-lab, /webhook/critical-alert

const BASE = import.meta.env?.VITE_N8N_BASE || "/proxy/n8n";

export interface Automation {
  name: string;
  path: string;
  description: string;
}

export const AUTOMATIONS: Automation[] = [
  { name: 'notify-team',    path: '/webhook/notify-team',    description: 'Send doctor order to the concerned team (WhatsApp/SMS/dashboard push)' },
  { name: 'order-lab',      path: '/webhook/order-lab',      description: 'Push a lab investigation order to LIS' },
  { name: 'order-radiology',path: '/webhook/order-radiology',description: 'Push an imaging order to RIS' },
  { name: 'critical-alert', path: '/webhook/critical-alert', description: 'Page on-call team for red-flag findings' },
  { name: 'discharge-prep', path: '/webhook/discharge-prep', description: 'Start discharge summary + pharmacy + billing prep' },
  { name: 'bed-request',    path: '/webhook/bed-request',    description: 'Request IP bed / ICU bed allocation' },
];

export async function n8nTrigger(name: string, payload: Record<string, any>): Promise<{ ok: boolean; detail: string }> {
  const auto = AUTOMATIONS.find(a => a.name === name);
  if (!auto) return { ok: false, detail: `Unknown automation: ${name}` };
  if (!BASE) {
    // When n8n base is not set, simulate successful hospital bus dispatch for UI demo
    return { ok: true, detail: `Simulated local hospital event bus dispatched: ${name}` };
  }
  try {
    const res = await fetch(BASE + auto.path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, source: 'astra-copilot', at: new Date().toISOString() }),
    });
    return { ok: res.ok, detail: res.ok ? `Automation "${name}" fired successfully` : `n8n returned ${res.status}` };
  } catch (e: any) {
    return { ok: false, detail: 'n8n unreachable: ' + (e?.message ?? '') };
  }
}
