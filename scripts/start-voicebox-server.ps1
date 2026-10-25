$ErrorActionPreference = 'Stop'
$voiceboxExecutable = Join-Path $env:LOCALAPPDATA 'voicebox\voicebox-server.exe'
if (-not (Test-Path -LiteralPath $voiceboxExecutable)) { throw 'Voicebox server is not installed.' }
& $voiceboxExecutable --host 127.0.0.1 --port 17493
