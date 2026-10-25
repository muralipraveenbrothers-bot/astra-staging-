# SHASTRA AI — SERVER-SIDE RBAC & SECURITY MATRIX

## 1. Role Terminals & Route Isolation

| Role | Permitted URL | Prohibited URLs | Central Command Access | Mutation Scope |
|---|---|---|---|---|
| **Doctor** | `*` (Full Hospital, CPOE, Settings, Departments) | None | **YES (Full)** | CPOE Orders, Prescriptions, Clinical Notes, Staff Vault |
| **Reception** | `/reception` | `/doctor`, `/lab`, `/pharmacy`, `/ot`, `/billing` | **NO** (Strict 403) | Registrations, Appointments, Token Printing |
| **Pharmacy** | `/pharmacy` | `/doctor`, `/lab`, `/ot`, `/hr` | **NO** (Strict 403) | Dispensing, Stock Intake, Returns |
| **Lab** | `/lab` | `/doctor`, `/pharmacy`, `/ot` | **NO** (Strict 403) | Sample Processing, Result Verification |
| **Radiology** | `/radiology` | `/doctor`, `/pharmacy`, `/lab` | **NO** (Strict 403) | PACS Worklist, Image Reporting |
| **Ward / Nurse** | `/ward` | `/doctor`, `/finance`, `/admin` | **NO** (Strict 403) | Bed Allocation, Nursing Tasks, Vitals |
| **OT** | `/ot` | `/pharmacy`, `/reception`, `/hr` | **NO** (Strict 403) | Surgery Schedule, Pre-Op Checklist |
| **HR** | `/hr` | `/doctor`, `/clinical`, `/pharmacy` | **NO** (Strict 403) | Staff Attendance, Shifts |
| **Billing** | `/billing` | `/doctor`, `/ot`, `/lab` | **NO** (Strict 403) | Bill Clearance, Invoicing, Receipts |
| **Insurance** | `/insurance` | `/doctor`, `/clinical` | **NO** (Strict 403) | PMJAY/ABDM Claims, Pre-Auth |
| **CEO** | `/ceo` | Restrictive clinical orders | **YES (Executive)** | Hospital-Wide Intelligence & Approvals |
| **Admin** | `*` | None | **YES (Full)** | System Configuration & User Management |

## 2. Enforcement Mechanism

1. **Server Middleware**: Every API request evaluates Bearer session token & Role.
2. **Audit Logging**: All unauthorized attempts immediately produce a cryptographic `ACCESS_DENIED` audit log.
3. **Zero Client Bypass**: Manual URL manipulation returns HTTP 403 Forbidden.
