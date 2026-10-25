$ErrorActionPreference = "Continue"
$c = Get-NetTCPConnection -LocalPort 54329 -State Listen -ErrorAction SilentlyContinue
if ($c) {
  Write-Output ("PG 54329 UP pid=" + (($c | Select-Object -ExpandProperty OwningProcess -Unique) -join ","))
} else {
  Write-Output "PG 54329 DOWN"
}
# leftover lock files
$lockDir = "C:\Users\mural\.paperclip\instances\default\db"
if (Test-Path $lockDir) {
  Get-ChildItem $lockDir -Filter "postmaster.pid" -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Output ("LOCK " + $_.FullName + " " + $_.Length + "B " + $_.LastWriteTime)
    Get-Content $_.FullName -ErrorAction SilentlyContinue | Select-Object -First 8
  }
}
