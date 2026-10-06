$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$sourceDir = Join-Path $root 'public/assets'
$sourceLogoDir = Join-Path $sourceDir 'aviario-inteligente-pro-logo'
$sourceLogo = Join-Path $sourceLogoDir 'aviario-inteligente-pro-logo.png'
$canonicalLogo = Join-Path $sourceDir 'aviario-inteligente-pro-logo.png'

if (-not (Test-Path $sourceLogo)) {
  throw "Official logo source not found at $sourceLogo"
}

Copy-Item $sourceLogo $canonicalLogo -Force
if (Test-Path $sourceLogoDir) {
  Remove-Item $sourceLogoDir -Recurse -Force
}

$pythonCode = @'
from PIL import Image
import os
root = r"$root\public\assets"
source = os.path.join(root, "aviario-inteligente-pro-logo.png")
if not os.path.exists(source):
    raise SystemExit("missing source logo")
base = Image.open(source).convert("RGBA")
items = [
    ("icon-192.png", 192),
    ("icon-512.png", 512),
    ("apple-touch-icon.png", 180),
    ("favicon.png", 48),
]
for name, size in items:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    img = base.copy()
    scale = min(size / img.width, size / img.height)
    new_w = max(1, int(img.width * scale))
    new_h = max(1, int(img.height * scale))
    img = img.resize((new_w, new_h), Image.LANCZOS)
    x = (size - new_w) // 2
    y = (size - new_h) // 2
    canvas.paste(img, (x, y), img if img.mode == "RGBA" else None)
    canvas.save(os.path.join(root, name))
print("icons generated")
'@

$expanded = $pythonCode.Replace('$root', $root)
$pythonTemp = Join-Path $sourceDir 'logo_generate_temp.py'
Set-Content -Path $pythonTemp -Value $expanded -Encoding UTF8
py $pythonTemp
Remove-Item $pythonTemp -Force

Write-Host "Official logo and app icons were regenerated from the single source asset."
