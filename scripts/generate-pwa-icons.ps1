# Rebuild app icons from the owner's original logo on Windows.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = Split-Path -Parent $PSScriptRoot
$source = [System.Drawing.Image]::FromFile((Join-Path $projectRoot 'public/images/vk-group/logo.jpg'))
$outputDirectory = Join-Path $projectRoot 'public/icons'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
try {
    foreach ($spec in @(
        @{ Name = 'icon-192.png'; Size = 192; Scale = 1.0 },
        @{ Name = 'icon-512.png'; Size = 512; Scale = 1.0 },
        @{ Name = 'maskable-512.png'; Size = 512; Scale = 0.55 },
        @{ Name = 'apple-touch-icon.png'; Size = 180; Scale = 1.0 }
    )) {
        $bitmap = New-Object System.Drawing.Bitmap $spec.Size, $spec.Size
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.Clear([System.Drawing.ColorTranslator]::FromHtml('#d2ad7b'))
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $width = [int]($spec.Size * $spec.Scale)
            $height = [int]($width * $source.Height / $source.Width)
            $rect = New-Object System.Drawing.Rectangle ([int](($spec.Size - $width) / 2)), ([int](($spec.Size - $height) / 2)), $width, $height
            $graphics.DrawImage($source, $rect)
            $bitmap.Save((Join-Path $outputDirectory $spec.Name), [System.Drawing.Imaging.ImageFormat]::Png)
        } finally {
            $graphics.Dispose()
            $bitmap.Dispose()
        }
    }
} finally {
    $source.Dispose()
}
