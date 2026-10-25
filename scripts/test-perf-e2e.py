#!/usr/bin/env python3
"""Verify staff performance metrics update when orders execute."""
import json, urllib.request

BASE = "http://127.0.0.1:3000"
def api(method, path, body=None, token="doctor-token"):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())

before = api("GET", "/api/workorders/performance")
suresh_before = [s for s in before["staff"] if s["name"] == "Suresh Tech"][0]
print(f"BEFORE: Suresh assigned={suresh_before['assigned']} completed={suresh_before['completed']}")

# 1. Doctor creates CBP order
o = api("POST", "/api/workorders", {"patientId": "PERF-001", "patientName": "Perf Test", "bed": "Bed 6", "ward": "General Ward", "department": "Lab", "serviceCode": "CBP", "serviceName": "CBP"})
oid = o["id"]
print(f"1. Order {oid} created -> billing auto-assigned: {o.get('assignedName')}")

# 2. Bill Rs.300
api("POST", f"/api/workorders/{oid}/bill", {"amount": 300, "discount": 0}, token="billing-token")
# 3. Pay
api("POST", f"/api/workorders/{oid}/pay", {"reference": "PERF-UPI"}, token="reception-token")
# 4-6. Ack, start, complete (performed by lab tech — logged in as lab role)
api("POST", f"/api/workorders/{oid}/ack", {}, token="lab-token")
api("POST", f"/api/workorders/{oid}/start", {}, token="lab-token")
c = api("POST", f"/api/workorders/{oid}/complete", {"resultSummary": "CBP normal"}, token="lab-token")
print(f"7. Order complete -> status: {c['status']}")

after = api("GET", "/api/workorders/performance")
suresh_after = [s for s in after["staff"] if s["name"] == "Suresh Tech"][0]
print(f"AFTER:  Suresh assigned={suresh_after['assigned']} completed={suresh_after['completed']} active={suresh_after['active']}")

if suresh_after['completed'] >= suresh_before['completed'] + 1:
    print("✅ PASS: Performance metrics updated — Suresh completed task recorded")
else:
    print("❌ FAIL: Performance metrics did not update")

print("\nFull roster:")
for shift, members in after["roster"].items():
    for m in members:
        print(f"  [{shift}] {m['name']} ({m['designation']}, {m['department']}) assigned={m['assigned']} done={m['completed']}")