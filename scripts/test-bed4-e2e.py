#!/usr/bin/env python3
"""Bed-4 E2E workflow test: doctor order -> billing -> payment -> department -> result -> review."""
import json, urllib.request, pathlib

BASE = "http://127.0.0.1:3000"
H = {"Content-Type": "application/json"}

def api(method, path, body=None, token="doctor-token"):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())

# 1. Doctor creates CBP order for Bed 5
o = api("POST", "/api/workorders", {
    "patientId": "UHID-2026-8805", "patientName": "Priya Bedak",
    "bed": "Bed 5", "ward": "General Ward", "department": "Lab",
    "serviceCode": "CBP", "serviceName": "Complete Blood Picture (CBP)"
})
oid = o["id"]
print(f"1. DOCTOR  -> {oid} status={o['status']} billingAsg={o.get('assignedName')}")

# 2. Billing sets amount (no discount)
b = api("POST", f"/api/workorders/{oid}/bill", {"amount": 300, "discount": 0}, token="billing-token")
print(f"2. BILLING -> status={b['status']} amount={b['amount']} billId={b['billId']}")

# 3. Reception records payment
p = api("POST", f"/api/workorders/{oid}/pay", {"reference": "UPI-8805"}, token="reception-token")
print(f"3. PAYMENT -> status={p['status']} paidAt={p['paidAt']}")

# 4. Lab tech acknowledges
a = api("POST", f"/api/workorders/{oid}/ack", {}, token="doctor-token")
print(f"4. ACK     -> status={a['status']} ackAt={a['acknowledgedAt']}")

# 5. Lab tech starts work
s = api("POST", f"/api/workorders/{oid}/start", {}, token="doctor-token")
print(f"5. START   -> status={s['status']} startedAt={s['startedAt']}")

# 6. Lab completes with result
c = api("POST", f"/api/workorders/{oid}/complete", {"resultSummary": "CBP: Hb 11.2 g/dL, TLC 9800, Plt 2.4L — within normal limits"}, token="doctor-token")
print(f"6. COMPLETE-> status={c['status']} result={c['resultSummary']}")

# 7. Doctor reviews -> CLOSED
r = api("POST", f"/api/workorders/{oid}/review", {"notes": "Results reviewed, patient stable"}, token="doctor-token")
print(f"7. REVIEW  -> status={r['status']} reviewedBy={r['reviewedBy']}")

# Full event trail
final = api("GET", f"/api/workorders/{oid}")
print(f"\n=== FULL STATE TRAIL ({len(final['events'])} events) ===")
for e in final["events"]:
    print(f"  {e['at'][11:19]} {e['from']:>14} -> {e['to']:<14} | {e['actor']} ({e['role']})")

# Dashboard
dash = api("GET", "/api/workorders/dashboard")
print(f"\nDASHBOARD: {dash['totalStaff']} staff, {dash['totalOrders']} orders, {dash['activeOrders']} active")
