$ErrorActionPreference = "Continue"
$paths = @(
  "D:\astra PM\Audio2Face-3D",
  "D:\astra PM\OpenAvatarChat",
  "D:\astra PM\start-audio2face.cmd",
  "D:\astra PM\server\avatar\a2f_controller.py",
  "D:\astra PM\server\avatar\ue5_meta_human_streamer.py",
  "D:\astra PM\server\avatar\central_avatar_broadcast.py"
)
foreach ($p in $paths) {
  if (Test-Path $p) {
    Write-Output "removing $p"
    Remove-Item -LiteralPath $p -Recurse -Force -ErrorAction SilentlyContinue
  } else {
    Write-Output "missing $p"
  }
}
Write-Output "delete pass done"
