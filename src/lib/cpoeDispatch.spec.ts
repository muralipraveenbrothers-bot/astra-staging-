import { describe, expect, it, vi } from "vitest";
import { dispatchCpoeOrder, draftOrderQuery, investigationOrderQuery } from "./cpoeDispatch";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("CPOE order dispatch (honest success/failure)", () => {
  it("reports success only when the server returns ok with a real order id", async () => {
    const fetcher = vi.fn(async () => json(200, { success: true, data: { id: "ORD-123" }, message: "created" }));
    const r = await dispatchCpoeOrder("Order CBC for UHID-2026-0001", "UHID-2026-0001", fetcher as any);
    expect(r).toEqual({ ok: true, orderId: "ORD-123", message: "created" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/command/execute");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({ query: "Order CBC for UHID-2026-0001", confirmed: true, contextPatientId: "UHID-2026-0001" });
  });

  it("fails (keeps draft) on server rejection, success:false, missing id or network error", async () => {
    const unauth = await dispatchCpoeOrder("Order CBC for X", undefined, (async () => json(401, { error: "UNAUTHORIZED" })) as any);
    expect(unauth.ok).toBe(false);
    const denied = await dispatchCpoeOrder("Order CBC for X", undefined, (async () => json(200, { success: false, message: "Access Denied" })) as any);
    expect(denied).toEqual({ ok: false, error: "Access Denied" });
    const noId = await dispatchCpoeOrder("Order CBC for X", undefined, (async () => json(200, { success: true, data: {} })) as any);
    expect(noId).toEqual({ ok: false, error: "Server did not return an order ID." });
    const offline = await dispatchCpoeOrder("Order CBC for X", undefined, (async () => { throw new Error("fetch failed"); }) as any);
    expect(offline).toEqual({ ok: false, error: "fetch failed" });
  });

  it("builds the draft query from the draft items and UHID, and refuses incomplete drafts", () => {
    expect(draftOrderQuery({ items: ["CBC", "CRP"], patientUhid: "UHID-1", patientName: "Rajesh" })).toEqual({ query: "Order CBC + CRP for UHID-1", contextPatientId: "UHID-1" });
    expect(draftOrderQuery({ itemSummary: "USG Abdomen", patientName: "Rajesh" })?.query).toBe("Order USG Abdomen for Rajesh");
    expect(draftOrderQuery({ itemSummary: "", patientUhid: "UHID-1" })).toBeNull();
    expect(draftOrderQuery({ itemSummary: "CBC" })).toBeNull();
  });

  it("links AI investigation dispatch to approval decisions and preserves tick-box selection", async () => {
    const fetcher = vi.fn(async () => json(200, { success: true, data: { id: `ORD-${fetcher.mock.calls.length + 1}` } }));
    const plan = [
      { name: "CBC with differential", orderCategory: "laboratory" as const, selected: true },
      { name: "CRP", orderCategory: "laboratory" as const, selected: false },
      { name: "Venous Doppler", orderCategory: "radiology" as const, selected: true },
    ];

    for (const item of plan.filter((p) => p.selected)) {
      const order = investigationOrderQuery(item, "UHID-SURYA");
      expect(order).not.toBeNull();
      await dispatchCpoeOrder(order!.query, order!.contextPatientId, fetcher as any, `dec-${item.name}`);
    }

    expect(fetcher).toHaveBeenCalledTimes(2);
    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>;
    const bodies = calls.map(([, init]) => JSON.parse(String(init.body)));
    expect(bodies.map((b) => b.query)).toEqual([
      "Order CBC with differential for UHID-SURYA",
      "Order radiology Venous Doppler for UHID-SURYA",
    ]);
    expect(bodies.every((b) => b.isAiGenerated === true && b.source === "scientist" && b.approvalDecisionId)).toBe(true);
  });
});
