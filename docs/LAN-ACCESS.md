# Astra LAN access — staff laptops

Staff on the same Wi-Fi/LAN open the Astra UI in their browser. The UI talks to
the API through Vite's same-origin `/api` proxy, so **only port 5173 (and 5443
for HTTPS) must be reachable**. The Astra API port 3000 is never opened to the
LAN.

## 1. HTTP (normal) — port 5173

The main dev server (`npm run dev`) binds all interfaces on port 5173.

- This PC: `http://localhost:5173`
- Staff laptops: `http://<PC-LAN-IP>:5173` (e.g. `http://192.168.1.46:5173/#/reception`)

Department deep links: `/reception`, `/finance` (billing), `/pharmacy`,
`/ward`, `/ot`, `/lab`, `/radiology`, `/doctor`.
Doctor / CEO / admin can copy links + QR codes from **Settings → Staff Access
(LAN)**.

## 2. HTTPS (optional) — port 5443

Camera and microphone (voice, gesture control) require a **secure context**.
`http://<LAN-IP>:5173` does not count on other laptops, so run the HTTPS
dev server when staff need voice/gestures:

```
npm run dev:https
```

- Serves the same app over TLS on `https://<PC-LAN-IP>:5443` (strict port).
- The normal `npm run dev` on 5173 stays unchanged and should keep running.
- By default it uses a self-signed certificate (`@vitejs/plugin-basic-ssl`);
  browsers will show a one-time warning — accept it to proceed.

### mkcert certificates (no browser warning)

If [mkcert](https://github.com/FiloSottile/mkcert) is installed, generate a
local CA + certificate **outside the repo** and point the dev server at them
via environment variables (no `.env` edits):

```powershell
mkcert -install
mkdir C:\Users\mural\astra-certs
mkcert -cert-file C:\Users\mural\astra-certs\astra.pem `
       -key-file  C:\Users\mural\astra-certs\astra-key.pem `
       localhost 127.0.0.1 ::1 192.168.1.46

$env:ASTRA_HTTPS_CERT = "C:\Users\mural\astra-certs\astra.pem"
$env:ASTRA_HTTPS_KEY  = "C:\Users\mural\astra-certs\astra-key.pem"
npm run dev:https
```

When both env vars point at existing files, `vite.config.ts` uses them instead
of the self-signed certificate and browsers trust the page (after
`mkcert -install`).

## 3. Firewall (this PC, once)

Run in an **elevated** PowerShell (preview with `-WhatIf`, no changes made):

```powershell
.\scripts\lan-firewall.ps1 -WhatIf   # preview
.\scripts\lan-firewall.ps1           # as Administrator
```

The script:

1. Sets the Wi-Fi network profile to **Private**.
2. Adds inbound rules `Astra Vite 5173 (LAN)` and `Astra Vite 5443 (LAN)`
   (TCP, Private/Domain, LocalSubnet only).
3. **Never opens port 3000.**

It is idempotent — existing rules are skipped.

## 4. Security notes

- Sign-ins go through the server vault (`POST /api/auth/vault-login`):
  scrypt hashes only, 5 wrong PINs → 5-minute lockout per account+IP,
  seeded starter PINs force a 6+ digit PIN change on first login.
- CORS allows browser origins only on the Astra UI ports (5173/5443) from
  loopback or private-LAN addresses. Non-browser callers (scripts, n8n,
  agents on this PC) are unaffected.
- Keep patient data local: the LAN here is the hospital's own network.
  Do not expose these ports to the internet or guest Wi-Fi.
