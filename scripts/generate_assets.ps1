# generate_assets.ps1 — Generates all required logo assets and NSIS bitmaps from favicon.png
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$projectRoot = Resolve-Path "$PSScriptRoot\.."
$sourceFile = Join-Path $projectRoot "favicon.png"

if (!(Test-Path $sourceFile)) {
    Write-Error "Source logo file not found: $sourceFile"
    exit 1
}

$assetsDir = Join-Path $projectRoot "assets"
$assetsLogoDir = Join-Path $assetsDir "logo"
$buildDir = Join-Path $projectRoot "build"
$srcDir = Join-Path $projectRoot "src"

foreach ($dir in @($assetsDir, $assetsLogoDir, $buildDir, $srcDir)) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
}

# 1. Copy source favicon.png to assets/logo/favicon.png
Copy-Item $sourceFile (Join-Path $assetsLogoDir "favicon.png") -Force
Write-Host "Copied source logo to assets/logo/favicon.png"

# Load source image
$srcImg = [System.Drawing.Bitmap]::FromFile($sourceFile)
$srcW = $srcImg.Width
$srcH = $srcImg.Height
Write-Host "Loaded source image ($srcW x $srcH)"

# Helper function to resize image with high quality
function Resize-Image($img, $w, $h) {
    $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($img, 0, 0, $w, $h)
    $g.Dispose()
    return $bmp
}

# 2. Generate resized PNGs
$sizes = @(16, 24, 32, 48, 64, 128, 256, 512)
foreach ($s in $sizes) {
    $resized = Resize-Image $srcImg $s $s
    $outPath = Join-Path $assetsLogoDir "icon_$s.png"
    $resized.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $resized.Dispose()
}

# Standard icon.png and web favicon
$icon256 = Resize-Image $srcImg 256 256
$icon256.Save((Join-Path $assetsDir "icon.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$icon256.Save((Join-Path $assetsDir "logo.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$icon256.Save((Join-Path $srcDir "favicon.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$icon256.Dispose()

$icon64 = Resize-Image $srcImg 64 64
$icon64.Save((Join-Path $srcDir "logo.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$icon64.Dispose()
Write-Host "Generated resized PNGs in assets/logo/ and src/"

# 3. Generate NSIS installerSidebar.bmp (164 x 314, 24-bit RGB BMP)
$sideW = 164
$sideH = 314
$sideBmp = New-Object System.Drawing.Bitmap($sideW, $sideH, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$gSide = [System.Drawing.Graphics]::FromImage($sideBmp)
$gSide.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gSide.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$gSide.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

# Modern dark gradient/fill matching IDeV branding
$bgRect = New-Object System.Drawing.Rectangle(0, 0, $sideW, $sideH)
$bgColor = [System.Drawing.Color]::FromArgb(24, 25, 34)
$gSide.FillRectangle((New-Object System.Drawing.SolidBrush($bgColor)), $bgRect)

# Draw Logo (104x104) centered at top
$logoSize = 104
$logoX = [int](($sideW - $logoSize) / 2)
$logoY = 38
$logoScaled = Resize-Image $srcImg $logoSize $logoSize
$gSide.DrawImage($logoScaled, $logoX, $logoY, $logoSize, $logoSize)
$logoScaled.Dispose()

# Text: "IDeV Advanced"
$titleFont = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
$titleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$stringFormat = New-Object System.Drawing.StringFormat
$stringFormat.Alignment = [System.Drawing.StringAlignment]::Center

$titleRect = New-Object System.Drawing.RectangleF(0, 160, $sideW, 28)
$gSide.DrawString("IDeV Advanced", $titleFont, $titleBrush, $titleRect, $stringFormat)

# Subtitle: "Local AI Platform"
$subFont = New-Object System.Drawing.Font("Segoe UI", 8.5, [System.Drawing.FontStyle]::Regular)
$subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(150, 155, 168))
$subRect = New-Object System.Drawing.RectangleF(0, 188, $sideW, 20)
$gSide.DrawString("Local AI Platform", $subFont, $subBrush, $subRect, $stringFormat)

# Attribution at bottom
$attrFont = New-Object System.Drawing.Font("Segoe UI", 7.5, [System.Drawing.FontStyle]::Regular)
$attrBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(100, 105, 118))
$attrRect = New-Object System.Drawing.RectangleF(0, 286, $sideW, 18)
$gSide.DrawString("by IDeV", $attrFont, $attrBrush, $attrRect, $stringFormat)

$gSide.Dispose()

# Save installerSidebar.bmp and uninstallerSidebar.bmp
$sideBmp.Save((Join-Path $assetsDir "installerSidebar.bmp"), [System.Drawing.Imaging.ImageFormat]::Bmp)
$sideBmp.Save((Join-Path $buildDir "installerSidebar.bmp"), [System.Drawing.Imaging.ImageFormat]::Bmp)
$sideBmp.Save((Join-Path $assetsDir "uninstallerSidebar.bmp"), [System.Drawing.Imaging.ImageFormat]::Bmp)
$sideBmp.Save((Join-Path $buildDir "uninstallerSidebar.bmp"), [System.Drawing.Imaging.ImageFormat]::Bmp)
$sideBmp.Dispose()
Write-Host "Generated NSIS installerSidebar.bmp and uninstallerSidebar.bmp (164x314 24bpp)"

# 4. Generate NSIS installerHeader.bmp (150 x 57, 24-bit RGB BMP)
$hdrW = 150
$hdrH = 57
$hdrBmp = New-Object System.Drawing.Bitmap($hdrW, $hdrH, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$gHdr = [System.Drawing.Graphics]::FromImage($hdrBmp)
$gHdr.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gHdr.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

# Pure white background matching NSIS header
$gHdr.Clear([System.Drawing.Color]::White)

# Draw Logo on right side: 48x48 at x = 96, y = 4
$hdrLogoSize = 48
$hdrLogoX = $hdrW - $hdrLogoSize - 6
$hdrLogoY = [int](($hdrH - $hdrLogoSize) / 2)
$hdrLogoScaled = Resize-Image $srcImg $hdrLogoSize $hdrLogoSize
$gHdr.DrawImage($hdrLogoScaled, $hdrLogoX, $hdrLogoY, $hdrLogoSize, $hdrLogoSize)
$hdrLogoScaled.Dispose()

$gHdr.Dispose()

$hdrBmp.Save((Join-Path $assetsDir "installerHeader.bmp"), [System.Drawing.Imaging.ImageFormat]::Bmp)
$hdrBmp.Save((Join-Path $buildDir "installerHeader.bmp"), [System.Drawing.Imaging.ImageFormat]::Bmp)
$hdrBmp.Dispose()
Write-Host "Generated NSIS installerHeader.bmp (150x57 24bpp)"

$srcImg.Dispose()
Write-Host "PowerShell asset generation completed successfully!"
