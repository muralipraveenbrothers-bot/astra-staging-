# SHASTRA AI — DEPLOYMENT & OPERATION GUIDE

## 1. Prerequisites

- **Host OS**: Windows, Linux, or macOS
- **Node.js**: v18+ (Tested on v20.20.0)
- **Ollama**: Active on `127.0.0.1:11434` with `bge-m3:latest` pulled
- **Port**: 3000

## 2. Starting the Unified Server

```bash
# 1. Build frontend bundle (if modified)
npm run build

# 2. Launch Unified Hospital OS Server (Port 3000)
npx tsx server/index.ts
```

## 3. Dedicated Terminal URLs

| Workstation | Direct URL | Default Injected User |
|---|---|---|
| **Doctor Central Command** | `http://localhost:3000/#/doctor` | Dr. Ananya Rao |
| **Hospital Command Hub** | `http://localhost:3000/#/chat` | AI Operations Copilot |
| **Reception & Check-In** | `http://localhost:3000/#/reception` | Kavitha Sharma |
| **Pharmacy Workstation** | `http://localhost:3000/#/pharmacy` | M. Ramakrishna |
| **Clinical Laboratory** | `http://localhost:3000/#/lab` | S. Swathi |
| **Radiology / PACS** | `http://localhost:3000/#/radiology` | Dr. Nitin Deshmukh |
| **Ward & ICU Nursing** | `http://localhost:3000/#/ward` | Sister Mary |
| **OT Command Center** | `http://localhost:3000/#/ot` | Priya (OT Coordinator) |
| **Billing & Cashier** | `http://localhost:3000/#/billing` | Ramesh Gupta |
| **Executive Analytics (CEO)** | `http://localhost:3000/#/ceo` | Dr. K. S. Murthy (CEO) |
| **Plugin Center** | `http://localhost:3000/#/plugins` | System Sandbox |
| **Brain Diagnostics & Health** | `http://localhost:3000/#/health` | Subsystem Telemetry |

## 4. Running the Verification Suite

```bash
npx tsx server/test-suite.ts
```
