<#
.SYNOPSIS
  Astra LAN access helper - run from an ELEVATED PowerShell (as Administrator).

.DESCRIPTION
  Makes the Astra UI reachable from staff laptops on the same Wi-Fi/LAN:
    1. Sets the Wi-Fi network profile to Private.
    2. Adds inbound firewall rules for the Astra UI ports 5173 (HTTP) and
       5443 (HTTPS) - Private/Domain profiles, LocalSubnet only.

  Port 3000 (Astra API) is intentionally NOT opened. Staff laptops reach the
  API through the Vite proxy, so only the UI ports must be reachable.

  Idempotent: existing rules are detected and skipped.
  Preview without changes:  .\lan-firewall.ps1 -WhatIf

.EXAMPLE
  PowerShell (as Administrator)> .\scripts\lan-firewall.ps1
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param()

$ErrorActionPreference = "Stop"

# Astra UI HTTP / HTTPS. NEVER add port 3000 to this list.
$UI_PORTS = @(5173, 5443)
$RULE_PREFIX = "Astra Vite"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin -and -not $WhatIfPreference) {
  Write-Error "Run this script in an elevated PowerShell (as Administrator), or preview with -WhatIf."
  exit 1
}

Write-Host "=== Astra LAN access setup ===" -ForegroundColor Cyan
Write-Host "Plan:"
Write-Host "  1. Set network profile of interface 'Wi-Fi' to Private."
foreach ($port in $UI_PORTS) {
  Write-Host "  2. Inbound TCP rule '$RULE_PREFIX $port (LAN)' for port $port (Private,Domain / LocalSubnet)."
}
Write-Host "  NOT touched: port 3000 (Astra API stays loopback/proxy-only)." -ForegroundColor Yellow
Write-Host ""

# --- 1. Network profile -> Private -----------------------------------------
$netProfile = Get-NetConnectionProfile -InterfaceAlias "Wi-Fi" -ErrorAction SilentlyContinue
if ($null -eq $netProfile) {
  Write-Warning "No connection profile found for interface 'Wi-Fi'. Check the interface name (Get-NetConnectionProfile) and set the profile manually."
} elseif ($netProfile.NetworkCategory -eq "Private") {
  Write-Host "Wi-Fi profile already Private - skipping."
} else {
  if ($PSCmdlet.ShouldProcess("Interface 'Wi-Fi'", "Set-NetConnectionProfile -NetworkCategory Private")) {
    Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private
    Write-Host "Wi-Fi network profile set to Private." -ForegroundColor Green
  }
}

# --- 2. Firewall rules for the UI ports -------------------------------------
foreach ($port in $UI_PORTS) {
  $name = "$RULE_PREFIX $port (LAN)"
  $existing = Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue
  if ($null -ne $existing) {
    Write-Host "Rule '$name' already exists - skipping."
    continue
  }
  if ($PSCmdlet.ShouldProcess("Port $port", "New-NetFirewallRule '$name'")) {
    $ruleParams = @{
      DisplayName   = $name
      Direction     = "Inbound"
      Protocol      = "TCP"
      LocalPort     = $port
      Action        = "Allow"
      Profile       = "Private,Domain"
      RemoteAddress = "LocalSubnet"
    }
    New-NetFirewallRule @ruleParams | Out-Null
    Write-Host "Created inbound rule '$name' (TCP $port, Private/Domain, LocalSubnet)." -ForegroundColor Green
  }
}

Write-Host ""
Write-Host "Done. Staff laptops can now open:" -ForegroundColor Cyan
Write-Host "  http://<this-PC-LAN-IP>:5173   (UI, HTTP)"
Write-Host "  https://<this-PC-LAN-IP>:5443  (UI, HTTPS - needed for camera/mic)"
