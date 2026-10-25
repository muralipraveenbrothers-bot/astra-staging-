import { describe, expect, it, vi } from "vitest";
import { confirmDiagnosisByDoctor, confirmTickedInvestigations, type PlannerItemLike } from "./clinicalConfirm";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Fake local server: approval gate + order centre. Records every call. */
function fakeServer(options: { approve?: boolean } = {}) {
  const calls: Array<{ url: string; body: any }> = [];
  let orderSeq = 0;
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    if (url === "/api/clinical/approval/suggestion") return json(201, { ok: true, suggestion: { suggestionId: body.suggestionId } });
    if (url === "/api/clinical/approval/decision") {
      if (options.approve === false) return json(403, { ok: false, error: "FORBIDDEN" });
      return json(200, { ok: true, decision: { decisionId: `dec-${body.suggestionId}`, suggestionId: body.suggestionId, status: "APPROVED" } });
    }
    if (url === "/api/command/execute") {
      orderSeq += 1;
      return json(200, { success: true, data: { id: `ORD-${orderSeq}` } });
    }
    return json(404, { error: "NOT_FOUND" });
  });
  return { fetcher, calls };
}

const SURYA_PLAN: PlannerItemLike[] = [
  { id: "cbc-diff", name: "CBC with differential", orderCategory: "laboratory", group: "Urgent" },
  { id: "crp", name: "CRP", orderCategory: "laboratory", group: "Confirmatory" },
  { id: "venous-doppler", name: "Venous Doppler", orderCategory: "radiology", group: "Confirmatory" },
  { id: "surgical-review", name: "Urgent surgical review", orderCategory: "clinical", group: "Urgent" },
];

describe("R5-03 tick-box investigation ordering", () => {
  it("Surya: ticking CBC + Doppler creates exactly one lab and one radiology order, each with its own approval; CRP is not ordered", async () => {
    const { fetcher, calls } = fakeServer();
    const publish = vi.fn(async () => undefined);
    const result = await confirmTickedInvestigations({
      plan: SURYA_PLAN,
      tickedIds: ["cbc-diff", "venous-doppler"],
      patientUhid: "UHID-SURYA",
      fetcher,
      publish,
      now: () => 1,
    });

    expect(result.ok).toBe(true);
    expect(result.dispatched.map((d) => d.category)).toEqual(["laboratory", "radiology"]);
    const orders = calls.filter((c) => c.url === "/api/command/execute");
    expect(orders).toHaveLength(2);
    expect(orders.map((o) => o.body.query)).toEqual([
      "Order CBC with differential for UHID-SURYA",
      "Order radiology Venous Doppler for UHID-SURYA",
    ]);
    expect(orders.every((o) => o.body.isAiGenerated === true && typeof o.body.approvalDecisionId === "string")).toBe(true);
    expect(new Set(orders.map((o) => o.body.approvalDecisionId)).size).toBe(2);

    const suggestions = calls.filter((c) => c.url === "/api/clinical/approval/suggestion");
    expect(suggestions).toHaveLength(2);
    expect(suggestions.every((s) => s.body.kind === "investigation" && s.body.patientId === "UHID-SURYA")).toBe(true);
    expect(calls.some((c) => JSON.stringify(c.body ?? {}).includes('"CRP"'))).toBe(false);
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls.map((args: any[]) => args[0].event)).toEqual(["INVESTIGATION_ORDER_CREATED", "INVESTIGATION_ORDER_CREATED"]);
  });

  it("orders nothing when nothing is ticked (all suggestions start unchecked)", async () => {
    const { fetcher } = fakeServer();
    const result = await confirmTickedInvestigations({ plan: SURYA_PLAN, tickedIds: [], patientUhid: "UHID-SURYA", fetcher });
    expect(result.ok).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not order when the doctor approval is refused", async () => {
    const { fetcher, calls } = fakeServer({ approve: false });
    const result = await confirmTickedInvestigations({ plan: SURYA_PLAN, tickedIds: ["cbc-diff"], patientUhid: "UHID-SURYA", fetcher });
    expect(result.ok).toBe(false);
    expect(calls.some((c) => c.url === "/api/command/execute")).toBe(false);
  });

  it("skips clinical-review items (they are not orders) and needs a patient", async () => {
    const { fetcher, calls } = fakeServer();
    const skipped = await confirmTickedInvestigations({ plan: SURYA_PLAN, tickedIds: ["surgical-review"], patientUhid: "UHID-SURYA", fetcher });
    expect(skipped.ok).toBe(true);
    expect(skipped.skipped).toEqual(["Urgent surgical review"]);
    expect(calls).toHaveLength(0);
    const noPatient = await confirmTickedInvestigations({ plan: SURYA_PLAN, tickedIds: ["cbc-diff"], patientUhid: "", fetcher });
    expect(noPatient.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("R5-03 final diagnosis only by doctor action", () => {
  it("refuses without an explicit doctor click or from a non-doctor role, with no network call", async () => {
    const { fetcher } = fakeServer();
    const noClick = await confirmDiagnosisByDoctor({ patientUhid: "UHID-SURYA", diagnosis: "Cellulitis", actorRole: "doctor", doctorClicked: false, fetcher });
    const nurse = await confirmDiagnosisByDoctor({ patientUhid: "UHID-SURYA", diagnosis: "Cellulitis", actorRole: "nurse", doctorClicked: true, fetcher });
    const noRole = await confirmDiagnosisByDoctor({ patientUhid: "UHID-SURYA", diagnosis: "Cellulitis", actorRole: undefined, doctorClicked: true, fetcher });
    expect(noClick.ok).toBe(false);
    expect(nurse.ok).toBe(false);
    expect(noRole.ok).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("records a doctor-confirmed diagnosis through the approval gate kind 'diagnosis'", async () => {
    const { fetcher, calls } = fakeServer();
    const result = await confirmDiagnosisByDoctor({ patientUhid: "UHID-SURYA", diagnosis: "Cellulitis", actorRole: "doctor", doctorClicked: true, fetcher, now: () => 7 });
    expect(result.ok).toBe(true);
    expect(calls[0]).toMatchObject({ url: "/api/clinical/approval/suggestion", body: { kind: "diagnosis", patientId: "UHID-SURYA", payload: { diagnosis: "Cellulitis" } } });
    expect(calls[1]).toMatchObject({ url: "/api/clinical/approval/decision", body: { decision: "APPROVE_CASE_ONLY" } });
    expect(calls.some((c) => c.url === "/api/command/execute")).toBe(false);
  });
});
